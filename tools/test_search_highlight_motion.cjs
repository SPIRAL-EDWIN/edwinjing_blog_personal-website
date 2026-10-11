#!/usr/bin/env node
'use strict';
// Exercise the real article highlight lifetime owner with a deterministic clock.
// Native browser QA remains responsible for the translucent orange fill's appearance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const start = source.indexOf('  function setupArticleSearchHighlightMotion()');
const end = source.indexOf('  function runAll()', start);
assert(start >= 0 && end > start, 'exercise the production owner, not a mirrored implementation');
const owner = 'var articleSearchHighlightMotion = null;\n' + source.slice(start, end);

class Node {
  constructor(tag, attributes = {}) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.dataset = {};
    this.childNodes = [];
    this.parentElement = null;
    this.isConnected = true;
    this.visibility = 'visible';
    this.rect = { left: 80, right: 150, top: 120, bottom: 144, width: 70, height: 24 };
  }
  get children() { return this.childNodes; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.remove();
      node.parentElement = this;
      node.connect(this.isConnected);
      this.childNodes.push(node);
    }
    return this;
  }
  connect(value) { this.isConnected = value; this.childNodes.forEach(node => node.connect(value)); }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.childNodes;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
    this.connect(false);
  }
  contains(node) { return this === node || this.childNodes.some(child => child.contains(node)); }
  matches(selector) {
    if (selector === 'mark[data-md-highlight]') return this.tagName === 'MARK' && Object.hasOwn(this.attributes, 'data-md-highlight');
    if (selector === '[data-search-exclude]') return Object.hasOwn(this.attributes, 'data-search-exclude');
    if (selector === 'details:not([open])') return this.tagName === 'DETAILS' && !Object.hasOwn(this.attributes, 'open');
    assert.fail('unexpected selector: ' + selector);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.childNodes) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  getClientRects() { return [this.rect]; }
  getBoundingClientRect() { return this.rect; }
}
const match = () => new Node('mark', { 'data-md-highlight': '' });
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type) { for (const callback of this.listeners.get(type) || []) callback({ type }); }
  get listenerCount() { return [...this.listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0); }
}
function harness(root = new Node('article'), withIntersection = true) {
  const mutations = [], intersections = [], timers = new Map(), frames = new Map();
  let now = 0, next = 0;
  const toggle = { checked: false };
  const header = new Node('header');
  header.rect.bottom = 70;
  const document = new Events();
  document.root = root;
  document.hidden = false;
  document.querySelector = selector => {
    if (selector === '.md-content__inner') return document.root;
    if (selector === '#__search') return toggle;
    if (selector === '.md-header') return header;
    assert.fail('unexpected document selector: ' + selector);
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnects = 0; mutations.push(this); }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() { this.targets = []; this.disconnects++; }
    deliver(addedNodes = [], removedNodes = []) { this.callback([{ addedNodes, removedNodes }]); }
  }
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.observeCalls = 0; this.disconnects = 0; intersections.push(this); }
    observe(target) { this.targets.add(target); this.observeCalls++; }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); this.disconnects++; }
    deliver(target, isIntersecting = true) { this.callback([{ target, isIntersecting }]); }
  }
  const window = new Events();
  Object.assign(window, {
    innerHeight: 720, innerWidth: 1280, visualViewport: { height: 680 },
    getComputedStyle: node => ({ visibility: node.visibility }), MutationObserver,
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++next; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  if (withIntersection) window.IntersectionObserver = IntersectionObserver;
  const context = vm.createContext({ document, window });
  vm.runInContext(owner, context);
  function flush() {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(now));
  }
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].callback();
    }
    now = until;
  }
  return { document, window, toggle, header, mutations, intersections, timers, frames,
    setup() { vm.runInContext('setupArticleSearchHighlightMotion()', context); },
    flush, advance,
    intersect(node, intersects = true) { intersections.at(-1).deliver(node, intersects); flush(); },
    mutate(added = [], removed = []) { mutations.at(-1).deliver(added, removed); flush(); }
  };
}
const status = node => node.dataset.edwinosSearchHighlight;

// Exact timing starts at the first visible intersection, including delayed marks.
{
  const visible = match(), below = match();
  below.rect = { ...below.rect, top: 800, bottom: 824 };
  const h = harness(new Node('article').append(visible, below));
  h.setup();
  assert.equal(status(visible), undefined, 'registration alone must not start a lifetime');
  h.advance(12000);
  h.intersect(below, false);
  assert.equal(status(below), undefined, 'offscreen matches never expire early');
  h.intersect(visible);
  assert.equal(status(visible), 'visible');
  h.advance(1999); assert.equal(status(visible), 'visible');
  h.advance(1); assert.equal(status(visible), 'fading', 'hold is exactly 2 seconds');
  h.advance(1499); assert.equal(status(visible), 'fading');
  h.advance(1); assert.equal(status(visible), 'done', 'fade is exactly 1.5 seconds');
  below.rect.top = 200; below.rect.bottom = 224;
  h.intersect(below);
  assert.equal(status(below), 'visible', 'a later section receives its own full lifetime');
  const delayed = match();
  h.document.root.append(delayed); h.mutate([delayed]);
  assert(h.intersections[0].targets.has(delayed));
  h.intersect(delayed); assert.equal(status(delayed), 'visible');
  const observerCount = h.intersections.length;
  h.setup(); assert.equal(h.intersections.length, observerCount, 'same root setup is idempotent');
}

// Author marks and excluded metadata never enter the generated-match owner.
{
  const authored = new Node('mark'), excluded = match(), allowed = match();
  const root = new Node('article').append(authored, new Node('div', { 'data-search-exclude': '' }).append(excluded), allowed);
  const h = harness(root); h.setup();
  assert.deepEqual([...h.intersections[0].targets], [allowed]);
  h.advance(20000);
  assert.equal(status(authored), undefined); assert.equal(status(excluded), undefined);
}

// Closed details hide their body, but their visible summary is still readable.
{
  const summaryMark = match(), bodyMark = match(), nestedMark = match();
  const details = new Node('details').append(new Node('summary').append(summaryMark), bodyMark,
    new Node('details').append(new Node('summary').append(nestedMark)));
  const h = harness(new Node('article').append(details)); h.setup();
  h.intersect(summaryMark); h.intersect(bodyMark); h.intersect(nestedMark);
  assert.equal(status(summaryMark), 'visible');
  assert.equal(status(bodyMark), undefined, 'closed detail body must wait');
  assert.equal(status(nestedMark), undefined, 'inner summary hidden by an outer detail must wait');
  h.advance(10000);
  details.attributes.open = '';
  h.document.emit('toggle'); h.flush();
  assert.equal(status(bodyMark), 'visible'); assert.equal(status(nestedMark), 'visible');
}

// Search overlay, background tabs, sticky header, visibility and visual viewport gate reveal.
for (const scenario of ['search', 'background', 'header', 'viewport', 'hidden', 'horizontal']) {
  const node = match(), h = harness(new Node('article').append(node));
  if (scenario === 'search') h.toggle.checked = true;
  if (scenario === 'background') h.document.hidden = true;
  if (scenario === 'header') node.rect.top = 20, node.rect.bottom = 44;
  if (scenario === 'viewport') node.rect.top = 690, node.rect.bottom = 714;
  if (scenario === 'hidden') node.visibility = 'hidden';
  if (scenario === 'horizontal') node.rect.left = 1400, node.rect.right = 1470;
  h.setup(); h.intersect(node); h.advance(5000);
  assert.equal(status(node), undefined, scenario + ' must not consume the visible lifetime');
  h.toggle.checked = false; h.document.hidden = false; node.visibility = 'visible';
  node.rect = { left: 80, right: 150, top: 120, bottom: 144, width: 70, height: 24 };
  h.document.emit('visibilitychange'); h.document.emit('change'); h.window.emit('scroll'); h.flush();
  assert.equal(status(node), 'visible', scenario + ' resumes when readable');
  assert.equal(h.timers.size, 1, 'coalesced events must not start duplicate timers');
}

// A detached pending mark is released; readding observes it once, and a started mark never restarts.
{
  const node = match(), root = new Node('article').append(node), h = harness(root); h.setup();
  node.remove(); h.mutate([], [node]);
  assert(!h.intersections[0].targets.has(node));
  root.append(node); h.mutate([node]); h.mutate([node]);
  assert.equal(h.intersections[0].observeCalls, 2, 'duplicate mutations do not duplicate observation');
  h.intersect(node); assert.equal(h.timers.size, 1);
  node.remove(); h.mutate([], [node]); root.append(node); h.mutate([node]);
  assert.equal(h.intersections[0].observeCalls, 2, 'visible mark does not restart on reattachment');
  h.advance(3500); assert.equal(status(node), 'done');
}

// A new article owns fresh listeners; stale observer/timer/rAF callbacks cannot mutate it or the old article.
{
  const oldVisible = match(), oldPending = match(), oldRoot = new Node('article').append(oldVisible, oldPending);
  const h = harness(oldRoot); h.setup(); h.intersect(oldVisible);
  h.intersections[0].deliver(oldPending);
  const staleFrame = [...h.frames.values()][0], staleTimer = [...h.timers.values()][0].callback;
  const oldMutation = h.mutations[0], oldIntersection = h.intersections[0];
  const fresh = match(), newRoot = new Node('article').append(fresh);
  h.document.root = newRoot; h.setup();
  assert.equal(oldMutation.disconnects, 1); assert.equal(oldIntersection.disconnects, 1);
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
  assert.equal(h.window.listenerCount, 2); assert.equal(h.document.listenerCount, 3);
  staleTimer(); staleFrame(); oldMutation.deliver([oldPending]); oldIntersection.deliver(oldPending); h.flush();
  assert.equal(status(oldVisible), 'visible'); assert.equal(status(oldPending), undefined);
  assert.equal(status(fresh), undefined); assert.equal(h.timers.size, 0);
  h.intersect(fresh); assert.equal(status(fresh), 'visible');
  h.document.root = null; h.setup();
  assert.equal(h.window.listenerCount, 0); assert.equal(h.document.listenerCount, 0);
  assert.equal(h.timers.size, 0);
}

// Without IntersectionObserver, viewport checks still gate the same lifetime.
{
  const node = match(), h = harness(new Node('article').append(node), false);
  node.rect.top = 800; node.rect.bottom = 824;
  h.setup(); h.flush(); h.advance(4000); assert.equal(status(node), undefined);
  node.rect.top = 100; node.rect.bottom = 124;
  h.window.emit('scroll'); h.flush(); assert.equal(status(node), 'visible');
  h.advance(3500); assert.equal(status(node), 'done');
}

// Fade only the search accent, never text opacity, and keep result matches persistent.
const css = fs.readFileSync(path.join(__dirname, '../docs/stylesheets/edwinos.css'), 'utf8');
const articleStyle = css.match(/\.md-content__inner\.md-typeset mark\[data-md-highlight\] \{([^}]+)\}/)?.[1];
assert(articleStyle, 'generated article marks have their own style');
const fillRegistration = css.match(/@property --edwinos-search-match-fill\s*\{([^}]+)\}/)?.[1];
assert(fillRegistration, 'the fill is registered so browsers can interpolate its color');
assert.match(fillRegistration, /syntax:\s*["']<color>["']/);
assert.match(fillRegistration, /initial-value:\s*transparent/);
assert.match(articleStyle, /transition:\s*--edwinos-search-match-fill 1500ms linear(?:,|;)/);
assert.match(articleStyle, /color:\s*inherit/);
assert.match(articleStyle, /font-style:\s*inherit/);
assert.match(articleStyle, /font-weight:\s*inherit/);
assert.match(articleStyle, /padding:\s*0/);
assert(!/\bopacity\s*:/.test(articleStyle), 'accent fading never dims readable text');
function fullHeightFill(style) {
  const value = style.match(/background:\s*([^;]+);/)?.[1];
  assert(value, 'search matches have a background fill');
  const normalized = value.replace(/\s+/g, ' ').trim();
  assert.equal(normalized, 'var(--edwinos-search-match-fill) !important',
    'the translucent search fill covers the entire inline fragment height');
  assert.match(style, /box-decoration-break:\s*clone/,
    'each wrapped inline fragment retains its own fill');
  return normalized;
}
const articleFill = fullHeightFill(articleStyle);
const fadedStyle = css.match(/mark\[data-md-highlight\]\[data-edwinos-search-highlight="done"\]\s*\{([^}]+)\}/)?.[1];
assert(fadedStyle, 'completed article marks lose only the accent');
assert.match(fadedStyle, /--edwinos-search-match-fill:\s*transparent/);
assert(!/\b(?:opacity|color|background)\s*:/.test(fadedStyle), 'fading must not overwrite the original text or authored background');
const resultStyle = css.match(/\.md-header \.md-search-result \.md-typeset mark \{([^}]+)\}/)?.[1];
assert(resultStyle && /box-shadow:/.test(resultStyle));
assert.equal(fullHeightFill(resultStyle), articleFill, 'result and article matches share the same full-height fill');
assert(!/\b(?:animation|transition|opacity)\s*:/.test(resultStyle), 'result matches persist for result comparison');
console.log('Article search highlight motion: timing, visibility, scope, lifecycle and persistent result style checks passed.');
