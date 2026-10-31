/* Persistent, weighted question shuffle bag. Independent of the intro animation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EdwinOSIntroDeck = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const KEY = 'edwinos:intro:deck:v1';
  const hash = text => {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(36);
  };
  function create({questions, storage, seed, forcedId} = {}) {
    const all = (questions || []).filter(q => q && q.id && q.text && q.category);
    const byId = new Map(all.map(q => [q.id, q]));
    const fingerprint = hash(all.map(q => q.id).sort().join('\u0000'));
    const seedKey = seed == null || seed === '' ? null : String(seed);
    let data;
    try { data = JSON.parse(storage && storage.getItem(KEY)); } catch (_) { /* storage can be denied */ }
    if (!data || data.hash !== fingerprint || data.seed !== seedKey || !Array.isArray(data.deck)) {
      // Preserve the previous card even when the pool changes, if still present.
      const last = data && byId.has(data.last) ? data.last : null;
      data = {hash: fingerprint, seed: seedKey, deck: [], last, rng: seedKey === null ? null : (parseInt(seedKey, 10) >>> 0) || 0x6d2b79f5, categoryCursor: 0, cursors: {}};
    }
    const save = () => { try { if (storage) storage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* private mode: still work in memory */ } };
    const random = () => {
      if (seedKey === null) return Math.random();
      data.rng = (data.rng + 0x6d2b79f5) >>> 0;
      let t = data.rng; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const shuffle = list => {
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      return list;
    };
    function refill() {
      const robots = all.filter(q => q.category === 'robotics').map(q => q.id);
      const groups = new Map();
      all.filter(q => q.category !== 'robotics').forEach(q => {
        if (!groups.has(q.category)) groups.set(q.category, []);
        groups.get(q.category).push(q.id);
      });
      const categories = [...groups.keys()].sort();
      // Enough slots to include every question, even when a future category is larger.
      const slots = robots.length && categories.length
        ? Math.max(Math.ceil(robots.length / 2), ...categories.map(c => groups.get(c).length * categories.length))
        : 0;
      const takeCyclic = (list, key, count) => {
        const out = []; let order = shuffle(list.slice()); let index = data.cursors[key] || 0;
        for (let i = 0; i < count; i++) {
          if (index >= order.length) { order = shuffle(list.slice()); index = 0; }
          out.push(order[index++]);
        }
        data.cursors[key] = index; return out;
      };
      let deck = [];
      if (slots) {
        deck.push(...takeCyclic(robots, 'robotics', slots * 2));
        // Separate category queues ensure a large category cannot dominate.
        const counts = Object.fromEntries(categories.map(c => [c, 0]));
        for (let i = 0; i < slots; i++) counts[categories[(data.categoryCursor + i) % categories.length]]++;
        data.categoryCursor = (data.categoryCursor + slots) % categories.length;
        categories.forEach(c => deck.push(...takeCyclic(groups.get(c), c, counts[c])));
      } else {
        deck = shuffle(all.map(q => q.id));
      }
      data.deck = shuffle(deck);
    }
    function next() {
      if (!all.length) return null;
      if (forcedId && byId.has(forcedId)) {
        const chosen = byId.get(forcedId); data.last = chosen.id; save(); return chosen;
      }
      if (!data.deck.length) refill();
      // Do not merely fix the next card: that can strand the same ID at the
      // end of the bag. Pick a shuffled candidate only if the remaining
      // multiset can still be arranged without adjacent repeats.
      const feasible = (remaining, previous) => {
        if (!remaining.length) return true;
        const counts = new Map();
        remaining.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
        for (const [id, count] of counts) {
          if (count > Math.ceil(remaining.length / 2)) return false;
          // A strict majority must start the remainder; it cannot start with
          // the ID just dealt.
          if (count * 2 > remaining.length && id === previous) return false;
        }
        return true;
      };
      let index = data.deck.findIndex((id, i) => id !== data.last && feasible(data.deck.filter((_, j) => j !== i), id));
      if (index < 0) index = data.deck.findIndex(id => id !== data.last);
      if (index < 0 && byId.size > 1) {
        // A forced debug question may strand a final card. Preserve it and
        // append the next bag so the cross-visit no-repeat guarantee holds.
        const stranded = data.deck.slice(); refill(); data.deck.push(...stranded);
        index = data.deck.findIndex(id => id !== data.last);
      }
      const id = data.deck.splice(Math.max(0, index), 1)[0]; data.last = id; save(); return byId.get(id) || null;
    }
    return Object.freeze({next});
  }
  return Object.freeze({create, KEY});
});
