'use strict';
// Exercise the real activation owner against an event/clock harness: an IME
// preedit must not query or navigate, and same-note results must close early.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('docs/javascripts/ui-perf.js', 'utf8');
const memorySource = source.slice(source.indexOf('  function createSearchQueryMemory()'), source.indexOf('  function setupSearchResultSummary()'));
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
const memory = {query:'',read(){return this.query;},save(query){this.query=query;},onReset(fn){this.reset=fn;}};
vm.runInNewContext(activation+';setupSearchActivation();', {window,document,URL,URLSearchParams,headerSearchRuntime:runtime,searchQueryMemory:memory,beginHeaderSearchTransition(){},KeyboardEvent:function(type,p){Object.assign(this,{type},p);},Event:function(type,p){Object.assign(this,{type},p);}});
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
assert.equal(memory.query,'settled');
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
// Test real shared storage across new documents/tabs, reload, blocked storage,
// and the live activation lifecycle, rather than a mirrored implementation.
const memoryKey = 'edwinos.search-memory.v2';
let stored = new Map(), tabs = [];
function memoryHarness({type='navigate',href='http://127.0.0.1:8000/note/',blocked=false,early=''} = {}) {
  let tasks = new Map(), serial = 0, handlers = new Map(), emissions = [], output = {hidden:true};
  const input = {value:early,isConnected:true,setAttribute(){},focus(){},blur(){},dispatchEvent(e){emissions.push(this.value);send(this,e.type,{...e,isTrusted:false});}};
  const form = {dataset:{}};
  const toggle = {checked:false,dispatchEvent(e){send(this,e.type,e);}};
  const search = {dataset:{},isConnected:true,classList:{toggle(){}},querySelector(s){return s.includes('input') ? input : s.includes('form') ? form : output;}};
  function listen(target,type,fn){if(!handlers.has(target))handlers.set(target,new Map());let map=handlers.get(target);if(!map.has(type))map.set(type,[]);map.get(type).push(fn);}
  function send(target,type,props={}){let e={type,isTrusted:true,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...props};for(const fn of handlers.get(target)?.get(type)||[])fn(e);}
  const window = {location:{href,search:new URL(href).search,origin:new URL(href).origin,assign(){}},history:{replaceState(){}},performance:{now:()=>0,getEntriesByType:()=>[{type}]},addEventListener(type,fn){listen(this,type,fn);},setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);},requestAnimationFrame(fn){tasks.set(++serial,fn);return serial;},cancelAnimationFrame(id){tasks.delete(id);}};
  window.localStorage = {getItem(key){if(blocked)throw Error('blocked');return stored.get(key)||null;},setItem(key,value){if(blocked)throw Error('blocked');let oldValue=stored.get(key)||null;stored.set(key,value);if(oldValue!==value)for(const tab of tabs)tab.send(tab.window,'storage',{key,newValue:value});}};
  const runtime = {search,header:{},listen,timer:window.setTimeout,updateResults(){},allowOpen(){},cancelFocus(){},deferActivation(fn){fn();},focusInput(fn){if(fn)fn();}};
  const document = {querySelector(s){return s==='.md-search' ? search : s.includes('data-md-toggle') ? toggle : null;}};
  const context = {window,document,URL,URLSearchParams,Date,Math,SEARCH_QUERY_STORAGE_KEY:memoryKey,headerSearchRuntime:runtime,beginHeaderSearchTransition(){},KeyboardEvent:function(type,p){Object.assign(this,{type},p);},Event:function(type,p){Object.assign(this,{type},p);}};
  vm.runInNewContext(memorySource+';var searchQueryMemory=createSearchQueryMemory();'+activation+';setupSearchActivation();',context);
  const tab={window,input,toggle,output,emissions,send,memory:context.searchQueryMemory,
    flush(){let jobs=[...tasks.values()];tasks.clear();jobs.forEach(fn=>fn());},
    open(){toggle.checked=true;send(toggle,'change');this.flush();},
    close(){toggle.checked=false;send(toggle,'change');this.flush();},
    type(value){input.value=value;send(input,'input');this.flush();}
  };
  tabs.push(tab);return tab;
}
const a=memoryHarness();a.open();a.type('edwin');a.close();
assert.equal(a.input.value,'');assert.equal(a.output.hidden,true);assert.equal(a.memory.read(),'edwin');
a.open();assert.equal(a.input.value,'edwin');
// New native documents, fresh tabs, and history entries restore only on opening.
for(const type of ['navigate','back_forward']) {
  const b=memoryHarness({type});assert.equal(b.input.value,'');assert.equal(b.toggle.checked,false);
  b.open();assert.equal(b.input.value,'edwin');b.close();
}
const live=memoryHarness();live.open();assert.equal(live.input.value,'edwin');
const reload=memoryHarness({type:'reload'});
assert.equal(reload.memory.read(),'');assert.equal(a.input.value,'');assert.equal(live.input.value,'');
assert.equal(a.toggle.checked,true);assert.equal(a.output.hidden,true);
reload.open();assert.equal(reload.input.value,'');
// New entry is shared again. Explicit deletion is a deliberate empty memory.
a.type('再次查找');const c=memoryHarness();c.open();assert.equal(c.input.value,'再次查找');
c.type('');a.close();a.open();assert.equal(a.input.value,'');
// Do not interrupt composition while another tab reloads. Its reset wins when
// the composition commits, preventing old preedit from reviving shared state.
a.type('previous');a.send(a.input,'compositionstart');a.input.value='中文预编辑';a.send(a.input,'input',{isComposing:true});
const imereload=memoryHarness({type:'reload'});assert.equal(a.input.value,'中文预编辑');
a.send(a.input,'compositionend');a.flush();assert.equal(a.input.value,'');assert.equal(a.memory.read(),'');
// Explicit q links open as before and become the memory, while h alone never
// creates/restores input state. Reinitializing is idempotent and not a reload.
const deep=memoryHarness({href:'http://127.0.0.1:8000/note/?q=shared+link&h=destination#section'});deep.flush();
assert.equal(deep.input.value,'shared link');assert.equal(deep.toggle.checked,true);deep.close();
const highlight=memoryHarness({href:'http://127.0.0.1:8000/note/?h=destination#section'});assert.equal(highlight.input.value,'');highlight.open();assert.equal(highlight.input.value,'shared link');
const fallback=memoryHarness({blocked:true});fallback.open();fallback.type('local fallback');fallback.close();fallback.open();assert.equal(fallback.input.value,'local fallback');
console.log('Search shared memory: reopening, native/history/new-tab persistence, global refresh reset, deletion, IME reset, q/h links and storage fallback passed.');
console.log('Search interaction: early input, IME, coalescing, captured document navigation, same-note fragments and native new-tab semantics passed.');

// Run the actual visible-row fitter on a tiny DOM/canvas harness. Segments
// retain the first hit, later context fits without including a distant gap,
// and resizing starts from the original worker excerpts rather than the crop.
const fitterSource = source.slice(source.indexOf('  function fitSearchSnippets('), source.indexOf('  function setupHeaderSearchTransition('));
class TextNode {
  constructor(text){this.nodeType=3;this.textContent=text;}
}
class Element {
  constructor(tag){this.nodeType=1;this.tagName=tag.toUpperCase();this.dataset={};this.childNodes=[];}
  appendChild(node){this.childNodes.push(node);return node;}
  get textContent(){return this.childNodes.map(node=>node.textContent).join('');}
  set textContent(text){this.childNodes=[new TextNode(text)];}
  replaceChildren(...nodes){this.childNodes=nodes;}
  querySelectorAll(){return this.childNodes.filter(node=>node.nodeType===1 && node.dataset.edwinosSearchSegment!==undefined);}
  closest(){return null;}
}
function excerpt(before,after,index=0){const span=new Element('span');span.dataset.edwinosSearchSegment=String(index);span.dataset.startTruncated='true';span.dataset.endTruncated='true';span.appendChild(new TextNode(before));const mark=span.appendChild(new Element('mark'));mark.textContent='EDWIN';span.appendChild(new TextNode(after));return span;}
const paragraph=new Element('p');let fitWidth=220;paragraph.getBoundingClientRect=()=>({width:fitWidth,height:40,top:10,bottom:50});
paragraph.appendChild(excerpt('The first occurrence belongs to ', ' and its nearby introductory context.'));
paragraph.appendChild(new TextNode(' ... '));paragraph.appendChild(excerpt('A much later URL uses ', ' inside another useful sentence.',1));
const fitSearch={dataset:{},querySelector(){return {getBoundingClientRect:()=>({top:0,bottom:600})};},querySelectorAll(){return [paragraph];}};
const measure={font:'',measureText(text){return {width:Array.from(text).length*7};}};
const fitContext={window:{performance:{now:()=>0},getComputedStyle:()=>({font:'14px sans-serif',lineHeight:'20px'})},document:{createTextNode:text=>new TextNode(text),createElement:tag=>new Element(tag),dispatchEvent(){}},Intl,CustomEvent:function(){},searchMeasureContext:measure,searchSnippetSources:new WeakMap(),decorateSearchResults(){}};
vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
assert.equal((paragraph.textContent.match(/EDWIN/g)||[]).length,2);
assert.match(paragraph.textContent,/\.\.\./);assert.ok(paragraph.textContent.includes('belongs'));assert.ok(paragraph.textContent.includes('URL'));
fitWidth=90;vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
assert.equal((paragraph.textContent.match(/EDWIN/g)||[]).length,1);
fitWidth=500;vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
assert.equal((paragraph.textContent.match(/EDWIN/g)||[]).length,2);assert.match(paragraph.textContent,/introductory/);
// Complete mathematical source is never cut at the visual-width boundary.
const formula=new Element('p');formula.getBoundingClientRect=()=>({width:130,height:40,top:10,bottom:50});
formula.appendChild(excerpt('prefix $\\mathrm{', '}+\\frac{a}{b}$ suffix'));
fitSearch.querySelectorAll=()=>[formula];fitContext.window.EdwinOSSearchMath={clear(){},getRanges(text){const start=text.indexOf('$');return [{start,end:text.lastIndexOf('$')+1}];}};
vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
assert.match(formula.textContent,/\$\\mathrm\{EDWIN\}\+\\frac\{a\}\{b\}\$/);
const codedParagraph=new Element('p');codedParagraph.getBoundingClientRect=()=>({width:fitWidth,height:40,top:10,bottom:50});
const codedExcerpt=codedParagraph.appendChild(new Element('span'));codedExcerpt.dataset.edwinosSearchSegment='0';
codedExcerpt.appendChild(new TextNode('Run ID and '));const literal=codedExcerpt.appendChild(new Element('code'));
literal.appendChild(new TextNode('"$'));const literalMark=literal.appendChild(new Element('mark'));literalMark.textContent='EDWIN';
literal.appendChild(new TextNode('_ROOT" ' + 'context '.repeat(12)));codedExcerpt.appendChild(new TextNode(' plus \\(x_2\\).'));
codedParagraph.querySelector=()=>literal;
const widths=[];fitContext.window.getComputedStyle=node=>({font:node.tagName==='CODE'?'12px monospace':'14px sans-serif',lineHeight:'20px'});
measure.measureText=function(text){widths.push(this.font);return {width:Array.from(text).length*(this.font.includes('monospace')?9:7)};};
fitSearch.querySelectorAll=()=>[codedParagraph];
fitContext.window.EdwinOSSearchMath={clear(){},getRanges(text,codes){assert.equal(codes.length,1);assert(text.slice(codes[0].start,codes[0].end).startsWith('"$EDWIN_ROOT'));return [];}};
fitWidth=180;vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
const firstCode=codedParagraph.childNodes[0].childNodes.find(node=>node.tagName==='CODE');
assert.match(firstCode.textContent,/"\$EDWIN_ROOT"/);assert.equal(firstCode.childNodes.find(node=>node.tagName==='MARK').textContent,'EDWIN');
assert(widths.includes('12px monospace'),'fitting measures code with its actual font');
const narrowCode=firstCode.textContent;
fitWidth=800;vm.runInNewContext(fitterSource+';fitSearchSnippets(search);',{...fitContext,search:fitSearch});
const wideCode=codedParagraph.childNodes[0].childNodes.find(node=>node.tagName==='CODE');
assert(wideCode.textContent.length>narrowCode.length,'resize restores longer source code instead of parsing the cropped node');
assert.match(codedParagraph.textContent,/plus \\\(x_2\\\)\./);
console.log('Search snippets: mandatory first hit, separated later context, narrow/wide refitting and atomic TeX passed.');
