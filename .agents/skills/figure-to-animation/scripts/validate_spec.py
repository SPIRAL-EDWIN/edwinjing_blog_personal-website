#!/usr/bin/env python3
"""Validate the FigureSpec shape and cross-references; no external packages."""
import json
import sys


def validate(spec):
    errors = []
    if not isinstance(spec, dict):
        return ['spec must be an object']
    for key in ('id', 'title', 'source'):
        if not isinstance(spec.get(key), str) or not spec[key].strip():
            errors.append(f'{key}: expected nonempty string')
    fields = {
        'layers': ('id', 'label'), 'nodes': ('id', 'layer', 'label', 'kind'),
        'edges': ('id', 'from', 'to'), 'highlights': ('id', 'target', 'role'),
        'callouts': ('id', 'target', 'text'), 'steps': ('id', 'label', 'description', 'targets'),
    }
    ids = {}
    for section, required in fields.items():
        items = spec.get(section)
        if not isinstance(items, list):
            errors.append(f'{section}: expected array')
            continue
        if section in ('layers', 'nodes', 'steps') and not items:
            errors.append(f'{section}: must not be empty')
        for i, item in enumerate(items):
            where = f'{section}[{i}]'
            if not isinstance(item, dict):
                errors.append(f'{where}: expected object')
                continue
            for field in required:
                value = item.get(field)
                if field == 'targets':
                    if not isinstance(value, list) or not value or not all(isinstance(v, str) and v for v in value):
                        errors.append(f'{where}.{field}: expected nonempty array of IDs')
                elif not isinstance(value, str) or not value.strip():
                    errors.append(f'{where}.{field}: expected nonempty string')
            ident = item.get('id')
            if isinstance(ident, str) and ident:
                if ident in ids:
                    errors.append(f'{where}.id: duplicate {ident}')
                ids[ident] = section
    def refs(section, key, kinds):
        for i, item in enumerate(spec.get(section, []) if isinstance(spec.get(section), list) else []):
            if not isinstance(item, dict):
                continue
            values = item.get(key, []) if key == 'targets' else [item.get(key)]
            if not isinstance(values, list):
                continue
            for value in values:
                if not isinstance(value, str) or ids.get(value) not in kinds:
                    errors.append(f'{section}[{i}].{key}: unknown or invalid reference {value!r}')
    refs('nodes', 'layer', {'layers'})
    for key in ('from', 'to'):
        refs('edges', key, {'nodes'})
    for section in ('highlights', 'callouts'):
        refs(section, 'target', {'nodes', 'edges', 'layers'})
    refs('steps', 'targets', {'layers', 'nodes', 'edges', 'highlights', 'callouts'})
    order = spec.get('readingOrder')
    if not isinstance(order, list) or not order or not all(isinstance(v, str) and ids.get(v) == 'steps' for v in order):
        errors.append('readingOrder: expected nonempty array of step IDs')
    elif len(set(order)) != len(order) or set(order) != {i for i, kind in ids.items() if kind == 'steps'}:
        errors.append('readingOrder: include every step exactly once')
    return errors

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: validate_spec.py SPEC.json')
    try:
        with open(sys.argv[1], encoding='utf-8') as f:
            errors = validate(json.load(f))
    except (OSError, ValueError) as exc:
        sys.exit(str(exc))
    if errors:
        sys.exit('\n'.join(errors))
    print('FigureSpec valid')
