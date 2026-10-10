'use strict';
// Exercise the real activation owner against an event/clock harness: an IME
// preedit must not query or navigate, and same-note results must close early.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('docs/javascripts/ui-perf.js', 'utf8');
const activation = source.slice(source.indexOf('  function setupSearchActivation()'), source.indexOf('  function normalizePaletteButtons()'));
let queue = new Map(), next = 0, emitted = [], resultLayouts = 0, destinations = [], duringClose = null;
const handlers = new Map();
function listen(target, type, fn) {
  let map = handlers.get(target); if (!map) handlers.set(target, map = new Map());
  let list = map.get(type); if (!list) map.set(type, list = []); list.push(fn);
}
function send(target, type, props = {}) {
  const event = {type, key:'', button:0, isTrusted:true, preventDefault(){this.prevented=true;}, stopPropagation(){this.propagationStopped=true;}, stopImmediatePropagation(){this.stopped=true;}, ...props};
  for (const fn of handlers.get(target)?.get(type) || []) fn(event);
  return event;
}
function flush() { const jobs = [...queue.values()]; queue.clear(); jobs.forEach(fn => fn()); }
const input = {value:'early query', isConnected:true, setAttribute(){}, focus(){}, blur(){}, dispatchEvent(e){emitted.push(this.value); send(this,e.type,{...e,isTrusted:false});}};
const output = {hidden:true};
const form = {dataset:{}};
const toggle = {checked:false, dispatchEvent(e){send(this,e.type,e);if(!this.checked&&duringClose)duringClose();}};
const search = {dataset:{},isConnected:true,classList:{toggle(){}},querySelector(s){return s.includes('input') ? input : s.includes('form') ? form : output;}};
const runtime = {search,header:{},listen,timer(fn){queue.set(++next,fn);return next;},updateResults(){resultLayouts++;},allowOpen(){},cancelFocus(){},deferActivation(fn){fn();},focusInput(fn){if(fn)fn();}};
const window = {location:{href:'http://127.0.0.1:8000/note/?h=settled#target',origin:'http://127.0.0.1:8000',assign(href){destinations.push(href);}},history:{replaceState(){}},performance:{now:()=>0},setTimeout(fn){queue.set(++next,fn);return next;},clearTimeout(id){queue.delete(id);},requestAnimationFrame(fn){queue.set(++next,fn);return next;},cancelAnimationFrame(id){queue.delete(id);}};
const document = {querySelector(s){return s==='.md-search' ? search : s.includes('data-md-toggle') ? toggle : null;}};
vm.runInNewContext(activation+';setupSearchActivation();', {window,document,URL,URLSearchParams,headerSearchRuntime:runtime,clearSavedSearchQuery(){},beginHeaderSearchTransition(){},KeyboardEvent:function(type,p){Object.assign(this,{type},p);},Event:function(type,p){Object.assign(this,{type},p);}});
// The static input is usable before the Material/UI scripts finish downloading.
flush();
assert.equal(toggle.checked,true);
assert.equal(output.hidden,false);
assert.deepEqual(emitted,['early query']);
toggle.checked=false;send(toggle,'change');flush();
emitted.length=0;resultLayouts=0;
// Multiple keyup/input events coalesce. Preedit does not touch result layout.
send(input,'compositionstart'); input.value='s'; send(input,'input',{isComposing:true});
assert.equal(send(input,'keyup',{isComposing:true}).stopped,true);
assert.equal(send(input,'keydown',{key:'Enter',keyCode:229,isComposing:true}).stopped,true);
flush(); assert.deepEqual(emitted,[]); assert.equal(resultLayouts,0);
send(input,'compositionend'); send(input,'input'); send(input,'keyup'); flush();
assert.deepEqual(emitted,['s']);
input.value='second'; send(input,'input'); input.value='settled'; send(input,'input'); flush();
assert.deepEqual(emitted,['s','settled']);
// Exercise actual window-capture handling. Clearing search can detach/mutate
// result nodes synchronously; it must not change the already captured URL.
function result(href, options = {}) {
  const link = {href, target: options.target || '', hasAttribute: name => name === 'download' && !!options.download};
  return {link,closest: selector => selector === '.md-search-result__link[href]' ? link : null};
}
function openQuery() { input.value='settled'; toggle.checked=true; send(toggle,'change'); }
openQuery();
const same=send(window,'click',{target:result('/note/?h=settled#another')});
assert.equal(toggle.checked,false); assert.equal(input.value,''); assert.equal(output.hidden,true);
assert.equal(same.prevented,undefined); assert.deepEqual(destinations,[]);
flush(); assert.equal(emitted.at(-1),'');
// Cross-page selections stop Material before it can publish h against old DOM.
const destination='http://127.0.0.1:8000/OsdNotes/CS101/Python/?h=jing#lec6-files';
openQuery();
const clickedResult=result(destination);
duringClose=()=>{clickedResult.link.href='http://127.0.0.1:8000/';};
const cross=send(window,'click',{target:clickedResult});
duringClose=null;
assert.equal(cross.prevented,true); assert.equal(cross.stopped,true);
assert.deepEqual(destinations,[destination]); assert.equal(toggle.checked,false);
// A new highlight term on the current note needs document reinitialization.
openQuery(); send(window,'click',{target:result('/note/?h=other#target')});
assert.equal(destinations.at(-1),'http://127.0.0.1:8000/note/?h=other#target');
// index.html and directory URLs identify the same page. Deployment subpaths,
// Unicode, multiple highlight terms and the original fragment survive intact.
openQuery();
const index=send(window,'click',{target:result('/note/index.html?h=settled#target')});
assert.equal(index.prevented,undefined);
const nested='http://127.0.0.1:8000/project/笔记/?h=global+step#epoch';
openQuery(); send(window,'click',{target:result(nested)});
assert.equal(destinations.at(-1),new URL(nested).href);
// Modifier/middle clicks, explicit new tabs, downloads, prevented clicks and
// unrelated links retain native behavior without closing the original search.
for (const props of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]) {
  openQuery(); const count=destinations.length;
  const event=send(window,'click',{target:result(destination),...props});
  assert.equal(event.prevented,undefined); assert.equal(toggle.checked,true); assert.equal(destinations.length,count);
}
for (const target of [result(destination,{target:'_blank'}),result(destination,{download:true}),result('https://example.com/note/'),result('javascript:void(0)'),{closest:()=>null}]) {
  openQuery(); const count=destinations.length; send(window,'click',{target});
  assert.equal(toggle.checked,true); assert.equal(destinations.length,count);
}
// Keyboard activation generates a primary click too; capture still owns it.
openQuery(); const keyboard=send(window,'click',{detail:0,target:result(destination)});
assert.equal(keyboard.prevented,true); assert.equal(destinations.at(-1),destination);
console.log('Search interaction: early input, IME, coalescing, captured document navigation, same-note fragments and native new-tab semantics passed.');
