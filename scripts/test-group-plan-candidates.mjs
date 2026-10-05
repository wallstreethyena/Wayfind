// Runtime qualification/freshness tests. Fake Supabase reads only, never providers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupMiles, hasCurrentGroupScore, groupAlternativeReason, selectGroupAlternatives, groupEditorial } from '../lib/groupPlanCandidates.js';
import * as groupPlaceData from '../lib/groupPlanPlaceData.js';
import { createGroupPlaceData, scheduledGroupOpenTimes } from '../lib/groupPlanPlaceData.js';
const NOW = Date.parse('2026-10-04T12:00:00Z'), DAY = 86400000;
let count = 0; const failures = [];
function eq(a,b,label) { assert.deepEqual(a,b,label); count++; }
function yes(a,label) { assert.ok(a,label); count++; }
async function test(label, fn) { try { await fn(); } catch (error) { failures.push(label); console.error(`FAIL ${label}: ${error.message}`); } }
const original = { id:'original', name:'Original', lat:28, lng:-82, score:70, scoreVerified:true, scoreCheckedAt:'2026-10-03T12:00:00Z', factsExpireAt:'2026-10-20T12:00:00Z', category:'food', primaryType:'restaurant', cuisines:['Mexican'], priceLevel:2, status:'OPERATIONAL', excluded:false };
const candidate = { ...original, id:'candidate', score:80, lat:28.01, openTimeIds:['time-1','time-2'] };
const qualification = { now:NOW, timeIds:['time-1','time-2'] };
await test('truthful candidate eligibility', () => {
 eq(groupAlternativeReason(original,candidate,qualification),null,'healthy known evidence');
 eq(groupAlternativeReason(original,{...candidate,cuisines:['Italian']},qualification),'intent_unverified','a generic restaurant type cannot override a known cuisine mismatch');
 eq(groupAlternativeReason({...original,cuisines:[]},{...candidate,cuisines:[]},qualification),'intent_unverified','generic restaurant alone does not prove the same intent');
 for (const [patch,reason] of [[{id:'original'},'same_place'],[{status:'CLOSED_PERMANENTLY'},'not_operational'],[{excluded:true},'not_operational'],[{scoreVerified:false},'score_unverified'],[{score:70},'not_higher_scoring'],[{score:69},'not_higher_scoring'],[{category:'hotel'},'different_category'],[{primaryType:'cafe',cuisines:[]},'intent_unverified'],[{lat:29},'too_far'],[{lat:null},'too_far'],[{priceLevel:null},'budget_unverified'],[{priceLevel:4},'budget_unverified'],[{closedTimeIds:['time-1']},'known_closed'],[{closedTimeIds:['time-2']},'known_closed']]) eq(groupAlternativeReason(original,{...candidate,...patch},qualification),reason,reason);
 eq(groupAlternativeReason(original,{...candidate,primaryType:'cafe'},qualification),null,'shared food cuisine can establish intent');
 eq(groupAlternativeReason({...original,category:'activity',primaryType:null},{...candidate,category:'activity',primaryType:null},qualification),'intent_unverified','nonfood cuisine does not establish intent');
 eq(groupAlternativeReason(original,candidate,{now:NOW,timeIds:[]}),null,'no proposed time cannot establish a known-closed conflict');
 for(const patch of [{openTimeIds:undefined},{openTimeIds:[]},{openTimeIds:['time-1']},{openTimeIds:undefined,closedTimeIds:[]},{openTimeIds:undefined,closedTimeIds:['other-time']}])eq(groupAlternativeReason(original,{...candidate,...patch},qualification),null,'unknown venue hours do not eliminate a genuinely similar higher-score alternative');
 eq(selectGroupAlternatives(original,[{...candidate,openTimeIds:undefined}],qualification).map(p=>p.id),['candidate'],'unknown-hours higher-score option remains offered');
 eq(selectGroupAlternatives(original,[{...candidate,closedTimeIds:['time-1']}],qualification),[],'known-closed proposed interval excludes candidate');
 eq(groupMiles(original,original),0,'same coordinates'); yes(groupMiles(original,candidate)>0,'nonzero nearby distance'); eq(groupMiles(original,{lat:null,lng:-82}),null,'unknown coordinate never becomes zero');
});
await test('malformed evidence fails closed', () => {
 eq(groupAlternativeReason({...original,priceLevel:100},{...candidate,priceLevel:100},qualification),'budget_unverified','out-of-range price levels');
 eq(groupMiles({lat:100,lng:200},{lat:100,lng:200}),null,'coordinates must be within earth bounds');
});
await test('score freshness boundaries', () => {
 yes(hasCurrentGroupScore(original,NOW),'current score');
 for (const patch of [{score:0},{score:101},{score:NaN},{score:'90'},{scoreVerified:false},{scoreCheckedAt:new Date(NOW+1).toISOString()},{scoreCheckedAt:new Date(NOW-30*DAY-1).toISOString()},{factsExpireAt:new Date(NOW).toISOString()},{factsExpireAt:null}]) eq(hasCurrentGroupScore({...original,...patch},NOW),false,'unknown/expired score fails closed');
 yes(hasCurrentGroupScore({...original,scoreCheckedAt:new Date(NOW-30*DAY).toISOString(),factsExpireAt:new Date(NOW+1).toISOString()},NOW),'independent expiry can bound the exact source-age edge');
});
await test('deterministic score-first alternatives', () => {
 const a={...candidate,id:'aaa',score:90,lat:28.02},b={...candidate,id:'bbb',score:90,lat:28.01},c={...candidate,id:'ccc',score:95,lat:28.03};
 eq(selectGroupAlternatives(original,[a,b,c,a,{...candidate,score:65}],qualification).map(p=>p.id),['ccc','bbb'],'score first, distance tie break, unique and cap two');
 eq(selectGroupAlternatives(original,[{...candidate,id:'zzz',lat:28.01},{...candidate,id:'aaa',lat:28.01}],qualification).map(p=>p.id),['aaa','zzz'],'stable ID breaks exact score+distance ties');
 eq(selectGroupAlternatives(original,[{...candidate,score:70}],qualification),[],'no qualifying alternatives means no filler');
});
const editorial = { verified:true, hook:'Evidence-based local idea', written_at:'2026-10-03T10:00:00Z', facts:[{source:'https://official.example/details',checked_at:'2026-10-02T12:00:00Z'}] };
await test('editorial provenance is explicit', () => {
 const valid=groupEditorial(editorial,NOW);
 eq(valid.status,'verified','current sourced facts'); eq(valid.checkedAt,'2026-10-02T12:00:00.000Z','check is independent of publication'); eq(valid.publishedAt,'2026-10-03T10:00:00.000Z','publication retained honestly');
 for(const patch of [{verified:false},{hook:''},{facts:[]},{facts:[{source:'http://official.example',checked_at:'2026-10-02T12:00:00Z'}]},{written_at:'2027-01-01T00:00:00Z'},{hook:'pending verification'}]) eq(groupEditorial({...editorial,...patch},NOW).status,'unavailable','unsupported evidence unavailable');
 for(const facts of [[{source:'https://official.example'}],[{source:'https://official.example',checked_at:'2026-08-01T00:00:00Z'}]]) {
  const stale=groupEditorial({...editorial,facts},NOW); eq(stale.status,'needs_recheck','legacy/stale source check'); eq(stale.text,null,'cannot present unverified prose as a fresh claim'); eq(stale.checkedAt,null,'does not relabel writing time');
 }
 eq(groupEditorial({...editorial,hook:'x'.repeat(600)},NOW).text.length,500,'editorial text bounded');
});
await test('every contributing source check must be current', () => {
 const mixed=groupEditorial({...editorial,facts:[...editorial.facts,{source:'https://official.example/future',checked_at:'2027-10-03T12:00:00Z'}]},NOW);
 eq(mixed.status,'needs_recheck','one future check invalidates current-check claim'); eq(mixed.text,null,'mixed future evidence does not get fresh prose');
});
const times=[{id:'time-1',startsAt:'2026-10-10T12:00:00Z',endsAt:'2026-10-10T12:30:00Z'}];
const hours={timeZone:'UTC',hoursAsOf:'2026-10-04T12:00:00Z',oh:{periods:[{open:{day:6,hour:12},close:{day:6,hour:13}}]}};
await test('scheduled hours use the outing not openNow', () => {
 eq(scheduledGroupOpenTimes(hours,times,NOW),['time-1'],'opening-inclusive healthy control');
 eq(scheduledGroupOpenTimes({...hours,hoursAsOf:'2026-09-19T12:00:00Z'},times,NOW),[],'old hours fail closed');
 eq(scheduledGroupOpenTimes({...hours,hoursAsOf:'2026-10-05T12:00:00Z'},times,NOW),[],'future check fails closed');
 eq(scheduledGroupOpenTimes({...hours,timeZone:'Invalid/Zone'},times,NOW),[],'unknown zone fails closed');
 eq(scheduledGroupOpenTimes({timeZone:'UTC',hoursAsOf:hours.hoursAsOf,openNow:true},times,NOW),[],'openNow snapshot cannot prove future hours');
 eq(scheduledGroupOpenTimes(hours,[{id:'closed',startsAt:'2026-10-10T13:00:00Z',endsAt:'2026-10-10T13:30:00Z'}],NOW),[],'closing-exclusive');
 eq(scheduledGroupOpenTimes({...hours,oh:{periods:[{open:{day:6,hour:12},close:{day:6,hour:12,minute:10}},{open:{day:6,hour:12,minute:20},close:{day:6,hour:13}}]}},times,NOW),[],'split-shift gap blocks the outing');
 const eastern={...hours,timeZone:'America/New_York',oh:{periods:[{open:{day:6,hour:12},close:{day:6,hour:13}}]}};
 eq(scheduledGroupOpenTimes(eastern,[{id:'summer',startsAt:'2026-10-10T16:00:00Z',endsAt:'2026-10-10T16:30:00Z'},{id:'winter',startsAt:'2026-12-12T17:00:00Z',endsAt:'2026-12-12T17:30:00Z'}],NOW),['summer','winter'],'venue offset is recomputed for each outing across DST');
});
await test('subminute closing and evidenced special closures', () => {
 eq(scheduledGroupOpenTimes(hours,[{id:'cross-close',startsAt:'2026-10-10T12:59:30Z',endsAt:'2026-10-10T13:00:10Z'}],NOW),[],'real closing-minute boundary is sampled');
 eq(scheduledGroupOpenTimes({...hours,specialHours:[{date:'2026-10-10',closed:true}]},times,NOW),[],'known dated closure beats regular hours');
 eq(scheduledGroupOpenTimes({...hours,businessStatus:'CLOSED_PERMANENTLY'},times,NOW),[],'known cached nonoperational status blocks fit');
});
await test('venue-fit evidence is disjoint and separates unknown from closed', () => {
 yes(typeof groupPlaceData.scheduledGroupTimeFit==='function','explicit venue-fit helper exists');
 const proposed=[...times,{id:'closed-time',startsAt:'2026-10-10T13:00:00Z',endsAt:'2026-10-10T13:30:00Z'}];
 const fit=groupPlaceData.scheduledGroupTimeFit(hours,proposed,NOW);
 eq(fit.openTimeIds,['time-1'],'verified open interval');eq(fit.closedTimeIds,['closed-time'],'verified closed interval');eq(fit.unverifiedTimeIds,[],'known closed is not relabeled as unknown');
 const unknown=groupPlaceData.scheduledGroupTimeFit(null,proposed,NOW);
 eq(unknown.openTimeIds,[],'unknown has no open claim');eq(unknown.closedTimeIds,[],'unknown has no closed claim');eq(unknown.unverifiedTimeIds,['time-1','closed-time'],'every unknown proposal explicitly labeled');
 const expired=groupPlaceData.scheduledGroupTimeFit({...hours,hoursAsOf:'2026-09-01T00:00:00Z'},proposed,NOW);eq(expired.unverifiedTimeIds,['time-1','closed-time'],'expired evidence becomes unknown rather than closed');
 const gap=groupPlaceData.scheduledGroupTimeFit(hours,[{id:'cross-close',startsAt:'2026-10-10T12:59:30Z',endsAt:'2026-10-10T13:00:10Z'}],NOW);eq(gap.closedTimeIds,['cross-close'],'partial closing conflict is explicit known-closed');
 const special=groupPlaceData.scheduledGroupTimeFit({...hours,specialHours:[{date:'2026-10-10',closed:true}]},times,NOW);eq(special.closedTimeIds,['time-1'],'evidenced special closure is known-closed');
 for(const result of [fit,unknown,expired,gap,special]){const all=[...result.openTimeIds,...result.closedTimeIds,...result.unverifiedTimeIds];eq(new Set(all).size,all.length,'no interval can be both open, closed or unknown');}
});
function adapterFixture({age=1,cacheAge=1,cacheExpires=NOW+DAY,closed=false,pages,missing=false,ownerKnown=true,cacheHours=hours,photo=null}={}) {
 const calls=[];
 const rows=[{place_id:'original',name:'Current original provider name',lat:28,lng:-82,category:'food',primary_type:'restaurant',cuisines:['Mexican'],signals:{rating:4,reviews:200,priceNum:2},status:'OPERATIONAL',excluded:false,refreshed_at:new Date(NOW-age*DAY).toISOString()}, {place_id:'candidate',name:'Current alternative provider name',lat:28.01,lng:-82,category:'food',primary_type:'restaurant',cuisines:['Mexican'],signals:{rating:4.9,reviews:2000,priceNum:2},status:closed?'CLOSED_PERMANENTLY':'OPERATIONAL',excluded:false,refreshed_at:new Date(NOW-age*DAY).toISOString()}];
 const env=ownerKnown?{WF_OWNER_USER_ID:'11111111-1111-4111-8111-111111111111'}:{};
 const fetchImpl=async(url,init)=>{
  calls.push({url,init}); const parsed=new URL(url),relation=parsed.pathname.split('/').pop(),query=parsed.searchParams;
  if(relation==='wf_inventory') {
   if(missing)return Response.json([]);
   if(query.has('offset'))return Response.json(pages?pages[+query.get('offset')/1000]||[]:rows.filter(r=>r.status==='OPERATIONAL'));
   const wanted=query.get('place_id')||''; return Response.json(rows.filter(r=>wanted.includes(r.place_id)));
  }
  if(relation==='wf_editorial_servable')return Response.json(rows.map(r=>({...editorial,place_id:r.place_id})));
  if(relation==='wf_places_cache')return Response.json(rows.map(r=>({k:`pd1|${r.place_id}`,v:cacheHours,wrote_at:new Date(NOW-cacheAge*DAY).toISOString(),exp:new Date(cacheExpires).toISOString()})));
  if(relation==='wf_place_popularity_scored'||relation==='likes')return Response.json([]);
  throw new Error(`Unexpected fake relation ${relation}`);
 };
 return {adapter:createGroupPlaceData({url:'https://fake.example',key:'placeholder-only'},{fetchImpl,env,photoResolver:async()=>photo}),calls,rows};
}
await test('actual adapter healthy cached qualification and no paid calls', async () => {
 const f=adapterFixture(); const result=await f.adapter.prepare('original',times,NOW);
 eq(result.places.map(p=>p.id),['original','candidate'],'actual adapter selects a real higher governed score'); eq(result.alternativesStatus,'verified','qualification status');
 yes(result.places[1].score>result.places[0].score,'same-context governed score comparison');
 yes(f.calls.some(c=>c.url.includes('wf_editorial_servable')),'read actual gated editorial view');
 yes(f.calls.every(c=>c.url.startsWith('https://fake.example/rest/v1/') && (!c.init.method||c.init.method==='GET')),'only read-only fake backend calls');
 yes(f.calls.every(c=>c.init.cache==='no-store'),'facts hydrated per request');
 const hydrated=await f.adapter.hydrate(['original','candidate'],times,NOW); eq(hydrated[0].name,'Current original provider name','current server name');
 yes(!JSON.stringify(hydrated).includes('placeholder-only'),'credentials do not enter public place shapes');
});
await test('specific intent precedes evidence bounds and photo credits survive hydration',async()=>{
 const baseline=adapterFixture();const unrelated=Array.from({length:250},(_,i)=>({...baseline.rows[1],place_id:`unrelated-${i}`,cuisines:['Italian']}));
 const crowded=adapterFixture({pages:[[...unrelated,...baseline.rows]]});eq((await crowded.adapter.prepare('original',times,NOW)).places.map(p=>p.id),['original','candidate'],'irrelevant generic restaurants cannot exhaust the evidence budget before real cuisine matching');
 const photo={url:'https://images.example.test/place.jpg',attributionText:'Fixture photographer',attributionUrl:'https://example.test/photo-credit'};
 const credited=await adapterFixture({photo}).adapter.hydrate(['original'],times,NOW);eq(credited[0].photo,photo.url,'identity-keyed safe resolver photo reaches card');eq(credited[0].photoAttr,photo.attributionText,'required photo credit survives');eq(credited[0].photoAttrHref,photo.attributionUrl,'required source link survives');
 const missing=await adapterFixture().adapter.hydrate(['original'],times,NOW);eq(missing[0].photo,null,'missing attributed source remains absent');
});
await test('all stale provider facts disappear', async () => {
 const f=adapterFixture({age:31}); const result=await f.adapter.hydrate(['original','candidate'],times,NOW);
 const body=JSON.stringify(result);
 yes(!body.includes('Current original provider name')&&!body.includes('Current alternative provider name'),'provider names cannot survive source expiry');
 yes(result.every(p=>p.unavailable===true),'stale source becomes explicitly unavailable');
 for(const p of result)yes(!('lat' in p)&&!('lng' in p)&&!('cuisines' in p),'stale third-party coordinates and cuisine absent');
});
await test('source expiry and candidate scan truncation are truthful', async () => {
 for(const patch of [{cacheAge:31},{cacheExpires:NOW}]) {
  const f=adapterFixture(patch),result=await f.adapter.prepare('original',times,NOW);
  eq(result.places.length,2,'unknown expired hours cache retains otherwise eligible alternative');
  eq(result.places[1].openTimeIds,[],'expired hours never become a verified open claim');
  eq(result.places[1].closedTimeIds,[],'expired hours never become a verified closed claim');
  eq(result.places[1].unverifiedTimeIds,['time-1'],'unknown proposal explicitly retained in hydrated facts');
  eq(result.places[1].hoursStatus,'unverified','unknown-hour status is explicit');
  yes(/not verified|unverified/i.test(result.places[1].hoursNote)&&/check/i.test(result.places[1].hoursNote),'unknown venue-hours label calls for organizer verification');
 }
 for(const patch of [{ownerKnown:false},{closed:true}]) {
  const f=adapterFixture(patch), result=await f.adapter.prepare('original',times,NOW); eq(result.places.length,1,'unverified dimensions never supply filler'); eq(result.alternativesStatus,'no_verified_alternatives','ordinary no qualifier state');
 }
 const absent=adapterFixture({missing:true}); eq((await absent.adapter.hydrate(['original'],times,NOW))[0].unavailable,true,'missing inventory explicit unavailable');
 const filler=Array.from({length:1000},(_,i)=>({place_id:`dummy-${i}`,lat:28,lng:-82,primary_type:'not-a-restaurant'}));
 const truncated=adapterFixture({pages:Array.from({length:6},()=>filler)}), result=await truncated.adapter.prepare('original',times,NOW);
 eq(result.places.length,1,'bounded scan cannot claim exhaustive absence'); eq(result.alternativesStatus,'evidence_check_incomplete','binding scan cap says incomplete');
 eq(truncated.calls.filter(c=>new URL(c.url).searchParams.has('offset')).length,6,'real bounded page count');
});
await test('adapter reports unavailable reads instead of empty success', async () => {
 for(const fake of [async()=>{throw new Error('network');},async()=>new Response('',{status:503})]) {
  const adapter=createGroupPlaceData({url:'https://fake.example',key:'placeholder'},{fetchImpl:fake,env:{}});
  await assert.rejects(adapter.hydrate(['original'],times,NOW),e=>e.code==='PLACE_DATA_UNAVAILABLE');count++;
 }
});
const source=readFileSync(new URL('../lib/groupPlanPlaceData.js',import.meta.url),'utf8');
yes(!/maps\.google|places\.googleapis|deepseek|openai\.com|\/api\/places|\/api\/insider/.test(source),'adapter does not invoke paid providers or model routes');
if(failures.length) { console.error(`test-group-plan-candidates: ${count} assertions passed; ${failures.length} groups failed`);process.exit(1); }
console.log(`test-group-plan-candidates: ${count} assertions passed`);
