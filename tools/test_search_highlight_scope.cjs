#!/usr/bin/env node
'use strict';
// Exercise the real article highlighting owner. Browser QA still verifies
// Material's mark creation and the article's visible rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docs/javascripts/ui-perf.js'), 'utf8');
const start = source.indexOf('  function clearExcludedSearchHighlights(root)');
const end = source.indexOf('  function runAll()', start);
assert(start >= 0 && end > start, 'the actual highlighting owner must exist');
const declarations = source.match(/  var searchHighlightScope(?:Root|Observer) = null;/g);
assert.equal(declarations?.length, 2);
const owner = declarations.join('\n') + source.slice(start, end);

const observers = [];
function mutated(node) {
  for (const observer of observers) {
    if (observer.targets.some(({root, options}) => root === node || options.subtree && root.contains(node))) {
      observer.pending = true;
    }
  }
}
class Node {
  constructor(tag, text = '', attributes = {}) {
    this.tagName = tag.toUpperCase();
    this.nodeType = tag === '#text' ? 3 : 1;
    this.value = text;
    this.attributes = attributes;
    this.childNodes = [];
    this.parentNode = null;
    this.isConnected = true;
  }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(n => n.textContent).join(''); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      node.parentNode = this;
      this.childNodes.push(node);
    }
    mutated(this);
    return this;
  }
  contains(node) { return this === node || this.childNodes.some(n => n.contains(node)); }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.childNodes.indexOf(this);
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      node.parentNode = parent;
    }
    parent.childNodes.splice(index, 1, ...nodes);
    this.parentNode = null;
    mutated(parent);
  }
  querySelectorAll(selector) {
    assert(['[data-search-exclude]', 'mark[data-md-highlight]'].includes(selector));
    const result = [];
    const visit = node => {
      for (const child of node.childNodes) {
        if (selector === '[data-search-exclude]' && Object.hasOwn(child.attributes, 'data-search-exclude') ||
            selector === 'mark[data-md-highlight]' && child.tagName === 'MARK' && Object.hasOwn(child.attributes, 'data-md-highlight')) {
          result.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}
class Observer {
  constructor(callback) { this.callback = callback; this.targets = []; this.pending = false; this.disconnects = 0; observers.push(this); }
  observe(root, options) { this.targets.push({root, options}); }
  disconnect() { this.targets = []; this.pending = false; this.disconnects++; }
  flush() {
    let deliveries = 0;
    while (this.pending) {
      assert(++deliveries <= 3, 'cleanup must settle without a mutation loop');
      this.pending = false;
      this.callback();
    }
  }
}
const text = value => new Node('#text', value);
const mark = (value, generated = true) => new Node('mark', '', generated ? {'data-md-highlight': ''} : {}).append(text(value));
const excluded = () => new Node('div', '', {'data-search-exclude': ''});
function harness(content, supportsObserver = true) {
  const document = {content, querySelector(selector) {assert.equal(selector, '.md-content__inner'); return this.content;}};
  const context = vm.createContext({document, window: supportsObserver ? {MutationObserver: Observer} : {}});
  vm.runInContext(owner, context);
  return {document, setup: () => vm.runInContext('setupArticleSearchHighlightScope()', context),
    clear: node => { context.target = node; vm.runInContext('clearExcludedSearchHighlights(target)', context); }};
}

const content = new Node('article');
const metadata = excluded();
const date = new Node('time', '', {datetime: '2026-06-01'});
const year = text('2026');
const generatedYear = new Node('mark', '', {'data-md-highlight': ''}).append(year);
date.append(generatedYear, text('-06-01'));
const author = new Node('strong').append(mark('Chen Jing'));
const authored = mark('authored emphasis', false);
metadata.append(text('Published '), date, text(' · By '), author, authored);
const nestedExcluded = excluded().append(new Node('mark', '', {'data-md-highlight': ''}).append(mark('nested 2026')));
metadata.append(nestedExcluded);
const secondExcluded = excluded().append(mark('Updated 2026'));
const bodyYear = mark('2026');
const bodyAuthor = mark('Chen Jing');
content.append(metadata, secondExcluded, new Node('p').append(bodyYear, bodyAuthor));
const beforeText = metadata.textContent;
const test = harness(content);
const beforeObservers = observers.length;
test.setup();
assert.equal(metadata.querySelectorAll('mark[data-md-highlight]').length, 0, 'initial and nested generated metadata marks are removed');
assert.equal(secondExcluded.querySelectorAll('mark[data-md-highlight]').length, 0, 'all excluded subtrees are cleaned');
assert.equal(metadata.textContent, beforeText, 'the visible metadata text is unchanged');
assert.equal(date.childNodes[0], year, 'date text node identity survives unwrapping');
assert.equal(metadata.childNodes[1], date, 'time element identity and datetime survive');
assert.equal(date.attributes.datetime, '2026-06-01');
assert.equal(metadata.childNodes[3], author, 'author formatting survives');
assert.equal(authored.parentNode, metadata, 'authored mark elements are retained');
assert.deepEqual(content.querySelectorAll('mark[data-md-highlight]'), [bodyYear, bodyAuthor], 'real body date/name matches remain highlighted');
const observer = observers.at(-1);
assert.equal(observers.length, beforeObservers + 1);
assert(observer.targets.every(({root, options}) => root !== content && options.childList && options.subtree), 'observer is restricted to excluded subtrees');
test.setup();
assert.equal(observers.length, beforeObservers + 1, 'repeated setup reuses the current observer');
assert.equal(observer.disconnects, 0);

metadata.append(mark('delayed 2026'));
observer.flush();
assert.equal(metadata.querySelectorAll('mark[data-md-highlight]').length, 0, 'delayed manifest highlighting is cleaned');
assert(metadata.textContent.endsWith('delayed 2026'));
assert.equal(authored.parentNode, metadata);
assert.equal(bodyYear.parentNode.tagName, 'P');

const nextContent = new Node('article');
const nextMetadata = excluded().append(mark('new note 2026'));
nextContent.append(nextMetadata);
test.document.content = nextContent;
test.setup();
assert.equal(observer.disconnects, 1, 'navigation disconnects the previous article observer');
assert.equal(nextMetadata.querySelectorAll('mark[data-md-highlight]').length, 0);
const nextObserver = observers.at(-1);
assert.notEqual(nextObserver, observer);
metadata.append(mark('old article delayed mark'));
observer.callback();
assert.equal(metadata.querySelectorAll('mark[data-md-highlight]').length, 1, 'stale queued callbacks cannot process the outgoing article');
nextMetadata.append(mark('incoming delayed mark'));
nextObserver.flush();
assert.equal(nextMetadata.querySelectorAll('mark[data-md-highlight]').length, 0);
nextContent.isConnected = false;
nextMetadata.append(mark('detached mark'));
nextObserver.flush();
assert.equal(nextMetadata.querySelectorAll('mark[data-md-highlight]').length, 1, 'a detached current article is ignored');
test.document.content = null;
test.setup();
assert.equal(nextObserver.disconnects, 1, 'leaving article content also disconnects');

const noExclusion = harness(new Node('article').append(mark('body 2026')));
const count = observers.length;
noExclusion.setup();
assert.equal(observers.length, count, 'articles without exclusions need no observer');
assert.equal(noExclusion.document.content.querySelectorAll('mark[data-md-highlight]').length, 1);
const noObserverMetadata = excluded().append(mark('initial 2026'));
const noObserver = harness(new Node('article').append(noObserverMetadata), false);
noObserver.setup();
assert.equal(noObserverMetadata.querySelectorAll('mark[data-md-highlight]').length, 0, 'no-MutationObserver fallback still cleans initial marks');
assert.equal(observers.length, count);
noObserverMetadata.append(mark('direct cleanup'));
noObserver.clear(noObserverMetadata);
assert.equal(noObserverMetadata.querySelectorAll('mark[data-md-highlight]').length, 0);
console.log('Article search highlight scope: initial/delayed marks, node preservation, body matches and navigation lifecycle passed.');
