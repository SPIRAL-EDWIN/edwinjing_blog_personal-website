# EdwinOS maintenance map

This is a map of the current site, not a new public template or a configuration
schema. The load order and constraints in `EDWINOS_UI_ARCHITECTURE.md` remain
authoritative. Start with the owner below instead of appending a tail override.

## Where to edit

| Change | Source of truth | Do not edit as a substitute |
| --- | --- | --- |
| Component appearance and responsive behavior | Named owner in `docs/stylesheets/edwinos.css` | A new stylesheet or a second component block |
| Global typography | Typography tokens/consumers and local font faces in that CSS | Remote font imports or individual-page font patches |
| Header/search dimensions | Header CSS owner; `setupHeaderSearchTransition()` in `ui-perf.js` for measured geometry | Drawer clearance or unrelated layout tokens |
| Drawer/TOC | Drawer Navigation and Article TOC CSS; `setSectionNavigationDepth()` | Header height to compensate for hidden entries |
| Heading fragment highlight | Shared Fragment Targets CSS owner after Archive; `block-links.js` owns activation, fade and reader hand-off | A second Archive-specific highlight or higher-importance tail patch |
| Profile information | `docs/index.md`, `profileSidebarHtml()` in `ui-perf.js`, and JSON-LD in `overrides/main.html` currently need coordinated edits | Generated page HTML; this duplication is a deferred migration |
| News/publications | `data/homepage/news.yml`, `publications.yml`; `hooks/home_sections.py` generates markup | Generated homepage HTML |
| Friends | `docs/HOME/friends.md` | Runtime friend-count cache |
| Archive content/history | Article frontmatter/Git history and `hooks/archive.py` | Generated Archive cards or generated dates |
| Article images/Archive covers | Original content assets; `hooks/note_assets.py` and `archive_assets.py` | Generated thumbnails or CSS replacements of original images |
| Navigation, palette and plugins | `mkdocs.yml` | Runtime DOM labels |
| Repository facts | `tools/write_github_repo_facts.py` → `docs/assets/data/github-repo.json` | Treating this snapshot as design tokens |
| Search corpus/scope | `hooks/search_scope.py`, `tools/build_search_index.cjs` | `site/search/search_index.json` or content-hashed corpus JSON |

Repository facts, JSON-LD, generated search data and runtime query memory have
different lifecycles; combining them into a generic UI JSON file would create
coupling rather than remove it. Preserve the intentional source/deployment
repository distinction.

## Runtime navigation

`ui-perf.js` stays in one closure and retains its execution order. Use these
function names as stable search anchors rather than line numbers:

| Responsibility | Entry points |
| --- | --- |
| Deferred first-screen work | `afterFirstScreen`, `releaseDeferredWork` |
| Desktop sidebar position | `setupPrimarySidebarScrollPreservation`, `restorePrimarySidebarScroll` |
| Archive pending/recovery feedback | `setupArchiveNavigationFeedback`, `finishArchiveNavigationFeedback` |
| Route classes/initial glass | `classifyUiRoute`, `updateHomepageClass`, `ensureHeaderGlass`, `ensureTocGlass` |
| Search optics/lifecycle | `setupHeaderSearchTransition` |
| Search snippets | `decorateSearchResults`, `fitSearchSnippets` |
| Search memory, IME and navigation | `createSearchQueryMemory`, `setupSearchActivation` |
| Palette/source facts | `normalizePaletteButtons`, `updateSourceFacts`, `normalizeSourceFacts` |
| Profile/home subpages | `profileSidebarHtml`, `ensureHomeProfileLayout`, `updateBeijingTime`, `updateFriendCount` |
| Visitor metadata | `setupVisitorBadge`, `updateVisitorDeploymentTime` |
| Drawer scope | `markProfileDrawerEntries`, `setSectionNavigationDepth`, `setupSectionNavigationDepthSync` |
| Article enhancements | `labelCodeBlockLanguages`, `setupCollapsibleCallouts`, `fixOrderedListContinuity`, `setupAuthorToggles` |
| Initial/instant-navigation orchestration | `runAll` (deduplicated by content/header identity) |

Search startup belongs to `search-loader.js`; retrieval belongs to the standalone
worker/core. `ui-perf.js` adapts Material's controls, not a second search engine.
`overrides/partials/search.html` owns the initial shell; runtime reuses it.

| Event | Producer → consumer | Reason |
| --- | --- | --- |
| `edwinos:search-snippets-updated` | `ui-perf.js` → `mathjax.js` | Typeset only the updated visible snippet window |
| `edwinos:search-math-settled` | `mathjax.js` → `ui-perf.js` | Refresh search geometry after formula layout |
| `edwinos:hash-layout-settled` | `mathjax.js` → `block-links.js` | Finish fragment positioning after layout |
| Material `document$` | Material → enhancement owners | Initialize replaced content without duplicating listeners |

Do not merge these owners just because they touch the same DOM. Preserve IME,
reader-input cancellation, query generation and navigation ordering contracts.

## Before calling a declaration dead

Check selector specificity, importance, media/supports coverage, shorthand
longhands and all consumers, including mobile drawer copies and pre-JS markup.
The current `!important` declarations also override Material, so their count is
not a cleanup target. Prefer one scoped owner, not reduced counts at any cost.
Use `tools/audit_ui_css.cjs` for candidates, then the browser protocol in
`tools/UI_REGRESSION.md`. Keep source-order evidence alongside visual results.

Archive's hero/year heading resets overlap the shared pinned/fading heading
state at equal specificity. Keep Fragment Targets after Archive, with all four
rules together. Compare fragment activation, native fade, reader release and
document exit when moving heading/layout rules; ordinary rest/hover passes do
not exercise this intersection.

Still separate follow-ups: build-time Profile data/shell unification; remaining
Overview historical/final ownership; source-facts compatibility paths. Each
needs its own baseline and behavioral checks, not a silent opportunistic rewrite.

The latest cleanup's source evidence and measured limitations are in
[the 2026-10-10 verification record](tools/UI_REFACTOR_2026-10-10.md).
