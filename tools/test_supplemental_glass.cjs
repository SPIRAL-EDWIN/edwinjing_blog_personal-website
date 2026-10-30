#!/usr/bin/env node
'use strict';
// Execute the production owners with deterministic visibility, motion and DOM
// replacement. This VM cannot verify compositor blur/refraction or Material's
// visual toolbar transitions; those remain browser QA responsibilities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, 'production owner boundaries are available');
  return source.slice(a, b);
}
const owners = extract('  function fillRoundedGlassDisplacementMap(', '  function setupHeaderSearchTransition()') +
  extract('  function setupLayoutControlGlass(', '  /* Safari cannot apply SVG displacement') +
  extract('  function setupContentGlass()', '  function showPageNavigationFeedback(');
function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.fire = (type, event = {}) => [...(listeners.get(type) || [])].forEach(fn => fn(event));
  target.listenerCount = type => listeners.get(type)?.size || 0;
  return target;
}
class Node {
  constructor(tag, classes = '') {
    events(this); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.className = classes;
    this.children = []; this.parentNode = null; this.attributes = {}; this.dataset = {}; this.isConnected = true;
    this.box = {left: 0, top: 0, width: 180, height: 40, right: 180, bottom: 40}; this.radius = '12px'; this.reads = 0;
    const values = new Map(); this.style = {values, setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key)};
  }
  get classList() {
    const self = this;
    const change = callback => { const values = new Set(self.className.split(/\s+/).filter(Boolean)); callback(values); self.className = [...values].join(' '); };
    return {contains: name => self.className.split(/\s+/).includes(name), add: (...names) => change(values => names.forEach(name => values.add(name))),
      remove: (...names) => change(values => names.forEach(name => values.delete(name))), toggle: (name, on) => change(values => on ? values.add(name) : values.delete(name))};
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); node.connect(this.isConnected); return node; }
  connect(value) { this.isConnected = value; this.children.forEach(node => node.connect(value)); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; this.connect(false); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttributeNS(_ns, name, value) { this.setAttribute(name, value); }
  getBoundingClientRect() { this.reads++; return this.box; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('#')) return this.attributes.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      return this.tagName.toLowerCase() === part.toLowerCase();
    });
  }
  querySelectorAll(selector) {
    const result = [];
    const branches = selector.split(',').map(branch => branch.replace(/>/g, ' > ').trim().split(/\s+/));
    const matchesChain = (node, parts, index = parts.length - 1) => {
      if (!node || !node.matches(parts[index])) return false;
      if (index === 0) return true;
      if (parts[index - 1] === '>') return matchesChain(node.parentNode, parts, index - 2);
      for (let ancestor = node.parentNode; ancestor; ancestor = ancestor.parentNode) {
        if (matchesChain(ancestor, parts, index - 1)) return true;
      }
      return false;
    };
    const visit = node => node.children.forEach(child => {
      if (branches.some(parts => matchesChain(child, parts))) result.push(child);
      visit(child);
    });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function harness({userAgent = 'Chrome/143.0', mobile = true, reduced = false, intersectionAvailable = true} = {}) {
  let now = 0, sequence = 0;
  const frames = new Map(), timers = new Map(), resizes = [], intersections = [], mutations = [], canvases = [], fontCallbacks = [];
  const mobileQuery = events({matches: mobile}), motionQuery = events({matches: reduced});
  const body = new Node('body'), sidebar = body.appendChild(new Node('aside', 'md-sidebar--primary'));
  sidebar.box = {left: 0, top: 0, width: 240, height: 640, right: 240, bottom: 640};
  const toggle = events({checked: false});
  const document = events({body, hidden: false, content: null, sidebar, toggle, fonts: {ready: {then: fn => fontCallbacks.push(fn)}},
    querySelectorAll(selector) {
      if (selector === '.edwinos-header-academic') return [];
      throw new Error('Unexpected document selector '+ selector);
    },
    querySelector(selector) {
      if (selector === '.md-content__inner') return this.content;
      if (selector === '.md-sidebar--primary') return this.sidebar;
      if (selector === '[data-md-toggle="drawer"]') return this.toggle;
      throw new Error('Unexpected document selector ' + selector);
    },
    createElement(tag) {
      const node = new Node(tag);
      if (tag === 'canvas') {
        node.encodes = 0; canvases.push(node);
        node.getContext = () => ({createImageData: (width, height) => ({width, height, data: new Uint8ClampedArray(width * height * 4)}), putImageData(pixels) {node.lastPixels = pixels;}});
        node.toDataURL = () => { node.encodes++; return 'data:image/png;base64,map-' + canvases.indexOf(node) + '-' + node.encodes; };
      }
      return node;
    }, createElementNS: (_namespace, tag) => new Node(tag)});
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnects = 0; resizes.push(this); }
    observe(node) { this.targets.add(node); }
    disconnect() { this.targets.clear(); this.disconnects++; }
    deliver() { this.callback(); }
  }
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnects = 0; intersections.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); this.disconnects++; }
    deliver(node, visible) { this.callback([{target: node, isIntersecting: visible}]); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnects = 0; mutations.push(this); }
    observe(node) { this.targets.add(node); }
    disconnect() { this.targets.clear(); this.disconnects++; }
    deliver(addedNodes = [], removedNodes = []) { this.callback([{addedNodes, removedNodes}]); }
  }
  const window = events({navigator: {userAgent}, innerHeight: 720, CSS: {supports: () => true},
    SVGFEImageElement: class {}, SVGFEDisplacementMapElement: class {}, ResizeObserver, MutationObserver,
    getComputedStyle: node => ({borderTopLeftRadius: node.radius}), performance: {now: () => now},
    matchMedia: selector => selector.includes('max-width') ? mobileQuery : motionQuery,
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, {callback, due: now + delay}); return id; }, clearTimeout: id => timers.delete(id)});
  if (intersectionAvailable) window.IntersectionObserver = IntersectionObserver;
  const context = vm.createContext({window, document, drawerGlassRuntime: null, contentGlassRuntime: null, controlGlassSequence: 0, currentDrawerSection: () => 'notes'});
  vm.runInContext(owners, context);
  const call = name => vm.runInContext(name + '()', context);
  function step(ms = 16) {
    now += ms;
    const ready = [...frames.values()]; frames.clear(); ready.forEach(fn => fn(now));
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
  }
  function settle() { for (let i = 0; frames.size && i < 50; i++) step(); assert.equal(frames.size, 0, 'no idle frame loop'); }
  const open = value => { toggle.checked = value; toggle.fire('change'); };
  const visible = value => { document.hidden = !value; document.fire('visibilitychange'); };
  const filters = () => body.querySelectorAll('filter');
  const gain = () => Number(body.querySelector('feDisplacementMap')?.getAttribute('scale'));
  return {context, body, sidebar, toggle, document, window, mobileQuery, motionQuery, frames, timers, resizes, intersections, mutations, canvases, fontCallbacks, call, step, settle, open, visible, filters, gain};
}


// The spare blue channel blends blur continuously without corrupting the
// displacement vectors or alpha. Sample an actual physical cross-section.
{
  const h = harness();
  const pixels = {width: 288, height: 288, data: new Uint8ClampedArray(288 * 288 * 4)};
  h.context.testPixels = pixels;
  vm.runInContext('fillRoundedGlassDisplacementMap(testPixels, 240, 240, 24, 16, 10)', h.context);
  const displacement = pixels.data.slice();
  vm.runInContext('fillGlassBlurWeights(testPixels, 240, 240, 24, 16, 96)', h.context);
  for (let i = 0; i < pixels.data.length; i += 4) {
    assert.equal(pixels.data[i], displacement[i], 'blur mask preserves X displacement');
    assert.equal(pixels.data[i + 1], displacement[i + 1], 'blur mask preserves Y displacement');
    assert.equal(pixels.data[i + 3], displacement[i + 3], 'blur mask preserves source alpha');
  }
  const row = 144, weights = [];
  for (let x = 24; x < 136; x++) weights.push(pixels.data[(row * pixels.width + x) * 4 + 2]);
  assert.equal(weights[0], 0, 'silhouette starts with the clear edge weight');
  assert.equal(weights.at(-1), 255, 'deep center uses the full frosted weight');
  for (let i = 1; i < weights.length; i++) {
    assert(weights[i] >= weights[i - 1], 'edge-to-center mask is monotonic');
    assert(weights[i] - weights[i - 1] <= 5, 'wider blend limits the per-pixel slope');
  }
  assert(weights.filter(value => value > 0 && value < 255).length >= 80, 'blend occupies a continuous broad band');
}
// A flush-left drawer has only one free optical edge. Its blur ramp depends
// on horizontal depth, so neither the left edge nor top/bottom corners create
// another sharp/blur boundary. Other glass keeps the rounded default field.
{
  const h = harness();
  const width = 240, height = 640, padding = 24;
  const pixels = {width: width + padding * 2, height: height + padding * 2,
    data: new Uint8ClampedArray((width + padding * 2) * (height + padding * 2) * 4)};
  h.context.testPixels = pixels;
  vm.runInContext("fillRoundedGlassDisplacementMap(testPixels, 240, 640, 24, 16, 10, 'right')", h.context);
  const displacement = pixels.data.slice();
  vm.runInContext("fillGlassBlurWeights(testPixels, 240, 640, 24, 16, 96, 'right')", h.context);
  const pixel = (x, y) => [...pixels.data.slice((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 4)];
  for (let i = 0; i < pixels.data.length; i += 4) {
    assert.equal(pixels.data[i], displacement[i], 'right-edge blur preserves X displacement');
    assert.equal(pixels.data[i + 1], displacement[i + 1], 'right-edge blur preserves Y displacement');
    assert.equal(pixels.data[i + 3], displacement[i + 3], 'right-edge blur preserves alpha');
  }
  for (const y of [24, 25, 344, 662, 663]) {
    for (const x of [24, 25, 80, 144]) {
      assert.deepEqual(pixel(x, y), [128, 128, 255, 255], 'left and top/bottom outside the right zone stay neutral and fully frosted');
    }
  }
  const weights = [];
  for (let x = 264; x >= 152; x--) weights.push(pixel(x, 344)[2]);
  assert.equal(weights[0], 0, 'right silhouette begins with lightly blurred edge');
  assert.equal(weights.at(-1), 255, '96px inward ramp reaches fully frosted center');
  assert(weights.filter(value => value > 0 && value < 255).length >= 80, 'right-only ramp has a wide continuous blend');
  for (let i = 1; i < weights.length; i++) {
    assert(weights[i] >= weights[i - 1], 'right-to-center blur weight is monotonic');
    assert(weights[i] - weights[i - 1] <= 5, 'right ramp has a bounded comfortable per-pixel slope');
  }
  for (const x of [152, 180, 216, 240, 250, 263, 264]) {
    const weight = pixel(x, 344)[2];
    for (const y of [0, 24, 25, 662, 663, 687]) assert.equal(pixel(x, y)[2], weight, 'right-edge blur has no vertical corner falloff');
  }
  assert(pixel(263, 344)[0] > 128, 'right silhouette retains live X refraction');
  assert.notEqual(pixel(251, 24)[1], 128, 'right rounded corner retains Y refraction');
  vm.runInContext('fillRoundedGlassDisplacementMap(testPixels, 240, 640, 24, 16, 10)', h.context);
  assert(pixel(24, 344)[0] < 128, 'omitting edge still preserves left refraction for ordinary rounded glass');
  vm.runInContext('fillGlassBlurWeights(testPixels, 240, 640, 24, 16, 96)', h.context);
  assert.equal(pixel(24, 344)[2], 0, 'omitting edge still preserves symmetric rounded blur falloff');
  assert.equal(pixel(144, 24)[2], 0, 'ordinary rounded glass still falls off at its top silhouette');
}
// The optional pipeline forms complementary premultiplied images, then adds
// them. Its combined alpha stays one, including mixed-color transition pixels.
{
  const h = harness();
  const surface = h.body.appendChild(new Node('button'));
  h.context.testSurface = surface;
  const options = {prefix: 'test-edge', filterId: 'test-edge-filter', datasetMode: 'testMode', datasetBuilds: 'testBuilds', blur: 14, edgeBlur: 2};
  h.context.testOptions = options;
  const runtime = vm.runInContext('setupLayoutControlGlass(testSurface, testOptions)', h.context);
  h.settle();
  const filter = h.body.querySelector('#test-edge-filter');
  const output = result => filter.children.find(node => node.getAttribute('result') === result);
  const centerMask = output('test-edge-center-mask');
  const matrix = centerMask.getAttribute('values').trim().split(/\s+/).map(Number);
  assert.equal(matrix.length, 20);
  const alphaFor = blue => matrix[15] * 0.9 + matrix[16] * 0.1 + matrix[17] * blue + matrix[18] + matrix[19];
  const center = output('test-edge-center-image'), edge = output('test-edge-edge-image');
  assert.equal(center.getAttribute('in'), 'test-edge-blur');
  assert.equal(edge.getAttribute('in'), 'test-edge-edge-blur');
  assert.equal(center.getAttribute('in2'), centerMask.getAttribute('result'));
  assert.equal(edge.getAttribute('in2'), centerMask.getAttribute('result'));
  assert.equal(center.getAttribute('operator'), 'in'); assert.equal(edge.getAttribute('operator'), 'out');
  assert.equal(output('test-edge-blur').getAttribute('stdDeviation'), '14');
  assert.equal(output('test-edge-edge-blur').getAttribute('stdDeviation'), '2');
  const composite = output('test-edge-optical-background');
  assert.equal(composite.getAttribute('operator'), 'arithmetic');
  assert.equal(composite.getAttribute('in'), center.getAttribute('result'));
  assert.equal(composite.getAttribute('in2'), edge.getAttribute('result'));
  const coefficients = ['k1', 'k2', 'k3', 'k4'].map(key => Number(composite.getAttribute(key)));
  const combine = (a, b) => coefficients[0] * a * b + coefficients[1] * a + coefficients[2] * b + coefficients[3];
  for (const weight of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
    const alpha = alphaFor(weight);
    assert.equal(alpha, weight, 'center mask alpha comes solely from map blue');
    assert(Math.abs(combine(alpha, 1 - alpha) - 1) < 1e-12, 'complementary masks do not create a translucent seam');
    assert(Math.abs(combine(0.8 * alpha, 0.2 * (1 - alpha)) - (0.8 * weight + 0.2 * (1 - weight))) < 1e-12,
      'premultiplied colors use additive interpolation rather than over compositing');
  }
  assert.equal(filter.querySelector('feDisplacementMap').getAttribute('in'), composite.getAttribute('result'));
  runtime.destroy();
  const defaultOptions = {...options, filterId: 'test-default-filter'}; delete defaultOptions.edgeBlur;
  h.context.testOptions = defaultOptions;
  const original = vm.runInContext('setupLayoutControlGlass(testSurface, testOptions)', h.context); h.settle();
  const defaultFilter = h.body.querySelector('#test-default-filter');
  assert.equal(defaultFilter.children.length, 3, 'existing default optics retain a single blur and displacement');
  assert.equal(defaultFilter.querySelector('feDisplacementMap').getAttribute('in'), 'test-edge-blur');
  original.destroy(); assert.equal(h.filters().length, 0);
}

// Drawer: normal and reversed transitions vary gain without rebuilding the map,
// taking per-frame geometry, or dropping the visible panel's optical surface.
{
  const h = harness(); h.call('setupDrawerGlass');
  assert.equal(h.canvases.length, 0, 'closed drawer creates no map');
  h.open(true); h.step(16);
  const drawerPixels = h.canvases[0].lastPixels;
  const expectedPixels = {width: drawerPixels.width, height: drawerPixels.height,
    data: new Uint8ClampedArray(drawerPixels.data.length)};
  h.context.expectedDrawerPixels = expectedPixels;
  vm.runInContext("fillRoundedGlassDisplacementMap(expectedDrawerPixels, 240, 640, 24, 16, 10, 'right'); fillGlassBlurWeights(expectedDrawerPixels, 240, 640, 24, 16, 96, 'right')", h.context);
  assert.deepEqual(drawerPixels.data, expectedPixels.data, 'actual drawer options and map pipeline use right-only refraction and the 96px horizontal blur ramp');
  assert.equal(h.body.querySelector('feGaussianBlur').getAttribute('stdDeviation'), '14', 'drawer retains its frosted center');
  const start = h.gain(), reads = h.sidebar.reads;
  h.step(80); const peak = h.gain();
  assert(peak > start && peak <= 12, 'gain evolves continuously within bounded strength');
  assert.equal(h.sidebar.reads, reads, 'transition does not measure layout every frame');
  assert.equal(h.canvases[0].encodes, 1);
  h.open(false); h.step(0);
  assert.equal(h.gain(), peak, 'first closing frame preserves gain at the reversal timestamp');
  assert.equal(h.canvases[0].encodes, 1, 'reversal does not rebuild the decoded map');
  h.step(80); const closingGain = h.gain();
  h.open(true); h.step(0);
  assert.equal(h.gain(), closingGain, 'first reopening frame preserves the current closing gain');
  h.settle();
  assert.equal(h.filters().length, 1, 'rapid reversal retains one independent surface');
  assert.equal(h.canvases[0].encodes, 1, 'motion never rebuilds the displacement map');
  assert(Math.abs(h.gain() - 6) < 1e-10);
  const builds = h.canvases[0].encodes; h.window.fire('scroll'); h.settle();
  assert.equal(h.canvases[0].encodes, builds, 'scroll sampling does not rebuild map');
  h.open(false); h.step(100); assert.equal(h.filters().length, 1, 'closing retains glass during visible travel');
  h.step(230); assert.equal(h.filters().length, 0); assert.equal(h.sidebar.children.length, 0);
  assert.equal(h.sidebar.dataset.edwinosDrawerMoving, undefined);
  assert.equal(h.window.listenerCount('resize'), 0);
  h.context.drawerGlassRuntime.destroy();
  assert.equal(h.toggle.listenerCount('change'), 0); assert.equal(h.sidebar.listenerCount('change'), 0);
  assert.equal(h.document.listenerCount('visibilitychange'), 0);
  assert.equal(h.mobileQuery.listenerCount('change'), 0); assert.equal(h.motionQuery.listenerCount('change'), 0);
}
// Safari keeps native glass until close completes and uses no animation frames.
{
  const h = harness({userAgent: 'Version/18.2 Safari/605.1.15'}); h.call('setupDrawerGlass'); h.open(true);
  assert.equal(h.sidebar.dataset.edwinosDrawerMode, 'native-blur'); assert.equal(h.frames.size, 0); assert.equal(h.canvases.length, 0);
  h.open(false); h.step(319); assert.equal(h.sidebar.dataset.edwinosDrawerMode, 'native-blur');
  h.open(true); h.step(10); assert.equal(h.timers.size, 0, 'reopening cancels delayed cleanup');
  h.open(false); h.step(320); assert.equal(h.sidebar.dataset.edwinosDrawerMode, undefined);
  assert.equal(h.frames.size, 0); h.context.drawerGlassRuntime.destroy();
}
// Reduced motion holds steady, hidden documents release their filters, and
// restoring an open drawer initializes a single fresh map without animation.
{
  const h = harness({reduced: true}); h.call('setupDrawerGlass'); h.open(true); h.settle();
  assert.equal(h.sidebar.dataset.edwinosDrawerMoving, undefined); assert(Math.abs(h.gain() - 6) < 1e-10);
  h.visible(false); assert.equal(h.filters().length, 0); assert.equal(h.frames.size, 0);
  h.visible(true); h.settle(); assert.equal(h.filters().length, 1); assert(Math.abs(h.gain() - 6) < 1e-10);
  h.motionQuery.matches = false; h.motionQuery.fire('change'); h.settle();
  h.sidebar.fire('change', {target: new Node('input', 'md-nav__toggle')}); h.step(80);
  assert(h.gain() > 6, 'submenu depth change also animates optical strength');
  h.motionQuery.matches = true; h.motionQuery.fire('change'); h.settle(); assert(Math.abs(h.gain() - 6) < 1e-10);
  h.open(false); assert.equal(h.filters().length, 0); assert.equal(h.frames.size, 0);
  h.context.drawerGlassRuntime.destroy();
}
{
  const h = harness({mobile: false}); h.toggle.checked = true; h.call('setupDrawerGlass'); h.settle();
  assert.equal(h.canvases.length, 0, 'desktop sidebar never owns drawer optics');
  h.mobileQuery.matches = true; h.mobileQuery.fire('change'); h.settle(); assert.equal(h.filters().length, 1);
  h.mobileQuery.matches = false; h.mobileQuery.fire('change'); assert.equal(h.filters().length, 0);
  h.context.drawerGlassRuntime.destroy();
}


// Rebinding a replaced sidebar removes old input ownership and stale callbacks.
{
  const h = harness(); h.call('setupDrawerGlass'); h.open(true); h.step();
  const staleFrame = [...h.frames.values()][0], oldRuntime = h.context.drawerGlassRuntime;
  const oldSidebar = h.sidebar, oldToggle = h.toggle;
  oldSidebar.remove();
  const replacement = h.body.appendChild(new Node('aside', 'md-sidebar--primary'));
  const replacementToggle = events({checked: false});
  h.document.sidebar = replacement; h.document.toggle = replacementToggle;
  h.call('setupDrawerGlass'); staleFrame(200); h.settle();
  assert.notEqual(h.context.drawerGlassRuntime, oldRuntime);
  assert.equal(h.filters().length, 0); assert.equal(oldToggle.listenerCount('change'), 0);
  assert.equal(oldSidebar.listenerCount('change'), 0);
  assert.equal(h.document.listenerCount('visibilitychange'), 1);
  replacementToggle.checked = true; replacementToggle.fire('change'); h.step();
  assert.equal(h.filters().length, 1); assert.equal(replacement.dataset.edwinosDrawerMode, 'refraction');
  h.visible(false); assert.equal(h.filters().length, 0); assert.equal(h.frames.size, 0);
  h.visible(true); h.settle(); assert.equal(h.filters().length, 1);
  h.context.drawerGlassRuntime.destroy(); assert.equal(h.filters().length, 0);
}

function contentFixture(h) {
  const content = h.body.appendChild(new Node('article', 'md-content__inner'));
  const actions = content.appendChild(new Node('div', 'profile-actions'));
  const profile = actions.appendChild(new Node('a', 'btn-github-action'));
  const stats = content.appendChild(new Node('div', 'archive-hero__stats'));
  const stat = stats.appendChild(new Node('span'));
  const pre = content.appendChild(new Node('pre'));
  const copy = pre.appendChild(new Node('nav', 'md-code__nav'));
  const button = copy.appendChild(new Node('button', 'md-code__button')); button.setAttribute('data-md-type', 'copy');
  const other = pre.appendChild(new Node('nav', 'md-code__nav'));
  other.appendChild(new Node('button', 'md-code__button')); other.appendChild(new Node('button', 'md-code__button'));
  return {content, profile, stat, pre, copy, button, other};
}
// Content controls: visibility bounds optical work, unique filters coexist with
// the drawer, removed controls and content replacement release all ownership.
{
  const h = harness(); const first = contentFixture(h); h.document.content = first.content;
  h.call('setupContentGlass'); assert.equal(h.canvases.length, 0, 'offscreen controls have no optical work');
  const visibility = h.intersections[0]; assert.equal(visibility.targets.size, 3, 'multi-button toolbar excluded');
  h.call('setupContentGlass'); assert.equal(h.intersections.length, 1, 'reentry for same content is idempotent');
  for (const node of [first.profile, first.stat, first.copy]) visibility.deliver(node, true);
  h.settle(); assert.equal(h.filters().length, 3);
  const ids = h.filters().map(filter => filter.getAttribute('id'));
  assert.equal(new Set(ids).size, 3);
  h.call('setupDrawerGlass'); h.open(true); h.settle(); assert.equal(h.filters().length, 4, 'drawer and controls have independent filters');
  visibility.deliver(first.copy, false); assert.equal(h.filters().length, 3);
  visibility.deliver(first.copy, true); h.settle();
  assert(!ids.includes(h.filters().at(-1).getAttribute('id')), 'recreated control cannot collide with old filter IDs');
  const nestedMark = first.copy.appendChild(new Node('span'));
  const before = h.canvases.length; h.mutations[0].deliver([nestedMark]); h.settle();
  assert.equal(h.canvases.length, before, 'glass auxiliary nodes do not recursively discover more controls');
  first.copy.remove(); h.mutations[0].deliver([], [first.copy]);
  assert(!visibility.targets.has(first.copy)); assert.equal(h.filters().length, 3);
  const later = first.pre.appendChild(new Node('nav', 'md-code__nav'));
  const laterButton = later.appendChild(new Node('button', 'md-code__button')); laterButton.setAttribute('data-md-type', 'copy');
  h.mutations[0].deliver([later]); assert(visibility.targets.has(later)); assert.equal(later.children.length, 1);
  visibility.deliver(later, true); h.settle(); assert.equal(later.children.length, 2);
  const second = contentFixture(h); first.content.remove(); h.document.content = second.content; h.call('setupContentGlass');
  assert.equal(visibility.disconnects, 1); assert.equal(h.mutations[0].disconnects, 1);
  assert.equal(h.filters().length, 1, 'content replacement releases controls and preserves drawer');
  visibility.deliver(first.profile, true); h.mutations[0].deliver([later]); h.settle();
  assert.equal(h.filters().length, 1, 'stale visibility and discovery callbacks do not resurrect old content');
  h.intersections[1].deliver(second.stat, true); h.settle(); assert.equal(h.filters().length, 2);
  const encodes = h.canvases.reduce((sum, canvas) => sum + canvas.encodes, 0);
  h.context.contentGlassRuntime.destroy(); h.context.drawerGlassRuntime.destroy();
  h.fontCallbacks.forEach(fn => fn()); h.settle();
  assert.equal(h.filters().length, 0); assert.equal(h.window.listenerCount('resize'), 0);
  assert.equal(h.canvases.reduce((sum, canvas) => sum + canvas.encodes, 0), encodes, 'disposed font callbacks cannot rebuild maps');
}
function landingFixture(h) {
  const content = h.body.appendChild(new Node('article', 'md-content__inner'));
  const landing = content.appendChild(new Node('div', 'notes-landing'));
  const routes = landing.appendChild(new Node('div', 'landing-routes'));
  const cards = Array.from({length: 3}, (_, index) => {
    const card = routes.appendChild(new Node('div', 'landing-route'));
    card.box = {left: index * 320, top: 100, width: 300, height: 180, right: index * 320 + 300, bottom: 280};
    card.radius = '16px';
    const heading = card.appendChild(new Node('h3'));
    heading.appendChild(new Node('a'));
    card.appendChild(new Node('p'));
    return card;
  });
  const outside = content.appendChild(new Node('div', 'landing-route'));
  return {content, cards, outside};
}
// Landing cards share the visibility lifecycle without eagerly allocating maps
// or turning ordinary scroll movement into layout reads and PNG encoding.
{
  const h = harness(); const first = landingFixture(h); h.document.content = first.content;
  h.call('setupContentGlass');
  const visibility = h.intersections[0];
  assert.equal(visibility.targets.size, 3, 'only cards inside the landing are observed');
  assert(!visibility.targets.has(first.outside), 'similarly named elements outside the landing stay unchanged');
  assert.equal(h.canvases.length, 0, 'landing maps wait for visibility');
  first.cards.forEach(card => visibility.deliver(card, true)); h.settle();
  assert.equal(h.filters().length, 3, 'all three visible cards hold independent maps');
  const originalIds = h.filters().map(filter => filter.getAttribute('id'));
  assert.equal(new Set(originalIds).size, 3, 'cards cannot reuse a filter ID');
  first.cards.forEach(card => {
    assert.equal(card.dataset.edwinosControlGlassMode, 'refraction');
    assert.equal(card.dataset.edwinosControlGlassBuilds, '1');
    assert.equal(card.children.length, 3, 'one decorative layer preserves authored heading and paragraph');
    assert.equal(card.children.at(-1).getAttribute('aria-hidden'), 'true');
  });
  const encodes = () => h.canvases.reduce((sum, canvas) => sum + canvas.encodes, 0);
  const initialReads = first.cards.map(card => card.reads);
  for (let index = 0; index < 5; index++) { h.window.fire('scroll'); h.document.fire('scroll'); h.step(100); }
  assert.equal(encodes(), 3, 'idle and scrolling do not encode maps again');
  assert.deepEqual(first.cards.map(card => card.reads), initialReads, 'scrolling does not measure card geometry');
  h.window.fire('resize'); h.fontCallbacks.forEach(callback => callback()); h.settle();
  assert.equal(encodes(), 3, 'unchanged layout and font callbacks reuse maps');
  const resized = first.cards[1];
  resized.box = {...resized.box, width: 480, right: resized.box.left + 480};
  h.resizes.find(observer => observer.targets.has(resized)).deliver(); h.settle();
  assert.equal(encodes(), 4, 'a genuine card size change rebuilds only its map');
  assert.equal(resized.dataset.edwinosControlGlassBuilds, '2');
  const resizedFilter = h.filters().find(filter => filter.getAttribute('id') === originalIds[1]);
  assert.equal(resizedFilter.getAttribute('width'), '504', 'sampling covers the changed width and padding');
  visibility.deliver(first.cards[0], false);
  assert.equal(h.filters().length, 2, 'offscreen card releases its filter');
  assert.equal(first.cards[0].children.length, 2, 'offscreen disposal removes only its decorative layer');
  assert.equal(first.cards[0].style.values.has('--edwinos-landing-route-filter'), false);
  visibility.deliver(first.cards[0], true); h.settle();
  assert.equal(h.filters().length, 3);
  assert(!originalIds.includes(h.filters().at(-1).getAttribute('id')), 'reentry uses a fresh filter ID');
  const second = landingFixture(h); first.content.remove(); h.document.content = second.content;
  h.call('setupContentGlass'); h.settle();
  assert.equal(visibility.disconnects, 1, 'page replacement disconnects the old visibility observer');
  assert.equal(h.filters().length, 0, 'page replacement releases all old card optics');
  visibility.deliver(first.cards[0], true); h.fontCallbacks.forEach(callback => callback()); h.settle();
  assert.equal(h.filters().length, 0, 'stale callbacks cannot resurrect replaced cards');
  h.intersections[1].deliver(second.cards[2], true); h.settle();
  assert.equal(h.filters().length, 1);
  const beforeDispose = encodes();
  h.context.contentGlassRuntime.destroy();
  h.window.fire('resize'); h.fontCallbacks.forEach(callback => callback()); h.settle();
  assert.equal(encodes(), beforeDispose, 'disposed callbacks cannot encode more maps');
  assert.equal(h.filters().length, 0);
  assert.equal(h.window.listenerCount('resize'), 0, 'card resize listeners are released');
}
// Safari uses the same cards and cleanup, with native blur rather than a fake
// SVG-refraction claim or an unnecessary canvas allocation.
{
  const h = harness({userAgent: 'Version/18.0 Safari/605.1.15'});
  const fixture = landingFixture(h); h.document.content = fixture.content;
  h.call('setupContentGlass');
  fixture.cards.forEach(card => h.intersections[0].deliver(card, true)); h.settle();
  assert.equal(h.canvases.length, 0); assert.equal(h.filters().length, 0);
  fixture.cards.forEach(card => assert.equal(card.dataset.edwinosControlGlassMode, 'native-blur'));
  h.context.contentGlassRuntime.destroy();
  fixture.cards.forEach(card => assert.equal(card.children.length, 2));
}
// Older browsers initialize only controls in the current viewport.
{
  const h = harness({intersectionAvailable: false}); const fixture = contentFixture(h);
  fixture.stat.box = {...fixture.stat.box, top: 2000, bottom: 2040}; h.document.content = fixture.content;
  h.call('setupContentGlass'); h.settle(); assert.equal(h.filters().length, 2);
  assert.equal(fixture.stat.dataset.edwinosControlGlassMode, undefined);
  h.context.contentGlassRuntime.destroy(); assert.equal(h.filters().length, 0);
}
console.log('Supplemental glass: continuous blur masks, complementary composites, drawer transitions and content lifecycle passed');
