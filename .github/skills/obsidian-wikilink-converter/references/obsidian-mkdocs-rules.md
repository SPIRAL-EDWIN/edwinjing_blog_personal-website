# Obsidian To MkDocs Rules

## Purpose

Use this file when conversion results are ambiguous, unresolved, or produce unstable anchors in web output.

For formal publication, these rules are applied by
`tools/publish_obsidian_notes.py`. The standalone wikilink script is a legacy
repair/debugging entrypoint for existing files under `docs/`, not an additional
step after unified conversion.

## Source Pattern Mapping

- [[Page]]: resolve to page URL and keep page name as link text.
- [[Page|Alias]]: resolve to page URL and use Alias as link text.
- [[Page#Heading]]: resolve to page URL plus heading slug fragment.
- [[Page#Heading|Alias]]: resolve to page URL plus heading slug fragment, use Alias as link text.
- [[#Heading]]: resolve to current page plus heading slug fragment.
- [[#^blockid]]: resolve to current page plus block id fragment.
- ![[image.png]]: resolve to image URL and render as image element.

## Resolution Priority

1. Match note by exact relative path from docs root (without .md).
2. Match note by file stem.
3. Match note by first heading text.
4. Match image by exact relative path from docs root.
5. Match image by filename.
6. Fallback to relative path from current file.

If still unresolved, keep original Obsidian syntax and report it.

## Anchor Strategy

- Heading anchors: use deterministic slug generation from heading text.
- Block anchors: convert trailing Obsidian block ids (for example: text ^abc123) into explicit HTML anchors.
- Fragment precedence in mixed cases: block id wins over heading fragment.

## Slug Rules

- Lowercase text.
- Remove inline code markers and bracket punctuation.
- Keep word characters, dash, whitespace, and CJK characters.
- Collapse spaces to single dash.
- Collapse repeated dashes.
- Trim leading and trailing dashes.

## Safety Rules

- Do not modify unresolved links to guessed targets.
- Keep unresolved source syntax unchanged for manual review.
- Avoid destructive rewrites outside matched wikilinks and block-id lines.
- Preserve UTF-8 content and line order.

## Common Pitfalls

- Duplicate note stems in different folders can resolve to wrong page.
- Heading text edited after link creation can break heading fragments.
- Obsidian block ids are not valid web anchors until explicitly injected.
- Image names with same filename in multiple folders can resolve ambiguously.

## Validation Checklist

1. Run converter in dry-run mode.
2. Confirm unresolved count is acceptable.
3. Apply in-place conversion.
4. Run MkDocs build.
5. Check warnings for missing anchors and unresolved links.

## Recommended Commands

Dry-run:

```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --format html --dry-run
```

Apply:

```powershell
.\.venv\Scripts\python.exe .github\skills\obsidian-wikilink-converter\scripts\convert_obsidian_wikilinks.py --docs-root docs --format html --in-place
```

Build:

```powershell
.\.venv\Scripts\python.exe -m mkdocs build
```
