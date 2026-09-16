# EdwinOS UI Architecture

Last updated: 2026-09-16

This document is the source of truth for the website's UI ownership and load
order. EdwinOS is intentionally maintained as one rendered system, not as a
legacy stylesheet followed by an ever-growing patch file.

## Load order

The order below is a runtime contract:

1. MkDocs Material theme styles and palette.
2. `docs/stylesheets/edwinos.css`.
3. Material's runtime bundle.
4. `docs/javascripts/mathjax.js`.
5. `docs/javascripts/block-links.js`.
6. `docs/javascripts/ui-perf.js`.

`overrides/main.html` configures the exact-search worker before Material's
runtime is loaded. The build hooks run in this order: `archive.py`,
`home_sections.py`, then `search_scope.py`.

Do not change any of these orders without a browser regression pass.

## CSS ownership

`docs/stylesheets/edwinos.css` is the only custom stylesheet entry point.
Material's automatic Google Fonts injection is disabled with `theme.font:
false` in `mkdocs.yml`. The font faces in the stylesheet load same-origin
WOFF2 assets from `docs/assets/fonts/`; do not reintroduce remote CSS/font
imports for site typography. Relative font and image URLs assume that the
stylesheet stays in `docs/stylesheets/`. The bundled faces are Latin subsets;
Chinese text uses local/system fallbacks rather than a network font request.
Each redistributed font keeps its own OFL license in its asset directory.

The stylesheet still preserves two cascade zones inside one file:

1. Historical Material/site baseline.
2. EdwinOS final component rules.

The zones remain ordered because source order is part of the rendered result.
New work must extend the existing component section; do not append a second
version of a component at the end. Migrate one component at a time toward this
target order:

1. Imports, font faces, and tokens.
2. Typography and prose primitives: lists, code, callouts, math, tables, links.
3. Header, tabs, search, and repository source facts.
4. Drawer, sidebars, TOC, and fragment targets.
5. Profile shell.
6. Overview sections.
7. Friends.
8. Archive.
9. Content hubs, article metadata, and PDF utilities.
10. Footer.

Keep each component's responsive and reduced-motion rules beside that
component once the component is migrated. Never introduce `@layer` as a
cleanup shortcut: Material's unlayered CSS would change the current priority
model.

The following components have completed this verified ownership migration and
must not regain an earlier historical patch block:

- Markdown list primitives, with explicit component-owned exceptions for News,
  Awards, and Experiences.
- Header, tabs, search, and repository source facts.
- Drawer navigation and Article TOC.
- Profile Card and the HOME profile shell.
- Overview section-title primitives. The rest of Overview remains a separate
  incremental migration target.
- Friends Page.

The Header owner intentionally retains a few unscoped `.md-source*` primitives:
Material also renders the repository source inside the mobile drawer, so those
rules have a proven non-Header consumer. Treat them as shared source primitives,
not dead Header leftovers.

## Runtime ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| Math rendering and TOC math markup | `mathjax.js` | Announces layout completion; does not position hashes. |
| Fragment navigation and block highlighting | `block-links.js` | Sole owner of hash positioning, including post-MathJax realignment. |
| Route classes, header/search adaptation, source facts, profile shell, drawer, callouts, list continuity | `ui-perf.js` | Enhancements must be idempotent across Material instant navigation. |
| Obsidian block anchors | `hooks/archive.py` | Generated at build time; runtime must not rewrite `.md-content__inner.innerHTML`. |
| Archive markup and article metadata | `hooks/archive.py` | CSS and runtime may consume generated classes but must not duplicate generation. |
| Homepage news/publications markup | `hooks/home_sections.py` | Content comes from `data/homepage/*.yml`. |
| Search index scope | `hooks/search_scope.py` | Worker/UI code must not duplicate build-time scope policy. |

## UI data sources

- Profile markup on the homepage: `docs/index.md`.
- HOME subpage profile shell: currently mirrored in `ui-perf.js`; this is a
  known migration target and must be kept in sync until it is moved to build
  time.
- Homepage news and publications: `data/homepage/news.yml` and
  `data/homepage/publications.yml`.
- Repository stars/forks fallback: `docs/assets/data/github-repo.json`, updated
  by `tools/write_github_repo_facts.py`.
- Friends cards: `docs/HOME/friends.md`.
- Archive cards: generated from content metadata by `hooks/archive.py`.

The source repository name and the deployment repository name are currently
different by design in the existing data. Do not normalize them during a UI
refactor without confirming the intended repository mapping.

## Change protocol

For every UI component migration:

1. Record affected routes, theme modes, viewport widths, and interactions.
2. Preserve DOM contracts and user-visible personal information.
3. Move or delete only rules whose equivalence is proven for selector,
   condition, specificity, importance, and source order.
4. Run the unit tests and `mkdocs build --strict`.
5. Compare visible computed styles and geometry on the affected pages.
6. Check light/dark and desktop/mobile behavior, plus the nearest breakpoint.
7. Keep the local preview at `http://127.0.0.1:8000/` available for review.

For CSS-only equivalence work, `tools/check_ui_equivalence.cjs` can compare the
baseline and candidate in a reset same-page DOM or in separately initialized
fresh pages. Its usage and limitations are in `tools/UI_REGRESSION.md`. A
zero-difference report is supporting evidence, not a substitute for the
specificity/media/consumer audit required by step 3.

The minimum global smoke set is Overview, Friends, Archive, ENotes, More
Experiences, and one long article containing code/math/callouts. Header/search
work must also exercise open/query/close states and instant navigation.

## Current known migration targets

These are documented risks, not permission to change behavior in an unrelated
cleanup:

- Profile data/markup is duplicated between the homepage, runtime shell, and
  homepage JSON-LD.
- HOME subpages are wrapped into their profile layout at runtime.
- Search depends on a template config adapter, an exact-match worker wrapper,
  and UI timing hooks.
- Route classification is centralized in `ui-perf.js`; keep its root,
  article-index, Archive, and Friends cases covered by runtime contract tests.
- Repository facts have JSON, cache/API, and Material-DOM compatibility paths.
- Several Material breakpoint rules remain historically ordered inside the
  unified stylesheet and should be migrated component by component.

Fix these as scoped follow-up migrations with their own baselines; do not fold
them silently into a pixel-equivalent CSS cleanup.
