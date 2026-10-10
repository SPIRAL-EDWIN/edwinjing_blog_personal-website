# Search interaction verification — 2026-10-10

The current glass shell and two-line result layout remain the UI contract.
Search query memory, snippet fitting and navigation were changed at their
existing owners; superseded closing/query and continuous-excerpt logic was
removed. No additional UI framework, stylesheet or document highlighter was added.

## Behaviors

- One same-origin localStorage memory survives document, instant, history and
  new-tab navigation. Closed search displays an empty input/placeholder;
  reopening restores the latest query. Reloading any tab publishes a reset
  generation, clearing other tabs too. IME compositions finish before reset.
- The startup bridge removes q/query on reload before Material initializes;
  destination h and fragment remain intact. Restricted storage retains a
  usable document-local fallback.
- Worker snippets describe the first accepted body keyword in their indexed
  section, independent of ranking, then offer up to three contextual excerpts.
  The existing visible-row fitter reserves the first keyword/context, adding
  later excerpts within its two-line width budget. Distant excerpts use ellipses.
- The fragment owner positions that first body keyword approximately one third
  below the header, with a document-bottom clamp. It validates Material marks
  against retrieval word boundaries and reveals necessary native details.
  Search focus and reader movement cancel delayed positioning.
- Native cross-document result loading and the deferred worker startup remain.
  Existing strict phrase/ranking and IME/search-math behavior are preserved.

## Controlled scroll comparison

Temporary loopback-only static servers served identical built pages with old
scripts and either the original stylesheet or only its obsolete root
scroll-padding-top rule removed. They did not inject MkDocs live reload.
Temporary diagnostics recorded focus, input and scroll calls; those diagnostics
are not repository/site assets.

On Git with gh, the original rule produced document motion during real native
key events (e, d, Backspace): successive keydown positions were 7949.5,
7922 and 7887.5 px. No application scrollTo was called during editing.
The candidate stylesheet kept all three keydown positions at 7682.5 px.
Locator-generated scrollIntoView on activation was identified separately and
excluded from this comparison; current native AX activation also keeps the
document stationary.

## Browser observations

- Desktop 1280×720: Git with gh/#_7 first EDWIN at y286.45 px, consistent with
  a 70 px header plus one third of the remaining viewport. #_8 naturally reached
  the document bottom, with its first EDWIN at y463.19 px.
- Reopening #_8 restored edwin; typing x, deleting twice and typing n left
  scrollY exactly 9383 px throughout, including activation.
- A new Friends tab restored edwin. Its active query jing became empty when
  the article tab refreshed. The refreshed article retained its three body
  highlights and h/fragment.
- Navigation from Friends to Overview and history back kept the closed input
  empty; opening restored jing. Header remained 70 px with one glass shell;
  desktop Overview profile width remained 260 px.
- Mobile 375×812: search shell x8.5, width358, bottom610.16 px; first-match
  snippets stayed two 20 px lines. #_7 first EDWIN at y317.5 px.
- Light/dark homepage and Friends layout remain on the current component
  structure; Friends' Overview capsule remains transparent.
- The real query 忽略规则 exercises the first match inside the .gitignore
  native details. Closed details can still return nonempty client rectangles;
  explicit ancestor-state checks are required before measuring the target.
  Final browser check: matching details open, three unrelated details closed,
  keyword y286.80 px and visibly painted. Screenshot:
  `/private/tmp/edwinos-search-keyword-position.png`.
- The final current-working-tree preview on port 8000 also places #_7 EDWIN at
  y286.45 px with search closed/empty and the 70 px header intact.

## Checks and limits

Strict MkDocs builds, 117 Python checks, 59 search-engine checks over 927 real
index records, worker lifecycle checks, interaction/loader/fragment checks and
search/article math checks pass. Fragment checks are included in the existing
deployment workflow. These checks were completed before the user authorized
publishing through that workflow.

The measurements are local browser interaction evidence, not production speed
scores or a claim of universal browser equivalence. Native document navigation
still takes the network time needed to fetch the destination. Long formulas
remain atomic in excerpts; later matches are optional within the current width.
