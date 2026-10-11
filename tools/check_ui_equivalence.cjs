/* CSS-only A/B regression. See UI_REGRESSION.md for setup and limitations. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

// Configuration is evaluated before main(); keep invalid invocations aligned
// with the documented checker-failure exit code.
process.on('uncaughtException', error => {
  console.error(error);
  process.exitCode = 2;
});

const root = path.resolve(__dirname, '..');
const baselinePath = process.argv[2];
if (!baselinePath) throw new Error('Usage: node tools/check_ui_equivalence.cjs BASELINE.css');
const candidatePath = process.env.CANDIDATE_CSS || path.join(root, 'docs/stylesheets/edwinos.css');
const site = path.resolve(process.env.SITE_DIR || path.join(root, 'site'));
const origin = 'http://edwinos.test';
const report = path.resolve(process.env.REPORT || '/tmp/edwinos-ui-equivalence.json');

function jsonSetting(name, fallback) {
  try {
    return JSON.parse(process.env[name] || fallback);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`);
  }
}

const routes = jsonSetting('ROUTES', '["/","/HOME/friends/","/HOME/Archive/","/OsdNotes/","/经验分享/","/OsdNotes/PHIL/PHIL 206/"]');
const widths = jsonSetting('WIDTHS', '[1440,1220,1219,1013,1012,929,928,769,768,600,599,577,576,575,545,544,543,527,526,432,417,416,375,360]');
const states = jsonSetting('STATES', '["rest","search","query","close","drawer","scrolled"]');
const stateWidths = jsonSetting('STATE_WIDTHS', '[1440,768,375]');
const screenshotWidths = jsonSetting('SCREENSHOT_WIDTHS', '[1440,768,375]');
const screenshotStates = jsonSetting('SCREENSHOT_STATES', '["rest"]');
const browserArgs = jsonSetting('BROWSER_ARGS', '[]');
const motion = process.env.MOTION || 'reduce';
const knownStates = new Set([
  'rest', 'search', 'query', 'close', 'drawer', 'scrolled',
  'profile-hover', 'profile-focus', 'friend-hover', 'archive-hover', 'tab-hover',
  'source-hover', 'palette-hover', 'search-hover', 'search-focus',
  'drawer-button-hover', 'fragment-pinned', 'fragment-fading',
  'fragment-released', 'fragment-cleared'
]);

function requireNonEmptyArray(name, value) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${name} must be a non-empty JSON array.`);
}

function validateWidths(name, value) {
  if (!Array.isArray(value) || value.some(width => !Number.isFinite(width) || width <= 0))
    throw new Error(`${name} must be a JSON array of positive numbers.`);
}

requireNonEmptyArray('ROUTES', routes);
requireNonEmptyArray('WIDTHS', widths);
requireNonEmptyArray('STATES', states);
if (routes.some(route => typeof route !== 'string' || !route.startsWith('/')))
  throw new Error('ROUTES entries must be absolute site paths beginning with "/".');
validateWidths('WIDTHS', widths);
validateWidths('STATE_WIDTHS', stateWidths);
validateWidths('SCREENSHOT_WIDTHS', screenshotWidths);
if (!Array.isArray(browserArgs) || browserArgs.some(arg => typeof arg !== 'string' || !arg.trim()))
  throw new Error('BROWSER_ARGS must be a JSON array of nonempty strings.');
for (const [name, values] of [['STATES', states], ['SCREENSHOT_STATES', screenshotStates]]) {
  if (!Array.isArray(values) || values.some(state => !knownStates.has(state)))
    throw new Error(`${name} contains an unknown state. Allowed values: ${[...knownStates].join(', ')}.`);
}
if (!['reduce', 'no-preference'].includes(motion))
  throw new Error('MOTION must be "reduce" or "no-preference".');
const motionPropertiesOnly = process.env.MOTION_PROPERTIES_ONLY === '1';
const requestedFreezeMotion = process.env.FREEZE_MOTION !== '0';
if (motionPropertiesOnly && process.env.FREEZE_MOTION === '1')
  throw new Error('FREEZE_MOTION=1 would erase motion declarations; use FREEZE_MOTION=0 or omit it with MOTION_PROPERTIES_ONLY=1.');
const freezeMotion = motionPropertiesOnly ? false : requestedFreezeMotion;
const comparisonMode = process.env.COMPARISON_MODE || 'same-page';
if (!['same-page', 'fresh-page'].includes(comparisonMode))
  throw new Error('COMPARISON_MODE must be "same-page" or "fresh-page".');
const fragmentStates = new Set(['fragment-pinned', 'fragment-fading', 'fragment-released', 'fragment-cleared']);
if (states.some(state => fragmentStates.has(state))) {
  if (comparisonMode !== 'fresh-page')
    throw new Error('Fragment lifecycle states require COMPARISON_MODE=fresh-page so each side has an independent owner lifecycle.');
  if (routes.some(route => !new URL(route, origin).hash))
    throw new Error('Fragment lifecycle states require a heading hash in every ROUTES entry.');
}
function initialFragmentScheme(state, theme) {
  // Load a hash target in its requested theme. Flipping palette after initial
  // alignment can change article geometry and let Material tracking rewrite
  // the hash before the fragment capture begins.
  if (!fragmentStates.has(state)) return undefined;
  return theme === 'slate' ? 'dark' : 'light';
}
const dependencyVersions = {
  playwright: require('playwright/package.json').version,
  pngjs: require('pngjs/package.json').version
};

const motionProperties = (`transition-property transition-duration transition-delay transition-timing-function
 animation-name animation-duration animation-delay animation-timing-function animation-iteration-count`).trim().split(/\s+/);
const visualProperties = motionPropertiesOnly ? motionProperties : (`display position box-sizing pointer-events width height min-width max-width min-height max-height
 top right bottom left z-index margin-top margin-right margin-bottom margin-left
 padding-top padding-right padding-bottom padding-left gap row-gap column-gap
 grid-template-columns grid-template-rows grid-column-start grid-column-end grid-row-start grid-row-end
 flex-grow flex-shrink flex-basis flex-direction flex-wrap align-items align-self justify-content justify-self
 overflow-x overflow-y color background-color background-image background-size background-position background-repeat
 border-top border-right border-bottom border-left border-radius box-shadow outline-color outline-style outline-width outline-offset
 opacity transform font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-shadow
 white-space list-style-type list-style-position object-fit object-position visibility filter backdrop-filter
 mask-image mask-size mask-position mask-repeat -webkit-mask-image -webkit-mask-size -webkit-mask-position -webkit-mask-repeat
 mix-blend-mode isolation content ${motionProperties.join(' ')}`).trim().split(/\s+/);
const sources = [baselinePath, candidatePath].map(file => fs.readFileSync(file, 'utf8'));
const hashes = sources.map(text => crypto.createHash('sha256').update(text).digest('hex'));
// Inline CSS must retain the original external stylesheet's URL base.
const styles = sources.map(css => css.replace(/url\((["']?)([^\)]+?)\1\)/g, (all, quote, url) =>
  url.startsWith('data:') ? all : `url(${JSON.stringify(new URL(url, `${origin}/stylesheets/edwinos.css`).href)})`));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2' };

function differentPixels(a, b) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) return -1;
  let count = 0;
  for (let i = 0; i < x.data.length; i += 4)
    if (!x.data.subarray(i, i + 4).equals(y.data.subarray(i, i + 4))) count++;
  return count;
}

function writeReport(result) {
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify(result, null, 2));
}

function recordError(result, error) {
  result.status = 'error';
  if (!result.error) result.error = { name: error.name, message: error.message, stack: error.stack };
  writeReport(result);
}

async function closeBounded(resource, label, result) {
  let timer;
  try {
    await Promise.race([resource.close(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} cleanup timed out after 10000ms.`)), 10000);
    })]);
  } catch (error) {
    result.cleanupErrors.push({ phase: label, message: error.message });
    const hadPrimaryError = Boolean(result.error);
    recordError(result, error);
    if (!hadPrimaryError) throw error;
  } finally { clearTimeout(timer); }
}

function assertTocReleasePrerequisite(before) {
  if (before.visibleMatchingLinks > 0 && before.selectedMatchingLinks === 0)
    throw new Error(`Fragment release has no selected visible target to release: ${JSON.stringify(before)}`);
}

function compareSnapshots(baseline, candidate) {
  const changes = [];
  const count = Math.max(baseline.length, candidate.length);
  for (let i = 0; i < count; i++) {
    const before = baseline[i], after = candidate[i];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const nodeChanges = [];
    for (const kind of ['style', 'before', 'after', 'marker']) {
      const values = after?.[kind] || [];
      const oldValues = before?.[kind] || [];
      for (let j = 0; j < Math.max(values.length, oldValues.length); j++) {
        if (values[j] !== oldValues[j]) nodeChanges.push({
          kind, property: visualProperties[j], baseline: oldValues[j], candidate: values[j]
        });
      }
    }
    changes.push({
      index: i,
      id: after?.id || before?.id || '<missing>',
      rect: [before?.rect, after?.rect],
      changes: nodeChanges
    });
  }
  return changes;
}

async function installRoute(context, activeStyle) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';
    if (relative === '/stylesheets/edwinos.css')
      return route.fulfill({ contentType: 'text/css', body: styles[activeStyle.value] });
    const file = path.resolve(site, '.' + relative);
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
}

async function openRoute(page, routeName) {
  const response = await page.goto(origin + routeName, { waitUntil: 'load' });
  if (!response || !response.ok())
    throw new Error(`Route unavailable: ${routeName} (${response ? response.status() : 'no HTTP response'})`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `${freezeMotion ? '*,*::before,*::after,*::marker{animation:none!important;transition:none!important;caret-color:transparent!important}' : ''}
    .visitor-container,#beijing-time,.beijing-time-main,.beijing-time-zone{visibility:hidden!important}` });
}

async function installComparisonStyle(page) {
  await page.evaluate(() => {
    const link = document.querySelector('link[href*="stylesheets/edwinos.css"]');
    if (!link) throw new Error('EdwinOS stylesheet link was not found in the built page.');
    const style = document.createElement('style');
    style.id = 'comparison-css';
    link.after(style);
    link.disabled = true;
  });
}

async function setComparisonStyle(page, css) {
  await page.evaluate(value => { document.querySelector('#comparison-css').textContent = value; }, css);
  await page.evaluate(() => document.fonts.ready);
}

async function synchronizeTheme(page, theme) {
  await page.evaluate(value => {
    const body = document.body;
    const options = [...document.querySelectorAll('input.md-option[data-md-color-scheme]')];
    const selected = options.find(option => option.dataset.mdColorScheme === value);
    if (selected) {
      for (const option of options) option.checked = option === selected;
      for (const key of ['scheme', 'primary', 'accent']) {
        const setting = selected.dataset[`mdColor${key[0].toUpperCase()}${key.slice(1)}`];
        if (setting) body.setAttribute(`data-md-color-${key}`, setting);
      }
      selected.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      body.setAttribute('data-md-color-scheme', value);
    }
    // Keep Material's controls and the selector-driving body attribute in sync.
    body.setAttribute('data-md-color-scheme', value);
  }, theme);
}

async function applyState(page, theme, state) {
  await synchronizeTheme(page, theme);
  let assertion = await page.evaluate(async ({ requestedTheme, requestedState }) => {
    document.activeElement?.blur();
    if (!requestedState.startsWith('fragment-'))
      history.replaceState(history.state, '', location.pathname + location.search);
    const input = document.querySelector('.md-search__input');
    const search = document.getElementById('__search');
    const drawer = document.getElementById('__drawer');
    const setToggle = (toggle, checked) => {
      if (!toggle) return;
      toggle.checked = checked;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setQuery = value => {
      if (!input) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const openSearch = () => {
      // Follow the real activation path: closing intentionally blocks delayed
      // checkbox/focus reopen events until a new pointer activation occurs.
      const form = document.querySelector('.md-search__form');
      if (!form) throw new Error('Search form is missing.');
      form.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      form.click();
    };
    const scrollInstantly = top => {
      const rootStyle = document.documentElement.style;
      const oldValue = rootStyle.getPropertyValue('scroll-behavior');
      const oldPriority = rootStyle.getPropertyPriority('scroll-behavior');
      rootStyle.setProperty('scroll-behavior', 'auto', 'important');
      scrollTo(0, top);
      if (oldValue) rootStyle.setProperty('scroll-behavior', oldValue, oldPriority);
      else rootStyle.removeProperty('scroll-behavior');
    };
    // Reset through the input owner, not a second test-only query store.
    setQuery('');
    setToggle(search, false);
    setToggle(drawer, false);
    // Fragment positioning belongs to block-links. Resetting its scroll here
    // would also let Material publish a different hash before activation.
    if (!requestedState.startsWith('fragment-')) {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      scrollInstantly(0);
    }

    if (requestedState === 'search') openSearch();
    if (requestedState === 'query') {
      openSearch();
      setQuery('reward');
    }
    if (requestedState === 'close') {
      openSearch();
      setQuery('reward');
    }
    if (requestedState === 'drawer') setToggle(drawer, true);
    if (requestedState === 'scrolled') {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      scrollInstantly(Math.min(800, maxScroll));
    }

    return {
      theme: document.body.getAttribute('data-md-color-scheme'),
      paletteScheme: document.querySelector('input.md-option[data-md-color-scheme]:checked')?.dataset.mdColorScheme || null,
      searchChecked: Boolean(search?.checked),
      drawerChecked: Boolean(drawer?.checked),
      query: input?.value || '',
      scrollY,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight)
    };
  }, { requestedTheme: theme, requestedState: state });

  if (state === 'close') {
    const activation = { ...assertion };
    if (!activation.searchChecked || activation.query !== 'reward')
      throw new Error(`Close preparation did not activate the real query: ${JSON.stringify(activation)}`);
    // Exercise the trusted production close path. This bounded timer is not a
    // claim that every deferred animation-frame focus callback has run.
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({
      searchChecked: Boolean(document.getElementById('__search')?.checked),
      query: document.querySelector('.md-search__input')?.value || ''
    }));
    assertion = { ...assertion, ...closed, closeActivation: activation,
      closeMethod: 'trusted Escape', closePreparation: '200ms timer' };
  }

  if (assertion.theme !== theme) throw new Error(`Theme state failed: requested ${theme}, got ${assertion.theme}`);
  if (assertion.paletteScheme && assertion.paletteScheme !== theme)
    throw new Error(`Palette control failed: requested ${theme}, got ${assertion.paletteScheme}`);
  if (assertion.searchChecked !== ['search', 'query'].includes(state))
    throw new Error(`Search toggle state failed for ${state}`);
  if (assertion.drawerChecked !== (state === 'drawer'))
    throw new Error(`Drawer toggle state failed for ${state}`);
  if (assertion.query !== (state === 'query' ? 'reward' : ''))
    throw new Error(`Search query reset failed for ${state}`);
  if (state === 'scrolled' && assertion.maxScroll > 0 && assertion.scrollY <= 0)
    throw new Error('Scrolled state did not move the document.');
  if (state !== 'scrolled' && !fragmentStates.has(state) && assertion.scrollY !== 0)
    throw new Error(`Scroll reset failed for ${state}: ${assertion.scrollY}`);
  return assertion;
}

async function settleInteraction(page, state) {
  await page.mouse.move(0, 999);
  const targets = {
    'profile-hover': '.btn-github-action',
    'profile-focus': '.btn-github-action',
    'friend-hover': '.friend-card',
    'archive-hover': '.archive-card',
    'tab-hover': '.md-tabs__link',
    'source-hover': '.md-header__source',
    'palette-hover': '.md-header__option',
    'search-hover': '.md-search',
    'search-focus': '.md-search__input',
    'drawer-button-hover': '.md-header__button[for="__drawer"]'
  };
  const target = targets[state];
  if (target) {
    const locator = page.locator(target).first();
    if (state.endsWith('focus')) await locator.focus();
    else await locator.hover();
  }
  // Material applies scroll/header/palette state through asynchronous listeners.
  await page.waitForTimeout(600);
}

async function snapshotPage(page) {
  return page.evaluate(({ props, motionOnly }) => {
    const elements = [document.documentElement, document.body,
      ...document.querySelectorAll('.md-header, .md-header *, .md-tabs, .md-tabs *, .md-container, .md-main, .md-main *, .md-footer, .md-footer *, .md-overlay')]
      .filter((element, index, array) => array.indexOf(element) === index)
      .filter(element => !['SCRIPT', 'STYLE', 'PATH', 'USE'].includes(element.tagName));
    return elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = pseudo => {
        const computed = getComputedStyle(element, pseudo);
        return props.map(property => computed.getPropertyValue(property));
      };
      const className = typeof element.className === 'string' ? element.className : '';
      return {
        id: `${index}:${element.tagName}.${className}`,
        rect: motionOnly ? [] : [rect.x, rect.y, rect.width, rect.height],
        style: style(null), before: style('::before'), after: style('::after'), marker: style('::marker')
      };
    });
  }, { props: visualProperties, motionOnly: motionPropertiesOnly });
}

function shouldScreenshot(width, state) {
  return !motionPropertiesOnly && screenshotWidths.includes(width) && screenshotStates.includes(state);
}

async function capture(page, theme, state, screenshot, routeName) {
  let timer;
  try {
    return await Promise.race([
      captureState(page, theme, state, screenshot, routeName),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(
        `Capture timed out after 30000ms: ${routeName} ${theme} ${state}; inspect browser frame/IPC readiness.`)), 30000); })
    ]);
  } finally { clearTimeout(timer); }
}

async function captureState(page, theme, state, screenshot, routeName) {
  if (fragmentStates.has(state)) return captureFragment(page, theme, state, screenshot, routeName);
  // First pass clears delayed Material/runtime work from the freshly loaded
  // document. The second pass is the authoritative state for this capture.
  await applyState(page, theme, state);
  await page.waitForTimeout(600);
  const assertion = await applyState(page, theme, state);
  await settleInteraction(page, state);
  const searchResults = state === 'query' ? await waitForSearchResults(page) : null;
  const settled = await page.evaluate(() => ({
    theme: document.body.getAttribute('data-md-color-scheme'),
    paletteScheme: document.querySelector('input.md-option[data-md-color-scheme]:checked')?.dataset.mdColorScheme || null,
    searchChecked: Boolean(document.getElementById('__search')?.checked),
    drawerChecked: Boolean(document.getElementById('__drawer')?.checked),
    query: document.querySelector('.md-search__input')?.value || '',
    scrollY,
    maxScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight)
  }));
  if (settled.theme !== theme || (settled.paletteScheme && settled.paletteScheme !== theme))
    throw new Error(`Theme state changed while ${state} settled: ${JSON.stringify(settled)}`);
  if (settled.searchChecked !== ['search', 'query'].includes(state))
    throw new Error(`Search toggle changed while ${state} settled: ${JSON.stringify(settled)}`);
  if (settled.drawerChecked !== (state === 'drawer'))
    throw new Error(`Drawer toggle changed while ${state} settled: ${JSON.stringify(settled)}`);
  if (settled.query !== (state === 'query' ? 'reward' : ''))
    throw new Error(`Search query changed while ${state} settled: ${JSON.stringify(settled)}`);
  if (state === 'scrolled' && settled.maxScroll > 0 && settled.scrollY <= 0)
    throw new Error('Scrolled state was lost while observers settled.');
  if (state !== 'scrolled' && settled.scrollY !== 0)
    throw new Error(`Scroll reset was lost while ${state} settled: ${settled.scrollY}`);
  return {
    assertion: {
      applied: assertion,
      settled,
      searchResults,
      skipped: state === 'scrolled' && settled.maxScroll === 0,
      skipReason: state === 'scrolled' && settled.maxScroll === 0 ? 'document is not scrollable' : null
    },
    snapshot: await snapshotPage(page),
    shot: screenshot ? await page.screenshot({ animations: 'disabled' }) : null
  };
}

async function waitForSearchResults(page) {
  // A matching query string alone can falsely pass with an empty/unready
  // worker. Require real destinations and a stable result set before capture.
  return page.evaluate(async () => {
    const start = Date.now();
    let last = '', stableSince = start;
    while (Date.now() - start < 15000) {
      const links = [...document.querySelectorAll('.md-search-result__link[href]')];
      const destinations = links.map(link => link.getAttribute('href'));
      const valid = destinations.length > 0 && destinations.every(href => {
        if (!href || href === '#') return false;
        return /^https?:$/.test(new URL(href, location.href).protocol);
      });
      const key = JSON.stringify(destinations);
      if (!valid || key !== last) { last = key; stableSince = Date.now(); }
      if (valid && Date.now() - stableSince >= 300) return {
        count: links.length, destinations, stableForMs: 300,
        query: document.querySelector('.md-search__input')?.value || ''
      };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Query result state failed: no stable, nonempty search destinations within 15000ms.');
  });
}

async function captureFragment(page, theme, state, screenshot, routeName) {
  const requestedHash = new URL(routeName || page.url(), origin).hash;
  await applyState(page, theme, state);
  await settleInteraction(page, state);
  const activated = await page.evaluate(({ requestedState, expectedHash }) => {
    const hash = location.hash;
    if (hash !== expectedHash) throw new Error(`Requested fragment changed before activation: ${expectedHash} -> ${hash}`);
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target?.matches('h1,h2,h3,h4,h5,h6'))
      throw new Error(`Fragment state requires an existing heading target: ${hash}`);
    // Re-enter through block-links' hash owner, not a manually added class.
    // Its native lifecycle is very short (500ms); pinned capture alone holds
    // that proven state by removing later fading additions, never adding pin.
    dispatchEvent(new HashChangeEvent('hashchange'));
    if (!target.classList.contains('block-highlight--pinned') ||
        target.classList.contains('block-highlight--fading'))
      throw new Error(`Fragment owner did not activate the pinned heading: ${hash}`);
    if (requestedState === 'fragment-pinned') {
      const observer = new MutationObserver(() => {
        if (target.classList.contains('block-highlight--fading'))
          target.classList.remove('block-highlight--fading');
      });
      observer.observe(target, { attributes: true, attributeFilter: ['class'] });
      window.__equivalenceFragmentHold = observer;
    }
    return { hash, id: target.id, tagName: target.tagName,
      ownerActivated: true, selectedTocCount: document.querySelectorAll('.edwinos-toc-link--selected').length };
  }, { requestedState: state, expectedHash: requestedHash });

  if (state !== 'fragment-pinned') {
    try {
      await page.waitForFunction(id =>
        document.getElementById(id)?.classList.contains('block-highlight--fading'), activated.id,
        { timeout: 10000, polling: 100 });
    } catch (error) {
      const observed = await page.evaluate(id => ({ hash: location.hash,
        classes: document.getElementById(id)?.className || null,
        highlights: [...document.querySelectorAll('.block-highlight')].map(node => node.id) }), activated.id);
      throw new Error(`Fragment owner did not enter fading: ${JSON.stringify(observed)}; ${error.message}`);
    }
  }
  // Allow the owner's bounded alignment repair to complete on both sides.
  await page.waitForTimeout(700);
  let releaseBefore = null;
  if (state === 'fragment-released') {
    releaseBefore = await page.evaluate(hash => {
      const matching = [...document.querySelectorAll('.md-sidebar--secondary a.md-nav__link[href*="#"]')]
        .filter(link => link.hash === hash && link.getClientRects().length > 0 &&
          link.getBoundingClientRect().width > 0 && getComputedStyle(link).visibility !== 'hidden');
      return { visibleMatchingLinks: matching.length,
        selectedMatchingLinks: matching.filter(link => link.classList.contains('edwinos-toc-link--selected')).length };
    }, activated.hash);
    assertTocReleasePrerequisite(releaseBefore);
    // A trusted reader keyboard action follows the production release owner.
    // Unlike mouse.wheel it does not await a compositor frame acknowledgement.
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
  }
  if (state === 'fragment-cleared') {
    const url = new URL(page.url());
    url.hash = '';
    // Empty hashchange does NOT clear heading classes in production. Only a
    // new document/owner run clears them, so test that actual exit contract.
    // A same-URL goto can otherwise be optimized into same-document hash
    // removal; cross a real document boundary explicitly on both sides.
    await page.goto('about:blank');
    await openRoute(page, url.pathname + url.search);
    await applyState(page, theme, 'rest');
    await settleInteraction(page, 'rest');
  }
  const settled = await page.evaluate(id => {
    const target = document.getElementById(id);
    return { hash: location.hash, theme: document.body.getAttribute('data-md-color-scheme'),
      pinned: Boolean(target?.classList.contains('block-highlight--pinned')),
      fading: Boolean(target?.classList.contains('block-highlight--fading')),
      highlightCount: document.querySelectorAll('.block-highlight').length,
      selectedTocCount: document.querySelectorAll('.edwinos-toc-link--selected').length,
      scrollY, searchChecked: Boolean(document.getElementById('__search')?.checked),
      drawerChecked: Boolean(document.getElementById('__drawer')?.checked),
      query: document.querySelector('.md-search__input')?.value || '' };
  }, activated.id);
  if (settled.theme !== theme || settled.searchChecked || settled.drawerChecked || settled.query)
    throw new Error(`Fragment controls changed while settling: ${JSON.stringify(settled)}`);
  if (state === 'fragment-cleared') {
    if (settled.hash || settled.highlightCount || settled.selectedTocCount)
      throw new Error(`Fragment document exit did not clear highlights: ${JSON.stringify(settled)}`);
  } else {
    if (!settled.pinned || settled.fading !== (state !== 'fragment-pinned'))
      throw new Error(`Fragment lifecycle state failed for ${state}: ${JSON.stringify(settled)}`);
    if (state !== 'fragment-released' && settled.hash !== activated.hash)
      throw new Error(`Fragment hash was not preserved: ${JSON.stringify(settled)}`);
    if (state === 'fragment-released' && settled.selectedTocCount !== 0)
      throw new Error(`Reader ArrowDown did not release the TOC override: ${JSON.stringify(settled)}`);
  }
  return { assertion: { applied: activated, settled, skipped: false, skipReason: null,
    pinnedCaptureHold: state === 'fragment-pinned', releaseMethod: state === 'fragment-released' ? 'reader ArrowDown' : null,
    releaseBefore, releaseAfter: state === 'fragment-released' ? { selectedTocCount: settled.selectedTocCount } : null,
    releaseSelectionApplicable: state === 'fragment-released' ? releaseBefore.visibleMatchingLinks > 0 : null,
    releaseSelectionSkipReason: state === 'fragment-released' && !releaseBefore.visibleMatchingLinks ? 'no visible secondary TOC target link' : null,
    exitMethod: state === 'fragment-cleared' ? 'new document without hash' : null },
    snapshot: await snapshotPage(page), shot: screenshot ? await page.screenshot({ animations: 'disabled' }) : null };
}

async function main() {
  const warnings = [];
  if (hashes[0] === hashes[1]) warnings.push('Baseline and candidate SHA-256 hashes are identical; this run cannot exercise a stylesheet difference.');
  if (motionPropertiesOnly && requestedFreezeMotion)
    warnings.push('MOTION_PROPERTIES_ONLY=1 automatically disabled the default motion freeze.');
  const result = {
    status: 'running', baselinePath, candidatePath, hashes, warnings,
    config: { routes, widths, states, stateWidths, screenshotWidths, screenshotStates,
      motion, freezeMotion, motionPropertiesOnly, comparisonMode, browserArgs, dependencyVersions },
    total: 0, currentScenario: null, completedRoutes: [], stateAssertions: [], skipped: [], failures: [], error: null, cleanupErrors: []
  };
  writeReport(result);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs,
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    for (const routeName of routes) {
      let activeStyle = null;
      let context = null;
      let sharedPage = null;
      if (comparisonMode === 'same-page') {
        activeStyle = { value: 0 };
        context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: motion });
        await installRoute(context, activeStyle);
        sharedPage = await context.newPage();
      }

      for (const width of widths) for (const theme of ['default', 'slate']) {
        const scenarioStates = stateWidths.includes(width) ? states : ['rest'];
        for (const state of scenarioStates) {
          const key = { routeName, width, theme, state };
          result.currentScenario = key;
          writeReport(result);
          const screenshot = shouldScreenshot(width, state);
          const captures = [];

          if (comparisonMode === 'same-page') {
            activeStyle.value = 0;
            await sharedPage.setViewportSize({ width, height: 1000 });
            await openRoute(sharedPage, routeName);
            await installComparisonStyle(sharedPage);
            await setComparisonStyle(sharedPage, styles[0]);
            captures.push(await capture(sharedPage, theme, state, screenshot, routeName));
            await setComparisonStyle(sharedPage, styles[1]);
            captures.push(await capture(sharedPage, theme, state, screenshot, routeName));
          } else {
            for (let cssIndex = 0; cssIndex < styles.length; cssIndex++) {
              const sideStyle = { value: cssIndex };
              const sideContext = await browser.newContext({
                viewport: { width, height: 1000 }, reducedMotion: motion,
                colorScheme: initialFragmentScheme(state, theme)
              });
              try {
                await installRoute(sideContext, sideStyle);
                const page = await sideContext.newPage();
                await openRoute(page, routeName);
                captures.push(await capture(page, theme, state, screenshot, routeName));
              } catch (error) {
                // Persist the primary capture error before close() can itself
                // stall on browser IPC. Cleanup must never replace this cause.
                recordError(result, error);
                throw error;
              } finally {
                await closeBounded(sideContext, 'fresh-page context', result);
              }
            }
          }

          result.stateAssertions.push({ ...key,
            baseline: captures[0].assertion, candidate: captures[1].assertion });
          const searchResults = captures.map(capture => capture.assertion.searchResults);
          if (state === 'query' && JSON.stringify(searchResults[0].destinations) !== JSON.stringify(searchResults[1].destinations))
            result.failures.push({ ...key, searchResults: { baseline: searchResults[0], candidate: searchResults[1] } });
          const skippedSides = captures.map(capture => capture.assertion.skipped);
          if (skippedSides[0] && skippedSides[1]) {
            result.skipped.push({ ...key, reason: 'document is not scrollable in either stylesheet' });
            result.total++;
            continue;
          }
          if (skippedSides[0] !== skippedSides[1]) {
            result.failures.push({ ...key, stateAvailability: {
              baseline: captures[0].assertion.skipReason,
              candidate: captures[1].assertion.skipReason
            } });
          }
          const differences = compareSnapshots(captures[0].snapshot, captures[1].snapshot);
          if (differences.length) result.failures.push({ ...key, differences });
          if (captures[0].shot && captures[1].shot) {
            const pixels = differentPixels(captures[0].shot, captures[1].shot);
            if (pixels) {
              const artifactBase = report.replace(/\.json$/, '') + `-scenario-${result.total}`;
              const screenshots = { baseline: `${artifactBase}-baseline.png`, candidate: `${artifactBase}-candidate.png` };
              fs.writeFileSync(screenshots.baseline, captures[0].shot);
              fs.writeFileSync(screenshots.candidate, captures[1].shot);
              result.failures.push({ ...key, pixels, screenshots });
            }
          }
          result.total++;
          writeReport(result);
        }
      }
      if (sharedPage) await closeBounded(sharedPage, 'same-page document', result);
      if (context) await closeBounded(context, 'same-page context', result);
      result.completedRoutes.push(routeName);
      writeReport(result);
      console.log(JSON.stringify({ routeName, total: result.total, failures: result.failures.length }));
    }
    if (result.total === 0)
      throw new Error('The configured matrix completed without running any scenarios.');
    if (result.total === result.skipped.length)
      throw new Error('Every configured scenario was skipped; no stylesheet comparison was exercised.');
    result.status = 'complete';
    result.currentScenario = null;
    writeReport(result);
  } catch (error) {
    recordError(result, error);
    throw error;
  } finally {
    if (browser) await closeBounded(browser, 'browser', result);
  }
  console.log(`Report: ${report}`);
  process.exitCode = result.failures.length ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });
