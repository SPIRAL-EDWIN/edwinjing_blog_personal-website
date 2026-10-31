const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {plan} = require('../docs/javascripts/intro-typing.js');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync('docs/javascripts/intro-questions.js', 'utf8'), context);
const questions = context.window.EdwinOSIntroQuestions;
function seeded(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
const types = new Set();
let injected = 0;
const distribution = {substitute: 0, swap: 0, double: 0, skip: 0};
const probabilityRng = seeded(8571009);
for (let i = 0; i < 30000; i++) { const p = plan(questions[i % questions.length].text, {rng: probabilityRng}); if (p.typo) { injected++; distribution[p.typo.kind]++; } }
assert(Math.abs(injected / 30000 - .7) < .02);
for (const [kind, expected] of Object.entries({substitute:.5, swap:.25, double:.15, skip:.1})) assert(Math.abs(distribution[kind] / injected - expected) < .025, `${kind}: ${distribution[kind] / injected}`);
for (const {text} of questions) {
  for (let seed = 0; seed < 500; seed++) {
    for (const forced of [true, false]) {
      const result = plan(text, {rng: seeded(Math.imul(seed, 2654435761) >>> 0), typo: forced});
      assert.equal(result.final, text);
      assert.equal(result.events.at(-1).value, text);
      assert(result.duration <= 3800.0001, `${text}: ${result.duration}`);
      if (!forced) { assert.equal(result.typo, null); assert(!result.events.some(e => e.phase === 'erase')); continue; }
      assert(result.typo, `no eligible typo for ${text}`);
      types.add(result.typo.kind);
      const t = result.typo;
      const token = text.slice(0,t.index).match(/[A-Za-z0-9]*$/)[0] + text.slice(t.index).match(/^[A-Za-z0-9]*/)[0];
      assert(token.length >= 4 && !/\d/.test(token));
      assert(text.slice(0,t.index).match(/[A-Za-z]+$/));
      assert(text.slice(t.index).match(/\s/), 'typo must precede last word');
      assert(result.events.some(e => e.phase === 'erase'));
      for (const e of result.events.filter(e => e.phase === 'erase')) assert(e.delay >= 55 && e.delay <= 80);
    }
  }
}
assert.deepEqual([...types].sort(), ['double','skip','substitute','swap']);
console.log(`Typing plans: ${questions.length} questions, 500 seeds, all typo types; final text and timings pass.`);
