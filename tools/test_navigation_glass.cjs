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
const ownerStart = source.indexOf('  function setupLayoutControlGlass(');
const ownerEnd = source.indexOf('  function showPageNavigationFeedback(', ownerStart);
assert(geometryStart >= 0 && geometryEnd > geometryStart && ownerStart >= 0 && ownerEnd > ownerStart);
const geometry = source.slice(geometryStart, geometryEnd);
const owner = 'var runtime = null;\n' + geometry + source.slice(ownerStart, ownerEnd);

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
  const frames = new Map(), observers = [], intersections = [], mutations = [], canvases = [], fontCallbacks = [], listeners = new Map();
  let frameSequence = 0, frameRequests = 0;
  const body = new Node('body'), button = new Node('button');
  button.className = 'md-top'; button.label = 'Opening next article'; body.appendChild(button);
  // A search filter sentinel catches accidental removal or identifier reuse.
  const searchFilter = new Node('filter'); searchFilter.setAttribute('id', 'edwinos-search-refraction'); body.appendChild(searchFilter);
  const topFilter = new Node('filter'); topFilter.setAttribute('id', 'edwinos-top-refraction'); body.appendChild(topFilter);
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
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.disconnects = 0; intersections.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.target = null; this.disconnects++; }
    enter() { this.callback([{isIntersecting: true}]); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.disconnects = 0; mutations.push(this); }
    observe(target, options) { this.target = target; assert.deepEqual([...options.attributeFilter], ['hidden']); }
    disconnect() { this.target = null; this.disconnects++; }
    deliver() { this.callback(); }
  }
  const window = {
    IntersectionObserver, MutationObserver,
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
  return { button, document, body, window, searchFilter, topFilter, frames, observers, intersections, mutations, canvases, fontCallbacks, listeners,
    setupPdf(button) { context.pdfButton = button; return vm.runInContext("setupPdfButtonGlass(pdfButton)", context); },
    setup() { vm.runInContext('runtime = setupNavigationFeedbackGlass(document.button)', context); }, destroy() {vm.runInContext('runtime.destroy()', context);}, flush, emit,
    get frameRequests() { return frameRequests; } };
}

// This independent surface borrows only the map generator and optical tuning.
{
  const h = harness(); h.setup(); h.flush();
  assert.equal(h.button.dataset.edwinosNavigationMode, 'refraction');
  assert.equal(h.button.dataset.edwinosNavigationMapBuilds, '1');
  assert.equal(h.frames.size, 0, 'there is no idle animation loop');
  assert.deepEqual([...h.listeners.keys()], ['resize'], 'there is no scroll optics listener');
  const filter = h.body.querySelector('#edwinos-navigation-refraction');
  assert(filter); assert.equal(filter.children[1].attributes.stdDeviation, '4');
  assert.equal(filter.children[2].attributes.scale, '22');
  assert.equal(filter.children[2].attributes.in2, 'edwinos-navigation-map');
  assert.equal(h.body.querySelector('#edwinos-top-refraction'), h.topFilter);
  assert.equal(h.body.querySelector('#edwinos-search-refraction'), h.searchFilter);
  assert.equal(h.button.label, 'Opening next article');
  assert.equal(h.button.children.length, 1);
  assert.equal(h.button.children[0].attributes['aria-hidden'], 'true');
  h.observers[0].deliver(); h.fontCallbacks[0](); h.emit('resize'); h.flush();
  assert.equal(h.canvases[0].encodes, 1, 'unchanged layout reuses the map');
  h.button.box = {width: 350, height: 120}; h.observers[0].deliver(); h.flush();
  assert.equal(h.canvases[0].encodes, 2, '10s recovery controls resize the surface once');
  const requests = h.frameRequests; h.emit('scroll');
  assert.equal(h.frameRequests, requests);
  h.observers[0].deliver(); const staleFrame = [...h.frames.values()][0];
  h.destroy(); staleFrame(); h.fontCallbacks[0](); h.flush();
  assert.equal(h.canvases[0].encodes, 2, 'cancel/disposal prevents stale optical work');
  assert.equal(h.body.querySelector('#edwinos-navigation-refraction'), null);
  assert.equal(h.body.querySelector('#edwinos-top-refraction'), h.topFilter);
  assert.equal(h.body.querySelector('#edwinos-search-refraction'), h.searchFilter);
  assert.equal(h.observers[0].disconnects, 1); assert.equal(h.listeners.get('resize').size, 0);
  assert.equal(h.button.children.length, 0);
}
for (const options of [{userAgent: 'Safari'}, {supports: false}, {contextAvailable: false}]) {
  const h = harness(options); h.setup(); h.flush();
  assert.equal(h.button.dataset.edwinosNavigationMode, 'native-blur');
  assert.equal(h.frames.size, 0); assert.equal(h.observers.length, 0);
  assert.equal(h.body.querySelector('#edwinos-navigation-refraction'), null);
  h.destroy(); assert.equal(h.button.children.length, 0);
}
// The article control shares optics, with independent identifiers and intent.
{
  const h = harness(); h.setup(); h.flush();
  const pdf = h.body.appendChild(new Node('button')); pdf.hidden = false;
  const runtime = h.setupPdf(pdf);
  assert.equal(h.canvases.length, 1, 'offscreen PDF does no optical work');
  assert.equal(h.intersections.length, 1);
  h.intersections[0].enter(); h.flush();
  assert.equal(pdf.dataset.edwinosPdfMode, 'refraction');
  assert.equal(pdf.dataset.edwinosPdfMapBuilds, '1');
  const firstFilter = h.body.querySelector('#edwinos-pdf-refraction-1');
  assert(firstFilter); assert.equal(pdf.style.values.get('--edwinos-pdf-filter'), 'url(#edwinos-pdf-refraction-1)');
  assert.equal(firstFilter.children[1].attributes.stdDeviation, '4');
  assert.equal(firstFilter.children[2].attributes.scale, '22');
  assert.equal(firstFilter.children[2].attributes.in2, 'edwinos-pdf-map');
  h.intersections[0].enter(); h.flush();
  assert.equal(h.canvases.length, 2, 'repeated visibility notifications retain one surface');
  const requests = h.frameRequests; h.emit('scroll'); assert.equal(h.frameRequests, requests);
  const secondPdf = h.body.appendChild(new Node('button')); secondPdf.hidden = false;
  const secondRuntime = h.setupPdf(secondPdf); h.intersections[1].enter(); h.flush();
  assert(h.body.querySelector('#edwinos-pdf-refraction-2'), 'multiple viewers have unique filters');
  pdf.hidden = true; h.mutations[0].deliver(); h.flush();
  assert.equal(h.body.querySelector('#edwinos-pdf-refraction-1'), null);
  assert.equal(pdf.style.values.has('--edwinos-pdf-filter'), false);
  assert(h.body.querySelector('#edwinos-navigation-refraction'));
  assert.equal(h.body.querySelector('#edwinos-top-refraction'), h.topFilter);
  assert.equal(h.body.querySelector('#edwinos-search-refraction'), h.searchFilter);
  secondPdf.isConnected = false; secondRuntime.destroy(); h.flush();
  assert.equal(h.body.querySelector('#edwinos-pdf-refraction-2'), null);
  const encodes = h.canvases.map(canvas => canvas.encodes);
  h.fontCallbacks.forEach(callback => callback()); h.flush();
  assert.deepEqual(h.canvases.map(canvas => canvas.encodes), encodes, 'leaving article prevents stale font callbacks');
  runtime.destroy(); h.destroy();
}
console.log('Navigation/PDF glass: independent layout-only optics, lazy initialization and disposal passed');
