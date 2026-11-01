#!/usr/bin/env python3
"""Compare OOXML-extracted routes to private independently supplied audit.
This validates geometry and potential occlusion, not pixels in a rendered SVG.
"""
import json, math
from pathlib import Path
spec=json.loads(Path('docs/assets/data/project-figures/bipedalwbc.json').read_text())
audit=json.loads(Path('sandbox/figure-sources/bipedalwbc/connectors.json').read_text())['connectors']
items={i['id']:i for i in spec['elements']}
connectors=[i for i in items.values() if i['kind']=='connector']
assert len(connectors)==len(audit)==14
for a in audit:
 e=items[a['id']]; assert len(e['points_pt'])==len(a['points'])
 for p,q in zip(e['points_pt'],a['points']):
  assert math.dist(p,q)<.15, (a['id'],p,q)
 assert e['stroke']['tail']=='triangle' and e['stroke']['width_pt']==1.5
for entry in audit:
 e=items[entry['id']]
 for run in entry.get('hiddenRuns', []):
  c=items[run['by']]
  assert c['z'] > e['z'], (entry['id'],run['by'],'invalid painter order')
for edge,cover in [(106,41),(105,53)]:
 e,c=items[edge],items[cover];x,y=e['points_pt'][0];bx,by,bw,bh=c['box_pt']
 assert bx<=x<=bx+bw and by<=y<=by+bh,(edge,cover)
 assert c['z']>e['z'] and c['fill'] and not c['no_fill'],(edge,cover)
print('14 connector routes match audit to 0.15pt; 105/106 hidden origins are covered by later opaque boxes. All listed occluders have later z; actual SVG paint order not checked.')
