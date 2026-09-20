// Real production model, taxonomy and RSS parser. Only transport is simulated.
import assert from 'node:assert/strict';
import { runNativeTrends } from '../lib/trendSources/nativeRuntime.js';
import { DEFAULT_WEIGHTS, MOMENTUM_THRESHOLDS, PUBLIC_LABELS, TREND_SCORE_MODEL_VERSION } from '../lib/trendScore.js';
import { wikiWindow, DAY_MS } from '../lib/trendSources/nativeCore.js';
const now=Date.parse('2026-09-20T12:00:00Z'),window=wikiWindow(now);
const history={items:Array.from({length:14},(_,i)=>({timestamp:new Date(window.start+i*DAY_MS).toISOString().slice(0,10).replace(/-/g,'')+'00',views:i<7?100:200}))};
let topics=[],snapshot=null,external=0;const calls=[];
const fetchImpl=async(url,opts={})=>{
 const u=new URL(url);calls.push({url,method:opts.method||'GET'});
 if(u.hostname==='wikimedia.org'){external++;assert(!opts.headers.Authorization);return Response.json(history);}
 if(u.hostname==='trends.google.com'){
  external++;assert(!opts.headers.Authorization);
  return new Response('<rss><channel><item><title>pickleball</title><ht:approx_traffic>200K+</ht:approx_traffic><pubDate>Sun, 20 Sep 2026 08:00:00 +0000</pubDate></item></channel></rss>');
 }
 assert.equal(u.hostname,'fixture.supabase.co');assert.equal(opts.cache,'no-store');
 if(u.pathname.endsWith('/wf_trend_score_config'))return Response.json([{version:TREND_SCORE_MODEL_VERSION,weights:DEFAULT_WEIGHTS,thresholds:MOMENTUM_THRESHOLDS,labels:PUBLIC_LABELS}]);
 if(u.pathname==='/auth/v1/admin/users')return Response.json({users:[]});
 if(u.pathname==='/rest/v1/events')return Response.json([]);
 if(u.pathname.endsWith('/wf_trend_snapshots')){
  if(opts.method==='POST'){snapshot={...JSON.parse(opts.body),id:'fixture-snapshot'};return Response.json([snapshot]);}
  if(opts.method==='PATCH'){snapshot={...snapshot,...JSON.parse(opts.body)};return Response.json([snapshot]);}
 }
 if(u.pathname.endsWith('/wf_trend_topics')){
  if(opts.method==='POST'){topics=JSON.parse(opts.body);return Response.json(null);}
  return Response.json(topics);
 }
 throw new Error('unexpected-integration-call');
};
const result=await runNativeTrends({url:'https://fixture.supabase.co',key:'fixture-key-not-real'},{nowMs:now,fetchImpl,sleepImpl:async()=>{}});
assert.equal(external,7);assert.equal(result.snapshot.topics,6);assert.equal(result.snapshot.status,'complete');
assert(topics.every(t=>t.eligible===false&&t.model_version===TREND_SCORE_MODEL_VERSION));
const pickleball=topics.find(t=>t.concept_key==='pickleball');
assert.equal(pickleball.component_scores._sourceCount,2);assert.equal(pickleball.component_scores._growthSourceCount,1);assert(pickleball.trend_score<75);
assert(topics.every(t=>t.country===null&&t.state===null));
assert(calls.filter(c=>c.method!=='GET').every(c=>/wf_trend_(snapshots|topics)/.test(c.url)));
console.log('native-trends production bindings: actual score, taxonomy, RSS and seven bounded public requests passed');
