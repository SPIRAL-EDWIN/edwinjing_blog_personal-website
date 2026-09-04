---
name: obsidian-wikilink-converter
description: "Convert Obsidian wikilinks in Markdown notes to stable web links for MkDocs and static sites. Trigger this skill when notes contain [[Page]], [[Page|Alias]], [[Page#Heading]], [[#^blockid]], or ![[image.png]] and those links/images must work reliably as HTML or Markdown after build."
---

# Obsidian Wikilink Converter

Use the bundled script to convert Obsidian wikilinks to stable links.

Supported source patterns:
- `[[Page]]`
- `[[Page|Alias]]`
- `[[Page#Heading]]`
- `[[Page#Heading|Alias]]`
- `[[#Heading]]`
- `[[#^blockid]]`
- `![[image.png]]`

Supported outputs:
- HTML: `<a href="...">...</a>` and `<img src="..." alt="...">`
- Markdown: `[...](...)` and `![...](...)`

Script path:
- `.github/skills/obsidian-wikilink-converter/scripts/convert_obsidian_wikilinks.py`

Reference path:
- `.github/skills/obsidian-wikilink-converter/references/obsidian-mkdocs-rules.md`

Read the reference file when you need:
- deterministic rules for ambiguous link resolution,
- slug and anchor behavior details,
- known pitfalls and validation checklist for MkDocs builds.

## Recommended Workflow

For formal Obsidian publication, use
`tools/publish_obsidian_notes.py`; it resolves manifest-aware links, uploads
assets, normalizes lists/formulas, and binds the result to review receipts.

Use this standalone script only to diagnose or repair wikilinks already inside
an existing `docs/` tree:

1. Run a dry-run conversion first.
2. Review unresolved links in the report.
3. Run in-place conversion only for the targeted repair.
4. Build with MkDocs and validate jumps.

## Commands

Run from workspace root.

Dry run (HTML output):
```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --format html --dry-run
```

Apply conversion (HTML output):
```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --format html --in-place
```

Apply conversion (Markdown output):
```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --format markdown --in-place
```

Single file:
```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --file docs\OsdNotes\CS101\Python.md --format html --in-place
```

## Notes

- The script builds a note index from all `.md` files under `docs`.
- For block links like `[[#^abcd]]`, it can inject explicit anchors so web jumping is stable.
- Front matter, fenced/inline code, comments and math are protected from link conversion.
- Duplicate note/image matches fail instead of selecting an arbitrary file.
- Unresolved wikilinks are preserved, reported by non-reversible fingerprints,
  and cause a non-zero exit status.
- Do not run it after the unified publication converter; that would create an
  unreceipted second transformation pass.
