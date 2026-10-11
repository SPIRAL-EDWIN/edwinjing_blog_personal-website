#!/usr/bin/env node
/* Run after `mkdocs build --strict`: node tools/test_search_engine.cjs.
 * These tests check observable relevance and safe Material worker output,
 * not native Lunr score values or exhaustive relevance judgments.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'docs/assets/javascripts');
const engineApi = require(path.join(assets, 'workers/search-engine.js'));
const lunr = require(path.join(assets, 'workers/vendor/lunr.min.js'));
let checks = 0;
function check(name, run) {
  run();
  checks++;
  console.log('PASS ' + name);
}
function pages(result) {
  return result.items.map(group => group[0].location.split('#')[0]);
}
function locations(result) {
  return result.items.flat().map(item => item.location).sort();
}
function sections(result) {
  return result.items.flat().filter(item => item.location.includes('#'));
}
function snippetHtml(item) {
  return item.text.replace(/<span data-edwinos-search-segment="\d+" data-start-truncated="(?:true|false)" data-end-truncated="(?:true|false)">|<\/span>/g, '');
}
function snippetSegments(item) {
  return Array.from(item.text.matchAll(/<span data-edwinos-search-segment="(\d+)" data-start-truncated="(true|false)" data-end-truncated="(true|false)">([\s\S]*?)<\/span>/g), match => ({
    index: Number(match[1]), before: match[2] === 'true', after: match[3] === 'true', html: match[4]
  }));
}
function fixture(page, title, text, anchor = 'target') {
  return [
    {location: 'OsdNotes/test/' + page + '/', title: page, text: ''},
    {location: 'OsdNotes/test/' + page + '/#' + anchor, title, text}
  ];
}
function make(docs) { return engineApi.createEngine(docs, lunr); }

const basicDocs = [
  ...fixture('phrase', 'Exact target', '<p>reinforcement learning supports robotics.</p>'),
  ...fixture('near', 'Nearby terms', '<p>reinforcement methods enable practical learning.</p>'),
  ...fixture('single', 'Only learning', '<p>learning alone is insufficient.</p>'),
  ...fixture('remote', 'Remote paragraphs', '<p>reinforcement is discussed here.</p><p>learning is in an unrelated paragraph.</p>'),
  ...fixture('punctuation', 'Punctuation', '<p>reinforcement learning（RL） is useful.</p>'),
  ...fixture('mixed', 'PPO', '<p>它是强化学习（RL）的一种方法。</p>'),
  ...fixture('typo', 'Embodied AI', '<p>Embodied AI is a research area.</p>'),
  ...fixture('numbers', 'CHEM 102', '<p>PPO and MPC support version 102. Model π0.7 is described.</p>'),
  ...fixture('substring', 'Distractors', '<p>oppositely and computationally are words. Version 2098 is unrelated.</p>'),
  ...fixture('han', 'Chinese phrase', '<p>强化学习用于机器人。</p>'),
  ...fixture('han-separated', 'Chinese distractor', '<p>强化自主系统的能力与学习不同。</p>')
];
const engine = make(basicDocs);
check('complete phrase leads, single words and remote paragraphs are excluded', () => {
  const result = engine.search('reinforcement learning');
  assert.equal(pages(result)[0], 'OsdNotes/test/phrase/');
  assert(!pages(result).includes('OsdNotes/test/single/'));
  assert(!pages(result).includes('OsdNotes/test/remote/'));
});
check('strict quoted phrase excludes nearby, typo and title/body combinations', () => {
  const result = engine.search('"reinforcement learning"');
  assert.deepEqual(pages(result).sort(), ['OsdNotes/test/phrase/', 'OsdNotes/test/punctuation/']);
  assert.equal(engine.search('"reinforcment learning"').items.length, 0);
  assert.equal(engine.search('"强化学习 PPO"').items.length, 0);
});
check('Chinese title/body context retains all requested concepts', () => {
  assert(pages(engine.search('强化学习 PPO')).includes('OsdNotes/test/mixed/'));
});
check('Chinese phrase does not assemble dispersed Han characters', () => {
  const result = engine.search('强化学习');
  assert(pages(result).includes('OsdNotes/test/han/'));
  assert(!pages(result).includes('OsdNotes/test/han-separated/'));
});
check('English deletion and adjacent transposition are corrected', () => {
  assert(pages(engine.search('reinforcment learning')).includes('OsdNotes/test/phrase/'));
  const transposed = engine.search('embdoied ai');
  assert.deepEqual(pages(transposed), ['OsdNotes/test/typo/']);
  assert(sections(transposed).some(item => Object.hasOwn(item.terms, 'embodied')));
});
check('digits and short acronyms are never corrected or substring-matched', () => {
  assert.equal(engine.search('2099').items.length, 0);
  assert.equal(engine.search('PPD').items.length, 0);
  assert.equal(engine.search('MPCD').items.length, 0);
  assert(!pages(engine.search('PPO')).includes('OsdNotes/test/substring/'));
  assert(pages(engine.search('CHEM 102')).includes('OsdNotes/test/numbers/'));
});
check('Greek and numeric version searches retain the actual model version', () => {
  assert.deepEqual(pages(engine.search('π0.7')), ['OsdNotes/test/numbers/']);
  assert.equal(engine.search('π0.8').items.length, 0);
});
check('unfinished last word is supported without broadening a completed query', () => {
  assert(pages(engine.search('reinforcement learn')).includes('OsdNotes/test/phrase/'));
  assert.equal(engine.search('reinforcement learn ').items.length, 0);
});
check('repeated terms require distinct occurrences', () => {
  assert.equal(engine.search('"learning learning"').items.length, 0);
});
check('multi-word matches highlight the full phrase without isolated title words', () => {
  const target = make(fixture('highlight', 'Learning reference', '<p>reinforcement learning，完整内容（示例）。</p>'));
  const item = sections(target.search('reinforcement learning'))[0];
  assert.equal(item.title, 'Learning reference');
  assert.match(item.text, /<mark>reinforcement learning<\/mark>，完整内容（示例）。/);
});
check('normalization preserves author punctuation and maps expanded-character offsets', () => {
  const target = make(fixture('unicode', 'ﬃ ＡＩ：示例', '<p>⑩ ﬃ：reinforcement learning，完整内容（示例）。</p>'));
  const item = sections(target.search('reinforcement learning'))[0];
  assert.match(item.text, /⑩ ﬃ：<mark>reinforcement learning<\/mark>，完整内容（示例）。/);
  const titleHit = sections(target.search('ffi ai'))[0];
  assert.equal(titleHit.title, '<mark>ﬃ ＡＩ</mark>：示例');
});
check('ambiguous fuzzy words use the closest distinct assignment', () => {
  const target = make([
    ...fixture('closest', 'Target', '<p>aaaaa gap aaabb gap aaaab</p>'),
    ...fixture('distant', 'Target', '<p>aaaac gap aaabb gap aaabd</p>')
  ]);
  assert.equal(pages(target.search('aaaaa aaaab aaaba'))[0], 'OsdNotes/test/closest/');
});
check('many repeated words do not create a permutation search', () => {
  const target = make(fixture('repeated', 'Repeated tokens', '<p>' + 'learning learning filler '.repeat(12) + '</p>'));
  const start = performance.now();
  assert.equal(target.search(Array(12).fill('learning').join(' ')).items.length, 1);
  assert(performance.now() - start < 1500, 'bounded matching should finish without factorial work');
});
check('empty and punctuation-only queries return no results', () => {
  for (const q of ['', '   ', '""', '!!!']) assert.equal(engine.search(q).items.length, 0);
});
check('snippets center a late match and only emit escaped text plus safe paragraph/highlight tags', () => {
  const unsafe = make(fixture('safe', 'Safe title', '<p>' + 'unrelated '.repeat(90) +
    '<img src=x onerror=alert(1)> reinforcement learning &lt;script&gt;alert(1)&lt;/script&gt; &amp; other text.</p>'));
  const result = unsafe.search('reinforcement learning');
  const item = sections(result)[0];
  assert(item, 'expected matching section');
  assert.match(item.text, /reinforcement/);
  assert.match(item.text, /learning/);
  assert.match(item.text, /<mark>/);
  assert(item.text.length < 1000, 'snippet should be bounded');
  assert.doesNotMatch(snippetHtml(item) + item.title, /<(?!\/?(?:mark|p)>)/i);
  assert.doesNotMatch(item.text, /onerror=/i);
});
check('compact late-hit excerpts center the full phrase with literal truncation markers', () => {
  const target = make(fixture('compact', 'Target', '<p>' + 'earlier context '.repeat(35) + 'reinforcement learning ' + 'later context '.repeat(35) + '</p>'));
  const item = sections(target.search('reinforcement learning'))[0];
  assert.match(item.text, /^<p>\.\.\./);
  assert.match(item.text, /\.\.\.<\/p>$/);
  assert.match(item.text, /<mark>reinforcement learning<\/mark>/);
  const visible = item.text.replace(/<[^>]*>/g, '');
  const before = visible.indexOf('reinforcement learning');
  const after = visible.length - before - 'reinforcement learning'.length;
  assert(Math.abs(before - after) < 20, 'context should be balanced around the complete phrase');
  assert(visible.length < 520, 'bounded source should provide enough context for two wider lines');
});
check('wide-script excerpts use a smaller character budget and keep the keyword centered', () => {
  const target = make(fixture('compact-han', 'Target', '<p>' + '前文背景说明'.repeat(35) + '强化学习' + '后文背景说明'.repeat(35) + '</p>'));
  const item = sections(target.search('强化学习'))[0];
  assert.match(item.text, /^<p>\.\.\./);
  assert.match(item.text, /\.\.\.<\/p>$/);
  assert.match(item.text, /<mark>强化学习<\/mark>/);
  const visible = item.text.replace(/<[^>]*>/g, '');
  assert(visible.length <= 210, 'Han characters take more visual room than Latin letters');
  const before = visible.indexOf('强化学习');
  assert(Math.abs(before - (visible.length - before - 4)) <= 3);
});
check('short excerpts do not imply truncation and long match spans keep every concept', () => {
  const short = sections(engine.search('reinforcement learning')).find(item => item.location.includes('/phrase/'));
  assert.equal(snippetHtml(short), '<p><mark>reinforcement learning</mark> supports robotics.</p>');
  const target = make(fixture('long-match', 'Target', '<p>' + 'before '.repeat(30) + 'alpha ' + ('contextual'.repeat(4) + ' ').repeat(4) + 'beta ' + 'after '.repeat(30) + '</p>'));
  const item = sections(target.search('alpha beta'))[0];
  assert(item, 'expected a bounded nearby match');
  assert.match(item.text, /<mark>alpha<\/mark>/);
  assert.match(item.text, /<mark>beta<\/mark>/);
});
check('excerpt boundaries preserve complete emoji clusters and surrogate pairs', () => {
  const emoji = '👩🏽‍💻';
  const target = make(fixture('compact-emoji', 'Target', '<p>' + emoji.repeat(75) + ' reinforcement learning ' + emoji.repeat(75) + '</p>'));
  const item = sections(target.search('reinforcement learning'))[0];
  assert.match(item.text, /<mark>reinforcement learning<\/mark>/);
  const remaining = item.text.replace(/<[^>]*>/g, '').replace(/reinforcement learning/g, '').replace(/\.\.\./g, '').replaceAll(emoji, '').trim();
  assert.equal(remaining, '', 'truncation must not leave a partial emoji cluster');
});
check('excerpts include adjacent section blocks instead of only one short matching sentence', () => {
  const target = make(fixture('section-context', 'Target', '<p>Earlier paragraph supplies context.</p><p>2s orbital.</p><p>Later paragraph explains electron energy.</p>'));
  const item = sections(target.search('2s'))[0];
  assert.match(item.text, /Earlier paragraph supplies context\. <mark>2s<\/mark> orbital\. Later paragraph explains electron energy\./);
});
check('heading-only hits excerpt their section body instead of duplicating the heading', () => {
  const target = make([
    ...fixture('heading-context', '2s orbital target', '<p>The s and p orbitals are mixed together into equivalent orbitals.</p>', 'target'),
    {location: 'OsdNotes/test/heading-context/#other', title: 'Other section', text: '<p>Unrelated neighbouring section must not enter the excerpt.</p>'}
  ]);
  const item = sections(target.search('2s'))[0];
  assert.match(item.title, /<mark>2s<\/mark>/);
  assert.equal(snippetHtml(item), '<p>The s and p orbitals are mixed together into equivalent orbitals.</p>');
  assert.doesNotMatch(item.text, /Unrelated neighbouring/);
});
check('snippets start at the first body keyword even when a later phrase ranks better', () => {
  const target = make(fixture('first-keyword', 'Target', '<p>First reinforcement reference has useful context.</p><p>' +
    'unrelated explanation '.repeat(90) + '</p><p>Later reinforcement learning phrase has different context.</p>'));
  const item = sections(target.search('reinforcement learning'))[0];
  const segments = snippetSegments(item);
  assert.equal(segments[0].index, 0);
  assert.match(segments[0].html, /First <mark>reinforcement<\/mark> reference/);
  assert.match(segments[1].html, /Later <mark>reinforcement learning<\/mark> phrase/);
  assert.match(item.text, /<\/span> \.\.\. <span/);
  assert.equal(item.score > 499000, true, 'later exact phrase still owns ranking');
});
check('quoted retrieval stays strict while excerpts follow the first highlighted body keyword', () => {
  const target = make([
    ...fixture('quoted-first', 'Target', '<p>First reinforcement reference supplies context.</p><p>' +
      'unrelated explanation '.repeat(90) + '</p><p>Later reinforcement learning phrase is the accepted query.</p>'),
    ...fixture('quoted-distractor', 'Target', '<p>reinforcement is separated from practical learning.</p>')
  ]);
  const result = target.search('"reinforcement learning"');
  assert.deepEqual(pages(result), ['OsdNotes/test/quoted-first/']);
  const segments = snippetSegments(sections(result)[0]);
  assert.match(segments[0].html, /First <mark>reinforcement<\/mark> reference/);
  assert.match(segments[1].html, /Later <mark>reinforcement learning<\/mark> phrase/);
});
check('distant repeated hits keep surrounding words and never copy the intervening chapter', () => {
  const target = make(fixture('repeated-excerpts', 'Target', '<p>First EDWIN context one.</p><p>' +
    'unrelated explanation '.repeat(80) + '</p><p>Second EDWIN context two.</p><p>' +
    'other unrelated explanation '.repeat(80) + '</p><p>Third EDWIN context three.</p>'));
  const item = sections(target.search('edwin'))[0];
  const segments = snippetSegments(item);
  assert.equal(segments.length, 3);
  for (const [index, word] of ['First', 'Second', 'Third'].entries()) {
    assert.equal(segments[index].index, index);
    assert.match(segments[index].html, new RegExp(word + ' <mark>EDWIN</mark> context'));
  }
  assert(snippetHtml(item).length < 550, 'source budget is shared by distant excerpts');
});
check('Chinese excerpts preserve first-match context and later contexts with ellipses', () => {
  const target = make(fixture('first-han', 'Target', '<p>首次强化学习帮助机器人行动。</p><p>' + '不相关说明'.repeat(90) +
    '</p><p>随后强化学习用于实际部署。</p>'));
  const item = sections(target.search('强化学习'))[0];
  const segments = snippetSegments(item);
  assert.match(segments[0].html, /首次<mark>强化学习<\/mark>帮助机器人/);
  assert.match(segments[1].html, /随后<mark>强化学习<\/mark>用于实际部署/);
});
check('first fuzzy and prefix variants appear in snippets and destination highlighting terms', () => {
  for (const [query, first, later, mode] of [
    ['reinforcment', 'reinforcemeut', 'reinforcement', 'fuzzy'],
    ['embod', 'embodiment', 'embodied', 'prefix']
  ]) {
    const target = make(fixture('first-' + mode, 'Target', '<p>First ' + first + ' contextual occurrence.</p><p>' +
      'unrelated explanation '.repeat(90) + '</p><p>Later ' + later + ' preferred short hit.</p>'));
    const result = target.search(query), item = sections(result)[0];
    assert.equal(result.mode, mode);
    assert.match(snippetSegments(item)[0].html, new RegExp('First <mark>' + first + '</mark> contextual'));
    assert.equal(item.terms[first], true);
    assert.equal(item.terms[later], true);
  }
});
check('snippet segments retain escaped author code and complete matching formulas', () => {
  const formula = '$$x + target + y$$';
  const target = make(fixture('safe-segments', 'Target', '<pre>First &lt;script&gt;target&lt;/script&gt; code context.</pre><p>' +
    'unrelated '.repeat(90) + '</p><p>Later ' + formula + ' formula context.</p>'));
  const item = sections(target.search('target'))[0];
  const segments = snippetSegments(item);
  assert.match(segments[0].html, /&lt;script&gt;<mark>target<\/mark>&lt;\/script&gt;/);
  assert.match(segments[1].html, /\$\$x \+ <mark>target<\/mark> \+ y\$\$/);
  assert.doesNotMatch(snippetHtml(item), /<(?!\/?(?:p|mark|code)>)/);
  assert.match(segments[0].html, /<code>First &lt;script&gt;<mark>target<\/mark>&lt;\/script&gt; code context\.<\/code>/);
});
check('Bash and inline code retain literal dollars and safe code provenance in snippets and titles', () => {
  const bash = String.raw`WANDB_OFFLINE_DIR="$RUN_DIR/wandb/&lt;WANDB_OFFLINE_RUN_DIR&gt;"
wandb sync "$WANDB_OFFLINE_DIR"`;
  const target = make(fixture('bash-provenance', 'Use <code>run ID</code>', '<p>Check run ID.</p><pre><code>' + bash + '</code></pre><p>Formula \\(x_2\\) and <code>"$REPO_ROOT"</code>.</p>'));
  const item = sections(target.search('run ID'))[0];
  assert.match(item.title, /<code><mark>run ID<\/mark><\/code>/);
  assert.match(item.text, /<code>WANDB_OFFLINE_DIR=&quot;\$RUN_DIR\/wandb\/&lt;WANDB_OFFLINE_RUN_DIR&gt;&quot;<\/code>/);
  assert.match(item.text, /<code>wandb sync &quot;\$WANDB_OFFLINE_DIR&quot;<\/code>/);
  assert.match(item.text, /Formula \\\(x_2\\\) and <code>&quot;\$REPO_ROOT&quot;<\/code>/);
  assert.doesNotMatch(item.text, /<(?!\/?(?:p|mark|code)>|span data-edwinos-search-segment="\d+" data-start-truncated="(?:true|false)" data-end-truncated="(?:true|false)">|\/span>)/);
  const variable = sections(target.search('WANDB_OFFLINE_DIR'))[0];
  assert.match(variable.text, /<code><mark>WANDB_OFFLINE_DIR<\/mark>=&quot;\$RUN_DIR/);
  const clipped = make(fixture('clipped-code', 'Code target', '<pre><code>' + 'context '.repeat(90) + 'target "$REPO_ROOT" ' + 'context '.repeat(90) + '</code></pre>'));
  assert.match(sections(clipped.search('target'))[0].text, /<code>[\s\S]*<mark>target<\/mark>[\s\S]*<\/code>/);
});
check('Material result groups carry one parent and object-valued highlight terms', () => {
  for (const group of engine.search('reinforcement learning').items) {
    assert.equal(group.filter(item => !item.location.includes('#')).length, 1);
    for (const item of group) {
      assert.equal(typeof item.title, 'string');
      assert.equal(typeof item.text, 'string');
      assert.equal(typeof item.terms, 'object');
      assert(!Array.isArray(item.terms));
    }
  }
});
check('excerpt boundaries preserve complete matching TeX and omit sliced context formulas', () => {
  for (const [open, close] of [['\\(', '\\)'], ['\\[', '\\]'], ['$', '$'], ['$$', '$$']]) {
    const formula = open + 'x + '.repeat(50) + 'target + ' + 'y + '.repeat(50) + 'z' + close;
    const target = make(fixture('math-hit', 'Formula example', '<p>context ' + formula + ' context</p>'));
    const item = sections(target.search('target'))[0];
    assert(item.text.includes(open) && item.text.includes(close), 'matching formula keeps both delimiters');
    assert.match(item.text, /<mark>target<\/mark>/);
    assert(item.text.includes('x + '.repeat(50)) && item.text.includes('y + '.repeat(50)), 'matching formula remains complete');
    const edges = make(fixture('math-edges', 'Context formulas', '<p>' + formula + ' keyword ' + formula + '</p>'));
    const edgeItem = sections(edges.search('keyword'))[0];
    assert.equal(snippetHtml(edgeItem), '<p>... <mark>keyword</mark> ...</p>');
  }
});
check('serialized and runtime-built indexes have equivalent results', () => {
  const serialized = JSON.parse(JSON.stringify(engineApi.buildSerializedIndex(basicDocs, lunr)));
  const prepared = engineApi.createEngine(basicDocs, lunr, serialized);
  for (const q of ['reinforcement learning', 'reinforcment learning', 'embdoied ai', '强化学习 PPO', 'π0.7', 'PPO', '2099']) {
    assert.deepEqual(locations(prepared.search(q)), locations(engine.search(q)), q);
  }
});

// Verified targets from the isolated 24-query comparison. Lists are deliberately
// non-exhaustive: these are target hit checks, not a claim of 90% relevance.
const hua = 'Hua Chen - Embodied AI & Humanoid Robots';
const rfm = '仿真框架RFM的初步学习';
const realCases = [
  ['reinforcement learning', [hua]], ['reinforcment learning', [hua]],
  ['embodied ai', [hua]], ['embdoied ai', [hua]],
  ['diffusion policy', [rfm, 'Diffusion Policy数据训练流程']],
  ['difusion policy', [rfm, 'Diffusion Policy数据训练流程']],
  ['sim2real', ['具身智能基础路线']], ['sim-to-real gap', [hua]],
  ['markov decision process', [rfm]], ['proximal policy optimization', [rfm]],
  ['mass spectrometer', ['CHEM 102']], ['强化学习', [hua, rfm]],
  ['强化学习 PPO', [rfm]], ['仿真到真机', ['具身智能基础路线']],
  ['积分 sympy', ['CS101/Python']],
  ['nvidia-smi', ['Bash命令与服务器训练操作查表指南', 'Diffusion Policy数据训练流程']],
  ['CUDA_VISIBLE_DEVICES', ['Bash命令与服务器训练操作查表指南']],
  ['F=ma', ['CHEM 102']], ['entropy', ['基于Ubuntu+RTX50系列的Isaac Lab仿真框架搭建指南']],
  ['PPO', [rfm]], ['MPC', [hua]], ['CHEM 102', ['CHEM 102']],
  ['2099', []], ['xqzvnotarealword', []]
];
const corpusPath = path.resolve(process.argv[2] || path.join(root, 'site/search/search_index.json'));
assert(fs.existsSync(corpusPath), 'Build the site first, or pass a search_index.json path.');
let corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
if (corpus.config && corpus.config.edwinos_corpus) {
  const workerURL = pathToFileURL(path.resolve(path.dirname(corpusPath), '../assets/javascripts/workers/search-exact-worker.js'));
  const corpusURL = new URL(corpus.config.edwinos_corpus, workerURL);
  assert.equal(corpusURL.protocol, 'file:', 'local tests must resolve a local corpus');
  corpus = JSON.parse(fs.readFileSync(fileURLToPath(corpusURL), 'utf8'));
}
const realEngine = make(corpus.docs);
check('real corpus: Homonuclear 2s is a true formula match and preserves its keyword and delimiters', () => {
  const item = sections(realEngine.search('2s')).find(item => item.location.endsWith('#homonuclear-diatomic-molecules'));
  assert(item, 'expected actual orbital formula match');
  assert.match(item.text, /\\\(σ_\{<mark>2s<\/mark>\}\\\)/);
  assert.match(item.text, /两个硼原子共6个价电子/);
});
check('real corpus: short 2s paragraphs receive the rest of their own section context', () => {
  const item = sections(realEngine.search('2s')).find(item => item.location.endsWith('#penetration-effect'));
  assert.match(item.text, /<mark>2s<\/mark>电子比一次更容易渗透到原子核/);
  assert.match(item.text, /更强烈地吸引原子核/);
  assert.match(item.text, /能量比2p轨道低/);
});
check('real corpus: exact chemistry hits always expose 2s in a highlighted title or excerpt', () => {
  for (const item of realEngine.search('2s').items.flat().filter(item => item.score > 0)) {
    assert.match(item.title + item.text, /<mark>2s<\/mark>/, item.location);
  }
});
for (const [q, targets] of realCases) {
  check('real corpus: ' + q, () => {
    const result = realEngine.search(q);
    if (!targets.length) return assert.equal(result.items.length, 0);
    const topFive = pages(result).slice(0, 5).map(decodeURIComponent);
    assert(topFive.some(p => targets.some(target => p.includes(target))), JSON.stringify(topFive));
  });
}

async function runWorker(setupData, queries, expectPrepared = false) {
  const origin = 'http://edwinos.test';
  const href = origin + '/assets/javascripts/workers/search-exact-worker.js';
  const listeners = [];
  const messages = [];
  const context = {
    URL, console, performance, setTimeout, clearTimeout,
    location: {href, origin},
    postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); },
    addEventListener(type, listener) { if (type === 'message') listeners.push(listener); }
  };
  context.self = context;
  vm.createContext(context);
  context.importScripts = (...urls) => {
    for (const value of urls) {
      const url = new URL(value, href);
      assert.equal(url.origin, origin, 'worker scripts must be same-origin');
      const file = path.resolve(root, 'docs', '.' + decodeURIComponent(url.pathname));
      assert(!path.relative(path.join(root, 'docs'), file).startsWith('..'), 'script traversal');
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
      if (expectPrepared && path.basename(file) === 'lunr.min.js') {
        // Loading a ready index must avoid the expensive browser-side add loop.
        context.lunr.Builder.prototype.add = function () {
          throw new Error('Prepared worker setup unexpectedly rebuilt the index');
        };
      }
    }
  };
  const workerPath = path.join(assets, 'workers/search-exact-worker.js');
  vm.runInContext(fs.readFileSync(workerPath, 'utf8'), context, {filename: workerPath});
  function dispatch(data) { for (const listener of listeners) listener({data}); }
  dispatch({type: 0, data: setupData});
  await new Promise(resolve => setImmediate(resolve));
  for (const q of queries) dispatch({type: 2, data: q});
  return messages;
}
async function checkAsync(name, run) {
  await run();
  checks++;
  console.log('PASS ' + name);
}
async function workerChecks() {
await checkAsync('worker INIT and rapid QUERY messages preserve response order and Material shape', async () => {
  const queries = ['reinforcement learning', 'embdoied ai', '2099', '强化学习 PPO', ''];
  const data = {docs: basicDocs, config: {lang: ['en'], separator: '[\\s\\-]+'}};
  for (const prepared of [null, engineApi.buildSerializedIndex(basicDocs, lunr)]) {
    const messages = await runWorker({...data, config: {...data.config, ...(prepared ? {edwinos_index: prepared} : {})}}, queries, Boolean(prepared));
    assert.deepEqual(messages.map(message => message.type), [1, ...queries.map(() => 3)]);
    for (let i = 0; i < queries.length; i++) {
      assert.deepEqual(locations(messages[i + 1].data), locations(engine.search(queries[i])), queries[i]);
    }
  }
});
await checkAsync('invalid prepared index falls back to runtime indexing instead of losing search', async () => {
  const messages = await runWorker({docs: basicDocs, config: {edwinos_index: {version: 0, tokenizer: 'outdated', index: {}}}}, ['reinforcement learning']);
  assert.deepEqual(messages.map(message => message.type), [1, 3]);
  assert.deepEqual(locations(messages[1].data), locations(engine.search('reinforcement learning')));
});

console.log(`Search engine: ${checks} checks passed (${corpus.docs.length} real index records).`);
}
workerChecks().catch(error => { console.error(error); process.exitCode = 1; });
