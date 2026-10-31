# Review checklist

- Confirm source rights for the exact version and intended public use; make sure private inputs and derivatives cannot enter build artifacts or network requests.
- Check the whole diagram is meaningful at rest and every step's prose agrees with the source. Check arrow direction, crossings, element ordering and semantic colors.
- Run the FigureSpec validator in the build: node coordinates are integers and no edge decreases either column or row. Inspect actual paths too: starts and arrowhead tips touch measured card edges, strokes travel only right/down, and no line crosses card content. Resize to confirm anchors update.
- Check hidden/upcoming/shown are respectively invisible, fixed 0.35 without blur, and fully opaque. Previously shown elements stay shown; cards remain opaque and stationary, and no isolated glyph overlaps content.
- Confirm the static figure caption is visible throughout and step captions cross-fade in their reserved slot. Check the final step, pin release and next section with slow scrolling: no blank tail or extra hold. Check snapping and interruption, and verify mobile and reduced-motion never pin.
- When play-once is required, test first traversal, reversing mid-play, completion, scrolling back and down again, instant navigation away and back, hard reload, and jumping past an unseen figure. Confirm completed figures have no trigger or spacer, unseen figures remain eligible, and a nearby landmark stays within the requested tolerance during same-frame scroll compensation.
- For an icon morph, compare the rendered non-background bounds of the whole initial and final glyph at the target CSS size; check center, width, height, stroke thickness, final scale and stable final color. Do not compare only the initial lens or a single path.
- At 0/25/50/75/100% scroll, check text is legible, nodes do not disappear prematurely, connectors attach, and no visual state makes an unsupported claim. Reverse scroll and test direct anchor navigation.
- Check desktop, mobile, keyboard, no JS, reduced motion, dark/light palettes and supported browsers. Pinning must not trap focus or obscure content. No repeated animations while offscreen.
- Record frames and video, browser versions, viewport and settings. Playback may need an extra frame for an SVG to paint; do not mistake a screenshot made before paint for a finished state.
- Keep animations on transforms and opacity where possible; SVG strokes are an exception. Limit blur/filter areas, test long labels and avoid per-frame DOM measurements.
- Avoid treating a flattened raster as an automatically correct graph. Occlusion, curved connectors, Greek symbols and subscripted labels are common recognition failures. Validate manually.
- As initial tuning ranges, use 300–800 ms for discrete transitions, restrained perspective and stagger; scrub length depends on content density. These are starting points, not verified properties of any source.
