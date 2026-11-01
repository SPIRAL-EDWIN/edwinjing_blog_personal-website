"""PPTX source-space rotation must precede nonuniform group scaling."""
import json
import unittest
from pathlib import Path

from tools.extract_pptx_figure import visual_box_pt

ROOT = Path(__file__).resolve().parents[1]


class RotatedBoxesTest(unittest.TestCase):
    def test_nonuniform_scale_after_rotation(self):
        # Work in EMU; 90-degree rotation exchanges the unscaled dimensions.
        box = visual_box_pt(0, 0, 4 * 12700, 2 * 12700, 2, 3, 0, 0, 90)
        self.assertEqual(box, [2, -3, 4, 12])

    def test_framework_trapezoid_boxes(self):
        spec = json.loads((ROOT / 'docs/assets/data/project-figures/bipedalwbc.json').read_text())
        items = {element['id']: element for element in spec['elements']}
        expected = {
            117: (343.70, 257.95, 71.38, 57.21),
            51: (487.35, 257.95, 84.51, 57.21),
            69: (300.41, 117.37, 84.51, 57.21),
            122: (215.15, 257.95, 100.59, 57.21),
        }
        for ident, box in expected.items():
            with self.subTest(id=ident):
                self.assertEqual(items[ident]['geometry'], 'trapezoid')
                for observed, wanted in zip(items[ident]['box_pt'], box):
                    self.assertAlmostEqual(observed, wanted, delta=.01)


if __name__ == '__main__':
    unittest.main()
