// Hermetic tests for actual native code. No live services, private data or keys.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NATIVE_MODE, DAY_MS, utcDay, wikiWindow, wikiObservation,
  windowGrowth, activityObservations, buildNativeTopics } from '../lib/trendSources/nativeCore.js';
import { nativeTransport, persistNativeSnapshot, runNativeTrends, nativeMaintenance,
  WIKI_SPECS } from '../lib/trendSources/nativeEngine.js';
const now = Date.parse('2026-09-20T12:00:00Z');
const config = { version: 'fixture', weights: { freshness: 1 },
  thresholds: { building: 65, rising: 75, exploding: 85 },
  labels: { watch: 'Worth watching', building: 'Getting noticed', rising: 'On the rise', exploding: 'Taking off' } };
const concepts = Object.fromEntries(WIKI_SPECS.map((s) => [s.concept, { aliases: [s.article.replace(/_/g,' ')], family: 'activity' }]));
const score = () => ({ score: 100, components: { fixture: true }, coverage: 1 });
const options = { nowMs: now, config, concepts, score, normalizeGrowth: (p) => Math.max(0, Math.min(1, p / 100)) };
function history(before = 100, after = 200) {
  const w = wikiWindow(now);
  return { items: Array.from({ length: 14 }, (_,i) => ({
    timestamp: new Date(w.start + i * DAY_MS).toISOString().slice(0,10).replace(/-/g,'') + '00',
    views: i < 7 ? before : after,
  })) };
}
const observation = wikiObservation(history(), WIKI_SPECS[0], now, 'https://wikimedia.org/example');
assert.equal(windowGrowth(0,1000,5), null);
assert.equal(windowGrowth(4,100,5), null);
assert.equal(windowGrowth(5,10,5), 100);
assert.equal(windowGrowth(10,5,5), -50);
assert.equal(windowGrowth(NaN,10,5), null);
assert.equal(windowGrowth(1.1,10,1), null);
assert.equal(observation.previous,700);
assert.equal(observation.current,1400);
assert.equal(observation.growthPct,100);
assert.equal(observation.geography,'enwiki-global');
assert.throws(() => wikiObservation({items:history().items.slice(1)},WIKI_SPECS[0],now,''),/incomplete-history/);
const duplicate = history(); duplicate.items[13] = duplicate.items[12];
assert.throws(() => wikiObservation(duplicate,WIKI_SPECS[0],now,''),/invalid-history/);
const bad = history(); bad.items[0].views=-1;
assert.throws(() => wikiObservation(bad,WIKI_SPECS[0],now,''),/invalid-history/);
assert.equal(wikiObservation(history(0,1000),WIKI_SPECS[0],now,'').growthPct,null);

const rising = buildNativeTopics([observation], options)[0];
assert.equal(rising.trend_score,74, 'one measured source cannot be On the rise or Taking off');
assert.equal(rising.eligible,false);
assert.equal(rising.country,null,'national/global source cannot claim Florida');
assert.equal(rising.concept_key,'pickleball');
assert.equal(buildNativeTopics([{...observation,previous:0}],options)[0].trend_score,64);
assert.equal(buildNativeTopics([{...observation,current:350}],options)[0].trend_score,64);
assert.equal(buildNativeTopics([{...observation,observedAt:'2026-09-10T00:00:00Z'}],options).length,0);
assert.equal(buildNativeTopics([{...observation,observedAt:'2026-10-10T00:00:00Z'}],options).length,0);
assert.equal(buildNativeTopics([{...observation,conceptKey:'not-in-registry'}],options).length,0);
assert.equal(buildNativeTopics([observation,{...observation,title:'Duplicate proxy'}],options)[0].component_scores._sourceCount,1);
assert.equal(buildNativeTopics([observation,{...observation,source:'google_trends',previous:null,current:null,minimum:null,demandIndex:.9}],options)[0].trend_score,74,'level-only RSS does not corroborate growth');
const two = buildNativeTopics([observation,{...observation,source:'google_trends'}],options)[0];
assert.equal(two.trend_score,100,'positive control: two genuinely measured increases clear evidence ceiling');
assert.equal(two.component_scores._growthSourceCount,2);
assert.throws(()=>buildNativeTopics([observation],{...options,config:{...config,thresholds:{...config.thresholds,rising:60}}}),/native-score-config/);
assert.throws(()=>buildNativeTopics([observation],{...options,score:()=>({score:101,coverage:1})}),/invalid-native-score/);
assert.equal(buildNativeTopics([],options).length,0);

const inventory = [{ place_id:'place_123',name:'Fixture Venue',metro:'orlando',lat:28.5,lng:-81.4,
  status:'OPERATIONAL',refreshed_at:new Date(now-DAY_MS).toISOString() }];
const users = Array.from({length:10},(_,i)=>({id:`account${i}`,email:`fixture${i}@example.test`,email_confirmed_at:'2026-01-01T00:00:00Z'}));
users.push({id:'owner',email:'gabrielpereira@me.com',email_confirmed_at:'2026-01-01T00:00:00Z'});
const event = (id,days,extra={})=>({user_id:id,place_id:'place_123',device_id:`device-${id}`,action:'detail_open',
  created_at:new Date(utcDay(now)-days*DAY_MS).toISOString(),meta:{environment:'production'},...extra});
const events = [...users.slice(0,5).map((u)=>event(u.id,10)),...users.slice(0,10).map((u)=>event(u.id,1)),
 ...Array.from({length:50},()=>event('account1',1)), event('owner',1), event(null,1), event('unknown',1),
 event('account3',1,{meta:{is_bot:true}}),event('account4',1,{meta:{hostname:'preview.vercel.app'}})];
let activity = activityObservations(events,inventory,users,now,['orlando']);
assert.equal(activity.length,1);
assert.equal(activity[0].previous,5);
assert.equal(activity[0].current,10,'duplicates, internal and anonymous records are not extra users');
assert.equal(activity[0].growthPct,100);
assert.equal(activity[0].conceptKey,null,'no venue-to-concept guess');
assert.equal(activityObservations(events,[{...inventory[0],lat:40}],users,now,['orlando']).length,0);
assert.equal(activityObservations(events,[{...inventory[0],needs_review:true}],users,now,['orlando']).length,0);
assert.equal(activityObservations(events,[{...inventory[0],status:'CLOSED_PERMANENTLY'}],users,now,['orlando']).length,0);
assert.equal(activityObservations(events,[{...inventory[0],refreshed_at:new Date(now-31*DAY_MS).toISOString()}],users,now,['orlando']).length,0);
assert.equal(activityObservations([event('account1',1,{meta:{is_test:'1'}})],inventory,users,now,['orlando']).length,0);
assert.equal(activityObservations([event('owner',1,{device_id:'shared'}),event('account1',1,{device_id:'shared'})],inventory,users,now,['orlando']).length,0);
assert.equal(activityObservations(events,inventory,users.map(u=>({...u,email_confirmed_at:null})),now,['orlando']).length,0);
assert(!JSON.stringify(buildNativeTopics(activity,options)).includes('fixture1@example.test'));
assert(!JSON.stringify(buildNativeTopics(activity,options)).includes('account1'));

const service={url:'https://fixture.supabase.co',key:'fixture-service-not-a-real-key'};
const requests=[];
const transport=nativeTransport(service,{fetchImpl:async(url,opts)=>{requests.push({url,opts});return new Response('[]');}});
await transport.db('/rest/v1/wf_trend_topics',{method:'POST',body:[],prefer:'return=minimal'});
await transport.publicRequest('https://wikimedia.org/api/rest_v1/test',{headers:{Authorization:'must-not-leak'}});
assert.equal(requests[0].opts.headers.Authorization,`Bearer ${service.key}`);
assert.equal(requests[0].opts.cache,'no-store');
assert.equal(requests[0].opts.redirect,'error');
assert.equal(requests[1].opts.headers.Authorization,undefined);
assert.equal(requests[1].opts.headers.apikey,undefined);
assert(!requests[0].url.includes(service.key));
await assert.rejects(transport.db('https://attacker.invalid'),/invalid-private-resource/);
await assert.rejects(transport.publicRequest('https://wikimedia.org.attacker.invalid'),/invalid-public-origin/);
await assert.rejects(transport.publicRequest('https://user:pass@wikimedia.org'),/invalid-public-origin/);
assert.throws(()=>nativeTransport({url:'https://invalid.test',key:'x'}),/invalid-service-origin/);
assert.throws(()=>nativeTransport({url:service.url}),/missing-service-configuration/);
await assert.rejects(nativeTransport(service,{deadline:0}).db('/rest/v1/events'),/run-deadline/);

function memoryDb({failTopics=false,truncate=false}={}) {
  const state={snapshots:[],topics:[],writes:[]};
  const db=async(resource,opts={})=>{
    const u=new URL(service.url+resource),q=u.searchParams,method=opts.method||'GET';
    if(method!=='GET')state.writes.push({resource,opts});
    if(u.pathname.endsWith('/wf_trend_snapshots')) {
      if(method==='POST') {
        if(state.snapshots.some(s=>s.source_hash===opts.body.source_hash))return [];
        const row={...opts.body,id:`snapshot_${state.snapshots.length+1}`};state.snapshots.push(row);return [row];
      }
      const matched=state.snapshots.filter(s=>['id','source_hash','status','imported_at'].every(k=>!q.has(k)||q.get(k)===`eq.${s[k]}`));
      if(method==='PATCH'){matched.forEach(s=>Object.assign(s,opts.body));return matched;}
      return matched;
    }
    if(u.pathname.endsWith('/wf_trend_topics')) {
      if(method==='POST'){if(failTopics)throw new Error('database:http-500');state.topics=[...state.topics.filter(t=>t.snapshot_id!==opts.body[0]?.snapshot_id),...opts.body];return null;}
      return truncate?[]:state.topics.filter(t=>!q.has('snapshot_id') || q.get('snapshot_id')===`eq.${t.snapshot_id}`);
    }
    throw new Error('unexpected-test-resource');
  };
  return {state,db};
}
const statuses={google:{ok:true},wikimedia:{ok:true},activity:{ok:true}};
const store=memoryDb();
const saved=await persistNativeSnapshot(store.db,[rising],statuses,now);
assert.equal(saved.status,'complete'); assert.equal(saved.topics,1);
assert.equal(store.state.snapshots[0].status,'complete');
const movedClock={...rising,component_scores:{changedFreshness:1}};
const again=await persistNativeSnapshot(store.db,[movedClock],statuses,now+60000);
assert.equal(again.reused,true,'clock-only factor change reuses same facts');
assert.equal(store.state.snapshots.length,1);
const failed=memoryDb({failTopics:true});
await assert.rejects(persistNativeSnapshot(failed.db,[rising],statuses,now),/database:http-500/);
assert.equal(failed.state.snapshots[0].status,'failed');
const truncated=memoryDb({truncate:true});
await assert.rejects(persistNativeSnapshot(truncated.db,[rising],statuses,now),/topic-write-incomplete/);
assert.equal(truncated.state.snapshots[0].status,'failed');
const partial=memoryDb();
assert.equal((await persistNativeSnapshot(partial.db,[rising],{...statuses,google:{ok:false}},now)).status,'partial');
await assert.rejects(persistNativeSnapshot(store.db,[{...rising,eligible:true}],statuses,now),/invalid-private-snapshot/);
store.state.topics=[];
await assert.rejects(persistNativeSnapshot(store.db,[rising],statuses,now),/snapshot-count-mismatch/);

// Full orchestration executes the real transport and writer, with test-owned
// dependencies. A separate integration file checks actual production bindings.
const integrationStore=memoryDb(); let wikiCalls=0;
const fakeFetch=async(url,opts={})=>{
  const u=new URL(url);
  if(u.hostname==='wikimedia.org'){wikiCalls++;return Response.json(history());}
  if(u.pathname==='/rest/v1/wf_trend_score_config')return Response.json([config]);
  if(u.pathname==='/auth/v1/admin/users')return Response.json({users:[]});
  if(u.pathname==='/rest/v1/events')return Response.json([]);
  const result=await integrationStore.db(u.pathname+u.search,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined});
  return Response.json(result);
};
const dependencies={concepts,metros:['orlando'],score,normalizeGrowth:options.normalizeGrowth,
  fetchGoogleTrendingRss:async()=>({ok:true,items:[]}),conceptSignalsFromItems:()=>[]};
const run=await runNativeTrends(service,{nowMs:now,sleepImpl:async()=>{},fetchImpl:fakeFetch,dependencies});
assert.equal(wikiCalls,6);assert.equal(run.snapshot.topics,6);assert.equal(run.privateResearch,true);assert.equal(run.paidProviderCalls,0);
assert.equal(run.degraded,false);assert(integrationStore.state.topics.every(t=>t.eligible===false));
let rateCalls=0;
const rateFetch=async(url,opts)=>{
 if(new URL(url).hostname==='wikimedia.org'){rateCalls++;return new Response('',{status:429});}
 return fakeFetch(url,opts);
};
const degraded=await runNativeTrends(service,{nowMs:now,sleepImpl:async()=>{},fetchImpl:rateFetch,dependencies});
assert.equal(rateCalls,1,'429 stops remaining Wikipedia requests, no retry');assert.equal(degraded.degraded,true);
let incompleteCalls=0;
await assert.rejects(runNativeTrends(service,{nowMs:now,dependencies,sleepImpl:async()=>{},fetchImpl:async()=>{incompleteCalls++;return Response.json([]);}}),/one-active-score-config-required/);
assert.equal(incompleteCalls,1,'config failure precedes all external calls');
const maintenance=await nativeMaintenance(service,{nowMs:now,fetchImpl:async()=>Response.json([])});
assert.equal(maintenance.idle,true);
const stale=await nativeMaintenance(service,{nowMs:now,fetchImpl:async()=>Response.json([{id:'old',observed_at:'2026-01-01T00:00:00Z'}])});
assert.equal(stale.ok,false);

// Execute the real route handler bodies against fail-closed auth controls.
for(const name of ['trend-signals','trend-maintenance']) {
 const text=readFileSync(new URL(`../app/api/cron/${name}/route.js`,import.meta.url),'utf8');
 const source=text.replace(/^import .*;\n/gm,'');
 const setup=`let calls=0;const recordPulse=async()=>{};const sbEnv=()=>({});const runNativeTrends=async()=>{calls++;throw new Error('fake');};const nativeMaintenance=async()=>{calls++;throw new Error('fake');};export function count(){return calls;}\n`;
 const route=await import('data:text/javascript;base64,'+Buffer.from(setup+source).toString('base64'));
 const savedSecret=process.env.CRON_SECRET;
 try {
  delete process.env.CRON_SECRET;
  assert.equal((await route.GET(new Request('https://fixture.test'))).status,401);
  process.env.CRON_SECRET='test-cron-not-real';
  assert.equal((await route.GET(new Request('https://fixture.test',{headers:{Authorization:'Bearer wrong'}}))).status,401);
  assert.equal(route.count(),0,'unauthorized requests perform zero work');
  assert.equal((await route.GET(new Request('https://fixture.test',{headers:{Authorization:'Bearer test-cron-not-real'}}))).status,503);
  assert.equal(route.count(),1,'positive control actually reaches collector');
 } finally {if(savedSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=savedSecret;}
}
console.log('native-trends: core, privacy, transport, persistence, orchestration, throttling and real route auth controls passed');
