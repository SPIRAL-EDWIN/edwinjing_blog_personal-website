"""Inline committed project figures into the homepage at build time.

``docs/index.md`` marks the slot with ``<!-- PROJECT_FIGURE:bipedalwbc -->``.
The hook replaces it with the committed, PowerPoint-derived SVG plus its step
rail, caption slot and accessible step list. Image layers referenced by the SVG
are rewritten to site-relative URLs so the inline figure resolves them.

Generation of the SVG itself happens offline in
``tools/build_bipedalwbc_figure.py``; the site build reads committed files only.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

from mkdocs.exceptions import PluginError

HOME_PAGE = 'index.md'
MARKER = re.compile(r'<!-- PROJECT_FIGURE:([a-z0-9-]+) -->')
FIGURES = {
    'bipedalwbc': {
        'svg': 'assets/images/project-figures/bipedalwbc/framework.svg',
        'steps': 'assets/data/project-figures/bipedalwbc.steps.json',
        'spec': 'assets/data/project-figures/bipedalwbc.json',
    },
}


def _svg(docs: Path, name: str, page_url: str) -> str:
    cfg = FIGURES[name]
    raw = (docs / cfg['svg']).read_text(encoding='utf-8')
    raw = raw[raw.index('<svg'):]
    depth = page_url.count('/')
    prefix = '../' * depth + str(Path(cfg['svg']).parent).replace('\\', '/') + '/'
    raw = re.sub(r'xlink:href="(layer-\d+\.webp)"', lambda m: f'xlink:href="{prefix}{m.group(1)}"', raw)
    # aria-hidden: the figure's <figcaption> and step list carry the accessible description.
    return raw.replace('<svg ', '<svg class="project-figure__svg" focusable="false" aria-hidden="true" ', 1)


def _validate(docs: Path, name: str, steps: dict) -> None:
    spec = json.loads((docs / FIGURES[name]['spec']).read_text(encoding='utf-8'))
    ids = {e['id'] for e in spec['elements']}
    connectors = {e['id'] for e in spec['elements'] if e['kind'] == 'connector'}
    listed = list(steps['always']) + [i for step in steps['steps'] for i in step['elements']]
    if sorted(listed) != sorted(ids) or len(listed) != len(set(listed)):
        raise PluginError(f'{name}: every figure element must appear in exactly one step')
    for step in steps['steps']:
        if not set(step['signal']) <= set(step['elements']) & connectors:
            raise PluginError(f"{name}: step {step['id']} signals must be its own connectors")
        if len(step.get('focus', [])) != 4:
            raise PluginError(f"{name}: step {step['id']} needs a focus rectangle")


def render(docs: Path, name: str, page_url: str) -> str:
    cfg = FIGURES[name]
    steps = json.loads((docs / cfg['steps']).read_text(encoding='utf-8'))
    _validate(docs, name, steps)
    spec = json.loads((docs / cfg['spec']).read_text(encoding='utf-8'))
    # Include the displayed height of the cropped vector math strips alongside
    # authored font sizes; both are in the SVG's original PowerPoint points.
    sizes = [run['size_pt'] for el in spec['elements'] for run in el.get('text_runs', [])
             if run.get('text', '').strip() and run.get('size_pt')]
    sizes += [el['box_pt'][3] for el in spec['elements']
              if el.get('media') in ('image4.svg', 'image5.svg')]
    if not sizes:
        raise ValueError('figure has no measurable labels')
    min_label_pt = min(sizes)
    rail = ''.join(
        f'<button type="button" data-step="{i}" aria-pressed="false">'
        f'<span class="project-figure__step-index">{i + 1:02d}</span>{html.escape(step["label"])}</button>'
        for i, step in enumerate(steps['steps']))
    items = ''.join(
        f'<li>'
        f'<strong>{html.escape(step["title"])}.</strong> {html.escape(step["text"])}</li>'
        for step in steps['steps'])
    data = html.escape(json.dumps({
        'always': steps['always'],
        'steps': [{k: s[k] for k in ('id', 'label', 'title', 'text', 'elements', 'signal', 'focus')}
                  for s in steps['steps']],
    }, separators=(',', ':')), quote=True)
    return (
        f'<div class="project-figure__stage" data-project-figure-stage data-min-label-pt="{min_label_pt:g}" data-steps="{data}">'
        f'<nav class="project-figure__rail" aria-label="Framework steps" hidden>{rail}</nav>'
        f'<div class="project-figure__canvas">{_svg(docs, name, page_url)}</div>'
        f'<div class="project-figure__explanation" hidden>'
        f'<strong data-project-figure-title></strong><p data-project-figure-copy></p></div>'
        f'</div>'
        f'<details class="project-figure__details"><summary>FRAMEWORK STEP DESCRIPTIONS</summary>'
        f'<ol class="project-figure__steps">{items}</ol></details>'
    )


def on_page_markdown(markdown, page, config, files, **kwargs):
    src_uri = getattr(page.file, 'src_uri', getattr(page.file, 'src_path', ''))
    if src_uri != HOME_PAGE or '<!-- PROJECT_FIGURE:' not in markdown:
        return markdown
    docs = Path(config['docs_dir'])

    def replace(match):
        name = match.group(1)
        if name not in FIGURES:
            raise PluginError(f'Unknown project figure {name!r}')
        try:
            return render(docs, name, page.url)
        except (OSError, ValueError, KeyError) as exc:
            raise PluginError(f'Project figure {name}: {exc}') from exc
    return MARKER.sub(replace, markdown)
