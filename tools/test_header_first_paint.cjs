'use strict';
// Build first. Sample actual cold/reloaded browser frames, including the gap
// before ui-perf runs; assert geometry rather than only computed CSS rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const site = path.resolve(process.env.SITE_DIR || path.join(__dirname, '../site'));
const origin = 'http://edwinos.test';
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
  '.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
async function main() {
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const reports = [];
  try {
    for(const width of [390,480,500,526,541,562,768,1280]) for(const theme of ['light','dark']) {
      // The regression was large at 500px. Delay its font as well as runtime
      // on both themes to distinguish font replacement from startup animation.
      const coldFont = width === 500;
      const context = await browser.newContext({viewport:{width,height:760},colorScheme:theme,reducedMotion:'no-preference'});
      await context.addInitScript(()=>{
        window.__headerFrames=[];
        const start=performance.now();
        function sample() {
          const search=document.querySelector('.md-header .md-search');
          const icon=search && search.querySelector('label.md-search__icon[for="__search"]');
          const tabs=document.querySelector('.md-tabs__list');
          if(search && icon && tabs) {
            const b=icon.getBoundingClientRect(), s=search.getBoundingClientRect();
            window.__headerFrames.push({time:performance.now(),x:b.x,shellX:s.x,shellWidth:s.width,
              token:document.documentElement.style.getPropertyValue('--edwinos-header-tabs-width'),
              duration:getComputedStyle(search).transitionDuration,font:document.fonts.status,
              runtime:search.dataset.edwinosSearchMode || '',open:document.querySelector('#__search').checked});
          }
          if(performance.now()-start<2700) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin) return route.abort();
        let relative=decodeURIComponent(url.pathname);
        if(relative.endsWith('/')) relative+='index.html';
        const file=path.resolve(site,'.'+relative);
        if(!file.startsWith(site+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
          return route.fulfill({status:404,body:''});
        if(/\/ui-perf\.js$/.test(url.pathname)) await new Promise(resolve=>setTimeout(resolve,650));
        if(coldFont && /\/inter-latin\.woff2$/.test(url.pathname)) await new Promise(resolve=>setTimeout(resolve,1100));
        return route.fulfill({contentType:mime[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
      });
      for(const navigation of ['cold','reload']) {
        if(navigation==='cold') await page.goto(origin+'/OsdNotes/',{waitUntil:'load'});
        else await page.reload({waitUntil:'load'});
        await page.waitForTimeout(coldFont?1500:800);
        const frames=await page.evaluate(()=>window.__headerFrames.filter(f=>!f.open));
        assert(frames.length>8,`${width}/${theme}/${navigation}: sample rendered startup frames`);
        assert(frames.some(f=>!f.runtime),`${width}/${theme}/${navigation}: capture pre-runtime geometry`);
        assert(frames.every(f=>f.token),`${width}/${theme}/${navigation}: real tab width seeded before first sampled paint`);
        assert(frames.every(f=>f.duration.split(',').every(v=>parseFloat(v)===0)),`${width}/${theme}/${navigation}: passive layout never uses search interaction transition`);
        // Real font replacement may correct a resting endpoint in one step;
        // the former failure interpolated over 20+ consecutive frames.
        let moving=0,maxMoving=0;
        for(let i=1;i<frames.length;i++) {
          moving=Math.abs(frames[i].x-frames[i-1].x)>.12?moving+1:0;
          maxMoving=Math.max(maxMoving,moving);
        }
        assert(maxMoving<=1,`${width}/${theme}/${navigation}: no multi-frame startup slide (${maxMoving})`);
        if(!coldFont) assert(Math.max(...frames.map(f=>f.x))-Math.min(...frames.map(f=>f.x))<.6,`${width}/${theme}/${navigation}: stable icon position from first paint`);
        reports.push({width,theme,navigation,coldFont,samples:frames.length,firstX:frames[0].x,lastX:frames.at(-1).x,maxMoving});
      }
      if(width===500) {
        const shell=page.locator('.md-header .md-search');
        const rest=await shell.boundingBox();
        await page.locator('.md-search__form .md-search__icon[for="__search"]').click();
        await page.waitForFunction(()=>document.querySelector('#__search').checked);
        await page.waitForTimeout(90);
        const opening=await shell.boundingBox();
        assert(await shell.evaluate(e=>getComputedStyle(e).transitionProperty.includes('left')),'explicit search opening retains coordinate transition');
        await page.waitForTimeout(500);
        const open=await shell.boundingBox();
        assert(opening.width>rest.width+1 && opening.width<open.width-1,'opening interpolates between rest and expanded shell');
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('#__search').checked);
        await page.waitForTimeout(90);
        const closing=await shell.boundingBox();
        assert(await shell.evaluate(e=>getComputedStyle(e).transitionProperty.includes('left')),'explicit search closing retains coordinate transition');
        assert(closing.width>rest.width+1 && closing.width<open.width-1,'closing interpolates back to rest');
        await page.waitForTimeout(500);
        const closed=await shell.boundingBox();
        assert(Math.abs(closed.x-rest.x)<.3 && Math.abs(closed.width-rest.width)<.3,'search closes to the original resting geometry');
        assert.equal(await shell.evaluate(e=>getComputedStyle(e).transitionDuration),'0s','after close passive measurements return to immediate layout');
      }
      assert.deepEqual(errors,[]); await context.close();
    }
    if(process.env.REPORT_PATH) fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(reports,null,2));
    console.log(`PASS: ${reports.length} cold/reload startup states; responsive first-paint tab geometry; delayed font/runtime; no passive icon slide; real opening and closing interpolation in both themes.`);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
