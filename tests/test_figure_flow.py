"""Figure layout direction is a build invariant."""
import json
import unittest
from pathlib import Path
from hooks.figure_specs import validate


class FigureFlowTest(unittest.TestCase):
    def test_home_figures_are_monotone(self):
        data = json.loads(Path('docs/assets/data/research-figures.json').read_text())
        validate(data)

    def test_backwards_edge_fails(self):
        bad = {'bad': {'nodes': [{'id':'a','col':1,'row':0},{'id':'b','col':0,'row':0}], 'edges':[{'from':'a','to':'b'}]}}
        with self.assertRaisesRegex(ValueError, 'non-monotone'):
            validate(bad)

    def test_fractional_position_fails(self):
        bad = {'bad': {'nodes':[{'id':'a','col':0.5,'row':0}], 'edges':[]}}
        with self.assertRaisesRegex(ValueError, 'non-integer'):
            validate(bad)
