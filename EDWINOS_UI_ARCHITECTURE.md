# EdwinOS UI Architecture

Last updated: 2026-10-12

This document is the source of truth for the website's UI ownership and load
order. EdwinOS is intentionally maintained as one rendered system, not as a
legacy stylesheet followed by an ever-growing patch file.

## Load order

The order below is a runtime contract:

1. MkDocs Material theme styles and palette.
2. `docs/stylesheets/edwinos.css`.
3. `docs/javascripts/search-loader.js` (small search startup bridge).
4. Material's runtime bundle.
5. `docs/javascripts/mathjax.js`.
6. `docs/javascripts/block-links.js`.
7. `docs/javascripts/ui-perf.js`.

`overrides/main.html` configures the EdwinOS Lunr search worker before Material's
runtime is loaded. The build hooks run in this order: `archive.py`,
`home_sections.py`, `search_scope.py`, `note_assets.py`, then `archive_assets.py`.

Do not change any of these orders without a browser regression pass.

The head marks JavaScript availability before first paint. The search partial
renders its glass shell in HTML; `ui-perf.js` reuses it rather than adding a
second surface. `search-loader.js` captures only the configured EdwinOS worker
construction, immediately restores the native Worker constructor, and sends
the startup signal on search focus/pointer/input/shortcut or a query URL.
Otherwise it waits for load, two frames, two seconds, and idle time. Save-Data
and 2G connections use intent only. Material initially downloads only a tiny
highlighting manifest; corpus JSON parsing and prepared-index loading happen
inside the worker. READY is sent only after successful initialization, keeping
Material's latest-input buffering. A failed load can retry on a later input.
Content-hashed corpus names avoid manifest/cache mismatches. Dirty local builds
keep older corpus files for active pages; clean deployment removes them.

Repository statistics use only EdwinOS's local snapshot/cache/API path: the
source partial omits Material's separate API initializer. Friend count,
repository and deployment metadata wait until after load/paint/idle. Core UI
enhancements run once per content/header pair across the initial lifecycle;
instant navigation still initializes replaced content. Homepage prose and its
profile start at final geometry without nested entrance transforms. Initial
HOME route classes are seeded before the header; the Header partial renders
progressive glass and the Source partial renders the complete facts row.
Runtime setup reuses those nodes. The avatar is eager/high priority. The logo,
first real publication and first Workshop thumbnail use eager/sync hints at
normal priority. `home_sections.py` derives matching homepage-only image
preloads from rendered media, including the same srcset/sizes candidates.
Tiny inline blur previews reserve geometry under native images. The inline
head owner in `partials/image-previews.html` retires them after decoding,
before Material or `ui-perf.js` needs to load. There is no image opacity gate
or repeated fade on refresh. `ui-perf.js` reuses this owner on instant navigation.
Other below-the-fold
images and visitor statistics retain their existing lazy/low priority.
Closed search refreshes draw once; opening/closing and result transitions retain
frame tracking. Font readiness refreshes the static geometry without an idle
animation loop. Queries typed before Material loads are opened and submitted
when the UI initializes.

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
4. Drawer, sidebars, and TOC.
5. Profile shell.
6. Overview sections.
7. Friends.
8. Archive.
9. Shared fragment targets (after Archive heading resets).
10. Content hubs, article metadata, and PDF utilities.
11. Footer.

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
- Archive cards, hero, responsive layout and navigation feedback. Shared
  Archive-specific typography remains in Typography and is restricted to
  `font-family` and `letter-spacing` by the ownership test.
- Fragment Targets is a single shared heading-state owner immediately after
  Archive and before Content Hubs. Archive hero/year resets and pinned heading
  rules have equal specificity; Fragment must win their margin/padding/border
  intersection, as it did before Archive's migration. All four base/dark/fading/
  pseudo-element rules stay together. Shared consumers are not limited to
  selectors containing an `archive-` class: inspect dynamic heading classes too.

HOME selectors use `body:is(.is-homepage, .is-home-profile-page)` plus a
separate `body:has(.academic-home-layout)` selector with the same suffix.
The class branches have identical specificity; grouping them removes duplicate
selectors without weakening the existing cascade. Keep `:has()` outside the
forgiving `:is()` list so older browsers retain the original selector-list
failure behavior. Do not replace this with `:where()` (zero specificity).

Star/fork SVG masks have one token pair in the Header owner:
`--edwinos-star-icon` and `--edwinos-fork-icon`. Header and drawer source facts
consume these same assets; separate mask aliases are unnecessary.

The Header owner intentionally retains a few unscoped `.md-source*` primitives:
Material also renders the repository source inside the mobile drawer, so those
rules have a proven non-Header consumer. Treat them as shared source primitives,
not dead Header leftovers.

Search uses one continuous blur/tint surface and a separate thin perimeter
highlight, with unfiltered input and icon. Its resting and expanded geometry
share numeric left/right/top/height coordinates. The expanded height has its
own token and must not change the shared Header control size or horizontal
targets. Active tab backgrounds are inset 1px horizontally without moving
their buttons or text. Search stays above covered controls until closing ends.
Selected navigation uses one persistent header capsule, outside the tabs that
Material replaces. The header partial seeds its actual selected geometry before
paint; `setupTabGlass` reuses that helper for arrival, mobile auto-reveal and
layout changes. Its track is above the actual labels and below search controls,
allowing the moving perimeter to sample and refract glyphs. Navigation optics
are separate from search: transparent, unblurred center and the original
Shu Ding UV/SDF fragment with two smoothsteps and its RG encoder. There is no
fixed-width rim, normalized direction vector or arbitrary pixel strength.
Actual geometry derives the optical scale; a bounded 0..1 motion envelope
returns displacement to zero at rest. Ordinary search opening and closing
leave the capsule stationary; cross-section results prepare the target under
the covering search shell before closing. HOME profile subpages remain neutral.
Reduced-motion changes and in-flight layout changes settle correctly; idle
states do not run animation frames. The decoded UV map stays fixed during
width changes, spans only the actual lens, and uses a per-axis color matrix
plus a common displacement scale to preserve physical offsets without RG
clipping. Source coverage padding is separate from UV geometry. A new map is
built only at the zero-strength endpoint to avoid decode gaps during movement.
Safari uses a navigation-only SVG optical source of the three real labels,
split by complementary inside/outside clips. Original anchors retain layout,
accessibility and input; their glyph fill is hidden only when the source is
ready. Font baselines are measured from HTML, palette/hover/focus changes refresh
the source, and the inside filter is bypassed at rest. This adapter refracts
label glyphs, not the scrolling article backdrop. Cross-document
View Transitions remain a separate local experiment, not a production feature.
The Search runtime in `ui-perf.js` owns the padded rounded-rectangle displacement map,
palette coverage measurement, bounded cache and animation/resize updates.
Chromium uses edge refraction; Safari and unsupported browsers retain continuous
native blur. Keep initialization idempotent across instant navigation, stop
optical work while idle, and preserve Material's input/checkbox/query contracts.
Upstream technique attribution is in `docs/assets/licenses/liquid-glass-MIT.txt`.
One visual shell covers the input and results. Empty activation keeps the
capsule; a query extends its lower edge into a rounded window. Only the existing
Material scrollwrap scrolls, with height bounded by the visual viewport.
The shell follows the rendered input and result heights each animation frame;
do not animate the shell height again or empty activation will grow late.
Result content layers are transparent; do not add another backdrop or tint.
Excerpts use the first body keyword in the indexed section as the mandatory
match, then offer up to three source-ordered contextual segments separated by
ellipses. Width fitting reserves that first match and context, adds later
segments when space allows, and measures approximately two lines off-DOM. Fit
and formula work is limited to visible rows plus 96px overscan; scrolling and
opening more results refresh that window. Article provenance follows each
section title rather than consuming a separate grouping row. IME preedit does
not query; committed input coalesces into one 100ms-delayed query. Selecting a
result closes search before same-page fragment capture. Closing empties the
visible input but preserves one same-origin localStorage query memory across
document, history, instant and new-tab navigation. Opening restores the latest
shared query. A document reload publishes a reset generation to clear memory
in all tabs, including active inputs after any IME composition ends. Ordinary
closing must not overwrite a newer query from another tab. Restricted storage
falls back to document-local memory. Closing removes only `q`/`query` from the
current URL, and preserves result links
with their `h` highlighting parameter and fragment.
Search results that change the document or highlighting terms use native
document navigation, captured at window click before closing can detach the
link. Material otherwise publishes `h` while the old content is still mounted
and its request has no timeout. Native loading commits the URL with the new
document and retains browser loading/error handling. Same-document fragments
with unchanged highlighting remain with `block-links.js`; modified clicks,
new tabs and downloads retain native semantics.
Before Material initializes on a reload, `search-loader.js` removes only
`q`/`query` so an old query URL cannot reopen search; `h` and fragments survive.
The sticky Header needs no root scroll padding: its obsolete global rule made
Chromium shift the document on search key events. Fragment header offsets stay
with the existing fragment owner and element scroll margins.
`mathjax.js` owns lazy, targeted search-formula typesetting on the existing
queue. The snippet fitter preserves complete TeX units, retains raw text before
typesetting, and refits from that source on resize. Search typesetting must not
reset the article's MathItems or equation counters. The worker retains code
ranges from the original corpus HTML, and both width fitting and math preparation
preserve safe code nodes and their keyword marks. Delimiters in code are literal;
formulas may not pair across code boundaries. Code remains searchable.
Article formulas remove only Material's search-highlight marks and undo its
text entity escaping before typesetting, including delayed index updates.
MathJax uses full CHTML style text (`adaptiveCSS: false`): Material's instant
navigation can remove dynamic head nodes, which otherwise discards incremental
CSSOM glyph rules while MathJax still caches them as emitted.
Explicit heading fragments also coordinate the exact TOC selection. Cross-page
links retain their intended fragment through Material's outgoing scrollspy and
post-MathJax settling; reader motion releases the selection immediately.
Search arrivals instead position the first body keyword in the selected
indexed section at one third of the viewport below the header, clamped at the
document bottom. Heading-only matches retain heading positioning. A bounded,
article-scoped highlight observer and the same layout-settled handoff cover
delayed marks/formulas; search focus and reader motion cancel pending work.
Validate Material's substring marks against the retrieval word boundaries before
choosing the landing. Reveal only closed native details ancestors concealing
that first match; geometry alone does not establish collapsed-content visibility.
Generated article dates/author metadata is marked `data-search-exclude` by
`hooks/archive.py`, preserving it visually while excluding it from the index.
Material's article highlighter does not honor that attribute. `ui-perf.js`
unwraps only its generated `mark[data-md-highlight]` nodes inside excluded
subtrees, immediately and after delayed highlighting. Its scoped observer is
replaced on content navigation; genuine body matches and authored marks remain.
Generated article search marks inherit typography and use a translucent orange
fill across the full text height, distinct from authored yellow marks
and green lower-edge emphasis.
`ui-perf.js` starts each accent only when it is visible, holds it for 2 seconds,
then fades only the accent over 1.5 seconds. Closed details, background tabs and
an open search window delay activation. Observers and timers are disposed on
content replacement. Search snippets use the same orange accent persistently.

Back to Top owns its glass styling in one CSS section. Material retains the
button's placement, visibility and return-to-top behavior. The button itself
samples the continuous backdrop behind its unfiltered label and arrow: a child
surface would be blocked by Material's opacity transition creating a backdrop
root. Its low-opacity tint and 4px blur preserve scrolling background detail.
Chromium adds edge-only refraction using the shared rounded-rectangle map
generator with a separate padded SVG filter; Safari retains native blur and
perimeter highlights. Its map follows layout/font changes without scroll
listeners or an idle frame loop; the compositor samples the live page on scroll.

## Runtime ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| Math rendering and TOC math markup | `mathjax.js`, formula-only preload in `overrides/main.html` | Tracks current-article loading, bounded retries and manual recovery; excludes overlapping nested TOC targets, announces layout completion and does not position hashes. |
| Fragment navigation and block highlighting | `block-links.js` | Sole owner of hash positioning, including post-MathJax realignment. |
| Route classes, header/search adaptation, source facts, drawer, callouts, list continuity | `ui-perf.js` | Enhancements must be idempotent across Material instant navigation. |
| Initial Header glass/source facts and HOME profile shell | Header/Source partials, `hooks/home_sections.py` | Complete initial geometry; copied profile uses homepage markup, local relative URLs and search exclusion. Runtime reuses nodes and updates facts. |
| Obsidian block anchors | `hooks/archive.py` | Generated at build time; runtime must not rewrite `.md-content__inner.innerHTML`. |
| Archive markup and article metadata | `hooks/archive.py` | CSS and runtime may consume generated classes but must not duplicate generation. |
| Homepage news/publications markup | `hooks/home_sections.py` | Content comes from `data/homepage/*.yml`. |
| Search index scope and delivery | `hooks/search_scope.py` | Scope once, prebuild, then publish a lightweight manifest and content-hashed corpus. Worker/UI code must not duplicate scope policy. |
| Search startup and initial shell | `search-loader.js`, `overrides/partials/search.html` | Visual shell is static. Intent starts immediately; unused search warms only after the first screen. Heavy corpus stays in the worker. |
| Search result navigation | `ui-perf.js` | Capture the full destination before clearing search. Document/highlight changes use native navigation; unchanged same-document fragments stay with `block-links.js`. Never publish destination highlighting against outgoing content. |
| Search retrieval and result snippets | `assets/javascripts/workers/search-engine.js`, `search-exact-worker.js` | One Lunr engine with Material's SETUP/READY/QUERY/RESULT contract. Exact phrases precede chapter context; fuzzy and final-word prefix are controlled fallbacks. Escape all result HTML. |
| Search index prebuilding | `hooks/search_scope.py`, `tools/build_search_index.cjs` | Prebuild only after corpus scoping, with the same vendored Lunr and tokenizer as the worker. Node 24 is configured in the existing deployment workflow; Python-only local builds retain the worker fallback. `EDWINOS_NODE` can select a local Node binary. |
| ENotes and experience-article image loading and intrinsic dimensions | `hooks/note_assets.py` | Build-time native lazy loading; preserve original image URLs, explicit attributes, and lightbox behavior. |
| Internal page prefetch | Material `navigation.instant.prefetch` | Hover/focus-triggered HTML prefetch; no duplicate runtime Archive prefetch or automatic batch downloads. |
| Cross-document opening feedback | `ui-perf.js`, Header CSS owner; Archive overlay in Archive owner | One pending coordinator retains the mounted source across rapid clicks. Ordinary feedback appears after 2 seconds; 10 seconds reveals recovery. Its independent liquid-glass filter reuses Back to Top's map generator and updates only for layout/font changes. Dispose timers and optics after content replacement or cancellation. Tabs/sidebar have no waiting outline; the shared progress bar is visible at the header edge. |
| Archive cover thumbnails | `hooks/archive_assets.py` | Build-time Pillow output under `assets/archive-thumbnails`; same-origin raster covers only, originals and third-party URLs preserved. |
| Homepage loading previews and PDF page previews | `tools/generate_loading_previews.py`, authored Markdown, `partials/image-previews.html`, `ui-perf.js` | Preserve originals; native thumbnails stay visible and the head's single decode owner retires preview underlays. First two PDF page previews remain readable without downloading the PDF; only reader intent assigns its iframe URL. Iframe load does not establish PDF page readiness. The open button reuses navigation's layout-only glass owner and initializes optics on viewport entry. |

## UI data sources

- Profile markup on the homepage: `docs/index.md`.
- HOME subpage profile shell: `hooks/home_sections.py` copies the authored
  homepage aside at build time, rebases local URLs, and excludes the copied
  profile from search. Runtime updates its clock and friend count without
  wrapping or moving mounted content.
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

For an editing-oriented map of content, configuration, runtime functions and
cross-file events, see [UI Maintenance](UI_MAINTENANCE.md). The read-only cascade
inventory and browser checks are documented in
[UI Regression](tools/UI_REGRESSION.md). Inventory candidates are review leads,
not a license for automatic deletion or removing all `!important`.

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

- Profile data remains duplicated between the homepage and homepage JSON-LD;
  the HOME subpage shell reuses the homepage source at build time.
- Search uses a template config adapter and one standalone Lunr worker/core.
  The worker does not import or layer filters over Material's bundled worker;
  UI timing hooks preserve its standard input/message contract. The vendored
  Lunr 2.3.9 MIT license is kept beside the library.
- Route classification is centralized in `ui-perf.js`; keep its root,
  article-index, Archive, and Friends cases covered by runtime contract tests.
  `overrides/main.html` seeds initial Overview/Archive/Friends body classes before the
  header paints; runtime classification remains authoritative after instant
  navigation. Their neutral tab rule clears the active capsule variable used
  by `::before`, as well as the link background.
- Repository facts have JSON, cache/API, and Material-DOM compatibility paths.
- Several Material breakpoint rules remain historically ordered inside the
  unified stylesheet and should be migrated component by component.

Fix these as scoped follow-up migrations with their own baselines; do not fold
them silently into a pixel-equivalent CSS cleanup.
