"""Guard the committed BipedalWBC homepage figure against geometry drift.

The SVG is generated offline from PowerPoint's own export of Origin_framework.pptx
(tools/build_bipedalwbc_figure.py). These checks run on committed files only:

* paint order and element set equal the committed OOXML inventory;
* every connector keeps PowerPoint's arrowhead tip on the OOXML endpoint, and its
  invisible route equals the OOXML centreline (the approved v3.6 vertices);
* step data covers every element exactly once and signals only its own connectors;
* image layers referenced by the SVG exist and stay within the weight budget.
"""
import json
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / 'docs/assets/images/project-figures/bipedalwbc'
SPEC = ROOT / 'docs/assets/data/project-figures/bipedalwbc.json'
STEPS = ROOT / 'docs/assets/data/project-figures/bipedalwbc.steps.json'
FREEZE = ROOT / 'tests/fixtures/bipedalwbc_connector_freeze.json'
NS = {'s': 'http://www.w3.org/2000/svg'}
NUM = re.compile(r'-?\d+(?:\.\d+)?')
XLINK = '{http://www.w3.org/1999/xlink}href'


def points(d):
    nums = [float(v) for v in NUM.findall(d)]
    return list(zip(nums[0::2], nums[1::2]))


class BipedalWBCFigureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.svg = ET.parse(FIG / 'framework.svg').getroot()
        cls.spec = json.loads(SPEC.read_text())
        cls.steps = json.loads(STEPS.read_text())
        cls.groups = cls.svg.findall('.//s:g[@data-el]', NS)
        cls.by_id = {g.get('data-el'): g for g in cls.groups}

    def test_paint_order_matches_ooxml(self):
        expected = [f"pptx-{e['id']}" for e in sorted(self.spec['elements'], key=lambda e: e['z'])]
        self.assertEqual([g.get('data-el') for g in self.groups], expected)
        frozen = json.loads(FREEZE.read_text())['paint_order']
        self.assertEqual(expected, frozen, 'paint order differs from the approved v3.6 order')
        self.assertFalse([g.get('data-el') for g in self.groups if not len(g)], 'empty element group')

    def test_connectors_match_ooxml_and_approved_routes(self):
        frozen = json.loads(FREEZE.read_text())['connectors']
        connectors = [e for e in self.spec['elements'] if e['kind'] == 'connector']
        self.assertEqual(len(connectors), 14)
        for e in connectors:
            g = self.by_id[f"pptx-{e['id']}"]
            route = g.find("s:path[@data-role='route']", NS)
            head = g.find("s:path[@data-role='head']", NS)
            line = g.find("s:path[@data-role='line']", NS)
            self.assertIsNotNone(line, e['id'])
            for (x, y), (ex, ey) in zip(points(route.get('d')), e['points_pt']):
                self.assertAlmostEqual(x, ex, delta=.001)
                self.assertAlmostEqual(y, ey, delta=.001)
            # Approved v3.6 routes: same vertices (the v3.6 line stopped 6pt short of the tip).
            v36 = points(frozen[f"pptx-{e['id']}"][0]['d'])
            self.assertEqual(len(v36), len(e['points_pt']), e['id'])
            for (x, y), (ex, ey) in zip(v36[:-1], e['points_pt'][:-1]):
                self.assertAlmostEqual(x, ex, delta=.01)
                self.assertAlmostEqual(y, ey, delta=.01)
            tip = e['points_pt'][-1]
            head_pts = points(head.get('d'))
            self.assertEqual(len(head_pts), 3, e['id'])
            nearest = min(abs(x - tip[0]) + abs(y - tip[1]) for x, y in head_pts)
            self.assertLess(nearest, .02, f"{e['id']}: PowerPoint arrowhead tip left the OOXML endpoint")

    def test_steps_cover_every_element_once(self):
        ids = sorted(e['id'] for e in self.spec['elements'])
        listed = list(self.steps['always']) + [i for s in self.steps['steps'] for i in s['elements']]
        self.assertEqual(sorted(listed), ids)
        self.assertEqual(len(listed), len(set(listed)))
        connectors = {e['id'] for e in self.spec['elements'] if e['kind'] == 'connector'}
        for s in self.steps['steps']:
            self.assertTrue(set(s['signal']) <= set(s['elements']) & connectors, s['id'])
            self.assertEqual(len(s['focus']), 4, s['id'])

    def test_layers_exist_and_stay_light(self):
        refs = {img.get(XLINK) for img in self.svg.iter('{http://www.w3.org/2000/svg}image')}
        self.assertTrue(refs)
        for ref in refs:
            self.assertTrue((FIG / ref).is_file(), ref)
        total = sum((FIG / ref).stat().st_size for ref in refs) + (FIG / 'framework.svg').stat().st_size
        self.assertLess(total, 400_000, f'figure weight {total:,} B exceeds the 400 KB budget')

    def test_no_private_paths_or_sources_published(self):
        text = (FIG / 'framework.svg').read_text(encoding='utf-8')
        self.assertNotIn('sandbox', text)
        self.assertNotIn('/Users/', text)
        self.assertFalse(list(FIG.glob('*.pptx')) + list(FIG.glob('*.pdf')))


if __name__ == '__main__':
    unittest.main()
