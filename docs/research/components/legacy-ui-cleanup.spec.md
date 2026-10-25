# Verified legacy UI cleanup — 2026-10-22

## Cause

The light page frame is #f6f8fa, but the inherited Material default background
variable still held #FAF7F0. A later `background` declaration masked this mismatch
on the main frame; it did not replace the variable. About's new tint exposed it.
This was an active stale token, not an unreachable declaration. Formula retry /
status / skeleton surfaces, PDF controls and upstream Material consumers also
read it. The default token now references the existing frame palette in both
schemes. Code block background/foreground stay #f2f2f2/#2e3338 and #242424/#dcddde.

## What was removed

Exact class-token searches across authored Markdown, templates, hook generators,
runtime JavaScript, data and current generated HTML found no consumers of these
16 retired classes: `about-focus-list`, `grid-cards`, `project-card`, `proj-header`,
`proj-year`, `proj-tags`, `education-card`, `education-logo`, `education-info`,
`education-school`, `education-degree`, `education-time`, `timeline-cv`,
`cv-marker`, `cv-desc`, `hover-lift`. The old isolated `.codex/staging` preview
loads its own old stylesheets and does not consume the current EdwinOS entry.

45 exclusive rules were removed; 24 shared rules had only dead selector members
removed. Mixed `:is()` branches retain their live members and specificity; HOME
fallback branches remain separate. `overview-education-*`, CV rows, awards,
visitor badge, current font faces and all other active components remain.

Other proven redundancies removed:

- Old body/header/nav/code fallback font declarations covered by final owners.
- Duplicate frame background-color/image declarations already set by shorthand.
- Duplicate reduced-motion opacity/transform values, retaining animation policy.
- The stale dark header border-color component of a shorthand, retaining live
  width/style and its later important color owner.
- Four old code palette definitions covered by the body-scoped Code Blocks owner,
  plus the redundant Academic dark background-token assignment.
- Visitor card background/border/radius/shadow, old display/overflow/min-height/
  padding, mobile widths and HOME padding. Every current container already has
  the final visitor-badge-panel class, including without JavaScript. Final badge
  image rules also cover the former generic iframe/img/canvas declarations.
  Position/text alignment remain because they still supply live behavior.

The stylesheet has 450 fewer lines (10539 →10089), 50 fewer CSSOM style rules
(1292 →1242), and 123 fewer selector members (1987 →1864). Expanded declaration
counts are browser CSSOM counts, not source declaration counts. The conservative
same-selector/context/importance audit now reports zero candidates; this does
not prove that every possible unused declaration has been found.

## Comparison boundary

Pure deletion is compared using frozen `clean-only-final.css`, retaining the
old palette token solely in that diagnostic file. The deliberate palette fix is
validated separately. Visitor cleanup is compared as a second small step,
including real runtime image success and failure with local network fixtures.
The generic A/B checker hides this external badge, so its ordinary screenshots
alone cannot validate that component.

Baseline SHA-256: `4be31951630c9dee0a4eac90a9d06b8bff18a93858bf8a9c775a711e3113089b`.
Final SHA-256: `cd2239e83c79d91498750a824319c2ed7e595fa389c2c823c59ae67427f5c0b2`.
Diagnostic reports and screenshots: `/tmp/edwinos-css-cleanup/`.
A stable clone of the build is used for final checks so rebuilding cannot remove
HTML files while a routed browser test is reading them.

## Verification

- Strict MkDocs build, 16 architecture contracts, 7 runtime UI contracts,
  12 Overview typography cases, CSS audit/checker unit suites and Math loading
  recovery tests passed.
- Palette probes passed on Overview, a TOC article and the real RFM/PDF page at
  1440/390px in both themes. Formula retry matches the frame; code colors stay.
- Visitor success/failure/focus A/B passed 24 cases across 1440/929/928/577/576/
  390px and both themes, with actual production load/error handlers.
- Static pure-cleanup A/B covered 118 unique route/width/theme cases. All
  computed styles and geometry match; 115 have exact pixel equality. Three
  same-page CSS-swap cases differ only in glass compositor pixels (ENotes768
  both themes, More1440 dark). All corresponding fresh-page pairs match exactly;
  original failure records and stricter thresholds are retained.
- Final fresh-page interaction checks passed 44 cases: query/close/drawer/scroll
  on ENotes/More at1440/375px, plus empty search/close on Overview at1440/768/
  375px, both themes. Earlier same-page search noise and Back to Top lifecycle
  mismatches are retained as diagnostic limitations, not counted as successes.
- Some initial tests read the live build during a rebuild and correctly stopped
  on missing HTML; those interrupted reports are not passes. A frozen build
  snapshot was then used for the complete affected route/interaction checks.


Coverage is Edge/Chromium, with external network fixtures for repeatable checks.
No claim of Safari/WebKit/Firefox equivalence, all animation trajectories or
all third-party loading outcomes is made. Responsive rules with live consumers,
legacy fallback fonts still used by headings/buttons, selector parsing fallbacks,
and upstream Material integration are not dead merely because they are old.
