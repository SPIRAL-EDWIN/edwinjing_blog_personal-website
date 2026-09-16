"""Generate bounded Archive cover previews without modifying note originals."""

import hashlib
import html
import io
import posixpath
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

from PIL import Image, ImageOps, UnidentifiedImageError
from mkdocs.utils import get_relative_url


ARCHIVE_PAGE = "HOME/Archive/index.md"
THUMBNAIL_DIR = "assets/archive-thumbnails"
ENCODER_KEY = b"archive-v1:640x480:webp78:method6:"
_files = ()


def on_files(files, config, **kwargs):
    """Retain output-to-source mappings; generated previews are output-only."""
    global _files
    _files = tuple(files)
    return files


def _local_source(src, page, config, files):
    parsed = urlsplit(src)
    site = urlsplit(config.get("site_url", ""))
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return None
    if parsed.netloc and parsed.netloc != site.netloc:
        return None
    if not parsed.path:
        return None
    output_path = unquote(urlsplit(urljoin("/" + page.url, src)).path).lstrip("/")
    prefix = unquote(site.path).strip("/")
    if prefix and output_path.startswith(prefix + "/"):
        output_path = output_path[len(prefix) + 1:]
    output_path = posixpath.normpath(output_path)
    if output_path == ".." or output_path.startswith("../"):
        return None
    root = Path(config["docs_dir"]).resolve()
    source = root / output_path
    for item in files:
        if getattr(item, "dest_uri", None) == output_path:
            source = Path(item.abs_src_path)
            break
    source = source.resolve()
    if not source.is_relative_to(root) or not source.is_file():
        return None
    return source


def _preview(source, config):
    if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return None
    try:
        original = source.read_bytes()
    except OSError:
        return None
    digest = hashlib.sha256(ENCODER_KEY + original).hexdigest()[:24]
    output_uri = f"{THUMBNAIL_DIR}/{digest}.webp"
    site_root = Path(config["site_dir"]).resolve()
    destination = (site_root / output_uri).resolve()
    if not destination.is_relative_to(site_root):
        return None
    try:
        with Image.open(io.BytesIO(original)) as image:
            # Keep authored animation rather than silently reducing it to a frame.
            if getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1:
                return None
            preview = ImageOps.exif_transpose(image)
            preview.thumbnail((640, 480), Image.Resampling.LANCZOS)
            preview = preview.convert("RGBA" if "A" in preview.getbands() or "transparency" in preview.info else "RGB")
            size = preview.size
            if not destination.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                preview.save(destination, "WEBP", quality=78, method=6)
        return output_uri, size
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        # A malformed or unsupported source must not break the Archive link.
        return None


class _ArchiveCovers(HTMLParser):
    def __init__(self, output, page, config, files):
        super().__init__(convert_charrefs=False)
        self.output, self.page, self.config, self.files = output, page, config, files
        self.offsets = [0] + [match.end() for match in re.finditer("\n", output)]
        self.edits = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag != "img" or "archive-card__image" not in (attributes.get("class") or "").split():
            return
        raw = self.get_starttag_text()
        updated = raw
        additions = []
        if "fetchpriority" not in attributes:
            additions.append('fetchpriority="low"')
        # Preserve explicit responsive author sources instead of mixing ratios.
        if "srcset" not in attributes and "sizes" not in attributes:
            source = _local_source(attributes.get("src") or "", self.page, self.config, self.files)
            preview = _preview(source, self.config) if source else None
            if preview:
                uri, dimensions = preview
                src = html.escape(get_relative_url(uri, self.page.url), quote=True)
                updated = re.sub(r"(\ssrc\s*=\s*)(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", lambda match: match[1] + '"' + src + '"', updated, count=1, flags=re.I)
                if "width" not in attributes and "height" not in attributes and "style" not in attributes:
                    additions.extend((f'width="{dimensions[0]}"', f'height="{dimensions[1]}"'))
        if additions:
            ending = re.search(r"\s*/?>$", updated)
            if ending:
                updated = updated[:ending.start()] + " " + " ".join(additions) + updated[ending.start():]
        if updated != raw:
            line, column = self.getpos()
            start = self.offsets[line - 1] + column
            self.edits.append((start, start + len(raw), updated))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def result(self):
        output = self.output
        for start, end, replacement in reversed(self.edits):
            output = output[:start] + replacement + output[end:]
        return output


def on_post_page(output, page, config, **kwargs):
    """Rewrite only Archive covers after markup and lightbox processing."""
    if getattr(page.file, "src_uri", "") != ARCHIVE_PAGE:
        return output
    parser = _ArchiveCovers(output, page, config, kwargs.get("files", _files))
    parser.feed(output)
    parser.close()
    return parser.result()
