# Project Memory for AI Agents

Last updated: 2026-10-22

This repository contains Edwin Jing's personal MkDocs website. The current UI
system is named **EdwinOS**. Before making UI-related changes, read this file
first and follow the rules below.

## EdwinOS UI Governance

Read `EDWINOS_UI_ARCHITECTURE.md` before changing UI code.

Current stylesheet policy:

- `docs/stylesheets/edwinos.css` is the single custom CSS entry point.
- Site typography uses same-origin WOFF2 assets in `docs/assets/fonts/`;
  `theme.font: false` disables Material's Google Fonts injection. Do not add
  remote font imports or a new stylesheet for font overrides.
- Its source order is part of the visual contract. It currently preserves a
  historical baseline zone followed by the EdwinOS final component zone.
- Markdown Lists, Header/Tabs/Search/Source, Drawer/Article TOC, Profile
  Card/HOME shell, Overview section-title primitives, Friends Page, and Archive are
  verified single-owner components in the final zone. Do not add a historical
  or tail copy of their rules.
- HOME route selectors may group the two equal-specificity body classes with
  `:is()`, but retain the `body:has(.academic-home-layout)` fallback as a
  separate top-level selector. Folding it into a forgiving `:is()` list changes
  the old-browser fallback. Archive-specific selectors outside its owner are
  restricted to typography primitives; its layout, responsive and feedback
  rules stay together. Shared Fragment Targets must follow Archive's heading
  resets: their equal-specificity margin/padding/border relationship is part
  of the baseline contract. Keep all four Fragment rules in that single owner.
- Do not recreate `extra.css`, `edwinos-overrides.css`, or another tail-patch
  stylesheet.
- Theme background tokens must reference the current GitHub frame palette.
  Keep code-block palette tokens solely in the Code Blocks owner. Do not restore
  the retired ivory background or old Overview project/education/timeline classes.
  Delete proven duplicate declarations and retired selectors after source-consumer
  review and rendered equivalence checks; historical location alone is not a
  reason to keep a verified dead rule.
- Overview Prose owns inherited homepage defaults (14px/1.65, 10px paragraph
  gaps); About details use 1.7 leading and captions use a 12px token. Keep
  the short About introduction's component-owned 15px/1.75, 76ch reading measure;
  this is not a global prose reset. Content Hubs owns the scoped `.notes-landing`
  routes and selected reading lists on ENotes/More, not child articles.
  Its introduction cards have no links and lift only on fine-pointer hover.
  `setupContentHubReveal` owns staggered entrances for individual marked units
  and desktop sidebar rows, never a whole card group or sidebar scroll wrapper,
  preserving native mobile drawer transforms, reduced motion and restoration.
  Its read keys distinguish recommended headings from description paragraphs;
  a heading or clipped card cannot consume text below the viewport. Restoration
  exposes the current reading position while leaving farther units eligible.
  Stagger queues contain only currently visible units; recheck the visual
  viewport at actual start and never consume an unseen queued unit's key.
  Ordinary wheel/touch/key scrolling must not cancel entrances or consume
  waiting units. Header/search focus must not mark article content as read.
  Unseen units start transparent before entering the viewport; never show a
  unit and then hide it to start its entrance. Preserve the pre-paint capability
  gate, runtime-failure fallback and independent pending headings/paragraphs.
  ENotes/More navigation in `mkdocs.yml` puts sibling folders before individual
  notes, preserving order within each type; keep the section index entry first
  for Material's `navigation.indexes`.
  Keep
  component-specific typography in its owner, without blanket `p`/`li` size or
  weight overrides. Use the measured Tianxing Chen reference when choosing
  unsupported new type levels; see the architecture's prose-default contract.
- `docs/javascripts/ui-perf.js` is the runtime adaptation layer. It owns body
  route classes, search interaction adjustments, Beijing time updates,
  friend-count updates, GitHub source facts,
  visitor-map loading, back-to-top glass, and markdown/list continuity fixes.
  Search input and results share one glass shell: empty activation stays a
  capsule, then a query extends it downward. Closing hides/empties the input
  while one same-origin query memory survives navigation and tabs. Refreshing
  any tab clears that shared memory in all tabs; preserve IME reset handling.
  Do not add another query store or duplicate result backdrop layers.
  Preserve IME composition handling and viewport-bounded snippet/math work.
  Capture search result URLs before clearing the query. Document or highlight
  changes use native navigation so Material cannot highlight outgoing content;
  unchanged same-document fragments remain owned by `block-links.js`.
  Search landings prioritize the first body match within the indexed section.
  That fragment owner also handles delayed highlights/layout completion and
  yields immediately to reader input. Avoid root `scroll-padding-top`, which
  makes Chromium move the document while typing into the sticky search input.
  Initial Overview/Archive/Friends body classes are seeded by
  `overrides/main.html` before the header paints; runtime route classification
  owns later navigation. Header glass and drawer repository fact rows are rendered
  by the existing template partials before first paint. Header GitHub is icon-only;
  Academic homepage is a separate glass link before search (labelled school icon
  on narrow screens), using `setupContentGlass`. Preserve fixed search/GitHub/palette
  spacing and reserve the academic link width in the tab rail. Keep its seven static
  blur layers synchronized between the header partial and `ensureHeaderGlass`
  fallback, with the eased low-radius bridge and existing 52px/74% boundary.
  `hooks/home_sections.py`
  renders HOME subpage profile shells from the authored shared profile aside, with
  rebased local URLs and `data-search-exclude`; do not recreate runtime wrappers
  or a duplicate profile markup source. Homepage article/section entrance motion
  must not translate the profile or prose during refresh/scroll restoration.
  Overview's About Me section stays static. All other unseen, offscreen sections
  marked `data-overview-reveal` receive the one-time scroll reveal owned by
  `setupOverviewReveal`; keep viewed keys in this document's runtime only.
  Initial visible/restored sections, hash/focus landings, reduced motion and
  missing observers reveal directly. Dispose observers and pending listeners
  on completion or content replacement. This effect does not defer image
  requests or alter homepage image preloads/readiness.
  Initial sections count as onscreen only when their complete heading is visible;
  partial headings remain eligible for their first reveal. Headings own normal
  entrance eligibility, so long columns can still enter normally. The same
  observer also watches section boundaries solely to recover reading positions
  with an already-passed heading; body intersection must not trigger an early
  entrance. Initial onscreen
  sections remain provisional until reader scrolling; disclosure focus/anchoring
  scrolls alone must not commit them. Opening About's Detailed Profile may rearm
  only provisional sections whose headings leave the readable viewport.
  Automatic viewport entries remain provisional until their entrance completes
  or actual reader scrolling confirms them. Actual first reveals and completed
  reading remain permanent for this document; repeated disclosure toggles must not
  reset them. Preserve the disclosure entry point while provisional sections
  remain, even when there are no offscreen pending sections.
  The selected navigation glass is one persistent header surface, seeded by
  `partials/header.html` and rebound by `setupTabGlass` after Material replaces
  the tabs. Its lens samples the actual labels above the tabs, below search
  controls; navigation uses the original Shu Ding UV/SDF double-smoothstep field
  and derived physical scale, with no fixed rim or normalized direction.
  Motion strength is bounded to 0..1; narrow labels remain sharp at rest. Preserve selected-item
  auto-reveal, stationary search opening/closing, masked destination preparation,
  neutral HOME subpages and layout/reduced-motion lifecycle handling. Chromium
  uses live backdrop displacement. Keep sampling padding separate from
  the actual lens UV map; an axis-aware matrix preserves physical offsets
  while freezing the decoded map during motion. Rebuild at the neutral endpoint.
  Safari uses one SVG optical source of only the three navigation labels with
  complementary inside/outside clips. Original anchors own layout and input;
  hide their glyph fill only after the source is ready, refresh font/palette/
  hover/focus changes, and bypass displacement at rest. This narrow adapter
  does not sample the article background or duplicate page content.
- All Recent News announcements end with an ASCII `!` to convey good news.
  Author this in `data/homepage/news.yml`; `hooks/home_sections.py` also normalizes
  terminal sentence punctuation at build time for future entries.
- `docs/index.md` and related markdown files own content and semantic structure.
  Avoid moving content into CSS or JS.
- Homepage logo and Workshop images use responsive local thumbnails and tiny
  inline blur previews; `tools/generate_loading_previews.py` regenerates them
  without replacing originals. `overrides/partials/image-previews.html` installs
  the single image-readiness owner in the head; decoding retires preview
  underlays before the main runtime, and `ui-perf.js` reuses that owner for
  instant navigation. Native thumbnails must stay visible, including cached
  refreshes; do not restore an opacity gate or a repeated reveal animation.
  The logo, first real publication and first Workshop image have matching
  homepage-only responsive preloads and eager/sync hints at normal priority;
  later publication and article images retain lazy loading.
  Preserve the original display aspect ratios and the no-JavaScript fallback.
  Optional publication motion comes from `preview` in the publication YAML.
  `home_sections.py` validates local clips and keeps the original static image;
  `setupPublicationPreviews` in `ui-perf.js` owns bounded pointer-intent warmup,
  actual-frame readiness, explicit mobile/keyboard playback and lifecycle cleanup.
  No clip URL is requested without reader intent, and entries without `preview`
  keep the static markup. Never couple this video layer to image readiness.
  PDF previews show the first two pages before an explicit reader click sets
  the iframe URL. An iframe load event is not proof that Edge has painted a
  PDF page; retain the previews and direct-open/download alternatives.
  The PDF open button shares navigation's layout-only glass implementation,
  initializes optics only when visible, and disposes them on hide/navigation.
  Back-to-top wording is authored by `overrides/partials/top.html`; preserve
  Material's icon, hidden state, component identity and native click behavior.
- Cross-document navigation feedback has one coordinator in `ui-perf.js`.
  Clear it only when the mounted content changes or navigation is cancelled;
  URL changes alone do not prove arrival. Preserve the actual source document
  across rapid clicks. The shared progress bar belongs to the Header CSS owner,
  while Archive's existing overlay stays in its Archive owner.
  Ordinary page feedback appears only after 2 seconds and offers recovery after
  10 seconds. Its liquid glass reuses Back to Top's displacement-map generator
  with an independent filter; dispose timers and optics on completion/cancel.
  Do not add waiting outlines to tabs or sidebar links.
  Keep ordinary fast clicks free of geometry reads and body-style writes;
  measure header placement only when the delayed capsule is actually shown.
- `mathjax.js` owns article formula loading, bounded failure retries and manual
  recovery. Formula-page preloads may be emitted by `overrides/main.html`;
  do not warm MathJax on every homepage visit. Keep stale navigation callbacks
  from updating the current article and preserve the search typesetting queue.
  Typesetting targets must not overlap: nested TOC containers have one outer
  owner, so MathJax never replaces the same formula twice.
- `hooks/note_assets.py` owns individual ENotes and experience-article image
  lazy loading and intrinsic dimensions at build time. Preserve original images
  and explicit author attributes.
  Internal HTML prefetch belongs to Material's `navigation.instant.prefetch`;
  do not restore a duplicate Archive prefetch or batch-download notes on load.
- `hooks/archive_assets.py` owns generated local Archive cover thumbnails;
  Pillow is build-time only. Never replace note originals or fetch third-party
  covers during builds. Archive feedback follows content replacement, not a
  fixed elapsed-time dismissal.
- `hooks/archive.py` excludes generated article date/author metadata from
  search using `data-search-exclude`; preserve its visible page content and
  genuine body matches rather than filtering author names as query terms.
  `ui-perf.js` also removes only Material's generated highlight marks from
  excluded article subtrees, including delayed marks; preserve this index and
  article-highlighting scope agreement.
  Article search accents use a translucent orange fill across the full text
  height while inheriting the source text style; first visible appearance holds for 2 seconds then fades over 1.5
  seconds. Keep authored marks intact and snippet accents persistent.
  Search excerpts retain code provenance from the worker through width fitting
  and math preparation. Preserve code nodes and literal shell variables;
  math delimiters must not pair inside or across code ranges.
- `hooks/search_scope.py` owns search corpus scope and invokes
  `tools/build_search_index.cjs` after scoping. Search retrieval and safe result
  snippets belong to the standalone Lunr worker/core in
  `docs/assets/javascripts/workers/`; do not restore an upstream worker plus
  post-filter stack. Node is build-time only; `EDWINOS_NODE` may select a local
  binary, and Python-only local builds retain worker-side index construction.
  `search_index.json` is a lightweight highlighting manifest; the worker loads
  the content-addressed corpus after intent or post-load idle warmup.
  `docs/javascripts/search-loader.js` owns that startup boundary before Material,
  and `overrides/partials/search.html` supplies the initial glass shell.
  Keep heavy JSON parsing and index loading in the worker, preserve early input
  and failure retry, and do not intercept global network requests.
  Back to Top has one CSS owner. Its glass reuses the search displacement-map
  generator with an independent filter and geometry; keep Material's button
  placement, visibility, accessibility and click behavior. Its backdrop filter
  belongs on the button itself, since Material's opacity transition blocks a
  child surface from sampling the page. Keep its lighter optical tuning separate
  from search. Rebuild the map only
  for layout/font changes, never on every scroll frame.
  Supplemental glass on the Profile Archive action, Archive date capsule and
  native single-copy toolbar, plus the three ENotes introduction cards, is
  owned by `setupContentGlass`: initialize near
  the viewport and dispose on exit/content replacement. Keep copy language
  labels in a separate slot through all reveal states; preserve Material's
  copy target, icon and success feedback. `setupDrawerGlass` owns the mobile
  ENotes/More outer surface and bounded optical gain animation. Its outer native
  slide stays separate from `setupDrawerTree`, which reuses checkbox/label/nav
  markup for inline mobile disclosures, including the current article outline.
  Keep left chevrons, animated child expansion, desktop-sized typography,
  independent mobile/desktop expansion state, keyboard focus and inert closed
  groups. Do not restore nested full-height panels or back-title controls.
  Keep native outer transforms, continuous reversal gain,
  reduced-motion behavior and Safari blur through closing. The outer surface
  blends a frosted center into a lightly blurred, low-tint edge; its map's blue
  channel owns a right-edge-only 96px smootherstep blur weight. Leftward regions
  stay fully frosted, including the top/bottom; R/G displacement is restricted
  to the free right silhouette. Other glass keeps its rounded-perimeter default.
  Safari uses matching complementary native-blur masks. Clear native list/item borders
  across inactive ancestor panels as well as the visible section. Never rebuild a
  drawer displacement map per animation/scroll frame or add glass to each row.

When adding new UI rules:

1. Add them to the existing component section in `docs/stylesheets/edwinos.css`.
2. Use short section headers, for example `Header`, `Profile Card`,
   `Recent News`, `Experiences Timeline`, or `Friends Page`.
3. Keep selectors as narrow as practical and scoped to the affected page or
   component.
4. Avoid broad global overrides unless the user explicitly asks for a global
   design change.
5. Prefer modifying or extending an existing section over creating a duplicate
   section later in the file.
6. Migrate historically ordered rules one component at a time. Keep old rules
   until computed-style, geometry, interaction, and breakpoint checks prove the
   replacement is equivalent.
7. Preserve existing user-visible personal information unless the user explicitly
   asks to change it.

## Current Low-Risk Maintenance Decision

The old/new two-file split was retired on 2026-09-04. Continue the gradual
component migration inside `edwinos.css`; do not perform a full reorder merely
to make the file look cleaner. The goal is one owner per component, reached
through verified component-sized changes. The first verified owners were
completed on 2026-09-05 and expanded on 2026-09-06; see
`EDWINOS_UI_ARCHITECTURE.md` for their boundaries and the intentionally shared
typography, motion, frame, and mobile-drawer primitives.

## If the User Requests a Systematic UI Refactor

Do not start with a full rewrite. Use a gradual migration plan:

1. Establish visual baselines before refactoring:
   - homepage in light mode
   - homepage in dark mode
   - Friends page
   - Archive page
   - ENotes page
   - More page
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

For heading/layout migrations, also compare real fragment navigation in pinned,
fading, reader-released and document-exit states. An unchanged rule body is not
enough when moving it across another rule with intersecting consumers.

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
- For cascade migrations, use `tools/check_ui_equivalence.cjs` as described in
  `tools/UI_REGRESSION.md`, and retain its stated limitations in the conclusion.

For JS/runtime changes:

- Run `.venv/bin/mkdocs build --strict`.
- Test homepage and at least one profile subpage such as `/HOME/friends/`.
- Confirm there are no visible layout shifts in the header/profile first screen.

## Commit Hygiene

Keep commits scoped. Do not mix broad refactors with small visual fixes unless
the user explicitly asks for that combined work.

## Blog Reading Desk (2026-10-29)

Blog root is `.blog-home`, English except Chen Jing (经宸); do not modify the separate academic homepage. `hooks/archive.py` renders six recent article updates from the Archive model; homepage-only titles use `title_en` or `data/homepage/blog-titles.yml`. Add an English title when a new non-English article enters the latest six. Do not translate source articles.
Shared Friends/Archive profile markup now lives in `data/homepage/profile-sidebar.html`, read by `hooks/home_sections.py`. Old Overview is retained outside published docs at `data/homepage/overview-before-reading-desk.md`. Do not restore extraction from the new root.
Blog Home CSS owns layout; `setupBlogHome` owns one-time row/card reveals, the single selected video player, offscreen pause and lifecycle disposal. Preserve portrait framing and per-clip speed captions. Author video URLs as `data-src`: only the selected clip warms metadata, after the Save-Data guard; inactive clips wait for selection. Fine-pointer hover plays unless reduced motion or Save-Data is active; touch/keyboard have explicit controls. Selection is explicit playback intent. Keep shared search, glass, local fonts and responsive visitor footer.

The first-entry opening lives in `intro-loader.js`, `intro-questions.js` and the two-phase `intro-loader.html` partial; configure it with `extra.loader`. Keep the no-skip rise/breathe/confirm/sink sequence, reduced-motion alternative and independent 7-second fail-open. Only essential same-origin visible images, fonts and selected-video metadata may gate it; external avatars and badges must not delay access. Do not attach it to Material instant navigation.

Opening questions are English, grounded in actual note bodies, kept below 60 characters, and shuffled on every opening. Do not restore a fixed first question or lengthen the opening simply to show more prompts. Record new question provenance in `experiments/home-redesign/intro-notes.md`.

Question selection also includes PHIL 206 and CS101. Prefer authored self-questions and conceptual distinctions with depth; do not fill subject quotas with command trivia or present philosophical positions as settled facts.
