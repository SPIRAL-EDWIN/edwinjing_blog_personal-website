/* EdwinOS first-document opening. Trigger policy lives in the head partial;
   this module can also be called explicitly, but never subscribes to routes. */
(() => {
  'use strict';
  if (window.EdwinOSIntro) return;
  const root = document.documentElement;
  const boot = window.__edwinosIntroBoot;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // Self-tuned Apple-style confirmation, NOT measured Apple Pay timings:
  // circle first, tick 110ms later, green at confirmation start, then 1.08 overshoot.
  const timing = Object.freeze({entry: 1000, typeMin: 28, typeMax: 45,
    punctuation: 75, thought: 300, circle: 280, tickDelay: 110,
    tick: 240, settle: 480, round: 3500, sink: 850, exit: 850, max: 7000});
  let active = null;

  function boundedResource(promise, signal, limit = 5800) {
    return new Promise(resolve => {
      let settled = false;
      const done = state => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(state);
      };
      const abort = () => done('cancelled');
      const timer = setTimeout(() => done('timeout'), limit);
      signal.addEventListener('abort', abort, {once: true});
      Promise.resolve(promise).then(() => done('ready'), () => done('failed'));
    });
  }
  function imageReady(image, signal) {
    if (image.complete) return image.naturalWidth ? (image.decode ? image.decode() : Promise.resolve()) : Promise.reject();
    return new Promise((resolve, reject) => {
      const clean = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); signal.removeEventListener('abort', clean); };
      const loaded = () => { clean(); (image.decode ? image.decode() : Promise.resolve()).then(resolve, reject); };
      const failed = () => { clean(); reject(); };
      image.addEventListener('load', loaded, {once: true});
      image.addEventListener('error', failed, {once: true});
      signal.addEventListener('abort', clean, {once: true});
    });
  }
  function resources(signal) {
    const jobs = [boundedResource(document.fonts ? document.fonts.ready : Promise.resolve(), signal)];
    document.querySelectorAll('.md-content img').forEach(image => {
      // External avatars and visitor badges must not hold the opening.
      if (new URL(image.currentSrc || image.src, location.href).origin !== location.origin) return;
      const rect = image.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0) {
        jobs.push(boundedResource(imageReady(image, signal), signal));
      }
    });
    const video = document.querySelector('[data-blog-home-video]');
    if (video) {
      if (video.poster) {
        const poster = new Image(); poster.src = video.poster;
        jobs.push(boundedResource(imageReady(poster, signal), signal));
      }
      // Save-Data deliberately suppresses metadata warmup; intentional playback
      // remains possible. Full-video downloads are never requested by the intro.
      if (!(navigator.connection && navigator.connection.saveData)) {
        if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
        video.preload = 'metadata';
        const metadata = video.readyState >= 1 ? Promise.resolve() : new Promise((resolve, reject) => {
          const clean = () => { video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); signal.removeEventListener('abort', clean); };
          const loaded = () => { clean(); resolve(); };
          const failed = () => { clean(); reject(); };
          video.addEventListener('loadedmetadata', loaded, {once: true});
          video.addEventListener('error', failed, {once: true});
          signal.addEventListener('abort', clean, {once: true});
        });
        jobs.push(boundedResource(metadata, signal));
      }
    }
    return Promise.all(jobs);
  }
  function wait(ms, state) {
    return new Promise(resolve => {
      if (state.controller.signal.aborted) return resolve(false);
      const end = () => { clearTimeout(id); state.controller.signal.removeEventListener('abort', abort); resolve(!state.controller.signal.aborted); };
      const abort = () => end();
      const id = setTimeout(end, Math.max(0, ms));
      state.controller.signal.addEventListener('abort', abort, {once: true});
    });
  }
  function animate(node, frames, options, state) {
    if (!node.animate || reduce.matches) return;
    const animation = node.animate(frames, options); state.animations.push(animation);
    return animation;
  }
  function revealContent(state) {
    if (reduce.matches) return;
    const candidates = [...document.querySelectorAll('.blog-home-intro, .blog-home-feature, .blog-home-section-heading, .md-content__inner > h1')];
    candidates.filter(node => {
      const r = node.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0;
    }).slice(0, 3).forEach((node, i) => {
      // A small composited rise preserves layout geometry; never re-hide content.
      const animation = node.animate([{opacity: .7, transform: 'translateY(4px)'}, {opacity: 1, transform: 'none'}], {duration: 240, delay: i * 45, easing: 'ease-out'});
      animation.onfinish = () => animation.cancel();
    });
  }
  function dismiss(reason = 'skip') {
    const state = active;
    root.classList.remove('edwinos-intro-pending');
    if (!state) return;
    active = null;
    clearTimeout(state.deadline); clearTimeout(boot && boot.timer);
    state.controller.abort(); state.animations.forEach(animation => animation.cancel());
    state.glass.forEach(surface => surface.destroy());
    state.overlay.classList.remove('is-entered', 'is-success', 'is-leaving', 'is-typing', 'is-sinking');
    state.overlay.setAttribute('aria-hidden', 'true'); state.overlay.hidden = true;
    state.inert.forEach(([node, value]) => { if (node.isConnected) node.inert = value; });
    if (state.previousFocus && state.previousFocus.isConnected && state.previousFocus !== document.body) {
      state.previousFocus.focus({preventScroll: true});
    } else if (state.overlay.contains(document.activeElement)) document.activeElement.blur();
    state.overlay.dataset.finishReason = reason;
    state.overlay.dataset.elapsed = Math.round(performance.now() - state.started);
    if (reason === 'ready') revealContent(state);
    state.resolve({reason, elapsed: performance.now() - state.started, resources: state.resourceResults});
  }
  async function round(question, state, budget = timing.round, first = false) {
    const start = performance.now();
    const text = state.overlay.querySelector('[data-intro-question]');
    const icon = state.overlay.querySelector('.edwinos-intro__icon');
    state.overlay.classList.remove('is-success'); text.textContent = '';
    const box = state.overlay.querySelector('.edwinos-intro__box');
    box.style.setProperty('--intro-tilt', (Math.random() * 1.1 - .55).toFixed(2) + 'deg');
    state.overlay.classList.add('is-typing');
    if (!reduce.matches) {
      for (let i = 0; i < question.length; i++) {
        if (state.controller.signal.aborted) return;
        const character = question[i];
        text.textContent += character;
        if (!await wait(timing.typeMin + Math.random() * (timing.typeMax - timing.typeMin) + (/[?,.!]/.test(character) ? timing.punctuation : 0), state)) return;
        // A small correction makes the first question feel considered, not typed by a machine.
        if (first && i === Math.floor(question.length / 2)) {
          first = false;
          if (!await wait(300, state)) return;
          for (let j = 0; j < 4; j++) {
            text.textContent = text.textContent.slice(0, -1);
            if (!await wait(35, state)) return;
          }
          i -= 4;
        }
      }
    } else text.textContent = question;
    if (!await wait(timing.thought, state)) return;
    state.overlay.classList.remove('is-typing');
    state.overlay.classList.add('is-success');
    if (!reduce.matches) {
      const circle = icon.querySelector('.edwinos-intro__success circle');
      const check = icon.querySelector('.edwinos-intro__success path');
      animate(circle, [{strokeDashoffset: 100}, {strokeDashoffset: 0}], {duration: timing.circle, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both'}, state);
      animate(check, [{strokeDashoffset: 100}, {strokeDashoffset: 0}], {duration: timing.tick, delay: timing.tickDelay, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both'}, state);
      animate(icon, [{transform: 'scale(.94)'}, {transform: 'scale(1.08)', offset: .64}, {transform: 'scale(1)'}], {duration: timing.settle, easing: 'ease-out'}, state);
    }
    if (!await wait(Math.max(timing.settle, budget - (performance.now() - start)), state)) return;
    state.animations.splice(0).forEach(animation => animation.cancel());
  }
  function showLoader({reason = 'manual', until, started = performance.now()} = {}) {
    if (active) return active.promise;
    const overlay = document.getElementById('edwinos-intro');
    if (!overlay) { root.classList.remove('edwinos-intro-pending'); return Promise.resolve({reason: 'unavailable'}); }
    const state = {overlay, started, animations: [], glass: [], controller: new AbortController(), inert: [], previousFocus: document.activeElement, ready: false, resourceResults: []};
    state.promise = new Promise(resolve => { state.resolve = resolve; }); active = state;
    const signal = state.controller.signal;
    root.classList.add('edwinos-intro-pending'); overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.reason = reason; overlay.dataset.resources = 'pending';
    overlay.querySelector('.edwinos-intro__status').textContent = 'Opening the notebook…';
    delete overlay.dataset.finishReason; delete overlay.dataset.elapsed;
    // Preserve geometry while allowing the reader to immediately skip.
    for (const node of document.body.children) if (node !== overlay && node instanceof HTMLElement && !['SCRIPT','STYLE','LINK'].includes(node.tagName)) {
      state.inert.push([node, node.inert]); node.inert = true;
    }
    const prevent = event => event.preventDefault();
    document.addEventListener('wheel', prevent, {passive: false, signal});
    document.addEventListener('keydown', event => { event.preventDefault(); dismiss('skip'); }, {capture: true, signal});
    overlay.addEventListener('click', () => dismiss('skip'), {once: true, signal});
    document.addEventListener('touchmove', prevent, {passive: false, signal});
    window.addEventListener('pagehide', () => dismiss('pagehide'), {once: true, signal});
    reduce.addEventListener('change', () => dismiss('preference-change'), {once: true, signal});
    overlay.focus({preventScroll: true});
    requestAnimationFrame(() => { if (active === state) overlay.classList.add('is-entered'); });
    state.deadline = setTimeout(() => dismiss('deadline'), Math.max(0, timing.max - (performance.now() - started)));
    const ready = until ? Promise.all([resources(signal), boundedResource(until, signal)]).then(results => results.flat()) : resources(signal);
    ready.then(results => {
      if (active !== state) return;
      state.resourceResults = results;
      state.ready = !results.includes('timeout');
      overlay.dataset.resources = state.ready ? (results.includes('failed') ? 'settled-with-errors' : 'ready') : 'timeout';
    });
    (async () => {
      const all = window.EdwinOSIntroQuestions || [];
      // Pick a group with 2:1 weights, then choose an available non-robotics
      // category uniformly. Exhausted groups/categories are automatically ignored.
      const used = new Set();
      function nextQuestion(first) {
        if (first && all.length) { used.add(all[0].id); return all[0].text; }
        const remaining = all.filter(q => !used.has(q.id));
        const robotics = remaining.filter(q => q.category === 'robotics');
        const others = remaining.filter(q => q.category !== 'robotics');
        const useRobot = robotics.length && (!others.length || Math.random() < 2 / 3);
        let options = useRobot ? robotics : others;
        if (!options.length) return 'Opening the notebook…';
        if (!useRobot) {
          const categories = [...new Set(options.map(q => q.category))];
          const category = categories[Math.floor(Math.random() * categories.length)];
          options = options.filter(q => q.category === category);
        }
        const chosen = options[Math.floor(Math.random() * options.length)];
        used.add(chosen.id); return chosen.text;
      }
      // Entry overlaps round timing; the first characters begin only after the rise.
      if (!await wait(reduce.matches ? 0 : timing.entry, state)) return;
      // Optics are shared with Start Here; mount once at neutral geometry,
      // then dispose on every exit. No filter maps are rebuilt per frame.
      if (window.EdwinOSGlass) overlay.querySelectorAll('.edwinos-glass').forEach(element => {
        const surface = window.EdwinOSGlass.mount(element);
        if (surface) state.glass.push(surface);
      });
      for (let i = 0; i < 3 && active === state; i++) {
        await round(nextQuestion(i === 0), state, i === 0 ? Math.max(0, timing.round - (performance.now() - started)) : timing.round, i === 0);
        if (active !== state) return;
        if (state.ready) {
          const failed = state.resourceResults.includes('failed');
          overlay.querySelector('.edwinos-intro__status').textContent = failed ? 'Continuing to the notebook' : 'Ready to read';
          overlay.classList.add('is-sinking');
          overlay.classList.add('is-leaving');
          if (await wait(reduce.matches ? 100 : timing.exit, state)) dismiss(failed ? 'resources-failed' : 'ready');
          return;
        }
      }
      if (active === state) dismiss('round-limit');
    })().catch(() => dismiss('runtime-error'));
    return state.promise;
  }
  window.EdwinOSIntro = Object.freeze({showLoader, dismiss, timing, config: boot ? boot.config : {mode: 'off'}});
  if (boot && boot.active && performance.now() - boot.started < timing.max) showLoader({reason: 'first-document', started: boot.started});
  else root.classList.remove('edwinos-intro-pending');
})();
