/* Build first; Playwright setup matches UI_REGRESSION.md. Tests production assets. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const site = path.resolve(process.env.SITE_DIR || path.join(__dirname, '../site'));
const origin = 'http://edwinos.test';
const more = '/%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/';
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
  '.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
async function main() {
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  let visualStates = 0;
  async function fixture(options = {}) {
    const context = await browser.newContext({viewport:{width:options.width || 1280,height:options.height || 1000},
      colorScheme:options.theme || 'light',reducedMotion:options.reduce ? 'reduce' : 'no-preference',javaScriptEnabled:options.javascript !== false});
    await context.addInitScript(({noObserver,pauseSidebar,visualHeight,captureFrames}) => {
      window.__initialHubHash = location.hash;
      if(visualHeight && window.visualViewport) {
        let visibleHeight=visualHeight;
        Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>visibleHeight});
        window.__setVisualHeight=value=>{visibleHeight=value;window.visualViewport.dispatchEvent(new Event('resize'));};
      }
      // Material also uses this browser API. Isolate the owner's capability
      // fallback while leaving the theme's independent runtime available.
      if (noObserver) {
        const NativeObserver = window.IntersectionObserver;
        Object.defineProperty(window, 'IntersectionObserver', {get() {
          return new Error().stack.includes('setupContentHubReveal') ? undefined : NativeObserver;
        }});
      }
      window.__hubEntrances = [];
      window.__hubPaints = [];
      if(captureFrames) {
        const started=performance.now();
        function sample() {
          document.querySelectorAll('.landing-reading-entry > h3, .landing-reading-entry > p').forEach(element=>{
            let opacity=1;
            for(let node=element;node&&node!==document.documentElement;node=node.parentElement) opacity*=Number(getComputedStyle(node).opacity);
            window.__hubPaints.push({key:element.parentElement.dataset.hubReveal+':'+element.tagName,
              opacity,started:window.__hubEntrances.some(e=>e.element===element)});
          });
          if(performance.now()-started<20000) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      }
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        // Capture layout before the animation adds its own 16px translation.
        const rect=this.getBoundingClientRect().toJSON(), startedAt=performance.now();
        const vv=window.visualViewport;
        const bounds={top:Math.max(document.querySelector('.md-header')?.getBoundingClientRect().bottom||0,vv?.offsetTop||0),
          bottom:vv?(vv.offsetTop+vv.height):innerHeight,left:vv?.offsetLeft||0,right:vv?(vv.offsetLeft+vv.width):innerWidth};
        const scrollwrap=this.closest('.md-sidebar__scrollwrap');
        if(scrollwrap){const clip=scrollwrap.getBoundingClientRect();bounds.top=Math.max(bounds.top,clip.top);bounds.bottom=Math.min(bounds.bottom,clip.bottom);bounds.left=Math.max(bounds.left,clip.left);bounds.right=Math.min(bounds.right,clip.right);}
        const visibility=getComputedStyle(this).visibility;
        const result = animate.call(this, frames, options);
        let key = this.getAttribute('data-hub-reveal');
        const owner = this.closest('[data-hub-reveal]');
        if (!key && owner) {
          const base = owner.getAttribute('data-hub-reveal');
          if (/^H[23]$/.test(this.tagName)) key = base + ':heading';
          else if (this.tagName === 'P') key = base + ':paragraph-' +
            Array.from(owner.children).filter(e=>e.tagName==='P').indexOf(this);
        }
        if (!key && this.closest('.md-sidebar--primary .edwinos-drawer-section-nav') &&
          this.matches('.md-nav__container, a.md-nav__link, label.md-nav__link')) key = 'sidebar-row';
        if (key && frames[0] && frames[0].translate === '0 16px') {
          if (pauseSidebar && key === 'sidebar-row') {
            result.pause();
            result.currentTime = 0;
          }
          const entry={key,route:location.pathname,element:this,animation:result,frames,options,startedAt,rect,bounds,visibility,canceled:false};
          result.addEventListener('cancel',()=>{entry.canceled=true;});
          window.__hubEntrances.push(entry);
        }
        return result;
      };
    }, {noObserver:!!options.noObserver,pauseSidebar:!!options.pauseSidebar,visualHeight:options.visualHeight,captureFrames:!!options.captureFrames});
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url = new URL(route.request().url());
      if(url.origin !== origin) return route.abort();
      let relative = decodeURIComponent(url.pathname);
      if(relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(site,'.'+relative);
      if(!file.startsWith(site+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return route.fulfill({status:404,body:''});
      if(options.fontDelay && file.endsWith('.woff2')) await new Promise(resolve=>setTimeout(resolve,options.fontDelay));
      if(options.runtimeDelay && /\/ui-perf\.js$/.test(url.pathname)) await new Promise(resolve=>setTimeout(resolve,options.runtimeDelay));
      let body=fs.readFileSync(file);
      if(options.tallCard && path.extname(file)==='.html') body=Buffer.from(body.toString().replace(
        'Start with the embodied intelligence roadmap: perception, planning, and the connections between robot learning systems.',
        'A deliberately long research introduction for testing independently revealed paragraphs. '.repeat(40)));
      return route.fulfill({contentType:mime[path.extname(file)] || 'application/octet-stream',body});
    });
    return {page,errors,context};
  }
  const counts = page => page.evaluate(()=>window.__hubEntrances.map(e=>({key:e.key,route:e.route})));
  try {
    for(const width of [390,768,1280]) for(const theme of ['light','dark']) {
      const {page,context,errors}=await fixture({width,theme,reduce:true});
      for(const route of ['/OsdNotes/',more]) {
        await page.goto(origin+route,{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
        const title=page.locator('.landing-reading-list h3 a').first(); await title.hover();
        assert.deepEqual(await title.evaluate(e=>{const s=getComputedStyle(e);return[s.borderBottomWidth,s.textDecorationLine,s.textDecorationThickness]}),['0px','underline','1px']);
        assert(await page.locator('.landing-title-translation').evaluateAll(es=>es.every(e=>!e.closest('a') && getComputedStyle(e).textDecorationLine==='none')));
        assert.equal(await page.locator('.landing-route a').count(),0);
        if(route==='/OsdNotes/') assert.match(await page.locator('.landing-route h3').first().evaluate(e=>getComputedStyle(e).fontFamily),/Outfit/);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
        assert.equal((await counts(page)).length,0,'reduced motion has no entrances');
        assert.equal(await page.locator('.md-content__inner').evaluate(e=>getComputedStyle(e).animationName),'none');
        visualStates++;
      }
      assert.deepEqual(errors,[]); await context.close();
    }
    // More's desktop section children can be visible while the native mobile
    // disclosure still reports aria-expanded=false. Cover concrete note rows,
    // not just the presence of some animated folder headings.
    for (const theme of ['light', 'dark']) {
      const {page,context,errors}=await fixture({theme,pauseSidebar:true});
      await page.goto(origin+more,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>window.__hubEntrances.filter(e=>e.key==='sidebar-row').length>=8);
      const sidebar=await page.evaluate(()=>{
        const entries=window.__hubEntrances.filter(e=>e.key==='sidebar-row');
        // Sample final layout before deriving the actual visible row set.
        entries.forEach(e=>{e.animation.currentTime=e.options.delay+e.options.duration;});
        const nav=document.querySelector('.md-sidebar--primary .edwinos-drawer-section-nav');
        const clip=nav.closest('.md-sidebar__scrollwrap').getBoundingClientRect();
        const top=Math.max(clip.top,document.querySelector('.md-header').getBoundingClientRect().bottom);
        const bottom=Math.min(clip.bottom,innerHeight);
        const all=Array.from(nav.querySelectorAll('.md-nav__item > .md-nav__container, .md-nav__item > a.md-nav__link, .md-nav__item > label.md-nav__link'));
        const name=e=>(e.querySelector('.md-ellipsis')||e).textContent.trim().replace(/\s+/g,' ');
        const shown=all.filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&getComputedStyle(e).visibility==='visible';});
        const expected=shown.filter(e=>{const b=e.getBoundingClientRect();return b.top>=top&&b.bottom<=bottom;});
        const sampled=entries.map(e=>{
          e.animation.currentTime=0;
          const start=e.element.getBoundingClientRect().top, opacityStart=getComputedStyle(e.element).opacity;
          e.animation.currentTime=e.options.delay+e.options.duration;
          return {name:name(e.element),startedAt:e.startedAt,delta:start-e.element.getBoundingClientRect().top,
            opacityStart,opacityEnd:getComputedStyle(e.element).opacity,rendered:shown.includes(e.element)};
        });
        return {expected:expected.map(e=>({name:name(e),count:entries.filter(x=>x.element===e).length})),sampled,
          nested:entries.some(e=>entries.some(other=>other!==e&&e.element.contains(other.element)))};
      });
      for(const row of sidebar.expected) assert.equal(row.count,1,`${theme}: visible More row enters exactly once: ${row.name}`);
      const names=sidebar.sampled.map(e=>e.name);
      const required=['TECH','Ubuntu 下 Codex 无法在 VS Code 中打开','Watt Toolkit（Steam++）Mac 端 hosts 权限配置','Phi Lab','Diffusion Policy','WBC','年终总结','2025年终总结'];
      for(const name of required) assert(names.includes(name),`${theme}: specific More sidebar entrance: ${name}`);
      assert.deepEqual(names,sidebar.expected.map(e=>e.name),`${theme}: entrances follow the actual displayed row order`);
      for(const row of sidebar.sampled) {
        assert(row.rendered,`${theme}: hidden/collapsed row is not animated: ${row.name}`);
        assert(Math.abs(row.delta-16)<0.25,`${theme}: row visibly rises 16px: ${row.name} (${row.delta})`);
        assert.equal(row.opacityStart,'0',`${theme}: row starts transparent: ${row.name}`);
        assert.equal(row.opacityEnd,'1',`${theme}: row finishes opaque: ${row.name}`);
      }
      assert(!sidebar.nested,'More sidebar animates row surfaces without nested targets');
      sidebar.sampled.forEach((row,i)=>{if(i)assert(row.startedAt>sidebar.sampled[i-1].startedAt,`${theme}: More rows stagger in displayed order`);});
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture();
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='sidebar-row') && window.__hubEntrances.some(e=>e.key==='intro:paragraph-0'));
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-3'));
      assert(await page.evaluate(()=>window.__hubEntrances.every(e=>e.frames[0].translate==='0 16px' && e.options.duration===800)));
      await page.waitForFunction(()=>window.__hubEntrances.every(e=>e.animation.playState!=='running'));
      const sequence=await page.evaluate(()=>window.__hubEntrances.map(e=>({key:e.key,startedAt:e.startedAt,delay:e.options.delay,fill:e.options.fill})));
      assert.deepEqual(sequence.filter(e=>e.key.startsWith('card-')).map(e=>e.key),['card-1','card-2','card-3'],'all cards enter independently');
      for(const batch of [sequence.filter(e=>e.key==='sidebar-row'),sequence.filter(e=>e.key!=='sidebar-row')]) {
        assert(batch.length>2,'both lanes have multiple units');
        batch.forEach((e,i)=>{assert.equal(e.fill,'backwards');assert.equal(e.delay,0,'stagger is validated before immediate WAAPI starts');if(i)assert(e.startedAt>batch[i-1].startedAt,'successive units start at distinct ascending times')});
      }
      assert(await page.evaluate(()=>window.__hubEntrances.every((e,i,all)=>all.every((other,j)=>i===j||!e.element.contains(other.element)))),'no animation target contains another target');
      assert.equal(await page.locator('.landing-routes,.landing-selection,.landing-groups,.landing-group,.md-sidebar__scrollwrap,.md-sidebar--primary,.md-nav__list').evaluateAll(es=>es.reduce((n,e)=>n+e.getAnimations().length,0)),0,'section and sidebar parents never animate');
      const card=page.locator('.landing-route').first();
      const before=await card.boundingBox();
      const builds=await card.getAttribute('data-edwinos-control-glass-builds');
      await card.hover(); await page.waitForTimeout(300);
      const after=await card.boundingBox(); assert(Math.abs(after.y-before.y+3)<0.2,'card hover lifts exactly 3px');
      assert.equal(after.width,before.width); assert.equal(after.height,before.height);
      assert.equal(await card.getAttribute('data-edwinos-control-glass-builds'),builds,'hover reuses glass map');
      const old=await counts(page);
      await page.locator('.md-tabs__link').filter({hasText:"More"}).click();
      await page.waitForSelector('.landing-group');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.route.includes('%E7')&&e.key==='intro:paragraph-0'));
      assert(await page.evaluate(()=>window.__hubEntrances.filter(e=>!e.element.isConnected).every(e=>e.animation.playState!=='running')),'navigation cancels detached effects');
      await page.waitForFunction(()=>window.__hubEntrances.every(e=>e.animation.playState!=='running'));
      const moreSequence=(await counts(page)).filter(e=>e.route.includes('%E7')).map(e=>e.key);
      for(const key of ['lab-notes-title','note-1:heading','note-1:paragraph-0','note-2:heading','note-2:paragraph-0','note-3:heading','note-3:paragraph-0']) assert(moreSequence.includes(key),'More animates its heading and recommended entries separately: '+key);
      assert.equal(await page.locator('.landing-group,.landing-groups,.landing-footer,.landing-reading-list').evaluateAll(es=>es.reduce((n,e)=>n+e.getAnimations().length,0)),0);
      await page.locator('.md-tabs__link').filter({hasText:"ENotes"}).click();
      await page.waitForSelector('.landing-route'); await page.waitForTimeout(100);
      assert.equal((await counts(page)).filter(e=>e.route==='/OsdNotes/').length,old.length,'return does not replay viewed blocks');
      await page.goto(origin+'/HOME/friends/',{waitUntil:'load'});
      assert.equal((await counts(page)).length,0,'Friends has no hub entrance');
      await page.goto(origin+'/',{waitUntil:'load'});
      assert.equal((await counts(page)).length,0,'Overview keeps its own owner');
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:390,height:700});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-1'));
      assert(!(await counts(page)).some(e=>e.key==='start-here-title' || e.key==='sidebar-row'));
      await page.mouse.wheel(0,600);
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='start-here-title'));
      await page.mouse.wheel(0,-600); await page.waitForTimeout(250);
      assert.equal((await counts(page)).filter(e=>e.key==='start-here-title').length,1);
      assert.equal(await page.locator('.md-sidebar--primary').evaluate(e=>e.getAnimations().length),0,'native drawer host has no hub animation');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>window.__hubEntrances.every(e=>e.animation.playState!=='running'));
      assert(await page.evaluate(()=>window.__hubEntrances.every(e=>e.animation.playState!=='running')));
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture({noObserver:true});
      await page.goto(origin+more,{waitUntil:'load'}); await page.waitForTimeout(100);
      assert.equal((await counts(page)).length,0,'missing observer reveals directly');
      assert.deepEqual(errors,[]); await context.close();
    }
    // Calibrate narrow initial viewports against the actual rendered fonts and
    // geometry. A visible title must not consume the clipped description.
    async function clippedHeight(route, selector) {
      const {page,context}=await fixture({width:390,height:1000,reduce:true});
      await page.goto(origin+route,{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      const height=await page.locator(selector).first().evaluate(e=>Math.ceil(e.getBoundingClientRect().bottom+8));
      await context.close(); return height;
    }
    async function scrollIntoReadable(page, selector) {
      await page.locator(selector).first().evaluate(e=>{
        const inset=document.querySelector('.md-header').getBoundingClientRect().bottom;
        window.scrollTo(0,window.scrollY+e.getBoundingClientRect().top-inset-16);
      });
    }
    {
      const height=await clippedHeight('/OsdNotes/','.landing-route h3');
      const {page,context,errors}=await fixture({width:390,height});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1500);
      const clipping=await page.locator('.landing-route').first().evaluate(e=>({
        heading:e.querySelector('h3').getBoundingClientRect().bottom,body:e.querySelector('p').getBoundingClientRect().bottom,bottom:innerHeight}));
      assert(clipping.heading<clipping.bottom && clipping.body>clipping.bottom,'fixture clips the first card body below its visible title');
      assert(!(await counts(page)).some(e=>e.key==='card-1'),'partly visible card remains unseen');
      await scrollIntoReadable(page,'.landing-route');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-1'));
      assert(!(await counts(page)).some(e=>e.key==='footer-2'),'scroll without wheel does not consume farther unseen units');
      await page.waitForTimeout(1000); await page.evaluate(()=>window.scrollTo(0,0));
      await page.waitForTimeout(150); await scrollIntoReadable(page,'.landing-route'); await page.waitForTimeout(150);
      assert.equal((await counts(page)).filter(e=>e.key==='card-1').length,1,'card reentry does not replay');
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const height=await clippedHeight(more,'.landing-reading-entry h3');
      const {page,context,errors}=await fixture({width:390,height});
      await page.goto(origin+more,{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='note-1:heading'));
      await page.waitForTimeout(1500);
      assert(!(await counts(page)).some(e=>e.key==='note-1:paragraph-0'),'visible note heading does not consume its unseen description');
      await scrollIntoReadable(page,'.landing-reading-entry p');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='note-1:paragraph-0'));
      await page.waitForTimeout(900); await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(150);
      await scrollIntoReadable(page,'.landing-reading-entry p'); await page.waitForTimeout(150);
      assert.equal((await counts(page)).filter(e=>e.key==='note-1:paragraph-0').length,1,'description enters once per refresh');
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:390,height:350});
      await page.goto(origin+more+'#tech',{waitUntil:'load'}); await page.waitForTimeout(1000);
      assert(!(await counts(page)).some(e=>e.key==='tech-title'),'hash target is exposed statically');
      assert(!(await counts(page)).some(e=>e.key==='life-reflections-title'),'hash landing does not consume farther sections');
      await scrollIntoReadable(page,'#life-reflections');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='life-reflections-title'));
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:1280,height:500});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='intro:paragraph-0'));
      await page.waitForTimeout(1500);
      await page.locator('.md-tabs__link').filter({hasText:'More'}).click({force:true});
      await page.waitForSelector('.landing-group');
      await page.locator('.md-tabs__link').filter({hasText:'ENotes'}).click({force:true});
      await page.waitForSelector('.landing-route'); await page.waitForTimeout(1000);
      assert.equal((await counts(page)).filter(e=>e.route==='/OsdNotes/'&&e.key==='intro:paragraph-0').length,1,'route return preserves completed units');
      await scrollIntoReadable(page,'[data-hub-reveal="footer-2"]');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.route==='/OsdNotes/'&&e.key==='footer-2'));
      assert.deepEqual(errors,[]); await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:390,height:700,tallCard:true});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-1:heading'));
      assert(await page.locator('.landing-route p').first().evaluate(e=>e.getBoundingClientRect().height>innerHeight),'fixture paragraph exceeds a full viewport');
      assert(!(await counts(page)).some(e=>e.key==='card-1:paragraph-0'),'oversized body does not enter with heading');
      await page.locator('.landing-route p').first().evaluate(e=>window.scrollTo(0,window.scrollY+e.getBoundingClientRect().bottom-innerHeight+24));
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-1:paragraph-0'));
      assert.deepEqual(errors,[]); await context.close();
    }
    // First-arrival calls must be visible at the moment they actually start,
    // including cold fonts and a visual viewport shorter than layout height.
    for(const width of [390,541]) for(const route of ['/OsdNotes/',more]) {
      const {page,context,errors}=await fixture({width,height:420,fontDelay:180});
      await page.goto(origin+route,{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1700);
      const arrivals=await page.evaluate(()=>window.__hubEntrances.map(e=>({key:e.key,rect:e.rect,bounds:e.bounds,visibility:e.visibility})));
      assert(arrivals.length>0,'narrow first arrival animates visible units');
      for(const e of arrivals) {
        assert.equal(e.visibility,'visible',`released queued visibility before entrance: ${e.key}`);
        assert(e.rect.width>0&&e.rect.height>0&&e.rect.top>=e.bounds.top-0.5&&e.rect.bottom<=e.bounds.bottom+0.5&&e.rect.left>=e.bounds.left-0.5&&e.rect.right<=e.bounds.right+0.5,
          `first arrival starts wholly within actual viewport: ${width} ${route} ${JSON.stringify(e)}`);
      }
      assert(!arrivals.some(e=>e.key.startsWith('footer-')),'offscreen footer has no first-arrival effect');
      assert.equal(await page.locator('.md-content__inner').evaluate(e=>getComputedStyle(e).animationName),'none','no whole-page CSS entrance');
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:541,height:700,visualHeight:360});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1700);
      assert(!(await counts(page)).some(e=>e.key==='card-1'),'layout-visible but visual-viewport-clipped card has no entrance');
      assert(await page.evaluate(()=>window.__hubEntrances.every(e=>e.rect.bottom<=e.bounds.bottom+0.5)),'visual viewport bounds govern each actual start');
      await scrollIntoReadable(page,'.landing-route');
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-1'));
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:1280,height:1000});
      // Move the last delayed card after the first entrance starts. Queueing
      // must not consume it: it needs a fresh entrance only when later visible.
      await page.addInitScript(()=>{
        const nativeAnimate=Element.prototype.animate;
        Element.prototype.animate=function(frames,options){
          const animation=nativeAnimate.call(this,frames,options);
          if(this.getAttribute('data-hub-reveal')==='title' && !window.__shiftedHubCard){
            window.__shiftedHubCard=true;
            const target=document.querySelector('[data-hub-reveal="card-3"]');
            target.style.position='relative';target.style.top='1200px';
          }
          return animation;
        };
      });
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1700);
      assert(!(await counts(page)).some(e=>e.key==='card-3'),'a queued target moved outside viewport never starts');
      await page.locator('[data-hub-reveal="card-3"]').evaluate(e=>{e.style.removeProperty('top');e.style.removeProperty('position');});
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='card-3'));
      assert.equal((await counts(page)).filter(e=>e.key==='card-3').length,1,'invalidated queue retained unseen key for later entry');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>!document.querySelector('.is-hub-reveal-pending'));
      assert.equal(await page.locator('.is-hub-reveal-pending').count(),0,'reduced motion releases pending opacity');
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:1280,height:1000});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
      const outgoing=await page.locator('.notes-landing').elementHandle();
      await page.waitForFunction(()=>window.__hubEntrances.some(e=>e.key==='title'));
      await page.locator('.md-tabs__link').filter({hasText:'More'}).click();
      await page.waitForSelector('.landing-group');
      assert.equal(await outgoing.evaluate(e=>e.querySelectorAll('.is-hub-reveal-pending').length),0,'content replacement releases all pending opacity');
      assert(await page.evaluate(()=>window.__hubEntrances.filter(e=>!e.element.isConnected).every(e=>e.animation.playState!=='running')),'content replacement cancels active effects');
      assert.deepEqual(errors,[]);await context.close();
    }
    async function wheelThroughSelectedNotes(page, step=48) {
      const last=page.locator('[data-hub-reveal="note-1"] > p, [data-hub-reveal="note-2"] > p, [data-hub-reveal="note-3"] > p').last();
      const expected=await page.evaluate(()=>Array.from(document.querySelectorAll('.landing-reading-entry'))
        .filter(e=>/^note-[123]$/.test(e.dataset.hubReveal)).flatMap(entry=>Array.from(entry.children)
          .filter(e=>/^(H3|P)$/.test(e.tagName)&&(e.getBoundingClientRect().bottom>innerHeight||window.__hubEntrances.some(a=>a.element===e)))
          .map(e=>entry.dataset.hubReveal+':'+(e.tagName==='H3'?'heading':'paragraph-0'))));
      let reached=false;
      // Real wheel input, close enough together to belong to a continuous
      // gesture. Each normal-size heading/paragraph gets a viewport interval;
      // no script jumps directly to targets or waits out stagger per entry.
      for(let index=0;index<100;index++) {
        const bottom=await last.evaluate(e=>e.getBoundingClientRect().bottom);
        if(bottom<=await page.evaluate(()=>innerHeight-12)){reached=true;break;}
        await page.mouse.wheel(0,step);await page.waitForTimeout(24);
      }
      assert(reached,'wheel gesture reaches the final selected paragraph');
      await page.waitForTimeout(1300);
      const effects=await page.evaluate(()=>window.__hubEntrances.filter(e=>/^note-[123]:(heading|paragraph-0)$/.test(e.key))
        .map(e=>({key:e.key,canceled:e.canceled,state:e.animation.playState})));
      for(const key of expected) {
        const matches=effects.filter(e=>e.key===key);
        assert.equal(matches.length,1,`each selected unit enters once during real wheel traversal: ${key}; ${JSON.stringify(effects)}`);
        assert(!matches[0].canceled,`continuous wheel must not cancel ${key}`);
        assert.equal(matches[0].state,'finished',`continuous wheel allows the full entrance to finish: ${key}`);
      }
    }
    {
      const {page,context,errors}=await fixture({width:390,height:350});
      await page.goto(origin+'/OsdNotes/#coursework',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      // Reload the real hash URL twice, preserving an actual coursework
      // reading position before each reload. Each refresh resets read keys.
      for(let refresh=0;refresh<2;refresh++) {
        await page.locator('#coursework').evaluate(e=>window.scrollTo({top:window.scrollY+e.getBoundingClientRect().top-document.querySelector('.md-header').getBoundingClientRect().bottom-12,behavior:'instant'}));
        await page.waitForTimeout(120);
        // Material's scroll tracking updates the URL without navigation. Set
        // the reported refresh URL after positioning, rather than accidentally
        // reloading the last note's tracked hash from the previous traversal.
        await page.evaluate(()=>history.replaceState(history.state,'','#coursework'));
        await page.reload({waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1000);
        assert.equal(await page.evaluate(()=>window.__initialHubHash),'#coursework','real refresh starts at the reported hash URL');
        assert(await page.locator('.landing-reading-entry h3').first().evaluate(e=>e.getBoundingClientRect().top>=innerHeight),
          'refreshed coursework viewport leaves later recommended articles below the fold');
        assert(!(await counts(page)).some(e=>e.key.startsWith('note-')),'hash refresh does not spend unseen recommended entries');
        await wheelThroughSelectedNotes(page,36);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:541,height:500});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
      await wheelThroughSelectedNotes(page,54);
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context,errors}=await fixture({width:541,height:420});
      await page.goto(origin+more,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(()=>window.scrollTo(0,0));await page.reload({waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
      await wheelThroughSelectedNotes(page,42);
      assert.deepEqual(errors,[]);await context.close();
    }
    // Guard the actual reported flash: a valid 0→1 keyframe is insufficient
    // if the reader already saw the element opaque before animate() ran.
    for(const route of ['/OsdNotes/',more]) {
      const {page,context,errors}=await fixture({width:541,height:220,captureFrames:true,runtimeDelay:800});
      await page.goto(origin+route,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(1000);
      const order=await page.locator('.landing-reading-entry').evaluateAll(entries=>entries.map(e=>Number(e.dataset.hubReveal.replace('note-',''))).filter(n=>n<=3));
      for(const note of order) for(const tag of ['h3','p']) {
        await page.locator(`[data-hub-reveal="note-${note}"] > ${tag}`).evaluate(e=>{
          window.scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.md-header').getBoundingClientRect().bottom-8,behavior:'instant'});
        });
        await page.waitForFunction(({note,tag})=>window.__hubEntrances.some(e=>e.element.parentElement?.dataset.hubReveal===`note-${note}`&&e.element.tagName===tag.toUpperCase()),{note,tag});
        await page.waitForTimeout(850);
      }
      const paints=await page.evaluate(()=>window.__hubPaints);
      for(const note of [1,2,3]) for(const tag of ['H3','P']) {
        const key=`note-${note}:${tag}`, samples=paints.filter(s=>s.key===key);
        const before=samples.filter(s=>!s.started),after=samples.filter(s=>s.started);
        assert(before.length>5,`${route}/${key}: sampled genuinely pending frames including cold runtime`);
        assert(before.every(s=>s.opacity<.001),`${route}/${key}: never paints text before entrance`);
        assert(after.length>5&&after.at(-1).opacity>.999,`${route}/${key}: entrance reaches visible text`);
        for(let i=1;i<after.length;i++) assert(after[i].opacity>=after[i-1].opacity-.002,`${route}/${key}: no visible-then-hidden reversal`);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    {
      const {page,context}=await fixture({javascript:false});
      await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
      assert(await page.locator('.landing-reading-list').isVisible(),'no-JS content stays readable');
      assert.equal(await page.locator('.landing-route a').count(),0);
      await context.close();
    }
    console.log(`PASS: ${visualStates} width/theme states; single underline; static cards & 3px hover; glass-map reuse; individual article/card/sidebar rows with ordered stagger; all 8 visible More sidebar rows with real 16px/opacity entrances in both themes; strict live viewport starts; cold fonts; queued layout-shift recovery; visual viewport clipping; two real #coursework refreshes; continuous real-wheel completed entrances for all three notes; clipped-card/description scroll entry; no-intent scroll; partial hash exposure; unseen route return/no replay; reduced motion; instant navigation cleanup; Overview/Friends/no-JS regressions.`);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
