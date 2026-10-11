# EdwinOS structure cleanup — 2026-10-10

## Scope and source evidence

Baseline: `34d4e64` (clean working tree at start).
Baseline CSS SHA-256:
`d2f3d202e5e10ba4734a9649cee61c26c7d29a51c96855da3f4c83268c3fbfeb`.
Initial candidate CSS SHA-256 (superseded by the correction below):
`2343eb550d285085aad933d5f020c82ba7f34a05e9fb1156b4fe92d39eee9ecf`.

Corrected candidate CSS SHA-256 (2026-10-11):
`656635c971c558f9f2a8215b2f94aca4bbd5a7f5c5568de9d2c6940a0246e6ed`.

## 2026-10-11 fragment correction

The initial validation below missed a dynamic selector intersection. Native
Safari 27.0.1 found four failing Archive-year fragment scenarios (1280/390,
light/dark): moving Archive after Fragment Targets let its equal-specificity
H2 `margin: 0; padding: 0; border: 0` override the pinned heading's spacing and
border. At 390px, heading height changed from 49.78125px to 31px. Therefore the
initial candidate was **not** fully equivalent despite its ordinary-state passes.

The correction moves the complete four-rule Fragment Targets owner after
Archive and before Content Hubs. Selector/declaration values and internal rule
order remain unchanged; no extra stylesheet, duplicate rule or `!important`
was added. The shared state once again wins Archive's heading resets, as in
the original `34d4e64` baseline. Math/table/PDF/image/link selectors crossed by
the move do not target headings; Friends' higher-specificity important margin
rules still win. Archive-specific typography exceptions are not the entirety
of its shared dependencies: the dynamic Fragment owner is also a consumer.

Structure tests now bound Archive at Fragment Targets, require a single
four-rule Fragment owner after Archive, and match the actual final-zone marker
rather than the similarly named stylesheet table of contents. Browser checks
cover actual hash-owner activation, pinned (explicit test-only pre-fade hold),
native fading, reader-input release, and no-hash document exit. Reader release
does not remove pinned/fading chrome in production; a document exit does.
Search query captures require stable nonempty valid result links and compare
their destinations between sides.

Reverification artifacts use `/tmp/edwinos-fragment-fix-4aol6e/` and compare
against the original pre-Astra baseline, not only the defective candidate.
The prior failing Safari record remains in `/tmp/edwinos-safari-review-bl6Hak/`.

### Correction verification

All correction runs use the original `34d4e64` CSS hash above. Native Safari
27.0.1 executes the built site's original JavaScript and local assets in fresh
same-origin frames, not a Chromium user-agent substitution. These frames test
responsive CSS, not an actual iPhone's safe area, keyboard or browser chrome.

- `safari-raw94.json`: 94 scenarios completed, no state errors. All 78 ordinary
  scenarios passed across Overview, Friends, Archive, ENotes, More Experiences
  and PHIL 206, including theme, breakpoint, search and drawer checks. Five of
  the 16 fragment scenarios retained differences: a 1px natural scroll offset
  on each, plus one avatar hover transform. Heading dimensions, spacing and
  border match the original; this is **not** a 94/94 pass.
- `safari-identity-fragments.json`: original CSS versus itself, 16 scenarios,
  seven recorded differences, all with the same 1px natural-scroll fluctuation;
  one case additionally differs in Material's scroll-dependent back-to-top
  state. This control demonstrates capture/runtime variability, not universal
  equivalence of the natural scrolling trajectory.
- `safari-aligned-fragments.json`: 16 Archive fragment scenarios at 1280/390,
  both themes, pinned/fading/reader-release/document-exit; zero computed-style
  or geometry differences. The actual owner first activates the state; an
  explicitly reported test-only scroll then fixes the capture viewport.
  No tolerance was added and no production positioning code was changed.
  Restored heading heights are 57.171875px at 1280 and 49.78125px at 390.
- `chromium-fragment-negative.json`: four pinned/fading cases against the
  defective pre-fix candidate all fail as expected. The strengthened check
  detects the real margin/padding/border and heading-height regression.
- `ordinary-final-fresh.json`: 120 independently loaded baseline/candidate
  scenarios, all six routes at 1440/390 in both themes with
  rest/search/query/close/drawer; zero computed-style or geometry differences,
  no skipped states, exit 0. All 24 query captures load 20 stable result links
  per side with identical destinations. This run does not request PNGs.
- `chromium-fragment-fixed.json`: 48 independently loaded Archive/Friends/
  PHIL-heading cases at 1440/390 in both themes, all four lifecycle states;
  zero computed-style or geometry differences, exit 0. This completed run
  preceded the final visible-TOC prerequisite and initial-theme setup below.
  The PHIL H1 used here is not a secondary TOC entry; this matrix alone cannot
  prove a selected-to-unselected hand-off.
- `chromium-toc-release-initial-theme.json`: the final checker uses the actual
  PHIL lecture heading listed in the desktop secondary TOC. Both themes pass
  with one visible, selected target link **before** reader ArrowDown and zero
  selected links afterward, on both original and corrected CSS. No style or
  geometry differences, exit 0. The guard's unit negative control rejects a
  visible target with zero prior selection. Ordinary state initialization is
  unchanged by the fragment-only media-scheme setup.
- `chromium-archive-final-tool.json`: after all checker amendments, all eight
  mobile Archive lifecycle cases (390px, both themes, four states) complete
  with zero style/geometry differences and no skipped states, exit 0.
- The preceding `chromium-toc-release-final.json` and
  `chromium-toc-release-recheck.json` correctly report errors, not equality:
  both pass the light case, then lose the requested hash during dark-theme
  initialization. The final fragment setup loads the requested light/dark
  media scheme before navigation, avoiding the test's late palette/layout
  disturbance; it retains the strict requested-hash assertion. No production
  theme, navigation or scrolling code was changed to accommodate the test.
- Capture errors are saved before context cleanup. Cleanup has its own bounded
  timeout and cannot replace the primary error; unit mocks exercise both
  timeout diagnostics and primary-error preservation.
- Chromium screenshot/frame stalls are retained as errors or interrupted runs,
  never reported as pixel equality. Even the bounded software-renderer pinned
  PNG probe timed out (`chromium-fragment-pinned-pixels.json`). Separate native
  visual inspection is therefore important. After a temporary unlock, native
  Safari's paired Archive view was inspected and saved as
  `safari-archive-comparison.jpg`. Its displayed three-difference summary was
  captured during a prior pointer-hover state; the image itself was taken
  after moving the pointer away. A second pointer-neutral pair measurement
  has zero differences (including heading rectangles) in the retained
  `safari-aligned-fragments.json` `fragmentCase`. The Mac locked again before
  that updated summary could be screenshotted. The completed 16-case matrix
  and the pointer-state screenshot/measurement are not treated as pixel
  equality evidence.
- All 120 Python tests and all nine `tools/test_*.cjs` files pass, including the
  new checker guard, readiness and diagnostic-timeout tests. `git diff --check`
  passes. Source and built-site CSS hashes both match the corrected hash.
- Final strict build passes in `/tmp/edwinos-fragment-final-build-diSJmm`, with
  all 39 Archive entries and the prebuilt 927-record Lunr index. Its separate
  output leaves the running comparison site's assets unchanged. The current
  repository preview remains available at `http://127.0.0.1:8000/`.

The Safari harness and reports live in the correction artifact directory above;
they are local temporary verification evidence, not deployed website assets.

## Initial cleanup evidence

Production changes are confined to `docs/stylesheets/edwinos.css`. Content,
templates, JavaScript runtime, search worker, JSON payloads, storage and event
ordering are unchanged. The mobile drawer glass-clearance calculation remains
unchanged. No deployment is included.

| Change | Equivalence argument |
| --- | --- |
| Archive base/theme/responsive rules moved beside its final sizing and pending-navigation feedback | Initial move missed the shared Fragment intersection; corrected on 2026-10-11 by restoring Fragment's post-Archive priority. Body-copy identity alone was insufficient |
| 181 HOME selector triplets in 105 rules reduced to pairs | The two body classes are grouped with equal specificity; `:has()` stays a separate top-level fallback, preserving unsupported-browser invalidation. Independent inverse expansion matched original selectors, contexts and declarations |
| Removed superseded heading/date/year/section-title font declarations and duplicate section-title letter spacing | Later rules cover all original selector members with equal or greater importance; retained all remaining properties |
| Removed superseded dark background rule | Later exact selectors retain the important background assignment |
| Removed old 76.25–88em source-facts font/gap block | Later min-76.25em owner covers its full interval and both properties |
| Removed unused mobile-header-control-space token | No CSS, JS or template consumer in the repository |
| One star/fork SVG token pair for header and drawer | Identical data URLs, all four alias consumers redirected, no runtime consumers of deleted aliases |
| Removed orphan headings/comments; fixed grouped-selector indentation | Whitespace/comments only |

The remaining audit candidate is a covered `border-bottom-color` longhand inside
a Header shorthand. It is intentionally **not** an instruction to delete the
whole shorthand, which still supplies width/style. General specificity and
component dependencies require manual review beyond this conservative inventory.

## Maintenance improvements

- Archive ownership and shared typography exceptions are enforced by tests.
- The route-group test protects the separate `:has()` fallback.
- `UI_MAINTENANCE.md` maps editing tasks to CSS, content, template, runtime and
  generated-data owners, including cross-file events and deferred debts.
- `audit_ui_css.cjs` inventories browser CSSOM and offers conservative review
  candidates; it does not modify CSS. Its selector/context/importance logic has
  Node-only tests.
- The browser checker now activates search through its real pointer/form path
  instead of bypassing the runtime close/reopen guard; it no longer clears an
  obsolete query-storage key. Pixel failures retain both PNGs. Archive hover is
  an explicit supported test state.

## Inventory

| Metric | Baseline | Initial candidate |
| --- | ---: | ---: |
| Source lines | 9,028 | 8,772 |
| Source bytes | 275,942 | 268,596 |
| Raw `!important` occurrences, excluding comments | 1,830 | 1,823 |
| Browser qualified style rules | 1,054 | 1,050 |
| Browser selector-list members | 1,924 | 1,736 |
| CSSOM-expanded properties | 8,243 | 8,229 |
| Conservative covered-property candidates | 18 | 1 |

Counts do not establish universal dead code. In particular, the remaining
`!important` usage is not treated as permission for wholesale removal.

## Validation record

Local artifacts are in `/tmp/edwinos-ui-cleanup-izV7xz/`; these are temporary
review evidence, not deployable assets. JSON reports retain hashes, configuration,
dependency versions and failures. Playwright 1.62.1 and pngjs 7.0.0 were used with
local Microsoft Edge (Chromium).

- Archive-only movement: 12 cases, widths 1440/769/768/481/480/390, both themes;
  no measured style, geometry or screenshot differences (`archive-move.json`).
- Intermediate combined cleanup: 84 HOME/Friends/Archive cases over 14 widths;
  no measured differences (`profile-matrix.json`). This matrix preceded the
  compatibility correction to the separate `:has()` fallback; independent static
  inverse expansion verifies the final grouping. Do not describe it as a final
  candidate-hash run.
- Final selector version, independently loaded baseline/candidate documents:
  12 HOME/Friends/Archive cases at 1440/390, both themes; no measured differences
  (`fresh-final.json`). Only orphan comments were removed afterward.
- Final Archive hover: four cases at 1440/390, both themes; no measured
  differences (`archive-hover.json`).
- ENotes, More Experiences and the long PHIL 206 article: 72 cases at
  1440/1219/844/390, including rest/search/query/close/drawer at 1440/390;
  zero computed-style or geometry differences. Five empty mobile-search
  screenshots differ by 11–14 glass-edge pixels (`article-final.json`), with
  maximum channel delta 1–2, matching the baseline-only control's locations and
  amplitude. The strict pixel check correctly exits 1; it is not an all-pass run.
- Mobile fresh-page search/query/close/drawer: eight cases, no style or geometry
  differences; one empty-search screenshot differs at 11 edge pixels
  (`search-fresh-final.json`).
- Baseline-versus-itself search control: 16 cases; empty mobile search has
  11/15 differing edge pixels, maximum channel delta 1/2 on a 0–255 scale
  (`search-identity.json`). The same locations appear in candidate comparisons.
  These remain recorded failures, not a tolerance-adjusted pixel pass.
- 119 Python tests and all `tools/test_*.cjs` tests passed.
- Normal-motion declarations: 12 HOME/Archive cases at 1440/768/390, both
  themes, without the motion-freezing stylesheet; zero declaration differences
  (`motion-final.json`). This does not measure full animation trajectories.
- Final strict build passed, including prebuilt Lunr output for 927 records:
  `EDWINOS_NODE=<local-node> .venv/bin/mkdocs build --strict --site-dir <temporary-output>`.
  A separate output directory kept the running A/B tests' site immutable.
- Live preview smoke: query `reward` returned results; Escape closed search and
  emptied the visible input; HOME → Archive instant navigation mounted all 39
  cards, retained Profile, and cleared pending feedback. ENotes drawer at the
  preview's mobile width placed the first row at 78.398px with 78.4px padding,
  retaining the pre-existing glass-clearance fix. Preview was restored to HOME
  and reloaded to clear the test query.

## Limits and follow-ups

The initial matrix did not establish full equivalence: the uncovered Fragment
regression and its correction are recorded above. Screenshot comparisons exclude changing clocks and
visitor widgets, block external requests, and normally freeze motion. Edge
glass rasterization has a reproducible self-comparison noise floor; no production
style or optical code was changed to hide it. These initial runs did not measure
Safari/iPhone or Firefox; the correction adds native macOS Safari review, not an
iPhone true-device test. Review the live preview before authorizing deployment.

Profile's homepage/runtime/JSON-LD duplication, the remaining historical Overview
rules and source-facts compatibility paths remain documented follow-up migrations.
They were inspected but not rewritten without separate behavioral baselines.
