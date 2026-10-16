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
  fire(type, values = {}) { for (const handler of [...(this.listeners.get(type) || [])]) handler({type, ...values}); }
  count(type) { return this.listeners.get(type)?.size || 0; }
}
class Node extends Events {
  constructor(key, top = 1000, height = 200) {
    super();
    this.key = key; this.top = top; this.height = height; this.children = [];
    this.isConnected = true; this.reads = 0; this.tokens = new Set();
    this.classList = {
      add: (...tokens) => tokens.forEach(token => this.tokens.add(token)),
      remove: (...tokens) => tokens.forEach(token => this.tokens.delete(token)),
      contains: token => this.tokens.has(token),
      toggle: (token, value) => value ? this.tokens.add(token) : this.tokens.delete(token)
    };
    this.tagName = 'DIV';
    if (key) {
      this.headingOffset = 0; this.headingHeight = 40;
      this.heading = new Node(null); this.heading.tagName = 'H2'; this.heading.tokens.add('section-title');
      this.heading.section = this;
      this.heading.getBoundingClientRect = () => {
        this.heading.reads++;
        return {top: this.top + this.headingOffset, bottom: this.top + this.headingOffset + this.headingHeight};
      };
      this.children.push(this.heading);
    }
  }
  getAttribute(name) { return name === 'data-overview-reveal' ? this.key : null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector) { return selector.split(',').some(value => value.trim() === this.tagName.toLowerCase() || value.trim() === '[contenteditable]' && this.editable) ? this : null; }
  getBoundingClientRect() { this.reads++; return { top: this.top, bottom: this.top + this.height }; }
  querySelectorAll(selector) { return selector === '[data-overview-reveal]' ? this.children.filter(child => child.key) : []; }
  querySelector(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.descendants()]);
    return descendants.find(node => selector.startsWith('.') && node.tokens.has(selector.slice(1))) || null;
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}
function harness(options = {}) {
  const window = new Events(); const document = new Events();
  const root = new Node(null);
  const sections = (options.sectionKeys || ['publications', 'workshop', 'experiences', 'honors']).map((key, i) => new Node(key, 1000 + i * 600));
  const firstScreen = [new Node(null, 100)]; // About Me has no reveal marker.
  const details = new Node(null); details.tokens.add('about-profile-details'); details.open = false;
  firstScreen[0].children.push(details);
  root.children = [...firstScreen, ...sections];
  const ids = new Map(); const motion = new Events(); motion.matches = !!options.reduced;
  const observers = [];
  const timers = new Map(); let nextTimer = 0;
  let now = 0; window.performance = {now: () => now};
  if (!options.oldScroll) window.onscrollend = null;
  window.setTimeout = (callback, delay) => { timers.set(++nextTimer, {callback, delay}); return nextTimer; };
  window.clearTimeout = timer => timers.delete(timer);
  if (!options.noObserver) window.IntersectionObserver = class {
    constructor(callback, config) { this.callback = callback; this.config = config; this.observed = new Set(); this.disconnects = 0; observers.push(this); }
    observe(section) { this.observed.add(section); }
    unobserve(section) { this.observed.delete(section); }
    disconnect() { this.disconnects++; this.observed.clear(); }
    fire(section, intersecting, rect, ratio = intersecting ? 1 : 0) {
      const target = section.heading || section; const parent = target.section;
      const boundary = parent ? {top: parent.top + parent.headingOffset, bottom: parent.top + parent.headingOffset + parent.headingHeight} : {top: target.top, bottom: target.top + target.height};
      this.callback([{ target, isIntersecting: intersecting, intersectionRatio: ratio, boundingClientRect: rect || boundary }]);
    }
    fireBody(section, intersecting, rect, ratio = intersecting ? 0.5 : 0) {
      this.callback([{target: section, isIntersecting: intersecting, intersectionRatio: ratio,
        boundingClientRect: rect || {top: section.top, bottom: section.top + section.height}}]);
    }
    fireBatch(entries) { this.callback(entries); }
  };
  window.matchMedia = () => motion;
  window.innerHeight = 800; window.location = { hash: '' };
  window.scrollY = options.scrollY || 0;
  document.body = new Node(null); document.body.tokens.add('is-homepage');
  document.querySelector = () => document.body.tokens.has('is-homepage') ? document.currentRoot : null;
  document.currentRoot = root; document.documentElement = {clientHeight: 800};
  document.readyState = options.readyState || 'interactive';
  document.getElementById = id => ids.get(id) || null;
  const context = vm.createContext({ window, document, Set });
  vm.runInContext(`var overviewRevealRuntime = null, overviewRevealedSections = new Set();\n${owner}`, context);
  return { context, window, document, root, sections, firstScreen, details, motion, observers, ids, timers,
    advance: ms => { now += ms; },
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(timer => timer.callback()); },
    start: () => context.setupOverviewReveal(),
    seen: key => context.overviewRevealedSections.has(key) };
}
const pending = node => node.tokens.has('is-overview-reveal-pending');
const animated = node => node.tokens.has('is-overview-reveal-visible');
const geometryReads = h => h.sections.reduce((sum, node) => sum + node.reads + (node.heading?.reads || 0), 0);
const allSectionKeys = ['news', 'education', 'publications', 'workshop', 'experiences', 'honors'];
const traverse = (h, top = h.window.scrollY + 1) => {
  h.window.fire('wheel'); h.window.scrollY = top; h.window.fire('scroll');
};

{
  const h = harness({sectionKeys: allSectionKeys, scrollY: 64, readyState: 'complete'});
  h.window.innerHeight = 773; h.sections[0].top = 400; h.start();
  assert(h.seen('news'), 'the early nonzero restored position lands directly');
  h.window.scrollY = 1904; const workshop = h.sections[3]; workshop.top = -90; workshop.height = 1400;
  h.sections[5].top = 749.58; h.sections[5].headingHeight = 40.84;
  const observers = h.observers.length; h.observers[0].fireBody(workshop, true);
  assert(!pending(workshop) && !animated(workshop) && h.seen('workshop'), 'late native restoration into a body exposes it directly even though its short title skipped the whole root');
  assert(!pending(h.sections[5]) && !animated(h.sections[5]) && h.seen('honors'), 'the bounded restoration correction also exposes a partial title at the viewport bottom without animating');
  assert.equal(h.observers.length, observers, 'body recovery shares the existing observer');
  assert(!h.observers[0].observed.has(workshop) && !h.observers[0].observed.has(workshop.heading), 'a restored section releases both observed targets');
}
for (const bodyFirst of [true, false]) {
  const h = harness({sectionKeys: allSectionKeys, readyState: 'complete'}); h.start(); h.window.scrollY = 1904;
  const workshop = h.sections[3], honors = h.sections[5]; workshop.top = -90; workshop.height = 1400; honors.top = 400;
  const body = {target: workshop, isIntersecting: true, intersectionRatio: 0.4, boundingClientRect: {top: -90, bottom: 1310}};
  const heading = {target: honors.heading, isIntersecting: true, intersectionRatio: 1, boundingClientRect: {top: 400, bottom: 440}};
  h.observers[0].fireBatch(bodyFirst ? [body, heading] : [heading, body]);
  assert(!pending(workshop) && !animated(workshop) && !pending(honors) && !animated(honors), `restored body recovery precedes heading animation regardless of callback record order (${bodyFirst})`);
}
{
  const h = harness({sectionKeys: allSectionKeys, readyState: 'complete'}); h.start(); h.window.scrollY = 1904;
  const workshop = h.sections[3], honors = h.sections[5]; workshop.top = -90; workshop.height = 1400; honors.top = 400;
  h.observers[0].fire(honors, true); assert(animated(honors) && !h.seen('honors'));
  h.observers[0].fireBody(workshop, true);
  assert(!animated(honors) && h.seen('honors') && !pending(workshop), 'a body record in the next batch settles an earlier automatic heading entrance into its final restored position');
}
{
  const h = harness({readyState: 'complete'}); h.start(); h.sections[0].top = 417;
  h.observers[0].fireBody(h.sections[0], true);
  assert(pending(h.sections[0]) && !h.seen('publications'), 'ordinary bottom entry of a section body cannot consume the full-heading entrance');
  h.document.fire('focusin', {target: h.details}); h.window.scrollY = 330.5;
  h.details.open = true; h.details.fire('toggle');
  h.sections[0].top = -10; h.sections[0].height = 1000; h.observers.at(-1).fireBody(h.sections[0], true);
  assert(!pending(h.sections[0]) && !animated(h.sections[0]) && !h.seen('publications'), 'actual disclosure-associated body positioning stays provisional rather than pretending to be native restoration');
  h.details.open = true; h.sections[0].top = 1800; h.details.fire('toggle');
  assert(pending(h.sections[0]) && !h.seen('publications'), 'a disclosure can still re-arm that automatically positioned body');
}
for (const focus of ['generic', 'summary']) {
  const h = harness({sectionKeys: allSectionKeys, scrollY: 64, readyState: 'complete'});
  h.window.innerHeight = 773; h.start();
  h.document.fire('focusin', {target: focus === 'summary' ? h.details : new Node(null)});
  h.window.scrollY = 1904; h.sections[3].top = -90; h.sections[3].height = 1400;
  h.sections[5].top = 749.58; h.sections[5].headingHeight = 40.84;
  h.observers[0].fireBody(h.sections[3], true);
  assert(!pending(h.sections[3]) && !animated(h.sections[3]) && !pending(h.sections[5]) && !animated(h.sections[5]), `${focus} focus restoration cannot block the bounded native viewport correction`);
}
{
  const h = harness({sectionKeys: allSectionKeys, scrollY: 64, readyState: 'complete'}); h.start();
  h.document.fire('focusin', {target: h.details}); h.window.scrollY = 1904;
  h.sections[5].top = 400; h.observers[0].fire(h.sections[5], true);
  assert(animated(h.sections[5]) && !h.seen('honors'), 'late automatic entry remains provisional even when the early restored position was nonzero');
  h.sections[3].top = -90; h.sections[3].height = 1400; h.observers[0].fireBody(h.sections[3], true);
  assert(!animated(h.sections[5]) && h.seen('honors'), 'a later body record settles the earlier nonzero-position automatic entrance directly');
}
{
  const h = harness({sectionKeys: allSectionKeys, scrollY: 64, readyState: 'complete'}); h.start();
  h.window.scrollY = 1904; h.sections[3].top = -90; h.sections[3].height = 1400;
  h.observers[0].fireBody(h.sections[3], true);
  const next = h.sections[4]; assert(pending(next));
  traverse(h, 1980); next.top = 400; h.observers[0].fire(next, true);
  assert(h.seen('experiences') && animated(next), 'real wheel displacement after a nonzero restored boot immediately confirms the next heading entrance');
  h.details.open = true; next.top = 1800; h.details.fire('toggle');
  assert(!pending(next) && h.seen('experiences'), 'a disclosure cannot re-arm that genuine post-restoration reading before its transition ends');
}

{
  const h = harness({sectionKeys: allSectionKeys, readyState: 'complete'}); h.window.innerHeight = 773;
  h.sections[0].top = 749.58; h.sections[0].headingHeight = 40.84; h.start();
  const firstObserver = h.observers[0];
  h.window.scrollY = 330.5; h.sections[0].top = 419.08; h.window.fire('scroll');
  firstObserver.fire(h.sections[0], true);
  assert(animated(h.sections[0]) && !h.seen('news'), 'automatic summary positioning may begin an entrance but cannot immediately mark it read');
  h.document.fire('focusin', {target: h.details}); h.details.open = true; h.sections[0].top = 1881.6; h.details.fire('toggle');
  assert(pending(h.sections[0]) && !animated(h.sections[0]) && !h.seen('news'), 'immediate Details expansion re-arms the uncompleted automatic entrance and removes its visible override');
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'opacity', timeStamp: 800});
  firstObserver.fire(h.sections[0], true);
  assert(pending(h.sections[0]) && !h.seen('news'), 'superseded transition/observer deliveries cannot consume the disclosure entrance');
  traverse(h, 800); h.observers.at(-1).fire(h.sections[0], true);
  assert(animated(h.sections[0]) && h.seen('news'), 'genuine subsequent scrolling completes the first News reveal permanently');
  h.details.open = false; h.details.fire('toggle'); h.details.open = true; h.details.fire('toggle');
  assert(!pending(h.sections[0]) && h.seen('news'), 'later toggles cannot reset a genuine completed reveal');
}
{
  const h = harness(); h.start(); h.observers[0].fire(h.sections[0], true);
  assert(!h.seen('publications'));
  h.root.fire('transitionend', {target: h.details, propertyName: 'opacity', timeStamp: 800});
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'width', timeStamp: 800});
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'opacity', pseudoElement: '::before', timeStamp: 800});
  assert(!h.seen('publications'), 'nested disclosure, unrelated properties and pseudo-element transitions cannot confirm a section');
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'opacity', timeStamp: 800});
  assert(h.seen('publications'), 'completion of the actual automatic entrance confirms it permanently');
  h.details.open = true; h.sections[0].top = 2000; h.details.fire('toggle');
  assert(!pending(h.sections[0]), 'an automatic entrance that finished is not replayed by a later disclosure');
}
{
  const h = harness(); h.start();
  h.sections.forEach(section => h.observers[0].fire(section, true));
  assert(h.sections.every(node => animated(node) && !h.seen(node.key)), 'sequential automatic entries do not consume one another before their transitions finish');
  assert(h.context.overviewRevealRuntime, 'automatic entrances retain their completion lifecycle when no pending targets remain');
  h.sections.forEach(section => h.root.fire('transitionend', {target: section, propertyName: 'transform', timeStamp: 800}));
  assert(h.sections.every(node => h.seen(node.key))); assert.equal(h.context.overviewRevealRuntime, null);
  assert.equal(h.root.count('transitionend'), 0); assert.equal(h.observers[0].disconnects, 1);
}
{
  const h = harness(); h.start(); h.observers[0].fire(h.sections[0], true);
  h.advance(1000); h.details.open = true; h.sections[0].top = 2000; h.details.fire('toggle');
  h.sections[0].top = 400; h.observers.at(-1).fire(h.sections[0], true);
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'opacity', timeStamp: 800});
  assert(!h.seen('publications'), 'an old queued transition end predating the new entrance cannot complete its replacement');
  h.root.fire('transitionend', {target: h.sections[0], propertyName: 'opacity', timeStamp: 1800});
  assert(h.seen('publications'));
}
{
  const h = harness(); h.start(); h.observers[0].fire(h.sections[0], true);
  h.motion.matches = true; h.motion.fire('change');
  assert(h.sections.every(node => h.seen(node.key)), 'reduced motion immediately settles automatic and pending entrances');
  assert.equal(h.root.count('transitionend'), 0);
}

{
  const h = harness({sectionKeys: allSectionKeys}); h.window.innerHeight = 773;
  h.sections[0].top = 749.58; h.sections[0].headingHeight = 40.84; h.start();
  assert(pending(h.sections[0]) && !h.seen('news'), 'a half-visible News title in the 433x773 viewport remains unread and pending');
  assert(h.observers[0].observed.has(h.sections[0].heading), 'the observer targets the direct section heading');
  h.observers[0].fire(h.sections[0], true, {top: 765.58, bottom: 806.42}, 0.18);
  assert(pending(h.sections[0]) && !h.seen('news'), 'isIntersecting alone cannot consume a partially clipped title with its pending offset');
  h.observers[0].fire(h.sections[0], true, {top: 720, bottom: 760.84}, 0.99);
  assert(pending(h.sections[0]), 'nearly complete heading intersections still wait for threshold one');
  traverse(h); h.observers[0].fire(h.sections[0], true, {top: 680, bottom: 720.84}, 1);
  assert(animated(h.sections[0]) && h.seen('news'), 'the first complete title entrance releases the whole column');
}
{
  const h = harness(); h.window.innerHeight = 773; h.sections[0].top = 690;
  h.sections[0].headingOffset = 50; h.sections[0].headingHeight = 73; h.start();
  assert(pending(h.sections[0]), 'initial visibility uses the complete multiline heading, rather than the section top');
  h.observers[0].fire(h.sections[0], true, {top: 700, bottom: 773}, 0.6);
  assert(pending(h.sections[0]), 'a tall wrapped heading waits until its entire height fits within the IO margin');
  h.observers[0].fire(h.sections[0], true, {top: 650, bottom: 723}, 1); assert(animated(h.sections[0]));
}
{
  const h = harness({sectionKeys: allSectionKeys, readyState: 'complete'});
  h.sections[0].top = 300; h.sections[1].top = 500; h.start();
  h.document.fire('focusin', {target: h.details});
  const reads = geometryReads(h); h.window.scrollY = 330.5; h.window.fire('scroll');
  assert(!h.seen('news') && !h.seen('education'), 'summary focus/automatic anchoring displacement does not commit initial content');
  assert.equal(geometryReads(h), reads, 'an unintentional scroll still performs no layout reads');
  h.sections[0].top = 1881.6; h.sections[1].top = 2100; h.details.open = true; h.details.fire('toggle');
  assert(pending(h.sections[0]) && pending(h.sections[1]), 'automatic summary movement cannot prevent the disclosure from re-arming unread content');
  h.sections[0].top = 300; h.sections[1].top = 500; h.details.open = false; h.details.fire('toggle');
  assert(!pending(h.sections[0]) && !h.seen('news'), 'closing after anchoring restores the provisional initial view without requiring scrollY zero');
}
for (const tag of ['SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) {
  const h = harness({readyState: 'complete'}); h.sections[0].top = 300; h.start();
  const control = new Node(null); control.tagName = tag;
  h.window.fire('keydown', {key: ' ', target: control}); h.window.scrollY = 100; h.window.fire('scroll');
  assert(!h.seen('publications'), `Space on ${tag} does not count as page reading`);
}
{
  const h = harness({readyState: 'complete'}); h.sections[0].top = 300; h.start();
  const summary = new Node(null); summary.tagName = 'SUMMARY';
  h.window.fire('wheel'); h.window.fire('keydown', {key: ' ', target: summary});
  h.window.scrollY = 100; h.window.fire('scroll');
  assert(!h.seen('publications'), 'summary Space also clears a stale prior wheel intent before automatic movement');
}
for (const tag of ['A', 'SUMMARY']) {
  const h = harness({readyState: 'complete'}); h.sections[0].top = 300; h.start();
  const control = new Node(null); control.tagName = tag;
  h.window.fire('keydown', {key: 'PageDown', target: control});
  assert(!h.seen('publications'), 'navigation intent alone does not commit content without displacement');
  h.window.scrollY = 50; h.window.fire('scroll');
  assert(h.seen('publications'), `PageDown with focus on ${tag} and actual movement counts as reading`);
}
{
  const h = harness({readyState: 'complete'}); h.sections[0].top = 300; h.start();
  h.window.scrollY = 900; h.window.fire('scroll'); assert(!h.seen('publications'));
  h.sections[0].top = -500; h.window.fire('scrollend');
  assert(h.seen('publications'), 'scrollbar dragging commits a provisional column only after the complete column has passed the viewport');
}

{
  const h = harness({ sectionKeys: allSectionKeys });
  h.sections.slice(0, 3).forEach((node, index) => { node.top = 300 + index * 200; });
  h.start(); const oldObserver = h.observers[0];
  assert(h.sections.slice(0, 3).every(node => !pending(node) && !h.seen(node.key)));
  h.sections.slice(0, 3).forEach((node, index) => { node.top = 1200 + index * 200; });
  h.details.open = true; h.details.fire('toggle');
  assert(h.sections.every(pending), 'expanding Detailed Profile re-arms every previously visible unread column pushed offscreen');
  assert.equal(oldObserver.disconnects, 1);
  oldObserver.fire(h.sections[1], true, {top: 500, bottom: 700});
  assert(pending(h.sections[1]) && !h.seen('education'), 'a pre-expansion queued IO entry cannot consume re-armed content');
  h.sections[1].top = 500; h.window.fire('pageshow', {persisted: false});
  assert(pending(h.sections[1]) && !h.seen('education'), 'late pageshow after a toggle cannot steal its entrance');
  traverse(h, 1000); h.observers[1].fire(h.sections[1], true);
  assert(animated(h.sections[1]) && h.seen('education'), 'first traversal animates newly offscreen Education');
  h.details.open = false; h.details.fire('toggle'); h.details.open = true; h.details.fire('toggle');
  assert(!pending(h.sections[1]) && animated(h.sections[1]), 'later profile toggles never re-arm completed Education');
  h.observers[1].fire(h.sections[3], true);
  assert(pending(h.sections[3]), 'every toggle rejects the previous observer generation');
}
{
  const h = harness({ sectionKeys: allSectionKeys });
  h.sections.forEach((node, index) => { node.top = 100 + index * 100; }); h.start();
  assert.equal(h.observers.length, 0, 'no observer is needed while every column is initially visible');
  assert.equal(h.details.count('toggle'), 1, 'empty pending keeps the provisional-details lifecycle alive');
  assert(h.context.overviewRevealRuntime);
  h.sections.forEach((node, index) => { node.top = 1200 + index * 200; });
  h.details.open = true; h.details.fire('toggle');
  assert(h.sections.every(pending), 'even a large viewport can re-arm all six initially visible columns');
  assert.equal(h.observers.length, 1); assert.equal(h.observers[0].observed.size, 12);
}
{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 300; h.sections[1].top = 500; h.start();
  const reads = geometryReads(h);
  h.window.fire('wheel'); h.window.scrollY = 20; h.window.fire('scroll');
  assert(h.seen('news') && h.seen('education'), 'first downward traversal commits initial static sections');
  assert.equal(geometryReads(h), reads, 'first-scroll commitment has no geometry work');
  assert.equal(h.window.count('scroll'), 0); assert.equal(h.window.count('wheel'), 0);
  h.sections[0].top = 1300; h.sections[1].top = 1500; h.details.open = true; h.details.fire('toggle');
  assert(!pending(h.sections[0]) && !pending(h.sections[1]), 'opening the profile after reading does not replay initial content');
}
{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 300; h.sections[1].top = 500; h.start();
  h.document.fire('focusin', {target: h.details});
  h.sections[0].top = 1300; h.sections[1].top = 1500; h.details.open = true; h.details.fire('toggle');
  const openingObserver = h.observers.at(-1);
  h.sections[0].top = 300; h.sections[1].top = 500; h.details.open = false; h.details.fire('toggle');
  assert(!pending(h.sections[0]) && !animated(h.sections[0]) && !h.seen('news'), 'closing before a scroll restores a provisional static preview');
  openingObserver.fire(h.sections[0], true);
  assert(!h.seen('news'), 'queued open-layout intersection cannot complete a now-static preview');
  h.sections[0].top = 1300; h.sections[1].top = 1500; h.details.open = true; h.details.fire('toggle');
  assert(pending(h.sections[0]) && pending(h.sections[1]), 'close then reopen before traversal preserves the first entrance');
}
{
  const h = harness(); h.sections[0].top = 700; h.start();
  h.details.open = true; h.sections[0].top = 780; h.details.fire('toggle');
  assert(pending(h.sections[0]) && !h.seen('publications'), 'a provisional heading clipped by expansion still awaits its first complete entrance');
}
{
  const h = harness(); h.start(); h.window.scrollY = 1800; h.sections[1].top = 200; h.window.fire('scroll');
  h.window.fire('pageshow', {persisted: false});
  assert(!pending(h.sections[1]) && !animated(h.sections[1]) && h.seen('workshop'), 'native restoration scroll before pageshow remains a direct landing');
}
{
  const h = harness(); h.start(); h.window.scrollY = 1800; h.sections[1].top = 200; h.window.fire('scroll');
  h.observers[0].fire(h.sections[1], true);
  assert(!pending(h.sections[1]) && !animated(h.sections[1]), 'IO before native restoration pageshow also lands directly');
}
for (const [type, values] of [['wheel', {}], ['touchmove', {}], ['keydown', {key: 'PageDown'}]]) {
  const h = harness(); h.start(); h.window.fire(type, values); h.window.scrollY = 800; h.window.fire('scroll');
  h.sections[0].top = 300; h.window.fire('pageshow', {persisted: false});
  assert(pending(h.sections[0]), `${type} intent prevents late pageshow from stealing a first scroll entrance`);
  h.observers[0].fire(h.sections[0], true); assert(animated(h.sections[0]));
  assert.equal(h.window.count('wheel'), 0); assert.equal(h.window.count('touchmove'), 0); assert.equal(h.window.count('keydown'), 0);
}
{
  const h = harness(); h.start(); h.window.fire('keydown', {key: 'a'}); h.window.scrollY = 800; h.window.fire('scroll');
  h.sections[0].top = 300; h.window.fire('pageshow', {persisted: false});
  assert(!pending(h.sections[0]) && !animated(h.sections[0]), 'ordinary typing is not a scrolling intent');
}
{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 300; h.start();
  h.document.body.tokens.delete('is-homepage'); h.start();
  assert(h.seen('news'), 'leaving initial static content commits it for instant-navigation returns');
  assert.equal(h.details.count('toggle'), 0); assert.equal(h.window.count('wheel'), 0); assert.equal(h.window.count('scroll'), 0);
}
for (const finish of ['hash', 'focus', 'reduced', 'bfcache']) {
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 300; h.start();
  if (finish === 'hash') {
    h.ids.set('honors', h.sections[5]); h.window.location.hash = '#honors'; h.window.fire('hashchange');
  } else if (finish === 'focus') h.document.fire('focusin', {target: h.sections[5]});
  else if (finish === 'reduced') { h.motion.matches = true; h.motion.fire('change'); }
  else h.window.fire('pageshow', {persisted: true});
  assert(allSectionKeys.every(h.seen), `${finish} completes both pending and initial-static sections`);
  assert.equal(h.details.count('toggle'), 0); assert.equal(h.window.count('wheel'), 0); assert.equal(h.window.count('scroll'), 0);
}
{
  const h = harness({ sectionKeys: allSectionKeys, scrollY: 1800 }); h.sections[0].top = -400; h.sections[1].top = 100; h.start();
  assert(h.seen('news') && h.seen('education'), 'setup at a nonzero restored position commits viewport sections immediately');
  h.sections[0].top = 1300; h.sections[1].top = 1500; h.details.open = true; h.details.fire('toggle');
  assert(!pending(h.sections[0]) && !pending(h.sections[1]), 'restored direct landings are never made provisional by a later toggle');
}

{
  const h = harness({ sectionKeys: allSectionKeys }); h.sections[0].top = 500; h.start();
  assert.equal(h.sections.length, 6);
  assert(!pending(h.sections[0]) && !animated(h.sections[0]), 'visible Recent News remains static on initial display');
  assert(!h.seen('news'), 'initial top-of-page content stays provisional until reading starts');
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
  assert.equal(h.observers[0].observed.size, 12);
  traverse(h);
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
  assert(h.sections.slice(1).every(pending)); assert(!h.seen('publications'));
  assert.equal(h.observers.length, 1); assert.deepEqual(Array.from(h.observers[0].config.threshold), [0, 1]);
  assert.equal(h.observers[0].config.rootMargin, '0px 0px -30px 0px');
  h.start(); assert.equal(h.observers.length, 1, 'duplicate lifecycle turns do not create more observers');
  const readCount = geometryReads(h);
  h.observers[0].fire(h.sections[1], true);
  assert(animated(h.sections[1]) && !pending(h.sections[1]));
  h.observers[0].fire(h.sections[1], true); assert(animated(h.sections[1]));
  assert.equal(geometryReads(h), readCount, 'entry uses IO geometry, not forced layout');
}
{
  const h = harness(); h.sections[0].height = 9000; h.start();
  assert(h.observers[0].observed.has(h.sections[0].heading) && h.observers[0].observed.has(h.sections[0]), 'IO uses the short heading for entrance and the tall body only for passed-heading recovery');
  h.observers[0].fire(h.sections[0], true, {top: 700, bottom: 740});
  assert(animated(h.sections[0]), 'a huge column enters as soon as its short heading is fully visible');
}
{
  const h = harness(); h.start(); traverse(h); h.observers[0].fire(h.sections[3], true);
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
  const h = harness(); h.start(); const reads = geometryReads(h);
  h.sections.forEach(node => { node.top = -500; });
  for (let i = 0; i < 50; i++) h.window.fire('scroll');
  assert.equal(geometryReads(h), reads, 'native scrolling does not measure section geometry per frame');
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
  const h = harness({ oldScroll: true }); h.start(); const reads = geometryReads(h);
  h.sections[0].top = -400;
  for (let i = 0; i < 50; i++) h.window.fire('scroll');
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].delay, 120);
  assert.equal(geometryReads(h), reads, 'old-browser fallback only schedules during scrolling');
  h.flush(); assert(!pending(h.sections[0]) && !animated(h.sections[0]));
  h.sections[1].top = 500; h.window.fire('scroll'); h.flush();
  assert(pending(h.sections[1]), 'old-browser settle fallback also leaves current entries to IO');
  h.observers[0].fire(h.sections[1], true); assert(animated(h.sections[1]));
  h.window.fire('scroll'); assert.equal(h.timers.size, 1);
  h.document.body.tokens.delete('is-homepage'); h.start();
  assert.equal(h.timers.size, 0, 'navigation cancels the last scroll settle timer'); assert.equal(h.window.count('scroll'), 0);
}
{
  const h = harness({scrollY: 1800}); h.sections[0].top = -1000; h.sections[1].top = -200; h.sections[2].top = 200;
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
