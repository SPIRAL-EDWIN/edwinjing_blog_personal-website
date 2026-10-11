#!/usr/bin/env node
/* Failure and navigation recovery contracts; real network/MathJax browser QA is separate. */
'use strict';
const assert = require('node:assert/strict');
const {harness, element, highlight, settle} = require('./test_article_math.cjs');
function article(source = String.raw`\[x=1\]`) {
  return element('article', 'md-content__inner', element('div', 'arithmatex', source));
}
function status(root) { return root.querySelector('.edwinos-math-status'); }
function script(test) { return test.head.childNodes[0]; }
async function complete(test, startup) {
  test.installRuntime(startup);
  script(test).emit('load');
  await settle();
}
async function main() {
  // Slow requests remain single-flight through duplicate lifecycle emissions.
  const slowRoot = article();
  const slow = harness(slowRoot, '', {lazy: true});
  slow.navigate();
  slow.navigate();
  assert.equal(slow.head.childNodes.length, 1);
  slow.tick(400);
  assert.equal(status(slowRoot).hidden, false);
  assert.equal(slowRoot.querySelector('.arithmatex').dataset.edwinosMathState, 'pending');
  slow.tick(10000);
  assert.equal(slowRoot.querySelector('.arithmatex').dataset.edwinosMathState, 'slow', 'a stalled download reveals source without starting another request');
  assert.equal(slow.head.childNodes.length, 1);
  let ready;
  await complete(slow, new Promise(resolve => { ready = resolve; }));
  assert.equal(slow.calls.typeset.length, 0, 'script load alone must not typeset while MathJax startup is pending');
  ready();
  await settle();
  assert.equal(slow.calls.typeset.length, 1);
  assert.equal(status(slowRoot).hidden, true);

  // First transport error retries once and completes the current page.
  const recoveredRoot = article();
  const recovered = harness(recoveredRoot, '', {lazy: true});
  recovered.navigate();
  script(recovered).emit('error');
  await settle();
  assert.equal(recovered.head.childNodes.length, 0);
  assert.equal(status(recoveredRoot).dataset.state, 'retrying');
  recovered.tick(800);
  await settle();
  assert.equal(recovered.head.childNodes.length, 1);
  await complete(recovered);
  assert.equal(recovered.calls.typeset.length, 1);
  assert.equal(status(recoveredRoot).hidden, true);

  // Startup rejection removes the failed script/API and supports an explicit
  // retry after the one automatic attempt has also failed.
  const failedRoot = article();
  const failed = harness(failedRoot, '', {lazy: true});
  failed.navigate();
  await complete(failed, Promise.reject(new Error('extension startup unavailable')));
  assert.equal(failed.head.childNodes.length, 0);
  failed.tick(800);
  await settle();
  script(failed).emit('error');
  await settle();
  assert.equal(status(failedRoot).dataset.state, 'error');
  assert.equal(status(failedRoot).childNodes[1].hidden, false);
  assert.equal(failedRoot.querySelector('.arithmatex').textContent, String.raw`\[x=1\]`);
  status(failedRoot).childNodes[1].onclick();
  assert.equal(status(failedRoot).childNodes[1].hidden, true, 'retry cannot be spammed while the same download is pending');
  await complete(failed);
  assert.equal(status(failedRoot).hidden, true);

  // A rejected typeset restores valid source and author-authored nodes, then
  // manual retry succeeds without refreshing or replacing the article.
  const author = highlight('author', true);
  const typesetRoot = element('article', 'md-content__inner', element('div', 'arithmatex', String.raw`\[x+\text{`, author, String.raw`}\]`));
  const typeset = harness(typesetRoot);
  const typesetSuccess = typeset.window.MathJax.typesetPromise;
  typeset.window.MathJax.typesetPromise = targets => {
    targets[0].querySelector('.arithmatex').replaceChildren(element('mjx-container'));
    return Promise.reject(new Error('font/typeset failure'));
  };
  typeset.navigate();
  await settle();
  const formula = typesetRoot.querySelector('.arithmatex');
  assert.equal(formula.querySelector('mjx-container'), null);
  assert.equal(formula.textContent, String.raw`\[x+\text{author}\]`);
  assert.equal(formula.querySelector('mark').textContent, 'author');
  assert.equal(status(typesetRoot).dataset.state, 'error');
  assert.equal(status(typesetRoot).dataset.failureCode, 'Error');
  assert.equal(typeset.calls.warnings.length, 1, 'real failures leave a diagnostic without exposing stacks in article UI');
  typeset.window.MathJax.typesetPromise = typesetSuccess;
  status(typesetRoot).childNodes[1].onclick();
  await settle();
  assert(formula.querySelector('mjx-container'));
  assert.equal(status(typesetRoot).hidden, true);

  // Rapid navigation while the runtime is loading only typesets the latest
  // article and cannot write a stale failure/loading state into its UI.
  const oldRoot = article(String.raw`\[old\]`);
  const navigation = harness(oldRoot, '', {lazy: true});
  navigation.navigate();
  const nextRoot = article(String.raw`\[next\]`);
  navigation.body.replaceChildren(nextRoot);
  navigation.navigate();
  await complete(navigation);
  assert.equal(navigation.calls.typeset.length, 1);
  assert.deepEqual(navigation.calls.typeset[0].nodes, [nextRoot]);
  assert.equal(status(nextRoot).hidden, true);
  assert.equal(oldRoot.querySelector('mjx-container'), null);
  navigation.tick(10000);
  assert.equal(status(nextRoot).hidden, true);
  // Real Material TOCs expose both the outer NAV and its nested UL. A math
  // input discovered twice can try to replace a source already removed by the
  // first MathItem. Assert discovery uniqueness with the real nested shape.
  const nestedRoot = article();
  const nested = harness(nestedRoot);
  const tocFormula = element('span', 'arithmatex', String.raw`\(toc\)`);
  const tocList = element('ul', '', tocFormula);
  const tocNav = element('nav', 'md-nav--secondary', tocList);
  nested.body.appendChild(tocNav);
  const originalQuery = nested.document.querySelectorAll;
  nested.document.querySelectorAll = selector => selector === '[data-md-component="toc"], .md-nav--secondary'
    ? [tocNav, tocList] : originalQuery(selector);
  const renderNested = nested.window.MathJax.typesetPromise;
  nested.window.MathJax.typesetPromise = targets => {
    const discovered = targets.flatMap(target => target.querySelectorAll('.arithmatex'));
    assert.equal(new Set(discovered).size, discovered.length, 'no MathItem source may be discovered by overlapping targets');
    return renderNested(targets);
  };
  nested.navigate();
  await settle();
  assert.deepEqual(nested.calls.typeset[0].nodes, [nestedRoot, tocNav]);
  assert.equal(status(nestedRoot).hidden, true);
  assert(tocFormula.querySelector('mjx-container'));

  console.log('Math loading: startup readiness, slow single-flight source fallback, limited transport/startup retry, manual typeset recovery, stale navigation cancellation and nested TOC target ownership passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
