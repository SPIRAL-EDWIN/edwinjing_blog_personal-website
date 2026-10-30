const {chromium} = require('playwright');
const fs = require('fs');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
 const results=[]; const base='http://127.0.0.1:8000/';
 async function state(page) { return page.evaluate(()=>({active:document.documentElement.classList.contains('edwinos-intro-pending'),hidden:document.querySelector('#edwinos-intro').hidden,reason:document.querySelector('#edwinos-intro').dataset.finishReason,elapsed:document.querySelector('#edwinos-intro').dataset.elapsed,resources:document.querySelector('#edwinos-intro').dataset.resources,inert:document.querySelectorAll('[inert]').length,overflow:document.documentElement.scrollWidth>innerWidth})); }
 for (const width of [375,768,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:width===768?'dark':'light'});
   const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'?intro=1',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(850);
   await page.screenshot({path:`experiments/home-redesign/intro-${width}.png`});
   const during=await state(page);
   await page.waitForFunction(()=>!document.documentElement.classList.contains('edwinos-intro-pending'),null,{timeout:8000});
   results.push({case:'forced',width,during,after:await state(page),errors});
   await page.goto(base,{waitUntil:'domcontentloaded'}); results.push({case:'same-tab-visited',width,after:await state(page)});
   await context.close();
 }
 const context=await browser.newContext(); const page=await context.newPage();
 await page.goto(base,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(800); results.push({case:'first-visit',state:await state(page)});
 await page.keyboard.press('Escape'); results.push({case:'escape-does-not-skip',state:await state(page)});
 await page.waitForFunction(()=>!document.documentElement.classList.contains('edwinos-intro-pending')); await page.reload({waitUntil:'domcontentloaded'}); results.push({case:'reload',state:await state(page)});
 const second=await context.newPage(); await second.goto(base,{waitUntil:'domcontentloaded'}); await second.waitForTimeout(500); results.push({case:'new-tab',state:await state(second)}); await second.keyboard.press('a');
 await page.goto(base+'?intro=0',{waitUntil:'domcontentloaded'}); results.push({case:'force-off',state:await state(page)});
 await page.evaluate(()=>window.EdwinOSIntro.showLoader({reason:'test-pending',until:new Promise(()=>{})}));
 results.push({case:'hard-deadline',state:await state(page)});
 const note=await context.newPage(); await note.goto(base+'OsdNotes/Github%E5%AD%A6%E4%B9%A0%E7%AC%94%E8%AE%B0/Git%20with%20gh/?intro=1',{waitUntil:'domcontentloaded'});
 await note.waitForFunction(()=>!document.documentElement.classList.contains('edwinos-intro-pending'),null,{timeout:8000});
 results.push({case:'note-direct',state:await state(note),video:await note.locator('[data-blog-home-video]').count()});
 await context.close();
 const reduced=await browser.newContext({reducedMotion:'reduce'}); const rp=await reduced.newPage(); await rp.goto(base+'?intro=1',{waitUntil:'domcontentloaded'}); await rp.waitForTimeout(300);
 results.push({case:'reduced',state:await state(rp),question:await rp.locator('[data-intro-question]').textContent(),animations:await rp.evaluate(()=>document.querySelector('#edwinos-intro').getAnimations({subtree:true}).map(a=>a.effect.getKeyframes()))}); await rp.keyboard.press('Escape'); await reduced.close();
 fs.writeFileSync('experiments/home-redesign/intro-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results)); await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
