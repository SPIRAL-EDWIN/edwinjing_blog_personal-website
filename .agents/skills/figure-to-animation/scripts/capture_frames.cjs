#!/usr/bin/env node
// Usage: node capture_frames.cjs URL OUTPUT_DIR [selector] [chromium|webkit]
// Requires playwright installed in the caller's module resolution path.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
(async () => {
  const [url, out, selector = 'body', engine = 'chromium'] = process.argv.slice(2);
  if (!url || !out || !['chromium', 'webkit'].includes(engine)) throw new Error('Usage: capture_frames.cjs URL OUTPUT_DIR [selector] [chromium|webkit]');
  fs.mkdirSync(out, { recursive: true });
  const browser = await ({ chromium, webkit })[engine].launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'visible' });
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('Target has no layout box');
  const max = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const start = Math.max(0, bounds.y - 900);
  const end = Math.min(max, bounds.y + bounds.height);
  for (let i = 0; i <= 100; i += 5) {
    await page.evaluate(y => window.scrollTo(0, y), start + (end - start) * i / 100);
    await page.waitForTimeout(100);
    if (i % 25 === 0) await page.screenshot({ path: path.join(out, `${engine}-${i}.png`) });
  }
  await context.close();
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
