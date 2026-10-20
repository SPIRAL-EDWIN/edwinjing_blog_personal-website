/* Browser regression with an ephemeral, canvas-recorded clip; no real assets changed.
 * Build first. NODE_PATH/BROWSER_EXECUTABLE follow tools/UI_REGRESSION.md.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const site = path.resolve(process.env.SITE_DIR || path.join(root, 'site'));
const origin = 'http://edwinos.test';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.xml': 'application/xml' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  try {
    const maker = await browser.newPage();
    await maker.setContent('<canvas width="160" height="100"></canvas>');
    const clip = Buffer.from(await maker.evaluate(async () => {
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(24), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start();
      for (let frame = 0; frame < 16; frame++) {
        ctx.fillStyle = '#c3e6ee'; ctx.fillRect(0, 0, 160, 100);
        ctx.fillStyle = '#195f62'; ctx.fillRect(frame * 5, 20, 30, 55);
        await new Promise(resolve => setTimeout(resolve, 42));
      }
      recorder.stop(); await stopped;
      stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    }));
    await maker.close();

    async function open(options = {}) {
      const context = await browser.newContext({ viewport: { width: options.mobile ? 390 : 1440, height: 1000 },
        reducedMotion: options.reduce ? 'reduce' : 'no-preference', hasTouch: !!options.mobile,
        isMobile: !!options.mobile });
      if (options.fallback) await context.addInitScript(() => {
        HTMLVideoElement.prototype.requestVideoFrameCallback = undefined;
        HTMLVideoElement.prototype.cancelVideoFrameCallback = undefined;
      });
      if (options.saveData) await context.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
      });
      const page = await context.newPage(), requests = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const prefix = options.prefix || '/';
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.endsWith('.webm')) {
          requests.push(url.pathname);
          if (options.fail) return route.abort();
          if (options.slow) await delay(400);
          return route.fulfill({ contentType: 'video/webm', body: clip });
        }
        let relative = decodeURIComponent(url.pathname);
        if (!relative.startsWith(prefix)) return route.fulfill({ status: 404, body: '' });
        relative = relative.slice(prefix.length);
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        let file = path.resolve(site, relative);
        if (relative === 'javascripts/ui-perf.js' || relative === 'stylesheets/edwinos.css') file = path.join(root, 'docs', relative);
        if ((!file.startsWith(site + path.sep) && !file.startsWith(path.join(root, 'docs') + path.sep)) || !fs.existsSync(file))
          return route.fulfill({ status: 404, body: '' });
        let body = fs.readFileSync(file);
        if (relative === 'sitemap.xml') body = body.toString().replaceAll('https://edwinjing-blog.com/', origin + prefix);
        if (relative === 'index.html' && options.fixture) {
          body = body.toString().replace(/<div class="overview-publication__media">([\s\S]*?)<\/div>/, (_, image) => {
            const media = '<div class="overview-publication__media overview-publication__media--preview">' + image +
              '<video class="overview-publication__preview" data-preview-src="assets/videos/publications/fixture.webm" preload="none" muted loop playsinline aria-hidden="true" tabindex="-1" hidden></video>' +
              '<button class="overview-publication__preview-toggle" data-preview-description="Temporary test motion" aria-label="Play preview: Temporary test motion" aria-pressed="false" hidden>Play preview</button></div>';
            return media;
          });
          if (options.two) body = body.replace('</ul><p class="overview-publication-notes">',
            '<li class="overview-publication" id="second-preview-fixture">' +
            body.match(/<div class="overview-publication__media overview-publication__media--preview">[\s\S]*?<\/div>/)[0] +
            '<div class="overview-publication__body">Second temporary test target</div></li></ul><p class="overview-publication-notes">');
        }
        return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body });
      });
      await page.goto(origin + prefix, { waitUntil: 'load' });
      const media = page.locator('.overview-publication__media').first();
      const preview = page.locator('.overview-publication__media--preview').first();
      const button = preview.locator('button'), video = preview.locator('video');
      const playing = () => page.waitForFunction(() => !!document.querySelector('.overview-publication__media.is-preview-playing'));
      const stopped = async () => {
        await page.waitForFunction(() => !document.querySelector('.overview-publication__media.is-preview-playing'));
        assert.equal(await video.evaluate(v => v.paused), true);
      };
      return { context, page, requests, errors, media, preview, button, video, playing, stopped };
    }

    {
      const t = await open();
      await t.media.scrollIntoViewIfNeeded(); await t.media.hover(); await delay(250);
      assert.equal(await t.page.locator('.overview-publication__preview').count(), 0);
      assert.equal(t.requests.length, 0);
      assert.deepEqual(t.errors, []); await t.context.close();
      console.log('PASS production: no configured preview, no controls or clip requests');
    }
    {
      const t = await open({ fixture: true, slow: true, prefix: '/project/', two: true });
      assert.equal(t.requests.length, 0, 'cold load must not compete with initial images');
      assert.equal(await t.video.getAttribute('src'), null);
      await t.preview.scrollIntoViewIfNeeded();
      const dimensions = await t.preview.boundingBox();
      await t.page.mouse.move(dimensions.x + dimensions.width + 35, dimensions.y + 30);
      await t.page.waitForFunction(() => !!document.querySelector('video[src]'));
      assert.equal(await t.video.evaluate(v => v.paused), true, 'proximity warms without playing');
      assert.equal(t.requests[0], '/project/assets/videos/publications/fixture.webm');
      await t.preview.hover(); await delay(100);
      assert.equal(await t.preview.evaluate(e => e.classList.contains('is-preview-playing')), false,
        'slow cold decode retains cover');
      await t.playing();
      assert.equal(await t.video.evaluate(v => v.readyState >= 2 && v.videoWidth > 0 && !v.paused), true);
      assert.equal((await t.preview.boundingBox()).height, dimensions.height, 'video does not change cover geometry');
      await t.page.mouse.move(0, 0); await t.stopped();
      await t.button.focus(); await t.button.press('Enter'); await t.playing();
      await t.button.press('Space'); await t.stopped();
      // At most one player, even with two configured projects on the same screen.
      await t.button.press('Enter'); await t.playing();
      const second = t.page.locator('#second-preview-fixture .overview-publication__preview-toggle');
      await second.focus(); await second.press('Enter');
      await t.page.waitForFunction(() => document.querySelector('#second-preview-fixture .is-preview-playing'));
      assert.equal(await t.page.locator('.is-preview-playing').count(), 1);
      assert.equal(await t.video.evaluate(v => v.paused), true);
      await t.page.evaluate(() => window.scrollTo(0, 0));
      await t.page.waitForFunction(() => !document.querySelector('.is-preview-playing'));
      // Real Material navigation must release the detached video and initialize return content once.
      await t.preview.scrollIntoViewIfNeeded(); await t.button.focus(); await t.button.press('Enter'); await t.playing();
      await t.page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await t.stopped();
      await t.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await delay(100); await t.stopped();
      await t.button.press('Enter'); await t.playing();
      const oldVideo = await t.video.elementHandle();
      await t.page.evaluate(() => {
        window.__previewNavigationDocument = true;
        Array.from(document.links).find(link => new URL(link.href).pathname.endsWith('/HOME/friends/')).click();
      });
      await t.page.waitForURL('**/HOME/friends/');
      await t.page.waitForFunction(() => !document.querySelector('.overview-publication__preview'));
      assert.equal(await t.page.evaluate(() => window.__previewNavigationDocument), true, 'Material keeps the same document');
      assert.equal(await oldVideo.evaluate(v => v.paused && !v.hasAttribute('src')), true);
      await t.page.goBack();
      await t.page.waitForSelector('.overview-publication__preview-toggle:not([hidden])');
      await t.preview.scrollIntoViewIfNeeded(); await t.button.focus(); await t.button.press('Enter'); await t.playing();
      assert.equal(await t.page.locator('.is-preview-playing').count(), 1);
      assert.deepEqual(t.errors, []); await t.context.close();
      console.log('PASS desktop: bounded proximity, cold-frame cover, prefixed URL, hover, keyboard, one player, offscreen/background pause, Material back/forward cleanup');
    }
    {
      const t = await open({ fixture: true, reduce: true, mobile: true });
      await t.preview.scrollIntoViewIfNeeded(); await t.preview.hover(); await delay(200);
      assert.equal(t.requests.length, 0);
      await t.button.tap(); await t.playing();
      await t.button.tap(); await t.stopped();
      assert.deepEqual(t.errors, []); await t.context.close();
      console.log('PASS touch/reduced motion: explicit play and pause, no automatic download');
    }
    {
      const t = await open({ fixture: true, saveData: true });
      await t.preview.scrollIntoViewIfNeeded(); await t.preview.hover(); await delay(200);
      assert.equal(t.requests.length, 0);
      await t.button.click(); await t.playing();
      await t.page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await t.video.evaluate(v => v.paused), false, 'explicit play survives automatic-motion preference changes');
      await t.button.click(); await t.stopped(); await t.context.close();
      console.log('PASS Save-Data: no warm or autoplay; explicit play remains available');
    }
    {
      const t = await open({ fixture: true, fallback: true });
      await t.preview.scrollIntoViewIfNeeded(); await t.preview.hover(); await t.playing();
      assert.equal(await t.video.evaluate(v => v.readyState >= 2 && !v.paused), true);
      await t.page.emulateMedia({ reducedMotion: 'reduce' }); await t.stopped();
      await t.preview.hover(); await delay(200); await t.stopped();
      assert.deepEqual(t.errors, []); await t.context.close();
      console.log('PASS frame-callback fallback and live reduced-motion change');
    }
    {
      const t = await open({ fixture: true, fail: true });
      await t.preview.scrollIntoViewIfNeeded(); await t.preview.hover();
      await t.page.waitForFunction(() => !!document.querySelector('.is-preview-error'));
      await t.stopped();
      assert.equal(await t.button.textContent(), 'Retry preview');
      const count = t.requests.length;
      await t.page.mouse.move(0, 0); await t.preview.hover(); await delay(250);
      assert.equal(t.requests.length, count, 'no automatic retry loop');
      await t.button.click(); await delay(250);
      assert(t.requests.length > count, 'explicit retry is available');
      assert.deepEqual(t.errors, []); await t.context.close();
      console.log('PASS failed media: static fallback, no automatic retry loop, explicit retry');
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
