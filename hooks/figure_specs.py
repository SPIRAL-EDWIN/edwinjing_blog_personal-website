"""Fail the build for malformed or non-monotone homepage figure edges."""
import json
from pathlib import Path


def validate(specs):
    for name, spec in specs.items():
        nodes = {}
        for node in spec['nodes']:
            if node['id'] in nodes or any(type(node.get(k)) is not int for k in ('col', 'row')):
                raise ValueError(f'{name}: duplicate id or non-integer node position: {node}')
            nodes[node['id']] = node
        for edge in spec['edges']:
            a, b = nodes[edge['from']], nodes[edge['to']]
            if b['col'] < a['col'] or b['row'] < a['row']:
                raise ValueError(f"{name}: non-monotone edge {edge['from']} -> {edge['to']}")


def on_pre_build(config, **kwargs):
    validate(json.loads(Path(config.docs_dir, 'assets/data/research-figures.json').read_text()))
