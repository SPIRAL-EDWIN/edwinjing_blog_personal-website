"""Checks the independent PPTX numeric reference against known OOXML geometry."""
import unittest
from pathlib import Path
from tools.reference_from_ooxml import build_reference

SOURCE = Path('sandbox/figure-sources/bipedalwbc/source.pptx')

@unittest.skipUnless(SOURCE.exists(), 'private source PPTX is not present')
class ReferenceGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build_reference(SOURCE)
        cls.elements = {item['id']: item for item in cls.data['elements']}

    def test_slide_inventory(self):
        self.assertEqual(self.data['slide_pt'], [960, 540])
        self.assertEqual(len(self.elements), 60)
        self.assertEqual(sum(x['kind'] == 'cxnSp' for x in self.elements.values()), 14)

    def test_rotated_group_visual_boxes(self):
        expected = {117:(343.70,257.95,71.38,57.21), 51:(487.35,257.95,84.51,57.21),
                    69:(300.41,117.37,84.51,57.21), 122:(215.15,257.95,100.59,57.21)}
        for ident, box in expected.items():
            for actual, target in zip(self.elements[ident]['box_pt'], box):
                self.assertLessEqual(abs(actual-target), .01, (ident, actual, target))

    def test_theme_line_width_and_text_insets(self):
        self.assertEqual(self.data['theme_line_styles'][1]['width_pt'], 1.5)
        self.assertTrue(all(k in self.elements[9]['text']['insets_pt'] for k in ('lIns','rIns','tIns','bIns')))

if __name__ == '__main__':
    unittest.main()
