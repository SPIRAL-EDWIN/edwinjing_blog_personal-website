#!/usr/bin/env python3
"""
Normalise converted Obsidian Markdown for MkDocs compatibility.

Two passes are applied in order (both idempotent):

PASS 1 — Leading TAB to 2 spaces
    Obsidian renders a leading ``\\t`` as a 1-step indent and treats it as a
    list-item continuation. Python-Markdown (used by MkDocs) interprets a TAB
    as 4 spaces of indentation, and 4+ spaces inside a list = a CODE BLOCK.
    This causes TAB-indented continuation paragraphs in Obsidian notes to
    render as fenced code in MkDocs. We replace each leading TAB with 2
    spaces (canonical Markdown indent for list-item continuation).

PASS 2 — Blank line before list-start
    Obsidian renders ``paragraph\\n- item`` as a list directly. Standard
    Markdown REQUIRES a blank line between paragraph text and a list start,
    otherwise the ``-`` is read as a literal hyphen and the items are merged
    into the preceding paragraph with ``<br>`` line breaks. We inject one
    blank line before any top-level list-start line (``- ``, ``* ``, ``+ ``,
    or ``N. ``) that lacks one.

Both passes:
    - Skip lines inside fenced code blocks (``` or ~~~).
    - Skip lines that start with ``>`` (blockquote/callout content has its
      own list-handling rules and Material/pymdownx handle it).
    - Preserve any non-leading TABs and other whitespace.
    - Are idempotent: running twice produces identical output.

Usage
-----
    python normalize_tabs.py <file.md> [<file2.md> ...]
    python normalize_tabs.py --dir <directory>          # recursive
    python normalize_tabs.py --check <file.md>          # dry-run, exit 1 if any change needed
    python normalize_tabs.py --skip-tabs <file.md>      # only run list-blank-line pass
    python normalize_tabs.py --skip-lists <file.md>     # only run tab pass
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


FENCE_RE = re.compile(r"^\s*(```|~~~)")
# List-start: ``- ``, ``* ``, ``+ ``, or ``N. `` (digits then dot then space)
# Must be at column 0 (no leading whitespace) — indented lists are
# continuations of an outer list and are not the trigger for blank-line injection.
LIST_START_RE = re.compile(r"^([-*+]|\d+\.) ")
# Heading: 1–6 ``#`` followed by a space
HEADING_RE = re.compile(r"^#{1,6} ")
# Horizontal rule / thematic break (--- ___ ***)
THEMATIC_BREAK_RE = re.compile(r"^[-_*]{3,}\s*$")


# --------------------------------------------------------------------------- #
# Pass 1 — leading TABs → 2 spaces
# --------------------------------------------------------------------------- #
def normalize_leading_tabs(lines: list[str]) -> tuple[list[str], int]:
    """Return (new_lines, changed_count). Idempotent."""
    out: list[str] = []
    in_fence = False
    changed = 0

    for line in lines:
        if FENCE_RE.match(line):
            in_fence = not in_fence
            out.append(line)
            continue

        if in_fence or not line.startswith("\t"):
            out.append(line)
            continue

        # Count leading tabs only; preserve any other internal tabs.
        i = 0
        while i < len(line) and line[i] == "\t":
            i += 1
        new_line = ("  " * i) + line[i:]
        if new_line != line:
            changed += 1
        out.append(new_line)

    return out, changed


# --------------------------------------------------------------------------- #
# Pass 2 — blank line before list-start lines that lack one
# --------------------------------------------------------------------------- #
def ensure_blank_line_before_lists(lines: list[str]) -> tuple[list[str], int]:
    """
    Inject a blank line before each top-level list-start line whose previous
    line is non-blank, non-list, non-heading, non-blockquote, non-code-fence,
    non-thematic-break content (i.e. a regular paragraph).

    Returns (new_lines, insertions_count). Idempotent.
    """
    out: list[str] = []
    in_fence = False
    insertions = 0

    for idx, line in enumerate(lines):
        # Track fence state on lines BEFORE deciding (a fence line itself
        # doesn't trigger anything).
        if FENCE_RE.match(line):
            out.append(line)
            in_fence = not in_fence
            continue

        # Inside a fence: never inject, never modify.
        if in_fence:
            out.append(line)
            continue

        # Only consider TOP-LEVEL list starts. Indented list lines belong
        # to nested lists handled by their parent.
        if not LIST_START_RE.match(line):
            out.append(line)
            continue

        # Look at the last line we already emitted (which represents the
        # previous logical content line in the OUTPUT, accounting for any
        # blank we might have just inserted upstream).
        prev = out[-1] if out else ""

        # Conditions where we do NOT inject a blank line:
        #   1. previous line is blank → already correct
        #   2. previous line is itself a list item → contiguous list, fine
        #   3. previous line is a heading → list after heading is fine
        #   4. previous line is a blockquote/callout (`>`) → its own rules
        #   5. previous line is indented (continuation paragraph) → fine
        #   6. previous line is a fence delimiter → fine
        #   7. previous line is a thematic break (---) → fine
        if not prev.strip():
            out.append(line)
            continue
        if LIST_START_RE.match(prev):
            out.append(line)
            continue
        if HEADING_RE.match(prev):
            out.append(line)
            continue
        if prev.lstrip().startswith(">"):
            out.append(line)
            continue
        if prev[0:1] in (" ", "\t"):
            out.append(line)
            continue
        if FENCE_RE.match(prev):
            out.append(line)
            continue
        if THEMATIC_BREAK_RE.match(prev):
            out.append(line)
            continue

        # Inject a blank line before this list-start.
        out.append("")
        out.append(line)
        insertions += 1

    return out, insertions


# --------------------------------------------------------------------------- #
# File processing
# --------------------------------------------------------------------------- #
def normalize_text(text: str, do_tabs: bool = True, do_lists: bool = True) -> tuple[str, dict[str, int]]:
    """Run both passes (configurable). Idempotent."""
    lines = text.split("\n")
    stats = {"tab_lines": 0, "list_insertions": 0}

    if do_tabs:
        lines, stats["tab_lines"] = normalize_leading_tabs(lines)

    if do_lists:
        lines, stats["list_insertions"] = ensure_blank_line_before_lists(lines)

    return "\n".join(lines), stats


def process_file(path: Path, *, check_only: bool, do_tabs: bool, do_lists: bool) -> int:
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    new_text, stats = normalize_text(text, do_tabs=do_tabs, do_lists=do_lists)
    total = stats["tab_lines"] + stats["list_insertions"]
    if total == 0:
        return 0

    summary = f"tabs={stats['tab_lines']}, list-blank-lines={stats['list_insertions']}"
    if check_only:
        print(f"[needs-fix] {path}  ({summary})")
        return total
    path.write_bytes(new_text.encode("utf-8"))
    print(f"[fixed]    {path}  ({summary})")
    return total


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("files", nargs="*", default=[], help="One or more .md files")
    g.add_argument("--dir", type=str, help="Recursively process .md under this directory")
    p.add_argument("--check", action="store_true", help="Dry-run: do not modify, exit 1 if any file needs change")
    p.add_argument("--skip-tabs", action="store_true", help="Skip the TAB normalisation pass")
    p.add_argument("--skip-lists", action="store_true", help="Skip the list blank-line injection pass")
    args = p.parse_args()

    do_tabs = not args.skip_tabs
    do_lists = not args.skip_lists
    if not (do_tabs or do_lists):
        print("Both passes are skipped; nothing to do.", file=sys.stderr)
        return 2

    targets: list[Path] = []
    if args.dir:
        targets = sorted(Path(args.dir).rglob("*.md"))
    else:
        targets = [Path(f) for f in args.files]

    if not targets:
        print("No .md files to process.", file=sys.stderr)
        return 2

    total_changes = 0
    for t in targets:
        if not t.exists():
            print(f"[missing] {t}", file=sys.stderr)
            continue
        total_changes += process_file(
            t, check_only=args.check, do_tabs=do_tabs, do_lists=do_lists
        )

    if args.check:
        return 1 if total_changes > 0 else 0
    print(f"\nDone. Total changes: {total_changes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
