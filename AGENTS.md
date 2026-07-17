# Project Memory for AI Agents

Last updated: 2026-07-17

This repository contains Edwin Jing's personal MkDocs website. The current UI
system is named **EdwinOS**. Before making UI-related changes, read this file
first and follow the rules below.

## EdwinOS UI Governance

Do not keep appending new UI fixes to `docs/stylesheets/extra.css`.

Current layering policy:

- `docs/stylesheets/extra.css` is the legacy/base UI layer. Treat it as frozen
  for normal feature requests.
- `docs/stylesheets/edwinos-overrides.css` is the final EdwinOS override layer.
  New UI fixes and pixel-level refinements should go here.
- `docs/javascripts/ui-perf.js` is the runtime adaptation layer. It owns body
  route classes, search interaction adjustments, profile shell injection on
  home subpages, Beijing time updates, friend-count updates, GitHub source facts,
  visitor-map loading, and markdown/list continuity fixes.
- `docs/index.md` and related markdown files own content and semantic structure.
  Avoid moving content into CSS or JS.

When adding new UI rules:

1. Add them to `docs/stylesheets/edwinos-overrides.css`, grouped by component.
2. Use short section headers, for example `Header`, `Profile Card`,
   `Recent News`, `Experiences Timeline`, or `Friends Page`.
3. Keep selectors as narrow as practical and scoped to the affected page or
   component.
4. Avoid broad global overrides unless the user explicitly asks for a global
   design change.
5. Prefer modifying or extending an existing section in `edwinos-overrides.css`
   over creating a duplicate section later in the file.
6. Only edit `extra.css` when removing dead legacy rules, migrating a whole
   component during an explicit refactor, or fixing a base-layer bug that cannot
   reasonably live in the override layer.
7. Preserve existing user-visible personal information unless the user explicitly
   asks to change it.

## Current Low-Risk Maintenance Decision

The current recommendation is:

- Do not do a large CSS/UI rewrite right now.
- Keep `extra.css` as the historical base layer.
- Keep `edwinos-overrides.css` as the future EdwinOS final-fix layer.
- Future UI requests should be implemented progressively in
  `edwinos-overrides.css`, organized by component group.

This prevents the project from becoming a confusing cascade stack while avoiding
unnecessary risk to the current first-screen experience.

## If the User Requests a Systematic UI Refactor

Do not start with a full rewrite. Use a gradual migration plan:

1. Establish visual baselines before refactoring:
   - homepage in light mode
   - homepage in dark mode
   - Friends page
   - Archive page
   - ENotes page
   - More Experiences page
2. Identify component boundaries:
   - global tokens and GitHub palette
   - header/notch and search
   - profile sidebar
   - homepage content sections
   - friends page
   - archive/subpage profile shell
   - responsive rules
3. Migrate one component at a time.
4. After each component migration, run `mkdocs build --strict`.
5. Verify behavior visually in the local preview server.
6. For precision-sensitive UI, measure DOM geometry with browser automation
   instead of relying only on screenshots.
7. Keep the old rules until the migrated component is verified.
8. Remove superseded legacy rules only after the replacement is proven.
9. Update this `AGENTS.md` file whenever the governance model changes.

## Local Preview Standard

After each conversation that changes local repository files, keep a local MkDocs
preview available for Edwin's review whenever possible.

- Prefer `http://127.0.0.1:8000/`.
- If an old local preview is already running on port 8000, reuse it when it is
  the current repository's MkDocs server; MkDocs hot reload is sufficient.
- If port 8000 is occupied by a stale or unrelated server, stop or replace the
  old preview before starting the new one.
- Only use another port when 8000 cannot reasonably be recovered. If another
  port is used, state it clearly to the user.
- The local preview should reflect the current working tree, not only the last
  committed state.

## Push and Deployment Standard

When Edwin explicitly says the changes can be pushed, use the repository's
existing GitHub Actions deployment workflow. Do not invent a separate deployment
method.

- Check `.github/workflows/deploy.yml` before pushing.
- The current workflow deploys GitHub Pages on pushes to `main` or `master`.
- Default to committing and pushing the current branch to `origin/main` when the
  working branch is `main`.
- After pushing, confirm that the `Deploy MkDocs to GitHub Pages` workflow was
  triggered and report its result when possible.
- Do not deploy by manually copying files to another branch, uploading artifacts,
  or using an unrelated hosting command unless Edwin explicitly requests it.

## Verification Standard

For small CSS-only changes:

- Run `.venv/bin/mkdocs build --strict`.
- If the local server is running, rely on MkDocs hot reload for review.
- For alignment-sensitive fixes, measure the relevant DOM geometry.

For JS/runtime changes:

- Run `.venv/bin/mkdocs build --strict`.
- Test homepage and at least one profile subpage such as `/HOME/friends/`.
- Confirm there are no visible layout shifts in the header/profile first screen.

## Commit Hygiene

Keep commits scoped. Do not mix broad refactors with small visual fixes unless
the user explicitly asks for that combined work.
