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

The default matrix covers Overview, Friends, Archive, ENotes, More Experiences,
and a long article in both themes. Interaction states run at 1440/768/375 px;
other widths check `rest`. For Profile, add its exact responsive boundaries and
restrict routes to pages with the Profile shell. For prose/list changes, include
the Markdown learning article with task lists.

Available states are:

- Core: `rest`, `search`, `query`, `close`, `drawer`, `scrolled`.
- Components: `profile-hover`, `profile-focus`, `friend-hover`, `tab-hover`,
  `source-hover`, `palette-hover`, `search-hover`, `search-focus`, and
  `drawer-button-hover`.

Only request a component state on routes and widths where its target exists and
is visible. `close` deliberately opens search, enters and clears a query, then
closes it. `scrolled` fails the run if a scrollable document does not move; a
genuinely non-scrollable page is recorded in `skipped` instead of aborting the
matrix.

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
written initially and after every route. `status` is `running`, `complete`, or
`error`; an error report includes the exception, while unavailable states are
listed under `skipped`. Identical stylesheet hashes produce a warning because
such a run cannot exercise an A/B difference.

Exit codes: 0 means no measured differences, 1 means differences, and 2 means
the checker failed. Missing routes and failed state assertions fail the check.

## Scope and limitations

- Both sides use the same local assets. External network requests are blocked;
  external font/MathJax/API/visitor-map success paths are not validated.
- Animations and transitions are disabled by default for ordinary comparisons.
  Motion-only mode retains and compares their declarations, but neither mode
  validates a full animation trajectory.
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
