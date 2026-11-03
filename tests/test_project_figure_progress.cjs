/* Run against the local MkDocs preview with Playwright and a Chromium browser. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto((process.env.SITE_URL || 'http://127.0.0.1:8000/') + '?intro=0');
    await page.waitForFunction(() => !!window.ScrollTrigger?.getAll().find(t => t.trigger?.matches('.project-figure')));
    const read = () => page.evaluate(() => {
      const figure = document.querySelector('.project-figure'), rail = figure.querySelector('.project-figure__rail');
      return {animated: figure.classList.contains('project-figure--animated'), compact: figure.classList.contains('project-figure--compact'),
        hidden: rail.hidden, border: getComputedStyle(rail).borderLeftColor,
        buttons: [...rail.querySelectorAll('button')].map(b => ({visited: b.classList.contains('is-visited'), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, color: getComputedStyle(b).color, shadow: getComputedStyle(b).boxShadow})),
        signals: figure.querySelectorAll('.bwbc-signal').length};
    });
    await page.evaluate(() => { const t = ScrollTrigger.getAll().find(t => t.trigger?.matches('.project-figure')); scrollTo(0, t.start + (t.end - t.start) * .45); });
    await page.waitForTimeout(1200);
    const middle = await read();
    assert(middle.animated && !middle.hidden, 'rail should be visible while the animation is active');
    assert(middle.buttons.filter(b => b.visited).length >= 2 && middle.buttons.some(b => !b.visited), 'earlier steps stay highlighted');
    assert.equal(middle.signals, 0, 'no second moving signal should follow the connectors');
    await page.evaluate(() => { const t = ScrollTrigger.getAll().find(t => t.trigger?.matches('.project-figure')); scrollTo(0, t.end + 200); });
    await page.waitForFunction(() => document.querySelector('.project-figure').classList.contains('project-figure--seen'));
    const done = await read();
    assert(done.compact && !done.hidden, 'completed desktop rail remains visible');
    assert(done.buttons.every(b => b.visited && b.disabled && b.pressed === 'false' && b.shadow === 'none'), 'all steps stay lit, without an active indicator');
    assert.equal(new Set(done.buttons.map(b => b.color)).size, 1);
    assert.equal(done.signals, 0);
    await page.goto((process.env.SITE_URL || 'http://127.0.0.1:8000/') + '?intro=0');
    await page.waitForFunction(() => document.querySelector('.project-figure')?.classList.contains('project-figure--animated'));
    const fresh = await read();
    assert.equal(fresh.buttons.filter(b => b.visited).length, 1, 'refresh starts again from the first step');
    assert.deepEqual(errors, []);
    console.log('project figure rail progress, completion and refresh passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
