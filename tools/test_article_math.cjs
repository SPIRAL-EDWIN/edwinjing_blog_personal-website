#!/usr/bin/env node
/* Article lifecycle regression tests. Real MathJax/browser behavior still needs browser QA. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeNode {
  constructor(tag, text = '') {
    this.nodeType = tag === '#text' ? 3 : 1;
    this.tagName = tag.toUpperCase();
    this.value = text;
    this.childNodes = [];
    this.parentNode = null;
    this.className = '';
    this.attributes = new Map();
    this.dataset = {};
    this.clientWidth = 800;
    this.listeners = new Map();
  }
  get parentElement() { return this.parentNode; }
  get isConnected() { return this.connectedRoot || Boolean(this.parentNode && this.parentNode.isConnected); }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(node => node.textContent).join(''); }
  set textContent(text) {
    if (this.nodeType === 3) this.value = text;
    else this.replaceChildren(new FakeNode('#text', text));
  }
  get classList() {
    return {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        enabled ? classes.add(name) : classes.delete(name);
        this.className = [...classes].join(' ');
      }
    };
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  emit(type) { this.listeners.get(type)?.(); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  cloneNode(deep) {
    const clone = new FakeNode(this.nodeType === 3 ? '#text' : this.tagName, this.value);
    clone.className = this.className;
    clone.attributes = new Map(this.attributes);
    clone.dataset = {...this.dataset};
    if (deep) this.childNodes.forEach(child => clone.appendChild(child.cloneNode(true)));
    return clone;
  }
  insertBefore(node, anchor) {
    if (!anchor) return this.appendChild(node);
    const index = this.childNodes.indexOf(anchor);
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    assert(index >= 0, 'cannot remove a node from the wrong parent');
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    [...this.childNodes].forEach(node => this.removeChild(node));
    nodes.forEach(node => this.appendChild(node));
  }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    const index = parent.childNodes.indexOf(this);
    nodes.forEach(node => { if (node.parentNode) node.parentNode.removeChild(node); });
    parent.childNodes.splice(index, 1, ...nodes);
    this.parentNode = null;
    nodes.forEach(node => { node.parentNode = parent; });
  }
  normalize() {
    this.childNodes.forEach(node => { if (node.nodeType === 1) node.normalize(); });
    for (let index = 0; index < this.childNodes.length;) {
      const node = this.childNodes[index];
      if (node.nodeType !== 3) { index++; continue; }
      while (this.childNodes[index + 1]?.nodeType === 3) {
        const next = this.childNodes[index + 1];
        node.value += next.value;
        this.removeChild(next);
      }
      if (!node.value) this.removeChild(node);
      else index++;
    }
  }
  matches(selector) {
    if (this.nodeType !== 1) return false;
    if (selector === 'mark[data-md-highlight]') return this.tagName === 'MARK' && this.attributes.has('data-md-highlight');
    if (selector === 'span.arithmatex:not(.arithmatex--display)') return this.tagName === 'SPAN' && this.classList.contains('arithmatex') && !this.classList.contains('arithmatex--display');
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(part => part.trim());
    const results = [];
    const visit = parent => parent.childNodes.forEach(node => {
      if (selectors.some(part => node.matches(part))) results.push(node);
      visit(node);
    });
    visit(this);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    const selectors = selector.split(',').map(part => part.trim());
    for (let node = this; node; node = node.parentNode) {
      if (selectors.some(part => node.matches(part))) return node;
    }
    return null;
  }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  getBoundingClientRect() { return {width: 40, height: 24}; }
}

function element(tag, className = '', ...children) {
  const node = new FakeNode(tag);
  node.className = className;
  children.forEach(child => node.appendChild(typeof child === 'string' ? new FakeNode('#text', child) : child));
  return node;
}
function highlight(text, author = false) {
  const mark = element('mark', '', text);
  if (!author) mark.attributes.set('data-md-highlight', '');
  return mark;
}
function harness(article, search = '', options = {}) {
  const body = element('body', '', article);
  body.connectedRoot = true;
  const observers = [];
  const calls = {clear: [], reset: 0, typeset: [], warnings: []};
  let documentCallback;
  const timers = new Map();
  let timerId = 0;
  const head = element('head');
  head.connectedRoot = true;
  const document = {
    currentScript: {src: 'http://edwinos.test/javascripts/mathjax.js'},
    baseURI: 'http://edwinos.test/',
    body, head,
    getElementById: id => head.childNodes.find(node => node.id === id),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => {
      if (selector === '.md-content__inner span.arithmatex:not(.arithmatex--display)') {
        return document.querySelector('.md-content__inner')?.querySelectorAll('span.arithmatex:not(.arithmatex--display)') || [];
      }
      return body.querySelectorAll(selector);
    },
    createElement: tag => element(tag),
    addEventListener() {},
    dispatchEvent() {}
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(root, options) { this.root = root; this.options = options; }
    disconnect() { this.disconnected = true; }
    deliver(...addedNodes) { this.callback([{addedNodes}]); }
  }
  const window = {
    location: {hash: '', search},
    setTimeout(fn, ms) { timers.set(++timerId, {fn, ms}); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener() {},
    document$: {subscribe(callback) { documentCallback = callback; }}
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/javascripts/mathjax.js'), 'utf8'), vm.createContext({
    window, document, URL, MutationObserver: FakeMutationObserver,
    console: {...console, warn: (...args) => calls.warnings.push(args)}
  }));
  function installRuntime(startupPromise) {
  Object.assign(window.MathJax, {
    typesetClear(nodes) { calls.clear.push(nodes); },
    texReset() { calls.reset++; },
    typesetPromise(nodes) {
      const formulas = nodes ? Array.from(nodes).flatMap(node => node.matches('.arithmatex') ? [node] : node.querySelectorAll('.arithmatex')) : document.querySelector('.md-content__inner').querySelectorAll('.arithmatex');
      formulas.forEach(formula => {
        assert.equal(formula.querySelectorAll('mark[data-md-highlight]').length, 0, 'search marks must be removed before typesetting');
      });
      calls.typeset.push({nodes: nodes && Array.from(nodes), sources: formulas.map(formula => formula.textContent)});
      formulas.forEach(formula => {
        if (!formula.querySelector('mjx-container')) formula.appendChild(element('mjx-container'));
      });
      return Promise.resolve();
    }
  });
  if (startupPromise) window.MathJax.startup.promise = startupPromise;
  }
  if (!options.lazy) installRuntime();
  return {body, head, window, document, calls, observers, installRuntime,
    navigate: () => documentCallback(),
    tick(ms) {
      const due = [...timers].filter(([,timer]) => timer.ms <= ms);
      due.forEach(([id, timer]) => { timers.delete(id); timer.fn(); });
    }
  };
}

async function settle() { for (let index = 0; index < 64; index++) await Promise.resolve(); }

async function main() {
  const keyword = highlight('t');
  const authorMark = highlight('author emphasis', true);
  const formula = element('span', 'arithmatex', String.raw`\(\Del`, keyword, String.raw`a\)`);
  const proseMark = highlight('training');
  const authorFormula = element('span', 'arithmatex', String.raw`\(x+`, authorMark, String.raw`\)`);
  const article = element('article', 'md-content__inner', element('p', '', proseMark, formula, authorFormula));
  const test = harness(article);
  test.navigate();
  assert.equal(formula.childNodes.length, 1, 'unwrapping normalizes split TeX into one text node');
  assert.equal(formula.childNodes[0].nodeType, 3);
  assert.equal(formula.textContent, String.raw`\(\Delta\)`);
  assert.equal(keyword.parentNode, null);
  assert.equal(proseMark.parentNode, article.querySelector('p'), 'ordinary article search highlights survive');
  assert.equal(authorMark.parentNode, authorFormula, 'author-authored marks inside math survive');
  await settle();
  assert.equal(test.calls.typeset.length, 1, 'document$ emits the initial typeset');
  assert.deepEqual(test.calls.typeset[0].nodes, [article], 'initial typeset captures its article rather than discovering a later page');
  assert.equal(test.calls.typeset[0].sources[0], String.raw`\(\Delta\)`);
  assert(formula.querySelector('mjx-container'), 'the repaired source reaches the typeset adapter');
  assert.equal(test.calls.clear.length, 1);
  assert.equal(test.calls.reset, 1);
  assert.equal(test.observers.length, 1, 'one observer protects the active article');
  assert.deepEqual(JSON.parse(JSON.stringify(test.observers[0].options)), {childList: true, subtree: true});

  // Search highlighting may finish after initial document$ / MathJax work.
  const lateMark = highlight('t');
  const pending = element('div', 'arithmatex', String.raw`\[\Del`, lateMark, String.raw`a=1\]`);
  article.appendChild(pending);
  test.observers[0].deliver(pending); // Added wrapper, with a nested search mark.
  assert.equal(pending.childNodes.length, 1);
  assert.equal(pending.textContent, String.raw`\[\Delta=1\]`);
  await settle();
  assert.equal(test.calls.typeset.length, 2, 'late unrendered math gets a retry');
  assert.deepEqual(test.calls.typeset[1].nodes, [pending], 'retry targets only affected unrendered formulas');
  assert.equal(test.calls.clear.length, 1, 'targeted retry preserves existing MathItems');
  assert.equal(test.calls.reset, 1, 'targeted retry preserves equation counters');

  const renderedMark = highlight('x');
  formula.querySelector('mjx-container').appendChild(renderedMark);
  test.observers[0].deliver(renderedMark); // Directly added mark in already typeset math.
  assert.equal(renderedMark.parentNode, null, 'late marks are removed even from rendered math');
  await settle();
  assert.equal(test.calls.typeset.length, 2, 'rendered formulas do not get typeset again');
  assert.equal(test.calls.clear.length, 1);
  assert.equal(test.calls.reset, 1);

  const lateProseMark = highlight('epoch');
  article.querySelector('p').appendChild(lateProseMark);
  test.observers[0].deliver(lateProseMark, new FakeNode('#text', 'ordinary text'));
  await settle();
  assert.equal(lateProseMark.parentNode, article.querySelector('p'));
  assert.equal(test.calls.typeset.length, 2, 'prose highlighting does not schedule math work');

  // Queue a repair, then navigate before its microtask runs. The old article
  // must neither receive a retry nor retain a live observer on navigation.
  const staleMark = highlight('y');
  const staleFormula = element('span', 'arithmatex', String.raw`\(`, staleMark, String.raw`\)`);
  article.appendChild(staleFormula);
  test.observers[0].deliver(staleMark);
  const nextFormula = element('span', 'arithmatex', String.raw`\(z\)`);
  const nextArticle = element('article', 'md-content__inner', element('p', '', nextFormula));
  test.body.replaceChildren(nextArticle);
  test.navigate();
  assert.equal(test.observers[0].disconnected, true, 'navigation disconnects the old article observer');
  assert.equal(test.observers.length, 2);
  assert.equal(test.observers[1].root, nextArticle);
  await settle();
  assert.equal(test.calls.typeset.length, 3, 'stale queued repair is superseded by the new document lifecycle');
  assert.deepEqual(test.calls.typeset[2].nodes, [nextArticle]);
  assert.deepEqual(test.calls.typeset[2].sources, [String.raw`\(z\)`]);
  assert.equal(test.calls.reset, 2, 'only real navigations reset equation counters');

  test.body.replaceChildren(element('main', '', 'No article here'));
  test.navigate();
  assert.equal(test.observers[1].disconnected, true, 'navigation without an article releases its observer');

  const inequality = element('span', 'arithmatex', String.raw`\(x &gt; y\)`);
  const alignment = element('div', 'arithmatex', String.raw`\[\begin{aligned}x&amp;=y\end{aligned}\]`);
  const splitEntity = element('span', 'arithmatex', String.raw`\(x &g`, highlight('t'), String.raw`; y\)`);
  const htmlText = element('span', 'arithmatex', String.raw`\(\text{&quot;&lt;img&gt;&quot; &#39;test&#39;}\)`);
  const nestedEntity = element('span', 'arithmatex', String.raw`\(\text{&amp;gt;}\)`);
  const escapedArticle = element('article', 'md-content__inner', element('p', '', inequality, alignment, splitEntity, htmlText, nestedEntity));
  const escapedTest = harness(escapedArticle, '?h=t');
  escapedTest.navigate();
  assert.equal(inequality.textContent, String.raw`\(x > y\)`, 'Material-escaped inequalities are restored');
  assert.equal(alignment.textContent, String.raw`\[\begin{aligned}x&=y\end{aligned}\]`, 'Material-escaped alignment ampersands are restored');
  assert.equal(splitEntity.textContent, String.raw`\(x > y\)`, 'an entity fragmented by keyword marks is joined before decoding');
  assert.equal(splitEntity.childNodes.length, 1);
  assert.equal(htmlText.textContent, String.raw`\(\text{"<img>" 'test'}\)`, 'quotes and angle brackets are restored as text');
  assert.equal(htmlText.querySelector('img'), null, 'restoring entities never parses source as HTML');
  assert.equal(htmlText.childNodes[0].nodeType, 3);
  assert.equal(nestedEntity.textContent, String.raw`\(\text{&gt;}\)`, 'only one escape layer is restored');
  await settle();
  assert.equal(escapedTest.calls.typeset.length, 1);
  assert.equal(escapedTest.calls.typeset[0].sources[0], String.raw`\(x > y\)`);
  escapedTest.navigate();
  await settle();
  assert.equal(nestedEntity.textContent, String.raw`\(\text{&gt;}\)`, 'repeated document$ callbacks do not decode clean text again');

  const lateEntityFormula = element('span', 'arithmatex');
  escapedArticle.appendChild(lateEntityFormula);
  const lateEntityText = new FakeNode('#text', String.raw`\(x &lt; y\)`);
  lateEntityFormula.appendChild(lateEntityText);
  escapedTest.observers[0].deliver(lateEntityText);
  assert.equal(lateEntityFormula.textContent, String.raw`\(x < y\)`, 'a late entity-only TextNode needs no keyword mark');
  await settle();
  assert.equal(escapedTest.calls.typeset.length, 2);
  assert.deepEqual(escapedTest.calls.typeset[1].nodes, [lateEntityFormula], 'entity-only observer repairs remain targeted');
  assert.equal(escapedTest.calls.reset, 1, 'repeat publication and late entity-only repairs preserve counters');
  assert.equal(escapedTest.calls.clear.length, 1);

  const literalEntity = element('span', 'arithmatex', String.raw`\(\text{&gt; &amp; &quot;}\)`);
  const literalArticle = element('article', 'md-content__inner', element('p', '', literalEntity));
  const literalTest = harness(literalArticle);
  literalTest.navigate();
  await settle();
  assert.equal(literalEntity.textContent, String.raw`\(\text{&gt; &amp; &quot;}\)`, 'without search highlighting, author source entities are unchanged');
  const literalLateFormula = element('span', 'arithmatex', String.raw`\(x &gt; y\)`);
  literalArticle.appendChild(literalLateFormula);
  literalTest.observers[0].deliver(literalLateFormula.childNodes[0]);
  await settle();
  assert.equal(literalLateFormula.textContent, String.raw`\(x &gt; y\)`);
  assert.equal(literalTest.calls.typeset.length, 1, 'entity-only text without h does not trigger a repair');
  console.log('Article math lifecycle: initial split-TeX cleanup, prose/author mark preservation, late targeted retry, rendered-math preservation, stale navigation cancellation and observer cleanup passed.');
  console.log('Article math entities: inequalities, alignments, split entities, text-only late arrival, safe literal HTML, one-time decoding and non-search preservation passed.');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {harness, element, highlight, settle};
