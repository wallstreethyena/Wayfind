// Real React DOM mount/effects with deterministic fetches. Layout and browser
// rendering are separate acceptance checks; this guard proves cancellation.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadComponent } from './lib/jsxLoad.mjs';
process.env.NODE_ENV = 'test';
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
class TestNode {
  constructor(nodeType,nodeName,doc=null){this.nodeType=nodeType;this.nodeName=nodeName;this.ownerDocument=doc;this.parentNode=null;this.childNodes=[];this.namespaceURI='http://www.w3.org/1999/xhtml';this.style={};this.attributes=new Map();}
  get firstChild(){return this.childNodes[0]||null;}
  get lastChild(){return this.childNodes[this.childNodes.length-1]||null;}
  get nextSibling(){const p=this.parentNode;return p?p.childNodes[p.childNodes.indexOf(this)+1]||null:null;}
  appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.push(n);n.parentNode=this;return n;}
  insertBefore(n,b){if(!b)return this.appendChild(n);if(n.parentNode)n.parentNode.removeChild(n);const i=this.childNodes.indexOf(b);assert.ok(i>=0);this.childNodes.splice(i,0,n);n.parentNode=this;return n;}
  removeChild(n){const i=this.childNodes.indexOf(n);assert.ok(i>=0);this.childNodes.splice(i,1);n.parentNode=null;return n;}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  removeAttribute(k){this.attributes.delete(k);}
  getAttribute(k){return this.attributes.get(k)??null;}
  addEventListener(){}
  removeEventListener(){}
  *walk(){for(const c of this.childNodes){if(c.nodeType===1){yield c;yield* c.walk();}}}
}
class TestElement extends TestNode {
  constructor(name,doc){super(1,name.toUpperCase(),doc);this.tagName=name.toUpperCase();this.localName=name.toLowerCase();}
  set textContent(v){this.childNodes=[];this._text=String(v??'');}
  get textContent(){return this._text||this.childNodes.map(n=>n.textContent).join('');}
}
class TestText extends TestNode {
  constructor(v,doc){super(3,'#text',doc);this.nodeValue=String(v);}
  get textContent(){return this.nodeValue;}
  set textContent(v){this.nodeValue=String(v);}
}
class TestDocument extends TestNode {
  constructor(){super(9,'#document');this.ownerDocument=this;this.documentElement=new TestElement('html',this);this.body=new TestElement('body',this);this.documentElement.appendChild(this.body);this.appendChild(this.documentElement);}
  createElement(n){return new TestElement(n,this);}
  createElementNS(_,n){return this.createElement(n);}
  createTextNode(v){return new TestText(v,this);}
}
const document=new TestDocument();
class TestIFrame extends TestElement {}
const window={document,HTMLElement:TestElement,HTMLIFrameElement:TestIFrame,addEventListener(){},removeEventListener(){}};
document.defaultView=window;
Object.assign(globalThis,{document,window,Node:TestNode,Element:TestElement,HTMLElement:TestElement,IS_REACT_ACT_ENVIRONMENT:true});
const {act,createElement}=await import('react');
const {createRoot}=await import('react-dom/client');
const repo=fileURLToPath(new URL('..',import.meta.url));
const Component=(await loadComponent(path.join(repo,'app/components/ScoreExplanation.js'),repo)).default;
const {attachOfficialScoreReceipt}=await import('../lib/lawfulOrder.js');
const realFetch=globalThis.fetch, realTimer=globalThis.setTimeout, realClear=globalThis.clearTimeout;
const requests=[], timers=new Map();
let nextTimer=10000;
globalThis.setTimeout=(fn,ms,...args)=>{
  if(ms!==8000)return realTimer(fn,ms,...args);
  const id=nextTimer++;timers.set(id,{fn,ms});return id;
};
globalThis.clearTimeout=id=>timers.has(id)?timers.delete(id):realClear(id);
globalThis.fetch=(url,{signal}={})=>new Promise((resolve,reject)=>{
  const request={url,signal,resolve,reject};requests.push(request);
  assert.ok(String(url).startsWith('/api/score-verdict?id='),'no unexpected provider fetch');
  signal.addEventListener('abort',()=>{request.aborted=true;if(!request.ignoreAbort)reject(new DOMException('aborted','AbortError'));});
});
const host=document.createElement('div');document.body.appendChild(host);
const root=createRoot(host);
const mount=place=>act(async()=>root.render(createElement(Component,{place})));
const answer=(index,body,ok=true)=>act(async()=>requests[index].resolve({ok,json:async()=>body}));
const text=()=>host.textContent;
const links=()=>[...host.walk()].filter(n=>n.localName==='a');
const ready=id=>({state:'ready',verdict:{placeId:id,coverage:'venue_information',reviewedAt:'2026-10-04T00:00:00Z',sentences:[{text:'A healthy fixture fit.',sourceIds:['s']},{text:'An honest fixture limitation.',sourceIds:['s']}],sources:[{id:'s',url:'https://example.com/verified',title:'Fixture source'}]}});
try {
  const place=attachOfficialScoreReceipt({id:'a',wfScore:96,distMi:18,creator_video:true,trending:true});
  await mount(place);
  equal(requests.length,1);
  equal(text().includes('Why this score?'),true);
  equal(text().includes('Curated creator video'),true);
  equal(text().includes('9.9 / 10'),true);
  equal(text().includes('Checking for a sourced verdict'),true);
  equal(timers.size,1);
  requests[0].ignoreAbort=true;
  await mount({id:'b',wfScore:90});
  equal(requests.length,2);
  equal(requests[0].signal.aborted,true);
  await answer(1,ready('b'));
  equal(text().includes('A healthy fixture fit.'),true);
  equal(text().includes('independent review consensus has not been assessed'),true);
  equal(links().length,2);
  equal(links()[0].getAttribute('href'),'https://example.com/verified');
  equal(timers.size,0);
  const old=ready('a');old.verdict.sentences[0].text='STALE PLACE A';
  await answer(0,old);
  equal(text().includes('STALE PLACE A'),false); // negative race control
  equal(text().includes('A healthy fixture fit.'),true);
  await mount({id:'c'});await answer(2,ready('other-canonical-id'));
  equal(text().includes('healthy fixture fit'),false);
  equal(text().includes('temporarily unavailable'),true);
  equal(links().length,0);
  for(const [id,state,label] of [['d','needs_review','fresh source check'],['e','not_researched','not been prepared'],['f','unavailable','temporarily unavailable']]){
    const index=requests.length;await mount({id});await answer(index,{state});
    if(state==='not_researched'){equal(text().includes('not been prepared'),false);equal(text().includes("Wayfind's take"),false);}
    else equal(text().includes(label),true);
    equal(links().length,0);
  }
  for(const badVerdict of [{placeId:'malformed'}, {...ready('malformed').verdict,sentences:null}, {...ready('malformed').verdict,sources:[{id:'s',title:'Unsafe',url:'javascript:alert(1)'}]}]){
    const index=requests.length;await mount({id:'malformed'});await answer(index,{state:'ready',verdict:badVerdict});
    equal(text().includes('temporarily unavailable'),true);equal(links().length,0);
    await mount(null);
  }
  const failure=requests.length;await mount({id:'failure'});await answer(failure,{state:'ready'},false);
  equal(text().includes('temporarily unavailable'),true);
  equal(links().length,0);
  const timeout=requests.length;await mount({id:'timeout'});
  equal(timers.size,1);
  const timer=[...timers.values()][0];equal(timer.ms,8000);
  await act(async()=>timer.fn());
  equal(requests[timeout].signal.aborted,true);
  equal(text().includes('temporarily unavailable'),true);
  equal(timers.size,0);
  const unmount=requests.length;await mount({id:'unmount'});
  equal(timers.size,1);
  await act(async()=>root.unmount());
  equal(requests[unmount].signal.aborted,true);
  equal(timers.size,0);
  equal(host.textContent,'');
  console.log(`test-score-explanation-runtime: ${checks} assertions passed; actual React DOM/effects, healthy citations, canonical identity refusal, stale-response negative control, exact 8000ms deadline, unmount cleanup; synthetic network only`);
} finally {
  globalThis.fetch=realFetch;globalThis.setTimeout=realTimer;globalThis.clearTimeout=realClear;
}
