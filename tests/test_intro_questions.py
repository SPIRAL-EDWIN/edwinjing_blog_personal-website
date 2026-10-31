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
        self.assertEqual(rows[0][1], 'How to fill the gap between sim2sim and sim2real?')
        self.assertEqual(len({r[0] for r in rows}), len(rows))
        self.assertEqual(sum(r[2] == 'robotics' for r in rows), 8)
        for _, text, _, source in rows:
            self.assertLessEqual(len(text), 60)
            self.assertTrue((ROOT / source).is_file(), source)
        runtime = (ROOT / 'docs/javascripts/intro-loader.js').read_text()
        self.assertIn('Math.random() < 2 / 3', runtime)
        self.assertIn('new Set(options.map(q => q.category))', runtime)
        self.assertIn('!used.has(q.id)', runtime)

if __name__ == '__main__':
    unittest.main()
