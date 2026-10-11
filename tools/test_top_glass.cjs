#!/usr/bin/env node
'use strict';
// Exercise production geometry/lifecycle. Browser QA covers compositor rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const geometryStart = source.indexOf('  function fillRoundedGlassDisplacementMap(');
const geometryEnd = source.indexOf('  function setupHeaderSearchTransition()', geometryStart);
const ownerStart = source.indexOf('  function setupTopGlass()');
const ownerEnd = source.indexOf('  function setupSearchActivation()', ownerStart);
assert(geometryStart >= 0 && geometryEnd > geometryStart && ownerStart >= 0 && ownerEnd > ownerStart);
const geometry = source.slice(geometryStart, geometryEnd);
const owner = 'var topGlassRuntime = null;\n' + geometry + source.slice(ownerStart, ownerEnd);

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.attributes = {}; this.dataset = {}; this.className = ''; this.isConnected = true;
    this.box = { width: 148, height: 48 }; this.radius = '24px';
    const values = new Map();
    this.style = { values, setProperty(name, value) { values.set(name, value); }, removeProperty(name) { values.delete(name); } };
  }
  get classList() {
    const node = this;
    function values() { return new Set(node.className.split(/\s+/).filter(Boolean)); }
    function apply(callback) { const set = values(); callback(set); node.className = [...set].join(' '); }
    return {
      add(...names) { apply(set => names.forEach(name => set.add(name))); },
      remove(...names) { apply(set => names.forEach(name => set.delete(name))); },
      toggle(name, on) { apply(set => on ? set.add(name) : set.delete(name)); },
      contains(name) { return values().has(name); }
    };
  }
  appendChild(child) { child.parentNode = this; child.isConnected = this.isConnected; this.children.push(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; this.isConnected = false; }
  querySelector(selector) {
    const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.attributes.id === selector.slice(1);
    for (const child of this.children) { if (matches(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
    return null;
  }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.attributes.id === selector.slice(1);
    const results = [];
    for (const child of this.children) { if (matches(child)) results.push(child); results.push(...child.querySelectorAll(selector)); }
    return results;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  getBoundingClientRect() { return this.box; }
}
function harness({ userAgent = 'Mozilla/5.0 Chrome/143.0.0.0', supports = true, contextAvailable = true, resizeObserverAvailable = true } = {}) {
  const frames = new Map(), observers = [], canvases = [], fontCallbacks = [], listeners = new Map();
  let frameSequence = 0, frameRequests = 0;
  const body = new Node('body'), button = new Node('button');
  button.className = 'md-top'; button.label = 'Back to top'; body.appendChild(button);
  // A search filter sentinel catches accidental removal or identifier reuse.
  const searchFilter = new Node('filter'); searchFilter.setAttribute('id', 'edwinos-search-refraction'); body.appendChild(searchFilter);
  const document = {
    body, button,
    fonts: { ready: { then(callback) { fontCallbacks.push(callback); } } },
    querySelector(selector) { assert.equal(selector, '[data-md-component="top"]'); return this.button; },
    createElement(tag) {
      const element = new Node(tag);
      if (tag === 'canvas') {
        canvases.push(element); element.puts = []; element.encodes = 0;
        const context = {
          createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
          putImageData(pixels) { element.puts.push(pixels); }
        };
        element.getContext = type => { assert.equal(type, '2d'); return contextAvailable ? context : null; };
        element.toDataURL = type => { assert.equal(type, 'image/png'); element.encodes++; return 'data:image/png;base64,test' + element.encodes; };
      }
      return element;
    },
    createElementNS(_namespace, tag) { return new Node(tag); }
  };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.target = null; this.disconnects = 0; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.target = null; this.disconnects++; }
    deliver() { this.callback(); }
  }
  const window = {
    navigator: { userAgent }, CSS: { supports() { return supports; } },
    SVGFEImageElement: class {}, SVGFEDisplacementMapElement: class {},
    getComputedStyle(node) { return { borderTopLeftRadius: node.radius }; },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    requestAnimationFrame(callback) { const id = ++frameSequence; frameRequests++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() { assert.fail('top optics must not create an idle timer'); },
    requestIdleCallback() { assert.fail('top optics must not create an idle loop'); }
  };
  if (resizeObserverAvailable) window.ResizeObserver = ResizeObserver;
  const context = vm.createContext({ window, document }); vm.runInContext(owner, context);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  const emit = type => { for (const callback of listeners.get(type) || []) callback(); };
  return { button, document, body, window, searchFilter, frames, observers, canvases, fontCallbacks, listeners,
    setup() { vm.runInContext('setupTopGlass()', context); }, flush, emit,
    get frameRequests() { return frameRequests; } };
}

// Neutral center and directional perimeter bending are checked on the real map.
{
  const context = vm.createContext({}); vm.runInContext(geometry, context);
  const pixels = { width: 132, height: 72, data: new Uint8ClampedArray(132 * 72 * 4) };
  context.pixels = pixels; vm.runInContext('fillRoundedGlassDisplacementMap(pixels, 100, 40, 16, 20)', context);
  const sample = (x, y) => [...pixels.data.slice(((y + 16) * pixels.width + x + 16) * 4, ((y + 16) * pixels.width + x + 16) * 4 + 4)];
  for (let y = 15; y < 25; y++) for (let x = 25; x < 75; x++) assert.deepEqual(sample(x, y), [128, 128, 128, 255], 'center blur has no geometric displacement');
  assert(sample(0, 20)[0] < 128, 'left rim bends outward');
  assert(sample(99, 20)[0] > 128, 'right rim bends outward');
  assert(sample(50, 0)[1] < 128, 'top rim bends outward');
  assert(sample(50, 39)[1] > 128, 'bottom rim bends outward');
  assert(sample(7, 20)[0] > sample(0, 20)[0], 'rim smoothly returns toward neutral');
  for (let i = 0; i < pixels.data.length; i += 4) { assert.equal(pixels.data[i + 2], 128); assert.equal(pixels.data[i + 3], 255); }
}

// Build only on geometry changes, with no scroll listener or self-scheduling frames.
{
  const h = harness(); h.setup();
  assert.equal(h.button.dataset.edwinosTopMode, 'refraction');
  assert.equal(h.frames.size, 1); h.flush();
  assert.equal(h.button.dataset.edwinosTopMapBuilds, '1'); assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].encodes, 1);
  assert.deepEqual([...h.listeners.keys()], ['resize'], 'optics never subscribe to scroll');
  assert.equal(h.observers[0].target, h.button);
  assert.equal(h.button.label, 'Back to top', 'accessible control text survives decoration');
  assert.equal(h.button.children.length, 1, 'only the border highlight is a decorative child');
  assert(h.button.children[0].classList.contains('edwinos-top-glass__highlight'));
  for (const layer of h.button.children) assert.equal(layer.attributes['aria-hidden'], 'true');
  const filter = h.body.querySelector('#edwinos-top-refraction');
  assert(filter); assert.equal(filter.attributes.filterUnits, 'userSpaceOnUse');
  assert.equal(filter.children.length, 3);
  const [mapImage, blur, displacement] = filter.children;
  assert.equal(mapImage.tagName, 'FEIMAGE');
  assert.equal(blur.tagName, 'FEGAUSSIANBLUR');
  assert.equal(blur.attributes.in, 'SourceGraphic');
  assert.equal(blur.attributes.stdDeviation, '4');
  assert.equal(displacement.tagName, 'FEDISPLACEMENTMAP');
  assert.equal(displacement.attributes.in, blur.attributes.result, 'displace the uniformly blurred page');
  assert.equal(displacement.attributes.in2, mapImage.attributes.result, 'the independent geometry map supplies displacement');
  assert.equal(displacement.attributes.scale, '22');
  assert.equal(displacement.attributes.xChannelSelector, 'R'); assert.equal(displacement.attributes.yChannelSelector, 'G');
  for (const node of [filter, mapImage]) {
    assert.equal(node.attributes.x, '-16'); assert.equal(node.attributes.y, '-16');
    assert.equal(node.attributes.width, '180'); assert.equal(node.attributes.height, '80');
  }
  assert.equal(h.canvases[0].width, 270); assert.equal(h.canvases[0].height, 120, 'map samples at 1.5 times padded geometry');
  assert.equal(h.body.querySelector('#edwinos-search-refraction'), h.searchFilter, 'search filter has a separate identity');
  h.setup(); assert.equal(h.canvases.length, 1); assert.equal(h.frames.size, 0);
  h.observers[0].deliver(); h.emit('resize'); h.fontCallbacks[0]();
  assert.equal(h.frames.size, 1, 'resize/font notifications coalesce'); h.flush();
  assert.equal(h.canvases[0].encodes, 1, 'unchanged geometry is not rebuilt');
  h.button.box = { width: 166, height: 48 };
  h.observers[0].deliver(); h.emit('resize'); h.flush();
  assert.equal(h.button.dataset.edwinosTopMapBuilds, '2'); assert.equal(h.frames.size, 0);
  const requests = h.frameRequests;
  for (let i = 0; i < 20; i++) h.emit('scroll');
  assert.equal(h.frameRequests, requests, 'scrolling never schedules optical work');
  h.button.box = { width: 0, height: 0 }; h.observers[0].deliver(); h.flush();
  assert.equal(h.canvases[0].encodes, 2, 'display:none geometry does not build a map');
  h.button.box = { width: 166, height: 48 }; h.observers[0].deliver(); h.flush();
  assert.equal(h.canvases[0].encodes, 2, 'redisplay can reuse the unchanged map');
  h.button.box = { width: 166, height: 54 }; h.observers[0].deliver(); h.flush();
  assert.equal(h.button.dataset.edwinosTopMapBuilds, '3', 'redisplay with changed geometry builds once');
}

// Migration removes all old backdrop children instead of stacking a second optical owner.
{
  const h = harness();
  const oldSurface = new Node('span'); oldSurface.className = 'edwinos-top-glass__surface';
  const duplicate = new Node('span'); duplicate.className = 'edwinos-top-glass__surface';
  h.button.appendChild(oldSurface); h.button.appendChild(duplicate);
  h.setup(); h.flush();
  assert.equal(oldSurface.isConnected, false); assert.equal(duplicate.isConnected, false);
  assert.equal(h.button.querySelectorAll('.edwinos-top-glass__surface').length, 0);
  assert.equal(h.button.children.length, 1);
}

// Initially hidden controls build on their first nonzero ResizeObserver layout.
{
  const h = harness(); h.button.box = { width: 0, height: 0 }; h.setup(); h.flush();
  assert.equal(h.canvases[0].encodes, 0);
  h.button.box = { width: 148, height: 48 }; h.observers[0].deliver(); h.flush();
  assert.equal(h.canvases[0].encodes, 1);
}

// Replacement disposes only its own filter/layers/listener; stale callbacks cannot rebuild.
{
  const h = harness(); h.setup(); h.flush();
  const oldButton = h.button, oldObserver = h.observers[0], oldFont = h.fontCallbacks[0];
  oldObserver.deliver(); const staleFrame = [...h.frames.values()][0];
  const replacement = new Node('button'); replacement.className = 'md-top'; h.body.appendChild(replacement);
  h.document.button = replacement; h.setup();
  assert.equal(oldObserver.disconnects, 1); assert.equal(oldButton.children.length, 0);
  assert.equal(oldButton.className, 'md-top'); assert.equal(oldButton.dataset.edwinosTopMode, undefined);
  assert.equal(oldButton.style.values.has('--edwinos-top-radius'), false);
  assert.equal(h.listeners.get('resize').size, 1);
  staleFrame(); oldObserver.deliver(); oldFont(); h.flush();
  assert.equal(h.canvases[0].encodes, 1); assert.equal(h.canvases[1].encodes, 1);
  assert.equal(h.body.querySelector('#edwinos-search-refraction'), h.searchFilter);
  h.document.button = null; h.setup();
  assert.equal(h.observers[1].disconnects, 1); assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.get('resize').size, 0);
  assert.equal(h.body.querySelector('#edwinos-top-refraction'), null);
  assert.equal(replacement.children.length, 0);
}

// Safari and unsupported/canvas-less engines keep the native-blur control, without optics work.
for (const options of [
  { userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15' },
  { supports: false }, { contextAvailable: false }
]) {
  const h = harness(options); h.setup(); h.flush();
  assert.equal(h.button.dataset.edwinosTopMode, 'native-blur');
  assert.equal(h.button.classList.contains('edwinos-top-refraction'), false);
  assert.equal(h.button.children.length, 1);
  assert.equal(h.frames.size, 0); assert.equal(h.observers.length, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.body.querySelector('#edwinos-top-refraction'), null);
  assert(h.canvases.every(canvas => canvas.encodes === 0));
  h.document.button = null; h.setup(); assert.equal(h.button.children.length, 0);
}

// Material animates the control's opacity. A backdrop child would sample only
// that isolated parent rather than the page; the button must own both paths.
const css = fs.readFileSync(path.join(__dirname, '../docs/stylesheets/edwinos.css'), 'utf8');
const baseStyle = css.match(/\.md-top\.edwinos-top-glass\s*\{([^}]+)\}/)?.[1];
assert(baseStyle, 'the back-to-top control has a single component owner');
assert.match(baseStyle, /(?:^|[;\n])\s*-webkit-backdrop-filter\s*:\s*blur\(/, 'Safari samples the backdrop on the control itself');
assert.match(baseStyle, /(?:^|[;\n])\s*backdrop-filter\s*:\s*blur\(/, 'native blur belongs to the control itself');
const refractionStyle = css.match(/\.md-top\.edwinos-top-refraction\s*\{([^}]+)\}/)?.[1];
assert(refractionStyle, 'Chromium refraction is attached directly to the control');
assert.match(refractionStyle, /backdrop-filter\s*:[^;]*url\(#edwinos-top-refraction\)/);
for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (/edwinos-top-glass__(?:highlight|surface)/.test(rule[1])) {
    assert(!/(?:^|[;\n])\s*(?:-webkit-)?backdrop-filter\s*:/.test(rule[2]),
      'decorative children must never own page backdrop sampling');
  }
}
console.log('Back-to-top glass: shared geometry, layout-only rebuilds, disposal, independent filter and Safari fallback checks passed.');
