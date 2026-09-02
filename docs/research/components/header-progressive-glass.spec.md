# Header Progressive Glass Specification

## Overview

- Target files: `docs/javascripts/ui-perf.js` and `docs/stylesheets/edwinos-overrides.css`
- Reference: <https://tianxingchen.github.io/>
- Reference source: `TianxingChen/tianxingchen.github.io`, `index.html` lines 64–124 and 1720–1744
- Interaction model: fixed visual treatment; no scroll-triggered blur changes

## Goal

The header itself should feel like translucent glass with no visible bottom edge. As body text
moves upward, it must progressively lose contrast and detail before disappearing underneath the
header. Do not render a visibly separate blurred sheet below the header.

## Reference DOM Structure

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

Inject this once as the first child of `.md-header`. It must be idempotent across Material instant
navigation. The glass container and its descendants use `pointer-events: none`.

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

## Current Regression to Remove

- Delete/disable the current `.md-header::before` and `.md-header::after` glass implementation.
  Its 24px core and 48–68px tail create a visible sheet outside the header.
- `extra.css` gives `.md-tabs` an opaque dark background. Because `.md-header__inner` currently
  creates a lower stacking context, the tabs rectangle paints over the central search form.
- In the final layer, force the direct-child `.md-tabs` background and backdrop to transparent in
  both themes, without removing the individual tab-pill backgrounds.
- Do not position the glass above `.md-tabs`, `.md-search`, `.md-header__source`, or palette controls.

## Required States

- Light and dark themes.
- Page top and scrolled body text crossing y=0–122px.
- Search idle, focus/open, populated results, and closed again.
- Desktop 1280px, tablet 768px, mobile 390px.
- Overview, one HOME subpage, ENotes, and More Experiences.

## Acceptance Criteria

- Header computed background is transparent and computed backdrop filter is none.
- `.edwinos-header-glass` exists exactly once after instant navigation.
- Search form is never covered by `.md-tabs` or glass layers.
- No hard line at the header bottom and no detached blurred band below it.
- Search and navigation remain clickable.
- No horizontal overflow or console errors.
- `mkdocs build --strict`, unit tests, and `git diff --check` pass.
