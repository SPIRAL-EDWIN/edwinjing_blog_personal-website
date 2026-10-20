#!/usr/bin/env node
'use strict';
// Exercise the production drawer tree against native checkbox/label/nav nodes.
// Browser QA remains responsible for CSS expansion, focus visibility and optics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
function eventTarget(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, fn, capture = false) => {
    const key = type + ':' + !!(capture && (capture === true || capture.capture));
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  };
  target.removeEventListener = (type, fn, capture = false) => listeners.get(type + ':' + !!(capture && (capture === true || capture.capture)))?.delete(fn);
  target.listenerCount = type => [...listeners].filter(([key]) => key.startsWith(type + ':')).reduce((n, [, set]) => n + set.size, 0);
  target.deliver = (type, event, capture) => {
    for (const fn of [...(listeners.get(type + ':' + capture) || [])]) { fn(event); if (event.immediate) break; }
  };
  return target;
}
class Element {
  constructor(tag, classes = '', attrs = {}) {
    eventTarget(this); this.tagName = tag.toUpperCase(); this.nodeType = 1; this.className = classes;
    this.attrs = {...attrs}; this.children = []; this.parentNode = null; this.dataset = {};
    this.checked = false; this.disabled = false; this.inert = false; this.isConnected = true;
    this.style = {}; this.hidden = false;
  }
  get id() { return this.attrs.id || ''; } set id(value) { this.attrs.id = value; }
  get parentElement() { return this.parentNode; }
  get inert() { return this.hasAttribute('inert'); } set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get classList() {
    const update = fn => { const values = new Set(this.className.split(/\s+/).filter(Boolean)); fn(values); this.className = [...values].join(' '); };
    return {contains: name => this.className.split(/\s+/).includes(name), add: (...names) => update(values => names.forEach(n => values.add(n))),
      remove: (...names) => update(values => names.forEach(n => values.delete(n))), toggle: (name, on) => update(values => on ? values.add(name) : values.delete(name))};
  }
  appendChild(node) { node.parentNode = this; node.ownerDocument = this.ownerDocument; this.children.push(node); return node; }
  removeChild(node) { const index = this.children.indexOf(node); if (index >= 0) this.children.splice(index, 1); node.parentNode = null; return node; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  matches(selector) {
    return selector.split(',').some(branch => {
      branch = branch.trim();
      if (branch.includes(':not(')) { const match = branch.match(/:not\(([^)]+)\)/); if (this.matches(match[1])) return false; branch = branch.replace(match[0], ''); }
      const tag = branch.match(/^[\w-]+/)?.[0];
      if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      if ([...branch.matchAll(/\.([\w-]+)/g)].some(([, name]) => !this.classList.contains(name))) return false;
      if ([...branch.matchAll(/#([\w-]+)/g)].some(([, id]) => this.id !== id)) return false;
      return [...branch.matchAll(/\[([\w-]+)(?:([\^$*]?=)["']?([^\]"']*)["']?)?\]/g)].every(([, name, op, value]) => {
        const attr = this.getAttribute(name);
        if (attr === null) return false;
        return !op || (op === '=' ? attr === value : op === '^=' ? attr.startsWith(value) : op === '$=' ? attr.endsWith(value) : attr.includes(value));
      });
    });
  }
  querySelectorAll(selector) {
    const branches = selector.split(',').map(branch => branch.trim().replace(/>/g, ' > ').split(/\s+/));
    const chain = (node, parts, index = parts.length - 1) => {
      if (!node || (parts[index] === ':scope' ? node !== this : !node.matches(parts[index]))) return false;
      if (index === 0) return true;
      if (parts[index - 1] === '>') return chain(node.parentNode, parts, index - 2);
      for (let parent = node.parentNode; parent; parent = parent.parentNode) if (chain(parent, parts, index - 1)) return true;
      return false;
    };
    const result = [];
    const visit = node => node.children.forEach(child => { if (branches.some(parts => chain(child, parts))) result.push(child); visit(child); });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  getClientRects() { return this.hidden || this.closest('[inert]') ? [] : [{}]; }
  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= function () { this.defaultPrevented = true; };
    event.stopPropagation ||= function () { this.stopped = true; };
    event.stopImmediatePropagation ||= function () { this.stopped = this.immediate = true; };
    const ancestry = []; for (let node = this; node; node = node.parentNode) ancestry.push(node);
    for (const node of [...ancestry].reverse()) { node.deliver(event.type, event, true); if (event.stopped) return !event.defaultPrevented; }
    for (const node of ancestry) { node.deliver(event.type, event, false); if (event.stopped || event.bubbles === false) break; }
    return !event.defaultPrevented;
  }
}
function harness({desktop = false, section = 'enotes'} = {}) {
  const document = {activeElement: null};
  const body = new Element('body'); body.ownerDocument = document;
  const root = body.appendChild(new Element('nav', 'md-nav edwinos-drawer-section-nav'));
  const title = root.appendChild(new Element('label', 'md-nav__title edwinos-drawer-section-title'));
  const list = root.appendChild(new Element('ul', 'md-nav__list'));
  const leaf = (listNode, name) => listNode.appendChild(new Element('li', 'md-nav__item')).appendChild(new Element('a', 'md-nav__link', {href: '/' + name + '/'}));
  const folder = (listNode, id, checked = false) => {
    const item = listNode.appendChild(new Element('li', 'md-nav__item md-nav__item--nested md-nav__item--section'));
    const toggle = item.appendChild(new Element('input', 'md-nav__toggle', {type: 'checkbox', id})); toggle.checked = checked;
    const label = item.appendChild(new Element('label', 'md-nav__link', {for: id, id: id + '_label', tabindex: ''}));
    label.appendChild(new Element('span', 'md-ellipsis'));
    label.appendChild(new Element('span', 'md-nav__icon md-icon'));
    const nav = item.appendChild(new Element('nav', 'md-nav', {'aria-labelledby': id + '_label', 'aria-expanded': String(checked)}));
    nav.appendChild(new Element('label', 'md-nav__title', {for: id}));
    const list = nav.appendChild(new Element('ul', 'md-nav__list'));
    return {item, toggle, label, nav, list};
  };
  const first = folder(list, '__nav_a');
  const firstLeaf = leaf(first.list, 'first');
  const nested = folder(first.list, '__nav_b');
  const nestedLeaf = leaf(nested.list, 'nested');
  const second = folder(list, '__nav_c');
  const secondLeaf = leaf(second.list, 'second');
  const lastLeaf = leaf(list, 'last');
  document.getElementById = id => body.querySelectorAll('[id]').find(node => node.id === id) || null;
  document.querySelector = selector => body.querySelector(selector);
  const media = eventTarget({matches: desktop});
  const window = eventTarget({matchMedia: () => media, getComputedStyle: node => ({visibility: node.visibility || 'visible'})});
  class Event { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const context = vm.createContext({window, document, Event, drawerTreeRuntime: null, PRIMARY_SIDEBAR_DESKTOP_QUERY: '(min-width: 76.25em)', primarySidebarIsDesktop: () => media.matches});
  const start = source.indexOf('  function setupDrawerTree('), end = source.indexOf('  function setupSectionNavigationDepthSync(', start);
  assert(start >= 0 && end > start, 'production tree owner is present');
  vm.runInContext(source.slice(start, end), context);
  const setup = () => context.setupDrawerTree(root, section);
  const change = (entry, checked) => { entry.toggle.checked = checked; entry.toggle.dispatchEvent(new Event('change', {bubbles: true})); };
  const key = (node, key) => { const event = new Event('keydown', {key, bubbles: true}); node.dispatchEvent(event); return event; };
  const switchMedia = desktop => { media.matches = desktop; context.drawerTreeRuntime.sync(); };
  return {body, root, title, list, first, firstLeaf, nested, nestedLeaf, second, secondLeaf, lastLeaf, context, document, media, setup, change, key, switchMedia};
}

// Test cases follow the production implementation rather than a parallel tree.
{
  const h = harness();
  const originalChildren = h.first.item.children.slice();
  h.setup();
  assert.deepEqual(h.first.item.children, originalChildren, 'native folder nodes remain in place');
  assert.equal(h.first.label.getAttribute('role'), 'button');
  assert.equal(h.first.label.getAttribute('tabindex'), '0');
  assert.equal(h.first.label.getAttribute('aria-expanded'), 'false');
  assert.equal(h.first.label.getAttribute('aria-controls'), h.first.nav.id);
  assert(h.first.nav.inert, 'collapsed subtree cannot receive mobile focus');
  assert(h.first.nav.classList.contains('edwinos-drawer-tree-group'));
  assert(h.first.label.classList.contains('edwinos-drawer-tree-toggle'));
  let changes = 0, nativeKeyCalls = 0;
  h.root.addEventListener('change', () => changes++);
  h.first.label.addEventListener('keydown', () => nativeKeyCalls++);
  const enter = h.key(h.first.label, 'Enter');
  assert(enter.defaultPrevented && enter.stopped, 'activation is consumed before Material label handling');
  assert(h.first.toggle.checked); assert(!h.first.nav.inert);
  assert.equal(changes, 1, 'Enter dispatches exactly one checkbox change');
  assert.equal(nativeKeyCalls, 0, 'capture avoids a second native toggle');
  h.key(h.first.label, ' ');
  assert(!h.first.toggle.checked); assert.equal(changes, 2, 'Space dispatches exactly one checkbox change');
  assert(h.first.nav.inert);
  h.change(h.first, true);
  assert.equal(h.first.nav.getAttribute('aria-expanded'), 'true', 'native pointer checkbox change updates disclosure state');
  h.setup();
  assert(h.first.toggle.checked, 'repeated startup preserves reader expansion');
  assert.equal(h.root.listenerCount('keydown'), 1, 'repeated startup has a single capture handler');
  assert.equal(h.root.listenerCount('change'), 2, 'only test observer and one production handler remain');
}
{
  const h = harness(); h.setup();
  h.first.label.focus();
  h.key(h.first.label, 'ArrowRight');
  assert(h.first.toggle.checked); assert.equal(h.document.activeElement, h.first.label, 'first Right opens without stealing focus');
  h.key(h.first.label, 'ArrowRight');
  assert.equal(h.document.activeElement, h.firstLeaf, 'second Right enters first visible child');
  h.key(h.firstLeaf, 'ArrowDown'); assert.equal(h.document.activeElement, h.nested.label);
  h.key(h.nested.label, 'ArrowRight'); assert(h.nested.toggle.checked);
  h.key(h.nested.label, 'ArrowRight'); assert.equal(h.document.activeElement, h.nestedLeaf);
  h.key(h.nestedLeaf, 'ArrowLeft'); assert.equal(h.document.activeElement, h.nested.label, 'leaf Left returns to immediate folder');
  h.key(h.nested.label, 'ArrowLeft'); assert(!h.nested.toggle.checked);
  h.key(h.nested.label, 'ArrowLeft'); assert.equal(h.document.activeElement, h.first.label, 'closed folder Left returns to parent');
  h.key(h.first.label, 'ArrowDown'); assert.equal(h.document.activeElement, h.firstLeaf);
  h.key(h.firstLeaf, 'ArrowUp'); assert.equal(h.document.activeElement, h.first.label);
  h.key(h.first.label, 'End'); assert.equal(h.document.activeElement, h.lastLeaf);
  h.key(h.lastLeaf, 'Home'); assert.equal(h.document.activeElement, h.first.label);
  h.change(h.first, false);
  h.key(h.first.label, 'ArrowDown'); assert.equal(h.document.activeElement, h.second.label, 'navigation skips collapsed descendants');
  h.second.label.visibility = 'hidden';
  h.key(h.first.label, 'ArrowDown'); assert.equal(h.document.activeElement, h.lastLeaf, 'navigation skips hidden controls');
  const event = {type: 'keydown', key: 'Enter', ctrlKey: true, bubbles: true};
  h.first.label.dispatchEvent(event);
  assert(!h.first.toggle.checked && !event.defaultPrevented, 'modified keys remain native');
  const leafEnter = h.key(h.lastLeaf, 'Enter');
  assert(!leafEnter.defaultPrevented, 'ordinary links retain native Enter navigation');
}
{
  const h = harness({desktop: true}); h.setup();
  assert(h.first.toggle.checked && h.second.toggle.checked, 'desktop ENotes top folders preserve default-open layout');
  assert(!h.nested.toggle.checked, 'default-open does not leak to deeper groups');
  assert(!h.first.nav.inert && !h.nested.nav.inert, 'desktop focus remains owned by native visibility');
  assert.equal(h.first.label.getAttribute('role'), null);
  assert.equal(h.first.label.getAttribute('tabindex'), '', 'authored desktop tabindex survives enhancement');
  assert(!h.key(h.first.label, 'Enter').defaultPrevented, 'desktop Material keyboard remains untouched');
  h.change(h.first, false);
  h.switchMedia(false);
  assert(!h.first.toggle.checked && !h.second.toggle.checked, 'first mobile visit restores authored collapsed state');
  h.change(h.second, true);
  h.switchMedia(true);
  assert(!h.first.toggle.checked && h.second.toggle.checked, 'desktop remembers its own reader state');
  h.switchMedia(false);
  assert(!h.first.toggle.checked && h.second.toggle.checked, 'mobile remembers its own reader state');
  const replacement = harness({section: 'experiences'});
  h.context.setupDrawerTree(replacement.root, 'experiences');
  assert.equal(h.root.listenerCount('keydown'), 0, 'content replacement retires previous capture handler');
  assert.equal(h.root.listenerCount('change'), 0, 'content replacement retires previous checkbox handler');
  assert(!h.first.nav.inert && !h.nested.nav.inert, 'cleanup removes mobile inert state');
  assert(!h.first.nav.classList.contains('edwinos-drawer-tree-group'));
  assert.equal(h.first.nav.id, '', 'cleanup removes only the generated group identity');
  assert.equal(h.first.label.getAttribute('aria-controls'), null);
  assert.equal(h.first.label.getAttribute('role'), null);
  assert.equal(h.first.label.getAttribute('tabindex'), '');
  assert.equal(replacement.root.listenerCount('keydown'), 1);
  h.context.drawerTreeRuntime.destroy();
  assert.equal(replacement.root.listenerCount('keydown'), 0);
}
{
  const h = harness({desktop: true, section: 'experiences'}); h.setup();
  assert(!h.first.toggle.checked && !h.second.toggle.checked, 'More desktop does not inherit ENotes default expansion');
}
{
  const h = harness();
  // Material's folder index variant shares a container between its real link
  // and icon-only disclosure; no synthetic navigation destination is needed.
  const container = new Element('div', 'md-nav__link md-nav__container');
  h.first.item.appendChild(container);
  h.first.item.children.splice(h.first.item.children.indexOf(container), 1);
  h.first.item.children.splice(1, 0, container);
  const anchor = container.appendChild(new Element('a', 'md-nav__link', {href: '/folder-index/'}));
  anchor.textContent = '  Folder index  ';
  h.first.item.removeChild(h.first.label);
  container.appendChild(h.first.label);
  h.first.nav.id = 'authored-group';
  h.first.toggle.checked = true;
  h.setup();
  assert.equal(h.first.label.getAttribute('aria-label'), 'Folder index', 'icon-only folder toggle receives its real link name');
  assert.equal(anchor.getAttribute('href'), '/folder-index/', 'index link destination remains native');
  assert(!h.key(anchor, 'Enter').defaultPrevented, 'folder index link retains native navigation');
  assert(h.first.toggle.checked && !h.first.nav.inert, 'active authored mobile branch stays open');
  h.context.drawerTreeRuntime.destroy();
  assert.equal(h.first.nav.id, 'authored-group', 'cleanup preserves authored group identity');
  assert.equal(h.first.label.getAttribute('aria-label'), null, 'cleanup removes a generated index label');
}
{
  const h = harness();
  h.first.label.setAttribute('aria-label', 'Authored disclosure name');
  const item = h.first.list.appendChild(new Element('li', 'md-nav__item md-nav__item--active'));
  const toggle = item.appendChild(new Element('input', 'md-nav__toggle md-toggle', {type: 'checkbox', id: '__toc'}));
  const label = item.appendChild(new Element('label', 'md-nav__link md-nav__link--active', {for: '__toc'}));
  label.appendChild(new Element('span', 'md-nav__icon md-icon'));
  // Material retains a separate current-document link for desktop. Mobile CSS
  // hides it, so keyboard traversal must use the disclosure and real fragments.
  const currentLink = item.appendChild(new Element('a', 'md-nav__link md-nav__link--active', {href: './'}));
  currentLink.hidden = true;
  const outline = item.appendChild(new Element('nav', 'md-nav md-nav--secondary', {'aria-label': 'Contents'}));
  outline.appendChild(new Element('label', 'md-nav__title', {for: '__toc'}));
  const list = outline.appendChild(new Element('ul', 'md-nav__list', {'data-md-component': 'toc'}));
  const chapter = list.appendChild(new Element('li', 'md-nav__item')).appendChild(new Element('a', 'md-nav__link', {href: '#chapter'}));
  const innerNav = list.appendChild(new Element('li', 'md-nav__item')).appendChild(new Element('nav', 'md-nav'));
  const innerList = innerNav.appendChild(new Element('ul', 'md-nav__list'));
  const subsection = innerList.appendChild(new Element('li', 'md-nav__item')).appendChild(new Element('a', 'md-nav__link', {href: '#subsection'}));
  h.setup();
  assert.equal(label.getAttribute('aria-expanded'), 'false', 'native article outline is an enhanced disclosure');
  assert(outline.inert, 'closed article outline cannot receive focus');
  h.change(h.first, true);
  label.focus();
  const event = h.key(label, 'Enter');
  assert(event.defaultPrevented && toggle.checked && !outline.inert, 'Enter opens the native article outline exactly once');
  h.key(label, 'ArrowRight');
  assert.equal(h.document.activeElement, chapter, 'Right enters the first real fragment link');
  h.key(chapter, 'ArrowDown');
  assert.equal(h.document.activeElement, subsection, 'nested outline fragments stay in reading-order traversal');
  assert.equal(subsection.getAttribute('href'), '#subsection', 'heading destinations remain native fragments');
  assert(!h.key(subsection, 'Enter').defaultPrevented, 'outline Enter retains native fragment navigation');
  h.key(subsection, 'ArrowLeft');
  assert.equal(h.document.activeElement, label, 'Left from an outline fragment returns to its article disclosure');
  h.key(label, 'ArrowLeft');
  assert(!toggle.checked && outline.inert, 'Left collapses the outline and removes its links from keyboard traversal');
  h.key(label, 'ArrowDown');
  assert.equal(h.document.activeElement, h.second.label, 'collapsed outline and hidden duplicate document link are skipped');
  h.context.drawerTreeRuntime.destroy();
  assert(!outline.inert && !outline.classList.contains('edwinos-drawer-tree-group'), 'outline enhancement cleans up on replacement');
  assert.equal(label.getAttribute('role'), null);
  assert.equal(h.first.label.getAttribute('aria-label'), 'Authored disclosure name', 'cleanup preserves authored accessible naming');
}
console.log('Drawer tree tests passed (native disclosures, keyboard, breakpoint state and lifecycle).');
