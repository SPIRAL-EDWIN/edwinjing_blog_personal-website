#!/usr/bin/env python3
"""Build the homepage BipedalWBC framework from PowerPoint's own vector export.

Fidelity strategy
-----------------
Edwin's ``Origin_framework.pptx`` is the standard. Rather than re-implement
PowerPoint's layout engine (text line model, arrowheads, image resampling),
this tool starts from PowerPoint's PDF export of that slide, converted with
``pdftocairo -svg``. Every visible primitive is therefore PowerPoint's own:
Times New Roman glyph outlines at PowerPoint's glyph origins, region fills,
shape outlines, connector strokes and arrowheads, and the image layers that
PowerPoint actually composited (icons, photo, shadow, gradient fades).

Two deliberate substitutions, both measured by ``tests/test_bipedalwbc_figure.py``:

* The 12 math labels are PowerPoint SVG pictures. PowerPoint's PDF rasterises
  them at 300 ppi; here the original MathJax vector strips from the PPTX are
  used with the identical OOXML ``srcRect`` crop and picture box, so they stay
  sharp at any zoom.
* "2) Delopyment" -> "2) Deployment" (authorised): the same PowerPoint glyphs
  are reordered using PowerPoint's own advances.

The tool regroups primitives into one ``<g data-el="pptx-ID">`` per OOXML leaf
element, in OOXML paint order, so the homepage runtime can reveal them in
steps. It never recomputes geometry. Run it offline; the site build only reads
its committed outputs.

Private inputs (git-ignored):
  sandbox/figure-sources/bipedalwbc/powerpoint.pdf  PowerPoint PDF export
  sandbox/figure-sources/bipedalwbc/source.pptx     Origin_framework.pptx
Committed inputs/outputs:
  docs/assets/data/project-figures/bipedalwbc.json  OOXML inventory
  docs/assets/images/project-figures/bipedalwbc/    framework.svg + layers
  docs/assets/data/project-figures/bipedalwbc.map.json  primitive audit
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

from lxml import etree
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SVG_NS = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
S = '{%s}' % SVG_NS
HREF = '{%s}href' % XLINK
NUM = re.compile(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
# Figure frame in slide points: union of the three OOXML region rectangles.
VIEWBOX = (170.8, 58.7, 636.4, 316.0)
IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
# Raster density cap: the figure is at most ~1120 CSS px for 636 pt, so 2x retina
# needs ~3.5 px/pt; 4 px/pt keeps headroom for browser zoom.
MAX_PX_PER_PT = 4.0


def matrix(value):
    if not value:
        return IDENTITY
    match = re.fullmatch(r'\s*matrix\(([^)]*)\)\s*', value)
    if not match:
        raise ValueError(f'unsupported transform {value!r}')
    return tuple(float(v) for v in re.split(r'[\s,]+', match.group(1).strip()))


def multiply(a, b):
    return (a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5])


def apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def num(v, places=4):
    text = f'{v:.{places}f}'.rstrip('0').rstrip('.')
    return '0' if text in ('-0', '') else text


def fmt(m):
    return 'matrix(%s)' % ' '.join(num(v, 10) for v in m)


def round_path(d, places=3):
    return NUM.sub(lambda m: num(float(m.group(0)), places), d)


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def path_points(d):
    nums = [float(v) for v in NUM.findall(d)]
    return list(zip(nums[0::2], nums[1::2]))


def css_color(value):
    if value == 'none':
        return 'none'
    parts = [float(v) for v in re.findall(r'[\d.]+', value)]
    return '#%02x%02x%02x' % tuple(round(p * 2.55) for p in parts[:3])


class Op:
    """One visible drawing primitive from the PowerPoint export."""

    def __init__(self, index, kind, node, transform, clip, box, **extra):
        self.index, self.kind, self.node = index, kind, node
        self.transform, self.clip, self.box = transform, clip, box
        self.origin = extra.get('origin')
        self.image = extra.get('image')
        self.mask = extra.get('mask')
        self.style = extra.get('style')
        self.element = None


def collect_ops(svg_root):
    defs = svg_root.find(S + 'defs')
    symbols = {}
    for symbol in defs.iter(S + 'symbol'):
        pts = []
        for p in symbol.iter(S + 'path'):
            pts += path_points(p.get('d', ''))
        symbols[symbol.get('id')] = bbox(pts) if pts else None
    images = {img.get('id'): img for img in defs.iter(S + 'image')}
    masks = {}
    for mask in defs.iter(S + 'mask'):
        use = mask.find(S + 'use')
        masks[mask.get('id')] = use.get(HREF)[1:] if use is not None else None
    clips = {}
    for clip in defs.iter(S + 'clipPath'):
        pts = []
        for p in clip.iter(S + 'path'):
            pts += path_points(p.get('d', ''))
        clips[clip.get('id')] = bbox(pts)
    ops = []

    def walk(node, m, clip, style):
        for child in node:
            tag = child.tag.replace(S, '')
            cm = multiply(m, matrix(child.get('transform')))
            cp = child.get('clip-path')
            child_clip = clips[cp[5:-1]] if cp else clip
            if tag == 'g':
                walk(child, cm, child_clip, child.get('style') or style)
            elif tag == 'path':
                pts = [apply(cm, x, y) for x, y in path_points(child.get('d', ''))]
                ops.append(Op(len(ops), 'path', child, cm, child_clip, bbox(pts)))
            elif tag == 'use':
                ref = child.get(HREF)[1:]
                x, y = float(child.get('x', 0)), float(child.get('y', 0))
                if ref.startswith('glyph'):
                    b = symbols.get(ref) or (0, 0, 0, 0)
                    pts = [apply(cm, x + b[0], y + b[1]), apply(cm, x + b[2], y + b[3])]
                    ops.append(Op(len(ops), 'glyph', child, cm, child_clip, bbox(pts),
                                  origin=apply(cm, x, y), style=style))
                else:
                    img = images[ref]
                    w, h = float(img.get('width')), float(img.get('height'))
                    pts = [apply(cm, 0, 0), apply(cm, w, h)]
                    mask = child.get('mask')
                    ops.append(Op(len(ops), 'image', child, cm, child_clip, bbox(pts),
                                  image=ref, mask=masks.get(mask[5:-1]) if mask else None))
    walk(svg_root, IDENTITY, None, None)
    return ops, images


def element_list(spec):
    out = []
    for e in sorted(spec['elements'], key=lambda item: item['z']):
        e = dict(e)
        x, y, w, h = e['box_pt']
        e['bounds'] = bbox(e['points_pt']) if e['kind'] == 'connector' else (x, y, x + w, y + h)
        e['text'] = ''.join(r['text'] for r in e.get('text_runs', [])).strip()
        out.append(e)
    return out


def inside(b, outer, tol):
    return (b[0] >= outer[0] - tol and b[1] >= outer[1] - tol and
            b[2] <= outer[2] + tol and b[3] <= outer[3] + tol)


def matches(op, e):
    B = e['bounds']
    if op.kind == 'glyph':
        if not e['text']:
            return False
        x, y = op.origin
        return B[0] - 2 <= x <= B[2] + 2 and B[1] - 4 <= y <= B[3] + 4
    if op.kind == 'path':
        if e['kind'] == 'connector':
            return inside(op.box, (B[0] - 4, B[1] - 4, B[2] + 4, B[3] + 4), 1.5)
        if e['kind'] == 'shape':
            return inside(op.box, B, 2.5) and (op.box[2] - op.box[0]) > .6 * (B[2] - B[0])
        return False
    if op.kind == 'image':
        if e['kind'] not in ('picture', 'shape'):
            return False
        # The group shadow (720x515 raster) and the cropped photo belong to picture 20.
        if e['id'] == 20 and op.box[2] - op.box[0] > 150:
            return True
        return abs(op.box[0] - B[0]) < 3 and abs(op.box[1] - B[1]) < 3
    return False


def assign(ops, elements):
    """Map each PowerPoint primitive to an OOXML leaf, walking paint order."""
    pointer = 0
    for op in ops:
        if op.box[2] - op.box[0] > 900:
            op.element = 'page'
            continue
        for j in range(pointer, len(elements)):
            if matches(op, elements[j]):
                pointer = j
                op.element = elements[j]['id']
                break
        else:
            raise SystemExit(f'cannot assign PowerPoint primitive #{op.index} ({op.kind} {op.box})')
    return ops


def decode(img):
    return base64.b64decode(img.get(HREF).split(',', 1)[1])


def math_strips(pptx):
    """Return {media name: (viewBox, defs+content as SVG string)} from the PPTX."""
    strips = {}
    with zipfile.ZipFile(pptx) as z:
        for name in z.namelist():
            if name.startswith('ppt/media/') and name.endswith('.svg'):
                strips[Path(name).name] = etree.fromstring(z.read(name))
    return strips


def subpaths(d):
    """Split an absolute M/L/C/Z path into subpath strings (empty moves dropped)."""
    parts = [p.strip() for p in re.split(r'(?=M )', d) if p.strip()]
    return [p for p in parts if len(path_points(p)) > 1]


def split_connector(d, tip):
    """Separate PowerPoint's arrowhead triangle(s) from the stroke outline."""
    line, head = [], []
    for part in subpaths(d):
        pts = path_points(part)
        is_triangle = len(pts) == 3 and part.rstrip().endswith('Z')
        if is_triangle and any(abs(x - tip[0]) < .05 and abs(y - tip[1]) < .05 for x, y in pts):
            head.append(part)
        else:
            line.append(part)
    if len(head) != 1:
        raise SystemExit(f'expected one arrowhead near {tip}, found {len(head)}')
    return ' '.join(line), head[0]


def fix_deployment_spelling(nodes):
    """Reorder PowerPoint's glyphs for the authorised "Deployment" spelling.

    Region title 7 reads "2) Delopyment". Letters "lopy" become "ploy" using the
    same glyph symbols at PowerPoint's own per-glyph advances.
    """
    # Glyphs: "2" ")" " " then the ten letters of "Delopyment".
    letters = nodes[-10:]
    if len(nodes) != 13:
        raise SystemExit(f'unexpected Deployment glyph count {len(nodes)}')
    xs = [float(n.get('x')) for n in letters]
    refs = [n.get(HREF) for n in letters]
    advance = {}
    for i in range(len(letters) - 1):
        advance.setdefault(refs[i], xs[i + 1] - xs[i])
    order = [0, 1, 4, 2, 3, 5, 6, 7, 8, 9]  # D e l o p y ... -> D e p l o y ...
    x = xs[0]
    new_refs = [refs[i] for i in order]
    for k, (node, ref) in enumerate(zip(letters, new_refs)):
        node.set(HREF, ref)
        node.set('x', num(x))
        if k < len(new_refs) - 1:
            x += advance[ref]
    # The reordered word occupies exactly the original word's advance width.
    if abs(x - xs[-1]) > 1e-3:
        raise SystemExit(f'Deployment respacing drifted by {x - xs[-1]:.4f}pt')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--pdf', default='sandbox/figure-sources/bipedalwbc/powerpoint.pdf')
    ap.add_argument('--pptx', default='sandbox/figure-sources/bipedalwbc/source.pptx')
    ap.add_argument('--spec', default='docs/assets/data/project-figures/bipedalwbc.json')
    ap.add_argument('--out-dir', default='docs/assets/images/project-figures/bipedalwbc')
    ap.add_argument('--map', default='docs/assets/data/project-figures/bipedalwbc.map.json')
    args = ap.parse_args()
    out_dir = ROOT / args.out_dir
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / 'slide.svg'
        subprocess.run(['pdftocairo', '-svg', str(ROOT / args.pdf), str(raw)], check=True)
        source = etree.parse(str(raw)).getroot()
    ops, images = collect_ops(source)
    elements = element_list(json.loads((ROOT / args.spec).read_text()))
    by_id = {e['id']: e for e in elements}
    assign(ops, elements)
    strips = math_strips(ROOT / args.pptx)

    out = etree.Element(S + 'svg', nsmap={None: SVG_NS, 'xlink': XLINK})
    out.set('viewBox', ' '.join(num(v) for v in VIEWBOX))
    defs = etree.SubElement(out, S + 'defs')
    used = {op.node.get(HREF)[1:] for op in ops if op.kind == 'glyph'}
    for symbol in source.find(S + 'defs').iter(S + 'symbol'):
        if symbol.get('id') in used:
            clone = etree.SubElement(defs, S + 'symbol', id='bwbc-' + symbol.get('id'), overflow='visible')
            for p in symbol.iter(S + 'path'):
                etree.SubElement(clone, S + 'path', d=round_path(p.get('d', '')))
    for name, strip in strips.items():
        sid = 'bwbc-' + name.replace('.', '-')
        for path in strip.iter(S + 'path'):
            if path.get('id'):
                path.set('id', sid + '-' + path.get('id'))
                path.attrib.pop('class', None)
                path.set('d', round_path(path.get('d', ''), 2))
        for use in strip.iter(S + 'use'):
            use.set(HREF, '#' + sid + '-' + use.get(HREF)[1:])
            for attr in ('data-c', 'data-mml-node'):
                use.attrib.pop(attr, None)
        holder = etree.SubElement(defs, S + 'g', id=sid)
        for child in strip:
            if child.tag == S + 'style':
                continue
            holder.append(child)
        for node in holder.iter():
            for attr in ('data-mml-node', 'data-c', 'data-mjx-texclass'):
                node.attrib.pop(attr, None)
            if node.get('class'):
                node.attrib.pop('class')
    content = etree.SubElement(out, S + 'g', id='bwbc-content')
    groups = {}
    for e in elements:
        groups[e['id']] = etree.SubElement(content, S + 'g', **{'data-el': f"pptx-{e['id']}", 'data-kind': e['kind']})

    layers, written = {}, {}
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('layer-*.webp'):
        old.unlink()
    deployment = []
    audit = []
    for op in ops:
        if op.element == 'page':
            continue
        e = by_id[op.element]
        g = groups[op.element]
        if op.kind == 'path' and e['kind'] == 'connector':
            # PowerPoint exports a connector as a filled outline of its stroke (dashes as
            # separate rectangles) plus a filled arrowhead triangle. Keep both exactly,
            # split so the head can appear when the stroke arrives, and add an invisible
            # OOXML centreline that drives the draw-on mask and the travelling signal.
            style = op.node.get('style', '')
            colour = css_color(re.search(r'fill:(rgb\([^)]*\))', style).group(1))
            line_d, head_d = split_connector(round_path(op.node.get('d', ''), 3), e['points_pt'][-1])
            centre = 'M ' + ' L '.join(f'{num(x, 3)} {num(y, 3)}' for x, y in e['points_pt'])
            mid = f"bwbc-mask-{e['id']}"
            mask = etree.SubElement(defs, S + 'mask', id=mid, maskUnits='userSpaceOnUse',
                                    x=num(VIEWBOX[0]), y=num(VIEWBOX[1]), width=num(VIEWBOX[2]), height=num(VIEWBOX[3]))
            etree.SubElement(mask, S + 'path', d=centre, fill='none', stroke='#ffffff', **{
                'stroke-width': '6', 'stroke-linecap': 'square', 'stroke-linejoin': 'miter',
                'pathLength': '1', 'class': 'bwbc-reveal', 'data-reveal': str(e['id'])})
            etree.SubElement(g, S + 'path', d=line_d, fill=colour, mask=f'url(#{mid})', **{'data-role': 'line'})
            etree.SubElement(g, S + 'path', d=head_d, fill=colour, **{'data-role': 'head'})
            etree.SubElement(g, S + 'path', d=centre, fill='none', stroke='none', **{
                'data-role': 'route', 'data-kind': 'update' if e['stroke'].get('dash') else 'data',
                'data-colour': colour})
            audit.append({'op': op.index, 'kind': op.kind, 'element': op.element,
                          'box': [round(v, 3) for v in op.box]})
            continue
        if op.kind == 'path':
            style = op.node.get('style', '')
            fill = re.search(r'fill:(rgb\([^)]*\)|none)', style)
            stroke = re.search(r'stroke:(rgb\([^)]*\))', style)
            node = etree.SubElement(g, S + 'path', d=round_path(op.node.get('d', ''), 3 if op.transform == IDENTITY else 1))
            node.set('fill', css_color(fill.group(1)) if fill else 'none')
            if re.search(r'fill-rule:evenodd', style):
                node.set('fill-rule', 'evenodd')
            if stroke:
                node.set('stroke', css_color(stroke.group(1)))
                node.set('stroke-width', num(float(re.search(r'stroke-width:([\d.]+)', style).group(1))))
                node.set('stroke-miterlimit', '8')
                node.set('pathLength', '1')
            if op.transform != IDENTITY:
                node.set('transform', fmt(op.transform))
            if e['kind'] == 'connector':
                role = 'connector'
            elif stroke:
                role = 'outline'
            else:
                role = 'fill'
            node.set('data-role', role)
        elif op.kind == 'glyph':
            x, y = op.origin
            fill = re.search(r'fill:(rgb\([^)]*\))', op.style or '')
            node = etree.SubElement(g, S + 'use', **{HREF: '#bwbc-' + op.node.get(HREF)[1:]})
            node.set('x', num(x))
            node.set('y', num(y))
            node.set('fill', css_color(fill.group(1)) if fill else '#000000')
            node.set('data-role', 'text')
            if op.element == 7:
                deployment.append(node)
        elif op.kind == 'image':
            if e.get('media', '') and e['media'].endswith('.svg'):
                # Math label: replace PowerPoint's 300 ppi raster by the PPTX vector strip.
                if g.find(S + 'svg') is not None:
                    continue
                strip = strips[e['media']]
                vx, vy, vw, vh = (float(v) for v in strip.get('viewBox').split())
                crop = e.get('crop', {})
                l, t = crop.get('l', 0) / 1e5, crop.get('t', 0) / 1e5
                r, b = crop.get('r', 0) / 1e5, crop.get('b', 0) / 1e5
                x, y, w, h = e['box_pt']
                inner = etree.SubElement(g, S + 'svg', x=num(x), y=num(y), width=num(w), height=num(h),
                                         viewBox=' '.join(num(v, 3) for v in (vx + vw * l, vy + vh * t,
                                                                               vw * (1 - l - r), vh * (1 - t - b))),
                                         preserveAspectRatio='none', overflow='hidden')
                inner.set('data-role', 'text')
                etree.SubElement(inner, S + 'use', fill='#000000',
                                 **{HREF: '#bwbc-' + e['media'].replace('.', '-')})
                continue
            key = (op.image, op.mask)
            transform = op.transform
            if key not in layers:
                rgb = Image.open(io.BytesIO(decode(images[op.image]))).convert('RGB')
                if op.mask:
                    rgb.putalpha(Image.open(io.BytesIO(decode(images[op.mask]))).convert('L'))
                crop_px = None
                if op.clip and op.transform[1] == op.transform[2] == 0:
                    # Keep only the clipped window, with a 2 px safety margin, then cap the
                    # density at MAX_PX_PER_PT (2x retina at the widest homepage size).
                    sx, sy = op.transform[0], op.transform[3]
                    x0, y0, x1, y1 = op.clip
                    L = max(0, int((x0 - op.transform[4]) / sx) - 2)
                    T = max(0, int((y0 - op.transform[5]) / sy) - 2)
                    R = min(rgb.size[0], int((x1 - op.transform[4]) / sx) + 3)
                    B = min(rgb.size[1], int((y1 - op.transform[5]) / sy) + 3)
                    crop_px = (L, T, R, B)
                    rgb = rgb.crop(crop_px)
                    scale = min(1.0, MAX_PX_PER_PT * sx)
                    if scale < 1:
                        rgb = rgb.resize((round(rgb.size[0] * scale), round(rgb.size[1] * scale)), Image.LANCZOS)
                name = f'layer-{len(layers) + 1:02d}.webp'
                big = rgb.size[0] * rgb.size[1] > 200_000
                rgb.save(out_dir / name, 'WEBP', lossless=not big, quality=92 if big else 100, method=6)
                layers[key] = (name, crop_px)
                written[name] = rgb.size
            name, crop_px = layers[key]
            w, h = written[name]
            if crop_px:
                L, T, R, B = crop_px
                sx = op.transform[0] * (R - L) / w
                sy = op.transform[3] * (B - T) / h
                transform = (sx, 0.0, 0.0, sy,
                             op.transform[4] + L * op.transform[0], op.transform[5] + T * op.transform[3])
            holder = g
            if op.clip:
                cid = f'bwbc-clip-{op.index}'
                cp = etree.SubElement(defs, S + 'clipPath', id=cid)
                x0, y0, x1, y1 = op.clip
                etree.SubElement(cp, S + 'rect', x=num(x0), y=num(y0), width=num(x1 - x0), height=num(y1 - y0))
                holder = etree.SubElement(g, S + 'g', **{'clip-path': f'url(#{cid})'})
            node = etree.SubElement(holder, S + 'image', width=str(w), height=str(h),
                                    transform=fmt(transform), preserveAspectRatio='none')
            node.set(HREF, name)
            node.set('data-role', 'image')
        audit.append({'op': op.index, 'kind': op.kind, 'element': op.element,
                      'box': [round(v, 3) for v in op.box]})
    fix_deployment_spelling(deployment)
    empty = [e['id'] for e in elements if not len(groups[e['id']])]
    svg_bytes = etree.tostring(out, xml_declaration=True, encoding='utf-8')
    (out_dir / 'framework.svg').write_bytes(svg_bytes)
    (ROOT / args.map).write_text(json.dumps({
        'source': 'PowerPoint PDF export of Origin_framework.pptx (pdftocairo -svg)',
        'viewBox': VIEWBOX, 'emptyElements': empty, 'ops': audit}, indent=1) + '\n')
    sizes = sum((out_dir / n).stat().st_size for n in written)
    print(f'{len(ops)} primitives -> {len(elements)} elements (empty: {empty}); '
          f'svg {len(svg_bytes):,} B; {len(written)} layers {sizes:,} B')


if __name__ == '__main__':
    main()
