# Note loading checks

The image-loading hook changes rendered individual ENotes and experience articles,
excluding their index pages. Original images, Markdown, links, and lightbox targets
stay unchanged. Native lazy loading
lets the browser fetch images near the viewport rather than the entire note.
Known local image dimensions reserve space before download, reducing late layout
shifts. Explicit author loading, decoding, and size attributes are preserved.

Material owns hover/focus-triggered internal HTML prefetch. This replaces the old
Archive-only prefetch, including its automatic batch of three notes. Prefetch is
a browser hint, not a guaranteed cache hit, and touch-only readers may receive
less benefit. It does not preload every note's images or formulas.

Run:

```sh
.venv/bin/python -m unittest discover -s tools -p 'test_*.py'
.venv/bin/mkdocs build --strict
```

In a local preview, check Overview, Friends, ENotes, and CHEM 102. Verify internal
navigation, back/forward, search, images after scrolling, image zoom, and math
heading anchors. On CHEM 102, inspect image loading attributes and confirm that
most far-offscreen images remain unloaded at the top of a fresh browser page.

For an actual cold/warm network comparison, test the deployed site in a fresh
browser profile, with cache disabled and network throttling. Record click-to-text
time separately from the load event and formula completion. Repeat with cache
enabled and on the affected reader's network. Localhost timings cannot establish
GitHub Pages latency in another region, and original total image bytes are not
reduced by lazy loading if the reader eventually scrolls through the entire note.

## Archive navigation probe

Archive raster covers use build-time WebP thumbnails (maximum 640 × 480,
aspect ratio preserved) rather than full original screenshots. Pillow is only
needed at build time; note originals remain unchanged. External, animated,
and vector covers retain their original URLs. Cover downloads are low priority.

`serve_navigation_probe.py` serves the built site on an isolated temporary port
and injects test-only timing instrumentation. Nothing is written into the site
or deployed. Inspect `body[data-navigation-probe]` after navigating to separate
XHR wait from parsing/injection and runtime work. For example:

```sh
.venv/bin/python tools/serve_navigation_probe.py --port 8001
.venv/bin/python tools/serve_navigation_probe.py --port 8001 \
  --delay-path '/OsdNotes/PHIL/PHIL%20206/' --delay-seconds 20
```

Use one server at a time. Open `/HOME/Archive/` on that port, then click PHIL.
After 10 seconds the opening spinner must remain while recovery controls appear;
after the actual document arrives both must disappear. Also test the return
control, Escape, and a normal fast navigation. `--fail-path` produces controlled
HTTP 503 responses to exercise Material's native full-navigation fallback.
These are local synthetic timings, not a measurement of another user's network.
Fault-mode pages now carry a persistent, explicit warning with the artificial
delay or failure and target paths. The regular port-8000 MkDocs preview has no
fault injection. Probe scripts and instrumentation are outside the deployed site.

## Article, Overview and PDF loading

Overview logo and Workshop images now select local WebP thumbnails through
`srcset`. An inline tiny blur is present before any image request; `ui-perf.js`
reveals the selected image after decoding. Original images are retained.
Regenerate assets with `tools/generate_loading_previews.py` (local Pillow and
Poppler; no new deployment dependency).

Ordinary cross-document navigation retains the mounted article, with Material's
progress bar at the header edge. Only a request still pending after 2 seconds
creates the liquid-glass status capsule; after 10 seconds it offers native open
and cancel. The capsule uses an independent filter and Back to Top's existing
map generator, with layout/font-only rebuilds. Completion means content-node
replacement, not an address change. Rapid clicks replace the pending target.
Cancel uses native replacement of the actual source URL to dispose all pending
requests; it reloads the source, rather than preserving its exact scroll position.
Intermediate pending URLs may remain in browser history.

Formula pages preload the same-origin MathJax runtime. Loading and startup are
single-flight, with one automatic failure retry and a manual retry control.
Short waits reserve display-math space; after 10 seconds the original TeX is
shown while the request continues. Article lifecycles ignore obsolete pages,
and typesetting targets exclude overlapping nested TOC containers.

RFM initially shows two clear page images. The full PDF iframe has no `src`
until its button is clicked. Previews remain available during initialization;
native iframe `load` is not treated as proof that Edge has painted the PDF.
Readers can collapse previews, open a full-size image, or open/download the PDF.
The `Open PDF · 13 pages` button shares the navigation/Back to Top glass generator
with an independent filter, created only when the button enters the viewport.
Opening the PDF or leaving the page releases its filter. The Top template keeps
Material's native component and click behavior and labels it `Back to Top`.

Ordinary link clicks do not read header geometry or change body style classes.
Those operations occur only if the request is still pending at the 2-second
feedback boundary. In a same-browser, no-delay local comparison on 2026-10-11,
Gprogress → UMI completed in roughly 0.11–0.16 seconds for both old/current
builds; an instrumented pair measured 121.5/122.3 ms with runtime `runAll` at
16.3/16.5 ms. Added image/PDF setup on UMI measured below the timer resolution.
Earlier runs varied with browser/layout conditions and are not evidence of a
universal navigation speedup. A double-animation-frame timestamp is only a
post-injection approximation, not a browser paint measurement. There is no new
wait for formulas, images or PDF before article replacement. The earlier
20-second port-8001 stall was the deliberately delayed local fault server, not
production behavior; deployment does not include that server or its delay.

Run these targeted regressions as well as the Python/strict build checks:

```sh
node tools/test_navigation_media.cjs
node tools/test_navigation_glass.cjs
node tools/test_math_loading.cjs
node tools/test_article_math.cjs
node tools/test_search_math.cjs
node tools/test_top_glass.cjs
node tools/test_fragment_navigation.cjs
```

Verified locally on 2026-10-11: 120 Python tests, runtime regressions and strict
build pass. Gprogress renders all 44 formulas in a real browser, including after
transport failures and manual retry without refresh; a 15-second runtime delay
also eventually completes. A controlled 20-second HTML delay preserves the old
article, displays the independent glass capsule after the delay boundary, exposes
recovery and clears all feedback/filter nodes on arrival. Timing harness checks
1999/2000 ms and 9999/10000 ms, rapid target changes and obsolete callbacks.
Normal rapid Overview/ENotes/More Experiences switches leave no capsule or blue
waiting outline. PDF request logs confirm that only preview images load before
the explicit button click. Overview and Friends retain a 70px header and 260px
profile at 1280px.

The CSS equivalence probe compares old/new CSS against the same new HTML. Friends
passes in both themes at 1280/375px; Overview has intentional differences only
in the two progressive-image containers and their images (blur layers and
intrinsic sizing). Actual original display geometry was checked separately.
PDF geometry was checked in local Edge at 1280/375px in both themes: the two
442.5px pages share a desktop row; mobile pages are 313px wide, align at x=30px,
and stack vertically within the 375px viewport. PDF CSS comparison differences
are intentional preview/hidden-iframe changes and resulting document heights,
not an equivalence pass. The checker captures settled states with optional
motion freezing and cannot establish frame-by-frame visual behavior.
This is smoke/regression evidence, not a deployed-network benchmark; the affected
Windows Edge computer and its connection still require a post-deployment check.

Verified on 2026-09-16: local covers shrank from 8,164,862 to 348,017 bytes
(19 generated raster previews plus one unchanged SVG; external cover excluded).
In the local probe, lower-list PHIL navigation completed in about 95–144 ms;
the final Archive entry completed in about 33 ms. These single-run values are
smoke-test evidence, not a network benchmark or a guaranteed speedup. A controlled
20-second HTML delay retained opening feedback until actual content replacement,
and Escape returned to Archive without leaving the blocking state behind.
