/* Fragment hand-off regression: exact TOC selection through layout settling,
 * then yield to reader input instead of pinning or re-scrolling indefinitely. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('docs/javascripts/block-links.js', 'utf8');

function fixture(options = {}) {
  let now = 0, nextId = 1, run;
  const timers = new Map(), frames = new Map(), events = new Map();
  const location = {};
  function setUrl(href) {
    const parsed = new URL(href, location.href || 'http://127.0.0.1:8000/');
    Object.assign(location, { href: parsed.href, origin: parsed.origin,
      pathname: parsed.pathname, search: parsed.search, hash: parsed.hash });
  }
  setUrl('http://127.0.0.1:8000/CHEM/#sp3-2s2p');
  const root = { contains: () => true, querySelectorAll: selector => selector === ".arithmatex"
    ? nodes.filter(node => node.kind === "formula") : nodes }, body = {};
  const nodes = [], observers = [];
  function classes() {
    const values = new Set();
    return { add: (...items) => items.forEach(x => values.add(x)),
      remove: (...items) => items.forEach(x => values.delete(x)),
      contains: item => values.has(item) };
  }
  const header = { getBoundingClientRect: () => ({ height: 56, bottom: 56 }) };
  const heading = { id: 'sp3-2s2p', classList: classes(), offsetWidth: 200,
    matches: selector => selector.includes('h3'),
    closest: () => null, getBoundingClientRect: () => ({ top: 1600 - window.scrollY }),
    scrollIntoView() { throw new Error('heading hand-off must use header-safe alignment'); } };
  nodes.push(heading);
  function bodyMatch(top, kind = "mark", excluded = false) {
    const node = { kind, textContent: kind === "formula" ? "\\(2p+q\\)" : "2p",
      matches: selector => selector === ".arithmatex" ? kind === "formula"
        : selector === "mark[data-md-highlight]" ? kind === "mark" : false,
      closest: selector => selector.includes("data-search-exclude") && excluded ? {}
        : selector.includes("p, pre") && node.block ? node.block : null,
      getClientRects: () => [{}], getBoundingClientRect: () => ({ top: node.top - window.scrollY }), top };
    return node;
  }
  const previous = { id: '_9', classList: classes(), matches: () => true };
  const sidebar = { querySelectorAll: () => links.filter(x => x.classList.contains('edwinos-toc-link--selected')) };
  const links = ['#_9', '#sp3-2s2p'].map(hash => ({ hash, isConnected: true,
    classList: classes(), getBoundingClientRect: () => ({ width: 100 }),
    closest: selector => selector === '.md-sidebar--secondary' ? sidebar : null }));
  links[0].classList.add('md-nav__link--active');
  const document = {
    createRange: () => ({ selectNodeContents() {}, setEnd(node) { this.node = node; },
      toString() { return this.node.prefix || ''; } }),
    body, scrollingElement: { scrollHeight: options.scrollHeight || 10000 },
    querySelector: selector => selector === '.md-header' ? header
      : selector === '.md-content__inner' ? root : null,
    getElementById: id => id === heading.id ? heading : id === previous.id ? previous : null,
    querySelectorAll: selector => selector.includes('a.md-nav__link') ? links
      : selector.includes('edwinos-toc-link--selected') ? links.filter(x => x.classList.contains('edwinos-toc-link--selected'))
      : [heading, previous].filter(x => x.classList.contains('block-highlight')),
    addEventListener: (name, handler) => events.set('document:' + name, handler)
  };
  const history = { replaceState: (_, __, href) => setUrl(href), pushState: (_, __, href) => setUrl(href) };
  const window = { location, history, scrollY: 0, innerHeight: 800,
    document$: { subscribe: handler => { run = handler; } },
    matchMedia: () => ({ matches: true }),
    scrollTo: ({ top }) => { window.scrollY = top; },
    setTimeout: (handler, delay) => { const id = nextId++; timers.set(id, { handler, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: handler => { const id = nextId++; frames.set(id, handler); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, handler) => events.set('window:' + name, handler)
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.stopped = true; }
  }
  vm.runInNewContext(source, { window, document, history, URL, MutationObserver, Date: { now: () => now } });
  function flushFrames() {
    for (let pass = 0; frames.size && pass < 100; pass++) {
      const pending = [...frames.values()]; frames.clear(); now += 16;
      pending.forEach(handler => handler(now));
    }
    assert.equal(frames.size, 0);
  }
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) {
      timers.delete(id); timer.handler();
    }
    flushFrames();
  }
  return { window, links, heading, nodes, bodyMatch, observers, run: () => run(), setUrl, flushFrames, advance,
    dispatch: (name, detail) => events.get(name)(detail || {}) };
}

const page = fixture();
page.run(); page.flushFrames();
assert.equal(page.heading.getBoundingClientRect().top, 96, 'heading clears the translucent header');
assert(page.links[1].classList.contains('edwinos-toc-link--selected'), 'cross-page fragment selects its exact TOC entry');
page.setUrl('/CHEM/#_9'); // Material considers the heading below its threshold.
page.advance(700);
assert.equal(page.window.location.hash, '#sp3-2s2p', 'one bounded settle pass restores the requested heading');
page.setUrl('/CHEM/#_9');
page.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#_9' } });
page.flushFrames(); page.advance(700);
assert.equal(page.window.location.hash, '#sp3-2s2p', 'late formula layout uses the original explicit fragment');
page.dispatch('window:wheel');
assert(!page.links[1].classList.contains('edwinos-toc-link--selected'), 'reader scrolling immediately releases the override');
page.window.scrollY = 900;
page.setUrl('/CHEM/#sp3-2s2p');
page.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#sp3-2s2p' } });
page.flushFrames(); page.advance(1000);
assert.equal(page.window.scrollY, 900, 'late MathJax cannot snap back after reader input');
page.setUrl('/CHEM/#sp3-2s2p'); page.run(); page.flushFrames();
page.setUrl('/HOME/friends/'); page.run(); page.advance(1000);
assert.equal(page.window.location.pathname, '/HOME/friends/');
assert.equal(page.window.location.hash, '', 'page replacement invalidates old fragment repairs');
const transition = fixture();
transition.setUrl('/Hua/#previous-section');
transition.run(); transition.flushFrames();
const crossPageLink = {
  target: '', getAttribute: () => '/CHEM/#sp3-2s2p',
  closest: () => null
};
transition.dispatch('document:click', {
  button: 0, target: { closest: () => crossPageLink },
  preventDefault() { throw new Error('Material owns cross-page navigation'); }
});
transition.run(); // An outgoing document emission must not consume the target.
transition.setUrl('/CHEM/#previous-section'); // Outgoing scrollspy overwrote the URL.
transition.dispatch('window:scrollend'); // Programmatic outgoing scrolling is not reader input.
transition.run(); transition.flushFrames();
assert.equal(transition.window.location.hash, '#sp3-2s2p', 'destination fragment survives the outgoing-page scrollspy');
assert.equal(transition.heading.getBoundingClientRect().top, 96, 'cross-page intended heading is aligned immediately');
assert(transition.links[1].classList.contains('edwinos-toc-link--selected'), 'TOC selection follows the captured destination');
// A destination chapter must win over earlier article matches and nearby
// headings. Matching code words are ordinary body marks, just like prose.
const search = fixture();
search.setUrl('/CHEM/?h=2p#sp3-2s2p');
const earlier = { ...search.heading, id: 'earlier' };
const first = search.bodyMatch(2400), later = search.bodyMatch(2600);
const metadata = search.bodyMatch(1900, 'mark', true);
search.nodes.unshift(earlier, search.bodyMatch(500));
search.nodes.push(metadata, first, later);
search.run(); search.flushFrames();
assert.equal(first.getBoundingClientRect().top, 304, 'first body keyword sits one third below the header');
assert.equal(search.window.location.hash, '#sp3-2s2p', 'keyword positioning preserves the chosen section fragment');
assert(search.heading.getBoundingClientRect().top < 0, 'a distant heading does not displace the requested keyword');
search.advance(700);
first.top += 180;
search.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#earlier' } });
search.flushFrames();
assert.equal(first.getBoundingClientRect().top, 304, 'late math settling adjusts the body match, not the heading');
const savedScroll = search.window.scrollY;
search.dispatch('document:keydown', { type: 'keydown', key: 'x' });
assert.equal(search.window.scrollY, savedScroll, 'ordinary typing does not move article content');
search.dispatch('document:focusin', { type: 'focusin', target: { closest: () => ({}) } });
first.top += 180;
search.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#sp3-2s2p' } });
search.flushFrames(); search.advance(16000);
assert.equal(search.window.scrollY, savedScroll, 'reopening search cancels late article realignment');
assert(search.observers[0].stopped, 'search focus disconnects the article observer');

const delayed = fixture();
delayed.setUrl('/CHEM/?h=2p#sp3-2s2p'); delayed.run(); delayed.advance(700);
assert.equal(delayed.heading.getBoundingClientRect().top, 96, 'title-only result has a bounded heading fallback');
const delayedMark = delayed.bodyMatch(2300); delayedMark.nodeType = 1;
delayed.nodes.push(delayedMark);
delayed.observers[0].callback([{ target: {}, addedNodes: [delayedMark] }]);
assert.equal(delayedMark.getBoundingClientRect().top, 304, 'a delayed highlight manifest selects its first body mark');
delayed.dispatch('window:wheel', { type: 'wheel' });
const readerScroll = delayed.window.scrollY = 1700;
delayed.observers[0].callback([{ target: {}, addedNodes: [delayedMark] }]);
delayed.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#sp3-2s2p' } });
delayed.flushFrames();
assert.equal(delayed.window.scrollY, readerScroll, 'reader motion wins over delayed manifest and math completion');

const boundary = fixture();
boundary.setUrl('/CHEM/?h=2p#sp3-2s2p');
boundary.nodes.push({ ...boundary.heading, id: 'subheading' }, boundary.bodyMatch(2500));
boundary.run(); boundary.advance(700);
assert.equal(boundary.heading.getBoundingClientRect().top, 96, 'the next heading at any level ends the indexed section');

const nested = fixture();
nested.setUrl('/CHEM/?h=2p#sp3-2s2p');
const nestedContainer = { contains: node => node.kind === 'nested' };
nested.nodes.push({ ...nested.heading, id: 'nested-heading', parentElement: nestedContainer });
const restoredMark = nested.bodyMatch(2400); nested.nodes.push(restoredMark);
nested.run(); nested.flushFrames();
assert.equal(restoredMark.getBoundingClientRect().top, 304, 'closing a nested heading container restores its outer indexed section');

const preface = fixture();
preface.setUrl('/CHEM/?h=2p');
const prefaceMark = preface.bodyMatch(1200);
preface.nodes.unshift(prefaceMark);
preface.run(); preface.flushFrames();
assert.equal(prefaceMark.getBoundingClientRect().top, 304, 'a page-level result targets its indexed preface');
const pageTitle = fixture();
pageTitle.setUrl('/CHEM/?h=2p');
pageTitle.heading.tagName = 'H1';
const titleBody = pageTitle.bodyMatch(2400); pageTitle.nodes.push(titleBody);
pageTitle.run(); pageTitle.flushFrames();
assert.equal(titleBody.getBoundingClientRect().top, 304, 'first H1 section is the page-level indexed body');

const bottom = fixture({ scrollHeight: 3000 });
bottom.setUrl('/CHEM/?h=2p#sp3-2s2p');
const bottomMark = bottom.bodyMatch(2800); bottom.nodes.push(bottomMark);
bottom.run(); bottom.flushFrames();
assert.equal(bottom.window.scrollY, 2200, 'keywords near the page bottom respect its natural scroll limit');

const math = fixture();
math.setUrl('/CHEM/?h=2p#sp3-2s2p');
const formula = math.bodyMatch(2500, 'formula'); math.nodes.push(formula);
math.run(); math.flushFrames();
assert.equal(formula.getBoundingClientRect().top, 304, 'formula-only searches position the complete expression');
math.advance(15001);
assert(math.observers[0].stopped, 'article observation has a finite lifetime');
const afterExpiry = math.window.scrollY;
formula.top += 300;
math.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#sp3-2s2p' } });
math.flushFrames();
assert.equal(math.window.scrollY, afterExpiry, 'expired hand-off cannot pin the article indefinitely');
// Material's substring marks must not change the worker's word semantics.
const wordBounds = fixture();
wordBounds.setUrl('/CHEM/?h=jing#sp3-2s2p');
const substring = wordBounds.bodyMatch(2100), realWord = wordBounds.bodyMatch(2400);
substring.textContent = realWord.textContent = 'Jing';
substring.block = realWord.block = { textContent: 'Beijing Jing' };
substring.prefix = 'Bei'; realWord.prefix = 'Beijing ';
wordBounds.nodes.push(substring, realWord);
wordBounds.run(); wordBounds.flushFrames();
assert.equal(realWord.getBoundingClientRect().top, 304, 'Jing substring inside Beijing cannot displace the first complete word');

const syntaxBounds = fixture();
syntaxBounds.setUrl('/CHEM/?h=jing#sp3-2s2p');
const identifier = syntaxBounds.bodyMatch(2100), codeWord = syntaxBounds.bodyMatch(2450);
identifier.textContent = codeWord.textContent = 'jing';
identifier.block = codeWord.block = { textContent: 'edwin_jing SPIRAL-Jing/file' };
identifier.prefix = 'edwin_'; codeWord.prefix = 'edwin_jing SPIRAL-';
syntaxBounds.nodes.push(identifier, codeWord);
syntaxBounds.run(); syntaxBounds.flushFrames();
assert.equal(codeWord.getBoundingClientRect().top, 304, 'word boundaries cross code syntax spans and retain hyphen/slash delimiters');

const compatibility = fixture();
compatibility.setUrl('/CHEM/?h=ffi#sp3-2s2p');
const embeddedLigature = compatibility.bodyMatch(2100), wholeLigature = compatibility.bodyMatch(2500);
embeddedLigature.textContent = wholeLigature.textContent = 'ﬃ';
embeddedLigature.block = wholeLigature.block = { textContent: 'xﬃ \u200bﬃ' };
embeddedLigature.prefix = 'x'; wholeLigature.prefix = 'xﬃ \u200b';
compatibility.nodes.push(embeddedLigature, wholeLigature);
compatibility.run(); compatibility.flushFrames();
assert.equal(wholeLigature.getBoundingClientRect().top, 304, 'NFKC expansions and zero-width boundaries preserve accepted word offsets');

const chinese = fixture();
chinese.setUrl('/CHEM/?h=' + encodeURIComponent('学习') + '#sp3-2s2p');
const chineseWord = chinese.bodyMatch(2500);
chineseWord.textContent = '学习'; chineseWord.block = { textContent: '机器学习基础' }; chineseWord.prefix = '机器';
chinese.nodes.push(chineseWord); chinese.run(); chinese.flushFrames();
assert.equal(chineseWord.getBoundingClientRect().top, 304, 'Han keywords continue to match inside continuous Chinese text');

const mathBounds = fixture();
mathBounds.setUrl('/CHEM/?h=jing#sp3-2s2p');
const falseFormula = mathBounds.bodyMatch(2200, 'formula'), trueBody = mathBounds.bodyMatch(2500);
falseFormula.textContent = '\\(\\text{Beijing}\\)'; trueBody.textContent = 'Jing';
mathBounds.nodes.push(falseFormula, trueBody); mathBounds.run(); mathBounds.flushFrames();
assert.equal(trueBody.getBoundingClientRect().top, 304, 'formula source substring matching obeys the same accepted word semantics');
const collapsed = fixture();
collapsed.setUrl('/CHEM/?h=2p#sp3-2s2p');
const outerDetails = { open: false, children: [] }, innerDetails = { open: false, children: [],
  parentElement: { closest: () => outerDetails.open ? null : outerDetails } }, unrelatedDetails = { open: false };
const hiddenFirst = collapsed.bodyMatch(2400), visibleLater = collapsed.bodyMatch(2700);
const originalClosest = hiddenFirst.closest;
hiddenFirst.closest = selector => selector === 'details:not([open])'
  ? !innerDetails.open ? innerDetails : !outerDetails.open ? outerDetails : null
  : originalClosest(selector);
hiddenFirst.getClientRects = () => [{}]; // Chromium can report rects while disclosure content is not painted.
collapsed.nodes.push(hiddenFirst, visibleLater); collapsed.run(); collapsed.flushFrames();
assert(innerDetails.open && outerDetails.open, 'only closed details ancestors of the first valid keyword are revealed');
assert.equal(hiddenFirst.getBoundingClientRect().top, 304, 'a first hidden keyword wins over later visible matches');
assert.equal(unrelatedDetails.open, false, 'unrelated details retain their collapsed state');

const collapsedFormula = fixture();
collapsedFormula.setUrl('/CHEM/?h=2p#sp3-2s2p');
const formulaDetails = { open: false, children: [] }, hiddenFormula = collapsedFormula.bodyMatch(2450, 'formula');
hiddenFormula.closest = selector => selector === 'details:not([open])' && !formulaDetails.open ? formulaDetails : null;
hiddenFormula.getClientRects = () => formulaDetails.open ? [{}] : [];
collapsedFormula.nodes.push(hiddenFormula); collapsedFormula.run(); collapsedFormula.flushFrames();
assert(formulaDetails.open, 'collapsed formula results reveal their own native details');
assert.equal(hiddenFormula.getBoundingClientRect().top, 304, 'revealed formulas retain whole-expression positioning');
const summaryHit = fixture();
summaryHit.setUrl('/CHEM/?h=2p#sp3-2s2p');
const summaryMark = summaryHit.bodyMatch(2450);
const enclosingDetails = { open: false, children: [] };
const summaryDetails = { open: false, children: [{ tagName: 'SUMMARY', contains: node => node === summaryMark }],
  parentElement: { closest: () => enclosingDetails.open ? null : enclosingDetails } };
summaryMark.closest = selector => selector === 'details:not([open])' && !summaryDetails.open ? summaryDetails : null;
summaryHit.nodes.push(summaryMark); summaryHit.run(); summaryHit.flushFrames();
assert.equal(summaryDetails.open, false, 'a direct summary hit preserves its own collapsed disclosure');
assert.equal(enclosingDetails.open, true, 'a summary hit reveals any outer disclosure hiding that summary');
assert.equal(summaryMark.getBoundingClientRect().top, 304, 'the revealed summary keyword keeps the search landing position');
console.log('Fragment navigation regression passed.');
