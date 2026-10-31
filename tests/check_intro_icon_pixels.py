"""Compare full glyph ink bounds in Playwright's 4x captures (CSS pixels)."""
from pathlib import Path
from PIL import Image
import json

root = Path('output/playwright/v3.3')
boxes = {}
for phase in ('before', 'after'):
    image = Image.open(root / f'icon-{phase}.png').convert('RGB')
    ink = [(x, y) for y in range(image.height) for x in range(image.width)
           if max(image.getpixel((x, y))) < 100]
    if not ink:
        raise AssertionError(f'{phase}: no foreground pixels')
    left, right = min(x for x, _ in ink), max(x for x, _ in ink)
    top, bottom = min(y for _, y in ink), max(y for _, y in ink)
    boxes[phase] = {'center': [(left + right + 1) / 8, (top + bottom + 1) / 8],
                    'size': [(right - left + 1) / 4, (bottom - top + 1) / 4]}
a, b = boxes['before'], boxes['after']
center_delta = [abs(x-y) for x, y in zip(a['center'], b['center'])]
size_delta = [abs(x-y)/x for x, y in zip(a['size'], b['size'])]
result = {'deviceScaleFactor': 4, 'boxesCssPx': boxes, 'centerDeltaCssPx': center_delta, 'relativeSizeDelta': size_delta}
(root / 'icon-measurement.json').write_text(json.dumps(result, indent=2) + '\n')
assert max(center_delta) <= 1, result
assert max(size_delta) <= .05, result
print(json.dumps(result))
