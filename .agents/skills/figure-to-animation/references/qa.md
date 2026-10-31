# Review checklist

- Confirm source rights for the exact version and intended public use; make sure private inputs and derivatives cannot enter build artifacts or network requests.
- Check the whole diagram is meaningful at rest and every step's prose agrees with the source. Check arrow direction, crossings, element ordering and semantic colors.
- At 0/25/50/75/100% scroll, check text is legible, nodes do not disappear prematurely, connectors attach, and no visual state makes an unsupported claim. Reverse scroll and test direct anchor navigation.
- Check desktop, mobile, keyboard, no JS, reduced motion, dark/light palettes and supported browsers. Pinning must not trap focus or obscure content. No repeated animations while offscreen.
- Record frames and video, browser versions, viewport and settings. Playback may need an extra frame for an SVG to paint; do not mistake a screenshot made before paint for a finished state.
- Keep animations on transforms and opacity where possible; SVG strokes are an exception. Limit blur/filter areas, test long labels and avoid per-frame DOM measurements.
- Avoid treating a flattened raster as an automatically correct graph. Occlusion, curved connectors, Greek symbols and subscripted labels are common recognition failures. Validate manually.
- As initial tuning ranges, use 300–800 ms for discrete transitions, restrained perspective and stagger; scrub length depends on content density. These are starting points, not verified properties of any source.
