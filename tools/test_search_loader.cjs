#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../docs/javascripts/search-loader.js'), 'utf8');
function harness({query='', saveData=false, navigationType='navigate'}={}) {
  const events={}, timers=[], frames=[], idle=[], workers=[];
  const meta={textContent:''}; let now=2000;
  const address='https://example.test/site/assets/javascripts/workers/search-exact-worker.js?v=test';
  class Worker {
    constructor(url) {this.url=url;this.messages=[];this.listeners={};workers.push(this);}
    postMessage(value){this.messages.push(value.type);}
    addEventListener(type, fn){this.listeners[type]=fn;}
    emit(value){this.listeners.message({data:value});}
  }
  function on(type, fn){(events[type] ||= []).push(fn);}
  const window={Worker,location:{href:'https://example.test/site/'+query},navigator:{connection:{saveData}},
    addEventListener:on,setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
    requestAnimationFrame(fn){frames.push(fn);},requestIdleCallback(fn){idle.push(fn);return idle.length;},cancelIdleCallback(){}};
  window.performance={getEntriesByType:()=>[{type:navigationType}]};
  window.history={state:{test:true},replaceState(state,_,url){assert.equal(state.test,true);window.location.href=url;}};
  const document={readyState:'loading',baseURI:window.location.href,addEventListener:on,
    getElementById(){return {textContent:JSON.stringify({search:address})};},querySelector(){return meta;}};
  vm.runInNewContext(source,{window,document,URL,Date:{now:()=>now},Object});
  return {window,Worker,workers,meta,address,
    fire(type,target={closest:()=>true,tagName:'INPUT'},key){for(const fn of events[type]||[]) fn({target,key});},
    frames(){while(frames.length)frames.shift()();},timers(){while(timers.length)timers.shift()();},
    idle(){while(idle.length)idle.shift()();},tick(){now+=2000;}};
}
{
  const h=harness();
  const other=new h.window.Worker('other.js');
  assert.equal(h.window.Worker === h.Worker,false);
  const worker=new h.window.Worker(h.address);
  assert.equal(h.window.Worker,h.Worker,'native constructor restored immediately');
  assert.deepEqual(worker.messages,[],'no heavy load before intent or after-paint idle');
  h.fire('load');h.frames();assert.deepEqual(worker.messages,[]);
  h.timers();assert.deepEqual(worker.messages,[]);
  h.idle();assert.deepEqual(worker.messages,[4]);
  h.fire('input');assert.deepEqual(worker.messages,[4],'one in-flight start');
  worker.emit({type:5,data:{status:'error'}});h.tick();h.fire('input');
  assert.deepEqual(worker.messages,[4,4]);
  worker.emit({type:1});h.fire('focusin');assert.deepEqual(worker.messages,[4,4]);
  assert.deepEqual(other.messages,[],'unrelated workers untouched');
}
{
  const h=harness();h.fire('focusin');
  const worker=new h.window.Worker(h.address);
  assert.deepEqual(worker.messages,[4],'early intent retained before Material creates worker');
}
for (const query of ['?q=robot','?query=robot']) {
  const h=harness({query});const worker=new h.window.Worker(h.address);assert.deepEqual(worker.messages,[4]);
}
for (const query of ['?q=robot&h=robot&lang=zh#section','?query=robot&h=robot&lang=zh#section']) {
  const h=harness({query,navigationType:'reload',saveData:true});
  const url=new URL(h.window.location.href);
  assert.equal(url.searchParams.has('q'),false);
  assert.equal(url.searchParams.has('query'),false);
  assert.equal(url.searchParams.get('h'),'robot');
  assert.equal(url.searchParams.get('lang'),'zh');
  assert.equal(url.hash,'#section');
  const worker=new h.window.Worker(h.address);
  assert.deepEqual(worker.messages,[],'reload must not resurrect a shared query or eagerly start search');
}
{
  const h=harness({query:'?h=t',saveData:true});const worker=new h.window.Worker(h.address);
  h.fire('load');h.frames();h.timers();h.idle();assert.deepEqual(worker.messages,[],'highlight/save-data visits need no corpus');
  h.fire('keydown',{closest:()=>false,tagName:'BODY'},'/');assert.deepEqual(worker.messages,[4]);
}
console.log('Search loader: after-paint idle, intent races, failure retry, native Worker restoration, deep queries, highlight and Save-Data passed.');
