# EdwinOS CSS equivalence checks

`check_ui_equivalence.cjs` compares two stylesheets against the same built
HTML/JS input. It reloads the baseline document before every scenario, resets
theme, search, drawer, query, focus and scroll state, then compares the
candidate. Neither stylesheet is modified by the checker.

Before editing CSS, save a baseline outside the repository and build the site:

```sh
.venv/bin/mkdocs build --strict
node tools/check_ui_equivalence.cjs /absolute/path/to/baseline.css
```

The checker guard/query-readiness unit tests need only Node:

```sh
node tools/test_ui_equivalence.cjs
```

For Overview prose defaults and component type hierarchy, also run:

```sh
node tools/test_overview_typography.cjs
```

This Playwright check uses the built site without external requests. It covers
six widths in both themes, native About disclosure keyboard toggles, contribution
notes, and injected future prose/list/caption/empty/award states. It asserts that
ordinary component CSS can override inherited type without `!important`.
It supports `SITE_DIR` and `BROWSER_EXECUTABLE`; it is not a screenshot or
Safari/iOS test. Use the A/B checker alongside it for existing visual contracts.

Node must be able to resolve `playwright` and `pngjs`, and Playwright must have
access to Chromium. These are optional developer dependencies and must not be
added to the MkDocs deployment environment. For a reproducible run, provision
pinned versions in a separate tools directory, expose it through `NODE_PATH`,
and retain the dependency versions recorded in the JSON report. A locally
installed Chromium/Edge may instead be selected with `BROWSER_EXECUTABLE`.

## Configuration

All array settings are JSON, including when they contain only one value.
`ROUTES`, `WIDTHS`, and `STATES` must be non-empty, state names and motion modes
are validated, and a run in which every scenario is skipped fails rather than
reporting an empty success.

| Variable | Meaning |
| --- | --- |
| `CANDIDATE_CSS` | Candidate file; defaults to the working tree's EdwinOS CSS. |
| `SITE_DIR` | Built site; defaults to repository `site/`. |
| `REPORT` | JSON report path; defaults to `/tmp/edwinos-ui-equivalence.json`. |
| `ROUTES` | JSON array of site paths. |
| `WIDTHS` | JSON array of viewport widths in CSS pixels. |
| `STATES` | JSON array of interaction states. |
| `STATE_WIDTHS` | Widths that run every requested state; other widths run `rest` only. |
| `SCREENSHOT_WIDTHS` | Widths eligible for pixel screenshots. |
| `SCREENSHOT_STATES` | States eligible for screenshots; defaults to `["rest"]`. Add interaction states explicitly when needed. |
| `MOTION` | `reduce` (default) or `no-preference`. |
| `FREEZE_MOTION` | `1` (default) stabilizes ordinary comparisons; use `0` to retain transitions and animations. |
| `MOTION_PROPERTIES_ONLY` | `1` compares only computed motion declarations and automatically disables the default motion freeze. Explicit `FREEZE_MOTION=1` is rejected. |
| `COMPARISON_MODE` | `same-page` (default) or `fresh-page`; see below. |
| `BROWSER_EXECUTABLE` | Optional path to a local Chromium-compatible executable. |
| `BROWSER_ARGS` | Optional JSON array of nonempty browser launch arguments; defaults to `[]`. Recorded verbatim in the report. |

The default matrix covers Overview, Friends, Archive, ENotes, More,
and a long article in both themes. Interaction states run at 1440/768/375 px;
other widths check `rest`. For Profile, add its exact responsive boundaries and
restrict routes to pages with the Profile shell. For prose/list changes, include
the Markdown learning article with task lists.

Available states are:

- Core: `rest`, `search`, `query`, `close`, `drawer`, `scrolled`.
- Components: `profile-hover`, `profile-focus`, `friend-hover`, `archive-hover`, `tab-hover`,
  `source-hover`, `palette-hover`, `search-hover`, `search-focus`, and
  `drawer-button-hover`.
- Heading fragments (fresh-page only): `fragment-pinned`, `fragment-fading`,
  `fragment-released`, `fragment-cleared`. Every route must include an existing
  heading hash. These are opt-in; the ordinary matrix is not fragment coverage.

Only request a component state on routes and widths where its target exists and
is visible. `close` opens search, enters `reward`, asserts the activation, waits
200ms, then uses trusted `Escape` input and asserts that the production owner
emptied the query and closed the checkbox. It does not manually clear the query
or close the checkbox. Its two-pass capture also checks the settled closed
state; the timer alone does not prove deferred frame-focus ordering when a
browser's compositor is stalled. `scrolled` fails the run if a scrollable document does not move; a
genuinely non-scrollable page is recorded in `skipped` instead of aborting the
matrix.

`query` must load nonempty, valid search-result destinations that remain stable
for 300ms; an empty/unready worker fails after 15 seconds instead of passing on
the input value alone. Reports retain both result counts and destination lists,
and different destination lists fail the A/B comparison. `close` still tests
the early-close lifecycle, not result loading.

### Fragment lifecycle regression

Archive headings and shared fragment chrome intersect at equal specificity.
Moving either owner can change the heading padding, margins and border even
when every moved declaration is unchanged. Include this intersection explicitly:

```sh
COMPARISON_MODE=fresh-page \
ROUTES='["/HOME/Archive/#archive-year-2026"]' \
WIDTHS='[1440,390]' STATE_WIDTHS='[1440,390]' \
STATES='["fragment-pinned","fragment-fading","fragment-released","fragment-cleared"]' \
SCREENSHOT_WIDTHS='[1440,390]' \
SCREENSHOT_STATES='["fragment-pinned","fragment-fading","fragment-released","fragment-cleared"]' \
node tools/check_ui_equivalence.cjs /absolute/path/to/baseline.css
```

Each side navigates with its hash intact and re-enters through the real
`block-links.js` hashchange owner using a checker-dispatched notification after
theme/control settling. It does not claim that notification is trusted browser
input; the destination is a naturally loaded hash URL, and the reader-release
key is trusted. The checker asserts that this owner added the
pinned class; it never fabricates the class. Fragment fresh pages load with the
requested light/dark media scheme before navigation. Changing the palette only
after initial anchor alignment can alter article geometry and let Material's
tracking rewrite the intended hash; the capture still fails if the requested
hash is lost, rather than silently restoring it. Ordinary state setup is
unchanged. Only `fragment-pinned` uses a
test-only MutationObserver to remove later fading additions, holding the
already-proven 500ms state long enough for deterministic capture. This hold is
recorded in the report and dies with the fresh page. `fragment-fading` waits for
the owner's real fade timer. Default motion freeze compares the fade's terminal
style, not its interpolation.

`fragment-released` waits for that same fade, then sends a reader `ArrowDown` key
and asserts that no explicit TOC selection remains. Production deliberately
retains pinned/fading highlight classes after reader input: release is not
highlight removal. Archive has no secondary TOC, so also run a heading route
with a visible TOC when testing the selection-release mechanism itself.
For a visible matching secondary TOC link, the checker first requires that
link to be explicitly selected, then records the before/after counts; it
cannot pass on `0 → 0`. Archive and hidden mobile TOCs record the selection
prerequisite as not applicable, separately from the actual reader input.
For example, PHIL's `#phil-206-notes` H1 is not listed in the secondary TOC;
use `#lecture-1-early-modern-philosophy-technical-definition` at 1440px for the
positive selection-release check, not a heading whose matching link is absent.
`fragment-cleared` navigates to a fresh document without the hash and asserts
that the owner left no highlights. Clearing a hash alone does **not** remove
heading classes in the current runtime; this state does not claim otherwise.

Use only generated heading IDs. Archive's current hero `<h1>` has no ID, so it
cannot be reached by a genuine hash and is not synthetically assigned one by
the checker. Any future ID-bearing Archive hero must join this matrix.

### Comparison modes

`same-page` reloads a clean baseline document for every scenario, captures it,
then swaps the stylesheet at its original cascade position and recreates the
same state for the candidate. This is the faster default and keeps both sides on
one identical runtime-generated DOM.

`fresh-page` loads baseline and candidate into separate new documents. Each
document receives its stylesheet during its initial request, so CSS-sensitive
runtime initialization cannot leak between sides. Use it for a smaller targeted
matrix whenever a migration interacts with JS, observers, initial geometry or
theme setup:

```sh
COMPARISON_MODE=fresh-page \
ROUTES='["/","/HOME/friends/"]' \
WIDTHS='[1440,768,375]' \
STATE_WIDTHS='[1440,768,375]' \
node tools/check_ui_equivalence.cjs /absolute/path/to/baseline.css
```

For an interaction-sensitive migration, opt those states into screenshots:

```sh
STATES='["rest","search","query","close"]' \
SCREENSHOT_STATES='["rest","search","query","close"]' \
node tools/check_ui_equivalence.cjs /absolute/path/to/baseline.css
```

The report records source SHA-256 hashes, tool dependency versions, the exact
configuration, state assertions, geometry, computed-style differences (including
`::before`, `::after` and `::marker`), and screenshot pixel differences. It is
written initially, before/after scenarios and after every route. The
`currentScenario` field identifies interrupted work. Each state capture has a
30-second diagnostic bound (a stall is an error, never an empty success).
This is not a total-run deadline: loading and cleanup have separate bounds.
Fresh-page errors are persisted before context cleanup; each close operation
has a 10-second diagnostic bound, and `cleanupErrors` cannot replace the
primary capture failure.
`status` is `running`, `complete`, or
`error`; an error report includes the exception, while unavailable states are
listed under `skipped`. Identical stylesheet hashes produce a warning because
such a run cannot exercise an A/B difference.

When pixels differ, the checker also saves the baseline/candidate PNG pair
beside the JSON report and records their paths in the failure. Compare identical
CSS first when diagnosing render noise; do not discard failures or add a broad
pixel tolerance to force a pass. Search activation follows the existing form's
pointer/click handlers, including its close/reopen guard. Query resets go through
the input owner rather than an obsolete or additional storage key.

Exit codes: 0 means no measured differences, 1 means differences, and 2 means
the checker failed. Missing routes and failed state assertions fail the check.

If an installed Chromium-compatible browser stalls on renderer frames or
screenshots, a diagnostic run may use
`BROWSER_ARGS='["--disable-gpu","--use-angle=swiftshader"]'`. This changes the
test compositor, not production CSS. Retain the failed/stalled report and the
new report's exact flags; do not count a screenshot timeout as a CSS mismatch
or as pixel equality. Software-rendered output cannot establish the hardware
compositor's precision equivalence; retain separate native-browser review.

## Scope and limitations

- Both sides use the same local assets. External network requests are blocked;
  external font/MathJax/API/visitor-map success paths are not validated.
- Animations and transitions are disabled by default for ordinary comparisons.
  Motion-only mode retains and compares their declarations, but neither mode
  validates a full animation trajectory.
- Fragment states cover the actual heading-owner class lifecycle with the
  explicit pinned capture hold described above. They do not prove same-document
  hash clearing, search `h`-parameter/body-match landings, every fragment target
  type, or a continuous fade trajectory.
- Search, drawer and palette states synchronize the existing DOM controls and
  selector-driving body attributes. This is not a replacement for real
  click/keyboard/instant-navigation smoke tests on the live local preview.
- Screenshots are viewport-sized and opt-in by width/state. Computed styles and
  geometry also cover offscreen main content, but not every page/state/browser.
- The checker runs Chromium. Safari/WebKit and Firefox rendering still require
  their own browser review for precision-sensitive changes.
- Review specificity, importance, media interval coverage, selector consumers
  and runtime behavior before deleting CSS. A passing matrix does not prove
  unused CSS, universal browser equivalence, or permission to change DOM, JS or
  content in the same migration.

## Read-only cascade inventory

```sh
node tools/test_audit_ui_css.cjs
node tools/audit_ui_css.cjs docs/stylesheets/edwinos.css /tmp/edwinos-css-audit.json
```

The inventory uses the same optional Playwright/Chromium environment as above.
It records source hash, browser version, CSSOM rules and expanded declarations.
Selector-list members are parsed without splitting commas inside `:is()`,
`:has()` or attributes. A candidate requires later coverage of **every** member
with the same selector/property and sufficient importance, in the same or a
broader simple media/supports context. Custom properties are excluded because
they are runtime interfaces. Unit tests need only Node, not a browser.

This deliberately does not solve general selector implication, media arithmetic,
layers, nested CSS, browser compatibility or dynamic state. CSSOM parsing reports
what this browser understands, and shorthand expansion is not the original
source spelling. A covered longhand inside a shorthand does **not** make the
entire shorthand dead; compatibility fallbacks may also remain useful. Counts
of expanded properties/important properties are not raw source declaration
counts. Review source consumers and prove equivalence before any deletion.
