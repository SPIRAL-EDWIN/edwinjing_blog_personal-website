const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'}),results=[];
 for(const kind of ['desktop','touch','save-data','reduced']){
  console.log('Testing',kind);
  const c=await b.newContext({viewport:{width:kind==='touch'?375:1440,height:1000},hasTouch:kind==='touch',isMobile:kind==='touch',reducedMotion:kind==='reduced'?'reduce':'no-preference'});
  if(kind==='save-data')await c.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
  const p=await c.newPage(),requests=[],errors=[];p.on('request',r=>{if(r.url().includes('/assets/media/'))requests.push(r.url().split('/').pop())});p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:8000/?intro=0',{waitUntil:'domcontentloaded'});await p.waitForSelector('.blog-home-clips:not([hidden])');await p.waitForTimeout(400);
  const before=[...new Set(requests)];assert(!before.some(x=>/board|banana/.test(x)));if(kind==='save-data')assert.equal(before.length,0);
  if(kind==='desktop'){await p.locator('.blog-home-feature').hover();await p.waitForFunction(()=>!document.querySelector('video').paused);await p.mouse.move(0,0);await p.waitForFunction(()=>document.querySelector('video').paused);}
  if(kind==='reduced'){await p.locator('.blog-home-feature').hover();assert(await p.locator('video').evaluate(v=>v.paused));await p.mouse.move(0,0);}
  await p.getByRole('button',{name:'Banana',exact:true}).click();await p.waitForFunction(()=>{const v=document.querySelector('video');return v.currentSrc.includes('banana')&&v.readyState>=2&&!v.paused});
  assert(!requests.some(x=>x.includes('board')));
  const banana=await p.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
  await p.getByRole('button',{name:'Board',exact:true}).click();await p.waitForFunction(()=>{const v=document.querySelector('video');return v.currentSrc.includes('board')&&v.readyState>=2&&!v.paused});
  const board=await p.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
  if(kind==='touch') {await p.getByRole('button',{name:'Pause robot preview'}).click();assert(await p.locator('video').evaluate(v=>v.paused));}
  await p.locator('#start-here').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelector('video').paused);
  console.log(kind,errors);assert.equal(errors.length,0);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  results.push({kind,before,requests:[...new Set(requests)],banana,board,errors,offscreenPaused:true});await c.close();
 }
 fs.writeFileSync('experiments/home-redesign/media-results.json',JSON.stringify(results,null,2));console.log(results);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
