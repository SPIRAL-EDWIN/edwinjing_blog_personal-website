# Note loading checks

The image-loading hook only changes rendered individual ENotes content. Original
images, Markdown, links, and lightbox targets stay unchanged. Native lazy loading
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

Verified on 2026-09-16: local covers shrank from 8,164,862 to 348,017 bytes
(19 generated raster previews plus one unchanged SVG; external cover excluded).
In the local probe, lower-list PHIL navigation completed in about 95–144 ms;
the final Archive entry completed in about 33 ms. These single-run values are
smoke-test evidence, not a network benchmark or a guaranteed speedup. A controlled
20-second HTML delay retained opening feedback until actual content replacement,
and Escape returned to Archive without leaving the blocking state behind.
