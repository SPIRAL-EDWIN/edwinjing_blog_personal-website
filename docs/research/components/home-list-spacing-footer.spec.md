# Homepage list spacing and footer

Measured 2026-10-14. Reference: https://tianxingchen.github.io/.

## Evidence and scope

REA controlled browser capture: `ev_5e247ee2ced863ae34e0d525eede322b536ad29ebe0c712eb66f00a98ec4d49b`.
Captured DOM SHA-256: `b6c6a62b0ab7396b063c6bc68d3eaac4e76026887c632e0c75361fb67ee113af`.
REA launched an isolated Edge profile, captured the live DOM and its inline CSS,
and confirmed cleanup. Computed CSS and geometry were measured separately via
Codex's browser at desktop and 390px; REA does not claim those measurements.
The capture is a live observation, not a byte comparison with a pinned deployment.

News/Awards spacing and the homepage footer are in scope. The user's follow-up
also asks to reduce the date-to-body gap without changing fonts.
Keep EdwinOS fonts, colors, outer horizontal list alignment, existing content,
reveal behavior, image loading and all other page footers.

## Measured rules

| Component | Vertical padding | Item margin | Text line height | Single-line bordered height |
| --- | --- | --- | --- | --- |
| Reference News | 7px each side | 0 | 20.25px body; 19.8px date | 35.797px |
| Reference Honors text list | 6px each side | 0 | 18.85px body; 17.4px date | 31.844px |
| Reference Honors at <=680px | 9px each side | 0 | 18.125px body | 37.125px |

The first mobile Honors item wraps and measures 73.375px. Row heights must remain
content-driven. The reference has image honor cards too; only its divided text
list corresponds to EdwinOS's Awards list.

EdwinOS desktop baseline (1280px): News already has 7px padding and zero margins;
its one-line bordered row is also 35.797px. Do not make an artificial News change.
Awards have 12.8px padding per side and a 7.6px bottom margin; a one-line bordered
item is 46.391px, so separator-to-separator distance is about 53.991px.
Reset only vertical Awards margins, use 6px padding (9px at <=680px) and match
the date line-height to 1.45.

For date/body spacing, reference News uses a 72px date column plus a 14px gap,
changing to 56px plus 10px at <=680px. Preserve these widths and correct the
EdwinOS News breakpoint from 850px to 680px. Reference Honors uses a 52px date
column plus 12px gap, changing to 44px plus 10px at <=680px. Apply those values
to Awards, including a two-column mobile layout instead of the older stacking
rule. Font families, sizes and weights remain unchanged.

## Implementation ownership

- Edit the existing Awards section in `docs/stylesheets/edwinos.css`.
- Extend only its existing Visitor Footer section for the merged metadata row.
- `docs/index.md` owns the `Content licensed under CC BY-NC-SA 4.0` link and
  existing copyright/update signature. The metadata group and badge share one
  centered row when space permits; the badge moves intact to a second centered
  row when available width is insufficient.
- `overrides/main.html` omits the Material footer only on root homepage URLs.
  Other routes still call the original footer block. Preserve deployment-time
  attributes and the signature's existing semantics.
- At very narrow widths allow metadata text groups to wrap without overflow.
  Background stays transparent in light and dark modes.

## Copyright reasoning

Copyright arises on creation under Article 6 of the Chinese implementing
regulations: https://zscqj.beijing.gov.cn/zscqj/zwgk/flfg18/436481017/index.html.
The duplicate long copyright sentence and status label are not required for
copyright. Keep the existing license notice to communicate reuse permissions:
https://creativecommons.org/faq/#how-do-i-apply-a-creative-commons-license-to-my-material.
No independent dark footer is needed for that notice.

## Validation

Run `.venv/bin/mkdocs build --strict`, inspect desktop/mobile and light/dark
geometry, check the CC link and native navigation homepage -> Friends -> homepage,
and verify other routes retain their footer. No font, dependency, JS or config change.

## Follow-up: left alignment and weights

The user asks to align News, Education and Honors with the complete heading
component, retaining the heading's decorative dash. At 1280px, EdwinOS's section
and heading start at x=343.516, but News UL starts at 366.016 and its rows at
381.016; Education UL starts at 352.891 and its row at 371.891; Awards UL starts
at 366.016 and rows at 400.016. Reference live DOM at 1280px measures heading,
list and row x=108 for all three components. Horizontal list padding/margins are
zero; reference Honors only has a 16px top margin.

Reset the News/Awards list horizontal margin and padding in their existing
owners, removing mobile rules that reintroduce indentation. Reset Education
list margins/padding with adequate specificity and Education/Awards direct-row
horizontal margins. Preserve vertical spacing, date/body column widths, genuine
About/Experience bullets, timeline geometry and Publication/Workshop card inset.
The deliberate decorative dash remains part of the title component, not a reason
to add a second indentation to the body.

Set award-name strong emphasis to 500, institution and notes to 400, per the
user's explicit response annotation. Keep font families and font sizes.
