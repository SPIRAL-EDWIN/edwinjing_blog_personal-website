# PhiLab research experience row

Reference: https://tianxingchen.github.io/, Research Experience, observed 2026-10-14.
Scope: existing homepage Selected Experiences only. Keep EdwinOS typography,
timeline axis and pixel-edited light/dark PNG assets. No configuration/runtime changes.

REA controlled browser capture:
`ev_a1c3b22d4c048a46990ab64ba9b7a2239ff91d0dcba62276b88ac850368c1322`.
Evidence summary: `philab-experience.rea.json`. Captured live DOM and inline CSS
at1440x900 with a temporary Edge profile; profile cleaned up. Computed geometry
below comes from a separate live CUA inspection, not inferred from DOM capture.
Date baseline in EdwinOS light mode: `rgb(20, 121, 109)`, same as award-year.

## Observed reference

Desktop screenshot: `/tmp/tianxing-research-experience.png`.
Mobile screenshot: `/tmp/tianxing-research-experience-mobile.png`.
Static row with three children: logo box, main title/role, side date/place.
At 1280px: row width1064px, grid `240px minmax(0,1fr) auto`, gap28px,
align-items:center, padding16px 0. Logo box240x80px with centered image,
image max-width220px/max-height68px. Main flex column, gap3px, min-width0.
Side right-aligned and vertically centered. Title17px/500; role13.5px/400;
period12.5px/500/nowrap. At768px the same three columns remain.
At390px (reference breakpoint680px), row is single-column, row-gap8px,
padding14px 0; logo box56px tall/image max-width180px; metadata precedes
other content. No interaction needed for static row; title links underline on hover.

## Requested content

- Title: Physical Intelligence Lab, ZJU
- Role: Research Assistant — Physics-based simulation · Whole-body control · Sim2Real · Real-world imitation learning
- Date: Jun. 2026 — Present
- No location. Replace the old title, date and two description bullets.

## Adaptation

Keep cv-title, cv-subtitle, cv-time typography and cv-time's existing green color.
Use a scoped row inside the existing cv-content container. Wide geometry follows
the reference:240px logo box,220px image,80px box height,28px column gaps,
main minmax(0,1fr),date max-content. Logo and entire text block have equal centers.
Reset only row children's inherited margins, using sufficiently scoped selectors.
Retain axis7px/marker14px/content inset41px and current section title.

Use content-width-aware layout: wide only when viewport>960px AND cv-content
has at least760px available. Default narrow layout is one column,12px row gap,
logo190px wide on its own line ABOVE title, text then date. This overrides the
reference's metadata-first mobile order to honor Edwin's earlier requirement.
Keep date visible and left-aligned when stacked. Preserve theme-specific images,
their off-glb exclusion, native loading and original461:70 aspect ratio.
No logo regeneration or font changes.

## Checks

Run mkdocs build --strict and git diff --check. Measure1280/1024/960/640/390px,
including a nearest breakpoint. Verify logo left/center and date right on wide,
logo above title on narrow, light/dark asset switching, matching green date color
and zero horizontal document overflow. Preserve local preview on port8000.

Verified: strict build passed; diff check passed. CUA measured1280px wide row
855.484px, logo/main/date center difference0px, date flush to right edge.
1024/960/640/390px stack;961px is wide because the homepage sidebar has
already stacked. Actual container boundary:1181px viewport ->759.852px content
(stack),1182px ->760.812px (wide). No horizontal overflow at any sampled width.
Date matches award-year in both palettes: light rgb(20,121,109),dark
rgb(63,185,80). Dark PNG fully loaded with natural width461px.
Result screenshots: `/tmp/edwin-experience-dark.png`,
`/tmp/edwin-experience-mobile-dark.png`.
