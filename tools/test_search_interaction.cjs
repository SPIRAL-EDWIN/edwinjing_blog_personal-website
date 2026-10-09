'use strict';
// Exercise the real activation owner against an event/clock harness: an IME
// preedit must not query or navigate, and same-note results must close early.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('docs/javascripts/ui-perf.js', 'utf8');
const activation = source.slice(source.indexOf('  function setupSearchActivation()'), source.indexOf('  function normalizePaletteButtons()'));
let queue = new Map(), next = 0, emitted = [], resultLayouts = 0;
const handlers = new Map();
function listen(target, type, fn) {
  let map = handlers.get(target); if (!map) handlers.set(target, map = new Map());
  let list = map.get(type); if (!list) map.set(type, list = []); list.push(fn);
}
function send(target, type, props = {}) {
  const event = {type, key:'', button:0, isTrusted:true, preventDefault(){this.prevented=true;}, stopPropagation(){}, stopImmediatePropagation(){this.stopped=true;}, ...props};
  for (const fn of handlers.get(target)?.get(type) || []) fn(event);
  return event;
}
function flush() { const jobs = [...queue.values()]; queue.clear(); jobs.forEach(fn => fn()); }
const input = {value:'', isConnected:true, setAttribute(){}, focus(){}, blur(){}, dispatchEvent(e){emitted.push(this.value); send(this,e.type,{...e,isTrusted:false});}};
const output = {hidden:true};
const form = {dataset:{}};
const toggle = {checked:false, dispatchEvent(e){send(this,e.type,e);}};
const search = {dataset:{},isConnected:true,classList:{toggle(){}},querySelector(s){return s.includes('input') ? input : s.includes('form') ? form : output;}};
const runtime = {search,header:{},listen,timer(fn){queue.set(++next,fn);return next;},updateResults(){resultLayouts++;},allowOpen(){},cancelFocus(){},deferActivation(fn){fn();},focusInput(fn){if(fn)fn();}};
const window = {location:{href:'http://127.0.0.1:8000/note/#target'},history:{replaceState(){}},performance:{now:()=>0},setTimeout(fn){queue.set(++next,fn);return next;},clearTimeout(id){queue.delete(id);},requestAnimationFrame(fn){queue.set(++next,fn);return next;},cancelAnimationFrame(id){queue.delete(id);}};
const document = {querySelector(s){return s==='.md-search' ? search : s.includes('data-md-toggle') ? toggle : null;}};
vm.runInNewContext(activation+';setupSearchActivation();', {window,document,URL,URLSearchParams,headerSearchRuntime:runtime,clearSavedSearchQuery(){},beginHeaderSearchTransition(){},KeyboardEvent:function(type,p){Object.assign(this,{type},p);},Event:function(type,p){Object.assign(this,{type},p);}});
// Multiple keyup/input events coalesce. Preedit does not touch result layout.
send(input,'compositionstart'); input.value='s'; send(input,'input',{isComposing:true});
assert.equal(send(input,'keyup',{isComposing:true}).stopped,true);
assert.equal(send(input,'keydown',{key:'Enter',keyCode:229,isComposing:true}).stopped,true);
flush(); assert.deepEqual(emitted,[]); assert.equal(resultLayouts,0);
send(input,'compositionend'); send(input,'input'); send(input,'keyup'); flush();
assert.deepEqual(emitted,['s']);
input.value='second'; send(input,'input'); input.value='settled'; send(input,'input'); flush();
assert.deepEqual(emitted,['s','settled']);
// Window capture precedes block-links' document capture; it does not cancel
// the actual link's navigation or strip its destination h/hash.
const click=send(window,'click',{target:{closest:s=>s==='.md-search-result__link'?{}:null}});
assert.equal(toggle.checked,false); assert.equal(input.value,''); assert.equal(output.hidden,true);
assert.equal(click.prevented,undefined); flush(); assert.equal(emitted.at(-1),'');
console.log('Search interaction: IME preedit/commit, coalesced input, and early same-note closing passed.');
