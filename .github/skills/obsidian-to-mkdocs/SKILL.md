---
name: obsidian-to-mkdocs
description: Convert Obsidian Markdown files to MkDocs-compatible format. Use when preparing Obsidian vault content for MkDocs Material website deployment. Handles: (1) Block reference links [[#^id]] and ^id markers, (2) Wiki-style links [[page]] and [[page|alias]], (3) Image embeds ![[image.png]], (4) Callouts/admonitions, (5) Code block formatting, (6) Front matter adjustment, (7) File organization for docs/ directory.
---

# Obsidian to MkDocs Converter

Convert Obsidian vault Markdown files to MkDocs Material-compatible format for web deployment.

## Quick Start

1. Use the unified reviewed workflow for every formal website note:
   ```bash
   .venv/bin/python tools/publish_obsidian_notes.py list
   .venv/bin/python tools/publish_obsidian_notes.py check --note-id NOTE_ID
   ```

2. The old scripts remain compatibility/debugging entrypoints, but they are
   not a second publication workflow:
   ```bash
   .venv/bin/python .github/skills/obsidian-to-mkdocs/scripts/convert_obsidian.py \
     <source.md> --output <dest.md>
   ```

The unified command owns registration, source hashes, attachment upload, link
resolution, four-column list indentation, display-math normalization, isolated
staging, strict local preview, review receipts, promotion, and rollback. Git
commit/push are deliberately separate. Do not chain `normalize_tabs.py` or the
standalone wikilink converter after it; those transformations are already in
the canonical conversion pass.

## Conversion Rules Summary

### Block References (Critical)

Keep `^block-id` markers in place. The `block-links.js` script handles them at runtime.

| Obsidian | Behavior |
|----------|----------|
| `[[#^abc123]]` | Converted by roamlinks plugin to `<a href="#abc123">` |
| `^abc123` | Kept as-is, converted to anchor by JS |

### Wiki Links

| Obsidian | MkDocs |
|----------|--------|
| `[[Page Name]]` | `[Page Name](Page%20Name.md)` or handled by roamlinks |
| `[[Page\|Display]]` | `[Display](Page.md)` |
| `[[folder/Page]]` | `[Page](folder/Page.md)` |

### `[[]]` in Code Contexts (Important)

**Rule**: `[[]]` inside inline code (`` ` ``) or fenced code blocks (`` ``` ``) is array/list syntax (e.g. Python/NumPy), NOT wiki-links. Do NOT convert or escape these.

However, the `roamlinks` plugin may still misparse `[[]]` inside code blocks and generate warnings. Workaround: insert a zero-width space (`\u200b`) between `[` and `[` to break the pattern: `[\u200b[1,2,3]]`. This is invisible to the reader but prevents RoamLinks from treating it as a wiki-link.

| Context | Example | Action |
|---------|---------|--------|
| Inline code | `` `np.array([[1,2,3]])` `` | May need `[\u200b[` if RoamLinks warns |
| Fenced code block | ` ```python\nnp.array([[1,2,3]])\n``` ` | May need `[\u200b[` if RoamLinks warns |
| Regular text | `[[Page Name]]` | Convert (wiki-link) |

### Image Embeds

| Obsidian | MkDocs |
|----------|--------|
| `![[image.png]]` | `![](images/image.png)` |
| `![[image.png\|300]]` | `![](images/image.png){ width="300" }` |
| `![Alt](<folder/image one.png> "Title")` | Copied and rewritten by the canonical publisher; alt/title/attributes are preserved |

Referenced local images are content-addressed and copied into the manifest's
asset root. The current compatibility location is `docs/assets/lab-projects/`;
its name is historical and does not classify a note. Remote and root-relative
images remain unchanged.

### Lists and indentation

- A Tab is one nested level and becomes four spaces.
- Two/three-space child markers are promoted to four spaces instead of being
  flattened to the root.
- Marker gaps using NBSP-like Unicode spaces become one normal space.
- Paragraph/list, image/list, formula/list, heading/list and callout boundaries
  are normalized outside fenced code.

### Display math

Inline `$$...$$` accepted by Obsidian is split into a real display block.
Displays inside lists and callouts become explicit `arithmatex--display`
containers so MathJax receives the TeX unchanged. The publication gate rejects
missing extensions, malformed delimiters and unbalanced `$$` blocks.

### Callouts

Handled automatically by `mkdocs-callouts` plugin. No conversion needed.

```markdown
> [!NOTE] Title
> Content
```

## Formal publication workflow

```bash
# First publication only: add provenance to the publication ledger.
.venv/bin/python tools/publish_obsidian_notes.py register \
  --source "化学/CHEM 102.md" \
  --destination "docs/OsdNotes/CHEM/CHEM 102.md"

# When source bytes change, explicitly accept the new inventory.
.venv/bin/python tools/publish_obsidian_notes.py accept-source --note-id chem-102

# Convert and validate entirely in memory.
.venv/bin/python tools/publish_obsidian_notes.py check --note-id chem-102

# After content/privacy review, bind approval to this exact source hash.
.venv/bin/python tools/publish_obsidian_notes.py approve-source \
  --note-id chem-102 --confirm-public-safe

# Write only ignored review staging, then build a complete strict preview.
.venv/bin/python tools/publish_obsidian_notes.py stage --note-id chem-102 --replace
.venv/bin/python tools/publish_obsidian_notes.py preview --note-id chem-102 --serve

# After visual review, promote only the receipt-bound files into docs/.
.venv/bin/python tools/publish_obsidian_notes.py promote \
  --note-id chem-102 --confirm-reviewed
```

The manifest is a publication ledger, not a category or tag. A source edit
invalidates its approval; a converter, manifest, staged-file, destination, CSS,
JavaScript, hook, or MkDocs configuration change invalidates the corresponding
receipt. `promote` never stages Git changes and never commits or pushes.

## Post-Conversion Checklist

- [ ] Images copied to correct `images/` directories
- [ ] Internal links resolve (no 404s)
- [ ] Block references work (click jump + highlight)
- [ ] Code blocks render correctly
- [ ] Callouts display as admonitions
- [ ] Front matter valid YAML
- [ ] `mkdocs build --strict` completes without errors

## Troubleshooting

### Block Links Not Working
1. Ensure `javascripts/block-links.js` is in `extra_javascript` in `mkdocs.yml`
2. Verify `^block-id` markers are preserved in source
3. Check browser console for "Block anchors created" log

### Broken Wiki Links
1. If using roamlinks plugin, ensure it's enabled
2. For manual conversion, URL-encode spaces: `My File` → `My%20File`

### Missing Images
1. Check image path case sensitivity (Linux servers are case-sensitive)
2. Ensure images are in `docs/*/images/` not vault's attachment folder

## References

For detailed conversion rules: [references/conversion-rules.md](references/conversion-rules.md)
