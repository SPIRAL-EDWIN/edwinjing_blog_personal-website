"""Freeze the approved v3.6 connector paths, arrowheads and painter order.

Usage: FIGURE_SVG=/absolute/path/to/built.svg python -m unittest discover -s tests
Alternatively invoke this file with an SVG path to check a candidate directly.
The committed fixture contains only path geometry and presentation, no source media.
"""
import json
import os
from pathlib import Path
import re
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/bipedalwbc_connector_freeze.json'
PRIVATE_REFERENCE = ROOT / 'sandbox/figure-sources/bipedalwbc/derived/v36/framework.svg'
TOKEN = re.compile(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
ATTRS = ('fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
         'stroke-linecap', 'stroke-linejoin', 'transform', 'marker-start', 'marker-end', 'vector-effect')


def verify(svg_path, baseline=None):
    baseline = baseline or json.loads(FIXTURE.read_text())
    root = ET.parse(svg_path).getroot()
    groups = [node for node in root if node.get('data-el')]
    order = [node.get('data-el') for node in groups]
    if order != baseline['paint_order']:
        raise AssertionError('Source element paint order differs from approved v3.6')
    by_id = {node.get('data-el'): node for node in groups}
    tolerance = baseline['tolerance_pt']
    for key, expected_paths in baseline['connectors'].items():
        group = by_id[key]
        if group.get('transform'):
            raise AssertionError(f'{key}: group transform changes approved geometry')
        paths = [node for node in group if node.tag.rsplit('}', 1)[-1] == 'path']
        if len(paths) != len(expected_paths):
            raise AssertionError(f'{key}: expected {len(expected_paths)} connector/head paths, got {len(paths)}')
        for part, (path, expected) in enumerate(zip(paths, expected_paths)):
            actual_tokens = TOKEN.findall(path.get('d', ''))
            expected_tokens = TOKEN.findall(expected['d'])
            if len(actual_tokens) != len(expected_tokens):
                raise AssertionError(f'{key} path {part}: vertex/command count changed')
            for index, (actual, target) in enumerate(zip(actual_tokens, expected_tokens)):
                if target.isalpha():
                    if actual != target:
                        raise AssertionError(f'{key} path {part}: command {index} changed')
                elif actual.isalpha() or abs(float(actual) - float(target)) > tolerance + 1e-9:
                    raise AssertionError(f'{key} path {part}: coordinate {index} changed: {actual} vs {target}')
            for name in ATTRS:
                if path.get(name) != expected.get(name):
                    raise AssertionError(f'{key} path {part}: {name} changed')
            if path.get('style'):
                raise AssertionError(f'{key} path {part}: inline style may override frozen presentation')
    return len(baseline['connectors'])


class ConnectorFreezeTest(unittest.TestCase):
    def test_reference_if_available(self):
        if not PRIVATE_REFERENCE.is_file():
            self.skipTest('private v3.6 SVG not available')
        self.assertEqual(verify(PRIVATE_REFERENCE), 14)

    def test_built_figure_if_provided(self):
        path = os.environ.get('FIGURE_SVG')
        if not path:
            self.skipTest('set FIGURE_SVG to the built SVG to check production geometry')
        self.assertEqual(verify(Path(path)), 14)

    def test_rejects_modified_baseline(self):
        if not PRIVATE_REFERENCE.is_file():
            self.skipTest('private v3.6 SVG not available')
        fixture = json.loads(FIXTURE.read_text())
        item = fixture['connectors']['pptx-106'][0]
        item['d'] = item['d'].replace('724.155118', '724.175118', 1)
        with self.assertRaisesRegex(AssertionError, 'coordinate'):
            verify(PRIVATE_REFERENCE, fixture)


if __name__ == '__main__':
    if len(sys.argv) == 2 and not sys.argv[1].startswith('-'):
        print(f'{verify(Path(sys.argv[1]))} connector and arrowhead pairs match the frozen v3.6 geometry')
    else:
        unittest.main()
