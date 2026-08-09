#!/usr/bin/env python3
"""Safely stage manifest-selected Obsidian notes for MkDocs.

The default mode is a read-only dry run.  ``--apply`` writes only to the
isolated staging root declared by the manifest; it never writes to the vault
or to the repository's live ``docs`` tree.  Note contents are never executed
and diagnostics deliberately avoid echoing source text or link targets.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
from urllib.parse import quote


IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".avif"
}
# Presentation-only crops for screenshots whose raster canvas contains solid
# padding. The assets remain byte-for-byte identical to the Obsidian sources;
# these classes only reproduce the reviewed public framing after conversion.
IMAGE_PRESENTATION_CLASSES: Dict[str, Tuple[str, ...]] = {
    "48235f4560d03efd-Pasted-image-20260625205605.png": (
        "trim-black-padding",
        "trim-black-padding--register",
    ),
    "860de49962fd4994-Pasted-image-20260625205634.png": (
        "trim-black-padding",
        "trim-black-padding--scene",
    ),
    "851b866c43cbfb66-Pasted-image-20260625204835.png": (
        "trim-black-padding",
        "trim-black-padding--asset",
    ),
    "f2441a2f8d51b2e0-f22abc1c15b696d1c7b5105d11606a43.png": (
        "trim-white-padding",
        "trim-white-padding--npz-transfer",
    ),
}
WIKILINK_RE = re.compile(r"(!?)\[\[([^\]]+)\]\]")
HEADING_RE = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$", re.M)
BLOCK_ID_RE = re.compile(r"(?<!\S)\^([A-Za-z0-9_-]+)[ \t]*$")
HIGHLIGHT_RE = re.compile(r"(?<!\\)==(.+?)(?<!\\)==")
LIST_ITEM_RE = re.compile(r"^[ \t]*(?:[-+*]|\d+[.)])[ \t]+\S")
IMAGE_ONLY_RE = re.compile(
    r'^[ \t]*!\[[^\n]*\]\([^\n]+\)(?:\{[^\n]*\})?[ \t]*$'
)
TABLE_SEPARATOR_RE = re.compile(
    r"^ {0,3}\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$"
)
FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


class PublishError(RuntimeError):
    """A fail-closed validation error safe to show in logs."""


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def target_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def normalize_key(value: str) -> str:
    return value.strip().replace("\\", "/").casefold()


def safe_relpath(raw: str, *, field_name: str) -> PurePosixPath:
    path = PurePosixPath(raw)
    if not raw or path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise PublishError(f"unsafe {field_name} in manifest")
    return path


def within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


@dataclass(frozen=True)
class ProtectedSpan:
    start_line: int
    end_line: int
    label: str = "protected"
    expected_sha256: Optional[str] = None


@dataclass(frozen=True)
class ManifestNote:
    note_id: str
    source_rel: PurePosixPath
    source_aliases: Tuple[PurePosixPath, ...]
    destination_rel: Optional[PurePosixPath]
    title: str
    section: str
    publish: bool
    source_sha256: Optional[str]
    source_size: Optional[int]
    protected_spans: Tuple[ProtectedSpan, ...] = ()
    redaction_profile: str = ""


@dataclass(frozen=True)
class Config:
    manifest_path: Path
    repo_root: Path
    vault_root: Path
    source_root: Path
    staging_root: Path
    asset_root: PurePosixPath
    materialization_ready: bool
    notes: Tuple[ManifestNote, ...]


@dataclass
class NoteFile:
    path: Path
    rel: PurePosixPath
    text: str
    first_heading: Optional[str]


@dataclass(frozen=True)
class LinkParts:
    target: str
    heading: Optional[str]
    block_id: Optional[str]
    alias: Optional[str]


@dataclass
class LinkOccurrence:
    start: int
    end: int
    line: int
    is_embed: bool
    raw: str
    parts: LinkParts
    note_target: Optional[ManifestNote] = None
    asset_source: Optional[Path] = None
    asset_destination: Optional[PurePosixPath] = None
    heading_anchor: Optional[str] = None
    block_anchor: Optional[str] = None


@dataclass
class PlannedNote:
    manifest: ManifestNote
    source: NoteFile
    occurrences: List[LinkOccurrence] = field(default_factory=list)


@dataclass
class Plan:
    config: Config
    notes: List[PlannedNote]
    outputs: Dict[PurePosixPath, bytes]
    asset_sources: Dict[PurePosixPath, Path]
    link_count: int
    highlight_count: int
    format_fix_count: int


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        default=".codex/lab-projects-publishing-manifest.json",
        help="publication manifest (default: %(default)s)",
    )
    parser.add_argument(
        "--vault-root",
        help="read-only vault root override; useful after moving the private vault",
    )
    parser.add_argument(
        "--staging-root",
        help="isolated staging-root override (must remain inside .codex/staging)",
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true", help="materialize the validated staging tree")
    modes.add_argument(
        "--write-source-hashes",
        action="store_true",
        help="update only source_sha256/source_size fields in the manifest",
    )
    return parser.parse_args(argv)


def load_config(
    manifest_path: Path,
    *,
    vault_override: Optional[str] = None,
    staging_override: Optional[str] = None,
) -> Config:
    manifest_path = manifest_path.expanduser()
    if manifest_path.is_symlink():
        raise PublishError("publication manifest must not be a symbolic link")
    manifest_path = manifest_path.resolve()
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PublishError("unable to read a valid publication manifest") from exc
    if raw.get("schema_version") != 1:
        raise PublishError("unsupported publication manifest schema")

    repo_root = manifest_path.parent.parent.resolve()
    vault_raw = vault_override or raw.get("vault_root")
    if not isinstance(vault_raw, str) or not vault_raw:
        raise PublishError("manifest requires vault_root")
    vault_root = Path(vault_raw).expanduser().resolve()
    if not vault_root.is_dir():
        raise PublishError("vault root does not exist")
    source_root_raw = raw.get("source_root", ".")
    source_root_rel = safe_relpath(source_root_raw, field_name="source_root") if source_root_raw != "." else PurePosixPath(".")
    source_root = (vault_root / Path(source_root_rel)).resolve()
    if not within(source_root, vault_root) or not source_root.is_dir():
        raise PublishError("source root must be an existing child of vault_root")

    staging_raw = staging_override or raw.get("staging_root", ".codex/staging/lab-projects")
    staging_root = Path(staging_raw)
    if not staging_root.is_absolute():
        staging_root = repo_root / staging_root
    staging_root = staging_root.resolve()
    allowed_staging = (repo_root / ".codex" / "staging").resolve()
    if not within(staging_root, allowed_staging) or staging_root == allowed_staging:
        raise PublishError("staging root must be a child of .codex/staging")
    if within(staging_root, vault_root) or within(vault_root, staging_root):
        raise PublishError("vault and staging roots must not overlap")

    asset_root = safe_relpath(raw.get("asset_root", "docs/assets/lab-projects"), field_name="asset_root")
    if not str(asset_root).startswith("docs/"):
        raise PublishError("asset_root must live below staged docs/")

    notes: List[ManifestNote] = []
    seen_ids: Set[str] = set()
    seen_sources: Set[PurePosixPath] = set()
    seen_destinations: Set[PurePosixPath] = set()
    for item in raw.get("notes", []):
        note_id = item.get("id")
        if not isinstance(note_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", note_id):
            raise PublishError("every note requires a stable lowercase id")
        if note_id in seen_ids:
            raise PublishError("duplicate note id in manifest")
        seen_ids.add(note_id)
        source_rel = safe_relpath(item.get("source", ""), field_name="source")
        if source_rel.suffix.casefold() != ".md":
            raise PublishError("manifest note source must end in .md")
        if source_rel in seen_sources:
            raise PublishError("duplicate source in manifest")
        seen_sources.add(source_rel)
        aliases: List[PurePosixPath] = []
        for raw_alias in item.get("source_aliases", []):
            alias = safe_relpath(raw_alias, field_name="source_alias")
            if alias.suffix.casefold() != ".md":
                raise PublishError("manifest source alias must end in .md")
            if alias in seen_sources:
                raise PublishError("duplicate source/source alias in manifest")
            seen_sources.add(alias)
            aliases.append(alias)
        publish = item.get("state", "publish") == "publish"
        destination_rel: Optional[PurePosixPath] = None
        if publish:
            destination_rel = safe_relpath(item.get("destination", ""), field_name="destination")
            if destination_rel.suffix.casefold() != ".md" or not str(destination_rel).startswith("docs/"):
                raise PublishError("published destination must be a Markdown file below docs/")
            if destination_rel in seen_destinations:
                raise PublishError("destination collision in manifest")
            seen_destinations.add(destination_rel)
        spans: List[ProtectedSpan] = []
        for span in item.get("protected_spans", []):
            start = span.get("start_line")
            end = span.get("end_line")
            if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
                raise PublishError("invalid protected line span in manifest")
            spans.append(
                ProtectedSpan(
                    start_line=start,
                    end_line=end,
                    label=str(span.get("label", "protected")),
                    expected_sha256=span.get("sha256"),
                )
            )
        notes.append(
            ManifestNote(
                note_id=note_id,
                source_rel=source_rel,
                source_aliases=tuple(aliases),
                destination_rel=destination_rel,
                title=str(item.get("title", "")),
                section=str(item.get("section", "")),
                publish=publish,
                source_sha256=item.get("source_sha256"),
                source_size=item.get("source_size"),
                protected_spans=tuple(spans),
                redaction_profile=str(item.get("redaction_profile", "")),
            )
        )
    if not notes:
        raise PublishError("manifest contains no notes")
    return Config(
        manifest_path=manifest_path,
        repo_root=repo_root,
        vault_root=vault_root,
        source_root=source_root,
        staging_root=staging_root,
        asset_root=asset_root,
        materialization_ready=raw.get("materialization_ready") is True,
        notes=tuple(notes),
    )


def manifest_source_path(config: Config, note: ManifestNote) -> Path:
    """Resolve a canonical source or one explicitly approved rename alias."""
    existing: List[Path] = []
    for rel in (note.source_rel,) + note.source_aliases:
        candidate = (config.source_root / Path(rel)).resolve()
        if not within(candidate, config.source_root):
            raise PublishError("source path escapes source root")
        if candidate.exists():
            if candidate.is_symlink() or not candidate.is_file():
                raise PublishError("manifest source is not a regular file")
            existing.append(candidate)
    if not existing:
        raise PublishError(f"manifest source is missing; note={note.note_id}")
    if len(existing) > 1:
        raise PublishError(f"canonical source and rename alias both exist; note={note.note_id}")
    return existing[0]


def first_heading(text: str) -> Optional[str]:
    match = HEADING_RE.search(text)
    return clean_heading(match.group(2)) if match else None


def clean_heading(value: str) -> str:
    value = re.sub(r"`([^`]*)`", r"\1", value.strip())
    value = re.sub(r"!?(?:\[([^]]*)\]\([^)]*\))", r"\1", value)
    value = re.sub(r"[*_~]", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def collect_vault(config: Config) -> Tuple[List[NoteFile], List[Path]]:
    notes: List[NoteFile] = []
    assets: List[Path] = []
    for path in sorted(config.vault_root.rglob("*")):
        if not path.is_file() or path.is_symlink() or any(part.startswith(".") for part in path.relative_to(config.vault_root).parts):
            continue
        rel = PurePosixPath(path.relative_to(config.vault_root).as_posix())
        if path.suffix.casefold() == ".md":
            text = path.read_text(encoding="utf-8")
            notes.append(NoteFile(path=path, rel=rel, text=text, first_heading=first_heading(text)))
        elif path.suffix.casefold() in IMAGE_EXTENSIONS:
            assets.append(path)
    return notes, assets


def add_index(index: Dict[str, List[object]], key: str, value: object) -> None:
    normalized = normalize_key(key)
    if normalized:
        index.setdefault(normalized, []).append(value)


def build_note_index(notes: Iterable[NoteFile]) -> Dict[str, List[NoteFile]]:
    index: Dict[str, List[NoteFile]] = {}
    for note in notes:
        no_suffix = note.rel.with_suffix("")
        add_index(index, str(no_suffix), note)
        add_index(index, no_suffix.name, note)
        if note.first_heading:
            add_index(index, note.first_heading, note)
    return index


def build_asset_index(vault_root: Path, assets: Iterable[Path]) -> Dict[str, List[Path]]:
    index: Dict[str, List[Path]] = {}
    for asset in assets:
        rel = asset.relative_to(vault_root).as_posix()
        add_index(index, rel, asset)
        add_index(index, asset.name, asset)
    return index


def unique(candidates: Iterable[object], *, reason: str) -> object:
    by_path = {str(getattr(item, "path", item)): item for item in candidates}
    if not by_path:
        raise PublishError(f"unresolved {reason}")
    if len(by_path) > 1:
        raise PublishError(f"ambiguous {reason}")
    return next(iter(by_path.values()))


def resolve_note(
    target: str,
    current: NoteFile,
    vault_root: Path,
    index: Mapping[str, List[NoteFile]],
) -> NoteFile:
    value = target.strip().replace("\\", "/")
    if not value:
        return current
    if value.casefold().endswith(".md"):
        value = value[:-3]
    requested = PurePosixPath(value.lstrip("/"))
    exact_paths: List[Path] = []
    if not value.startswith("/"):
        exact_paths.append((current.path.parent / Path(value)).with_suffix(".md").resolve())
    exact_paths.append((vault_root / Path(requested)).with_suffix(".md").resolve())
    for exact in exact_paths:
        if within(exact, vault_root) and exact.is_file():
            for candidates in index.values():
                for note in candidates:
                    if note.path == exact:
                        return note
    key = normalize_key(str(requested))
    direct = index.get(key, [])
    if direct:
        return unique(direct, reason="note link")  # type: ignore[return-value]
    if len(requested.parts) > 1:
        suffix = "/".join(requested.parts).casefold()
        matches = [
            note
            for values in index.values()
            for note in values
            if str(note.rel.with_suffix("")).casefold().endswith(suffix)
        ]
        return unique(matches, reason="note link")  # type: ignore[return-value]
    return unique(index.get(normalize_key(requested.name), []), reason="note link")  # type: ignore[return-value]


def resolve_asset(
    target: str,
    current: NoteFile,
    vault_root: Path,
    index: Mapping[str, List[Path]],
) -> Path:
    value = target.strip().replace("\\", "/")
    requested = PurePosixPath(value.lstrip("/"))
    exact_paths: List[Path] = []
    if not value.startswith("/"):
        exact_paths.append((current.path.parent / Path(value)).resolve())
    exact_paths.append((vault_root / Path(requested)).resolve())
    for exact in exact_paths:
        if within(exact, vault_root) and exact.is_file() and not exact.is_symlink():
            return exact
    direct = index.get(normalize_key(str(requested)), [])
    if direct:
        return unique(direct, reason="asset embed")  # type: ignore[return-value]
    if len(requested.parts) > 1:
        suffix = "/".join(requested.parts).casefold()
        matches = [
            path
            for values in index.values()
            for path in values
            if path.relative_to(vault_root).as_posix().casefold().endswith(suffix)
        ]
        return unique(matches, reason="asset embed")  # type: ignore[return-value]
    return unique(index.get(normalize_key(requested.name), []), reason="asset embed")  # type: ignore[return-value]


def parse_link(raw: str) -> LinkParts:
    body = raw.strip()
    alias: Optional[str] = None
    escaped_pipe = re.search(r"(?<!\\)\||\\\|", body)
    if escaped_pipe:
        body, alias = body[: escaped_pipe.start()], body[escaped_pipe.end() :]
        alias = alias.strip() or None
    body = body.replace("\\|", "|").strip()
    target = body
    heading: Optional[str] = None
    block_id: Optional[str] = None
    if "#" in body:
        target, fragment = body.split("#", 1)
        fragment = fragment.strip()
        if fragment.startswith("^"):
            block_id = fragment[1:].strip() or None
        elif "^" in fragment:
            heading_raw, block_raw = fragment.rsplit("^", 1)
            heading = heading_raw.strip() or None
            block_id = block_raw.strip() or None
        else:
            heading = fragment or None
    if block_id and not re.fullmatch(r"[A-Za-z0-9_-]+", block_id):
        raise PublishError("invalid block id in wikilink")
    return LinkParts(target=target.strip(), heading=heading, block_id=block_id, alias=alias)


def line_offsets(text: str) -> List[int]:
    offsets = [0]
    offsets.extend(match.end() for match in re.finditer("\n", text))
    return offsets


def offset_for_line(offsets: Sequence[int], line: int, text_len: int) -> int:
    return offsets[line - 1] if line <= len(offsets) else text_len


def protected_spans(text: str, explicit: Sequence[ProtectedSpan]) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    offsets = line_offsets(text)
    for span in explicit:
        start = offset_for_line(offsets, span.start_line, len(text))
        end = offset_for_line(offsets, span.end_line + 1, len(text))
        chunk = text[start:end].encode("utf-8")
        if span.expected_sha256 and sha256_bytes(chunk) != span.expected_sha256:
            raise PublishError("protected source span hash mismatch")
        spans.append((start, end))

    if text.startswith("---"):
        match = re.match(r"\A---[ \t]*\r?\n.*?^---[ \t]*\r?(?:\n|$)", text, re.M | re.S)
        if match:
            spans.append(match.span())
    spans.extend(match.span() for match in re.finditer(r"<!--[\s\S]*?-->", text))
    spans.extend(match.span() for match in re.finditer(r"(?ms)^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?^ {0,3}\1[ \t]*$", text))
    spans.extend(match.span() for match in re.finditer(r"\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]", text))
    spans.extend(match.span() for match in re.finditer(r"(?<!\\)\$(?!\$)(?:\\.|[^\n$])*?(?<!\\)\$", text))
    spans.extend(match.span() for match in re.finditer(r"\\\((?:\\.|[^\n])*?\\\)", text))
    spans.extend(match.span() for match in re.finditer(r"(`+)(?!`)(?:[^`]|`(?!\1))*?\1", text))
    spans.sort()
    merged: List[Tuple[int, int]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def overlaps(start: int, end: int, spans: Sequence[Tuple[int, int]]) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def occurrences_for(note: ManifestNote, source: NoteFile) -> List[LinkOccurrence]:
    protected = protected_spans(source.text, note.protected_spans)
    offsets = line_offsets(source.text)
    found: List[LinkOccurrence] = []
    for match in WIKILINK_RE.finditer(source.text):
        if overlaps(match.start(), match.end(), protected):
            continue
        line = 1
        # A short, dependency-free bisect.
        lo, hi = 0, len(offsets)
        while lo < hi:
            mid = (lo + hi) // 2
            if offsets[mid] <= match.start():
                lo = mid + 1
            else:
                hi = mid
        line = lo
        try:
            parts = parse_link(match.group(2))
        except PublishError as exc:
            raise PublishError(
                f"{exc}; note={note.note_id} line={line} target_fingerprint={target_fingerprint(match.group(2))}"
            ) from None
        found.append(
            LinkOccurrence(
                start=match.start(),
                end=match.end(),
                line=line,
                is_embed=match.group(1) == "!",
                raw=match.group(0),
                parts=parts,
            )
        )
    return found


def heading_map(text: str, spans: Sequence[Tuple[int, int]]) -> Dict[str, List[Tuple[int, str]]]:
    headings: Dict[str, List[Tuple[int, str]]] = {}
    for match in HEADING_RE.finditer(text):
        # Inline code is valid inside a Markdown heading. Only suppress a
        # heading when its line begins inside a protected block/front matter.
        if overlaps(match.start(), match.start() + 1, spans):
            continue
        cleaned = clean_heading(match.group(2))
        headings.setdefault(normalize_key(cleaned), []).append((match.start(), cleaned))
    return headings


def block_map(text: str, spans: Sequence[Tuple[int, int]]) -> Dict[str, List[int]]:
    blocks: Dict[str, List[int]] = {}
    for line_match in re.finditer(r"^.*$", text, re.M):
        match = BLOCK_ID_RE.search(line_match.group(0))
        if match:
            marker_start = line_match.start() + match.start()
            marker_end = line_match.start() + match.end()
            if not overlaps(marker_start, marker_end, spans):
                blocks.setdefault(match.group(1), []).append(marker_start)
    return blocks


def heading_anchor(heading: str) -> str:
    digest = target_fingerprint(normalize_key(heading))
    return f"obsidian-heading-{digest}"


def block_anchor(block_id: str) -> str:
    return f"obsidian-block-{block_id}"


def asset_destination(asset_root: PurePosixPath, source: Path, data: bytes) -> PurePosixPath:
    stem = re.sub(r"[^\w.-]+", "-", source.stem, flags=re.UNICODE).strip("-.") or "asset"
    filename = f"{sha256_bytes(data)[:16]}-{stem}{source.suffix.casefold()}"
    return asset_root / filename


def markdown_href(from_rel: PurePosixPath, to_rel: PurePosixPath, fragment: str = "") -> str:
    rel = os.path.relpath(str(to_rel), str(from_rel.parent)).replace(os.sep, "/")
    return quote(rel, safe="/._-") + fragment


def escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")


def image_dimensions(alias: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not alias:
        return None, None
    match = re.fullmatch(r"\s*(\d+)\s*(?:[xX×]\s*(\d+)\s*)?", alias)
    if not match:
        raise PublishError("image embed suffix must be numeric dimensions")
    return match.group(1), match.group(2)


def resolve_plan(config: Config, *, require_hashes: bool = True) -> Plan:
    vault_notes, vault_assets = collect_vault(config)
    note_index = build_note_index(vault_notes)
    asset_index = build_asset_index(config.vault_root, vault_assets)
    source_by_path = {note.path: note for note in vault_notes}
    manifest_by_source: Dict[Path, ManifestNote] = {}
    planned: List[PlannedNote] = []

    for item in config.notes:
        path = manifest_source_path(config, item)
        data = path.read_bytes()
        if require_hashes and (not item.source_sha256 or item.source_size is None):
            raise PublishError("manifest source inventory is incomplete; run --write-source-hashes")
        if item.source_sha256 and sha256_bytes(data) != item.source_sha256:
            raise PublishError(f"source hash mismatch; note={item.note_id}")
        if item.source_size is not None and len(data) != item.source_size:
            raise PublishError(f"source size mismatch; note={item.note_id}")
        source = source_by_path.get(path)
        if source is None:
            raise PublishError(f"source was not indexed; note={item.note_id}")
        manifest_by_source[path] = item
        if item.publish:
            if len(data) == 0:
                raise PublishError(f"published note is empty; note={item.note_id}")
            planned.append(PlannedNote(item, source, occurrences_for(item, source)))

    asset_sources: Dict[PurePosixPath, Path] = {}
    referenced_headings: Dict[Path, Set[str]] = {}
    referenced_blocks: Dict[Path, Set[str]] = {}
    for planned_note in planned:
        for occurrence in planned_note.occurrences:
            try:
                if occurrence.is_embed:
                    suffix = Path(occurrence.parts.target).suffix.casefold()
                    if suffix not in IMAGE_EXTENSIONS:
                        raise PublishError("embedded note/transclusion is unsupported")
                    if occurrence.parts.heading or occurrence.parts.block_id:
                        raise PublishError("image embeds cannot contain heading or block fragments")
                    width, height = image_dimensions(occurrence.parts.alias)
                    del width, height
                    asset = resolve_asset(
                        occurrence.parts.target,
                        planned_note.source,
                        config.vault_root,
                        asset_index,
                    )
                    data = asset.read_bytes()
                    destination = asset_destination(config.asset_root, asset, data)
                    previous = asset_sources.get(destination)
                    if previous and previous.read_bytes() != data:
                        raise PublishError("asset destination collision")
                    asset_sources[destination] = asset
                    occurrence.asset_source = asset
                    occurrence.asset_destination = destination
                    continue

                target_source = resolve_note(
                    occurrence.parts.target,
                    planned_note.source,
                    config.vault_root,
                    note_index,
                )
                target_manifest = manifest_by_source.get(target_source.path)
                if not target_manifest or not target_manifest.publish:
                    raise PublishError("note link target is not published by this manifest")
                occurrence.note_target = target_manifest
                target_spans = protected_spans(target_source.text, target_manifest.protected_spans)
                if occurrence.parts.heading:
                    matches = heading_map(target_source.text, target_spans).get(
                        normalize_key(clean_heading(occurrence.parts.heading)), []
                    )
                    if not matches:
                        raise PublishError("missing heading anchor")
                    if len(matches) > 1:
                        raise PublishError("ambiguous duplicate heading anchor")
                    occurrence.heading_anchor = heading_anchor(matches[0][1])
                    referenced_headings.setdefault(target_source.path, set()).add(matches[0][1])
                if occurrence.parts.block_id:
                    blocks = block_map(target_source.text, target_spans).get(occurrence.parts.block_id, [])
                    if not blocks:
                        raise PublishError("missing block anchor")
                    if len(blocks) > 1:
                        raise PublishError("ambiguous duplicate block anchor")
                    occurrence.block_anchor = block_anchor(occurrence.parts.block_id)
                    referenced_blocks.setdefault(target_source.path, set()).add(occurrence.parts.block_id)
            except PublishError as exc:
                raise PublishError(
                    f"{exc}; note={planned_note.manifest.note_id} line={occurrence.line} "
                    f"target_fingerprint={target_fingerprint(occurrence.parts.target)}"
                ) from None

    outputs: Dict[PurePosixPath, bytes] = {}
    highlight_count = 0
    format_fix_count = 0
    for planned_note in planned:
        assert planned_note.manifest.destination_rel is not None
        converted, changed_highlights, changed_format = convert_note(
            planned_note,
            referenced_headings.get(planned_note.source.path, set()),
            referenced_blocks.get(planned_note.source.path, set()),
        )
        highlight_count += changed_highlights
        format_fix_count += changed_format
        destination = planned_note.manifest.destination_rel
        if destination in outputs:
            raise PublishError("destination collision while rendering notes")
        outputs[destination] = converted.encode("utf-8")
    for destination, asset in asset_sources.items():
        data = asset.read_bytes()
        existing = outputs.get(destination)
        if existing is not None and existing != data:
            raise PublishError("note/asset destination collision")
        outputs[destination] = data
    return Plan(
        config=config,
        notes=planned,
        outputs=outputs,
        asset_sources=asset_sources,
        link_count=sum(len(item.occurrences) for item in planned),
        highlight_count=highlight_count,
        format_fix_count=format_fix_count,
    )


def render_occurrence(planned: PlannedNote, occurrence: LinkOccurrence) -> str:
    assert planned.manifest.destination_rel is not None
    if occurrence.is_embed:
        assert occurrence.asset_destination is not None
        width, height = image_dimensions(occurrence.parts.alias)
        href = markdown_href(planned.manifest.destination_rel, occurrence.asset_destination)
        alt = escape_label(Path(occurrence.parts.target).stem)
        attrs: List[str] = []
        if width:
            attrs.append(f'width="{width}"')
        if height:
            attrs.append(f'height="{height}"')
        attrs.extend(
            f".{class_name}"
            for class_name in IMAGE_PRESENTATION_CLASSES.get(
                occurrence.asset_destination.name, ()
            )
        )
        suffix = "{" + " ".join(attrs) + "}" if attrs else ""
        return f"![{alt}]({href}){suffix}"
    assert occurrence.note_target is not None
    assert occurrence.note_target.destination_rel is not None
    fragment = ""
    if occurrence.block_anchor:
        fragment = f"#{occurrence.block_anchor}"
    elif occurrence.heading_anchor:
        fragment = f"#{occurrence.heading_anchor}"
    if occurrence.parts.alias:
        label = occurrence.parts.alias
    elif occurrence.parts.heading:
        label = occurrence.parts.heading
    elif occurrence.parts.target:
        label = PurePosixPath(occurrence.parts.target).stem
    else:
        label = occurrence.note_target.title
    href = markdown_href(
        planned.manifest.destination_rel,
        occurrence.note_target.destination_rel,
        fragment,
    )
    if occurrence.note_target.destination_rel == planned.manifest.destination_rel and fragment:
        href = fragment
    return f"[{escape_label(label)}]({href})"


def convert_unprotected_highlights(
    text: str, spans: Sequence[Tuple[int, int]]
) -> Tuple[str, int]:
    matches = [match for match in HIGHLIGHT_RE.finditer(text) if not overlaps(match.start(), match.end(), spans)]
    for match in reversed(matches):
        text = text[: match.start()] + f"<mark>{match.group(1)}</mark>" + text[match.end() :]
    return text, len(matches)


def inject_anchors(
    text: str,
    headings: Set[str],
    blocks: Set[str],
    spans: Sequence[Tuple[int, int]],
) -> str:
    output: List[str] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        bare = line.rstrip("\r\n")
        newline = line[len(bare) :]
        heading = HEADING_RE.fullmatch(bare)
        if heading and not overlaps(offset, offset + 1, spans):
            cleaned = clean_heading(heading.group(2))
            if cleaned in headings:
                output.append(f'<a id="{heading_anchor(cleaned)}"></a>\n')
        block = BLOCK_ID_RE.search(bare)
        marker_start = offset + block.start() if block else -1
        marker_end = offset + block.end() if block else -1
        if (
            block
            and block.group(1) in blocks
            and not overlaps(marker_start, marker_end, spans)
        ):
            bare = bare[: block.start()].rstrip()
            bare += f' <a id="{block_anchor(block.group(1))}"></a>'
        output.append(bare + newline)
        offset += len(line)
    return "".join(output)


def normalize_obsidian_blocks(text: str) -> Tuple[str, int]:
    """Add block boundaries that Obsidian accepts but Python-Markdown requires.

    Obsidian treats an image embed as a standalone block and terminates a table
    when the following line no longer resembles a row.  Python-Markdown is more
    conservative: an image immediately followed by a list can remain one
    paragraph, while a non-empty line immediately after a table can be consumed
    as a one-cell row.  Insert only the missing blank lines, and never touch
    fenced code blocks.
    """

    had_trailing_newline = text.endswith("\n")
    source_lines = text.splitlines()
    output: List[str] = []
    changes = 0
    fence_char: Optional[str] = None
    fence_length = 0
    in_table = False
    loose_list_indent: Optional[int] = None

    def is_table_row(value: str) -> bool:
        stripped_value = value.strip()
        # The published Lab Projects tables consistently use outer pipes.
        # Requiring both avoids treating prose containing an inline-code `|`
        # as another table row.
        return stripped_value.startswith("|") and stripped_value.endswith("|")

    for line in source_lines:
        if fence_char is None:
            leading_tabs = re.match(r"^\t+", line)
            if leading_tabs:
                line = " " * (4 * len(leading_tabs.group(0))) + line[leading_tabs.end() :]
                changes += 1
        fence = FENCE_RE.match(line)
        if fence_char is not None:
            output.append(line)
            marker = fence.group(1) if fence else ""
            if marker and marker[0] == fence_char and len(marker) >= fence_length:
                fence_char = None
                fence_length = 0
            continue
        if fence:
            marker = fence.group(1)
            fence_char = marker[0]
            fence_length = len(marker)
            output.append(line)
            continue

        stripped = line.strip()
        current_indent = len(line) - len(line.lstrip(" "))
        if loose_list_indent is not None and stripped and current_indent < loose_list_indent:
            loose_list_indent = None
        if in_table:
            if not stripped:
                in_table = False
            elif not is_table_row(line):
                if output and output[-1].strip():
                    output.append("")
                    changes += 1
                in_table = False

        if TABLE_SEPARATOR_RE.match(line):
            # The preceding line is the table header.  Separate the table from
            # any paragraph or callout directly above it.
            if len(output) >= 2 and output[-2].strip():
                output.insert(len(output) - 1, "")
                changes += 1
            in_table = True

        image_followed_by_list = (
            LIST_ITEM_RE.match(line)
            and output
            and IMAGE_ONLY_RE.match(output[-1])
        )
        if image_followed_by_list:
            output.append("")
            changes += 1
            # Nested image/list sequences are parsed inconsistently by the
            # glightbox + nl2br extension stack unless the sibling list is
            # explicitly loose. Keep top-level lists compact.
            if current_indent >= 4:
                loose_list_indent = current_indent
        elif (
            loose_list_indent is not None
            and current_indent == loose_list_indent
            and LIST_ITEM_RE.match(line)
            and output
            and output[-1].strip()
        ):
            output.append("")
            changes += 1

        output.append(line)

    normalized = "\n".join(output)
    if had_trailing_newline:
        normalized += "\n"
    return normalized, changes


def convert_note(
    planned: PlannedNote, headings: Set[str], blocks: Set[str]
) -> Tuple[str, int, int]:
    text = planned.source.text
    for occurrence in reversed(planned.occurrences):
        text = text[: occurrence.start] + render_occurrence(planned, occurrence) + text[occurrence.end :]
    # Recompute built-in protection after link lengths change. Explicit spans are
    # line-based and therefore remain stable unless a link expands within them,
    # which is prohibited by occurrences_for().
    spans = protected_spans(text, planned.manifest.protected_spans)
    text, highlight_count = convert_unprotected_highlights(text, spans)
    spans = protected_spans(text, planned.manifest.protected_spans)
    text = inject_anchors(text, headings, blocks, spans)
    text, format_fix_count = normalize_obsidian_blocks(text)
    return text, highlight_count, format_fix_count


def report_bytes(plan: Plan) -> bytes:
    report = {
        "schema_version": 1,
        "mode": "staged",
        "published_notes": len(plan.notes),
        "unique_assets": len(plan.asset_sources),
        "wikilinks": plan.link_count,
        "highlights": plan.highlight_count,
        "format_fixes": plan.format_fix_count,
        "outputs": [
            {"path": str(path), "sha256": sha256_bytes(data), "size": len(data)}
            for path, data in sorted(plan.outputs.items(), key=lambda item: str(item[0]))
        ],
    }
    return (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def materialize(plan: Plan) -> None:
    if not plan.config.materialization_ready:
        raise PublishError(
            "manifest is not approved for materialization; complete in-memory redaction first"
        )
    staging = plan.config.staging_root
    if staging.exists() and staging.is_symlink():
        raise PublishError("staging root must not be a symbolic link")
    outputs = dict(plan.outputs)
    outputs[PurePosixPath("publish-report.json")] = report_bytes(plan)
    planned_paths = {Path(path) for path in outputs}
    if staging.exists():
        if any(path.is_symlink() for path in staging.rglob("*")):
            raise PublishError("staging root contains symbolic links; refusing write")
        extras = {
            path.relative_to(staging)
            for path in staging.rglob("*")
            if path.is_file() and path.relative_to(staging) not in planned_paths
        }
        if extras:
            raise PublishError("staging root contains unplanned files; refusing overwrite")
        for rel, data in outputs.items():
            destination = staging / Path(rel)
            if destination.exists() and destination.read_bytes() != data:
                raise PublishError("staged output differs; refusing overwrite")
    staging.mkdir(parents=True, exist_ok=True)
    for rel, data in sorted(outputs.items(), key=lambda item: str(item[0])):
        destination = staging / Path(rel)
        if not within(destination, staging):
            raise PublishError("staged destination escapes staging root")
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as handle:
            handle.write(data)


def write_source_hashes(config: Config) -> None:
    current_bytes = config.manifest_path.read_bytes()
    raw = json.loads(current_bytes.decode("utf-8"))
    inventory: Dict[str, Tuple[str, int]] = {}
    for item in config.notes:
        data = manifest_source_path(config, item).read_bytes()
        inventory[item.note_id] = (sha256_bytes(data), len(data))
    for item in raw["notes"]:
        digest, size = inventory[item["id"]]
        item["source_sha256"] = digest
        item["source_size"] = size
    serialized = (json.dumps(raw, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if serialized == current_bytes:
        return
    try:
        fd, temporary = tempfile.mkstemp(
            prefix="manifest-", suffix=".json", dir=str(config.manifest_path.parent)
        )
    except OSError as exc:
        raise PublishError("unable to update manifest source inventory (write permission denied)") from exc
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(serialized)
        os.replace(temporary, config.manifest_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def print_summary(plan: Plan, mode: str) -> None:
    print(f"Mode: {mode}")
    print(f"Published notes: {len(plan.notes)}")
    print(f"Unique referenced assets: {len(plan.asset_sources)}")
    print(f"Converted wikilinks/embeds: {plan.link_count}")
    print(f"Converted highlights: {plan.highlight_count}")
    print(f"Normalized Markdown block boundaries: {plan.format_fix_count}")
    print(f"Planned output files: {len(plan.outputs)}")
    print("Validation: passed (no source text or credential values logged)")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        config = load_config(
            Path(args.manifest),
            vault_override=args.vault_root,
            staging_override=args.staging_root,
        )
        if args.write_source_hashes:
            write_source_hashes(config)
            print(f"Updated source inventory for {len(config.notes)} manifest entries.")
            return 0
        plan = resolve_plan(config)
        if args.apply:
            materialize(plan)
            print_summary(plan, "apply-to-isolated-staging")
        else:
            print_summary(plan, "dry-run")
        return 0
    except PublishError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception:
        # Avoid source snippets and third-party exception payloads in normal logs.
        print("ERROR: unexpected converter failure (details intentionally suppressed)", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
