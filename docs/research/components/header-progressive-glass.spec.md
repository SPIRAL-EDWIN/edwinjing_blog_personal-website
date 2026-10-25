# Header Progressive Glass Specification

## Overview

- Target files: `overrides/partials/header.html`, `docs/javascripts/ui-perf.js` and `docs/stylesheets/edwinos.css`
- Reference: <https://tianxingchen.github.io/>
- Reference source: `TianxingChen/tianxingchen.github.io`, `index.html` lines 64–124 and 1720–1744
- Interaction model: fixed visual treatment; no scroll-triggered blur changes

## Goal

The header itself should feel like translucent glass with no visible bottom edge. As body text
moves upward, it must progressively lose contrast and detail before disappearing underneath the
header. Do not render a visibly separate blurred sheet below the header.

## Original Five-Layer DOM Pattern

The reference uses a dedicated, non-interactive sibling behind the navigation contents:

```html
<div class="edwinos-header-glass" aria-hidden="true">
  <div class="edwinos-header-glass__layer edwinos-header-glass__layer--1"></div>
  <div class="edwinos-header-glass__layer edwinos-header-glass__layer--2"></div>
  <div class="edwinos-header-glass__layer edwinos-header-glass__layer--3"></div>
  <div class="edwinos-header-glass__layer edwinos-header-glass__layer--4"></div>
  <div class="edwinos-header-glass__layer edwinos-header-glass__layer--5"></div>
  <div class="edwinos-header-glass__fade"></div>
</div>
```

The original pattern uses five layers. Current EdwinOS renders seven before first paint
in the header partial, with an idempotent runtime fallback. The glass container
and its descendants use `pointer-events: none`.

## Exact Reference Mechanism

- Header height: EdwinOS keeps its existing 70px desktop geometry.
- Glass container: absolute, top/left/right 0, height `calc(100% + 52px)`, overflow hidden,
  `z-index: -1` inside an isolated header stacking context.
- Header itself: no border, no box shadow, no background, no `backdrop-filter`.
- Five transparent layers fill the container and use masked backdrop blur:
  - layer 1: blur 3px; mask `transparent 0 38%, #000 58% 70%, transparent 88% 100%`
  - layer 2: blur 6px; mask `transparent 0 18%, #000 36% 52%, transparent 74% 100%`
  - layer 3: blur 10px; mask `#000 0 28%, transparent 58% 100%`
  - layer 4: blur 16px; mask `#000 0 16%, transparent 42% 100%`
  - layer 5: blur 22px; mask `#000 0%, transparent 22% 100%`
- Light fade: `rgba(246,248,250,.90)` at 0%, `.55` at 28%, `.18` at 52%, transparent at 78%.
- Dark fade: same stops using `rgb(13,17,23)`; tune alpha only if pixel QA shows insufficient
  readability, but retain complete transparency by 78%.

At the 70px EdwinOS header bottom, the fade must already be weak and the blur masks must cross
the boundary. There must be no color or blur discontinuity at exactly 70px.

## Historical Regression Guardrails

- Keep `.md-header::before` and `.md-header::after` glass disabled.
  Its 24px core and 48–68px tail create a visible sheet outside the header.
- The historical baseline zone in `edwinos.css` gives `.md-tabs` an opaque dark background. Because `.md-header__inner` currently
  creates a lower stacking context, the tabs rectangle paints over the central search form.
- In the final layer, force the direct-child `.md-tabs` background and backdrop to transparent in
  both themes, without removing the individual tab-pill backgrounds.
- Do not position the glass above `.md-tabs`, `.md-search`, `.md-header__source`, or palette controls.

## Required States

- Light and dark themes.
- Page top and scrolled body text crossing y=0–122px.
- Search idle, focus/open, populated results, and closed again.
- Desktop 1280px, tablet 768px, mobile 390px.
- Overview, one HOME subpage, ENotes, and More.

## Acceptance Criteria

- Header computed background is transparent and computed backdrop filter is none.
- `.edwinos-header-glass` exists exactly once after instant navigation.
- Search form is never covered by `.md-tabs` or glass layers.
- No hard line at the header bottom and no detached blurred band below it.
- Search and navigation remain clickable.
- No horizontal overflow or console errors.
- `mkdocs build --strict`, unit tests, and `git diff --check` pass.

## Superseded eight-layer refinement (2026-10-21)

The reference above remains a five-layer observation. EdwinOS adapts it to eight
static layers at 0.6, 1.2, 2.5, 4, 7, 11, 16 and 22px. Mask opacity uses
intermediate 0.15/0.5/0.85 stops so each endpoint approaches transparency gently.
The smallest radii bridge the former 3px lower band; strongest layers recede
higher in the header. The color fade reaches zero at 64%, while the weakest
blur reaches zero at the existing 74% boundary of the 122px desktop glass field.
This keeps the title/drawer clearance and controls at their existing geometry.

The header partial renders all eight before paint. `ensureHeaderGlass` uses the
same count only if the markup is missing. No scroll-frame updates or second
glass owner are introduced. Validate the 8-layer count, transparent header,
unchanged control rectangles, light/dark scroll passage and search interaction.

## Final restrained refinement (2026-10-22)

Rechecked both live page and GitHub source: the reference still uses five
3/6/10/16/22px layers with masks described above. REA passive evidence:
`ev_5f566333b88bf0225c053734727ff5e2193c7710559e16ea00e140fc548767d6`.
The eight-layer experiment shifted middle-radius fields upward and reduced
bottom-edge blur, concentrating visible loss of detail near the search box.

Current seven layers preserve the local HEAD five-layer mask shapes verbatim.
The 3px layer keeps its existing safety adaptation: transparent0–24%, opaque
44–56%, transparent74%. New low-alpha layers are inserted at1px (peak .55
at64%, zero at74%) and4.5px (peak .5 at44%, zero at66%). Existing 6/10/16/22px
masks retain the reference positions. Tint returns to .9@0%, .55@28%,
.18@52%, then .08@62%, .015@70%, zero74%. No height or control geometry changes.
The template and runtime fallback both render seven; Article TOC stays unchanged.

Validation: strict MkDocs build passed; 32 cold/reload first-paint states passed,
including delayed runtime/fonts and search animation. Independent Edge checks
covered Overview/Friends/ENotes/More at1280/768/390px, both palettes: one header,
seven intended blur radii, transparent header,52px extension, no overflow; search
open/query/close passed in six width/theme states. Scroll passage screenshots
were reviewed. No Safari/iOS equivalence or GPU performance claim is made.
