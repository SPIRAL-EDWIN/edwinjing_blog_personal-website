"""Render Overview data and shared HOME profile markup at build time.

The editable source lives in ``data/homepage``.  Keeping the data outside
``docs`` prevents YAML files from becoming public site assets while still
letting MkDocs render complete, crawlable HTML at build time.
"""

from __future__ import annotations

import html
import json
import re
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urljoin, urlsplit, urlunsplit

import yaml
from mkdocs.exceptions import PluginError
from mkdocs.utils import get_relative_url
from PIL import Image, UnidentifiedImageError


HOME_PAGE = "index.md"
HOME_PROFILE_PAGES = frozenset({"HOME/friends.md", "HOME/Archive/index.md"})
REPOSITORY_FACTS = "assets/data/github-repo.json"
NEWS_MARKER = "<!-- OVERVIEW_NEWS_AUTO -->"
PUBLICATIONS_MARKER = "<!-- OVERVIEW_PUBLICATIONS_AUTO -->"
NEWS_DATA = Path("data/homepage/news.yml")
PUBLICATIONS_DATA = Path("data/homepage/publications.yml")
PUBLICATION_IMAGE_ROOT = "assets/images/publications/"
PUBLICATION_IMAGE_MAX_BYTES = 256 * 1024
PUBLICATION_IMAGE_MAX_PIXELS = 2_000_000
PUBLICATION_PREVIEW_ROOT = "assets/videos/publications/"
PUBLICATION_PREVIEW_MAX_BYTES = 3 * 1024 * 1024
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
AUTHOR_MARKS = frozenset("*†§")


class HomeSectionError(ValueError):
    """Raised when maintainable homepage data is invalid."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise HomeSectionError(f"{label} must be a mapping")
    return value


def _sequence(value: Any, label: str) -> Sequence[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise HomeSectionError(f"{label} must be a list")
    return value


def _text(value: Any, label: str, *, required: bool = True) -> str:
    result = "" if value is None else str(value).strip()
    if required and not result:
        raise HomeSectionError(f"{label} is required")
    return result


def _integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool):
        raise HomeSectionError(f"{label} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise HomeSectionError(f"{label} must be an integer") from exc
    if result < minimum:
        raise HomeSectionError(f"{label} must be at least {minimum}")
    return result


def _boolean(value: Any, label: str, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "on", "1"}:
            return True
        if normalized in {"false", "no", "off", "0"}:
            return False
    raise HomeSectionError(f"{label} must be true or false")


def _url(value: Any, label: str) -> str:
    result = _text(value, label)
    parsed = urlsplit(result)
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "mailto"}:
        raise HomeSectionError(f"{label} uses an unsupported URL scheme")
    if result.startswith("//"):
        raise HomeSectionError(f"{label} must not use a protocol-relative URL")
    return result


def _load_yaml(path: Path) -> Mapping[str, Any]:
    if not path.is_file():
        raise HomeSectionError(f"missing data file: {path}")
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise HomeSectionError(f"invalid YAML in {path}: {exc}") from exc
    return _mapping(value, str(path))


def _date_value(value: Any, label: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    candidate = _text(value, label)
    try:
        return date.fromisoformat(candidate)
    except ValueError as exc:
        raise HomeSectionError(f"{label} must use YYYY-MM-DD") from exc


def _external_link_attributes(url: str) -> str:
    return ' target="_blank" rel="noopener noreferrer"' if urlsplit(url).scheme in {"http", "https"} else ""


def _render_links(links: Any, label: str, css_class: str) -> str:
    if links in (None, ""):
        return ""
    rendered = []
    for index, raw_link in enumerate(_sequence(links, label)):
        link = _mapping(raw_link, f"{label}[{index}]")
        link_label = _text(link.get("label"), f"{label}[{index}].label")
        url = _url(link.get("url"), f"{label}[{index}].url")
        rendered.append(
            f'<a href="{html.escape(url, quote=True)}"{_external_link_attributes(url)}>'
            f"{html.escape(link_label)}</a>"
        )
    if not rendered:
        return ""
    return f'<nav class="{css_class}" aria-label="Related links">' + "".join(rendered) + "</nav>"


def _render_news_item(entry: Mapping[str, Any], index: int) -> tuple[date, str]:
    published = _date_value(entry.get("date"), f"news.entries[{index}].date")
    display_date = published.strftime("%m/%Y")
    plain_text = _text(entry.get("text"), f"news.entries[{index}].text")
    # News announcements consistently celebrate good news, including future entries.
    plain_text = plain_text.rstrip(".!?。！？…") + "!"
    inline_link = entry.get("inline_link")
    if inline_link in (None, ""):
        body = html.escape(plain_text)
    else:
        link = _mapping(inline_link, f"news.entries[{index}].inline_link")
        link_label = _text(link.get("label"), f"news.entries[{index}].inline_link.label")
        link_url = _url(link.get("url"), f"news.entries[{index}].inline_link.url")
        if plain_text.count(link_label) != 1:
            raise HomeSectionError(
                f"news.entries[{index}].inline_link.label must appear exactly once in text"
            )
        before, after = plain_text.split(link_label)
        body = (
            html.escape(before)
            + f'<a class="overview-news-inline-link" href="{html.escape(link_url, quote=True)}"'
            + _external_link_attributes(link_url)
            + f">{html.escape(link_label)}</a>"
            + html.escape(after)
        )
    links = _render_links(entry.get("links"), f"news.entries[{index}].links", "overview-news-links")
    markup = (
        "<li>"
        f'<time class="news-date" datetime="{published.isoformat()}">{html.escape(display_date)}</time>'
        f'<span class="news-text">{body}{links}</span>'
        "</li>"
    )
    return published, markup


def render_news(data: Mapping[str, Any]) -> str:
    settings = _mapping(data.get("settings", {}), "news.settings")
    visible_count = _integer(settings.get("visible_count", 5), "news.settings.visible_count", minimum=1)
    raw_entries = _sequence(data.get("entries", []), "news.entries")
    rendered = [
        _render_news_item(_mapping(entry, f"news.entries[{index}]"), index)
        for index, entry in enumerate(raw_entries)
    ]
    rendered.sort(key=lambda item: item[0], reverse=True)
    items = [item[1] for item in rendered]
    if not items:
        return '<p class="overview-section-empty">News will be added here.</p>'

    current = '<ul class="news-list overview-news-list">' + "".join(items[:visible_count]) + "</ul>"
    older = items[visible_count:]
    if not older:
        return current
    return (
        current
        + '<details class="overview-news-more">'
        + '<summary><span class="when-closed">Show more ↓</span><span class="when-open">Show less ↑</span></summary>'
        + '<ul class="news-list overview-news-list overview-news-list--older">'
        + "".join(older)
        + "</ul></details>"
    )


def _author(entry: Any, label: str, self_author: str) -> Mapping[str, Any]:
    if isinstance(entry, str):
        raw: Mapping[str, Any] = {"name": entry}
    else:
        raw = _mapping(entry, label)
    name = _text(raw.get("name"), f"{label}.name")
    marks = _text(raw.get("marks"), f"{label}.marks", required=False)
    if any(mark not in AUTHOR_MARKS for mark in marks):
        raise HomeSectionError(f"{label}.marks may only contain *, †, or §")
    url = _text(raw.get("url"), f"{label}.url", required=False)
    if url:
        url = _url(url, f"{label}.url")
    return {
        "name": name,
        "marks": marks,
        "url": url,
        "self": _boolean(raw.get("self"), f"{label}.self") or name.casefold() == self_author.casefold(),
    }


def _author_markup(author: Mapping[str, Any]) -> str:
    classes = "overview-publication__author" + (" is-self" if author["self"] else "")
    name = html.escape(str(author["name"]))
    marks = html.escape(str(author["marks"]))
    content = f"{name}{marks}"
    if author["url"]:
        url = str(author["url"])
        return (
            f'<a class="{classes}" href="{html.escape(url, quote=True)}"'
            f'{_external_link_attributes(url)}>{content}</a>'
        )
    tag = "strong" if author["self"] else "span"
    return f'<{tag} class="{classes}">{content}</{tag}>'


def _join_authors(authors: Iterable[Mapping[str, Any]]) -> str:
    return ", ".join(_author_markup(author) for author in authors)


def _compact_authors(authors: Sequence[Mapping[str, Any]]) -> str:
    keep = {0, len(authors) - 1}
    keep.update(index for index, author in enumerate(authors) if author["self"] or author["marks"])
    chunks = []
    previous = -1
    for index in sorted(keep):
        if previous >= 0 and index - previous > 1:
            chunks.append('<span class="overview-publication__authors-ellipsis">…</span>')
        chunks.append(_author_markup(authors[index]))
        previous = index
    return ", ".join(chunks)


def _render_authors(authors: Sequence[Mapping[str, Any]], collapse_after: int, entry_id: str) -> str:
    full = _join_authors(authors)
    collapsible = len(authors) > collapse_after and any(author["self"] for author in authors)
    if not collapsible:
        return f'<p class="overview-publication__authors">{full}</p>'
    short = _compact_authors(authors)
    full_id = f"publication-{entry_id}-authors-full"
    return (
        '<p class="overview-publication__authors">'
        f'<span class="overview-publication__authors-short">{short}</span>'
        f'<span class="overview-publication__authors-full" id="{full_id}">{full}</span>'
        '<button type="button" class="overview-publication__authors-toggle" '
        f'aria-expanded="false" aria-controls="{full_id}">'
        '<span class="when-closed">Detailed author list</span>'
        '<span class="when-open">Hide detailed author list</span>'
        "</button></p>"
    )


def _publication_image_dimensions(path: Path, label: str) -> tuple[int, int]:
    if path.stat().st_size > PUBLICATION_IMAGE_MAX_BYTES:
        raise HomeSectionError(
            f"{label}.image must be no larger than "
            f"{PUBLICATION_IMAGE_MAX_BYTES // 1024} KiB"
        )
    try:
        with Image.open(path) as image:
            width, height = image.size
            image.verify()
    except (OSError, UnidentifiedImageError) as exc:
        raise HomeSectionError(f"{label}.image is not a readable raster image") from exc
    if width <= 0 or height <= 0:
        raise HomeSectionError(f"{label}.image has invalid dimensions")
    if width * height > PUBLICATION_IMAGE_MAX_PIXELS:
        raise HomeSectionError(
            f"{label}.image must contain no more than "
            f"{PUBLICATION_IMAGE_MAX_PIXELS:,} pixels"
        )
    return width, height


def _render_publication_media(
    entry: Mapping[str, Any],
    label: str,
    *,
    dimensions: tuple[int, int] | None = None,
    initial_image: bool = False,
    preview: Mapping[str, str] | None = None,
) -> str:
    image = _text(entry.get("image"), f"{label}.image", required=False)
    if image:
        if not image.startswith(PUBLICATION_IMAGE_ROOT) or ".." in Path(image).parts:
            raise HomeSectionError(
                f"{label}.image must be inside docs/{PUBLICATION_IMAGE_ROOT}"
            )
        image_alt = _text(entry.get("image_alt"), f"{label}.image_alt")
        dimensions_markup = ""
        if dimensions is not None:
            dimensions_markup = f' width="{dimensions[0]}" height="{dimensions[1]}"'
        loading_markup = ('loading="eager" fetchpriority="auto" decoding="sync"'
                          if initial_image else
                          'loading="lazy" fetchpriority="low" decoding="async"')
        preview_markup = ""
        if preview:
            description = html.escape(preview["description"], quote=True)
            preview_markup = (
                '<video class="overview-publication__preview" '
                f'data-preview-src="{html.escape(preview["src"], quote=True)}" '
                'preload="none" muted loop playsinline aria-hidden="true" tabindex="-1" hidden></video>'
                '<button type="button" class="overview-publication__preview-toggle" '
                f'data-preview-description="{description}" aria-label="Play preview: {description}" '
                'aria-pressed="false" hidden>Play preview</button>'
            )
        modifier = " overview-publication__media--preview" if preview else ""
        return (
            f'<div class="overview-publication__media{modifier}">'
            f'<img class="off-glb" src="{html.escape(image, quote=True)}" '
            f'alt="{html.escape(image_alt, quote=True)}"{dimensions_markup} '
            f'{loading_markup}>'
            + preview_markup + "</div>"
        )
    placeholder = _text(entry.get("placeholder", "PAPER"), f"{label}.placeholder")
    return (
        '<div class="overview-publication__media overview-publication__media--placeholder" aria-hidden="true">'
        f"<span>{html.escape(placeholder)}</span></div>"
    )


def _publication_preview(entry: Mapping[str, Any], label: str, repo_root: Path | None) -> Mapping[str, str] | None:
    """Validate optional local clips without probing/decoding media during a build."""
    if entry.get("preview") is None:
        return None
    preview = _mapping(entry["preview"], f"{label}.preview")
    if not _text(entry.get("image"), f"{label}.image", required=False):
        raise HomeSectionError(f"{label}.preview requires a static image")
    src = _text(preview.get("src"), f"{label}.preview.src")
    # Restrict the authored path as well as its resolved target: no URL schemes,
    # encoded traversal, query strings, fragments, or symlinks outside this root.
    if (not src.startswith(PUBLICATION_PREVIEW_ROOT)
            or not re.fullmatch(r"[A-Za-z0-9_./-]+", src)
            or ".." in Path(src).parts
            or Path(src).suffix.lower() not in {".mp4", ".webm"}):
        raise HomeSectionError(f"{label}.preview.src must be a local MP4/WebM inside docs/{PUBLICATION_PREVIEW_ROOT}")
    description = _text(preview.get("description"), f"{label}.preview.description")
    if repo_root is not None:
        media_root = (repo_root / "docs" / PUBLICATION_PREVIEW_ROOT).resolve()
        clip = (repo_root / "docs" / src).resolve()
        if (not media_root.is_relative_to((repo_root / "docs").resolve())
                or not clip.is_relative_to(media_root) or not clip.is_file()):
            raise HomeSectionError(f"{label}.preview.src must resolve to an existing file inside docs/{PUBLICATION_PREVIEW_ROOT}")
        if not 0 < clip.stat().st_size <= PUBLICATION_PREVIEW_MAX_BYTES:
            raise HomeSectionError(f"{label}.preview.src must be nonempty and no larger than 3 MiB")
    return {"src": src, "description": description}


def _render_venue(raw_venue: Any, label: str) -> str:
    venue = _mapping(raw_venue, label)
    name = _text(venue.get("name"), f"{label}.name")
    year = _text(venue.get("year"), f"{label}.year", required=False)
    status = _text(venue.get("status"), f"{label}.status", required=False)
    rank = _text(venue.get("rank"), f"{label}.rank", required=False)
    primary = " ".join(part for part in (name, year) if part)
    metadata = " · ".join(part for part in (status, rank) if part)
    rendered = f'<span class="overview-publication__venue-name">{html.escape(primary)}</span>'
    if metadata:
        rendered += f'<span class="overview-publication__venue-meta">{html.escape(metadata)}</span>'
    return f'<div class="overview-publication__venue">{rendered}</div>'


def render_publications(data: Mapping[str, Any], repo_root: Path | None = None) -> str:
    settings = _mapping(data.get("settings", {}), "publications.settings")
    self_author = _text(settings.get("self_author", "Chen Jing"), "publications.settings.self_author")
    collapse_after = _integer(
        settings.get("collapse_after", 7),
        "publications.settings.collapse_after",
        minimum=2,
    )
    raw_entries = _sequence(data.get("entries", []), "publications.entries")
    seen_ids = set()
    rendered_entries = []
    used_marks = set()
    initial_image_rendered = False

    for index, raw_entry in enumerate(raw_entries):
        label = f"publications.entries[{index}]"
        entry = _mapping(raw_entry, label)
        entry_id = _text(entry.get("id"), f"{label}.id")
        if not SAFE_ID_RE.fullmatch(entry_id):
            raise HomeSectionError(f"{label}.id must use lowercase letters, numbers, - or _")
        if entry_id in seen_ids:
            raise HomeSectionError(f"duplicate publication id: {entry_id}")
        seen_ids.add(entry_id)

        title = _text(entry.get("title"), f"{label}.title")
        raw_authors = _sequence(entry.get("authors", []), f"{label}.authors")
        if not raw_authors:
            raise HomeSectionError(f"{label}.authors must contain at least one author")
        authors = [_author(author, f"{label}.authors[{author_index}]", self_author) for author_index, author in enumerate(raw_authors)]
        used_marks.update(mark for author in authors for mark in author["marks"])

        image = _text(entry.get("image"), f"{label}.image", required=False)
        if image and (not image.startswith(PUBLICATION_IMAGE_ROOT) or ".." in Path(image).parts):
            raise HomeSectionError(
                f"{label}.image must be inside docs/{PUBLICATION_IMAGE_ROOT}"
            )
        image_dimensions = None
        if image and repo_root is not None:
            image_path = repo_root / "docs" / image
            if not image_path.is_file():
                raise HomeSectionError(f"publication image does not exist: docs/{image}")
            image_dimensions = _publication_image_dimensions(image_path, label)

        is_lead = _boolean(entry.get("lead"), f"{label}.lead")
        item_classes = "overview-publication" + (" is-lead" if is_lead else "")
        media = _render_publication_media(
            entry,
            label,
            dimensions=image_dimensions,
            initial_image=bool(image) and not initial_image_rendered,
            preview=_publication_preview(entry, label, repo_root),
        )
        initial_image_rendered = initial_image_rendered or bool(image)
        authors_markup = _render_authors(authors, collapse_after, entry_id)
        venue = _render_venue(entry.get("venue"), f"{label}.venue")
        award = _text(entry.get("award"), f"{label}.award", required=False)
        award_markup = (
            f'<p class="overview-publication__award"><span>{html.escape(award)}</span></p>' if award else ""
        )
        links = _render_links(entry.get("links"), f"{label}.links", "overview-publication__links")
        rendered_entries.append(
            f'<li class="{item_classes}" id="publication-{html.escape(entry_id, quote=True)}">'
            + media
            + '<div class="overview-publication__body">'
            + f'<h3 class="overview-publication__title">{html.escape(title)}</h3>'
            + authors_markup
            + venue
            + award_markup
            + links
            + "</div></li>"
        )

    if not rendered_entries:
        return '<p class="overview-section-empty">Publications will be added here.</p>'

    result = '<ul class="overview-publication-list">' + "".join(rendered_entries) + "</ul>"
    notes = _mapping(settings.get("author_notes", {}), "publications.settings.author_notes")
    note_parts = []
    for mark in ("*", "†", "§"):
        note = _text(notes.get(mark), f"publications.settings.author_notes.{mark}", required=False)
        if mark in used_marks and note:
            note_parts.append(f"{html.escape(mark)} {html.escape(note)}")
    if note_parts:
        result += '<p class="overview-publication-notes">' + " · ".join(note_parts) + "</p>"
    return result


def _repo_root(config: Any) -> Path:
    config_path = getattr(config, "config_file_path", None)
    if not config_path and isinstance(config, Mapping):
        config_path = config.get("config_file_path")
    if not config_path:
        raise HomeSectionError("MkDocs config_file_path is unavailable")
    return Path(config_path).resolve().parent


def on_config(config, **kwargs):
    """Make the validated same-origin source snapshot available before paint."""
    extra = config.setdefault("extra", {})
    extra["edwinos_github_repo_facts"] = {}
    path = Path(config["docs_dir"]) / REPOSITORY_FACTS
    if not path.is_file():
        return config
    try:
        facts = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(facts, dict):
            raise ValueError("snapshot must be an object")
        for key in ("stars", "forks"):
            if type(facts.get(key)) is not int or facts[key] < 0:
                raise ValueError(f"{key} must be a non-negative integer")
        repository = facts.get("repository")
        if not isinstance(repository, str) or not re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
            raise ValueError("repository must use owner/name")
    except (OSError, ValueError) as exc:
        raise PluginError(f"Repository facts snapshot error: {exc}") from exc

    source = urlsplit(config.get("repo_url", ""))
    if source.hostname == "github.com" and source.path.strip("/") == repository:
        extra["edwinos_github_repo_facts"] = {
            "repository": repository, "stars": facts["stars"], "forks": facts["forks"]
        }
    return config


def _profile_url(value: str, page_url: str) -> str:
    """Rebase homepage-authored local URLs without assuming a site-root deploy."""
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not value:
        return value
    target = urlsplit(urljoin("/", value))
    path = get_relative_url(target.path, page_url)
    return urlunsplit(("", "", path, target.query, target.fragment))


def _profile_srcset(value: str, page_url: str) -> str:
    # A candidate URL ends at whitespace; commas inside data URLs belong to
    # the URL. Local URL lists may also omit descriptors and separating spaces.
    return re.sub(
        r"(^|,\s*)(\S+)(?=\s|$)",
        lambda match: match[1] + (
            match[2] if match[2].startswith("data:") else
            ",".join(_profile_url(url, page_url) for url in match[2].split(","))
        ),
        value,
    )


class _ProfileMarkup(HTMLParser):
    """Locate profile markup without serializing or changing authored HTML."""

    def __init__(self, markup: str):
        super().__init__(convert_charrefs=False)
        self.markup = markup
        self.offsets = [0] + [match.end() for match in re.finditer("\n", markup)]
        self.sidebars = []
        self.start = None
        self.depth = 0
        self.has_subpage = False
        self.feed(markup)

    def _offset(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        classes = dict(attrs).get("class", "").split()
        if "academic-home-layout--subpage" in classes:
            self.has_subpage = True
        if tag == "aside":
            if self.start is not None:
                self.depth += 1
            elif "academic-sidebar" in classes:
                self.start = self._offset()
                self.depth = 1

    def handle_endtag(self, tag):
        if tag == "aside" and self.start is not None:
            self.depth -= 1
            if self.depth == 0:
                end = self.markup.index(">", self._offset()) + 1
                self.sidebars.append(self.markup[self.start:end])
                self.start = None


class _ProfileUrls(HTMLParser):
    def __init__(self, markup: str, page_url: str):
        super().__init__(convert_charrefs=False)
        self.markup = markup
        self.page_url = page_url
        self.offsets = [0] + [match.end() for match in re.finditer("\n", markup)]
        self.replacements = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        original = self.get_starttag_text()

        def replace(match):
            value = html.unescape(match[4])
            rebased = (_profile_srcset(value, self.page_url) if match[1].lower() == "srcset"
                       else _profile_url(value, self.page_url))
            return match[1] + match[2] + match[3] + html.escape(rebased, quote=True) + match[3]

        rewritten = re.sub(r'''(?<![\w:-])(href|src|srcset)(\s*=\s*)(["'])(.*?)\3''',
                           replace, original, flags=re.IGNORECASE | re.DOTALL)
        if tag == "aside" and "data-search-exclude" not in dict(attrs):
            rewritten = rewritten[:-1] + ' data-search-exclude="">'
        if rewritten != original:
            line, column = self.getpos()
            start = self.offsets[line - 1] + column
            self.replacements.append((start, start + len(original), rewritten))

    def rewritten(self):
        result = self.markup
        for start, end, replacement in reversed(self.replacements):
            result = result[:start] + replacement + result[end:]
        return result


def render_profile_sidebar(markdown: str, page_url: str) -> str:
    """Reuse the single authored profile, including personal links and SVGs."""
    parsed = _ProfileMarkup(markdown)
    if len(parsed.sidebars) != 1 or parsed.start is not None:
        raise HomeSectionError("Overview must contain exactly one academic-sidebar")
    # The old runtime copy was never part of search content. Keep that scope.
    return _ProfileUrls(parsed.sidebars[0], page_url).rewritten()


class _HomeImagePreloads(HTMLParser):
    """Read the three initial homepage images from their rendered owners."""

    def __init__(self, markup: str):
        super().__init__()
        self.div_classes = []
        self.images = {}
        self.feed(markup)

    @staticmethod
    def _local_url(value: str) -> bool:
        parsed = urlsplit(value)
        return bool(parsed.path) and not parsed.scheme and not parsed.netloc

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "div":
            self.div_classes.append(set(attributes.get("class", "").split()))
        if tag != "img":
            return
        ancestors = set().union(*self.div_classes) if self.div_classes else set()
        owner = next((name for name in (
            "overview-education-logo", "overview-workshop__media",
            "overview-publication__media",
        ) if name in ancestors), None)
        if not owner or owner in self.images:
            return
        source = attributes.get("src", "")
        srcset = attributes.get("srcset", "")
        # Only local assets belong to this bounded preload set. An external or
        # data candidate could otherwise change the request selected by DPR.
        if not self._local_url(source) or (srcset and any(
            not self._local_url(candidate.strip().split()[0])
            for candidate in srcset.split(",") if candidate.strip()
        )):
            return
        self.images[owner] = {
            "src": source,
            "srcset": srcset,
            "sizes": attributes.get("sizes", ""),
        }

    def handle_endtag(self, tag):
        if tag == "div" and self.div_classes:
            self.div_classes.pop()

    def descriptors(self):
        return [self.images[name] for name in (
            "overview-education-logo", "overview-publication__media",
            "overview-workshop__media",
        ) if name in self.images]


def on_page_content(html_content, page, config, files, **kwargs):
    """Prepare homepage images and emit HOME profile subpages before paint."""
    src_uri = getattr(page.file, "src_uri", getattr(page.file, "src_path", ""))
    page.edwinos_home_image_preloads = []
    if src_uri == HOME_PAGE:
        page.edwinos_home_image_preloads = _HomeImagePreloads(html_content).descriptors()
        return html_content
    if src_uri not in HOME_PROFILE_PAGES:
        return html_content
    # Idempotence prevents a second shell if another caller passes rendered HTML.
    if _ProfileMarkup(html_content).has_subpage:
        return html_content
    try:
        home = (_repo_root(config) / "data/homepage/profile-sidebar.html").read_text(encoding="utf-8")
        sidebar = render_profile_sidebar(home, page.url)
    except (OSError, HomeSectionError) as exc:
        raise PluginError(f"HOME profile error: {exc}") from exc
    return (
        '<div class="academic-home-layout academic-home-layout--subpage">'
        + sidebar
        + '<main class="academic-content academic-content--subpage">'
        + html_content
        + "</main></div>"
    )


def on_page_markdown(markdown, page, config, files, **kwargs):
    """Inject the two generated homepage sections before Markdown rendering."""
    src_uri = getattr(page.file, "src_uri", getattr(page.file, "src_path", ""))
    if src_uri != HOME_PAGE or 'class="blog-home"' in markdown:
        return markdown
    missing = [marker for marker in (NEWS_MARKER, PUBLICATIONS_MARKER) if marker not in markdown]
    if missing:
        raise PluginError(f"Overview is missing generated-section marker(s): {', '.join(missing)}")

    root = _repo_root(config)
    try:
        news = render_news(_load_yaml(root / NEWS_DATA))
        publications = render_publications(_load_yaml(root / PUBLICATIONS_DATA), root)
    except HomeSectionError as exc:
        raise PluginError(f"Overview data error: {exc}") from exc
    return markdown.replace(NEWS_MARKER, news).replace(PUBLICATIONS_MARKER, publications)
