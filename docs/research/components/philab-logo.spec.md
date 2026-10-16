# Physical Intelligence Lab logo

The supplied image is already a transparent RGBA PNG, 461 x 70. The light asset
is an unchanged copy. The user explicitly requires a pixel edit for dark mode,
not generative redrawing: visible pure-black RGB pixels in the lettering region
(x >= 47) become #e6edf3; all alpha values, the entire phi region (x < 47) and all
colored pixels remain exactly unchanged. The generated previews
were rejected and are not used by the site.

Assets:
- `docs/assets/images/labs/physical-intelligence-lab-light.png`
- `docs/assets/images/labs/physical-intelligence-lab-dark.png`

Layout now follows `philab-experience.spec.md`: logo/main/date columns when
space permits, otherwise logo on its own line above the heading. The earlier
right-of-heading placement was superseded by Edwin's 2026-10-14 request.
The image reserves its original 461/70 ratio in both palettes.

Use explicit intrinsic dimensions, off-glb, lazy loading and async decoding.
Switch light/dark assets with the existing data-md-color-scheme attribute,
without introducing another runtime or stylesheet. Validate desktop/mobile,
both color schemes and strict build. Do not commit or push.
