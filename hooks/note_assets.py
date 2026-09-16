"""Reserve note-image geometry and defer off-screen downloads at build time.

Only image start tags are extended: note text, URLs, lightbox wrappers, and
explicit author attributes are left untouched. No imaging dependency is needed.
"""

import posixpath
import re
import struct
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit


@lru_cache(maxsize=512)
def _image_dimensions(path, modified_ns, size):
    """Read intrinsic PNG/GIF/JPEG sizes without decoding or changing images."""
    del modified_ns, size  # The cache key changes whenever the source changes.
    try:
        with Path(path).open("rb") as stream:
            header = stream.read(24)
            if header.startswith(b"\x89PNG\r\n\x1a\n") and header[12:16] == b"IHDR":
                dimensions = struct.unpack(">II", header[16:24])
            elif header[:6] in (b"GIF87a", b"GIF89a"):
                dimensions = struct.unpack("<HH", header[6:10])
            elif header[:2] == b"\xff\xd8":
                stream.seek(2)
                dimensions = _jpeg_dimensions(stream)
            else:
                return None
            if dimensions and all(0 < value <= 100000 for value in dimensions):
                return dimensions
    except (OSError, ValueError, struct.error):
        pass
    return None


def _jpeg_dimensions(stream):
    # SOF markers that carry frame geometry (not DHT, JPG, or DAC).
    frames = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
              0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while True:
        marker = stream.read(1)
        if not marker:
            return None
        if marker != b"\xff":
            continue
        while marker == b"\xff":
            marker = stream.read(1)
        if not marker or marker[0] in (0xD9, 0xDA):
            return None
        if marker[0] in (0x00, 0x01) or 0xD0 <= marker[0] <= 0xD8:
            continue
        length = struct.unpack(">H", stream.read(2))[0]
        if length < 2:
            return None
        if marker[0] in frames:
            _, height, width = struct.unpack(">BHH", stream.read(5))
            return width, height
        stream.seek(length - 2, 1)


def _local_image(src, page, config, files):
    parsed = urlsplit(src)
    site = urlsplit(config.get("site_url", ""))
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return None
    if parsed.netloc and parsed.netloc != site.netloc:
        return None
    if not parsed.path:
        return None
    # Images use output-page-relative URLs, not Markdown-source-relative URLs.
    output_path = unquote(urlsplit(urljoin("/" + page.url, src)).path).lstrip("/")
    site_prefix = unquote(site.path).strip("/")
    if site_prefix and output_path.startswith(site_prefix + "/"):
        output_path = output_path[len(site_prefix) + 1:]
    output_path = posixpath.normpath(output_path)
    if output_path == ".." or output_path.startswith("../"):
        return None
    docs_root = Path(config["docs_dir"]).resolve()
    path = docs_root / output_path
    # Files can map a source asset to a different output location.
    if not path.is_file() and files:
        for file in files:
            if getattr(file, "dest_uri", None) == output_path:
                source = getattr(file, "abs_src_path", None)
                if source:
                    path = Path(source)
                break
    resolved = path.resolve()
    if not resolved.is_relative_to(docs_root) or not resolved.is_file():
        return None
    return resolved


class _NoteImages(HTMLParser):
    def __init__(self, content, page, config, files):
        super().__init__(convert_charrefs=False)
        self.content = content
        self.page, self.config, self.files = page, config, files
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer("\n", content))
        self.insertions = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        attributes = dict(attrs)
        src = attributes.get("src") or ""
        classes = (attributes.get("class") or "").lower()
        if any(token in classes for token in ("avatar", "profile", "emoji", "icon")):
            return
        if "avatar" in unquote(urlsplit(src).path).lower():
            return
        additions = []
        if "loading" not in attributes:
            additions.append('loading="lazy"')
        if "decoding" not in attributes:
            additions.append('decoding="async"')
        # A one-sided explicit dimension or responsive source can imply a
        # different intended ratio; never add conflicting geometry.
        if not any(name in attributes for name in ("width", "height", "srcset", "style")):
            path = _local_image(src, self.page, self.config, self.files)
            if path:
                stat = path.stat()
                dimensions = _image_dimensions(str(path), stat.st_mtime_ns, stat.st_size)
                if dimensions:
                    additions.extend((f'width="{dimensions[0]}"', f'height="{dimensions[1]}"'))
        if additions:
            raw = self.get_starttag_text()
            suffix = re.search(r"\s*/?>$", raw)
            if suffix:
                line, column = self.getpos()
                offset = self.line_offsets[line - 1] + column + suffix.start()
                self.insertions.append((offset, " " + " ".join(additions)))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def result(self):
        content = self.content
        for offset, attributes in reversed(self.insertions):
            content = content[:offset] + attributes + content[offset:]
        return content


def on_page_content(html_content, page, config, files, **kwargs):
    """Optimize individual ENotes pages, including Material instant navigation."""
    src_uri = getattr(page.file, "src_uri", "")
    if not src_uri.startswith("OsdNotes/") or src_uri.rsplit("/", 1)[-1] == "index.md":
        return html_content
    parser = _NoteImages(html_content, page, config, files)
    parser.feed(html_content)
    parser.close()
    return parser.result()
