#!/usr/bin/env node
// Behavioural controls for cold inventory failures and cancelled poster loads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
function moduleWith(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  } }).outputText;
  const req = (id) => imports[id] || new Proxy({}, { get: (_, k) => k === '__esModule' ? true : (() => null) });
  new Function('require', 'exports', ...Object.keys(globals), code)(req, exports, ...Object.values(globals));
  return exports;
}
const realFetch = globalThis.fetch;
const { fetchJsonWithDeadline } = await import('../lib/clientJson.js');
try {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', {status:503}) : Response.json({rails:[{id:'live'}]}); };
  const recovered = await fetchJsonWithDeadline('/fixture', { retries:1 });
  ok(calls === 2 && recovered.rails[0].id === 'live', 'one transient 503 recovers to real cards');
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', {status:503}); };
  await assert.rejects(fetchJsonWithDeadline('/fixture', {retries:1}), /503/);
  ok(calls === 2, 'persistent outage stops after two attempts');
  calls = 0;
  await assert.rejects(fetchJsonWithDeadline('/fixture', {retries:1,method:'POST'}), /503/);
  ok(calls === 1, 'mutations are never retried');
  calls = 0;
  await assert.rejects(fetchJsonWithDeadline('/fixture'), /503/);
  ok(calls === 1, 'provider reads retain their existing one-attempt default');
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', {status:401}); };
  await assert.rejects(fetchJsonWithDeadline('/fixture', {retries:1}), /401/);
  ok(calls === 1, 'auth failures are never retried');
  calls = 0;
  globalThis.fetch = async (_url, {signal}) => {
    calls++;
    if (calls === 1) return new Response('', {status:503});
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}));
  };
  const start = Date.now();
  await assert.rejects(fetchJsonWithDeadline('/fixture', {retries:1,timeoutMs:220}), /deadline/);
  ok(calls === 2 && Date.now() - start < 450, 'a hanging retry shares the original deadline');
} finally { globalThis.fetch = realFetch; }

const cache = { get: async () => null, set: async () => {} };
let clock = 1000;
const { fastCachedRail } = moduleWith('lib/railFastCache.js', {'@vercel/functions': {getCache:()=>cache, waitUntil:()=>{}}}, {Date:{now:()=>clock}});
let loads = 0, release;
const loader = () => { loads++; return new Promise(resolve => {release = resolve;}); };
const requests = Array.from({length:10}, () => fastCachedRail('same-cell', loader));
await new Promise(resolve => setTimeout(resolve, 0));
ok(loads === 1, 'ten simultaneous cold readers share one database build');
release({rails:['real']});
const answers = await Promise.all(requests);
ok(answers.length === 10 && answers.every(x => x.value.rails[0] === 'real'), 'every waiting reader receives the successful answer');
await assert.rejects(fastCachedRail('retry-cell', async () => {throw new Error('db down');}), /db down/);
ok((await fastCachedRail('retry-cell', async () => 'restored')).value === 'restored', 'a failed shared build cannot poison the next request');
const separate = await Promise.all(['city-a','city-b'].map(key => fastCachedRail(key, async () => key)));
ok(separate[0].value === 'city-a' && separate[1].value === 'city-b', 'different locations never share answers');

fastCachedRail('hung-cell', () => new Promise(() => {}));
await new Promise(resolve => setTimeout(resolve, 0));
clock += 21000;
ok((await fastCachedRail('hung-cell', async () => 'recovered')).value === 'recovered', 'a loader that never settles cannot poison later requests permanently');

// Reproduce a slow cache read with a healthy exact-cell answer while the
// inventory build is still pending. This used to discard the answer at 500ms.
let lateRead, lateBuild;
const writes = [];
cache.get = () => new Promise(resolve => { lateRead = resolve; });
cache.set = async (key, value) => { writes.push({key, value}); };
const delayed = fastCachedRail('miami:25.76:-80.19:evening',
  () => new Promise(resolve => { lateBuild = resolve; }),
  {usable: v => !!v && v.failed !== true});
await new Promise(resolve => setTimeout(resolve, 550));
ok(typeof lateBuild === 'function', 'cold compute begins after quick cache budget');
lateRead({savedAt:clock, value:{rails:['Miami'],failed:false}});
const lateAnswer = await delayed;
ok(lateAnswer.state === 'late-hit' && lateAnswer.value.rails[0] === 'Miami',
  'slow exact-cell last-good answer wins before stalled compute');
lateBuild({failed:true});
await new Promise(resolve => setTimeout(resolve, 0));
ok(writes.length === 0, 'failed refresh never overwrites recovered good output');
for (const [label, entry] of [
  ['expired', {savedAt:clock - 8*86400000,value:{rails:['old']}}],
  ['future', {savedAt:clock + 1,value:{rails:['future']}}],
  ['invalid', {savedAt:'broken',value:{rails:['invalid']}}],
]) {
  cache.get = async () => entry;
  const result = await fastCachedRail(label, async () => ({rails:['new']}));
  ok(result.state === 'miss' && result.value.rails[0] === 'new', `${label} cache entry cannot be served`);
}
cache.get = async () => null;

// Execute the REAL component with a deterministic hook scheduler. Child cards
// are left as elements: the invariant under test is which payload they receive.
function componentHarness(name) {
  let cursor=0, effects=[], values=[], deps=[], cleanups=[], pending=[];
  const same = (a,b) => a && b && a.length === b.length && a.every((x,i)=>Object.is(x,b[i]));
  const react = {
    createElement:(type,props,...children)=>({type,props:{...props,children}}), Fragment:'fragment',
    useState:initial=>{const i=cursor++; if (!(i in values)) values[i]=initial; return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
    useRef:initial=>{const i=cursor++; return values[i] || (values[i]={current:initial});},
    useMemo:(fn,d)=>{const i=cursor++; if(!same(deps[i],d)){values[i]=fn();deps[i]=d;}return values[i];},
    useEffect:(fn,d)=>{const i=cursor++;if(!same(deps[i],d)){deps[i]=d;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}},
  };
  const imports = {
    react,
    '../../lib/clientJson.js':{fetchJsonWithDeadline:(_url,opts)=>new Promise((resolve,reject)=>pending.push({resolve,reject,opts}))},
    '../../lib/railFailure.js':{
      fetchRailJson:(_url,opts)=>new Promise((resolve,reject)=>pending.push({resolve,reject,opts})),
      railDeveloperFailure:(reason,meta={})=>Object.assign(new Error(reason),{kind:'developer',reason,requestId:'fixture-dev',route:meta.route||'/fixture',retryAttempts:0}),
      isRailCancelled:error=>error?.kind==='cancelled', emitRailDegraded:()=>true,
    },
    './kit':{directionsUrl:()=>null,RailDevError:'RailDevError',RailMascotBusy:'RailMascotBusy'},
    './kit.js':{directionsUrl:()=>null,RailDevError:'RailDevError',RailMascotBusy:'RailMascotBusy'},
    '../../lib/nightOutIntent.js':{composeNightOutRails:()=>({rails:[]})},
    '../../lib/seasons.js':{fallSkinLive:()=>true},
    '../../lib/homeAffiliateActivities.js':{homeAffiliateActivities:items=>items || []},
    '../../lib/summerPicks.js':{composeSummerPickRails:(places,tours)=>[{cards:[...places,...tours]}]},
  };
  const C=moduleWith(`app/components/${name}.js`,imports,{React:react}).default;
  const render=props=>{cursor=0; const tree=C(props); const jobs=effects;effects=[];jobs.forEach(f=>f());return tree;};
  return {render,pending,replay:()=>{cleanups.forEach(f=>f?.());deps=[];}, flush:async()=>{await new Promise(r=>setTimeout(r,0));}};
}
const p={center:{lat:27.58,lng:-82.43},city:'Parrish'};
const n=componentHarness('NightOutRails');
n.render(p);
ok(n.pending.length === 1 && n.pending[0].opts.signal instanceof AbortSignal, 'Night Out uses cancellable bounded rail recovery');
n.render({...p,center:{lat:27.581,lng:-82.431}});
ok(n.pending.length === 1, 'same-cell coordinate jitter does not cancel and strand an in-flight request');
n.pending[0].resolve({rails:[{id:'cocktails',places:[{id:'parrish-card'}]}]}); await n.flush();
ok(JSON.stringify(n.render(p)).includes('parrish-card'), 'the original request paints cards after same-cell jitter');
const other={center:{lat:25.76,lng:-80.19},city:'Miami'};
ok(!JSON.stringify(n.render(other)).includes('parrish-card'), 'a new city hides old cards immediately, before effects settle');
n.pending[1].resolve({bad:'malformed'}); await n.flush();
ok(n.render(other).type === 'RailDevError', 'malformed Night Out success is a developer state, not a mascot or eternal loading');
const missing=componentHarness('NightOutRails');
ok(JSON.stringify(missing.render({})).includes('Choose a location') && missing.pending.length === 0, 'missing coordinates never become a request for zero-zero');
for (const name of ['NightOutRails','BirthdayRails','DateNightRails','TodayDiscoveryRails','FallIntentRails','SummerIntentRails']) {
  const h=componentHarness(name); h.render(p); const count=h.pending.length;
  ok(count > 0, `${name}: the first effect actually ran`);
  h.replay(); h.render(p);
  ok(h.pending.length === count*2, `${name}: cancelled effect can restart at the same location`);
}
const summerEmpty=componentHarness('SummerIntentRails');
summerEmpty.render(p); summerEmpty.pending[0].resolve({places:[]}); summerEmpty.pending[1].resolve({items:[]}); await summerEmpty.flush();
ok(JSON.stringify(summerEmpty.render(p)).includes('No nearby summer options'), 'healthy empty Summer responses do not claim the service is broken');
const summerDown=componentHarness('SummerIntentRails');
summerDown.render(p); summerDown.pending[0].reject(Object.assign(new Error('db down'),{kind:'degraded',reason:'network',requestId:'fixture-down',route:'/api/summer/places',retryAttempts:1})); summerDown.pending[1].resolve({items:[]}); await summerDown.flush();
ok(JSON.stringify(summerDown.render(p)).includes('RailMascotBusy'), 'an unavailable Summer source remains a recoverable service failure');
console.log(`test-poster-recovery: ${checks} behavioural assertions passed`);
