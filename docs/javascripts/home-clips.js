/* The In motion quilt owns its media, animation loop, and WebGL context. */
(() => {
  'use strict';
  let active = null, userPaused = false;
  const clamp = x => Math.max(0, Math.min(1, x));

  function renderer() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true});
    if (!gl) return null;
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    try {
      const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}');
      const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;
        uniform sampler2D image; uniform vec2 size, scale, offset; uniform float pitch; uniform vec3 ink;
        void main() {
          vec2 point=gl_FragCoord.xy; float a=.70710678;
          vec2 rotated=vec2(point.x-point.y,point.x+point.y)*a;
          vec2 cell=(floor(rotated/pitch)+.5)*pitch;
          vec2 center=vec2(cell.x+cell.y,cell.y-cell.x)*a;
          vec2 uv=clamp(center/size*scale+offset,0.,1.);
          vec3 rgb=texture2D(image,uv).rgb;
          float lum=dot(rgb,vec3(.299,.587,.114));
          float dark=clamp((.88-lum)/(.88-.22),0.,1.);
          float radius=sqrt(dark)*pitch*.74;
          float coverage=1.-smoothstep(radius-.8,radius+.8,distance(rotated,cell));
          gl_FragColor=vec4(ink*coverage,coverage);
        }`);
      const program=gl.createProgram(); gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const p=gl.getAttribLocation(program,'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
      const texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      const uniform=name=>gl.getUniformLocation(program,name);
      const u={size:uniform('size'), scale:uniform('scale'), offset:uniform('offset'), pitch:uniform('pitch'), ink:uniform('ink')};
      return {
        draw(tile, source, dpr, dark) {
          const w=Math.max(1,Math.round(tile.width*dpr)), h=Math.max(1,Math.round(tile.height*dpr));
          const sw=source.videoWidth || source.naturalWidth, sh=source.videoHeight || source.naturalHeight;
          if (!sw || !sh || !tile.ctx) return false;
          if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; }
          if (tile.canvas.width!==w || tile.canvas.height!==h) { tile.canvas.width=w; tile.canvas.height=h; }
          gl.viewport(0,0,w,h); gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
          let sx=1,sy=1; if (sw/sh>w/h) sx=(w/h)/(sw/sh); else sy=(sw/sh)/(w/h);
          const ox=(1-sx)*tile.focus[0], oy=(1-sy)*(1-tile.focus[1]);
          gl.uniform2f(u.size,w,h); gl.uniform2f(u.scale,sx,sy); gl.uniform2f(u.offset,ox,oy);
          gl.uniform1f(u.pitch,(tile.width>=250?5:4.5)*dpr);
          const color=dark?[13/255,17/255,23/255]:[31/255,35/255,40/255]; gl.uniform3f(u.ink,...color);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
          tile.ctx.clearRect(0,0,w,h); tile.ctx.drawImage(canvas,0,0); return true;
        },
        dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
      };
    } catch (_) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  }

  function mount(section) {
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const saveData=!!navigator.connection?.saveData;
    const toggle=section.querySelector('[data-home-clips-toggle]');
    const toggleLabel=toggle.querySelector('[data-home-clips-toggle-label]');
    const tiles=[...section.querySelectorAll('[data-home-clip]')].map((el,i) => {
      const canvas=el.querySelector('canvas'), focus=(el.dataset.focus||'.5,.5').split(',').map(Number);
      const tile={el,canvas,ctx:canvas.getContext('2d'),img:el.querySelector('.home-clip__poster'),video:el.querySelector('video'),button:el.querySelector('[data-home-clip-play]'),focus:focus.length===2&&focus.every(Number.isFinite)?focus.map(clamp):[.5,.5], jitter:((Math.sin(12.9898*i+4.1)*43758.5453)%1+1)%1, dirty:true, state:'', lastTime:-1, paused:false, explicit:false, blocked:false, width:0,height:0};
      el.style.setProperty('--focus-x',(100*tile.focus[0])+'%'); el.style.setProperty('--focus-y',(100*tile.focus[1])+'%');
      return tile;
    });
    let gl=motion.matches?null:renderer(), observer, resize, themeObserver, raf=0, inRange=false, loopRange=false, sectionTop=0, stopped=false, paused=motion.matches || userPaused;
    section.classList.add('home-clips-ready'); toggle.hidden=saveData;
    function detach(t) { t.video.pause(); if(t.video.hasAttribute('src')) {t.video.removeAttribute('src');t.video.load();} t.el.removeAttribute('data-video-ready'); t.lastTime=-1; }
    function attach(t) { if(saveData || t.video.hasAttribute('src')) return; t.video.preload='auto'; t.video.src=t.el.dataset.src; }
    function play(t) { if(saveData || (paused && !t.explicit) || t.paused || document.hidden || t.blocked || (motion.matches && !t.explicit)) return; attach(t); if (!t.video.paused) return; const p=t.video.play(); if(p?.catch) p.catch(e=>{if(e.name!=='AbortError') t.blocked=true;}); }
    function updateButton(t) { const isPlaying=!t.video.paused; t.button.textContent=isPlaying?'Pause clip':'Play clip'; t.button.setAttribute('aria-label',(isPlaying?'Pause ':'Play ')+t.el.querySelector('.home-clip__chip span').textContent); }
    function updateToggle() { toggleLabel.textContent=paused?'Play clips':'Pause clips'; toggle.setAttribute('aria-pressed',String(paused)); }
    function setPause(t) { t.paused=!t.video.paused; t.explicit=!t.paused; t.blocked=false; if(t.paused) t.video.pause(); else { play(t); } updateButton(t); }
    function onToggle() { paused=!paused; userPaused=paused; if(paused) tiles.forEach(t=>{t.explicit=false;t.video.pause();}); else tiles.forEach(t=>{t.paused=false;t.blocked=false;if(motion.matches)t.explicit=true;}); updateToggle(); schedule(); }
    function onKey(e) { if(e.target!==e.currentTarget || (e.key!==' ' && e.key!=='Enter')) return; e.preventDefault(); setPause(tiles.find(t=>t.el===e.currentTarget)); }
    function measure() {
      const y=window.scrollY;
      sectionTop=section.getBoundingClientRect().top+y;
      tiles.forEach(t=>{const rect=t.el.getBoundingClientRect(); t.top=rect.top+y; t.width=rect.width; t.height=rect.height; t.dirty=true;});
    }
    // Preload within a viewport; run the animation loop only near the grid.
    // Tile offsets are cached; one section position check corrects upstream pin shifts.
    function updateRange() {
      if (!inRange || stopped) return;
      const vh=window.innerHeight, scroll=window.scrollY;
      const currentTop=section.getBoundingClientRect().top+scroll;
      const shift=currentTop-sectionTop;
      if (shift) { tiles.forEach(t=>{t.top+=shift;}); sectionTop=currentTop; }
      const top=Math.min(...tiles.map(t=>t.top))-scroll;
      const bottom=Math.max(...tiles.map(t=>t.top+t.height))-scroll;
      loopRange=top<vh+64 && bottom>-64;
      if (!loopRange) {
        cancelAnimationFrame(raf); raf=0;
        tiles.forEach(t=>{
          const tileTop=t.top-scroll, tileBottom=tileTop+t.height;
          if (tileBottom<=-vh || tileTop>=2*vh) detach(t);
          else if (!motion.matches && !saveData) attach(t);
          t.video.pause();
        });
      } else schedule();
    }
    function onResize() { measure(); updateRange(); }
    function onVisibility() { if(document.hidden) tiles.forEach(t=>t.video.pause()); else {measure();updateRange();} }
    function onMotion() { tiles.forEach(t=>{detach(t);t.explicit=false;t.dirty=true;}); paused=motion.matches || userPaused; updateToggle(); gl?.dispose(); gl=motion.matches?null:renderer(); updateRange(); }
    function schedule() { if(!raf && !stopped && inRange && loopRange && !document.hidden) raf=requestAnimationFrame(frame); }
    function frame() {
      raf=0; if(stopped || !inRange || !loopRange || document.hidden) return;
      const vh=window.innerHeight, dpr=Math.min(window.devicePixelRatio||1,2);
      const dark=document.documentElement.getAttribute('data-md-color-scheme')==='slate' || document.body.getAttribute('data-md-color-scheme')==='slate';
      for(const t of tiles) {
        const top=t.top-window.scrollY, bottom=top+t.height;
        const near=bottom>-vh && top<2*vh;
        const visible=Math.max(0,Math.min(bottom,vh)-Math.max(top,0)) >= t.height*.1;
        if(!near) detach(t);
        else if(!motion.matches && !saveData) attach(t);
        if(visible) play(t); else t.video.pause();
        if(motion.matches) {if(t.state!=='real'){t.el.dataset.state='real';t.state='real';} continue;}
        const value=Math.round(clamp(((.92*vh-(top+t.height/2))/(.5*vh))*1.9-.9*t.jitter)*100)/100;
        const state=value<=0?'raster':value>=1?'real':'mix';
        if(t.state!==state) {t.el.dataset.state=state;t.state=state;}
        if(t.reveal!==value) {t.el.style.setProperty('--reveal',value);t.reveal=value;}
        if(gl && state!=='real' && bottom>0 && top<vh && (t.dirty || (!t.video.paused && t.lastTime!==t.video.currentTime))) {
          const source=t.video.readyState>=2?t.video:t.img;
          try { if(gl.draw(t,source,dpr,dark)) {t.el.dataset.rasterReady='';t.dirty=false;t.lastTime=t.video.currentTime;} } catch (_) {gl.dispose();gl=null;tiles.forEach(x=>x.el.removeAttribute('data-raster-ready'));}
        }
      }
      schedule();
    }
    const handlers=[];
    tiles.forEach(t=>{
      const dirty=()=>{t.dirty=true;schedule();};
      const posterReady=()=>{t.img.parentElement.style.backgroundImage='none';dirty();};
      if(t.img.complete && t.img.naturalWidth) posterReady();
      const stateChange=()=>{updateButton(t);dirty();};
      const ready=()=>{t.el.dataset.videoReady='';dirty();};
      const click=()=>setPause(t);
      t.img.addEventListener('load',posterReady);t.video.addEventListener('loadeddata',ready);t.video.addEventListener('play',stateChange);t.video.addEventListener('pause',stateChange);
      t.el.addEventListener('keydown',onKey); t.button.addEventListener('click',click); t.button.hidden=saveData;
      if(saveData) { t.el.removeAttribute('tabindex'); t.el.setAttribute('aria-label',t.el.getAttribute('aria-label').replace(' Press space or enter to pause or play.','')); }
      updateButton(t);
      handlers.push(()=>{t.img.removeEventListener('load',posterReady);t.video.removeEventListener('loadeddata',ready);t.video.removeEventListener('play',stateChange);t.video.removeEventListener('pause',stateChange);t.el.removeEventListener('keydown',onKey);t.button.removeEventListener('click',click);});
    });
    toggle.addEventListener('click',onToggle); document.addEventListener('visibilitychange',onVisibility); window.addEventListener('resize',onResize); window.addEventListener('scroll',updateRange,{passive:true}); motion.addEventListener('change',onMotion);
    if('MutationObserver' in window) {themeObserver=new MutationObserver(()=>{tiles.forEach(t=>t.dirty=true);schedule();}); themeObserver.observe(document.body,{attributes:true,attributeFilter:['data-md-color-scheme']});}
    if('ResizeObserver' in window) {resize=new ResizeObserver(()=>{measure();updateRange();});resize.observe(section);resize.observe(section.parentElement);tiles.forEach(t=>resize.observe(t.el));}
    if('IntersectionObserver' in window) {observer=new IntersectionObserver(entries=>{inRange=entries.some(e=>e.isIntersecting);if(inRange){measure();updateRange();}else {loopRange=false;cancelAnimationFrame(raf);raf=0;tiles.forEach(detach);}}, {rootMargin:'100% 0px'});observer.observe(section);}
    else {inRange=true;measure();updateRange();}
    measure();updateToggle();
    return {section,dispose() { stopped=true;cancelAnimationFrame(raf);observer?.disconnect();resize?.disconnect();themeObserver?.disconnect();toggle.removeEventListener('click',onToggle);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',onResize);window.removeEventListener('scroll',updateRange);motion.removeEventListener('change',onMotion);handlers.forEach(h=>h());tiles.forEach(detach);gl?.dispose();section.classList.remove('home-clips-ready'); }};
  }
  function init() { const section=document.querySelector('[data-home-clips]'); if(active?.section===section)return; active?.dispose(); active=section?mount(section):null; }
  if(window.document$?.subscribe) window.document$.subscribe(init);
  else if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
