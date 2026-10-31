/* A typing plan is pure data so correction logic can be verified independently. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EdwinOSIntroTyping = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const neighbors = {
    a:'qwsz', b:'vghn', c:'xdfv', d:'serfcx', e:'wsdr', f:'drtgvc', g:'ftyhbv',
    h:'gyujnb', i:'ujko', j:'huikmn', k:'jiolm', l:'kop', m:'njk', n:'bhjm',
    o:'iklp', p:'ol', q:'wa', r:'edft', s:'awedxz', t:'rfgy', u:'yhji',
    v:'cfgb', w:'qase', x:'zsdc', y:'tghu', z:'asx'
  };
  const fastPairs = new Set(['th','he','in','er','an','re','on','at','en','nd','ti','es','or','te','of','ed','is','it','al','ar','st','to','nt','ng','se','ha','as','ou','io','le','ve','co','me','de','hi','ri','ro','ic','ne','ea']);
  const integer = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
  function gaussian(rng) {
    const u = Math.max(Number.EPSILON, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }
  function delayFor(text, i, rng) {
    let delay = Math.max(28, Math.min(45, 36 + gaussian(rng) * 4));
    if (i > 0 && fastPairs.has(text.slice(i - 1, i + 1).toLowerCase())) delay *= .86;
    if (text[i] === ' ') delay += 22;
    if (/[?,.!;:]/.test(text[i])) delay += 70;
    return delay;
  }
  function candidates(text, kind) {
    const words = [...text.matchAll(/[A-Za-z0-9]+/g)];
    const found = [];
    words.slice(0, -1).forEach(match => {
      const word = match[0];
      if (word.length < 4 || /\d/.test(word)) return;
      for (let i = 1; i < word.length; i++) {
        const c = word[i].toLowerCase();
        if (!neighbors[c]) continue;
        if (kind === 'swap' && (i + 1 >= word.length || word[i].toLowerCase() === word[i + 1].toLowerCase())) continue;
        found.push(match.index + i);
      }
    });
    return found;
  }
  function plan(text, options = {}) {
    const rng = options.rng || Math.random;
    const wantTypo = options.typo === undefined ? rng() < .7 : options.typo;
    let typo = null;
    if (wantTypo) {
      const roll = rng();
      const kind = roll < .5 ? 'substitute' : roll < .75 ? 'swap' : roll < .9 ? 'double' : 'skip';
      const eligible = candidates(text, kind);
      if (eligible.length) {
        const index = eligible[integer(rng, 0, eligible.length - 1)];
        const original = text[index];
        let wrong, consumed = 1;
        if (kind === 'substitute') {
          const keys = neighbors[original.toLowerCase()];
          wrong = keys[integer(rng, 0, keys.length - 1)];
          if (original === original.toUpperCase()) wrong = wrong.toUpperCase();
        } else if (kind === 'swap') { wrong = text[index + 1] + original; consumed = 2; }
        else if (kind === 'double') wrong = original + original;
        else wrong = '';
        typo = {kind, index, original: text.slice(index, index + consumed), wrong, consumed};
      }
    }
    const events = [];
    let value = '';
    function append(ch, delay, phase) { value += ch; events.push({value, delay, phase}); }
    function typeRange(start, end) { for (let i = start; i < end; i++) append(text[i], delayFor(text, i, rng), 'type'); }
    if (typo) {
      typeRange(0, typo.index);
      for (const c of typo.wrong) append(c, delayFor(text, typo.index, rng), 'mistake');
      const lagEnd = Math.min(text.length, typo.index + typo.consumed + integer(rng, 1, 3));
      typeRange(typo.index + typo.consumed, lagEnd);
      events.push({value, delay: integer(rng, 220, 420), phase: 'notice'});
      while (value.length > typo.index) {
        value = value.slice(0, -1);
        events.push({value, delay: integer(rng, 55, 80), phase: 'erase'});
      }
      events.push({value, delay: integer(rng, 80, 140), phase: 'reconsider'});
      typeRange(typo.index, text.length);
    } else typeRange(0, text.length);
    // For long strings, compress typing delays first while preserving the specified
    // correction pauses and erase cadence. All currently authored questions fit.
    const total = events.reduce((sum, event) => sum + event.delay, 0);
    if (total > 3800) {
      const fixed = events.filter(event => !['type','mistake'].includes(event.phase)).reduce((sum, event) => sum + event.delay, 0);
      const factor = Math.max(0, (3800 - fixed) / (total - fixed));
      events.forEach(event => { if (['type','mistake'].includes(event.phase)) event.delay *= factor; });
    }
    return {events, typo, final: value, duration: events.reduce((sum, event) => sum + event.delay, 0)};
  }
  return Object.freeze({plan, candidates});
});
