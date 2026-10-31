#!/usr/bin/env python3
"""Fail deployment if private figure exercise files leak into site output."""
from hashlib import sha256
from pathlib import Path
import sys

site = Path('site')
private = Path('sandbox/figure-training')
if not site.is_dir():
    sys.exit('Build site before checking private figure isolation')
private_hashes = {sha256(p.read_bytes()).digest() for p in private.rglob('*') if p.is_file()} if private.exists() else set()
leaks = []
for p in site.rglob('*'):
    if not p.is_file():
        continue
    if 'figure-training' in p.parts or p.name in ('reference.jpg', 'figure-training.json'):
        leaks.append(str(p))
    elif private_hashes and sha256(p.read_bytes()).digest() in private_hashes:
        leaks.append(str(p))
if leaks:
    sys.exit('Private figure material in build:\n' + '\n'.join(leaks))
print('Private figure output check passed (path, names, and identical-byte copies)')
