#!/usr/bin/env python3
"""Pixel-compare the homepage framework SVG with PowerPoint's own export.

Renders ``framework.svg`` in headless Chromium and the PowerPoint PDF with
Poppler at the same scale and crop, then reports:

* global and per-element mean/max channel differences (inside each OOXML box),
* ink-bounding-box deltas per text element (dark glyph pixels), in points,
* an overlay image (PowerPoint red / SVG cyan) and an absolute difference map.

Usage: python tools/compare_bipedalwbc_render.py [--scale 6] [--out output/fidelity/v38]
Requires: playwright + chromium, pdftoppm, the private PowerPoint PDF.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import subprocess
import tempfile
import threading
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / 'docs/assets/images/project-figures/bipedalwbc'
SPEC = ROOT / 'docs/assets/data/project-figures/bipedalwbc.json'
PDF = ROOT / 'sandbox/figure-sources/bipedalwbc/powerpoint.pdf'
VIEW = (170.8, 58.7, 636.4, 316.0)


def render_pdf(scale, tmp):
    dpi = 72 * scale
    subprocess.run(['pdftoppm', '-png', '-r', str(dpi), '-singlefile', str(PDF), str(tmp / 'pp')], check=True)
    im = Image.open(tmp / 'pp.png').convert('RGB')
    x, y, w, h = VIEW
    return im.crop((round(x * scale), round(y * scale), round((x + w) * scale), round((y + h) * scale)))


def render_svg(scale, tmp):
    from playwright.sync_api import sync_playwright
    w, h = round(VIEW[2] * scale), round(VIEW[3] * scale)
    # Inline the SVG exactly as the homepage does (image layers are sibling files).
    svg = (FIG / 'framework.svg').read_text(encoding='utf-8')
    svg = svg[svg.index('<svg'):].replace('<svg ', f'<svg width="{w}" height="{h}" style="display:block" ', 1)
    page_html = f'<!doctype html><html><body style="margin:0;background:#fff">{svg}</body></html>'
    (FIG / '__compare.html').write_text(page_html, encoding='utf-8')
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(FIG))
    handler.log_message = lambda *a, **k: None
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            page.goto(f'http://127.0.0.1:{server.server_port}/__compare.html')
            page.wait_for_function('''() => Promise.all([...document.querySelectorAll('svg image')].map(i => {
                const src = i.href.baseVal; return new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = src; });
            })).then(() => true)''')
            page.wait_for_timeout(600)
            page.screenshot(path=str(tmp / 'svg.png'), clip={'x': 0, 'y': 0, 'width': w, 'height': h})
            browser.close()
    finally:
        server.shutdown()
        (FIG / '__compare.html').unlink(missing_ok=True)
    return Image.open(tmp / 'svg.png').convert('RGB')


def ink_box(arr, dark=150):
    mask = arr.min(axis=2) < dark
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    return xs.min(), ys.min(), xs.max(), ys.max()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=6.0, help='pixels per point')
    ap.add_argument('--out', default='output/fidelity/v38')
    args = ap.parse_args()
    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    s = args.scale
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        ref = render_pdf(s, tmp)
        svg = render_svg(s, tmp).resize(ref.size)
    a, b = np.asarray(ref).astype(int), np.asarray(svg).astype(int)
    diff = np.abs(a - b).max(axis=2)
    spec = json.loads(SPEC.read_text())
    rows = []
    for e in spec['elements']:
        if e['kind'] == 'connector':
            continue
        x, y, w, h = e['box_pt']
        X0 = max(0, round((x - VIEW[0]) * s)); Y0 = max(0, round((y - VIEW[1]) * s))
        X1 = min(a.shape[1], round((x + w - VIEW[0]) * s)); Y1 = min(a.shape[0], round((y + h - VIEW[1]) * s))
        if X1 <= X0 or Y1 <= Y0:
            continue
        region = diff[Y0:Y1, X0:X1]
        row = {'id': e['id'], 'name': e['name'], 'mean': round(float(region.mean()), 2),
               'p99': int(np.percentile(region, 99)), 'max': int(region.max())}
        text = ''.join(r['text'] for r in e.get('text_runs', [])).strip()
        if text:
            ra, rb = ink_box(a[Y0:Y1, X0:X1]), ink_box(b[Y0:Y1, X0:X1])
            if ra and rb:
                row['text'] = text.replace('\n', ' ')
                row['ink_delta_pt'] = [round((p - q) / s, 3) for p, q in zip(rb, ra)]
        rows.append(row)
    texts = [r for r in rows if 'ink_delta_pt' in r and r['id'] != 7]
    worst_text = max((max(abs(v) for v in r['ink_delta_pt']) for r in texts), default=0)
    report = {
        'scale_px_per_pt': s,
        'global_mean_abs_diff': round(float(diff.mean()), 3),
        'pixels_over_32': int((diff > 32).sum()),
        'pixels_over_32_share': round(float((diff > 32).mean()), 5),
        'worst_text_ink_delta_pt': worst_text,
        'elements': sorted(rows, key=lambda r: -r['mean']),
    }
    (out / 'report.json').write_text(json.dumps(report, indent=1) + '\n')
    ra, rb = ref.convert('L'), svg.convert('L')
    Image.merge('RGB', (rb, ra, ra)).save(out / 'overlay.png')
    Image.fromarray(np.clip(diff * 4, 0, 255).astype('uint8')).save(out / 'diff.png')
    ref.save(out / 'powerpoint.png')
    svg.save(out / 'svg.png')
    print(json.dumps({k: v for k, v in report.items() if k != 'elements'}))
    for r in report['elements'][:12]:
        print(r)
    print('text ink deltas (pt, [left, top, right, bottom], svg - PowerPoint):')
    for r in texts:
        print(f"  {r['text'][:28]:<28} {r['ink_delta_pt']}")


if __name__ == '__main__':
    main()
