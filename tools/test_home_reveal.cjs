#!/usr/bin/env node
'use strict';
// Test the production owner, not a mirrored implementation. Browser QA covers
// CSS transitions, real IntersectionObserver timing and scroll restoration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const owner = source.slice(source.indexOf('  function setupOverviewReveal()'), source.indexOf('  function runAll()'));

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  fire(type, values = {}) { for (const handler of [...(this.listeners.get(type) || [])]) handler(values); }
  count(type) { return this.listeners.get(type)?.size || 0; }
}
class Node {
  constructor(key, top = 1000, height = 200) {
    this.key = key; this.top = top; this.height = height; this.children = [];
    this.isConnected = true; this.reads = 0; this.tokens = new Set();
    this.classList = {
      add: (...tokens) => tokens.forEach(token => this.tokens.add(token)),
      remove: (...tokens) => tokens.forEach(token => this.tokens.delete(token)),
      contains: token => this.tokens.has(token),
      toggle: (token, value) => value ? this.tokens.add(token) : this.tokens.delete(token)
    };
  }
  getAttribute(name) { return name === 'data-overview-reveal' ? this.key : null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { this.reads++; return { top: this.top, bottom: this.top + this.height }; }
  querySelectorAll(selector) { return selector === '[data-overview-reveal]' ? this.children.filter(child => child.key) : []; }
}
function harness(options = {}) {
  const window = new Events(); const document = new Events();
  const root = new Node(null);
  const sections = (options.sectionKeys || ['publications', 'workshop', 'experiences', 'honors']).map((key, i) => new Node(key, 1000 + i * 600));
  const firstScreen = [new Node(null, 100)]; // About Me has no reveal marker.
  root.children = [...firstScreen, ...sections];
  const ids = new Map(); const motion = new Events(); motion.matches = !!options.reduced;
  const observers = [];
  const timers = new Map(); let nextTimer = 0;
  if (!options.oldScroll) window.onscrollend = null;
  window.setTimeout = (callback, delay) => { timers.set(++nextTimer, {callback, delay}); return nextTimer; };
  window.clearTimeout = timer => timers.delete(timer);
  if (!options.noObserver) window.IntersectionObserver = class {
    constructor(callback, config) { this.callback = callback; this.config = config; this.observed = new Set(); this.disconnects = 0; observers.push(this); }
    observe(section) { this.observed.add(section); }
    unobserve(section) { this.observed.delete(section); }
    disconnect() { this.disconnects++; this.observed.clear(); }
    fire(section, intersecting, rect) {
      this.callback([{ target: section, isIntersecting: intersecting, boundingClientRect: rect || { top: section.top, bottom: section.top + section.height } }]);
    }
  };
  window.matchMedia = () => motion;
  window.innerHeight = 800; window.location = { hash: '' };
  document.body = new Node(null); document.body.tokens.add('is-homepage');
  document.querySelector = () => document.body.tokens.has('is-homepage') ? document.currentRoot : null;
  document.currentRoot = root; document.documentElement = {clientHeight: 800};
  document.getElementById = id => ids.get(id) || null;
  const context = vm.createContext({ window, document, Set });
  vm.runInContext(`var overviewRevealRuntime = null, overviewRevealedSections = new Set();\n${owner}`, context);
  return { context, window, document, root, sections, firstScreen, motion, observers, ids, timers,
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(timer => timer.callback()); },
    start: () => context.setupOverviewReveal(),
    seen: key => context.overviewRevealedSections.has(key) };
}
const pending = node => node.tokens.has('is-overview-reveal-pending');
const animated = node => node.tokens.has('is-overview-reveal-visible');
const allSectionKeys = ['news', 'education', 'publications', 'workshop', 'experiences', 'honors'];

{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 500; h.start();
  assert.equal(h.sections.length, 6);
  assert(!pending(h.sections[0]) && !animated(h.sections[0]), 'visible Recent News remains static on initial display');
  assert(h.seen('news'));
  assert(h.sections.slice(1).every(pending), 'all other marked sections below the first viewport await entrance');
  assert(h.firstScreen.every(node => !pending(node) && !animated(node)), 'About Me alone is exempt from entrance');
  h.observers[0].fire(h.sections[1], true);
  assert(animated(h.sections[1]) && !pending(h.sections[1]), 'initially offscreen Education floats into view');
  h.observers[0].fire(h.sections[1], true); assert(animated(h.sections[1]), 'Education only enters once');
  assert(!animated(h.sections[0]), 'animating Education does not replay already visible News');
}
{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 900; h.start();
  assert(h.sections.every(pending), 'narrow-screen Recent News below the fold joins the six entrance targets');
  assert.equal(h.observers[0].observed.size, 6);
  h.observers[0].fire(h.sections[0], true);
  assert(animated(h.sections[0]) && !pending(h.sections[0]), 'Recent News animates when first scrolled into a narrow viewport');
  assert(h.sections.slice(1).every(pending));
  h.observers[0].fire(h.sections[5], true);
  assert(h.sections.slice(1, 5).every(node => !pending(node) && !animated(node)), 'six-section rapid skips expose preceding sections directly');
  assert(animated(h.sections[5])); assert.equal(h.observers[0].disconnects, 1);
  assert(allSectionKeys.every(h.seen), 'all six stable keys are retained after first traversal');
}

{
  const h = harness(); h.sections[0].top = 700; h.start();
  assert(!pending(h.sections[0]) && !animated(h.sections[0]), 'already-visible publication is direct, with no entrance');
  assert(h.firstScreen.every(node => !pending(node) && !animated(node)), 'About Me never receives motion');
  assert(h.sections.slice(1).every(pending)); assert(h.seen('publications'));
  assert.equal(h.observers.length, 1); assert.equal(h.observers[0].config.threshold, 0);
  assert.equal(h.observers[0].config.rootMargin, '0px 0px -30px 0px');
  h.start(); assert.equal(h.observers.length, 1, 'duplicate lifecycle turns do not create more observers');
  const readCount = h.sections.reduce((sum, node) => sum + node.reads, 0);
  h.observers[0].fire(h.sections[1], true);
  assert(animated(h.sections[1]) && !pending(h.sections[1]));
  h.observers[0].fire(h.sections[1], true); assert(animated(h.sections[1]));
  assert.equal(h.sections.reduce((sum, node) => sum + node.reads, 0), readCount, 'entry uses IO geometry, not forced layout');
}
{
  const h = harness(); h.sections[0].height = 9000; h.start();
  h.observers[0].fire(h.sections[0], true, {top: 770, bottom: 9770});
  assert(animated(h.sections[0]), 'a huge column enters at threshold zero without waiting for a percentage');
}
{
  const h = harness(); h.start(); h.observers[0].fire(h.sections[3], true);
  assert(h.sections.slice(0, 3).every(node => !pending(node) && !animated(node)), 'rapid skip reveals previous columns directly');
  assert(animated(h.sections[3])); assert.equal(h.observers[0].disconnects, 1);
  assert.equal(h.window.count('hashchange'), 0); assert.equal(h.document.count('focusin'), 0);
  h.observers[0].fire(h.sections[0], true); assert(!animated(h.sections[0]), 'stale observer delivery cannot replay completed work');
}
{
  const h = harness(); h.start(); h.sections[0].top = -400;
  h.observers[0].fire(h.sections[0], false); assert(!pending(h.sections[0]) && !animated(h.sections[0]), 'a passed column is final even without an intersection');
}
{
  const h = harness(); h.start(); const reads = h.sections.reduce((sum, node) => sum + node.reads, 0);
  h.sections.forEach(node => { node.top = -500; });
  for (let i = 0; i < 50; i++) h.window.fire('scroll');
  assert.equal(h.sections.reduce((sum, node) => sum + node.reads, 0), reads, 'native scrolling does not measure section geometry per frame');
  h.window.fire('scrollend');
  assert(h.sections.every(node => !pending(node) && !animated(node)), 'whole-column false-to-false skips are revealed at scroll end');
  assert.equal(h.window.count('scrollend'), 0); assert.equal(h.observers[0].disconnects, 1);
}
{
  const h = harness(); h.start(); h.sections[0].top = 500;
  h.window.fire('scrollend');
  assert(pending(h.sections[0]) && !animated(h.sections[0]), 'scrollend before IO must preserve the current viewport entrance');
  h.observers[0].fire(h.sections[0], true);
  assert(!pending(h.sections[0]) && animated(h.sections[0]), 'the later IO callback still animates the first real entry');
}
{
  const h = harness({ oldScroll: true }); h.start(); const reads = h.sections.reduce((sum, node) => sum + node.reads, 0);
  h.sections[0].top = -400;
  for (let i = 0; i < 50; i++) h.window.fire('scroll');
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].delay, 120);
  assert.equal(h.sections.reduce((sum, node) => sum + node.reads, 0), reads, 'old-browser fallback only schedules during scrolling');
  h.flush(); assert(!pending(h.sections[0]) && !animated(h.sections[0]));
  h.sections[1].top = 500; h.window.fire('scroll'); h.flush();
  assert(pending(h.sections[1]), 'old-browser settle fallback also leaves current entries to IO');
  h.observers[0].fire(h.sections[1], true); assert(animated(h.sections[1]));
  h.window.fire('scroll'); assert.equal(h.timers.size, 1);
  h.document.body.tokens.delete('is-homepage'); h.start();
  assert.equal(h.timers.size, 0, 'navigation cancels the last scroll settle timer'); assert.equal(h.window.count('scroll'), 0);
}
{
  const h = harness(); h.sections[0].top = -1000; h.sections[1].top = -200; h.sections[2].top = 200;
  h.start(); assert(h.sections.slice(0, 3).every(node => !pending(node) && !animated(node)), 'late setup respects restored/visible viewport');
  assert(pending(h.sections[3]));
}
{
  const h = harness(); const anchor = new Node(null); h.sections[2].children.push(anchor);
  h.ids.set('研究经历', anchor); h.window.location.hash = '#%E7%A0%94%E7%A9%B6%E7%BB%8F%E5%8E%86'; h.start();
  assert(h.sections.slice(0, 3).every(node => !pending(node) && !animated(node)), 'initial hash and all earlier columns are direct');
  assert(pending(h.sections[3]));
  h.ids.set('honors', h.sections[3]); h.window.location.hash = '#honors'; h.window.fire('hashchange');
  assert(h.sections.every(node => !pending(node) && !animated(node)));
}
{
  const h = harness(); h.start(); const link = new Node(null); h.sections[1].children.push(link);
  h.document.fire('focusin', { target: link });
  assert(!pending(h.sections[0]) && !pending(h.sections[1])); assert(!animated(h.sections[1])); assert(pending(h.sections[2]));
}
{
  const h = harness(); h.start(); h.window.fire('pageshow', { persisted: true });
  assert(h.sections.every(node => !pending(node) && !animated(node)), 'BFCache restoration clears pending motion');
  assert.equal(h.observers[0].disconnects, 1);
}
{
  const h = harness(); h.start(); h.sections[1].top = 200; h.window.fire('pageshow', {persisted: false});
  assert(!pending(h.sections[1]) && !animated(h.sections[1]), 'native initial scroll restoration is not animated');
}
for (const options of [{ noObserver: true }, { reduced: true }]) {
  const h = harness(options); h.start(); assert(h.sections.every(node => !pending(node) && !animated(node)));
  assert.equal(h.observers.length, 0); assert.equal(h.window.count('hashchange'), 0);
}
{
  const h = harness(); h.start(); h.motion.matches = true; h.motion.fire('change');
  assert(h.sections.every(node => !pending(node) && !animated(node)));
  assert.equal(h.observers[0].disconnects, 1); assert.equal(h.motion.count('change'), 0);
}
{
  const h = harness(); h.start(); h.observers[0].fire(h.sections[0], true);
  h.document.body.tokens.delete('is-homepage'); h.start();
  assert.equal(h.observers[0].disconnects, 1); assert(h.sections.every(node => !pending(node)));
  assert.equal(h.window.count('pageshow'), 0); assert.equal(h.document.count('focusin'), 0);
  const nextRoot = new Node(null); const nextSections = h.sections.map((node, i) => new Node(node.key, 1000 + i * 600));
  nextRoot.children = nextSections; h.document.currentRoot = nextRoot; h.document.body.tokens.add('is-homepage'); h.start();
  assert(!pending(nextSections[0]) && !animated(nextSections[0]), 'seen stable keys survive instant navigation');
  assert(nextSections.slice(1).every(pending), 'unread columns retain a first entrance after returning');
  h.observers[0].fire(h.sections[3], true); assert(pending(nextSections[3]), 'stale outgoing observer cannot touch incoming content');
}
assert(!owner.includes('localStorage') && !owner.includes('sessionStorage'), 'no second persistence store');
assert(!owner.includes('requestAnimationFrame'), 'no scroll-frame animation or geometry loop');
assert(!owner.includes('setAttribute("src"') && !owner.includes('loading'), 'section motion does not gate asset loading');
console.log('Homepage reveal lifecycle tests passed.');
