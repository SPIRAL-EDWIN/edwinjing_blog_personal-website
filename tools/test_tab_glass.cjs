#!/usr/bin/env node
'use strict';
// Execute the actual template geometry owner and actual runtime lifecycle.
// Deterministic DOM geometry verifies arrival, reveal, interruption and cleanup.
// This VM cannot prove compositor sampling, SVG optics or Material event ordering;
// those require Edge/Safari browser measurements and visual inspection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const template = fs.readFileSync(path.join(__dirname, '../overrides/partials/header.html'), 'utf8');
const bootstrap = template.match(/<script>([\s\S]*?)<\/script>/)[1];
const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const owner = source.slice(source.indexOf('  function setupTabGlass()'), source.indexOf('  function setupNavigationFeedbackGlass('));
const rect = (left, top, width, height) => ({left, top, width, height, right: left + width, bottom: top + height});
function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); };
  target.removeEventListener = (type, callback) => listeners.get(type)?.delete(callback);
  target.fire = (type, event) => [...(listeners.get(type) || [])].forEach(callback => callback(event));
  target.listenerCount = type => listeners.get(type)?.size || 0;
  return target;
}
function harness({active = 0, width = 154, left = 52, reducedMotion = false, userAgent = 'Chrome/130.0', labelSupported = true} = {}) {
  let now = 0, serial = 0;
  const frames = new Map(), observers = [], opticalInstances = [];
  const location = {href: 'https://test.local/project/', pathname: '/project/'};
  const reduced = events({matches: reducedMotion});
  const fonts = events({ready: {then(callback) { fonts.readyCallback = callback; }}});
  const body = {neutral: false, classList: {contains: name => name === 'is-home-profile-page' && body.neutral}};
  const track = {style: {}, getBoundingClientRect() { return rect(Number.parseFloat(this.style.left) || 0, Number.parseFloat(this.style.top) || 0, Number.parseFloat(this.style.width) || 0, Number.parseFloat(this.style.height) || 0); }};
  const glass = {style: {}, dataset: {}, hidden: false, getBoundingClientRect() {
    const bounds = track.getBoundingClientRect();
    return rect(bounds.left + (Number.parseFloat(this.style.left) || 0), bounds.top + (Number.parseFloat(this.style.top) || 0), Number.parseFloat(this.style.width) || 0, Number.parseFloat(this.style.height) || 0);
  }};
  const state = {active, width, left, list: {}, rail: null, links: null};
  const root = 'https://test.local/project/';
  function replaceTabs(index, newLeft = state.left) {
    state.active = index; state.left = newLeft;
    state.list = {};
    state.rail = events({scrollLeft: 0, getBoundingClientRect: () => rect(state.left, 0, state.width, 64)});
    const widths = [101, 81, 71]; let offset = 0;
    state.links = ['', 'OsdNotes/', '经验分享/'].map((href, i) => {
      const start = offset; offset += widths[i] + 4;
      return {href: new URL(href, root).href, getBoundingClientRect: () => rect(state.left + start - state.rail.scrollLeft, 12, widths[i], 40)};
    });
  }
  replaceTabs(active);
  const tabs = {getBoundingClientRect: () => rect(state.left, 0, state.width, 64)};
  const header = {dataset: {}, getBoundingClientRect: () => rect(0, 0, 320, 64), querySelector(selector) {
    if (selector === '.edwinos-tab-glass-track') return track;
    if (selector === '.edwinos-tab-glass') return glass;
    if (selector === '.md-tabs .md-grid') return state.rail;
    if (selector === '.md-tabs') return tabs;
    if (selector === '.md-tabs__list') return state.list;
    if (selector.includes('.md-tabs__item--active')) return state.links[state.active] || null;
    throw new Error('Unexpected header selector: ' + selector);
  }, querySelectorAll: selector => { assert.equal(selector, '.md-tabs__link'); return state.links; }};
  const document = {body, fonts, currentScript: {parentElement: header}, querySelector(selector) { assert.equal(selector, '.md-header'); return header; }};
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); this.disconnected = false; observers.push(this); }
    observe(node) { this.observed.add(node); }
    unobserve(node) { this.observed.delete(node); }
    disconnect() { this.observed.clear(); this.disconnected = true; }
    fire() { this.callback(); }
  }
  const window = events({location, navigator: {userAgent}, ResizeObserver, matchMedia: () => reduced, performance: {now: () => now},
    requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame(id) { frames.delete(id); }});
  const context = vm.createContext({window, document, location, URL, ResizeObserver, tabGlassRuntime: null,
    setupLayoutControlGlass(surface, options) {
      const optic = {surface, options, strengths: [], refreshes: 0, destroyed: false, frozen: false, starts: 0, ends: 0,
        setStrength(value) {this.strengths.push(value);}, refresh() {this.refreshes++;},
        beginMotion() {this.frozen = true; this.starts++;}, endMotion() {this.frozen = false; this.ends++;},
        destroy() {this.frozen = false; this.destroyed = true;}};
      opticalInstances.push(optic); return optic;
    },
    setupTabLabelGlass(selectedHeader, surface) {
      assert.equal(selectedHeader, header);
      if (!labelSupported) return null;
      const optic = {surface, options: {adapter: 'Safari'}, strengths: [], paints: [], refreshes: 0, frozen: false,
        setStrength(value) {this.strengths.push(value);}, paint(box) {this.paints.push({...box});},
        refresh() {this.refreshes++;}, beginMotion() {this.frozen = true;}, endMotion() {this.frozen = false;},
        destroy() {this.destroyed = true; this.frozen = false;}};
      opticalInstances.push(optic); return optic;
    }});
  vm.runInContext(bootstrap, context);
  vm.runInContext(owner, context);
  function step(ms = 16) {
    now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now));
  }
  function settle() { for (let i = 0; frames.size && i < 80; i++) step(); assert.equal(frames.size, 0, 'no idle animation loop'); }
  return {context, window, document, state, header, glass, track, reduced, fonts, frames, observers, opticalInstances, replaceTabs, step, settle,
    geometry(destination, reveal) { return window.__edwinosTabGlassGeometry(header, destination, reveal); }};
}

// Production integration selects the Safari alternative while retaining the
// existing geometry/motion/search contracts and Chromium/fallback path.
{
  const h = harness({userAgent: 'Version/18.2 Safari/605.1.15'});
  h.context.setupTabGlass(); assert.equal(h.opticalInstances[0].options.adapter, 'Safari');
  h.replaceTabs(1); h.context.setupTabGlass(); h.step(100);
  assert(h.opticalInstances[0].paints.length > 1, 'shared animation paints Safari clip/filter geometry');
  assert(h.opticalInstances[0].strengths.some(value => value > 0));
  h.reduced.matches = true; h.reduced.fire('change');
  assert.equal(h.opticalInstances[0].frozen, false); h.settle(); h.context.tabGlassRuntime.destroy();
  const unsupported = harness({userAgent: 'Version/18.2 Safari/605.1.15', labelSupported: false});
  unsupported.context.setupTabGlass(); assert.equal(unsupported.opticalInstances[0].options.filterId, 'edwinos-tab-refraction');
  unsupported.context.tabGlassRuntime.destroy();
}

// The real template identifies section roots, children, deployment subpaths and
// index.html without treating Archive/Friends as an active Overview destination.
{
  const h = harness({active: 2});
  assert.equal(h.header.dataset.edwinosTabGlassReady, '1');
  assert.equal(h.glass.dataset.edwinosTabSelected, h.state.links[2].href);
  assert.equal(h.state.rail.scrollLeft, 107, 'initial More becomes fully visible');
  assert.equal(h.glass.getBoundingClientRect().right, h.state.rail.getBoundingClientRect().right - 1);
  for (const destination of ['https://test.local/project/OsdNotes/index.html', 'https://test.local/project/OsdNotes/CHEM/CHEM%20102/?h=2p#section']) {
    assert.equal(h.geometry(destination, false).key, h.state.links[1].href);
  }
  for (const destination of ['https://test.local/project/经验分享/', 'https://test.local/project/%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/article/index.html']) {
    assert.equal(h.geometry(destination, false).key, h.state.links[2].href);
  }
  assert.equal(h.geometry('https://test.local/project/index.html', false).key, h.state.links[0].href);
  for (const destination of ['https://test.local/project/HOME/Archive/', 'https://test.local/project/HOME/friends/']) {
    assert.equal(h.geometry(destination).selected, false);
  }
  h.document.body.neutral = true; assert.equal(h.geometry().selected, false);
  h.document.body.neutral = false; h.state.active = 0; h.geometry();
  assert.equal(h.state.rail.scrollLeft, 0, 'returning to Overview reveals the left edge');
}

// Header/surface identity survives tabs replacement; movement starts at rendered
// screen coordinates even when the mobile drawer moves the rail's left edge.
{
  const h = harness({left: 14}); h.context.setupTabGlass();
  const runtime = h.context.tabGlassRuntime, surface = h.glass;
  assert.equal(h.frames.size, 0, 'runtime adoption never adds an initial ingress');
  const before = h.glass.getBoundingClientRect().left, oldRail = h.state.rail;
  h.replaceTabs(1, 52); h.context.setupTabGlass();
  assert.equal(h.context.tabGlassRuntime, runtime); assert.equal(h.glass, surface); assert.equal(h.opticalInstances.length, 1);
  assert.equal(oldRail.listenerCount('scroll'), 0, 'replaced rail listeners retired');
  assert.equal(h.glass.getBoundingClientRect().left, before, 'drawer compensation is synchronous before optical setup/first RAF');
  assert.equal(h.glass.dataset.edwinosTabMoving, '1'); h.step(0);
  assert.equal(h.glass.getBoundingClientRect().left, before, 'drawer insertion cannot jump the starting position');
  h.step(130); const interrupted = h.glass.getBoundingClientRect().left;
  h.replaceTabs(2); h.context.setupTabGlass(); h.step(0);
  assert.equal(h.glass.getBoundingClientRect().left, interrupted, 'rapid arrival resumes the actual visible position');
  h.settle();
  assert.equal(h.glass.dataset.edwinosTabMoving, '0');
  const goal = h.geometry();
  assert.equal(Number.parseFloat(h.glass.style.left), goal.x);
  assert.equal(Number.parseFloat(h.glass.style.width), goal.width);
  const lens = h.opticalInstances[0];
  assert.equal(lens.options.blur, 0, 'navigation text must stay sharp in the neutral center');
  assert.equal(lens.options.profile, 'shuding');
  assert.equal(lens.options.rim, undefined, 'reference field has no fixed-width rim');
  assert(lens.starts >= 2, 'rapid arrival freezes the map for each movement');
  assert.equal(lens.frozen, false, 'normal completion releases the frozen map');
  assert(lens.strengths.some(value => value > 0), 'moving rim refracts the sampled labels');
  assert(lens.strengths.every(value => value >= 0 && value <= 1), 'motion strength stays bounded');
  assert.equal(lens.strengths.at(-1), 0, 'narrow tab glyphs are not distorted at rest');
  h.step(5000); assert.equal(h.frames.size, 0);
  // Same-section result closing does not reposition or restart the capsule.
  const properties = {...h.glass.style}, refreshes = h.opticalInstances[0].refreshes;
  runtime.prepareSearchDestination('https://test.local/project/经验分享/a/?h=run#id');
  assert.deepEqual(h.glass.style, properties); assert.equal(h.frames.size, 0); assert.equal(h.opticalInstances[0].refreshes, refreshes);
  runtime.prepareSearchDestination('https://test.local/project/OsdNotes/CHEM/CHEM%20102/?h=2p#sp');
  assert.equal(h.glass.dataset.edwinosTabSelected, h.state.links[1].href);
  assert.equal(h.frames.size, 0, 'cross-section result positions beneath covering search, without ingress');
  assert.equal(h.glass.dataset.edwinosTabMoving, '0');
  runtime.destroy();
  assert.equal(h.window.listenerCount('resize'), 0); assert.equal(h.reduced.listenerCount('change'), 0);
  assert.equal(h.fonts.listenerCount('loadingdone'), 0); assert.equal(h.state.rail.listenerCount('scroll'), 0);
  assert(h.observers.every(observer => observer.disconnected)); assert(h.opticalInstances[0].destroyed);
  h.fonts.readyCallback(); assert.equal(h.frames.size, 0, 'late font completion after disposal does nothing');
}

// Geometry changes while moving must not be dropped, and reduced motion can
// become enabled while an animation is already active.
{
  const h = harness(); h.context.setupTabGlass(); h.replaceTabs(2); h.context.setupTabGlass(); h.step(80);
  h.state.width = 180; h.fonts.fire('loadingdone'); h.step();
  h.settle(); const goal = h.geometry();
  assert.equal(Number.parseFloat(h.glass.style.left), goal.x, 'mid-motion layout notification updates final geometry');
  h.replaceTabs(0); h.context.setupTabGlass(); h.step(70);
  h.reduced.matches = true; h.reduced.fire('change');
  assert.equal(h.frames.size, 0); assert.equal(h.glass.dataset.edwinosTabMoving, '0');
  assert.equal(h.opticalInstances[0].frozen, false, 'reduced motion releases in-progress map freeze');
  assert.equal(Number.parseFloat(h.glass.style.left), h.geometry().x);
  h.context.tabGlassRuntime.destroy();
}
{
  const h = harness({reducedMotion: true}); h.context.setupTabGlass(); h.replaceTabs(1); h.context.setupTabGlass();
  assert.equal(h.frames.size, 0); assert.equal(h.glass.dataset.edwinosTabMoving, '0');
  assert.equal(Number.parseFloat(h.glass.style.left), h.geometry().x);
  h.document.body.neutral = true; h.context.setupTabGlass(); assert.equal(h.glass.hidden, true, 'neutral HOME retires selected glass');
  assert.equal(h.opticalInstances[0].frozen, false, 'neutral hiding cannot leave a frozen optical map');
  h.document.body.neutral = false; h.replaceTabs(0); h.context.setupTabGlass(); assert.equal(h.glass.hidden, false);
  h.context.tabGlassRuntime.destroy();
}

// Run the real optical helper, including real SDF pixel generation, against
// deterministic SVG/canvas primitives. This verifies atomic href lifetime and
// extent coverage; browser checks still establish actual SVG compositing.
{
  const helper = source.slice(source.indexOf('  function setupLayoutControlGlass('), source.indexOf('  /* A header sibling'));
  const shader = source.slice(source.indexOf('  function fillRoundedGlassDisplacementMap('), source.indexOf('  function setupHeaderSearchTransition('));
  const nodes = [], frames = new Map(), observers = [];
  let serial = 0, encodes = 0, box = rect(0, 0, 100, 40);
  function node(tag) {
    const item = {tag, attributes: {}, children: [], dataset: {}, removed: false, isConnected: true,
      style: {setProperty(name, value) {this[name] = value;}, removeProperty(name) {delete this[name];}},
      classList: {add() {}, remove() {}, toggle() {}},
      setAttribute(name, value) {this.attributes[name] = String(value);},
      setAttributeNS(ns, name, value) {this.setAttribute(name, value);},
      appendChild(child) {this.children.push(child);}, remove() {this.removed = true;},
      getBoundingClientRect: () => box};
    nodes.push(item); return item;
  }
  const canvasContext = {createImageData(width, height) {return {width, height, data: new Uint8ClampedArray(width * height * 4)};}, putImageData() {}};
  const document = {body: node('body'), fonts: {ready: {then() {}}}, createElement(tag) {
    const item = node(tag);
    if (tag === 'canvas') {item.getContext = () => canvasContext; item.toDataURL = () => 'data:image/png;base64,map' + (++encodes);}
    return item;
  }, createElementNS(ns, tag) {return node(tag);}};
  class ResizeObserver {constructor(callback) {this.callback = callback; observers.push(this);} observe() {} disconnect() {} fire() {this.callback();}}
  const window = events({navigator: {userAgent: 'Chrome/130.0'}, CSS: {supports: () => true},
    SVGFEImageElement: function () {}, SVGFEDisplacementMapElement: function () {}, ResizeObserver,
    getComputedStyle: () => ({borderTopLeftRadius: '20px'}),
    requestAnimationFrame(callback) {frames.set(++serial, callback); return serial;}, cancelAnimationFrame(id) {frames.delete(id);}});
  const context = vm.createContext({window, document});
  vm.runInContext(shader + helper, context);
  const feedback = node('surface');
  const optics = context.setupLayoutControlGlass(feedback, {prefix: 'edwinos-tab', filterId: 'test-refraction',
    blur: 0, strength: 0, padding: 16, profile: 'shuding',
    datasetMode: 'mode', datasetBuilds: 'builds', datasetFrozen: 'frozen'});
  function step() {const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());}
  step();
  const filter = nodes.find(item => item.tag === 'filter');
  const image = nodes.find(item => item.tag === 'feImage');
  const displacement = nodes.find(item => item.tag === 'feDisplacementMap');
  assert.equal(filter.attributes.x, '-16'); assert.equal(image.attributes.x, '0');
  const href = image.attributes.href, initialEncodes = encodes, initialBuilds = feedback.dataset.builds;
  optics.beginMotion(); assert.equal(feedback.dataset.frozen, '1');
  for (const width of [90, 75, 60, 45]) {
    box = rect(0, 0, width, 40); optics.setStrength(1);
    assert.equal(Number(filter.attributes.width), width + 32, 'filter covers padded moving width synchronously');
    assert.equal(Number(image.attributes.width), width, 'decoded map follows same sampling region');
    assert.equal(image.attributes.href, href, 'moving width must not replace decoded PNG href');
    observers[0].fire(); step();
    assert.equal(image.attributes.href, href, 'ResizeObserver cannot rebuild an in-flight map');
  }
  assert.equal(encodes, initialEncodes); assert.equal(feedback.dataset.builds, initialBuilds);
  optics.endMotion(false);
  assert.equal(feedback.dataset.frozen, '0'); assert.equal(displacement.attributes.scale, '0');
  assert.equal(encodes, initialEncodes, 'endpoint disables lens before scheduling any decode');
  optics.refresh(); step();
  assert.equal(encodes, initialEncodes + 1, 'one endpoint map replaces per-frame PNG churn');
  assert.notEqual(image.attributes.href, href);
  optics.beginMotion(); optics.endMotion(false); optics.beginMotion();
  assert.equal(encodes, initialEncodes + 1, 'interruption reuses the stable map');
  optics.destroy(); assert.equal(feedback.dataset.frozen, undefined); assert.equal(frames.size, 0);
  assert(filter.removed === false && nodes.find(item => item.tag === 'svg').removed, 'filter definitions disposed together');

  // Default consumers keep their original padding and optical tuning.
  const legacyStart = nodes.length, legacy = context.setupLayoutControlGlass(node('legacy'), {
    prefix: 'legacy', filterId: 'legacy-refraction', datasetMode: 'mode', datasetBuilds: 'builds'});
  step(); const legacyNodes = nodes.slice(legacyStart);
  assert.equal(legacyNodes.find(item => item.tag === 'filter').attributes.x, '-16');
  assert.equal(legacyNodes.find(item => item.tag === 'feGaussianBlur').attributes.stdDeviation, '4');
  assert.equal(legacyNodes.find(item => item.tag === 'feDisplacementMap').attributes.scale, '22');
  legacy.destroy();

  const pixels = {width: 148, height: 88, data: new Uint8ClampedArray(148 * 88 * 4)};
  context.fillRoundedGlassDisplacementMap(pixels, 100, 40, 24, 20);
  function sample(x, y) {const at = ((y + 24) * pixels.width + x + 24) * 4; return [...pixels.data.slice(at, at + 2)];}
  assert(sample(0, 20)[0] < 128 && sample(99, 20)[0] > 128, 'other glass components keep outward profile');
}

// Literal upstream fragment + encoder oracle, independent from production
// helpers. Checks the entire field/derived scale and continuity at every pixel,
// rather than asserting a couple of new implementation constants.
{
  const shader = source.slice(source.indexOf('  function fillTabGlassDisplacementMap('), source.indexOf('  function setupHeaderSearchTransition('));
  const context = vm.createContext({Float32Array}); vm.runInContext(shader, context);
  function upstream(w, h) {
    const smoothStep = (a, b, t) => { t = Math.max(0, Math.min(1, (t-a)/(b-a))); return t*t*(3-2*t); };
    const raw = [], data = new Uint8ClampedArray(w*h*4); let peak = 0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const ix=x/w-.5, iy=y/h-.5, qx=Math.abs(ix)-.3+.6, qy=Math.abs(iy)-.2+.6;
      const distance=Math.min(Math.max(qx,qy),0)+Math.sqrt(Math.max(qx,0)**2+Math.max(qy,0)**2)-.6;
      const scaled=smoothStep(0,1,smoothStep(.8,0,distance-.15));
      const dx=ix*(scaled-1)*w, dy=iy*(scaled-1)*h;
      raw.push(dx,dy); peak=Math.max(peak,Math.abs(dx),Math.abs(dy));
    }
    peak*=.5;
    for(let i=0;i<w*h;i++) {data[i*4]=(raw[i*2]/peak+.5)*255;data[i*4+1]=(raw[i*2+1]/peak+.5)*255;data[i*4+3]=255;}
    return {peak,data};
  }
  for(const [w,h] of [[300,200],[100,42],[45,42]]) {
    const pixels={width:w,height:h,data:new Uint8ClampedArray(w*h*4)};
    const scale=context.fillTabGlassDisplacementMap(pixels,w,h), expected=upstream(w,h);
    assert(Math.abs(scale-expected.peak)<1e-10, 'physical scale comes from the upstream shader');
    assert(pixels.data.every((channel,i)=>Math.abs(channel-expected.data[i])<=1), 'all UV pixels match the reference encoder');
    const at=(x,y)=>[...pixels.data.slice((y*w+x)*4,(y*w+x)*4+2)];
    assert.deepEqual(at(Math.floor(w/2),Math.floor(h/2)),[128,128]);
    assert(scale/2 < w*.1, 'navigation no longer applies fixed28px folding to small lenses');
  }
}

// Safari's ordinary SVG adapter retains exactly three source labels and two
// disjoint visual uses, with native anchor semantics/layout left untouched.
// This checks adapter ownership, clips, source refresh and map lifetime rather
// than claiming that a VM proves Safari's rendering/baseline/compositor output.
{
  const adapter = source.slice(source.indexOf('  function setupTabLabelGlass('), source.indexOf('  /* A header sibling'));
  const shader = source.slice(source.indexOf('  function fillRoundedGlassDisplacementMap('), source.indexOf('  function setupHeaderSearchTransition('));
  const nodes = [], frames = new Map(), mutations = [];
  let serial = 0, encodes = 0, palette = '#292e36', offset = 0;
  function node(tag) {
    const item = {tag, attributes: {}, children: [], dataset: {}, isConnected: true, hidden: false,
      style: {}, textContent: '', removed: false,
      setAttribute(name, value) {this.attributes[name] = String(value);},
      setAttributeNS(ns, name, value) {this.setAttribute(name, value);}, removeAttribute(name) {delete this.attributes[name];},
      appendChild(child) {this.children.push(child);},
      replaceChildren(fragment) {this.children = fragment.children.slice();}, remove() {this.removed = true;},
      getBoundingClientRect: () => rect(0, 14, 0, 0)};
    nodes.push(item); return item;
  }
  const track = node('track'); track.getBoundingClientRect = () => rect(40, 0, 180, 64);
  const surface = node('surface'); Object.assign(surface.style, {left: '1px', top: '12px', width: '98px', height: '40px'});
  const style = {fontFamily: 'Inter', fontSize: '17px', fontWeight: '500', fontStyle: 'normal', fontStretch: 'normal',
    lineHeight: '17px', letterSpacing: '0px', fontKerning: 'auto', fontFeatureSettings: 'normal', fontVariantLigatures: 'normal', textTransform: 'none', opacity: '1'};
  let links = ['Overview', 'ENotes', 'More'].map((text, i) => ({tag: 'link', textContent: text,
    href: 'https://test.local/' + i, textBox: () => rect(45 + i * 75 + offset, 20, 70, 20),
    style: {...style, fontWeight: i === 0 ? '600' : '500'},
    closest: selector => selector === '.md-tabs__link', matches: selector => selector === '.md-tabs__link'}));
  const header = events({dataset: {}, querySelector: selector => {assert.equal(selector, '.edwinos-tab-glass-track'); return track;},
    querySelectorAll: selector => {assert.equal(selector, '.md-tabs__link'); return links;}});
  const document = {body: node('body'), createDocumentFragment: () => node('fragment'),
    createElementNS(ns, name) {return node(name);}, createElement(name) {
      const item = node(name);
      if (name === 'canvas') {
        item.getContext = () => ({createImageData(width, height) {return {width, height, data: new Uint8ClampedArray(width * height * 4)};}, putImageData() {}});
        item.toDataURL = () => 'data:image/png;base64,safari' + (++encodes);
      }
      return item;
    }, createRange() {let target; return {selectNodeContents(item) {target = item;}, getBoundingClientRect() {
      return target.tag === 'link' ? target.textBox() : rect(0, 0, 60, 20);
    }};}};
  class MutationObserver {
    constructor(callback) {this.callback = callback; this.disconnected = false; mutations.push(this);}
    observe(target, options) {this.target = target; this.options = options;}
    disconnect() {this.disconnected = true;}
    fire() {this.callback();}
  }
  const window = {SVGFEDisplacementMapElement: function () {}, MutationObserver,
    getComputedStyle: link => ({...link.style, color: palette}),
    requestAnimationFrame(callback) {frames.set(++serial, callback); return serial;}, cancelAnimationFrame(id) {frames.delete(id);}};
  const context = vm.createContext({window, document, MutationObserver});
  vm.runInContext(shader + adapter, context);
  const optics = context.setupTabLabelGlass(header, surface);
  function step() {const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());}
  assert.equal(header.dataset.edwinosTabLabelReady, undefined, 'original text remains visible until source is ready');
  step();
  assert.equal(header.dataset.edwinosTabLabelReady, '1');
  assert.equal(surface.dataset.edwinosTabMode, 'label-refraction');
  const svg = nodes.find(item => item.tag === 'svg');
  const labelSource = nodes.find(item => item.attributes.id === 'edwinos-tab-label-source');
  assert.deepEqual(labelSource.children.map(item => item.textContent), ['Overview', 'ENotes', 'More']);
  assert.equal(nodes.filter(item => item.tag === 'use').length, 2, 'one source with complementary optical uses');
  const outside = nodes.find(item => item.attributes.id === 'edwinos-tab-label-outside');
  const inside = nodes.find(item => item.attributes.id === 'edwinos-tab-label-inside');
  assert.equal(outside.children[0].attributes['clip-rule'], 'evenodd');
  assert.equal(inside.children.length, 1);
  assert.equal(labelSource.children[0].style.fontWeight, '600');
  assert.equal(labelSource.children[0].attributes.x, '5'); assert.equal(labelSource.children[0].attributes.y, '34');
  assert(links.every(link => link.href.startsWith('https://test.local/') && Object.keys(link.style).length === Object.keys(style).length), 'anchor semantics and authored styles are not replaced');
  const image = nodes.find(item => item.tag === 'feImage'), initialHref = image.attributes.href, initialEncodes = encodes;
  const displacement = nodes.find(item => item.tag === 'feDisplacementMap');
  const uses = nodes.filter(item => item.tag === 'use'), opticalUse = uses[1];
  const lensGroup = nodes.find(item => item.attributes.class === 'edwinos-tab-label-lens');
  assert.equal(lensGroup.attributes.filter, undefined, 'rest bypasses SVG filter while new map decodes');
  optics.beginMotion();
  for (const width of [85, 70, 45]) {
    optics.paint({x: 25, y: 12, width, height: 40}); optics.setStrength(1);
    assert.equal(image.attributes.href, initialHref); assert.equal(image.attributes.width, String(width));
    assert.equal(image.attributes.x, '0', 'UV raster spans only the actual lens, without stretched padding');
    assert.equal(lensGroup.attributes.transform, 'translate(25 12)');
    assert.equal(opticalUse.attributes.transform, 'translate(-25 -12)', 'countertranslated source retains actual label positions');
    assert.equal(displacement.attributes.x, '-16');
    assert.equal(displacement.attributes.width, String(width + 32), 'source coverage is padded separately from UV map');
    const matrix = nodes.find(item => item.tag === 'feColorMatrix');
    assert(Math.abs(Number(matrix.attributes.values.split(' ')[0]) - width / 98) < 1e-8, 'width morph independently rescales physical X offset');
  }
  assert.equal(encodes, initialEncodes); assert.equal(lensGroup.attributes.filter, 'url(#edwinos-tab-label-refraction)');
  assert.equal(labelSource.children.length, 3, 'motion does not multiply/rebuild visual labels');
  Object.assign(surface.style, {left: '25px', width: '45px'});
  optics.endMotion(false); optics.beginMotion();
  assert.equal(image.attributes.href, initialHref, 'active interruption resumes the same stable decoded map');
  optics.endMotion(false); assert.equal(lensGroup.attributes.filter, undefined);
  optics.refresh(); step(); assert.equal(encodes, initialEncodes + 1, 'only endpoint map changes');
  palette = '#eff6ff'; mutations[0].fire(); step();
  assert(labelSource.children.every(item => item.attributes.fill === palette), 'palette updates copied fill');
  palette = '#adbac7'; header.fire('pointerover', {target: links[1]}); step();
  assert.equal(labelSource.children[1].attributes.fill, palette, 'native hover color reaches the optical source');
  links[1].style.opacity = '0.7'; header.fire('focusin', {target: links[1]}); step();
  assert.equal(labelSource.children[1].attributes.opacity, '0.7', 'native focus/opacity state reaches source');
  links[1].style.opacity = '1'; header.fire('transitionend', {target: links[1], propertyName: 'opacity'}); step();
  assert.equal(labelSource.children[1].attributes.opacity, '1', 'final opacity transition refreshes without polling');
  header.fire('pointerover', {target: {closest: () => null}});
  assert.equal(frames.size, 0, 'unrelated header controls never trigger optical source work');
  optics.beginMotion(); palette = '#89939f'; header.fire('focusout', {target: links[1]});
  assert.equal(frames.size, 0, 'input states cannot restart map/source work inside the frozen motion');
  optics.endMotion(false); optics.refresh(); step();
  assert.equal(labelSource.children[1].attributes.fill, palette, 'endpoint refresh picks up final frozen input state');
  offset = -25; links = links.map(link => ({...link})); optics.refresh(); step();
  assert.equal(labelSource.children[0].attributes.x, '-20', 'replaced/scrolled rail source uses actual text positions');
  surface.hidden = true; optics.setStrength(0);
  assert.equal(header.dataset.edwinosTabLabelReady, undefined); assert.equal(svg.style.display, 'none', 'neutral routes restore native glyphs');
  surface.hidden = false; optics.refresh(); step(); assert.equal(header.dataset.edwinosTabLabelReady, '1');
  optics.beginMotion(); optics.destroy();
  assert.equal(header.dataset.edwinosTabLabelReady, undefined); assert(svg.removed);
  assert(mutations.every(observer => observer.disconnected)); assert.equal(frames.size, 0);
  assert.equal(header.listenerCount('transitionend'), 0);
  for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout']) assert.equal(header.listenerCount(name), 0);

  // A real unmeasured/zero-size start must not publish a bogus padding-only
  // texture and then reuse it as a lens map once positive geometry appears.
  Object.assign(surface.style, {left: '0px', top: '0px', width: '0px', height: '0px'});
  const beforeZero = encodes, zero = context.setupTabLabelGlass(header, surface);
  step(); assert.equal(encodes, beforeZero); assert.equal(surface.dataset.edwinosTabMapBuilds, undefined);
  zero.beginMotion(); zero.setStrength(1);
  assert.equal(surface.dataset.edwinosTabMapFrozen, '0', 'unmeasured startup never freezes a bogus map');
  zero.endMotion(false);
  Object.assign(surface.style, {width: '98px', height: '40px'});
  zero.beginMotion();
  assert.equal(encodes, beforeZero + 1, 'first positive startup geometry generates a genuine map');
  zero.destroy(); assert.equal(frames.size, 0);
}
console.log('Tab glass geometry/lifecycle checks passed (SVG compositor verified separately in browser).');
