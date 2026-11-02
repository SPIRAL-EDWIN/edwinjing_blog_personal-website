#!/usr/bin/env python3
"""Extract positioned text glyph references from the PowerPoint PDF export.

Coordinates are slide points from the upper-left, matching the OOXML inventory.
No embedded font bytes or glyph outlines are extracted. Requires pdfminer.six.
"""
import argparse
import json
import re
from pathlib import Path

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTContainer, LTTextLine


def walk(obj):
    if isinstance(obj, LTChar):
        yield obj
    elif isinstance(obj, LTContainer):
        for child in obj:
            yield from walk(child)


def lines(obj):
    if isinstance(obj, LTTextLine):
        yield obj
    elif isinstance(obj, LTContainer):
        for child in obj:
            yield from lines(child)


def normalized(value):
    return re.sub(r'\s+', ' ', value).strip()


def build_reference(pdf, spec):
    pages = list(extract_pages(str(pdf)))
    if len(pages) != 1:
        raise ValueError(f'Expected one slide, got {len(pages)}')
    page = pages[0]
    candidates = []
    for line in lines(page):
        chars = list(walk(line))
        if not chars:
            continue
        glyphs = []
        for char in chars:
            font = char.fontname.split('+', 1)[-1]
            glyphs.append({'char': char.get_text(), 'x_pt': round(char.matrix[4], 6),
                           'baseline_y_pt': round(page.height - char.matrix[5], 6),
                           'advance_pt': round(char.adv, 6), 'font': font,
                           'size_pt': round(char.size, 6),
                           'style': 'bold_italic' if 'BoldItalic' in font else 'bold' if 'Bold' in font else 'italic' if 'Italic' in font else 'regular'})
        candidates.append({'text': ''.join(c['char'] for c in glyphs), 'glyphs': glyphs,
                           'bbox_pt': [round(line.x0, 6), round(page.height-line.y1, 6), round(line.width, 6), round(line.height, 6)]})
    result, used = [], set()
    for shape in spec['elements']:
        runs = shape.get('text_runs') or []
        if not runs:
            continue
        source = ''.join(run['text'] for run in runs)
        source_lines = [normalized(t) for t in source.splitlines() if normalized(t)]
        x, y, width, height = shape['box_pt']
        selected = []
        for source_line in source_lines:
            eligible = []
            for i, line in enumerate(candidates):
                if i in used or normalized(line['text']) != source_line:
                    continue
                bx, by, bw, bh = line['bbox_pt']
                # Ink may extend past an editable frame; use overlap and nearest center.
                if bx+bw < x-2 or bx > x+width+2 or by+bh < y-2 or by > y+height+2:
                    continue
                eligible.append((abs((bx+bw/2)-(x+width/2))+abs((by+bh/2)-(y+height/2)), i))
            if not eligible:
                raise ValueError(f'No PDF text match for shape {shape["id"]}: {source_line!r}')
            _, idx = min(eligible)
            used.add(idx)
            selected.append(candidates[idx])
        # Font-style changes split one visual line into PDF runs; keep glyph origins exact.
        visual_lines = []
        for line in selected:
            groups = []
            for glyph in line['glyphs']:
                key = (glyph['font'], glyph['size_pt'], glyph['baseline_y_pt'])
                if not groups or groups[-1]['key'] != key:
                    groups.append({'key': key, 'text': '', 'font': glyph['font'], 'style': glyph['style'],
                                   'size_pt': glyph['size_pt'], 'baseline_y_pt': glyph['baseline_y_pt'], 'glyphs': []})
                groups[-1]['text'] += glyph['char']
                groups[-1]['glyphs'].append(glyph)
            for group in groups:
                del group['key']
            visual_lines.append({'text': line['text'], 'bbox_pt': line['bbox_pt'],
                                 'baseline_y_pt': line['glyphs'][0]['baseline_y_pt'], 'runs': groups})
        result.append({'shape_id': shape['id'], 'source_text': source, 'box_pt': shape['box_pt'], 'lines': visual_lines})
    unused = [line['text'] for i, line in enumerate(candidates) if i not in used]
    if unused:
        raise ValueError(f'Unmatched PDF text lines: {unused!r}')
    return {'source': 'PowerPoint PDF', 'coordinate_system': 'upper-left, slide points',
            'page_size_pt': [page.width, page.height], 'shapes': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, default=Path('output/fidelity/reference/powerpoint.pdf'))
    parser.add_argument('--spec', type=Path, default=Path('docs/assets/data/project-figures/bipedalwbc.json'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding='utf-8'))
    args.output.write_text(json.dumps(build_reference(args.pdf, spec), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
