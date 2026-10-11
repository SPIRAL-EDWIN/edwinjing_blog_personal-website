/* Checker guard/readiness unit coverage; no browser dependency. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/check_ui_equivalence.cjs', 'utf8');
const start = source.indexOf('async function waitForSearchResults(page)');
const end = source.indexOf('\nasync function captureFragment', start);
assert(start !== -1 && end > start, 'query assertion owner must remain discoverable');

const guardStart = source.indexOf('const fragmentStates =');
const guardEnd = source.indexOf('const dependencyVersions =', guardStart);
assert(guardStart !== -1 && guardEnd > guardStart, 'fragment mode guard must remain discoverable');
const guardSource = source.slice(guardStart, guardEnd);
function guard(states, comparisonMode, routes) {
  return () => vm.runInNewContext(guardSource, {
    states, comparisonMode, routes, URL, origin: 'http://edwinos.test'
  });
}
assert.doesNotThrow(guard(['rest'], 'same-page', ['/']));
for (const state of ['fragment-pinned', 'fragment-fading', 'fragment-released', 'fragment-cleared']) {
  assert.throws(guard([state], 'same-page', ['/HOME/Archive/#archive-year-2026']), /require COMPARISON_MODE=fresh-page/);
  assert.throws(guard([state], 'fresh-page', ['/HOME/Archive/']), /require a heading hash/);
  assert.doesNotThrow(guard([state], 'fresh-page', ['/HOME/Archive/#archive-year-2026']));
}
const initialScheme = vm.runInNewContext(guardSource + '; initialFragmentScheme;', {
  states: ['rest'], comparisonMode: 'fresh-page', routes: ['/'], URL, origin: 'http://edwinos.test'
});
for (const state of ['fragment-pinned', 'fragment-fading', 'fragment-released', 'fragment-cleared']) {
  assert.equal(initialScheme(state, 'default'), 'light');
  assert.equal(initialScheme(state, 'slate'), 'dark');
}
assert.equal(initialScheme('query', 'slate'), undefined, 'ordinary interaction setup is unchanged');

const argsStart = source.indexOf('if (!Array.isArray(browserArgs)');
const argsEnd = source.indexOf('for (const [name, values]', argsStart);
assert(argsStart !== -1 && argsEnd > argsStart, 'browser launch guard must remain discoverable');
const argsGuard = value => () => vm.runInNewContext(source.slice(argsStart, argsEnd), { browserArgs: value });
assert.doesNotThrow(argsGuard([]));
assert.doesNotThrow(argsGuard(['--disable-gpu', '--use-angle=swiftshader']));
for (const value of ['--disable-gpu', null, [''], ['  '], [5]])
  assert.throws(argsGuard(value), /BROWSER_ARGS must be a JSON array of nonempty strings/);

const tocStart = source.indexOf('function assertTocReleasePrerequisite(');
const tocEnd = source.indexOf('\nfunction compareSnapshots', tocStart);
assert(tocStart !== -1 && tocEnd > tocStart, 'TOC release prerequisite must remain discoverable');
const tocGuard = vm.runInNewContext(source.slice(tocStart, tocEnd) + '; assertTocReleasePrerequisite;');
assert.doesNotThrow(() => tocGuard({ visibleMatchingLinks: 0, selectedMatchingLinks: 0 }));
assert.doesNotThrow(() => tocGuard({ visibleMatchingLinks: 1, selectedMatchingLinks: 1 }));
assert.throws(() => tocGuard({ visibleMatchingLinks: 1, selectedMatchingLinks: 0 }), /no selected visible target to release/);

function fixture(sets) {
  let now = 0, read = 0;
  const context = {
    Date: { now: () => now }, URL,
    location: { href: 'http://edwinos.test/' },
    setTimeout: fn => { now += 100; fn(); },
    document: {
      querySelectorAll: () => sets[Math.min(read++, sets.length - 1)]
        .map(href => ({ getAttribute: () => href })),
      querySelector: () => ({ value: 'reward' })
    }
  };
  vm.createContext(context);
  const check = vm.runInContext(source.slice(start, end) + '; waitForSearchResults;', context);
  return () => check({ evaluate: callback => callback() });
}

(async () => {
  const cleanupStart = source.indexOf('function recordError(');
  let reports = 0;
  const cleanup = vm.runInNewContext(source.slice(cleanupStart, tocStart) + '; closeBounded;', {
    writeReport: () => { reports++; },
    setTimeout: callback => { callback(); return 12; }, clearTimeout() {}
  });
  const stalled = { close: () => new Promise(() => {}) };
  const original = { name: 'Error', message: 'primary capture failure' };
  const withPrimary = { error: original, cleanupErrors: [] };
  await cleanup(stalled, 'context', withPrimary);
  assert.equal(withPrimary.error, original, 'cleanup must preserve the primary capture failure');
  assert.equal(withPrimary.status, 'error');
  assert.equal(withPrimary.cleanupErrors.length, 1);
  assert.equal(reports, 1, 'cleanup diagnostics must be persisted');
  const withoutPrimary = { error: null, cleanupErrors: [] };
  await assert.rejects(cleanup(stalled, 'browser', withoutPrimary), /cleanup timed out after 10000ms/);
  assert.equal(withoutPrimary.status, 'error');
  assert.match(withoutPrimary.error.message, /cleanup timed out/);

  const captureStart = source.indexOf('async function capture(page,');
  const captureEnd = source.indexOf('\nasync function captureState', captureStart);
  assert(captureStart !== -1 && captureEnd > captureStart, 'capture diagnostic bound must remain discoverable');
  const bounded = vm.runInNewContext(source.slice(captureStart, captureEnd) + '; capture;', {
    captureState: () => new Promise(() => {}),
    setTimeout: callback => { callback(); return 12; },
    clearTimeout: timer => assert.equal(timer, 12)
  });
  await assert.rejects(bounded({}, 'default', 'close', false, '/'), /Capture timed out after 30000ms: \/ default close/);
  const loaded = await fixture([[], [], ['/note/#first'], ['/note/#second']])();
  assert.equal(loaded.count, 1);
  assert.equal(loaded.destinations[0], '/note/#second');
  assert.equal(loaded.query, 'reward');
  assert.equal(loaded.stableForMs, 300);
  const multi = await fixture([['/one/', '/two/?h=reward#part']])();
  assert.equal(multi.count, 2);
  for (const invalid of [[], [''], ['#'], ['javascript:alert(1)']]) {
    await assert.rejects(fixture([invalid])(), /no stable, nonempty search destinations/);
  }
  const alternating = Array.from({ length: 151 }, (_, index) => [index % 2 ? '/a/' : '/b/']);
  await assert.rejects(fixture(alternating)(), /no stable, nonempty search destinations/);
  console.log('UI equivalence fragment-mode/query-readiness unit tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
