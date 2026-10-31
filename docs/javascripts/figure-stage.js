/* Original research diagrams: spec-driven cards, measured connectors and bounded scroll stages. */
(() => {
  if (window.__researchFigureBoot) return;
  window.__researchFigureBoot = true;
  const base = new URL('../assets/', document.currentScript.src);
  const svgNS = 'http://www.w3.org/2000/svg';
  let records = [], generation = 0, specsPromise, gsapPromise, mathPromise;
  // Module lifetime survives Material instant navigation; a hard reload resets memory.
  const seen = new Set();
  const config = {persistSeen: 'memory', ...(window.EdwinOSFigureConfig || {})};
  const storageKey = 'edwinos:figure:seen:v1';
  if (config.persistSeen === 'session') {
    try { JSON.parse(sessionStorage.getItem(storageKey) || '[]').forEach(id => seen.add(id)); } catch (_) {}
  }
  function remember(id) {
    seen.add(id);
    if (config.persistSeen === 'session') try { sessionStorage.setItem(storageKey, JSON.stringify([...seen])); } catch (_) {}
  }
  let pending = new Set(), pendingFrame = 0, pendingHashTarget = null, pendingEnd = false, endStarted = 0, endEpoch = 0;
  function finishLater(record) {
    if (record.finished) return;
    pending.add(record);
    if (!pendingFrame) pendingFrame = requestAnimationFrame(pendingEnd ? waitForEnd : flushFinished);
  }
  function waitForEnd() {
    pendingFrame = 0;
    if (!pendingEnd) { flushFinished(); return; }
    const atEnd = window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    if (!atEnd && performance.now() - endStarted < 1400) {
      pendingFrame = requestAnimationFrame(waitForEnd); return;
    }
    flushFinished();
  }
  function flushFinished() {
    pendingFrame = 0;
    if (pendingEnd) records.filter(r => r.figure && !r.finished).forEach(r => pending.add(r));
    const batch = [...pending]; pending.clear();
    // Preserve a stable landmark while pin spacers and step controls are removed.
    const landmark = document.getElementById('recent-updates');
    const before = landmark?.getBoundingClientRect().top;
    batch.forEach(record => record.finish());
    if (landmark && landmark.isConnected && Number.isFinite(before)) {
      const delta = landmark.getBoundingClientRect().top - before;
      if (Math.abs(delta) > .01) window.scrollBy(0, delta);
    }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
    // An in-page anchor may start a browser smooth scroll across multiple pins.
    // Removing the first spacer interrupts that scroll; restore its target only
    // after all preceding figures have been finalized in the same frame.
    const target = pendingHashTarget; pendingHashTarget = null;
    if (target?.isConnected) target.scrollIntoView({block:'start', behavior:'instant'});
    else if (pendingEnd) {
      window.scrollTo({top:document.documentElement.scrollHeight, behavior:'instant'});
      // Late image/font readiness can grow the footer after End. Follow a
      // bounded set of layout settlements only while the reader stays at the end.
      const epoch = endEpoch;
      [80, 250, 550, 1000, 1600].forEach(delay => setTimeout(() => {
        if (epoch === endEpoch && document.documentElement.scrollHeight - innerHeight - scrollY < 40)
          window.scrollTo({top:document.documentElement.scrollHeight, behavior:'instant'});
      }, delay));
    }
    pendingEnd = false;
  }
  function prepareHashTarget(target, reposition) {
    const skipped = records.filter(r => r.figure && !r.finished && (r.figure.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!skipped.length) return;
    if (reposition) pendingHashTarget = target;
    skipped.forEach(finishLater);
    // Flush before another navigation lifecycle callback can dispose records.
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    flushFinished();
  }
  window.addEventListener('hashchange', () => {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = id && document.getElementById(id);
    if (target) prepareHashTarget(target, true);
  });
  // block-links.js handles normal same-page clicks with pushState (no hashchange).
  // Finish intervening figures before its existing fragment-scroll owner runs.
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a[href]'); if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    let url, id; try { url = new URL(link.href, location.href); id = decodeURIComponent(url.hash.slice(1)); } catch (_) { return; }
    const normalize = path => path.replace(/\/index\.html$/i, '/').replace(/\/+$/, '');
    if (!id || url.origin !== location.origin || normalize(url.pathname) !== normalize(location.pathname)) return;
    const target = document.getElementById(id); if (target) prepareHashTarget(target, false);
  }, true);
  const script = url => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = url; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  const specs = () => specsPromise ||= fetch(new URL('data/research-figures.json', base)).then(r => { if (!r.ok) throw Error('Figure data unavailable'); return r.json(); });
  const motion = () => gsapPromise ||= script(new URL('javascripts/vendor/gsap/gsap.min.js',base)).then(() => script(new URL('javascripts/vendor/gsap/ScrollTrigger.min.js',base))).then(() => { gsap.registerPlugin(ScrollTrigger); });
  const math = () => mathPromise ||= (() => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('javascripts/vendor/katex/katex.min.css',base); document.head.appendChild(link); return script(new URL('javascripts/vendor/katex/katex.min.js',base)); })();
  function validate(spec) {
    const ids = new Map();
    for (const node of spec.nodes) { if (ids.has(node.id) || !Number.isInteger(node.col) || !Number.isInteger(node.row)) throw Error('Invalid figure node'); ids.set(node.id,node); }
    for (const edge of spec.edges) { const a=ids.get(edge.from), b=ids.get(edge.to); if (!a || !b || b.col<a.col || b.row<a.row) throw Error('Non-monotone figure edge'); }
  }
  window.addEventListener('keydown', event => {
    if (event.key !== 'End') { pendingEnd = false; endEpoch++; return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.defaultPrevented || event.target?.closest?.('input, textarea, select, [contenteditable=true]')) return;
    // Let the browser start moving first, then finish all skipped figures in one batch.
    if (records.some(r => r.figure && !r.finished)) { pendingEnd = true; endStarted = performance.now(); endEpoch++; }
  }, true);
  ['wheel','touchstart'].forEach(type => window.addEventListener(type, () => { pendingEnd = false; endEpoch++; }, {passive:true}));
  function dispose() {
    generation++;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0; pending.clear(); pendingHashTarget = null; pendingEnd = false;
    records.forEach(r => {
      if (r.figure && !r.finished && (r.trigger?.progress > 0 || r.figure.getBoundingClientRect().bottom < 0)) remember(r.figure.dataset.figure);
      r.observer?.disconnect(); r.resize?.disconnect(); r.trigger?.kill(); r.timeline?.kill(); r.handlers?.forEach(([e,h])=>e.removeEventListener('click',h));
    });
    records=[];
  }
  function makeNode(node, mini) {
    const el=document.createElement('div'); el.className='research-figure__node'; el.dataset.node=node.id; el.dataset.step=node.step;
    const label=document.createElement('small'), title=document.createElement('strong'), detail=document.createElement('span');
    label.textContent=node.label; title.textContent=node.title; detail.textContent=node.detail;
    if (node.math && !mini) { title.dataset.math=node.math; math().then(()=> { if (el.isConnected && window.katex) katex.render(node.math,title,{throwOnError:false}); }).catch(()=>{}); }
    el.style.gridColumn=String(node.col+1); el.style.gridRow=`${(node.layoutRow ?? node.row)+1} / span ${node.spanRows || 1}`;
    el.append(label,title); if (!mini) el.append(detail); return el;
  }
  function render(art, spec, mini=false) {
    validate(spec); art.replaceChildren();
    art.style.gridTemplateColumns=`repeat(${Math.max(...spec.nodes.map(n=>n.col))+1}, minmax(0, 1fr))`;
    const svg=document.createElementNS(svgNS,'svg'); svg.classList.add('research-figure__edges'); svg.setAttribute('aria-hidden','true'); art.append(svg);
    spec.nodes.forEach(n=>art.append(makeNode(n,mini)));
    const lines=spec.edges.map(e=>{ const path=document.createElementNS(svgNS,'path'), head=document.createElementNS(svgNS,'path'); path.classList.add('research-figure__line'); head.classList.add('research-figure__arrow'); svg.append(path,head); return {spec:e,path,head}; });
    const measure=()=>{
      if (!art.isConnected) return;
      const area=art.getBoundingClientRect(), vertical=matchMedia('(max-width:700px)').matches && !mini;
      svg.setAttribute('viewBox',`0 0 ${area.width} ${area.height}`);
      lines.forEach(line=>{
        const a=art.querySelector(`[data-node="${line.spec.from}"]`).getBoundingClientRect(), b=art.querySelector(`[data-node="${line.spec.to}"]`).getBoundingClientRect();
        let x1,y1,x2,y2;
        if(vertical) { x1=a.left+a.width/2-area.left; y1=a.bottom-area.top; x2=(art.dataset.layout==='calibration' && line.spec.to==='motion' ? a.left+a.width/2 : b.left+b.width/2)-area.left; y2=b.top-area.top; }
        else { x1=a.right-area.left; y1=a.top+a.height/2-area.top; x2=b.left-area.left; y2=y1; }
        const d=vertical?`M ${x1} ${y1} V ${y2}`:`M ${x1} ${y1} H ${x2}`; line.path.setAttribute('d',d);
        line.head.setAttribute('d',vertical?`M ${x2-4} ${y2-7} L ${x2} ${y2} L ${x2+4} ${y2-7}`:`M ${x2-7} ${y2-4} L ${x2} ${y2} L ${x2-7} ${y2+4}`);
        line.length=line.path.getTotalLength(); line.path.style.strokeDasharray=line.length;
      });
    };
    measure(); const resize=new ResizeObserver(measure); resize.observe(art); art.querySelectorAll('.research-figure__node').forEach(n=>resize.observe(n));
    return {lines,resize,measure};
  }
  function setup(figure,spec,token) {
    const art=figure.querySelector('.research-figure__art'), graph=render(art,spec), rail=figure.querySelector('.research-figure__rail');
    const record={figure,resize:graph.resize,handlers:[],finished:false}; records.push(record);
    const title=figure.querySelector('[data-figure-title]'), copy=figure.querySelector('[data-figure-copy]');
    const buttons=[...rail.querySelectorAll('button')]; let displayed=-1, furthest=0;
    const state=(index,progress=1)=>{
      const current=index; furthest=Math.max(furthest,current); index=furthest;
      art.querySelectorAll('.research-figure__node').forEach(node=>node.classList.toggle('is-upcoming',+node.dataset.step>index));
      graph.lines.forEach(line=>{ const {spec:edge,path,head,length}=line; const pct=edge.step<index?1:edge.step===index?progress:0; line.revealed=Math.max(line.revealed||0,pct); path.style.strokeDashoffset=(length||0)*(1-line.revealed); head.style.visibility=line.revealed>=.99?'visible':'hidden'; });
      if(index >= 2 && figure.dataset.figure==='calibration') art.querySelector('[data-node=motion]').classList.add('is-solved');
      if(displayed!==current){ displayed=current; const slot=figure.querySelector('.research-figure__explanation'); slot.classList.remove('is-changing'); void slot.offsetWidth; slot.classList.add('is-changing'); title.textContent=spec.steps[current].title; copy.textContent=spec.steps[current].text; buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===current))); }
    };
    record.finish = () => {
      if (record.finished) return;
      record.finished = true; remember(figure.dataset.figure);
      record.trigger?.kill(); record.timeline?.kill();
      record.handlers.forEach(([element,handler]) => element.removeEventListener('click',handler));
      record.handlers = [];
      figure.classList.remove('research-figure--animated'); figure.classList.add('research-figure--seen');
      rail.hidden=true; state(3,1); graph.measure();
    };
    if (seen.has(figure.dataset.figure) || figure.getBoundingClientRect().bottom < 0) { record.finish(); return; }
    if (matchMedia('(max-width:700px), (prefers-reduced-motion: reduce)').matches || !window.IntersectionObserver) { rail.hidden=true; return; }
    motion().then(()=>{
      if(token!==generation || !figure.isConnected || figure.offsetHeight>innerHeight*.7) { rail.hidden=true; return; }
      figure.classList.add('research-figure--animated'); state(0);
      const clock={value:0}; let maxProgress=0;
      const timeline=gsap.timeline({scrollTrigger:{trigger:figure,start:'center center',end:()=>`+=${innerHeight*2.4}`,pin:figure,scrub:.5,snap:{snapTo:1/4,duration:.25,delay:.1,inertia:false,directional:false},invalidateOnRefresh:true,onLeave:()=>finishLater(record)}});
      timeline.to(clock,{value:1,duration:1,ease:'none',onUpdate:()=>{ maxProgress=Math.max(maxProgress,clock.value); const position=maxProgress*4; const current=Math.min(3,Math.floor(position+0.00001)); state(current,current===0?1:Math.min(1,position-current)); if(maxProgress>=.999)state(3,1); }});
      record.timeline=timeline; record.trigger=timeline.scrollTrigger;
      buttons.forEach((button,i)=>{const h=()=>window.scrollTo({top:record.trigger.start+(record.trigger.end-record.trigger.start)*i/4,behavior:'smooth'});button.addEventListener('click',h);record.handlers.push([button,h]);});
    }).catch(()=>{rail.hidden=true;});
  }
  function init(){
    dispose(); const token=generation; const figures=[...document.querySelectorAll('.research-figure[data-figure]')], mini=document.querySelector('[data-figure-preview]'); if(!figures.length&&!mini)return;
    specs().then(data=>{ if(token!==generation)return; figures.forEach(f=>setup(f,data[f.dataset.figure],token)); if(mini){const g=render(mini,data[mini.dataset.figurePreview],true); records.push({resize:g.resize});} }).catch(()=>{});
  }
  if(window.document$ && typeof window.document$.subscribe==='function') window.document$.subscribe(init); else if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
