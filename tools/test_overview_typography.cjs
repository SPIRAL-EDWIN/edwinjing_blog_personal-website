/* Build first. Optional Playwright setup matches UI_REGRESSION.md. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const site = path.resolve(process.env.SITE_DIR || path.join(root, 'site'));
const origin = 'http://edwinos.test';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  try {
    for (const width of [1440, 769, 768, 681, 680, 390]) {
      for (const colorScheme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 },
          reducedMotion: 'reduce', colorScheme });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          let relative = decodeURIComponent(url.pathname);
          if (relative.endsWith('/')) relative += 'index.html';
          const file = path.resolve(site, '.' + relative);
          if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream',
            body: fs.readFileSync(file) });
        });
        await page.goto(origin, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const type = selector => page.locator(selector).first().evaluate(element => {
          const css = getComputedStyle(element);
          return [css.fontSize, css.lineHeight, css.fontWeight];
        });
        // Only the short About introduction opts into the larger reading size.
        assert.deepEqual(await type('.academic-section:first-of-type > p'), ['15px', '26.25px', '400']);
        assert.deepEqual(await type('.overview-publication-notes'), ['12px', '19.8px', '400']);
        const rowType = width <= 768 ? ['14.8px', '21.904px'] : ['15.2px', '22.496px'];
        for (const selector of ['.news-list > li', '.overview-education-item',
          '.overview-publication', '.award-list > li']) {
          assert.deepEqual((await type(selector)).slice(0, 2), rowType, selector);
        }
        assert.match(await page.locator('.academic-section:first-of-type > p')
          .evaluate(e => getComputedStyle(e).fontFamily), /Outfit/);
        const summary = page.locator('.about-profile-details > summary');
        await summary.click();
        assert.deepEqual(await type('.about-profile-body p'), ['14px', '23.8px', '400']);
        assert.deepEqual(await type('.about-profile-body li'), ['14px', '23.8px', '400']);
        await summary.press('Enter');
        assert.equal(await page.locator('.about-profile-details').getAttribute('open'), null);
        await summary.press('Space');
        assert.notEqual(await page.locator('.about-profile-details').getAttribute('open'), null);

        await page.evaluate(() => {
          const section = document.createElement('section');
          section.className = 'academic-section';
          section.id = 'typography-fixture';
          section.innerHTML = '<p>Future prose paragraph.</p><p>Second paragraph.</p>' +
            '<ul><li>Future prose list.</li></ul><p class="fixture-caption">Small caption.</p>' +
            '<p class="overview-section-empty">Empty state.</p>' +
            '<p class="overview-publication__award">Award caption.</p>';
          document.querySelector('.academic-home-layout > .academic-content').append(section);
          const style = document.createElement('style');
          style.textContent = '.fixture-caption { font-family: monospace; font-size: 11px; line-height: 1.4; }' +
            '.academic-home-layout .fixture-caption { margin: 2px; }';
          document.head.append(style);
        });
        assert.deepEqual(await type('#typography-fixture > p'), ['14px', '23.1px', '400']);
        assert.deepEqual(await type('#typography-fixture li'), ['14px', '23.1px', '400']);
        assert.deepEqual(await type('.fixture-caption'), ['11px', '15.4px', '400']);
        assert.equal(await page.locator('.fixture-caption')
          .evaluate(e => getComputedStyle(e).fontFamily), 'monospace');
        assert.equal((await type('.overview-section-empty'))[0], '12px');
        assert.deepEqual(await type('.overview-publication__award'), ['11.5px', '15.525px', '500']);
        assert.equal(await page.locator('.fixture-caption').evaluate(e => getComputedStyle(e).margin), '2px');
        assert.equal(await page.locator('#typography-fixture > p').first()
          .evaluate(e => getComputedStyle(e).marginBottom), '10px');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px ${colorScheme}: prose, details, captions, future content`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
