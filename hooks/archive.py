"""Build the public Archive page from content files and Git history.

The source Archive page contains a marker. During ``mkdocs build`` this hook
replaces that marker with a card grid, without rewriting or committing a
generated Markdown file.
"""

from __future__ import annotations

import fnmatch
import html
import logging
import posixpath
import re
import subprocess
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import quote, unquote, urlsplit


log = logging.getLogger("mkdocs.archive")

ARCHIVE_PAGE = "HOME/Archive/index.md"
ARCHIVE_MARKER = "<!-- ARCHIVE_AUTO -->"
DEFAULT_AUTHOR = "Chen Jing (经宸)"
DEFAULT_EXCLUDES = (
    "index.md",
    "HOME/**",
    "blog/index.md",
    "OsdNotes/index.md",
)
IMAGE_EXTENSIONS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}

MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(\s*(<[^>]+>|[^)\n]+)\)")
HTML_IMAGE_RE = re.compile(r"<img\b[^>]*?\bsrc\s*=\s*([\"'])(.*?)\1", re.I | re.S)
OBSIDIAN_IMAGE_RE = re.compile(r"!\[\[([^\]]+)\]\]")
FENCED_CODE_RE = re.compile(r"(^|\n)(?:```|~~~).*?(?:\n(?:```|~~~)(?=\n|$)|$)", re.S)
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.M)
OBSIDIAN_BLOCK_ID_RE = re.compile(r"(?<![#A-Za-z0-9_-])\^([A-Za-z0-9_-]{4,})[ \t]*$")
OBSIDIAN_QUOTED_BLOCK_ID_RE = re.compile(r"(?<![#A-Za-z0-9_-])\^([A-Za-z0-9_-]{4,})([ \t]*[\"'])$")
FENCE_START_RE = re.compile(r"^[ \t]*(?P<fence>`{3,}|~{3,})")
BLOCKQUOTE_LINE_RE = re.compile(r"^[ \t]{0,3}>")
OBSIDIAN_MARK_RE = re.compile(r"(?<![=<])==(?=\S)(?!>)(.+?)(?<=\S)==(?![=>])")
INLINE_PROTECTED_RE = re.compile(r"(`+[^`\n]*`+)")


@dataclass(frozen=True)
class ArchiveEntry:
    src_uri: str
    title: str
    author: str
    category: str
    published: date
    updated: date
    page_url: str
    image_url: Optional[str]
    emoji: str
    theme: str

    @property
    def activity_date(self) -> date:
        return max(self.published, self.updated)

    @property
    def is_updated(self) -> bool:
        return self.updated > self.published


def _plain_front_matter(text: str) -> Tuple[Dict[str, str], str]:
    """Read the simple scalar fields used by the Archive without extra deps."""
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        return {}, text

    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", text, re.S)
    if not match:
        return {}, text

    metadata: Dict[str, str] = {}
    for line in match.group(1).splitlines():
        if not line or line[0].isspace() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
            value = value[1:-1]
        metadata[key.strip().lower()] = value
    return metadata, text[match.end() :]


def _metadata_bool(value: Optional[str], default: bool = True) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", "null", "none"}


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    candidate = value.strip().strip("\"'")[:10]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        log.warning("Archive ignored invalid date %r; expected YYYY-MM-DD", value)
        return None


def _humanize_filename(stem: str) -> str:
    stem = stem.replace("_", " ").strip()
    stem = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    if stem and stem[0].isascii() and stem[0].islower():
        stem = stem[0].upper() + stem[1:]
    return stem


def _entry_title(metadata: Mapping[str, str], body: str, src_uri: str) -> str:
    if metadata.get("title"):
        return metadata["title"].strip()

    # Only trust an H1 near the beginning. Some lecture notes contain later H1s
    # that are section headings rather than the document title.
    opening = "\n".join(body.splitlines()[:12])
    match = H1_RE.search(opening)
    if match:
        return re.sub(r"\s+#+\s*$", "", match.group(1)).strip()
    return _humanize_filename(PurePosixPath(src_uri).stem)


def _category_details(src_uri: str, override: Optional[str] = None) -> Tuple[str, str, str]:
    if override:
        return override, "📝", "default"

    path = src_uri.casefold()
    if "embodied ai" in path or "/vla/" in path:
        return "Embodied AI", "🤖", "robotics"
    if "/chem/" in path:
        return "Chemistry", "⚗️", "science"
    if "/phil/" in path:
        return "Philosophy", "🏛️", "humanities"
    if "/cs101/" in path:
        return "Computer Science", "💻", "code"
    if "github" in path:
        return "GitHub Notes", "🛠️", "code"
    if src_uri.startswith("经验分享/"):
        return "Experiences", "✍️", "writing"
    if src_uri.startswith("AboutMe/"):
        return "About Me", "👤", "profile"
    if src_uri.startswith("OsdNotes/"):
        return "Study Notes", "📚", "study"
    return PurePosixPath(src_uri).parts[0], "📝", "default"


def _is_excluded(src_uri: str, patterns: Sequence[str]) -> bool:
    for pattern in patterns:
        normalized = pattern.strip().lstrip("/")
        if normalized.endswith("/**") and src_uri.startswith(normalized[:-3].rstrip("/") + "/"):
            return True
        if fnmatch.fnmatchcase(src_uri, normalized):
            return True
    return False


def _git_dates(repo_root: Path, abs_path: Path) -> Tuple[Optional[date], Optional[date]]:
    try:
        git_path = abs_path.relative_to(repo_root).as_posix()
    except ValueError:
        git_path = str(abs_path)

    def run(*args: str) -> List[str]:
        process = subprocess.run(
            ["git", *args, "--", git_path],
            cwd=str(repo_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
        if process.returncode != 0:
            return []
        return [line.strip() for line in process.stdout.splitlines() if line.strip()]

    latest_lines = run("log", "-1", "--format=%as")
    added_lines = run("log", "--follow", "--diff-filter=A", "--format=%as")
    latest = _parse_date(latest_lines[0]) if latest_lines else None
    first_added = _parse_date(added_lines[-1]) if added_lines else None
    return first_added, latest


def _strip_markdown_title(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("<") and raw.endswith(">"):
        return raw[1:-1].strip()
    # Markdown permits a quoted title after the URL. Keep spaces in ordinary
    # filenames, but remove a clearly quoted trailing title when present.
    return re.sub(r"\s+[\"'][^\"']*[\"']\s*$", "", raw).strip()


def _image_candidates(body: str, cover: Optional[str]) -> List[Tuple[int, str, bool]]:
    candidates: List[Tuple[int, str, bool]] = []
    if cover:
        candidates.append((-1, cover, False))

    searchable = FENCED_CODE_RE.sub("\n", body)
    for match in MARKDOWN_IMAGE_RE.finditer(searchable):
        candidates.append((match.start(), _strip_markdown_title(match.group(1)), False))
    for match in HTML_IMAGE_RE.finditer(searchable):
        candidates.append((match.start(), match.group(2).strip(), False))
    for match in OBSIDIAN_IMAGE_RE.finditer(searchable):
        target = match.group(1).split("|", 1)[0].strip()
        candidates.append((match.start(), target, True))
    return sorted(candidates, key=lambda candidate: candidate[0])


def _relative_url(target_url: str, page_url: str) -> str:
    if re.match(r"^(?:https?:)?//", target_url) or target_url.startswith("data:"):
        return target_url
    page_dir = page_url if page_url.endswith("/") else posixpath.dirname(page_url)
    relative = posixpath.relpath(target_url, page_dir or ".")
    if target_url.endswith("/") and not relative.endswith("/"):
        relative += "/"
    return quote(relative, safe="/%:#?=&+~")


def _resolve_image(
    body: str,
    cover: Optional[str],
    src_uri: str,
    page_url: str,
    file_urls: Mapping[str, str],
) -> Optional[str]:
    source_dir = PurePosixPath(src_uri).parent
    for _, raw_target, is_obsidian in _image_candidates(body, cover):
        target = html.unescape(raw_target).strip()
        if not target or target.startswith(("data:", "#")):
            continue
        if re.match(r"^(?:https?:)?//", target):
            return target

        clean_target = unquote(urlsplit(target).path).lstrip("/")
        if not clean_target:
            continue

        possible: List[str] = []
        if is_obsidian and "/" not in clean_target:
            possible.append((source_dir / "images" / clean_target).as_posix())
            possible.append((source_dir / clean_target).as_posix())
            possible.extend(
                key for key in file_urls if PurePosixPath(key).name == PurePosixPath(clean_target).name
            )
        else:
            possible.append(posixpath.normpath((source_dir / clean_target).as_posix()))

        for target_uri in possible:
            if PurePosixPath(target_uri).suffix.casefold() not in IMAGE_EXTENSIONS:
                continue
            target_url = file_urls.get(target_uri)
            if target_url:
                return _relative_url(target_url, page_url)
    return None


def _archive_options(config: Mapping[str, object]) -> Tuple[str, Tuple[str, ...]]:
    extra = config.get("extra") or {}
    archive = extra.get("archive") if isinstance(extra, Mapping) else {}
    archive = archive if isinstance(archive, Mapping) else {}
    author = str(archive.get("default_author", DEFAULT_AUTHOR))
    configured = archive.get("exclude", ())
    if isinstance(configured, str):
        configured = (configured,)
    excludes = tuple(DEFAULT_EXCLUDES) + tuple(str(item) for item in configured)
    return author, excludes


def _collect_entries(config, files: Iterable[object], page) -> List[ArchiveEntry]:
    docs_dir = Path(config["docs_dir"]).resolve()
    config_path = Path(getattr(config, "config_file_path", "mkdocs.yml")).resolve()
    repo_root = config_path.parent
    default_author, excludes = _archive_options(config)

    all_files = list(files)
    file_urls = {
        getattr(item, "src_uri", getattr(item, "src_path", "")): getattr(item, "url", "")
        for item in all_files
    }
    entries: List[ArchiveEntry] = []

    for item in all_files:
        src_uri = getattr(item, "src_uri", getattr(item, "src_path", ""))
        if not src_uri.endswith(".md") or src_uri == ARCHIVE_PAGE or _is_excluded(src_uri, excludes):
            continue

        abs_path_value = getattr(item, "abs_src_path", None)
        abs_path = Path(abs_path_value) if abs_path_value else docs_dir / src_uri
        if not abs_path.is_file():
            continue
        text = abs_path.read_text(encoding="utf-8")
        metadata, body = _plain_front_matter(text)
        if not _metadata_bool(metadata.get("archive")):
            continue

        first_added, latest = _git_dates(repo_root, abs_path)
        filesystem_date = datetime.fromtimestamp(abs_path.stat().st_mtime).date()
        published = _parse_date(metadata.get("date")) or first_added or latest or filesystem_date
        updated = _parse_date(metadata.get("updated")) or latest or published
        category, emoji, theme = _category_details(src_uri, metadata.get("category"))
        emoji = metadata.get("emoji", emoji)
        target_url = getattr(item, "url", "")

        entries.append(
            ArchiveEntry(
                src_uri=src_uri,
                title=_entry_title(metadata, body, src_uri),
                author=metadata.get("author", default_author),
                category=category,
                published=published,
                updated=updated,
                page_url=_relative_url(target_url, page.file.url),
                image_url=_resolve_image(
                    body,
                    metadata.get("cover") or metadata.get("image"),
                    src_uri,
                    page.file.url,
                    file_urls,
                ),
                emoji=emoji,
                theme=theme,
            )
        )

    return sorted(entries, key=lambda entry: (entry.activity_date, entry.title.casefold()), reverse=True)


def _card(entry: ArchiveEntry) -> str:
    title = html.escape(entry.title)
    author = html.escape(entry.author)
    category = html.escape(entry.category)
    source = html.escape(entry.src_uri, quote=True)
    href = html.escape(entry.page_url, quote=True)
    activity = entry.activity_date.isoformat()
    label = "UPDATED" if entry.is_updated else "PUBLISHED"
    status_class = "updated" if entry.is_updated else "published"
    accessible_label = html.escape(f"Read {entry.title}")
    display_date = entry.activity_date.strftime("%b %d, %Y").replace(" 0", " ")

    if entry.image_url:
        cover = (
            f'<img class="archive-card__image off-glb" src="{html.escape(entry.image_url, quote=True)}" '
            f'alt="" loading="lazy" decoding="async">'
        )
    else:
        cover = (
            f'<span class="archive-card__emoji" aria-hidden="true">'
            f'{html.escape(entry.emoji)}</span>'
        )

    return f"""
<article class="archive-card archive-card--{html.escape(entry.theme)}" data-source="{source}">
  <a class="archive-card__link" href="{href}" aria-label="{accessible_label}">
    <div class="archive-card__body">
      <div class="archive-card__title-row">
        <span class="archive-card__status archive-card__status--{status_class}">{label}</span>
        <h3 class="archive-card__title">{title}</h3>
      </div>
      <div class="archive-card__meta">
        <span>By {author}</span>
        <span aria-hidden="true">·</span>
        <time datetime="{activity}">{display_date}</time>
      </div>
      <div class="archive-card__footer">
        <span class="archive-card__category">{category}</span>
        <span class="archive-card__arrow" aria-hidden="true">↗</span>
      </div>
    </div>
    <div class="archive-card__cover{' archive-card__cover--emoji' if not entry.image_url else ''}">
      {cover}
    </div>
  </a>
</article>""".strip()


def _render_archive(entries: Sequence[ArchiveEntry]) -> str:
    if not entries:
        return '<p class="archive-empty">No entries yet.</p>'

    newest = entries[0].activity_date
    sections: List[str] = []
    years = sorted({entry.activity_date.year for entry in entries}, reverse=True)
    for year in years:
        year_entries = [entry for entry in entries if entry.activity_date.year == year]
        cards = "\n".join(_card(entry) for entry in year_entries)
        sections.append(
            f"""
<section class="archive-year" aria-labelledby="archive-year-{year}">
  <div class="archive-year__heading">
    <h2 id="archive-year-{year}">{year}</h2>
    <span>{len(year_entries):02d} entries</span>
  </div>
  <div class="archive-grid">
    {cards}
  </div>
</section>""".strip()
        )

    return f"""
<header class="archive-hero">
  <p class="archive-hero__eyebrow">MY KNOWLEDGE LOG</p>
  <h1>Archive</h1>
  <p class="archive-hero__lead">An evolving record of notes, papers, and ideas worth returning to.</p>
  <div class="archive-hero__stats" aria-label="Archive summary">
    <span>Last updated <strong>{newest.strftime('%b %d, %Y').replace(' 0', ' ')}</strong></span>
  </div>
</header>

{chr(10).join(sections)}

<p class="archive-note">Dates come from article front matter and fall back to Git history. The default author is Chen Jing (经宸).</p>
""".strip()


def _add_obsidian_block_anchors(markdown: str) -> str:
    """Expose Obsidian block IDs as HTML anchors for MkDocs link checks.

    Obsidian references blocks as ``[[Page#^blockid]]`` and stores the target
    marker as a trailing ``^blockid`` in the source Markdown. MkDocs converts
    the link target to ``#blockid`` but does not create a matching HTML anchor.
    This keeps the Obsidian source style intact while making those block links
    work on the published site.
    """

    converted: List[str] = []
    active_fence: Optional[str] = None

    for line in markdown.splitlines(keepends=True):
        newline = ""
        content = line
        if content.endswith("\r\n"):
            content, newline = content[:-2], "\r\n"
        elif content.endswith("\n"):
            content, newline = content[:-1], "\n"

        fence_match = FENCE_START_RE.match(content)
        if fence_match:
            marker = fence_match.group("fence")[0]
            if active_fence == marker:
                active_fence = None
            elif active_fence is None:
                active_fence = marker
            converted.append(content + newline)
            continue

        if active_fence:
            converted.append(content + newline)
            continue

        block_match = OBSIDIAN_BLOCK_ID_RE.search(content)
        suffix = ""
        if not block_match and content.lstrip().startswith(("!!!", "???", ":::")):
            block_match = OBSIDIAN_QUOTED_BLOCK_ID_RE.search(content)
            if block_match:
                suffix = block_match.group(2)
        if not block_match:
            converted.append(content + newline)
            continue

        block_id = block_match.group(1)
        before = content[: block_match.start()].rstrip()
        anchor = f"<span id='{block_id}' class='block-anchor'></span>"
        converted.append(f"{before} {anchor}{suffix}{newline}" if before else f"{anchor}{suffix}{newline}")

    return "".join(converted)


def _normalize_obsidian_marks(markdown: str) -> str:
    """Convert Obsidian ``==highlight==`` into reliable HTML marks.

    ``pymdownx.mark`` does not always parse CJK-adjacent or punctuation-adjacent
    Obsidian marks, so sequences such as ``将==重点==加入`` can leak to the
    published page. This pre-pass keeps arrows like ``==>`` / ``<==`` intact and
    skips fenced code, inline code, and inline math.
    """

    converted: List[str] = []
    active_fence: Optional[str] = None

    def convert_segment(segment: str) -> str:
        parts: List[str] = []
        last = 0
        for match in INLINE_PROTECTED_RE.finditer(segment):
            parts.append(OBSIDIAN_MARK_RE.sub(r"<mark>\1</mark>", segment[last : match.start()]))
            parts.append(match.group(0))
            last = match.end()
        parts.append(OBSIDIAN_MARK_RE.sub(r"<mark>\1</mark>", segment[last:]))
        return "".join(parts)

    for line in markdown.splitlines(keepends=True):
        newline = ""
        content = line
        if content.endswith("\r\n"):
            content, newline = content[:-2], "\r\n"
        elif content.endswith("\n"):
            content, newline = content[:-1], "\n"

        fence_match = FENCE_START_RE.match(content)
        if fence_match:
            marker = fence_match.group("fence")[0]
            if active_fence == marker:
                active_fence = None
            elif active_fence is None:
                active_fence = marker
            converted.append(content + newline)
            continue

        converted.append((content if active_fence else convert_segment(content)) + newline)

    return "".join(converted)


def _break_lazy_blockquote_continuation(markdown: str) -> str:
    """Keep Obsidian-style blockquotes limited to explicit ``>`` lines.

    Python-Markdown follows CommonMark-style lazy continuation, so a line after
    ``> quote`` can be absorbed into the quote even when it does not start with
    ``>``. Obsidian notes in this vault use explicit markers, so insert a blank
    separator whenever a quoted line is followed by ordinary Markdown.
    """

    lines = markdown.splitlines(keepends=True)
    if not lines:
        return markdown

    converted: List[str] = []
    active_fence: Optional[str] = None

    def strip_newline(line: str) -> Tuple[str, str]:
        if line.endswith("\r\n"):
            return line[:-2], "\r\n"
        if line.endswith("\n"):
            return line[:-1], "\n"
        return line, "\n"

    for index, line in enumerate(lines):
        content, newline = strip_newline(line)
        fence_match = FENCE_START_RE.match(content)
        if fence_match:
            marker = fence_match.group("fence")[0]
            if active_fence == marker:
                active_fence = None
            elif active_fence is None:
                active_fence = marker

        converted.append(line)

        if active_fence or not BLOCKQUOTE_LINE_RE.match(content) or index == len(lines) - 1:
            continue

        next_content, _ = strip_newline(lines[index + 1])
        if next_content.strip() and not BLOCKQUOTE_LINE_RE.match(next_content):
            converted.append(newline)

    return "".join(converted)


def on_page_markdown(markdown, page, config, files, **kwargs):
    """Render the Archive page and make Obsidian block references linkable."""
    markdown = _break_lazy_blockquote_continuation(markdown)
    markdown = _normalize_obsidian_marks(markdown)
    markdown = _add_obsidian_block_anchors(markdown)
    src_uri = getattr(page.file, "src_uri", getattr(page.file, "src_path", ""))
    if src_uri != ARCHIVE_PAGE or ARCHIVE_MARKER not in markdown:
        return markdown

    entries = _collect_entries(config, files, page)
    log.info("Archive generated with %d content entries", len(entries))
    return markdown.replace(ARCHIVE_MARKER, _render_archive(entries))
