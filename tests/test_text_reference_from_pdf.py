"""Private PDF reference checks; no font data is copied into the repository."""
import json
from pathlib import Path
import sys
import unittest

try:
    import pdfminer  # noqa: F401
except ImportError:
    pdfminer = None

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
if pdfminer:
    from text_reference_from_pdf import build_reference

PDF = ROOT / 'output/fidelity/reference/powerpoint.pdf'
SPEC = ROOT / 'docs/assets/data/project-figures/bipedalwbc.json'


@unittest.skipUnless(pdfminer and PDF.exists(), 'Requires pdfminer.six and private PowerPoint reference')
class TextReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = build_reference(PDF, json.loads(SPEC.read_text(encoding='utf-8')))
        cls.shapes = {shape['shape_id']: shape for shape in cls.result['shapes']}

    def test_all_lines_and_expected_baselines(self):
        self.assertEqual(len(self.shapes), 18)
        self.assertEqual(sum(len(s['lines']) for s in self.shapes.values()), 19)
        reward = self.shapes[48]['lines']
        self.assertAlmostEqual(reward[0]['baseline_y_pt'], 90.48, delta=0.001)
        self.assertAlmostEqual(reward[1]['baseline_y_pt'], 106.56, delta=0.001)
        for shape in (118, 123, 61):
            self.assertAlmostEqual(self.shapes[shape]['lines'][0]['baseline_y_pt'], 292.08, delta=0.001)

    def test_italic_phi_and_glyph_positions(self):
        runs = self.shapes[126]['lines'][0]['runs']
        self.assertEqual(runs[-1]['text'], 'φ')
        self.assertEqual(runs[-1]['glyphs'][0]['style'], 'italic')
        for shape in self.shapes.values():
            for line in shape['lines']:
                for run in line['runs']:
                    self.assertEqual(run['text'], ''.join(g['char'] for g in run['glyphs']))
                    self.assertTrue(all('x_pt' in g and 'baseline_y_pt' in g for g in run['glyphs']))


if __name__ == '__main__':
    unittest.main()
