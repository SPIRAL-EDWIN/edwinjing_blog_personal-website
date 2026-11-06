/* Browser regression for the measured project-figure gate. Start MkDocs on :8000 first.
   NODE_PATH=/path/to/node_modules BROWSER_EXECUTABLE=/path/to/chromium node tests/test_project_figure_gate.cjs */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.SITE_URL || 'http://127.0.0.1:8000/';
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
  const errors = [];
  async function page(width, height) {
    const p = await browser.newPage({viewport: {width, height}});
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(origin + '?intro=0');
    await p.waitForSelector('[data-project-figure-stage]');
    await p.waitForTimeout(800);
    return p;
  }
  async function state(p) {
    return p.evaluate(() => {
      const f = document.querySelector('.project-figure'), svg = f.querySelector('.project-figure__svg');
      return {animated: f.classList.contains('project-figure--animated'), seen: f.classList.contains('project-figure--seen'),
        compact: f.classList.contains('project-figure--compact'), open: f.querySelector('details').open,
        labelPx: Number(f.querySelector('[data-project-figure-stage]').dataset.minLabelPt) * svg.getBoundingClientRect().width / 636.4,
        pins: document.querySelectorAll('.pin-spacer > .project-figure').length};
    });
  }
  try {
    const narrow = await page(768, 900), wide = await page(1440, 900);
    assert.equal((await narrow.evaluate(() => window.EdwinOSFigureConfig.minLabelPx)), 9);
    assert.deepEqual([...(await Promise.all([state(narrow), state(wide)])).map(s => s.animated)], [false, true]);
    assert((await state(wide)).labelPx >= 9, 'animated SVG must be readable');
    assert(!(await state(narrow)).open, 'static step descriptions start collapsed');
    await narrow.locator('.project-figure__details summary').click();
    assert((await state(narrow)).open, 'step descriptions open on reader request');
    await narrow.reload();
    await narrow.waitForSelector('[data-project-figure-stage]');
    assert(!(await state(narrow)).open, 'reload restores the collapsed default');
    await wide.evaluate(() => {
      const trigger = ScrollTrigger.getAll().find(t => t.trigger?.classList.contains('project-figure'));
      window.scrollTo(0, (trigger.start + trigger.end) / 2);
    });
    await wide.waitForTimeout(600);
    await wide.setViewportSize({width: 768, height: 900});
    // Let ScrollTrigger handle viewport reflow, then compare the actual fixed figure.
    await wide.waitForTimeout(50);
    const before = await wide.locator('.project-figure').evaluate(e => e.getBoundingClientRect().top);
    await wide.waitForTimeout(400);
    const after = await wide.locator('.project-figure').evaluate(e => e.getBoundingClientRect().top);
    const resized = await state(wide);
    assert(resized.seen && !resized.animated && !resized.compact && !resized.open && !resized.pins);
    assert(Math.abs(after - before) <= 2, `figure shifted ${after - before}px after pin removal`);
    await narrow.close(); await wide.close();
    const tall = await page(1440, 900);
    // Simulate content/font growth on resize while label width remains eligible.
    await tall.addStyleTag({content: '.project-figure--animated .project-figure__header { min-height: 950px !important; }'});
    await tall.evaluate(() => window.dispatchEvent(new Event('resize')));
    await tall.waitForTimeout(400);
    const tooTall = await state(tall);
    assert(tooTall.seen && !tooTall.animated && !tooTall.compact && !tooTall.open,
      'resize must stop animation when its card exceeds 96% of viewport height');
    assert.deepEqual(errors, []);
    await tall.close();
    console.log('project figure legibility, resize and height checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
