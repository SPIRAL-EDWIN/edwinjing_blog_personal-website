# Windows Agent Handoff

This repository powers Chen Jing's personal MkDocs website:

- GitHub repository: `SPIRAL-EDWIN/edwinjing-blog-website`
- Production site: `https://edwinjing-blog.com/`
- Deploy target: GitHub Pages
- Deploy workflow: `.github/workflows/deploy.yml`

## Current deployment baseline

The GitHub Actions workflow deploys on pushes to `main` or `master`, and it can also be triggered manually with `workflow_dispatch`.

The workflow currently uses Node.js 24-compatible official actions:

- `actions/checkout@v7`
- `actions/setup-python@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

Do not remove `fetch-depth: 0` from the checkout step. The Archive hook uses Git history as a date fallback for notes that do not provide explicit front matter dates.

The workflow uses `actions/setup-python@v6` built-in pip caching:

```yaml
cache: 'pip'
cache-dependency-path: requirements.txt
```

There is no separate `actions/cache` step anymore.

## Windows setup

From PowerShell:

```powershell
git clone https://github.com/SPIRAL-EDWIN/edwinjing-blog-website.git
cd edwinjing-blog-website
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks venv activation, run this for the current terminal session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Local development commands

Serve locally:

```powershell
mkdocs serve
```

Build strictly before pushing:

```powershell
mkdocs build --clean --strict
```

Generated files under `site/` should not be committed. The production deploy builds `site/` inside GitHub Actions.

## Important project files

- `mkdocs.yml`: main MkDocs configuration.
- `hooks/archive.py`: custom MkDocs hook for Archive generation and Obsidian-style Markdown compatibility.
- `docs/HOME/Archive/index.md`: Archive page source placeholder; the hook injects generated Archive content during build.
- `docs/stylesheets/extra.css`: custom site styling, including Archive cards and target-fragment highlight animation.
- `docs/javascripts/block-links.js`: improves internal hash-link jumps by highlighting the actual target block.
- `.gitattributes`: forces LF line endings across Mac/Windows to avoid noisy diffs.
- `.gitignore`: ignores `site/`, `.venv/`, caches, and OS-generated files.

## Archive behavior

The Archive is generated during `mkdocs build` from Markdown content under `docs/`.

Each entry can use optional front matter:

```markdown
---
title: "Displayed Title"
date: 2026-06-25
author: "Chen Jing"
image: "path/to/image.png"
type: "Published"
---
```

Fallbacks:

- `title`: front matter title, then first `# H1`, then filename.
- `date`: front matter date, then latest relevant Git date.
- `author`: defaults to `Chen Jing`.
- `image`: first image in the article; if none exists, an emoji fallback is used.

## Obsidian compatibility notes

The hook helps convert common Obsidian patterns for the website:

- Obsidian block IDs like `^abc123` become usable internal anchors.
- `==highlight==` is normalized into HTML `<mark>...</mark>` outside code blocks.
- The highlighter script makes URL-fragment targets visually obvious after navigation.

If an internal link cannot be resolved, run:

```powershell
mkdocs build --clean --strict
```

Then inspect the warning carefully before changing anchors. Prefer fixing the target anchor or Markdown link over suppressing the warning.

## Safe Windows update workflow

Before editing:

```powershell
git status -sb
git pull --ff-only
```

Before pushing:

```powershell
mkdocs build --clean --strict
git status -sb
```

Commit only intentional source files. Avoid committing:

- `site/`
- `.venv/`
- `__pycache__/`
- `.DS_Store`
- `Thumbs.db`
- `desktop.ini`

After pushing to `main`, check GitHub Actions:

`https://github.com/SPIRAL-EDWIN/edwinjing-blog-website/actions`

