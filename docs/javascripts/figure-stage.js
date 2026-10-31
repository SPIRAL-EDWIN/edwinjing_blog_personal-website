/* Original research diagrams: spec-driven cards, measured connectors and bounded scroll stages. */
(() => {
  if (window.__researchFigureBoot) return;
  window.__researchFigureBoot = true;
  const base = new URL('../assets/', document.currentScript.src);
  const svgNS = 'http://www.w3.org/2000/svg';
  let records = [], generation = 0, specsPromise, gsapPromise, mathPromise;
  const script = url => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = url; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
  const specs = () => specsPromise ||= fetch(new URL('data/research-figures.json', base)).then(r => { if (!r.ok) throw Error('Figure data unavailable'); return r.json(); });
  const motion = () => gsapPromise ||= script(new URL('javascripts/vendor/gsap/gsap.min.js',base)).then(() => script(new URL('javascripts/vendor/gsap/ScrollTrigger.min.js',base))).then(() => { gsap.registerPlugin(ScrollTrigger); });
  const math = () => mathPromise ||= (() => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('javascripts/vendor/katex/katex.min.css',base); document.head.appendChild(link); return script(new URL('javascripts/vendor/katex/katex.min.js',base)); })();
  function validate(spec) {
    const ids = new Map();
    for (const node of spec.nodes) { if (ids.has(node.id) || !Number.isInteger(node.col) || !Number.isInteger(node.row)) throw Error('Invalid figure node'); ids.set(node.id,node); }
    for (const edge of spec.edges) { const a=ids.get(edge.from), b=ids.get(edge.to); if (!a || !b || b.col<a.col || b.row<a.row) throw Error('Non-monotone figure edge'); }
  }
  function dispose() { generation++; records.forEach(r => { r.observer?.disconnect(); r.resize?.disconnect(); r.trigger?.kill(); r.timeline?.kill(); r.handlers?.forEach(([e,h])=>e.removeEventListener('click',h)); }); records=[]; }
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
    const record={resize:graph.resize,handlers:[]}; records.push(record);
    const title=figure.querySelector('[data-figure-title]'), copy=figure.querySelector('[data-figure-copy]');
    const buttons=[...rail.querySelectorAll('button')]; let displayed=-1, furthest=0;
    const state=(index,progress=1)=>{
      const current=index; furthest=Math.max(furthest,current); index=furthest;
      art.querySelectorAll('.research-figure__node').forEach(node=>node.classList.toggle('is-upcoming',+node.dataset.step>index));
      graph.lines.forEach(line=>{ const {spec:edge,path,head,length}=line; const pct=edge.step<index?1:edge.step===index?progress:0; line.revealed=Math.max(line.revealed||0,pct); path.style.strokeDashoffset=(length||0)*(1-line.revealed); head.style.visibility=line.revealed>=.99?'visible':'hidden'; });
      if(index >= 2 && figure.dataset.figure==='calibration') art.querySelector('[data-node=motion]').classList.add('is-solved');
      if(displayed!==current){ displayed=current; const slot=figure.querySelector('.research-figure__explanation'); slot.classList.remove('is-changing'); void slot.offsetWidth; slot.classList.add('is-changing'); title.textContent=spec.steps[current].title; copy.textContent=spec.steps[current].text; buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===current))); }
    };
    if (matchMedia('(max-width:700px), (prefers-reduced-motion: reduce)').matches || !window.IntersectionObserver) { rail.hidden=true; return; }
    motion().then(()=>{
      if(token!==generation || !figure.isConnected || figure.offsetHeight>innerHeight*.7) { rail.hidden=true; return; }
      figure.classList.add('research-figure--animated'); state(0);
      const clock={value:0};
      const timeline=gsap.timeline({scrollTrigger:{trigger:figure,start:'center center',end:()=>`+=${innerHeight*2.4}`,pin:figure,scrub:.5,snap:{snapTo:1/4,duration:.25,delay:.1,inertia:false,directional:false},invalidateOnRefresh:true}});
      timeline.to(clock,{value:1,duration:1,ease:'none',onUpdate:()=>{ const position=clock.value*4; const current=Math.min(3,Math.floor(position+0.00001)); state(current,current===0?1:Math.min(1,position-current)); if(clock.value>=.999)state(3,1); }});
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
