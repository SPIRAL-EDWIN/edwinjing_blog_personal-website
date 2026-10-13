#!/usr/bin/env node
'use strict';
// Exercise the actual owners with deterministic content and network completion.
// Browser QA verifies Material history/XHR ordering and rendered geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const previewSource = fs.readFileSync(require('node:path').join(__dirname, '../overrides/partials/image-previews.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const documentEvents = new Map();
const source = fs.readFileSync(require('node:path').join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const owner = source.slice(source.indexOf('  function navigationDocumentKey('), source.indexOf('  function classifyUiRoute('));
const keyOwner = source.slice(source.indexOf('  function navigationPageKey('), source.indexOf('  function primarySidebarIsDesktop('));
class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag; this.attrs = {...attrs}; this.children = []; this.parentNode = null;
    this.className = ''; this.hidden = false; this.textContent = ''; this.listeners = {};
    this.isConnected = true; this.dataset = {};
    const styles = new Map();
    this.style = {setProperty(name, value) { styles.set(name, value); }, removeProperty(name) { styles.delete(name); }, getPropertyValue(name) { return styles.get(name) || ''; }};
    this.classList = {add: (...tokens) => {this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...tokens])].join(' ');},
      remove: (...tokens) => {this.className = this.className.split(' ').filter(token => !tokens.includes(token)).join(' ');},
      contains: token => this.className.split(' ').includes(token), toggle: (token, active) => active ? this.classList.add(token) : this.classList.remove(token)};
  }
  get id() {return this.attrs.id;} set id(value) {this.attrs.id = value;}
  get target() {return this.attrs.target;}
  get nextSibling() {return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null;}
  hasAttribute(key) {return Object.hasOwn(this.attrs, key);}
  getAttribute(key) {return this.attrs[key] ?? null;}
  setAttribute(key, value) {this.attrs[key] = value;}
  removeAttribute(key) {delete this.attrs[key];}
  appendChild(node) {node.parentNode = this; this.children.push(node); return node;}
  insertBefore(node, next) {node.parentNode = this; const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, node);}
  remove() {if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.isConnected = false;}
  matches(selectors) {return selectors.split(',').some(selector => {
    const tag = selector.trim().match(/^[a-z]+/i)?.[0];
    return (!tag || this.tagName === tag) && [...selector.matchAll(/\.([\w-]+)/g)].every(([,name]) => this.classList.contains(name)) && [...selector.matchAll(/\[([\w-]+)\]/g)].every(([,name]) => this.hasAttribute(name));
  });}
  closest(selector) {return this.matches(selector) ? this : this.parentNode?.closest(selector) || null;}
  querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  addEventListener(type, listener) {(this.listeners[type] ||= []).push(listener);}
  fire(type) {
    for (const listener of this.listeners[type] || []) listener({target: this});
    for (const listener of documentEvents.get(type) || []) listener({target: this});
  }
  getBoundingClientRect() {return {bottom: 72};}
}
let layoutReads = 0; let headerBottom = 72;
const body = new Element('body');
const header = body.appendChild(new Element('header')); header.className = 'md-header';
header.getBoundingClientRect = () => { layoutReads++; return {bottom: headerBottom}; };
const document = {body, createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector), getElementById: id => body.querySelectorAll('[id]').find(node => node.id === id), addEventListener(type, handler) {if (!documentEvents.has(type)) documentEvents.set(type, []); documentEvents.get(type).push(handler);}};
const timers = new Map(); let nextTimer = 0; let now = 0;
const location = {href: 'https://test.local/A/', origin: 'https://test.local', replace: href => location.replaced = href, assign: href => location.assigned = href};
const window = {location, navigator: {userAgent: 'Safari'}, setTimeout: (callback, delay) => {timers.set(++nextTimer, {callback, deadline: now + delay}); return nextTimer;}, clearTimeout: timer => timers.delete(timer), addEventListener() {}, removeEventListener() {}, cancelAnimationFrame() {}};
const pdfVisibilityObservers = [];
window.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; this.disconnects = 0; pdfVisibilityObservers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.target = null; this.disconnects++; }
  enter() { this.callback([{isIntersecting: true}]); }
};
const context = vm.createContext({document, window, URL, Promise, WeakSet, WeakMap});
vm.runInContext(previewSource, context);
vm.runInContext(`var navigationFeedbackDelayTimer = null, navigationGlassRuntime = null, archiveNavigationFallbackTimer = null, activeArchiveNavigation = null, archiveNavigationFeedbackReady = false, mountedNavigationContent = null, mountedNavigationHref = window.location.href, navigationLabels = Object.create(null), pdfViewers = new WeakMap(), activePdfViewers = [];\n${keyOwner}\n${owner}`, context);
function content(name) {const root = new Element(); root.className = 'md-content__inner'; const title = root.appendChild(new Element('h1')); title.textContent = name; return root;}
function link(root, href, text = href) {const anchor = root.appendChild(new Element('a', {href})); anchor.textContent = text; return anchor;}
function click(anchor, extra = {}) {context.beginArchiveNavigationFeedback({target: anchor, button: 0, defaultPrevented: false, ...extra});}
function timeout(ms = 10000) {
  now += ms;
  const pending = [...timers.entries()].filter(([,timer]) => timer.deadline <= now).sort((a, b) => a[1].deadline - b[1].deadline);
  for (const [id, timer] of pending) {if (timers.delete(id)) timer.callback();}
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const first = body.appendChild(content('A')); context.finishArchiveNavigationFeedback();
  location.href = 'https://test.local/A/#section';
  const toB = link(first, '/B/'), toC = link(first, '/C/');
  click(toB); assert(context.activeArchiveNavigation);
  assert(!body.classList.contains('is-page-navigating'), 'fast click has no body styling');
  assert.equal(layoutReads, 0, 'fast click does not force header layout'); assert.equal(toB.getAttribute('aria-busy'), 'true');
  assert(!document.getElementById('page-navigation-feedback'), 'fast requests never flash toast');
  timeout(1999); assert(!document.getElementById('page-navigation-feedback'));
  timeout(1); assert(document.getElementById('page-navigation-feedback'), 'toast appears only after 2s');
  assert.equal(layoutReads, 1, 'geometry is deferred until feedback is visible');
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '72px');
  location.href = 'https://test.local/B/'; context.finishArchiveNavigationFeedback();
  assert(body.classList.contains('is-page-navigating'), 'URL changes do not finish the wait');
  timeout(7999); assert.equal(body.querySelector('.page-navigation-feedback__recovery').hidden, true, 'recovery waits until 10s');
  timeout(1); assert.equal(body.querySelector('.page-navigation-feedback__recovery').hidden, false);
  click(toC); location.href = 'https://test.local/C/';
  assert.equal(toB.getAttribute('aria-busy'), null, 'rapid clicks retire previous links');
  assert.equal(context.activeArchiveNavigation.sourceHref, 'https://test.local/A/#section');
  assert(!document.getElementById('page-navigation-feedback'), 'rapid target replaces the prior surface immediately');
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '', 'rapid target retires former header measurement');
  timeout(1999); assert(!document.getElementById('page-navigation-feedback'), 'new target receives its own 2s delay');
  timeout(1); assert(body.querySelector('.page-navigation-feedback__message').textContent.includes('/C/'));
  context.cancelArchiveNavigation(); assert.equal(location.replaced, 'https://test.local/A/#section', 'cancel restores displayed source, not intermediate URL B');
  context.pageNavigationForHistory(); assert(context.activeArchiveNavigation, 'history requests re-enter waiting');
  first.remove(); const next = body.appendChild(content('C')); context.finishArchiveNavigationFeedback();
  assert(!body.classList.contains('is-page-navigating')); assert.equal(context.mountedNavigationHref, location.href);
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '', 'content completion removes inline header position');
  headerBottom = 56; const readsBeforeFastHistory = layoutReads;
  timeout(10000); assert(!document.getElementById('page-navigation-feedback'), 'finish retires delayed timers');
  location.href = 'https://test.local/B/'; context.pageNavigationForHistory(); assert(context.activeArchiveNavigation);
  assert.equal(layoutReads, readsBeforeFastHistory, 'fast history after resize performs no measurement');
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '', 'fast navigation cannot retain stale viewport height');
  location.href = 'https://test.local/C/'; context.pageNavigationForHistory(); assert(!body.classList.contains('is-page-navigating'));
  timeout(10000); assert(!document.getElementById('page-navigation-feedback'), 'return history prevents late toast');
  for (const [href, extra, attrs] of [['/C/?q=test#title', {}, {}], ['/C/#title', {}, {}], ['/file.pdf', {}, {}], ['https://elsewhere.local/X', {}, {}], ['/B/', {ctrlKey: true}, {}], ['/B/', {button: 1}, {}], ['/B/', {}, {download: ''}], ['/B/', {}, {target: '_blank'}]]) {
    const anchor = link(next, href); Object.assign(anchor.attrs, attrs); click(anchor, extra); assert(!context.activeArchiveNavigation, `native link semantics: ${href}`);
  }
  location.href = 'https://test.local/C/?q=test#section'; context.pageNavigationForHistory(); assert(!context.activeArchiveNavigation, 'same-path query history has no content request');
  location.href = 'https://test.local/C/';
  const search = next.appendChild(new Element()); search.className = 'md-search__result'; click(link(search, '/B/')); assert(!context.activeArchiveNavigation);
  const archive = link(next, '/B/'); archive.className = 'archive-card__link'; click(archive); assert(body.classList.contains('is-archive-navigating')); assert(!document.getElementById('page-navigation-feedback')); timeout(); assert(document.getElementById('archive-navigation-help')); context.clearArchiveNavigationFeedback();
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '', 'Archive cancellation removes inline header position');
  headerBottom = 72; const readsBeforeFastClick = layoutReads; click(link(next, '/B/'));
  assert.equal(layoutReads, readsBeforeFastClick, 'fast click after Archive/resize remains layout-free');
  assert.equal(body.style.getPropertyValue('--edwinos-navigation-top'), '', 'post-Archive fast click uses CSS viewport geometry');
  context.clearArchiveNavigationFeedback();
  const shell = next.appendChild(new Element('div', {'data-progressive-image': ''})); const image = shell.appendChild(new Element('img', {'data-progressive-full': ''}));
  image.complete = true; image.naturalWidth = 100; let decodes = 0; image.decode = () => {decodes++; return Promise.resolve();};
  image.fire('load'); await settle(); assert(shell.classList.contains('is-ready'), 'head capture retires the preview before UI startup');
  context.setupProgressiveImages(); await settle(); assert.equal(decodes, 1, 'instant/startup refresh reuses the same prepared image owner');
  image.fire('error'); assert(shell.classList.contains('is-error')); image.fire('load'); await settle(); assert(shell.classList.contains('is-ready'), 'subsequent success recovers error');
  const lateShell = next.appendChild(new Element('div', {'data-progressive-image': ''})); const late = lateShell.appendChild(new Element('img', {'data-progressive-full': ''}));
  late.complete = true; late.naturalWidth = 100; let decode; late.decode = () => new Promise(resolve => decode = resolve);
  context.setupProgressiveImages(); lateShell.isConnected = false; decode(); await settle(); assert(!lateShell.classList.contains('is-ready'), 'late decode cannot mutate detached page');
  const pdf = next.appendChild(new Element('div', {'data-pdf-viewer': ''})); const toolbar = pdf.appendChild(new Element());
  const open = toolbar.appendChild(new Element('button', {'data-pdf-open': ''})); const status = toolbar.appendChild(new Element('p', {'data-pdf-status': ''})); status.hidden = true;
  const iframe = pdf.appendChild(new Element('iframe', {'data-src': '/source.pdf'})); iframe.hidden = true;
  context.setupPdfViewers(); context.setupPdfViewers(); assert.equal(iframe.getAttribute('src'), null, 'PDF has no request before intent');
  assert.equal(open.listeners.click.length, 1, 'instant startup stays idempotent');
  assert.equal(pdfVisibilityObservers.length, 1, 'repeated page enhancement retains one PDF observer');
  assert.equal(open.dataset.edwinosPdfMode, undefined, 'offscreen PDF performs no optics initialization');
  pdfVisibilityObservers[0].enter();
  assert.equal(open.dataset.edwinosPdfMode, 'native-blur');
  context.setupPdfViewers(); assert.equal(pdfVisibilityObservers.length, 1, 'visible PDF remains idempotent');
  iframe.fire('load'); assert(status.hidden, 'about:blank load does not start viewer');
  open.fire('click'); assert.equal(open.dataset.edwinosPdfMode, undefined, 'hidden PDF button disposes optics');
  assert.equal(iframe.getAttribute('src'), '/source.pdf'); assert.equal(iframe.hidden, false);
  iframe.fire('load'); assert(status.textContent.includes('可能仍在加载'), 'iframe load never promises a rendered first page');
  timeout(); assert(pdf.classList.contains('is-pdf-slow')); assert.equal(toolbar.children.find(n => Object.hasOwn(n.dataset, 'pdfRetry')).hidden, false);
  iframe.fire('error'); assert(pdf.classList.contains('is-pdf-error'));
  toolbar.children.find(n => Object.hasOwn(n.dataset, 'pdfRetry')).fire('click'); assert(!pdf.classList.contains('is-pdf-error'));
  pdf.isConnected = false; context.setupPdfViewers(); assert.equal(timers.size, 0, 'navigation disposes PDF recovery timer');
  console.log('navigation/media lifecycle: passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
