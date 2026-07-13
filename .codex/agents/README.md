# Project Codex Subagents

This directory defines project-scoped Codex subagents for Edwin Jing's MkDocs + Material personal website. It intentionally lives under the repository `.codex/` directory and does not change global `~/.codex` settings.

## Global Limits

`.codex/config.toml` sets:

- `agents.max_threads = 5`
- `agents.max_depth = 1`
- `agents.job_max_runtime_seconds = 1800`

The agent files do not pin a model, so they inherit the parent session model unless the parent overrides it.

## Agents

- `site_mapper`: read-only repository mapper for `mkdocs.yml`, `docs/`, CSS, JS, hooks, nav, and impact analysis.
- `content_editor`: workspace-write editor for Markdown content, articles, navigation, and Archive-related front matter/config.
- `edwinos_ui_fixer`: workspace-write EdwinOS UI maintainer for CSS and runtime UI fixes. Ordinary UI changes should go to `docs/stylesheets/edwinos-overrides.css`, not `extra.css`.
- `build_qa_reviewer`: read-only QA reviewer for `mkdocs build --strict`, links, navigation, layout regression risk, and deployment readiness.
- `docs_researcher`: read-only documentation researcher for MkDocs, Material for MkDocs, configured plugins, and official Codex subagents/AGENTS.md docs.

## Suggested Workflow

1. Ask `site_mapper` to map files and likely impact before broad or uncertain changes.
2. Use exactly one write-capable agent for a given batch of files:
   - `content_editor` for Markdown/nav/archive work.
   - `edwinos_ui_fixer` for EdwinOS CSS/JS work.
3. Do not run multiple write-capable agents against the same files at the same time.
4. Use `docs_researcher` when framework or Codex behavior needs current official documentation.
5. Use `build_qa_reviewer` after edits for strict build, link/nav, and layout/deployment risk review.

## Repository Rules Captured

All agents are instructed to read `AGENTS.md` first and follow the EdwinOS governance model:

- `docs/stylesheets/extra.css` is the frozen legacy/base UI layer.
- `docs/stylesheets/edwinos-overrides.css` is the final EdwinOS override layer for new UI fixes.
- `docs/javascripts/ui-perf.js` owns runtime adaptation.
- Markdown files own content and semantic structure.
- Deployment should use the existing GitHub Actions workflow when Edwin explicitly asks to push.
