/* Original notebook figures. Static markup remains the no-script fallback. */
(() => {
  if (window.__researchFigureBoot) return;
  window.__researchFigureBoot = true;
  const script = document.currentScript;
  const base = new URL('../assets/javascripts/vendor/gsap/', script.src);
  const specs = {
    calibration: [
      ['Measurements', 'Record robot poses and observe the board from multiple positions.'],
      ['Relative motion', 'Compare poses to describe the motion of the end effector and the camera.'],
      ['Solve', 'The motion pairs constrain AX = XB and the fixed camera-to-end-effector transform.'],
      ['Check', 'Inspect the resulting transform; one motion alone is usually insufficient.']
    ],
    simulation: [
      ['Train', 'Train the policy in Isaac Lab before testing it elsewhere.'],
      ['Export', 'Export the inference graphs to ONNX for the deployment chain.'],
      ['Validate', 'Run the policy in MuJoCo as a closed loop without updating its parameters.'],
      ['Inspect', 'Check joint order, stability, errors and consistency across the chain.']
    ]
  };
  let loading;
  const load = name => new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = new URL(name + '.min.js', base).href;
    el.onload = resolve; el.onerror = reject; document.head.appendChild(el);
  });
  const ensure = () => loading || (loading = load('gsap').then(() => Promise.all([load('ScrollTrigger'), load('DrawSVGPlugin')])).then(() => {
    gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);
  }));
  let active = [];
  function dispose() { active.forEach(item => { item.observer?.disconnect(); item.timeline?.scrollTrigger?.kill(); item.timeline?.kill(); item.buttons.forEach((b, i) => b.removeEventListener('click', item.handlers[i])); }); active = []; }
  function init() {
    dispose();
    const figures = [...document.querySelectorAll('.research-figure[data-figure]')];
    if (!figures.length) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return; observer.unobserve(entry.target);
      ensure().then(() => setup(entry.target)).catch(() => {});
    }), {rootMargin:'700px'});
    figures.forEach(el => observer.observe(el));
    active.push({buttons:[], handlers:[], timeline:null, observer});
  }
  function setup(figure) {
    if (!figure.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const steps = specs[figure.dataset.figure]; if (!steps) return;
    const buttons = [...figure.querySelectorAll('[data-step]')];
    const labels = [...figure.querySelectorAll('.research-figure__label')];
    const title = figure.querySelector('[data-figure-title]');
    const copy = figure.querySelector('[data-figure-copy]');
    const desktop = matchMedia('(min-width: 701px)').matches;
    let index = -1;
    const select = value => { const next = Math.min(3, Math.max(0, value)); if (next === index) return; index = next; buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === next))); title.textContent = steps[next][0]; copy.textContent = steps[next][1]; };
    figure.classList.add('research-figure--animated'); select(0);
    const timeline = gsap.timeline({scrollTrigger:{trigger:figure.querySelector('.research-figure__journey'), start:'top top+=90', end:desktop ? '+=280%' : 'bottom center', pin:desktop ? figure.querySelector('.research-figure__stage') : false, scrub:0.5, invalidateOnRefresh:true, onUpdate:self => select(Math.min(3, Math.floor(self.progress * 4)))}});
    labels.forEach((label, i) => timeline.fromTo(label, {opacity:.3,y:20,rotateX:5}, {opacity:1,y:0,rotateX:0,duration:.8,ease:'power2.out'}, i));
    const paths = figure.querySelectorAll('.research-figure__guides path');
    timeline.fromTo(paths, {drawSVG:'0%'}, {drawSVG:'100%',duration:2.8,stagger:.15,ease:'none'}, 0);
    const handlers = buttons.map((button,i) => { const handler = () => { const t=timeline.scrollTrigger; if (t) window.scrollTo({top:t.start + (t.end-t.start)*(i+.12)/4, behavior:'smooth'}); select(i); }; button.addEventListener('click',handler); return handler; });
    active.push({timeline,buttons,handlers});
  }
  if (window.document$ && typeof window.document$.subscribe === 'function') window.document$.subscribe(init);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
