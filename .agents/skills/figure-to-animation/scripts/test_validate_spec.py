#!/usr/bin/env python3
"""Behavioral checks for layout and reference validation."""
import copy
import unittest
from validate_spec import validate


def example():
    return {
        'id': 'sample', 'title': 'Sample', 'source': 'own notes',
        'layers': [{'id': 'layer', 'label': 'Flow'}],
        'nodes': [
            {'id': 'a', 'layer': 'layer', 'label': 'A', 'kind': 'input', 'col': 0, 'row': 0},
            {'id': 'b', 'layer': 'layer', 'label': 'B', 'kind': 'output', 'col': 1, 'row': 1},
        ],
        'edges': [{'id': 'ab', 'from': 'a', 'to': 'b'}],
        'highlights': [], 'callouts': [],
        'steps': [{'id': 'step', 'label': 'Read', 'description': 'A leads to B', 'targets': ['ab']}],
        'readingOrder': ['step'],
    }


class FigureSpecTest(unittest.TestCase):
    def test_monotone_diagonal_and_straight_edges(self):
        spec = example()
        self.assertEqual(validate(spec), [])
        for col, row in ((1, 0), (0, 1), (0, 0)):
            spec['nodes'][1].update(col=col, row=row)
            self.assertEqual(validate(spec), [])

    def test_backwards_each_axis_rejected(self):
        for axis in ('col', 'row'):
            spec = example()
            spec['nodes'][0][axis] = 2
            self.assertTrue(any(axis in err and 'backward' in err for err in validate(spec)))

    def test_missing_or_noninteger_coordinates_rejected(self):
        for value in (None, 1.5, '1', True):
            spec = example()
            spec['nodes'][0]['col'] = value
            self.assertTrue(any('expected integer' in err for err in validate(spec)))
        spec = example()
        del spec['nodes'][0]['row']
        self.assertTrue(any('expected integer' in err for err in validate(spec)))

    def test_unknown_or_malformed_edge_is_reported(self):
        for target in ('missing', ['b']):
            spec = example()
            spec['edges'][0]['to'] = target
            self.assertTrue(validate(spec))


if __name__ == '__main__':
    unittest.main()
