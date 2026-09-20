// Hermetic execution of the native engine, persistence, privacy and auth edges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_MS, utcDay, wikiWindow, wikiObservation, windowGrowth, activityObservations, buildNativeTopics } from '../lib/trendSources/nativeCore.js';
import { WIKI_SPECS, nativeTransport, persistNativeSnapshot, runNativeTrends, nativeMaintenance, safeError } from '../lib/trendSources/nativeEngine.js';
const now = Date.parse('2026-09-20T12:00:00Z');
const config = {version:'fixture',weights:{freshness:1},thresholds:{building:65,rising:75,exploding:85},labels:{watch:'Worth watching',building:'Getting noticed',rising:'On the rise',exploding:'Taking off'}};
const concepts = Object.fromEntries(WIKI_SPECS.map(s=>[s.concept,{aliases:[s.article],family:'activity'}]));
// An adversarial 100-point scorer proves the independent evidence ceiling.
const score = ()=>({score:100,coverage:1,components:{fixture:true}});
const options = {nowMs:now,config,concepts,score,normalizeGrowth:p=>Math.max(0,Math.min(1,p/100))};
function history(before=100,after=200) {
  const w = wikiWindow(now);
  return {items:Array.from({length:14},(_,i)=>({timestamp:new Date(w.start+i*DAY_MS).toISOString().slice(0,10).replace(/-/g,'')+'00',views:i<7?before:after}))};
}
assert.equal(windowGrowth(5,10,5),100);
assert.equal(windowGrowth(10,5,5),-50);
for(const x of [0,4,NaN,1.2,null,-1]) assert.equal(windowGrowth(x,100,5),null);
const obs = wikiObservation(history(),WIKI_SPECS[0],now,'https://wikimedia.org/fixture');
assert.equal(obs.previous,700);assert.equal(obs.current,1400);assert.equal(obs.geography,'enwiki-global');
assert.throws(()=>wikiObservation({items:history().items.slice(1)},WIKI_SPECS[0],now,''),/incomplete-history/);
const duplicate=history();duplicate.items[13]=duplicate.items[12];
assert.throws(()=>wikiObservation(duplicate,WIKI_SPECS[0],now,''),/invalid-history/);
const negative=history();negative.items[0].views=-1;
assert.throws(()=>wikiObservation(negative,WIKI_SPECS[0],now,''),/invalid-history/);
const one=buildNativeTopics([obs],options)[0];
assert.equal(one.trend_score,74);assert.equal(one.eligible,false);assert.equal(one.country,null);
assert.equal(buildNativeTopics([{...obs,previous:0}],options)[0].trend_score,64);
assert.equal(buildNativeTopics([{...obs,current:350}],options)[0].trend_score,64);
assert.equal(buildNativeTopics([obs,{...obs,title:'duplicate'}],options)[0].component_scores._sourceCount,1);
assert.equal(buildNativeTopics([obs,{...obs,source:'google_trends',previous:null,current:null,minimum:null,demandIndex:.99}],options)[0].trend_score,74);
assert.equal(buildNativeTopics([obs,{...obs,source:'google_trends'}],options)[0].trend_score,100,'two measured increases are a positive control');
for (const observedAt of ['2026-09-01T00:00:00Z','2026-10-01T00:00:00Z','junk']) assert.equal(buildNativeTopics([{...obs,observedAt}],options).length,0);
assert.equal(buildNativeTopics([{...obs,conceptKey:'unknown'}],options).length,0);
assert.equal(buildNativeTopics([],options).length,0);
assert.throws(()=>buildNativeTopics([obs],{...options,score:()=>({score:101,coverage:1})}),/invalid-native-score/);
assert.throws(()=>buildNativeTopics([obs],{...options,config:{...config,thresholds:{building:75,rising:65,exploding:85}}}),/native-score-config/);
const users=Array.from({length:10},(_,i)=>({id:`user${i}`,email:`test${i}@example.test`,email_confirmed_at:'2026-01-01'}));
users.push({id:'internal',email:'internal@example.test',email_confirmed_at:'2026-01-01',app_metadata:{is_internal:true}});
const place={place_id:'place_123',name:'Fixture venue',metro:'orlando',lat:28.5,lng:-81.4,status:'OPERATIONAL',refreshed_at:new Date(now-DAY_MS).toISOString()};
const ev=(id,days,extra={})=>({user_id:id,device_id:`device-${id}`,place_id:place.place_id,action:'detail_open',meta:{environment:'production'},created_at:new Date(utcDay(now)-days*DAY_MS).toISOString(),...extra});
const events=[...users.slice(0,5).map(u=>ev(u.id,10)),...users.slice(0,10).map(u=>ev(u.id,1)),...Array.from({length:50},()=>ev('user1',1)),ev('internal',1),ev(null,1),ev('unknown',1)];
const activity=activityObservations(events,[place],users,now,['orlando']);
assert.equal(activity.length,1);assert.equal(activity[0].previous,5);assert.equal(activity[0].current,10);assert.equal(activity[0].conceptKey,null);
for (const change of [{needs_review:true},{excluded:true},{metro:'miami'},{lat:40},{status:''},{status:'CLOSED_PERMANENTLY'},{refreshed_at:new Date(now-31*DAY_MS).toISOString()}]) assert.equal(activityObservations(events,[{...place,...change}],users,now,['orlando']).length,0);
for (const meta of [{is_test:'1'},{is_bot:true},{environment:'preview'},{hostname:'preview.vercel.app'}]) assert.equal(activityObservations([ev('user1',1,{meta})],[place],users,now,['orlando']).length,0);
assert.equal(activityObservations([ev('internal',1,{device_id:'shared'}),ev('user1',1,{device_id:'shared'})],[place],users,now,['orlando']).length,0);
assert.equal(activityObservations(events,[place],users.map(u=>({...u,email_confirmed_at:null})),now,['orlando']).length,0);
const serialized=JSON.stringify(buildNativeTopics(activity,options));assert(!serialized.includes('example.test'));assert(!serialized.includes('user1'));assert(!serialized.includes('device-'));
const service={url:'https://fixture.supabase.co',key:'fixture-key-not-real'}, calls=[];
const transport=nativeTransport(service,{fetchImpl:async(url,opts)=>{calls.push({url,opts});return Response.json([]);}});
await transport.db('/rest/v1/events');await transport.publicRequest('https://wikimedia.org/api/test',{headers:{Authorization:'bad'}});
assert.equal(calls[0].opts.headers.Authorization,`Bearer ${service.key}`);assert.equal(calls[1].opts.headers.Authorization,undefined);assert.equal(calls[1].opts.headers.apikey,undefined);
assert.equal(calls[0].opts.cache,'no-store');assert.equal(calls[0].opts.redirect,'error');assert(!calls[0].url.includes(service.key));
await assert.rejects(transport.publicRequest('https://wikimedia.org.attacker.invalid'),/invalid-public-origin/);
await assert.rejects(transport.publicRequest('https://user:pass@wikimedia.org'),/invalid-public-origin/);
await assert.rejects(transport.db('https://attacker.invalid'),/invalid-private-resource/);
assert.throws(()=>nativeTransport({url:service.url}),/missing-service-configuration/);
await assert.rejects(nativeTransport(service,{deadline:0}).db('/rest/v1/events'),/run-deadline/);
await assert.rejects(nativeTransport(service,{fetchImpl:async()=>new Response('x',{headers:{'content-length':'3000000'}})}).db('/rest/v1/events'),/body-cap/);
assert.equal(safeError(new Error('https://private.test?secret=bad')),'transport-or-payload-failure');
function memoryDb({fail=false,truncate=false}={}) {
  const state={snapshots:[],topics:[],writes:[]};
  const db=async(resource,opts={})=>{
    const u=new URL(service.url+resource),q=u.searchParams,method=opts.method||'GET';
    if(method!=='GET')state.writes.push({resource,opts});
    if(u.pathname.endsWith('/wf_trend_snapshots')) {
      if(method==='POST') {
        if(state.snapshots.some(s=>s.source_hash===opts.body.source_hash))return [];
        const s={...opts.body,id:`snapshot_${state.snapshots.length+1}`};state.snapshots.push(s);return [s];
      }
      const matched=state.snapshots.filter(s=>['id','source_hash','status','imported_at'].every(k=>!q.has(k)||q.get(k)===`eq.${s[k]}`));
      if(method==='PATCH')matched.forEach(s=>Object.assign(s,opts.body));
      return matched;
    }
    if(u.pathname.endsWith('/wf_trend_topics')) {
      if(method==='POST'){if(fail)throw new Error('database:http-500');state.topics=[...state.topics.filter(t=>t.snapshot_id!==opts.body[0]?.snapshot_id),...opts.body];return null;}
      return truncate?[]:state.topics.filter(t=>!q.has('snapshot_id')||q.get('snapshot_id')===`eq.${t.snapshot_id}`);
    }
    throw new Error('unexpected-fixture-path');
  };
  return {state,db};
}
const sources={google:{ok:true},wikimedia:{ok:true},activity:{ok:true}};
const store=memoryDb();
const saved=await persistNativeSnapshot(store.db,[one],sources,now);assert.equal(saved.status,'complete');
assert.equal((await persistNativeSnapshot(store.db,[{...one,trend_score:73,component_scores:{clock:true}}],sources,now+60000)).reused,true);
assert.equal(store.state.snapshots.length,1);
const failed=memoryDb({fail:true});await assert.rejects(persistNativeSnapshot(failed.db,[one],sources,now),/database:http-500/);assert.equal(failed.state.snapshots[0].status,'failed');
const short=memoryDb({truncate:true});await assert.rejects(persistNativeSnapshot(short.db,[one],sources,now),/topic-write-incomplete/);assert.equal(short.state.snapshots[0].status,'failed');
const partial=memoryDb();assert.equal((await persistNativeSnapshot(partial.db,[one],{...sources,google:{ok:false}},now)).status,'partial');
await assert.rejects(persistNativeSnapshot(store.db,[{...one,eligible:true}],sources,now),/invalid-private-snapshot/);
store.state.topics=[];await assert.rejects(persistNativeSnapshot(store.db,[one],sources,now),/topic-write-incomplete/);
const backend=memoryDb();let wikiCalls=0;
const fakeFetch=async(url,opts={})=>{
 const u=new URL(url);
 if(u.hostname==='wikimedia.org'){wikiCalls++;return Response.json(history());}
 if(u.pathname.endsWith('/wf_trend_score_config'))return Response.json([config]);
 if(u.pathname==='/auth/v1/admin/users')return Response.json({users:[]});
 if(u.pathname==='/rest/v1/events')return Response.json([]);
 return Response.json(await backend.db(u.pathname+u.search,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined}));
};
const dependencies={concepts,metros:['orlando'],score,normalizeGrowth:options.normalizeGrowth,fetchGoogleTrendingRss:async()=>({ok:true,items:[]}),conceptSignalsFromItems:()=>[]};
const run=await runNativeTrends(service,{nowMs:now,sleepImpl:async()=>{},fetchImpl:fakeFetch,dependencies});
assert.equal(wikiCalls,6);assert.equal(run.snapshot.topics,6);assert.equal(run.degraded,false);assert.equal(run.paidProviderCalls,0);
let blocked=0;
const rate=await runNativeTrends(service,{nowMs:now,sleepImpl:async()=>{},dependencies,fetchImpl:async(url,opts)=>{
 if(new URL(url).hostname==='wikimedia.org'){blocked++;return new Response('',{status:429});}return fakeFetch(url,opts);
}});
assert.equal(blocked,1);assert.equal(rate.degraded,true);
let configCalls=0;
await assert.rejects(runNativeTrends(service,{dependencies,fetchImpl:async()=>{configCalls++;return Response.json([]);}}),/one-active-score-config-required/);assert.equal(configCalls,1);
const maintenanceCalls=[];
const maintenance=await nativeMaintenance(service,{nowMs:now,fetchImpl:async(url,opts)=>{maintenanceCalls.push({url,opts});return Response.json([]);}});
assert.equal(maintenance.idle,true);assert.equal(maintenanceCalls[1].opts.method,'DELETE');assert(maintenanceCalls[1].url.includes('raw_row->>native_version=eq.wayfind_native_v1'));assert(maintenanceCalls[1].url.includes('expires_at=lt.'));
const stale=await nativeMaintenance(service,{nowMs:now,fetchImpl:async(url,opts)=>Response.json(opts.method==='DELETE'?null:[{id:'old',observed_at:'2026-01-01T00:00:00Z'}])});assert.equal(stale.ok,false);
// Execute actual handler bodies: absent/mismatched secret must do zero work.
for(const name of ['trend-signals','trend-maintenance']) {
 const source=readFileSync(new URL(`../app/api/cron/${name}/route.js`,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const setup=`let calls=0;const recordPulse=async()=>{};const sbEnv=()=>({});const safeError=()=>"fixture";const importCadence=()=>{};const runNativeTrends=async()=>{calls++;throw new Error("fixture");};const nativeMaintenance=async()=>{calls++;throw new Error("fixture");};export function count(){return calls;}\n`;
 const route=await import('data:text/javascript;base64,'+Buffer.from(setup+source).toString('base64'));
 const secret=process.env.CRON_SECRET,cadence=process.env.EXPLODING_TOPICS_IMPORT_CADENCE;
 try {
  delete process.env.CRON_SECRET;delete process.env.EXPLODING_TOPICS_IMPORT_CADENCE;
  assert.equal((await route.GET(new Request('https://fixture.test'))).status,401);
  process.env.CRON_SECRET='fixture-cron-not-real';
  assert.equal((await route.GET(new Request('https://fixture.test',{headers:{Authorization:'Bearer wrong'}}))).status,401);assert.equal(route.count(),0);
  assert.equal((await route.GET(new Request('https://fixture.test',{headers:{Authorization:'Bearer fixture-cron-not-real'}}))).status,503);assert.equal(route.count(),1);
 } finally {
  if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret;
  if(cadence===undefined)delete process.env.EXPLODING_TOPICS_IMPORT_CADENCE;else process.env.EXPLODING_TOPICS_IMPORT_CADENCE=cadence;
 }
}
console.log('native-trends: evidence, privacy, bounded transport, writer readback, deduplication, source failures, maintenance scope and real-handler auth controls passed');
