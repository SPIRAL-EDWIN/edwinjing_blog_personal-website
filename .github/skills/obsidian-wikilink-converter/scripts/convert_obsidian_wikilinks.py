#!/usr/bin/env python3
"""Convert Obsidian wikilinks to web-stable HTML/Markdown links.

Compatibility/debugging utility for existing docs trees. Formal website
publication uses ``tools/publish_obsidian_notes.py``.

Examples:
  python convert_obsidian_wikilinks.py --docs-root docs --format html --dry-run
  python convert_obsidian_wikilinks.py --docs-root docs --format html --in-place
  python convert_obsidian_wikilinks.py --docs-root docs --file docs/notes/a.md --format markdown --in-place
"""

from __future__ import annotations

import argparse
import os
import pathlib
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.publish_lab_projects import overlaps, protected_spans, target_fingerprint

WIKILINK_RE = re.compile(r"(!?)\[\[([^\]]+)\]\]")
BLOCK_ID_LINE_RE = re.compile(r"^(?P<prefix>.*?)(?:\s+|\s*<br>\s*)\^(?P<id>[A-Za-z0-9_-]+)\s*$")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.*)$")

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".bmp",
    ".avif",
}


@dataclass
class LinkParts:
    target: str
    heading: Optional[str]
    block_id: Optional[str]
    alias: Optional[str]


class ConversionError(RuntimeError):
    """A deterministic conversion failure safe to print."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Obsidian wikilinks")
    parser.add_argument("--docs-root", default="docs", help="Root folder containing markdown files")
    parser.add_argument("--file", action="append", default=[], help="Specific markdown file(s) to convert")
    parser.add_argument("--format", choices=["html", "markdown"], default="html", help="Output format")
    parser.add_argument("--in-place", action="store_true", help="Write changes back to files")
    parser.add_argument("--dry-run", action="store_true", help="Preview only; do not write")
    parser.add_argument(
        "--inject-block-anchors",
        action="store_true",
        default=True,
        help="Convert trailing Obsidian block IDs (^abc123) to explicit HTML anchors",
    )
    parser.add_argument(
        "--no-inject-block-anchors",
        action="store_false",
        dest="inject_block_anchors",
        help="Do not inject explicit anchors for trailing Obsidian block IDs",
    )
    return parser.parse_args()


def to_posix(p: pathlib.Path) -> str:
    return p.as_posix()


def slugify_heading(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"`([^`]*)`", r"\1", s)
    s = re.sub(r"[\[\](){}<>]", "", s)
    s = re.sub(r"[^\w\-\s\u4e00-\u9fff]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def parse_link_parts(raw: str) -> LinkParts:
    alias = None
    body = raw.strip()

    if "|" in body:
        body, alias = body.split("|", 1)
        body = body.strip()
        alias = alias.strip() or None

    target = body
    heading = None
    block_id = None

    if "#" in body:
        target, frag = body.split("#", 1)
        target = target.strip()
        frag = frag.strip()

        if frag.startswith("^"):
            block_id = frag[1:].strip() or None
        elif "^" in frag:
            h, b = frag.split("^", 1)
            heading = h.strip() or None
            block_id = b.strip() or None
        else:
            heading = frag or None

    return LinkParts(target=target.strip(), heading=heading, block_id=block_id, alias=alias)


def collect_md_files(docs_root: pathlib.Path) -> List[pathlib.Path]:
    return sorted([p for p in docs_root.rglob("*.md") if p.is_file()])


def collect_image_files(docs_root: pathlib.Path) -> List[pathlib.Path]:
    files: List[pathlib.Path] = []
    for p in docs_root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            files.append(p)
    return sorted(files)


def first_heading(path: pathlib.Path) -> Optional[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None

    for line in text.splitlines():
        m = HEADING_RE.match(line)
        if m:
            return m.group(1).strip()
    return None


def add_index(index: Dict[str, List[pathlib.Path]], key: str, path: pathlib.Path) -> None:
    bucket = index.setdefault(key, [])
    if path not in bucket:
        bucket.append(path)


def build_note_index(docs_root: pathlib.Path) -> Dict[str, List[pathlib.Path]]:
    index: Dict[str, List[pathlib.Path]] = {}
    for p in collect_md_files(docs_root):
        rel = p.relative_to(docs_root)
        rel_no_ext = rel.with_suffix("")
        stem = p.stem
        title = first_heading(p)

        candidates = {
            stem,
            stem.lower(),
            to_posix(rel_no_ext),
            to_posix(rel_no_ext).lower(),
            to_posix(pathlib.Path(stem)),
            to_posix(pathlib.Path(stem)).lower(),
        }
        if title:
            candidates.add(title)
            candidates.add(title.lower())

        for key in candidates:
            add_index(index, key, p)
    return index


def build_image_index(docs_root: pathlib.Path) -> Dict[str, List[pathlib.Path]]:
    index: Dict[str, List[pathlib.Path]] = {}
    for p in collect_image_files(docs_root):
        rel = p.relative_to(docs_root)
        candidates = {
            p.name,
            p.name.lower(),
            to_posix(rel),
            to_posix(rel).lower(),
        }
        for key in candidates:
            add_index(index, key, p)
    return index


def unique_path(candidates: List[pathlib.Path], kind: str) -> Optional[pathlib.Path]:
    unique = sorted(set(candidates))
    if len(unique) > 1:
        raise ConversionError(f"ambiguous {kind}")
    return unique[0] if unique else None


def resolve_note_path(
    note_index: Dict[str, List[pathlib.Path]],
    current_file: pathlib.Path,
    docs_root: pathlib.Path,
    target: str,
) -> Optional[pathlib.Path]:
    key = target.strip()
    if not key:
        return current_file

    # Normalize .md suffix in query keys.
    key = key[:-3] if key.lower().endswith(".md") else key

    # Try relative resolution from current file.
    candidate = (current_file.parent / f"{key}.md").resolve()
    try:
        candidate_rel = candidate.relative_to(docs_root.resolve())
        if (docs_root / candidate_rel).exists():
            return docs_root / candidate_rel
    except ValueError:
        pass

    direct = note_index.get(key, []) + note_index.get(key.lower(), [])
    return unique_path(direct, "note link")


def resolve_image_path(
    image_index: Dict[str, List[pathlib.Path]],
    current_file: pathlib.Path,
    docs_root: pathlib.Path,
    target: str,
) -> Optional[pathlib.Path]:
    key = target.strip()
    rel_try = (current_file.parent / key).resolve()
    try:
        rel = rel_try.relative_to(docs_root.resolve())
        if (docs_root / rel).exists():
            return docs_root / rel
    except ValueError:
        pass

    direct = image_index.get(key, []) + image_index.get(key.lower(), [])
    return unique_path(direct, "image embed")


def relative_href(from_file: pathlib.Path, to_file: pathlib.Path) -> str:
    rel = pathlib.Path(os.path.relpath(to_file, from_file.parent))
    return rel.as_posix()


def make_fragment(heading: Optional[str], block_id: Optional[str]) -> str:
    if block_id:
        return f"#{block_id}"
    if heading:
        slug = slugify_heading(heading)
        if slug:
            return f"#{slug}"
    return ""


def build_link(href: str, text: str, output_format: str) -> str:
    if output_format == "markdown":
        return f"[{text}]({href})"
    safe_text = text.replace("\"", "&quot;")
    safe_href = href.replace('"', "%22")
    return f"<a href=\"{safe_href}\">{safe_text}</a>"


def build_image(src: str, alt: str, output_format: str) -> str:
    if output_format == "markdown":
        return f"![{alt}]({src})"
    safe_alt = alt.replace('"', "&quot;")
    safe_src = src.replace('"', "%22")
    return f"<img src=\"{safe_src}\" alt=\"{safe_alt}\" loading=\"lazy\">"


def render_link(
    raw: str,
    is_embed: bool,
    current_file: pathlib.Path,
    docs_root: pathlib.Path,
    note_index: Dict[str, List[pathlib.Path]],
    image_index: Dict[str, List[pathlib.Path]],
    output_format: str,
    unresolved: List[str],
) -> str:
    parts = parse_link_parts(raw)

    if is_embed:
        img_target = resolve_image_path(image_index, current_file, docs_root, parts.target)
        if img_target:
            src = relative_href(current_file, img_target)
            alt = parts.alias or pathlib.Path(parts.target).stem or "image"
            return build_image(src, alt, output_format)

    note_target = resolve_note_path(note_index, current_file, docs_root, parts.target)
    if note_target is None:
        unresolved.append(raw)
        return f"![[{raw}]]" if is_embed else f"[[{raw}]]"

    text = parts.alias or parts.heading or pathlib.Path(parts.target).name or note_target.stem

    href = relative_href(current_file, note_target)
    if note_target.suffix.lower() == ".md":
        href = href[:-3] + ".html"
    href += make_fragment(parts.heading, parts.block_id)

    return build_link(href, text, output_format)


def inject_block_anchors(text: str) -> str:
    out_lines: List[str] = []
    for line in text.splitlines():
        m = BLOCK_ID_LINE_RE.match(line)
        if m:
            prefix = m.group("prefix").rstrip()
            block_id = m.group("id")
            line = f"{prefix} <a id=\"{block_id}\"></a>"
        out_lines.append(line)
    if text.endswith("\n"):
        return "\n".join(out_lines) + "\n"
    return "\n".join(out_lines)


def convert_file(
    file_path: pathlib.Path,
    docs_root: pathlib.Path,
    note_index: Dict[str, List[pathlib.Path]],
    image_index: Dict[str, List[pathlib.Path]],
    output_format: str,
    inject_anchors: bool,
) -> Tuple[str, int, List[str]]:
    text = file_path.read_text(encoding="utf-8")
    unresolved: List[str] = []
    count = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        bang = match.group(1)
        raw = match.group(2)
        rendered = render_link(
            raw=raw,
            is_embed=(bang == "!"),
            current_file=file_path,
            docs_root=docs_root,
            note_index=note_index,
            image_index=image_index,
            output_format=output_format,
            unresolved=unresolved,
        )
        count += 1
        return rendered

    spans = protected_spans(text, ())
    matches = [
        match
        for match in WIKILINK_RE.finditer(text)
        if not overlaps(match.start(), match.end(), spans)
    ]
    converted = text
    for match in reversed(matches):
        converted = converted[: match.start()] + repl(match) + converted[match.end() :]

    if inject_anchors:
        converted = inject_block_anchors(converted)

    return converted, count, unresolved


def main() -> int:
    args = parse_args()

    if args.in_place and args.dry_run:
        print("Cannot use --in-place and --dry-run together.", file=sys.stderr)
        return 2

    docs_root = pathlib.Path(args.docs_root).resolve()
    if not docs_root.exists():
        print(f"docs root not found: {docs_root}", file=sys.stderr)
        return 2

    note_index = build_note_index(docs_root)
    image_index = build_image_index(docs_root)

    if args.file:
        targets = [pathlib.Path(p).resolve() for p in args.file]
    else:
        targets = collect_md_files(docs_root)

    total_files = 0
    total_links = 0
    total_changed = 0
    unresolved_total: List[Tuple[pathlib.Path, str]] = []

    for path in targets:
        if not path.exists() or path.suffix.lower() != ".md":
            continue

        total_files += 1
        original = path.read_text(encoding="utf-8")
        try:
            converted, replaced_count, unresolved = convert_file(
                file_path=path,
                docs_root=docs_root,
                note_index=note_index,
                image_index=image_index,
                output_format=args.format,
                inject_anchors=args.inject_block_anchors,
            )
        except ConversionError as exc:
            print(f"ERROR: {exc}; file={path}", file=sys.stderr)
            return 2

        total_links += replaced_count

        if converted != original:
            total_changed += 1
            if args.in_place:
                path.write_text(converted, encoding="utf-8")

        for item in unresolved:
            unresolved_total.append((path, item))

    mode = "in-place" if args.in_place else "dry-run"
    print(f"Mode: {mode}")
    print(f"Scanned files: {total_files}")
    print(f"Matched wikilinks: {total_links}")
    print(f"Changed files: {total_changed}")
    print(f"Unresolved links: {len(unresolved_total)}")

    if unresolved_total:
        print("\\nUnresolved details:")
        for p, raw in unresolved_total[:200]:
            print(f"- {p}: target_fingerprint={target_fingerprint(raw)}")

    return 1 if unresolved_total else 0


if __name__ == "__main__":
    raise SystemExit(main())
