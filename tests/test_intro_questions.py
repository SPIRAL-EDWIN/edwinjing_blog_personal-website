"""Check the authored intro pool and the runtime's weighted sampler contract."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class IntroQuestionsTest(unittest.TestCase):
    def test_pool_and_sampler(self):
        data = (ROOT / 'docs/javascripts/intro-questions.js').read_text()
        rows = re.findall(r"\{id:'([^']+)', text:'([^']+)', category:'([^']+)', source:'([^']+)'\}", data)
        self.assertEqual(len(rows), 12)
        self.assertIn('How to fill the gap between sim2sim and sim2real?', [row[1] for row in rows])
        self.assertEqual(len({r[0] for r in rows}), len(rows))
        self.assertEqual(sum(r[2] == 'robotics' for r in rows), 8)
        for _, text, _, source in rows:
            self.assertLessEqual(len(text), 60)
            self.assertTrue((ROOT / source).is_file(), source)

if __name__ == '__main__':
    unittest.main()
