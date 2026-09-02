"""Render maintainable Overview news and publication data into the homepage.

The editable source lives in ``data/homepage``.  Keeping the data outside
``docs`` prevents YAML files from becoming public site assets while still
letting MkDocs render complete, crawlable HTML at build time.
"""

from __future__ import annotations

import html
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urlsplit

import yaml
from mkdocs.exceptions import PluginError


HOME_PAGE = "index.md"
NEWS_MARKER = "<!-- OVERVIEW_NEWS_AUTO -->"
PUBLICATIONS_MARKER = "<!-- OVERVIEW_PUBLICATIONS_AUTO -->"
NEWS_DATA = Path("data/homepage/news.yml")
PUBLICATIONS_DATA = Path("data/homepage/publications.yml")
PUBLICATION_IMAGE_ROOT = "assets/images/publications/"
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
    display_date = _text(entry.get("display_date"), f"news.entries[{index}].display_date", required=False)
    if not display_date:
        display_date = published.strftime("%b %d").upper()
    body = html.escape(_text(entry.get("text"), f"news.entries[{index}].text"))
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


def _render_authors(authors: Sequence[Mapping[str, Any]], collapse_after: int) -> str:
    full = _join_authors(authors)
    collapsible = len(authors) > collapse_after and any(author["self"] for author in authors)
    if not collapsible:
        return f'<p class="overview-publication__authors">{full}</p>'
    short = _compact_authors(authors)
    return (
        '<details class="overview-publication__authors overview-publication__authors-details">'
        '<summary>'
        f'<span class="overview-publication__authors-short">{short}</span>'
        '<span class="overview-publication__authors-toggle">'
        '<span class="when-closed">Detailed author list</span>'
        '<span class="when-open">Hide detailed author list</span>'
        "</span></summary>"
        f'<p class="overview-publication__authors-full">{full}</p>'
        "</details>"
    )


def _render_publication_media(entry: Mapping[str, Any], label: str) -> str:
    image = _text(entry.get("image"), f"{label}.image", required=False)
    if image:
        if not image.startswith(PUBLICATION_IMAGE_ROOT) or ".." in Path(image).parts:
            raise HomeSectionError(
                f"{label}.image must be inside docs/{PUBLICATION_IMAGE_ROOT}"
            )
        image_alt = _text(entry.get("image_alt"), f"{label}.image_alt")
        return (
            '<div class="overview-publication__media">'
            f'<img src="{html.escape(image, quote=True)}" alt="{html.escape(image_alt, quote=True)}" loading="lazy">'
            "</div>"
        )
    placeholder = _text(entry.get("placeholder", "PAPER"), f"{label}.placeholder")
    return (
        '<div class="overview-publication__media overview-publication__media--placeholder" aria-hidden="true">'
        f"<span>{html.escape(placeholder)}</span></div>"
    )


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
        if image and repo_root is not None and not (repo_root / "docs" / image).is_file():
            raise HomeSectionError(f"publication image does not exist: docs/{image}")

        is_lead = _boolean(entry.get("lead"), f"{label}.lead")
        item_classes = "overview-publication" + (" is-lead" if is_lead else "")
        media = _render_publication_media(entry, label)
        authors_markup = _render_authors(authors, collapse_after)
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


def on_page_markdown(markdown, page, config, files, **kwargs):
    """Inject the two generated homepage sections before Markdown rendering."""
    src_uri = getattr(page.file, "src_uri", getattr(page.file, "src_path", ""))
    if src_uri != HOME_PAGE:
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
