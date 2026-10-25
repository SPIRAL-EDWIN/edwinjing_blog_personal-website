# About background and header transition reference

Inspected 2026-10-21: <https://tianxingchen.github.io/>.

## Evidence and scope

REA `inspect_web_page` observed the selected reference page through an owned
Edge CDP session: `ev_7d1e27b886057e5b41bf0fb89e57f75f878e10db5af14e43932eb2512e49b034`.
The DOM capture contains 4,300 nodes with no truncated sections. Third-party
resources and unrequested accessibility, console, storage and script content
were excluded. This is a bounded page inspection, not complete network or
cross-browser coverage. Separate Playwright computed-style measurements at
1600 x 1050 confirmed the CSS below; REA did not execute those measurements.

## Observed reference

The reference's atmospheric `.intro-bg img` is distinct from its sharp right
portrait. Its filter is `blur(2.5px) saturate(.8) brightness(1.12)`, opacity
`.46`, and its horizontal alpha mask fades between 42% and 88%. Horizontal
and vertical white tints further reduce contrast. At narrow widths the image
uses 2px blur and .36 opacity. A clear portrait is therefore not a faithful
substitute for the atmospheric background layer.

The reference's fixed header has five overlapping masked backdrop-blur layers
(3, 6, 10, 16 and 22px), not one uniformly blurred rectangle. Their container
is 108px high at this viewport (56px navigation plus 52px). A separate tint
fades through .9, .55 and .18 to transparent at 78%. This header treatment
is independent of the photo's permanent image filter.

## Historical adaptation (superseded)

About Me retains the authored direct introductory paragraph and native details.
Its right-aligned photo is a background, so image dimensions never create a
grid row above the text. The image uses the observed 2.5px filter with .6
opacity and a restrained theme-colored veil. This deliberately preserves more
recognition than the reference's .46 opacity plus two tints. A left alpha
transition blends into the copy; there is no right or bottom edge fade.

Desktop photo width is capped at 54% / 680px and height at 265px. About's
minimum height is capped at 255px; expanded prose remains intrinsic. At
1600px the previous 432px section becomes 255px, removing 177px of unused
height. Mobile uses a separate 360px-wide image in its authored intrinsic ratio after the copy.
The header's eight-layer adaptation is documented separately in the Header
Progressive Glass specification and shares its existing template/runtime owner.

Validation and screenshots are bounded Edge/Chromium evidence; they do not
establish Safari/iOS compositor equivalence.

## Verification (2026-10-21)

Strict MkDocs build and source ownership checks passed. Sixteen Overview
width/theme cases (1600, 1280, 1024, 769, 768, 681, 680 and 390px, both
palettes) confirmed decoded images, intended image filters, stable photo
position on profile disclosure, no horizontal overflow, normal heading gaps
and compact News spacing. Header/profile control rectangles match the prior
stylesheet at 1600/390px in both themes. Friends, ENotes and More retain one
eight-layer header without the About photo; ENotes search open/query/close
works in both palettes and widths. Thirty-two cold/reload header cases passed
the existing first-paint regression. No Safari/iOS or GPU performance claim
is made by these Edge checks.

## AI panorama (2026-10-21, sizing since superseded)

The selected asset is now an AI left-side outpaint, 1914 x 822, generated from
`IMG_2622.JPG`. The camera/lens and dusk scenery were completed to make the
photography action legible. The original file and original WebP variants remain
unchanged. The selected full-resolution PNG and generation prompt are retained
under `experiments/portrait/photography-outpaint-2026-10-21/`.

The authored image dimensions and mobile aspect ratio match the panorama.
`object-fit: contain` preserves the new left canvas across viewport widths;
retaining the former right-aligned `cover` would remove the entire addition
in the old 4:3 mobile frame. The desktop frame remains 54% / 680px with its
existing 210–265px height, and the About minimum-height cap stays 255px.
CSS blur, opacity and palette treatment remain unchanged.

## Content-driven background (2026-10-22)

The current About section uses three explicit Grid rows: heading, direct introductory
paragraph, and native Detailed Profile. A size-contained background spans only the
first two rows. Its absolute picture is top/right anchored, height 100%, width auto,
and retains the 1914:822 panorama ratio. There is no mobile in-flow image or fixed
photo height/percentage width. Expanded details do not resize the background.

The wrapper extends to the viewport right edge using the HOME gutter. Its left
edge clips overflow when text wrapping makes the image wider. The face remains
on the right; on very narrow screens the left camera/scenery may be clipped.
A viewport-relative palette veil preserves readable text when the source-relative
left transition is outside the visible crop. The original 1.25px image blur and
4px/12px source-left backdrop fields retain a smooth blend, with no right/bottom
mask. Mobile photo opacity is .46 (light) / .42 (dark).

This is a deliberate adaptation of the reference's background mechanism, not
its height rule: live measurements at 1440/960/768/680/500/390px with viewport
height 900 found `.intro-bg` height 738px (`82svh`), top 0, and image
height 100% / width auto. The reference does not flow its background below the
text at its mobile breakpoint. Its separate sharp avatar is another element.
REA evidence: `ev_c49d85f8615141acf2fac5c8d17a70cc9bbdfa41fa90b69c99f2d4797c8d0d6d`.

Edge resize verification covers 15 widths from 360 to1920px in both palettes.
Background top equals section top; bottom equals introduction bottom; Details
open/close preserves picture height; no horizontal overflow. At 1600px the
photo is 433 x186px; at390px it grows to791 x340px behind the text. Normal
News spacing is23–37px, rather than an image-created blank row.

## Palette correction (2026-10-22)

All three About photo tints now use a local `--about-surface`, referencing
`--github-frame-light-bg` / `--github-frame-dark-bg`. The legacy Material default
light background token is warm ivory, whereas the rendered HOME frame is
#f6f8fa; using it over the photo-free part of the wrapper created a yellow cast.
Photo geometry and blur/opacity/mask settings remain unchanged. Pixel comparisons
at1600/1024/680/390px in both themes confirm the photo-free field matches the
page within1RGB unit of compositor rounding. Strict build and ownership checks pass.

## Broad horizontal crop and vertical reveal (2026-10-22)

The earlier content-driven ratio model is superseded: the picture no longer has
an intrinsic aspect ratio/auto width. Its frame stays900px wide and100% of the
heading/short-intro background height. The image fills it with `object-fit:cover`
and `object-position:right 36%`; source pixels retain their original proportion.
The background wrapper still starts at the section top, ends at the short
intro bottom, clips left overflow and meets the viewport right edge.

At1600px, a186px-tall background now renders the900px-wide panorama inside a
short window, cropping about72px from the top and128px from the bottom of the
scaled photo. At390px, a340px-tall intro window reduces these crops to about
17px/30px. At320px, the source's whole vertical field is visible; cover then
crops the source from the left to preserve its ratio and right focus. The face
remains visible in the tested320–1920px range. This yields an enlarged horizontal
background on wide windows and gradually releases vertical scenery as prose
wraps. The full900px frame is not a foreground/flow image and never adds a blank
row or changes the Detailed Profile row's height.

Reference source was re-read from the live site and GitHub main; both source
files match SHA256424fcdbd21b33ad337d4cb18ebabcbd74b7ba1b69b363f9393b09dbb55553672.
Its actual mechanism is height82svh + widthauto/contain, with clipping by both
intro-bg and the outer intro. The larger parent content window reveals more of
the oversized background at narrow widths. It is not source-code cover/center
cropping or text-driven image sizing. Our cover crop is an adaptation for the
accepted1914×822 panorama and shorter heading/intro region; Detailed Profile
continues to be excluded from the background. REA passive evidence:
`ev_bc031dbe68d99324365702d4aecbac7169215e9c3bc478398d9189b4910c0930`.

Geometry/resize validation:16 widths320–1920px, both palettes; no horizontal
overflow, fixed top/right anchoring, background bottom equals intro bottom,
constant horizontal frame, correct cover math, visible face center and stable
Details open/close size. Left blur fields, frame-colored veil,7-layer header
and the absence of a right/bottom fade are retained.
