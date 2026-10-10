#!/usr/bin/env node
'use strict';

// Exercise the startup protocol without a browser or network. Relevance and
// prepared-index compatibility stay covered by test_search_engine.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../docs/assets/javascripts/workers/search-exact-worker.js'), 'utf8');
const manifest = {config: {separator: '[\\s\\-]+', edwinos_corpus: '../../../search/edwinos_corpus.fixture.json'}, docs: []};
const corpus = {config: {edwinos_index: {prepared: true}}, docs: [{location: 'OsdNotes/test/'}]};
const flush = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;

function harness(fetchResponse = async () => ({ok: true, json: async () => corpus}), beforeImport = () => {}) {
  const messages = [], imports = [], requests = [], builds = [];
  let listener;
  const context = {
    URL,
    console: {error() {}},
    location: {href: 'https://edwinos.test/subsite/assets/javascripts/workers/search-exact-worker.js?v=test', origin: 'https://edwinos.test'},
    addEventListener(type, callback) { if (type === 'message') listener = callback; },
    postMessage(value) { messages.push(JSON.parse(JSON.stringify(value))); },
    fetch(url, options) { requests.push({url, options}); return fetchResponse(url, options); },
    importScripts(...urls) {
      imports.push(...urls);
      beforeImport();
      context.lunr = {};
      context.EdwinSearch = {createEngine(docs, lunr, prepared) {
        builds.push({docs, prepared});
        return {search(value) { return {items: [[{location: 'OsdNotes/test/', title: value, text: '', terms: {}}]]}; }};
      }};
    }
  };
  context.self = context;
  vm.runInNewContext(source, context);
  return {messages, imports, requests, builds, send(value) {listener({data: value});}};
}

async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('manifest SETUP costs no corpus request, script imports or index build', async () => {
    const worker = harness();
    worker.send({type: 0, data: manifest});
    await flush();
    assert.deepEqual(worker.messages, []);
    assert.equal(worker.imports.length + worker.requests.length + worker.builds.length, 0);
    worker.send({type: 4});
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [1]);
    assert.equal(worker.requests.length, 1);
    assert.equal(worker.requests[0].url, 'https://edwinos.test/subsite/search/edwinos_corpus.fixture.json');
    assert.equal(worker.requests[0].options.cache, 'force-cache');
    assert.equal(worker.imports.length, 2);
    assert.equal(worker.builds.length, 1);
    assert.equal(worker.builds[0].prepared.prepared, true);
    worker.send({type: 4});
    await flush();
    assert.equal(worker.requests.length, 1);
  });
  await check('intent before Material SETUP survives and starts exactly once', async () => {
    const worker = harness();
    worker.send({type: 4});
    await flush();
    assert.equal(worker.requests.length, 0);
    worker.send({type: 0, data: manifest});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [1]);
    assert.equal(worker.requests.length, 1);
  });
  await check('loading queries retain the latest input and preserve standard READY then RESULT', async () => {
    let resolveResponse;
    const worker = harness(() => new Promise(resolve => {resolveResponse = resolve;}));
    worker.send({type: 0, data: manifest});
    worker.send({type: 2, data: 'old'});
    worker.send({type: 2, data: 'latest'});
    await flush();
    assert.equal(worker.requests.length, 1);
    assert.equal(worker.imports.length, 2, 'libraries load while the corpus response remains pending');
    assert.equal(worker.builds.length, 0);
    assert.deepEqual(worker.messages, []);
    resolveResponse({ok: true, json: async () => corpus});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [1, 3]);
    assert.equal(worker.messages[1].data.items[0][0].title, 'latest');
    worker.send({type: 2, data: ''});
    assert.equal(worker.messages[2].type, 3);
    assert.equal(worker.messages[2].data.items[0][0].title, '');
  });
  await check('corpus failures never fake readiness and a later intent retries', async () => {
    let attempts = 0;
    const worker = harness(async () => ++attempts === 1 ? {ok: false, status: 503} : {ok: true, json: async () => corpus});
    worker.send({type: 0, data: manifest});
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [5]);
    assert.equal(worker.messages[0].data.status, 'error');
    assert.equal(worker.builds.length, 0);
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [5, 1]);
    assert.equal(worker.requests[1].options.cache, 'reload');
    assert.equal(worker.imports.length, 2, 'successful scripts are reused after a failed corpus fetch');
  });
  await check('cross-origin and malformed corpus fail without creating a partial engine', async () => {
    const worker = harness();
    worker.send({type: 0, data: {config: {edwinos_corpus: 'https://other.test/corpus.json'}, docs: []}});
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [5]);
    assert.equal(worker.requests.length, 0);
    const invalid = harness(async () => ({ok: true, json: async () => ({docs: null})}));
    invalid.send({type: 0, data: manifest});
    invalid.send({type: 4});
    await flush();
    assert.deepEqual(invalid.messages.map(item => item.type), [5]);
    assert.equal(invalid.builds.length, 0);
  });
  await check('concurrent script and network failure are handled and library loading can retry', async () => {
    let fetchAttempts = 0, importAttempts = 0;
    const worker = harness(
      async () => {
        if (++fetchAttempts === 1) throw new Error('network offline');
        return {ok: true, json: async () => corpus};
      },
      () => { if (++importAttempts === 1) throw new Error('script unavailable'); }
    );
    worker.send({type: 0, data: manifest});
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [5]);
    assert.equal(worker.builds.length, 0);
    worker.send({type: 4});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [5, 1]);
    assert.equal(importAttempts, 2);
    assert.equal(fetchAttempts, 2);
  });
  await check('full legacy SETUP remains eager without fetching a corpus', async () => {
    const worker = harness();
    worker.send({type: 0, data: corpus});
    await flush();
    assert.deepEqual(worker.messages.map(item => item.type), [1]);
    assert.equal(worker.requests.length, 0);
    assert.equal(worker.builds.length, 1);
  });
  console.log(`Search worker lifecycle: ${checks} checks passed.`);
}
main().catch(error => {console.error(error); process.exitCode = 1;});
