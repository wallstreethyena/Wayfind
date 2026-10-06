// Runtime security, repository and service contracts with injected memory CAS.
// No real network, SQL execution, notifications or production writes occur here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyGroupPlanCommand } from '../lib/groupPlan.js';
import { createGroupPlanService } from '../lib/groupPlanService.js';
import { groupPlanConfiguration, createGroupPlanRepository, verifiedGroupOrganizer } from '../lib/groupPlanRepository.js';
import { inviteCapability, verifyInviteCapability, finalCapability, verifyFinalCapability, groupRateKey, sameOriginGroupRequest, readGroupJson } from '../lib/groupPlanSecurity.js';
import { groupReply, groupFailure, groupPost, groupCredentials } from '../lib/groupPlanApi.js';
import {runGroupPlanWorker} from '../lib/groupPlanWorker.js';

const NOW=Date.parse('2026-10-04T12:00:00Z'), DEADLINE=Date.parse('2026-10-05T12:00:00Z'), DAY=86400000;
const OWNER='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
let count=0;const failures=[];
function eq(a,b,label){assert.deepEqual(a,b,label);count++;}
function yes(a,label){assert.ok(a,label);count++;}
async function rejects(promise,code){await assert.rejects(promise,e=>e.code===code,code);count++;}
function rejectSync(fn,code){assert.throws(fn,e=>e.code===code,code);count++;}
async function test(label,fn){try{await fn();}catch(error){failures.push(label);console.error(`FAIL ${label}: ${error.message}`);}}
const clone=(value)=>structuredClone(value);
const commandId=(n)=>`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`;
function fixture({emailAvailable=false,hasVerifiedEmail=true}={}) {
 let sequence=0;
 const f={time:NOW,records:new Map(),keys:new Map(),notices:[],rateCalls:[],casCalls:[],prepareCalls:0,hydrateCalls:0,failPrepare:false,failHydrate:false,hook:null};
 const uuid=()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
 const input={createKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',originalPlaceId:'original',organizerName:'Host',invitees:[{name:'Alice Private'},{name:'Bob Private'}],times:[{startsAt:'2026-10-10T18:00:00Z',endsAt:'2026-10-10T20:00:00Z'}],timeZone:'UTC',deadline:new Date(DEADLINE).toISOString(),emailConsent:false};
 const user={id:OWNER,hasVerifiedEmail};
 const repository={
  get:async(id)=>clone(f.records.get(id)||null),
  findCreated:async(owner,key)=>clone(f.records.get(f.keys.get(`${owner}/${key}`))||null),
  create:async({state,secret,createKey,emailConsent})=>{
   const key=`${state.ownerId}/${createKey}`,existing=f.keys.get(key);if(existing)return clone(f.records.get(existing));
   const row={id:state.id,owner_id:state.ownerId,revision:state.revision,status:state.status,deadline:state.deadline,created_at:state.createdAt,expires_at:new Date(Date.parse(state.createdAt)+120*DAY).toISOString(),invite_secret:secret,email_consent:emailConsent,state:clone(state)};
   f.keys.set(key,row.id);f.records.set(row.id,row);return clone(row);
  },
  compareAndSwap:async(id,revision,state,operation)=>{
   f.casCalls.push({id,revision,operation});if(f.hook){const result=await f.hook({id,revision,state,operation});if(result)return result;}
   const row=f.records.get(id);if(!row||row.revision!==revision)return {conflict:true};
   if(['start','respond','withdraw'].includes(operation)&&f.time>=Date.parse(row.deadline))return {conflict:true};
   const transitions={draft:['open','cancelled','closed'],open:['open','closed','cancelled'],closed:['finalized','cancelled']};
   if(!transitions[row.status]?.includes(state.status))throw Object.assign(new Error('Draft SQL transition rejected'),{code:'GROUP_SAVE_REJECTED',status:409});
   const next={...row,state:clone(state),revision:state.revision,status:state.status};f.records.set(id,next);
   const event={closed:'voting_closed',finalized:'plan_finalized',cancelled:'plan_cancelled'}[state.status];
   if(event&&!f.notices.some(n=>n.plan_id===id&&n.event_type===event))f.notices.push({id:uuid(),plan_id:id,owner_id:row.owner_id,event_type:event,email_status:row.email_consent&&event==='voting_closed'?'pending_configuration':'not_requested'});
   return clone(next);
  },
  rateLimit:async(key,limit)=>{f.rateCalls.push({key,limit});return true;},
  due:async(limit)=>[...f.records.values()].filter(r=>r.status==='open'&&Date.parse(r.deadline)<=f.time).slice(0,limit).map(r=>({id:r.id})),
  notices:async(owner)=>clone(f.notices.filter(n=>n.owner_id===owner)),
  listOwned:async(owner)=>[...f.records.values()].filter(r=>r.owner_id===owner).map(r=>({id:r.id,status:r.status,deadline:r.deadline})),
 };
 const placeData={
  prepare:async(id,times)=>{f.prepareCalls++;if(f.failPrepare)throw new Error('Temporary inventory outage');return {places:[{id,name:'Provider current original',lat:28,lng:-82,score:70,privateField:'never persist facts'}, {id:'alternative',name:'Provider current alternative',score:80}],alternativesStatus:'verified'};},
  hydrate:async(ids,times)=>{f.hydrateCalls++;if(f.failHydrate)throw new Error('Temporary facts outage');return ids.map(id=>({id,name:`Current ${id}`,score:80,status:'OPERATIONAL',openTimeIds:times.map(t=>t.id),closedTimeIds:[],editorial:{status:'verified',text:'Checked current claim',sources:['https://official.example']}}));},
 };
 f.repository=repository;f.placeData=placeData;f.service=createGroupPlanService({repository,placeData,clock:()=>f.time,uuid,secret:()=> 'a'.repeat(64),emailAvailable});f.input=input;f.user=user;
 f.create=(patch={},who=user)=>f.service.create({...clone(input),...patch},who);
 f.start=async()=>{const made=await f.create();return f.service.command(made.id,{id:commandId(1),type:'start'},{user});};
 f.respond=(plan,slotIndex,n,patch={})=>f.service.command(plan.id,{id:commandId(n),type:'respond',slotId:plan.invitees[slotIndex].id,placeId:'original',availableTimeIds:plan.times.map(t=>t.id),declined:false,...patch},{token:plan.invites[slotIndex].token});
 return f;
}
await test('configuration fails visibly until all release gates are ready',()=>{
 rejectSync(()=>groupPlanConfiguration({}),'GROUP_PLANS_DISABLED');
 rejectSync(()=>groupPlanConfiguration({NEXT_PUBLIC_GROUP_PLANS_ENABLED:'1',WF_GROUP_PLANS_ENABLED:'1'}),'DEADLINE_WORKER_UNVERIFIED');
 rejectSync(()=>groupPlanConfiguration({NEXT_PUBLIC_GROUP_PLANS_ENABLED:'1',WF_GROUP_PLANS_ENABLED:'1',WF_GROUP_PLAN_DEADLINE_WORKER_READY:'1'}),'GROUP_STORAGE_UNCONFIGURED');
 const env={NEXT_PUBLIC_GROUP_PLANS_ENABLED:'1',WF_GROUP_PLANS_ENABLED:'1',WF_GROUP_PLAN_DEADLINE_WORKER_READY:'1',SUPABASE_URL:'https://fake.example/',SUPABASE_SERVICE_ROLE_KEY:'placeholder'};
 eq(groupPlanConfiguration(env),{url:'https://fake.example',key:'placeholder',emailAvailable:false},'in-app available without email credentials');
 eq(groupPlanConfiguration({...env,WF_GROUP_PLAN_EMAIL_ENABLED:'1'}).emailAvailable,false,'flag alone is not email configuration');
});
await test('same-origin and real body ceilings',async()=>{
 const req=(body='{}',headers={})=>new Request('https://wayfind.example/api/group-plans',{method:'POST',headers:{origin:'https://wayfind.example','content-type':'application/json','sec-fetch-site':'same-origin',...headers},body});
 yes(sameOriginGroupRequest(req()),'healthy same-origin JSON');
 for(const headers of [{origin:'https://attacker.example'},{origin:''},{'content-type':'text/plain'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'none'},{origin:'https://wayfind.example.attacker.example'}])eq(sameOriginGroupRequest(req('{}',headers)),false,'forged origin/format denied');
 eq(await readGroupJson(req('{"action":"view"}')),{action:'view'},'real body parsed');
 await rejects(readGroupJson(req('{}',{'content-length':'16001'})),'BODY_TOO_LARGE');
 await rejects(readGroupJson(req(JSON.stringify({token:'x'.repeat(17000)}))),'BODY_TOO_LARGE');
 for(const body of ['[]','null','"text"','{broken'])await rejects(readGroupJson(req(body)),'INVALID_JSON');
 const cross=await groupPost(req('{}',{origin:'https://attacker.example'}),()=>{throw new Error('must never run');});eq(cross.status,403,'HTTP origin enforcement precedes runtime setup');
});
await test('verified organizer comes only from auth server',async()=>{
 const config={url:'https://fake.example',key:'placeholder'},req=new Request('https://wayfind.example',{headers:{authorization:'Bearer fake-token-at-least-twenty-characters'}});
 let calls=0;const fake=async(url,init)=>{calls++;eq(url,'https://fake.example/auth/v1/user','auth endpoint');yes(init.headers.authorization.startsWith('Bearer fake-'),'same bearer checked by server');return Response.json({id:OWNER,email:'verified@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'});};
 eq(await verifiedGroupOrganizer(req,config,fake),{id:OWNER,hasVerifiedEmail:true},'only verified auth identity returned');eq(calls,1,'one real fake auth read');
 await rejects(verifiedGroupOrganizer(new Request('https://wayfind.example'),config,fake),'SIGN_IN_REQUIRED');
 await rejects(verifiedGroupOrganizer(req,config,async()=>Response.json({id:OWNER,is_anonymous:true})),'SIGN_IN_REQUIRED');
 await rejects(verifiedGroupOrganizer(req,config,async()=>Response.json({id:'spoof'})),'SIGN_IN_REQUIRED');
 await rejects(verifiedGroupOrganizer(req,config,async()=>new Response('',{status:401})),'SIGN_IN_REQUIRED');
 await rejects(verifiedGroupOrganizer(req,config,async()=>{throw new Error('auth network');}),'AUTH_UNAVAILABLE');
 eq(await groupCredentials(req,{token:'capability'},config),{token:'capability',finalToken:undefined},'token credentials never fabricate organizer identity');
});
await test('repository RPCs preserve CAS/conflict semantics without network',async()=>{
 const calls=[];let result=true;
 const fake=async(url,init)=>{calls.push({url,init});return Response.json(result);};
 const repository=createGroupPlanRepository({url:'https://fake.example',key:'placeholder-only'},fake);
 await repository.rateLimit('a'.repeat(64),30);eq(JSON.parse(calls.at(-1).init.body),{p_key:'a'.repeat(64),p_limit:30},'rate RPC payload');
 result={error:'conflict'};eq(await repository.compareAndSwap(OWNER,3,{revision:4},'respond'),{conflict:true},'CAS conflict retries');
 result={error:'deadline'};eq(await repository.compareAndSwap(OWNER,3,{revision:4},'respond'),{conflict:true},'server-clock deadline race classified for retry');
 result={error:'state'};await rejects(repository.compareAndSwap(OWNER,3,{revision:4},'respond'),'GROUP_SAVE_REJECTED');
 result={error:'rate_limited'};await rejects(repository.create({state:{},secret:'a'.repeat(64),createKey:OTHER}),'RATE_LIMITED');
 result=false;await rejects(repository.rateLimit('a'.repeat(64),30),'RATE_LIMITED');
 result=[];eq(await repository.get(OWNER),null,'confirmed absent row');
 await repository.findCreated(OWNER,OTHER);yes(calls.at(-1).url.includes(`owner_id=eq.${OWNER}`)&&calls.at(-1).url.includes(`create_key=eq.${OTHER}`),'idempotency lookup is owner and create-key scoped');
 await repository.notices(OWNER);yes(calls.at(-1).url.includes(`owner_id=eq.${OWNER}`),'notices scoped to verified owner');
 yes(calls.every(c=>c.url.startsWith('https://fake.example/rest/v1/')),'fake backend only');
 yes(calls.every(c=>c.init.cache==='no-store'&&c.init.headers.authorization==='Bearer placeholder-only'),'server credential never client-side, no cache');
 for(const fetchImpl of [async()=>{throw new Error('network');},async()=>new Response('',{status:503})])await rejects(createGroupPlanRepository({url:'https://fake.example',key:'placeholder'},fetchImpl).get(OWNER),'GROUP_STORAGE_UNAVAILABLE');
});
await test('server creation ignores spoofed identity and stores neutral stable labels',async()=>{
 const f=fixture(),plan=await f.create({ownerId:OTHER,places:[{id:'injected',name:'Injected',score:100,ownerId:OTHER}],email:'ignored@example.test'}),row=f.records.get(plan.id);
 eq(row.owner_id,OWNER,'auth owner wins over client owner');eq(row.state.places,[{id:'original',name:'Original idea'},{id:'alternative',name:'Alternative 1'}],'only IDs and neutral labels persisted');
 const stored=JSON.stringify(row.state);yes(!stored.includes('Provider')&&!stored.includes('never persist facts')&&!stored.includes('ignored@example.test')&&!stored.includes('score'),'current source facts and client contacts absent from state');
 eq(plan.places[0].name,'Current original','facts hydrated at each view');eq(plan.emailAvailable,false,'no email configuration is honest');eq(plan.emailConsent,false,'in-app only default');
 eq(plan.role,'organizer','auth role');eq(plan.invites.length,2,'one capability per named slot');yes(!('invite_secret'in plan)&&!('ownerId'in plan)&&!('recentCommands'in plan),'organizer projection omits persistence secrets');
 eq(row.state.status,'draft','creation does not pretend an invitation was sent');
 await rejects(f.create({},{}),'SIGN_IN_REQUIRED');await rejects(f.create({createKey:'forged'}),'INVALID_CREATE_KEY');
 const before=f.prepareCalls;await rejects(f.create({createKey:OTHER,invitees:Array.from({length:11},()=>({name:'Guest'}))}),'INVALID_INVITEE_COUNT');eq(f.prepareCalls,before,'cheap bounds validated before source read');
});
await test('idempotent creation survives changing source availability and deadline',async()=>{
 const f=fixture(),first=await f.create();f.failPrepare=true;
 const repeated=await f.create();eq(repeated.id,first.id,'same createKey returns saved plan despite provider outage');eq(f.prepareCalls,1,'retry avoids additional source preparation');eq(f.records.size,1,'only one plan persisted');
 f.time=DEADLINE+1;const lateRetry=await f.create();eq(lateRetry.id,first.id,'existing idempotent create survives deadline passing');
 const other=await f.create({}, {id:OTHER,hasVerifiedEmail:true}).catch(e=>e);yes(other instanceof Error,'different owner cannot reuse someone else’s create key');
});
await test('email consent requires configured delivery and verified auth email',async()=>{
 await rejects(fixture().create({emailConsent:true}),'EMAIL_NOT_READY');
 await rejects(fixture({emailAvailable:true,hasVerifiedEmail:false}).create({emailConsent:true}),'EMAIL_NOT_READY');
 const f=fixture({emailAvailable:true}),plan=await f.create({emailConsent:true});eq(plan.emailConsent,true,'explicit consent persisted');eq(plan.emailAvailable,true,'runtime availability disclosed');
 eq(f.notices.length,0,'creation sends no external mail');
});
await test('capabilities bind plan, slot, version, secret and lifetime',async()=>{
 const f=fixture(),plan=await f.start(),row=f.records.get(plan.id),slot=row.state.invitees[0],token=inviteCapability(row.state,slot,row.invite_secret);
 eq(verifyInviteCapability(row.state,token,row.invite_secret,NOW),slot.id,'healthy signed capability');
 for(const [state,badToken,secret,now] of [[row.state,`${token.slice(0,-1)}!`,row.invite_secret,NOW],[{...row.state,id:OTHER},token,row.invite_secret,NOW],[{...row.state,status:'draft'},token,row.invite_secret,NOW],[{...row.state,status:'cancelled'},token,row.invite_secret,NOW],[{...row.state,invitees:row.state.invitees.map(s=>({...s,inviteVersion:2}))},token,row.invite_secret,NOW],[row.state,token,'b'.repeat(64),NOW],[row.state,token,row.invite_secret,NOW+120*DAY+1]])eq(verifyInviteCapability(state,badToken,secret,now),null,'forged/expired/revoked capability denied');
 eq(finalCapability(row.state,row.invite_secret),null,'no final token for open votes');
 const rate=groupRateKey('read',token);yes(/^[a-f0-9]{64}$/.test(rate)&&!rate.includes(token),'rate storage hashes capability context');
});
await test('participant authorization rejects spoofed owner, command and slot',async()=>{
 const f=fixture(),plan=await f.start(),token=plan.invites[0].token;
 await rejects(f.service.read(plan.id,{user:{id:OTHER}}),'PLAN_NOT_FOUND');
 await rejects(f.service.read(plan.id,{token:`${token.slice(0,-1)}!`}),'PLAN_NOT_FOUND');
 await rejects(f.service.command(plan.id,{id:commandId(4),type:'cancel'},{token}),'ACTION_NOT_ALLOWED');
 await rejects(f.service.command(plan.id,{id:commandId(5),type:'respond',slotId:plan.invitees[1].id,placeId:'original',availableTimeIds:[]},{token}),'ACTION_NOT_ALLOWED');
 await rejects(f.service.command(plan.id,{id:'invalid',type:'respond',slotId:plan.invitees[0].id},{token}),'INVALID_COMMAND_ID');
 await rejects(f.respond(plan,0,6,{placeId:'forged'}),'INVALID_PLACE');
 const guest=await f.service.read(plan.id,{token}),body=JSON.stringify(guest);
 eq(guest.role,'participant','capability role');eq(guest.invitee.name,'Alice Private','own name only');
 for(const privateText of ['Bob Private',OWNER,'invite_secret','recentCommands','emailConsent','invites'])yes(!body.includes(privateText),`participant response excludes ${privateText}`);
});
await test('concurrent responses CAS-retry without lost votes and idempotent notices',async()=>{
 const f=fixture(),plan=await f.start();const [a,b]=await Promise.all([f.respond(plan,0,10),f.respond(plan,1,11)]);
 const row=f.records.get(plan.id);eq(row.state.status,'closed','last complete response closes');eq(row.state.invitees.filter(s=>s.response).length,2,'both raced replies retained');
 eq(row.revision,4,'only two successful response revisions');yes(f.casCalls.filter(c=>c.operation==='respond').length>=2,'CAS actually attempted');
 eq(f.notices.filter(n=>n.event_type==='voting_closed').length,1,'one durable close notice');eq(f.notices[0].email_status,'not_requested','in-app close without email config');
 const before=row.revision,again=await f.respond(plan,0,10);eq(again.revision,before,'same action retry does not add vote/revision');
 await rejects(f.respond(plan,0,10,{placeId:'alternative'}),'COMMAND_ID_CONFLICT');
 await rejects(f.respond(plan,0,12,{expectedRevision:2}),'REVISION_CONFLICT');
 yes([a.status,b.status].includes('closed'),'at least the final responding caller sees terminal outcome');
});
await test('bounded CAS retries never claim a response was saved',async()=>{
 const f=fixture(),plan=await f.start();f.hook=async()=>({conflict:true});
 await rejects(f.respond(plan,0,95),'PLAN_BUSY');
 eq(f.casCalls.filter(c=>c.operation==='respond').length,3,'exact bounded CAS attempts');
 eq(f.records.get(plan.id).state.invitees[0].response,null,'inconclusive races never create a vote');
 const before=f.records.get(plan.id).revision;f.hook=null;f.repository.rateLimit=async()=>{throw Object.assign(new Error('Limited'),{code:'RATE_LIMITED',status:429});};
 await rejects(f.respond(plan,0,96),'RATE_LIMITED');eq(f.records.get(plan.id).revision,before,'rate-limited action makes no mutation');
});
await test('participant CAS retry rechecks a concurrently revoked capability',async()=>{
 const f=fixture(),plan=await f.start();let raced=false;
 f.hook=async({operation})=>{if(operation==='respond'&&!raced){raced=true;const row=f.records.get(plan.id),state=applyGroupPlanCommand(row.state,{id:commandId(97),type:'cancel'},{now:new Date(f.time).toISOString()});f.records.set(row.id,{...row,state,status:state.status,revision:state.revision});return {conflict:true};}return null;};
 await rejects(f.respond(plan,0,94),'PLAN_NOT_FOUND');eq(f.records.get(plan.id).state.invitees[0].response,null,'revoked participant cannot save after CAS retry');
});
await test('server deadline crossing prevents late vote and closes exactly once',async()=>{
 const f=fixture(),plan=await f.start();let crossed=false;
 f.hook=async({operation})=>{if(operation==='respond'&&!crossed){crossed=true;f.time=DEADLINE;return {conflict:true};}return null;};
 await rejects(f.respond(plan,0,20),'PLAN_NOT_OPEN');const row=f.records.get(plan.id);
 eq(row.status,'closed','retry settles at exact server deadline');eq(row.state.closeReason,'deadline','honest closure cause');eq(row.state.closedAt,new Date(DEADLINE).toISOString(),'recorded deadline instant');eq(row.state.invitees[0].response,null,'late vote not saved');
 eq(f.notices.length,1,'race closure emits one durable notice');
 const before=row.revision,result=await f.service.command(plan.id,{id:commandId(21),type:'close',expectedRevision:1},{user:f.user});eq(result.revision,before,'already-closed close is no-op against SQL transition model');
});
await test('read rechecks a capability after raced cancellation during settlement',async()=>{
 const f=fixture(),plan=await f.start();f.time=DEADLINE;let raced=false;
 f.hook=async({operation})=>{
  if(operation==='settle'&&!raced){
   raced=true;const row=f.records.get(plan.id),state=applyGroupPlanCommand(row.state,{id:commandId(98),type:'cancel'},{now:new Date(f.time).toISOString()});
   f.records.set(row.id,{...row,state,status:state.status,revision:state.revision});return {conflict:true};
  }return null;
 };
 await rejects(f.service.read(plan.id,{token:plan.invites[0].token}),'PLAN_NOT_FOUND');
});
await test('finalization replay survives source outage and newly unavailable place is rejected',async()=>{
 const f=fixture(),plan=await f.start();await f.respond(plan,0,80);await f.respond(plan,1,81);
 const command={id:commandId(82),type:'finalize',placeId:'original',timeId:plan.times[0].id};
 const finalized=await f.service.command(plan.id,command,{user:f.user}),revision=finalized.revision;
 f.failHydrate=true;const replay=await f.service.command(plan.id,command,{user:f.user});eq(replay.revision,revision,'successful finalize replay is not dependent on new facts');eq(replay.placeDataUnavailable,true,'replay view marks source outage');
 const stale=fixture(),other=await stale.start();await stale.respond(other,0,83);await stale.respond(other,1,84);
 stale.placeData.hydrate=async(ids)=>ids.map(id=>({id,name:'Unavailable',unavailable:true,status:'CLOSED_PERMANENTLY'}));
 await rejects(stale.service.command(other.id,{id:commandId(85),type:'finalize',placeId:'original',timeId:other.times[0].id},{user:stale.user}),'PLACE_UNAVAILABLE');
 eq(stale.records.get(other.id).status,'closed','rejected final place does not finalize');
});
await test('deadline read, cancel and final link authority',async()=>{
 const f=fixture(),plan=await f.start();f.time=DEADLINE;
 const expired=await f.service.read(plan.id,{token:plan.invites[0].token});eq(expired.status,'closed','participant read settles');
 const finalized=await f.service.command(plan.id,{id:commandId(30),type:'finalize',placeId:'original',timeId:plan.times[0].id,acknowledgePartial:true,acknowledgeUnavailable:true},{user:f.user});
 eq(finalized.finalPlan.isCommonTime,false,'partial final is not everyone');yes(finalized.finalToken,'organizer receives bounded final capability');
 const row=f.records.get(plan.id);eq(verifyFinalCapability(row.state,finalized.finalToken,row.invite_secret,f.time),true,'healthy final token');eq(verifyFinalCapability(row.state,finalized.finalToken,row.invite_secret,NOW+120*DAY+1),false,'expired final token');
 const publicFinal=await f.service.read(plan.id,{finalToken:finalized.finalToken});eq(publicFinal.role,'final','final link view');
 yes(!JSON.stringify(publicFinal).includes('Alice Private')&&!JSON.stringify(publicFinal).includes('Bob Private'),'final bearer link excludes every guest name');
 await rejects(f.service.command(plan.id,{id:commandId(31),type:'cancel'},{finalToken:finalized.finalToken}),'ACTION_NOT_ALLOWED');
 const c=fixture(),cancelPlan=await c.start();await c.service.command(cancelPlan.id,{id:commandId(32),type:'cancel'},{user:c.user});
 await rejects(c.service.read(cancelPlan.id,{token:cancelPlan.invites[0].token}),'PLAN_NOT_FOUND');
 c.time=NOW+120*DAY;await rejects(c.service.read(cancelPlan.id,{user:c.user}),'PLAN_NOT_FOUND');
});
await test('venue hours are separate from attendee availability and known closures cannot be overridden',async()=>{
 const f=fixture(),plan=await f.start();await f.respond(plan,0,110);await f.respond(plan,1,111);
 f.placeData.hydrate=async(ids)=>ids.map(id=>({id,name:'Unknown venue hours',status:'OPERATIONAL',openTimeIds:[],closedTimeIds:[],unverifiedTimeIds:plan.times.map(t=>t.id),hoursStatus:'unverified',hoursNote:'Hours not verified for this time. Check with the venue before confirming.'}));
 const command={id:commandId(112),type:'finalize',placeId:'original',timeId:plan.times[0].id};
 await rejects(f.service.command(plan.id,command,{user:f.user}),'VENUE_HOURS_CHECK_REQUIRED');eq(f.records.get(plan.id).status,'closed','missing venue acknowledgment cannot persist finalization');
 const final=await f.service.command(plan.id,{...command,acknowledgeVenueHours:true},{user:f.user});
 eq(final.finalPlan.isCommonTime,true,'everyone attendee availability stays true independently of venue-hour uncertainty');eq(final.finalPlan.acknowledgeVenueHours,true,'explicit venue-hour checkbox retained');eq(final.finalPlan.venueHoursStatus,'organizer_checked','venue-hours evidence is labeled honestly');
 const unavailable=fixture(),partial=await unavailable.start();await unavailable.respond(partial,0,113);await unavailable.respond(partial,1,114,{availableTimeIds:[]});
 unavailable.placeData.hydrate=async(ids)=>ids.map(id=>({id,name:'Unknown venue hours',status:'OPERATIONAL',openTimeIds:[],closedTimeIds:[]}));
 await rejects(unavailable.service.command(partial.id,{id:commandId(115),type:'finalize',placeId:'original',timeId:partial.times[0].id,acknowledgeVenueHours:true},{user:unavailable.user}),'AVAILABILITY_ACKNOWLEDGMENT_REQUIRED');
 const closed=fixture(),closedPlan=await closed.start();await closed.respond(closedPlan,0,116);await closed.respond(closedPlan,1,117);
 closed.placeData.hydrate=async(ids)=>ids.map(id=>({id,name:'Known closed venue',status:'OPERATIONAL',openTimeIds:[],closedTimeIds:[closedPlan.times[0].id]}));
 await rejects(closed.service.command(closedPlan.id,{id:commandId(118),type:'finalize',placeId:'original',timeId:closedPlan.times[0].id,acknowledgeVenueHours:true,acknowledgeUnavailable:true},{user:closed.user}),'VENUE_CLOSED');eq(closed.records.get(closedPlan.id).status,'closed','known venue closure cannot be overridden by acknowledgments');
});
await test('hydration outage is visible and leaves stored options untouched',async()=>{
 const f=fixture(),plan=await f.start();f.failHydrate=true;
 const guest=await f.service.read(plan.id,{token:plan.invites[0].token});eq(guest.placeDataUnavailable,true,'explicit source error');yes(guest.places.every(p=>p.unavailable===true),'neutral fallback labels only');
 eq(f.records.get(plan.id).state.places[0].name,'Original idea','no cache facts persisted into options');
});
await test('deadline sweep and notices are bounded, owner-scoped and non-delivering',async()=>{
 const f=fixture(),plan=await f.start();f.time=DEADLINE;
 eq(await f.service.sweepDeadlines(),{checked:1,closed:1,failed:0,deferred:0,mayHaveMore:false},'actual memory sweep closes due plan');
 eq(await f.service.sweepDeadlines(),{checked:0,closed:0,failed:0,deferred:0,mayHaveMore:false},'already closed is absent from due sweep');
 const mine=await f.service.notices(f.user);eq(mine.notices.length,1,'owner result notice');eq(mine.plans[0].id,plan.id,'owner result plan');
 eq((await f.service.notices({id:OTHER})).notices,[],'other owner sees no notices');
});
await test('HTTP privacy headers and disabled real route handlers',async()=>{
 const response=groupReply({ok:true});eq(response.headers.get('cache-control'),'private, no-store','no browser/CDN plan cache');eq(response.headers.get('referrer-policy'),'no-referrer','token/link privacy');eq(response.headers.get('x-content-type-options'),'nosniff','explicit content type');
 const logs=[],oldError=console.error;console.error=(...values)=>logs.push(values.join(' '));let unknown;try{unknown=groupFailure(new Error('private-provider-secret'));}finally{console.error=oldError;}eq(unknown.status,503,'unknown provider error becomes unavailable');yes(!JSON.stringify(await unknown.json()).includes('private-provider-secret')&&!logs.join(' ').includes('private-provider-secret'),'unknown errors never expose raw provider details');
 const known=groupFailure(Object.assign(new Error('Safe visible denial'),{code:'ACTION_NOT_ALLOWED',status:403}));eq(known.status,403,'classified action error');eq((await known.json()).error,'ACTION_NOT_ALLOWED','classification not hidden');
 process.env.WF_GROUP_PLANS_ENABLED='0';
 try{
  const root=await import('../app/api/group-plans/route.js'),item=await import('../app/api/group-plans/[id]/route.js');
  const req=()=>new Request('https://wayfind.example/api/group-plans',{method:'POST',headers:{origin:'https://wayfind.example','content-type':'application/json'},body:'{"action":"create"}'});
  const create=await root.POST(req());eq(create.status,503,'release-off create handler');eq((await create.json()).error,'GROUP_PLANS_DISABLED','honest feature-off result');
  const read=await item.POST(req(),{params:Promise.resolve({id:OWNER})});eq(read.status,503,'release-off read handler');
 }finally{delete process.env.WF_GROUP_PLANS_ENABLED;}
});
await test('real deadline worker authorization is fail closed',async()=>{
 process.env.WF_GROUP_PLANS_ENABLED='0';process.env.WF_GROUP_PLAN_WORKER_ENABLED='0';
 const {GET}=await import('../app/api/cron/group-plans/route.js');
 try {
  delete process.env.CRON_SECRET;
  eq((await GET(new Request('https://wayfind.example/api/cron/group-plans'))).status,401,'missing secret never opens cron');
  process.env.CRON_SECRET='test-secret';
  eq((await GET(new Request('https://wayfind.example/api/cron/group-plans',{headers:{authorization:'Bearer wrong-value'}}))).status,401,'wrong bearer denied');
  eq((await GET(new Request('https://wayfind.example/api/cron/group-plans',{headers:{authorization:'Bearer tést-secret'}}))).status,401,'multibyte wrong bearer cannot throw a timing-safe length error');
  eq((await GET(new Request('https://wayfind.example/api/cron/group-plans',{headers:{authorization:'Bearer test-secret'}}))).status,503,'valid auth still respects disabled rollout');
 }finally{delete process.env.CRON_SECRET;delete process.env.WF_GROUP_PLANS_ENABLED;delete process.env.WF_GROUP_PLAN_WORKER_ENABLED;}
});
await test('hidden authenticated worker can be verified without enabling public plans or permanent cleanup',async()=>{
 const keys=['WF_GROUP_PLAN_WORKER_ENABLED','WF_GROUP_PLANS_ENABLED','NEXT_PUBLIC_GROUP_PLANS_ENABLED','WF_GROUP_PLAN_DEADLINE_WORKER_READY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET','WF_GROUP_PLAN_EMAIL_ENABLED','WF_GROUP_PLAN_CLEANUP_ENABLED'];
 process.env.WF_GROUP_PLAN_WORKER_ENABLED='1';process.env.WF_GROUP_PLANS_ENABLED='0';process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED='0';process.env.WF_GROUP_PLAN_DEADLINE_WORKER_READY='0';
 process.env.SUPABASE_URL='https://group-bootstrap.example';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service-only';process.env.CRON_SECRET='fixture-cron-only';process.env.WF_GROUP_PLAN_EMAIL_ENABLED='0';delete process.env.WF_GROUP_PLAN_CLEANUP_ENABLED;
 const originalFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});if(url.includes('/rpc/wf_group_plan_cleanup'))return Response.json({expired_plans_removed:0,old_limits_removed:0});if(url.includes('/rest/v1/wf_group_plans?status=eq.open'))return Response.json([]);throw new Error('Unexpected bootstrap network request');};
 try {
  const {GET}=await import('../app/api/cron/group-plans/route.js'),root=await import('../app/api/group-plans/route.js');
  const req=()=>new Request('https://wayfind.example/api/cron/group-plans',{headers:{authorization:'Bearer fixture-cron-only'}});
  eq((await GET(new Request('https://wayfind.example/api/cron/group-plans'))).status,401,'hidden worker still requires scheduler authentication');eq(calls.length,0,'unauthenticated scheduler request never reaches storage');
  const first=await GET(req());eq(first.status,200,'server-only scheduler verification succeeds before public rollout');const body=await first.json();eq(body.checked,0,'real worker path queried empty due roster');eq(body.maintenance,{enabled:false},'cleanup is explicitly disabled by default');eq(body.email.enabled,false,'email remains independently disabled');eq(calls.length,1,'no cleanup or external email call during bootstrap');
  const publicReq=new Request('https://wayfind.example/api/group-plans',{method:'POST',headers:{origin:'https://wayfind.example','content-type':'application/json'},body:'{"action":"create"}'});
  const publicResult=await root.POST(publicReq);eq(publicResult.status,503,'public create remains disabled during hidden verification');eq((await publicResult.json()).error,'GROUP_PLANS_DISABLED','hidden worker does not bypass the public API gate');
  process.env.WF_GROUP_PLANS_ENABLED='1';process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED='1';rejectSync(()=>groupPlanConfiguration(),'DEADLINE_WORKER_UNVERIFIED');
  process.env.WF_GROUP_PLAN_CLEANUP_ENABLED='true';eq((await (await GET(req())).json()).maintenance.enabled,false,'truthy text cannot enable permanent cleanup');
  process.env.WF_GROUP_PLAN_CLEANUP_ENABLED='1';eq((await (await GET(req())).json()).maintenance,{enabled:true,expired_plans_removed:0,old_limits_removed:0},'explicit retention enablement reaches cleanup RPC');eq(calls.filter(x=>x.url.includes('wf_group_plan_cleanup')).length,1,'exactly one separately enabled cleanup operation');
  process.env.WF_GROUP_PLAN_WORKER_ENABLED='0';eq((await GET(req())).status,503,'worker kill switch stops authenticated scheduler');
 } finally {globalThis.fetch=originalFetch;for(const key of keys)delete process.env[key];}
});
await test('50-plan worker batch respects shared abort budget and resumes without losing notices',async()=>{
 const f=fixture(),plan=await f.start(),template=clone(f.records.get(plan.id));f.records.clear();
 for(let i=0;i<50;i++){const id=`77777777-7777-4777-8777-${String(i).padStart(12,'0')}`,row=clone(template);row.id=id;row.state.id=id;f.records.set(id,row);}
 f.time=DEADLINE;
 const baseGet=f.repository.get;let fetchCalls=0,abortEvents=0;
 const createRuntime=({worker,fetchImpl})=>{
  yes(worker,'worker runtime mode is explicit');
  f.repository.get=async(id)=>{await fetchImpl(`https://worker-fixture.example/plans/${id}`,{signal:AbortSignal.timeout(8000)});return baseGet(id);};
  return {service:f.service,repository:f.repository,config:{url:'https://worker-fixture.example',key:'fixture-key'}};
 };
 const slowFetch=async(_url,{signal})=>{fetchCalls++;yes(signal instanceof AbortSignal,'shared deadline reaches actual network seam');if(fetchCalls>1)return Response.json({});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture provider timeout')),2000);const abort=()=>{clearTimeout(timer);abortEvents++;reject(signal.reason);};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});};
 const started=performance.now();const partial=await runGroupPlanWorker({createRuntime,env:{},fetchImpl:slowFetch,budgetMs:35});const elapsed=performance.now()-started;
 yes(elapsed<500,'shared budget prevents 50 per-request waits from exceeding the route ceiling');eq(abortEvents,1,'in-flight fetch is aborted, not merely abandoned in a Promise.race');eq(fetchCalls,1,'no new network work starts after budget expires');eq(partial.checked,1,'only attempted plan counted');eq(partial.failed,1,'unconfirmed attempted plan is a visible failure');eq(partial.deferred,49,'all unattempted plans remain explicit');eq(partial.mayHaveMore,true,'remaining batch is not called complete');eq(partial.ok,false,'budget exhaustion is not an OK worker result');eq(partial.budgetExhausted,true,'bounded stop is visible');eq(partial.maintenance.enabled,false,'timeout never enables deletion');eq(f.notices.length,0,'uncommitted timeout cannot invent a notice');
 const complete=await runGroupPlanWorker({createRuntime,env:{},fetchImpl:async()=>Response.json({})});eq(complete.closed,50,'healthy retry closes the entire intended batch');eq(complete.deferred,0,'healthy retry attempts every row');eq(complete.ok,true,'healthy batch is successful');eq(f.notices.length,50,'exactly one notice per plan after retry');
 const again=await runGroupPlanWorker({createRuntime,env:{},fetchImpl:async()=>Response.json({})});eq(again.checked,0,'already closed plans are absent next tick');eq(f.notices.length,50,'next tick cannot duplicate completion notices');
});
await test('Canonical migration structural review only, not execution evidence',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261004232233_wf_group_planning.sql',import.meta.url),'utf8');
 yes(sql.length>5000&&sql.includes('approval and reconciliation before production'),'nonempty explicit activation gate');
 for(const table of ['wf_group_plans','wf_group_plan_notices','wf_group_plan_limits'])yes(sql.includes(`alter table public.${table} enable row level security`),`${table} RLS enabled`);
 yes(sql.includes('from public,anon,authenticated')&&sql.includes('to service_role'),'public access revoked, service role scoped');
 yes(sql.includes('for update')&&sql.includes('p_expected_revision')&&sql.includes("jsonb_build_object('error','conflict')"),'transactional row CAS design');
 yes(sql.includes('unique(owner_id,create_key)')&&sql.includes('pg_advisory_xact_lock'),'owner-create idempotency concurrency design');
 yes(sql.includes('unique(plan_id,event_type)')&&sql.includes('on conflict(plan_id,event_type) do nothing'),'deduplicated notices design');
 yes(sql.includes('clock_timestamp()>=row.deadline'),'authoritative database exact-deadline gate');
 yes(sql.includes('pending_configuration'),'no fabricated external email delivery');
});
if(failures.length){console.error(`test-group-plan-service: ${count} assertions passed; ${failures.length} groups failed`);process.exit(1);}
console.log(`test-group-plan-service: ${count} assertions passed (fake CAS/fetch; SQL not executed)`);
