#!/usr/bin/env node
import assert from 'node:assert/strict';
import { observePosterPerformance } from '../lib/posterPerformance.js';
const saved = Object.fromEntries(['IntersectionObserver','MutationObserver','document','requestAnimationFrame','cancelAnimationFrame'].map(k => [k, globalThis[k]]));
let intersect, mutate, frame, observed = [], disconnects = 0;
globalThis.document = { visibilityState: 'visible' };
globalThis.IntersectionObserver = class {
  constructor(cb) { intersect = cb; }
  observe(card) { observed.push(card); }
  disconnect() { disconnects++; }
};
globalThis.MutationObserver = class { constructor(cb) { mutate = cb; } observe() {} disconnect() { disconnects++; } };
globalThis.requestAnimationFrame = cb => { frame = cb; return 1; };
globalThis.cancelAnimationFrame = () => { frame = null; };
let cards = [], hidden = false;
const root = { querySelectorAll(selector) { assert.equal(selector, '.wf-place-card, .wf8-gcard'); return cards; }, getAttribute() { return hidden ? 'true' : 'false'; } };
try {
  const events = [];
  const stop = observePosterPerformance(root, {startedAt: performance.now(), report: e => events.push(e)});
  assert.equal(observed.length, 0, 'skeleton does not count as a card');
  cards = [{id:'real-card'}]; mutate(); mutate();
  assert.equal(observed.length, 1, 'new cards observed once');
  intersect([{isIntersecting:false,intersectionRatio:0}]);
  if (frame) frame();
  assert.equal(events.length,0,'offscreen card not visible');
  intersect([{isIntersecting:true,intersectionRatio:0.5}]);
  assert.equal(events.length,0,'wait for animation frame');
  globalThis.document.visibilityState='hidden'; frame();
  assert.equal(events.length,0,'hidden tab does not count');
  globalThis.document.visibilityState='visible';
  intersect([{isIntersecting:true,intersectionRatio:0.5}]); frame();
  assert.equal(events.length,1); assert.equal(events[0].outcome,'first_card_visible');
  assert.ok(events[0].elapsed_ms >= 0); assert.equal(disconnects,2);
  stop(); assert.equal(events.length,1,'success cleanup does not emit abandonment');
  cards=[];
  const abandoned=[];
  const cancel=observePosterPerformance(root,{report:e=>abandoned.push(e)});
  cancel(); cancel();
  assert.equal(abandoned.length,1); assert.equal(abandoned[0].outcome,'abandoned');
  const timeout=[];
  observePosterPerformance(root,{timeoutMs:5,report:e=>timeout.push(e)});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(timeout[0].outcome,'no_card_observed','empty/failure cannot become fast success');
  const absent=globalThis.IntersectionObserver; delete globalThis.IntersectionObserver;
  observePosterPerformance(root,{report:()=>{throw new Error('must not report')}})();
  globalThis.IntersectionObserver=absent;
  console.log('poster-performance: PASS visible, pending, offscreen, hidden, cancelled, timed out, unsupported controls');
} finally { for (const [k,v] of Object.entries(saved)) { if(v===undefined) delete globalThis[k]; else globalThis[k]=v; } }

// Execute the actual lazy homepage request boundary with an import seam. The
// source module cannot be imported in plain Node because it contains JSX.
const {readFileSync} = await import('node:fs');
const {settleLoad} = await import('../lib/loadState.js');
const home = readFileSync(new URL('../app/components/DaypartRail.js', import.meta.url),'utf8');
const begin = home.indexOf('const fetchJsonWithDeadline = ');
const end = home.indexOf('\n};',begin)+3;
assert.ok(begin>=0 && end>begin);
const boundary = home.slice(begin,end);
assert.ok(boundary.includes('await import("../../lib/posterJson.js")'));
function loadBoundary(loadModule) {
  return new Function('settleLoad','RAILS_LOAD_TIMEOUT_MS','loadModule',
    boundary.replace('await import("../../lib/posterJson.js")','await loadModule()')+'; return fetchJsonWithDeadline;')(settleLoad,10,loadModule);
}
const happy=loadBoundary(async()=>({fetchPosterJson:async()=>({places:['real']})}));
assert.deepEqual(await happy('/api/lunch-break'),{places:['real']});
let release, calls=0;
const slow=loadBoundary(()=>new Promise(resolve=>{release=resolve;}));
await assert.rejects(slow('/api/lunch-break',{timeoutMs:5}));
release({fetchPosterJson:async()=>{calls++;return {};}});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(calls,0,'a late module cannot start unused inventory work after its caller timed out');
console.log('poster-performance: PASS lazy import is deadline-bound and does not start late inventory work');
