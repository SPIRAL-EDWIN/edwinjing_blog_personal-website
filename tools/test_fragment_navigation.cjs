/* Fragment hand-off regression: exact TOC selection through layout settling,
 * then yield to reader input instead of pinning or re-scrolling indefinitely. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('docs/javascripts/block-links.js', 'utf8');

function fixture() {
  let now = 0, nextId = 1, run;
  const timers = new Map(), frames = new Map(), events = new Map();
  const location = {};
  function setUrl(href) {
    const parsed = new URL(href, location.href || 'http://127.0.0.1:8000/');
    Object.assign(location, { href: parsed.href, origin: parsed.origin,
      pathname: parsed.pathname, search: parsed.search, hash: parsed.hash });
  }
  setUrl('http://127.0.0.1:8000/CHEM/?h=2p#sp3-2s2p');
  const root = { contains: () => true }, body = {};
  function classes() {
    const values = new Set();
    return { add: (...items) => items.forEach(x => values.add(x)),
      remove: (...items) => items.forEach(x => values.delete(x)),
      contains: item => values.has(item) };
  }
  const header = { getBoundingClientRect: () => ({ height: 56 }) };
  const heading = { id: 'sp3-2s2p', classList: classes(), offsetWidth: 200,
    matches: selector => selector.includes('h3'),
    closest: () => null, getBoundingClientRect: () => ({ top: 1600 - window.scrollY }),
    scrollIntoView() { throw new Error('heading hand-off must use header-safe alignment'); } };
  const previous = { id: '_9', classList: classes(), matches: () => true };
  const sidebar = { querySelectorAll: () => links.filter(x => x.classList.contains('edwinos-toc-link--selected')) };
  const links = ['#_9', '#sp3-2s2p'].map(hash => ({ hash, isConnected: true,
    classList: classes(), getBoundingClientRect: () => ({ width: 100 }),
    closest: selector => selector === '.md-sidebar--secondary' ? sidebar : null }));
  links[0].classList.add('md-nav__link--active');
  const document = {
    body,
    querySelector: selector => selector === '.md-header' ? header
      : selector === '.md-content__inner' ? root : null,
    getElementById: id => id === heading.id ? heading : id === previous.id ? previous : null,
    querySelectorAll: selector => selector.includes('a.md-nav__link') ? links
      : selector.includes('edwinos-toc-link--selected') ? links.filter(x => x.classList.contains('edwinos-toc-link--selected'))
      : [heading, previous].filter(x => x.classList.contains('block-highlight')),
    addEventListener: (name, handler) => events.set('document:' + name, handler)
  };
  const history = { replaceState: (_, __, href) => setUrl(href), pushState: (_, __, href) => setUrl(href) };
  const window = { location, history, scrollY: 0, innerHeight: 800,
    document$: { subscribe: handler => { run = handler; } },
    matchMedia: () => ({ matches: true }),
    scrollTo: ({ top }) => { window.scrollY = top; },
    setTimeout: (handler, delay) => { const id = nextId++; timers.set(id, { handler, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: handler => { const id = nextId++; frames.set(id, handler); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, handler) => events.set('window:' + name, handler)
  };
  vm.runInNewContext(source, { window, document, history, URL, Date: { now: () => now } });
  function flushFrames() {
    for (let pass = 0; frames.size && pass < 100; pass++) {
      const pending = [...frames.values()]; frames.clear(); now += 16;
      pending.forEach(handler => handler(now));
    }
    assert.equal(frames.size, 0);
  }
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) {
      timers.delete(id); timer.handler();
    }
    flushFrames();
  }
  return { window, links, heading, run: () => run(), setUrl, flushFrames, advance,
    dispatch: (name, detail) => events.get(name)(detail || {}) };
}

const page = fixture();
page.run(); page.flushFrames();
assert.equal(page.heading.getBoundingClientRect().top, 96, 'heading clears the translucent header');
assert(page.links[1].classList.contains('edwinos-toc-link--selected'), 'cross-page fragment selects its exact TOC entry');
page.setUrl('/CHEM/?h=2p#_9'); // Material considers the heading below its threshold.
page.advance(700);
assert.equal(page.window.location.hash, '#sp3-2s2p', 'one bounded settle pass restores the requested heading');
page.setUrl('/CHEM/?h=2p#_9');
page.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#_9' } });
page.flushFrames(); page.advance(700);
assert.equal(page.window.location.hash, '#sp3-2s2p', 'late formula layout uses the original explicit fragment');
page.dispatch('window:wheel');
assert(!page.links[1].classList.contains('edwinos-toc-link--selected'), 'reader scrolling immediately releases the override');
page.window.scrollY = 900;
page.setUrl('/CHEM/?h=2p#sp3-2s2p');
page.dispatch('document:edwinos:hash-layout-settled', { detail: { hash: '#sp3-2s2p' } });
page.flushFrames(); page.advance(1000);
assert.equal(page.window.scrollY, 900, 'late MathJax cannot snap back after reader input');
page.setUrl('/CHEM/?h=2p#sp3-2s2p'); page.run(); page.flushFrames();
page.setUrl('/HOME/friends/'); page.run(); page.advance(1000);
assert.equal(page.window.location.pathname, '/HOME/friends/');
assert.equal(page.window.location.hash, '', 'page replacement invalidates old fragment repairs');
const transition = fixture();
transition.setUrl('/Hua/#previous-section');
transition.run(); transition.flushFrames();
const crossPageLink = {
  target: '', getAttribute: () => '/CHEM/?h=2p#sp3-2s2p',
  closest: () => null
};
transition.dispatch('document:click', {
  button: 0, target: { closest: () => crossPageLink },
  preventDefault() { throw new Error('Material owns cross-page navigation'); }
});
transition.run(); // An outgoing document emission must not consume the target.
transition.setUrl('/CHEM/?h=2p#previous-section'); // Outgoing scrollspy overwrote the URL.
transition.dispatch('window:scrollend'); // Programmatic outgoing scrolling is not reader input.
transition.run(); transition.flushFrames();
assert.equal(transition.window.location.hash, '#sp3-2s2p', 'destination fragment survives the outgoing-page scrollspy');
assert.equal(transition.heading.getBoundingClientRect().top, 96, 'cross-page intended heading is aligned immediately');
assert(transition.links[1].classList.contains('edwinos-toc-link--selected'), 'TOC selection follows the captured destination');
console.log('Fragment navigation: 11 checks passed.');
