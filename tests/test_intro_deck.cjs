'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const box = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'docs/javascripts/intro-questions.js'), 'utf8'), box);
const questions = box.window.EdwinOSIntroQuestions;
const {create, KEY} = require('../docs/javascripts/intro-deck.js');
const map = new Map();
const storage = {getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value)};
let previous = null, robots = 0;
const othersByCategory = new Map();
const seenFirstTwo = new Set();
for (let i = 0; i < 300; i++) {
  const next = create({questions, storage, seed: 1234}).next();
  assert(next);
  assert.notEqual(next.id, previous, `immediate repeat at visit ${i}`);
  previous = next.id;
  if (next.category === 'robotics') robots++;
  else othersByCategory.set(next.category, (othersByCategory.get(next.category) || 0) + 1);
  if (i < 36) seenFirstTwo.add(next.id); // 18 cards/deck with this pool.
}
assert(Math.abs(robots / 300 - 2 / 3) <= .05, `robot share ${robots / 300}`);
assert(Math.max(...othersByCategory.values()) - Math.min(...othersByCategory.values()) <= 2, 'other categories rotate evenly');
assert.deepEqual([...seenFirstTwo].sort(), Array.from(questions, q => q.id).sort());
// Forcing a card also sets the cross-visit last-card guard.
assert.equal(create({questions, storage, seed: 1234, forcedId: 'sim-gap'}).next().id, 'sim-gap');
assert.notEqual(create({questions, storage, seed: 1234}).next().id, 'sim-gap');
// Pool changes invalidate the stored deck.
create({questions: questions.slice(1), storage, seed: 1234}).next();
assert(!JSON.parse(map.get(KEY)).deck.includes('sim-gap'));
console.log(`300 visits: ${robots} robotics, no repeats, all ${questions.length} questions in first two decks`);
// Exercise boundary ordering across many deterministic shuffles, including seed 14.
for (let seed = 1; seed <= 1000; seed++) {
  const values = new Map();
  const store = {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
  let last = null;
  for (let i = 0; i < 72; i++) {
    const q = create({questions, storage: store, seed}).next();
    assert.notEqual(q.id, last, `seed ${seed}, visit ${i}`);
    last = q.id;
  }
}
console.log('1000 seeds × 72 visits: no adjacent repeats');
