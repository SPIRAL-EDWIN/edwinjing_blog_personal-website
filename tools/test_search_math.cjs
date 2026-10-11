#!/usr/bin/env node
/* Targeted search adapter contracts; browser checks still verify real MathJax. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Node {
  constructor(tag, text = '') {
    this.nodeType = tag === '#text' ? 3 : tag === '#fragment' ? 11 : 1;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.dataset = {};
    this.value = text;
    this.isConnected = true;
    this.rect = {width: 400, height: 24, top: 0, bottom: 24};
    this.collapsed = false;
  }
  get classList() { return {contains: name => (this.className || '').split(/\s+/).includes(name)}; }
  closest() { return this.collapsed ? {} : null; }
  getBoundingClientRect() { return this.rect; }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) { this.childNodes = [new Node('#text', value)]; }
  appendChild(node) { this.childNodes.push(...(node.nodeType === 11 ? node.childNodes : [node])); return node; }
  replaceChildren(...nodes) { this.childNodes = []; nodes.forEach(n => this.appendChild(n)); }
}
const listeners = new Map();
const document = {
  currentScript: {src: 'http://edwinos.test/javascripts/mathjax.js'},
  baseURI: 'http://edwinos.test/',
  addEventListener(type, fn) { listeners.set(type, fn); },
  createElement(tag) { return new Node(tag); },
  createTextNode(text) { return new Node('#text', text); },
  createDocumentFragment() { return new Node('#fragment'); },
  dispatchEvent() {}
};
const window = {addEventListener() {}};
const context = vm.createContext({window, document, URL, console, CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}}});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/javascripts/mathjax.js'), 'utf8'), context);
const api = window.EdwinOSSearchMath;
function ranges(text) { return JSON.parse(JSON.stringify(api.getRanges(text))); }

assert.deepEqual(ranges(String.raw`left $x^2$ \(y+1\) $$z$$ \[w\] right`).map(r => r.body), ['x^2', 'y+1', 'z', 'w']);
assert.deepEqual(ranges(String.raw`escaped \$x\$, incomplete \(x+1, and currency $ 25`), []);
assert.equal(ranges(String.raw`$x+\$y$`)[0].body, String.raw`x+\$y`);
const codeDelimited = String.raw`before $x <literal> +y$ after \(z_2\)`;
const codeStart = codeDelimited.indexOf('<literal>');
assert.deepEqual(JSON.parse(JSON.stringify(api.getRanges(codeDelimited, [{start:codeStart,end:codeStart+9}]))).map(range=>range.body), ['z_2'], 'dollars never pair across a code region');

const bashOnly = new Node('p');
const bashCode = bashOnly.appendChild(new Node('code'));
bashCode.textContent = String.raw`WANDB_OFFLINE_DIR="$RUN_DIR/wandb/<WANDB_OFFLINE_RUN_DIR>"; wandb sync "$WANDB_OFFLINE_DIR"`;
assert.equal(api.prepare(bashOnly), false, 'code-only dollars do not trigger math work');
assert.equal(bashOnly.childNodes[0], bashCode, 'unprocessed code retains its node');

const mixedCode = new Node('p');
mixedCode.appendChild(new Node('#text', String.raw`Formula $x_2$ and `));
const literalCode = mixedCode.appendChild(new Node('code'));
literalCode.appendChild(new Node('#text', '"$'));
const codeMark = literalCode.appendChild(new Node('mark'));codeMark.textContent='REPO_ROOT';
literalCode.appendChild(new Node('#text', String.raw`" \(literal\) $$literal$$ <script>`));
mixedCode.appendChild(new Node('#text', String.raw` plus \(y_3\).`));
assert.equal(api.prepare(mixedCode), true, 'real math and literal code can coexist');
const retainedCode = mixedCode.childNodes.find(node=>node.tagName==='CODE');
assert.equal(retainedCode.textContent, literalCode.textContent, 'all code delimiters and literal markup remain unchanged');
assert.equal(retainedCode.childNodes.find(node=>node.tagName==='MARK').textContent, 'REPO_ROOT', 'code keyword highlighting survives');
assert.equal(mixedCode.childNodes.filter(node=>node.className==='arithmatex').length, 2, 'only the two actual formulas are rendered');

const paragraph = new Node('p');
paragraph.appendChild(new Node('#text', 'Before $'));
const mark = new Node('mark');
mark.textContent = 'x';
paragraph.appendChild(mark);
paragraph.appendChild(new Node('#text', '^2$ after <script>literal</script>'));
assert.equal(api.prepare(paragraph), true);
assert.equal(paragraph.textContent, String.raw`Before \(x^2\) after <script>literal</script>`);
const formulaMark = paragraph.childNodes.find(n => n.tagName === 'MARK');
assert.equal(formulaMark.childNodes[0].className, 'arithmatex');
assert.equal(formulaMark.textContent, String.raw`\(x^2\)`);
assert.equal(api.prepare(paragraph), false, 'prepared excerpts are idempotent');
let cleared;
window.MathJax.typesetClear = nodes => { cleared = nodes; };
window.MathJax.texReset = () => { throw new Error('search must not reset article counters'); };
window.MathJax.typesetPromise = () => Promise.resolve();
api.clear(paragraph);
assert.equal(cleared[0], paragraph, 'cleanup targets only the replaced excerpt');
assert.equal(api.prepare(paragraph), true);
assert(listeners.has('edwinos:search-snippets-updated'));

// These are the headings emitted by Material for the real CHEM 102 search.
const heading = new Node('h2');
heading.appendChild(new Node('#text', String.raw`\(sp^2\) 杂化：由1个`));
const headingMark = new Node('mark');
headingMark.textContent = '2s';
heading.appendChild(headingMark);
heading.appendChild(new Node('#text', '和2个2p轨道组合而成'));
const provenance = new Node('span');
provenance.className = 'edwinos-search-provenance';
provenance.textContent = ' · CHEM 102';
heading.appendChild(provenance);
assert.equal(api.prepare(heading), true);
assert.equal(heading.childNodes.at(-1), provenance, 'title typesetting preserves article metadata node');
assert.equal(heading.childNodes.find(n => n.tagName === 'MARK').textContent, '2s', 'marks outside math remain precise');
assert.equal(heading.childNodes.find(n => n.className === 'arithmatex').textContent, String.raw`\(sp^2\)`);

const fragmented = new Node('h2');
fragmented.appendChild(new Node('#text', String.raw`\(\sigma_{`));
const orbitalMark = new Node('mark');
orbitalMark.textContent = '2s';
fragmented.appendChild(orbitalMark);
fragmented.appendChild(new Node('#text', String.raw`}\) orbital`));
assert.equal(api.prepare(fragmented), true, 'a keyword mark may split the TeX body');
assert.equal(fragmented.childNodes.find(n => n.tagName === 'MARK').textContent, String.raw`\(\sigma_{2s}\)`);

const chemical = new Node('h1');
chemical.textContent = String.raw`Sulfur Hexafluoride (\(SF_6\))`;
const hidden = new Node('h2');
hidden.textContent = String.raw`Hidden \(sp^3\)`;
hidden.rect = {width: 0, height: 0, top: 0, bottom: 0};
const offscreen = new Node('h2');
offscreen.textContent = String.raw`Later \(sp^2\)`;
offscreen.rect = {width: 400, height: 24, top: 1000, bottom: 1024};
const collapsed = new Node('h2');
collapsed.textContent = String.raw`Collapsed \(sp\)`;
collapsed.collapsed = true;
let selected = '', typesetCalls = [];
const root = {
  isConnected: true,
  querySelector() {return {getBoundingClientRect: () => ({width: 400, height: 400, top: 0, bottom: 400})};},
  querySelectorAll(selector) {selected = selector; return [chemical, heading, fragmented, hidden, offscreen, collapsed];}
};
window.MathJax.typesetPromise = nodes => {typesetCalls.push(nodes); return Promise.resolve();};
const handler = listeners.get('edwinos:search-snippets-updated');
handler({detail: {root}});
assert(selected.includes('.md-search-result__article h1') && selected.includes('.md-search-result__article h2'), 'real Material heading selectors are included');
assert(!selected.includes('.md-search-result__title'), 'do not rely on a nonexistent Material title class');
(async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(typesetCalls.length, 1);
  assert.equal(typesetCalls[0][0], chemical, 'heading formula is queued for targeted rendering');
  assert.equal(typesetCalls[0].length, 1, 'hidden, collapsed and far offscreen rows stay unprepared');
  assert.equal(hidden.childNodes[0].nodeType, 3);
  assert.equal(offscreen.childNodes[0].nodeType, 3);
  assert.equal(collapsed.childNodes[0].nodeType, 3);
  handler({detail: {root}});
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(typesetCalls.length, 1, 'settled/resize events do not retypeset unchanged headings');
  offscreen.rect = {width: 400, height: 24, top: 350, bottom: 374};
  handler({detail: {root}});
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(typesetCalls.length, 2, 'scrolling a row into view schedules it lazily');
  assert.equal(typesetCalls[1][0], offscreen);
  console.log('Search math adapter: delimiters, real Material headings, split keyword marks, provenance, viewport culling, lazy scroll rendering, idempotence and targeted cleanup passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
