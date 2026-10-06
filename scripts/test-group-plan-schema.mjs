// Runtime PostgreSQL verification using an isolated in-memory PGlite database.
// This proves real SQL behavior, not hosted Supabase grants or multi-connection races.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createGroupPlan,applyGroupPlanCommand} from '../lib/groupPlan.js';
let count=0;
const ok=(value,label)=>{assert.ok(value,label);count++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);count++;};
const db=new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261004232233_wf_group_planning.sql',import.meta.url),'utf8'));
  count++;
  const owner=randomUUID(),other=randomUUID(),now=Date.parse((await db.query('select clock_timestamp() as now')).rows[0].now);
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  const make=(ownerId=owner)=>createGroupPlan({ownerId,organizerName:'Organizer',originalPlaceId:'place-one',places:[{id:'place-one',name:'Original idea'}],invitees:[{name:'Alex'},{name:'Sam'}],times:[{startsAt:new Date(now+3*86400000).toISOString(),endsAt:new Date(now+3*86400000+3600000).toISOString()}],deadline:new Date(now+86400000).toISOString(),timeZone:'America/New_York'},{id:randomUUID(),slotIds:[randomUUID(),randomUUID()],timeIds:[randomUUID()],now:new Date(now).toISOString()});
  const invoke=async(name,args)=>{
    const params=args.map((_v,i)=>`$${i+1}`).join(',');
    return (await db.query(`select public.${name}(${params}) as value`,args)).rows[0].value;
  };
  const create=async(state,key=randomUUID())=>invoke('wf_group_plan_create',[JSON.stringify(state),'a'.repeat(64),key,false]);
  const commit=async(state,next,operation)=>invoke('wf_group_plan_commit',[state.id,state.revision,JSON.stringify(next),operation]);
  const asRole=async(role,sql,params=[])=>{await db.exec(`begin;set local role ${role};`);try{const result=await db.query(sql,params);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}};
  const state=make(),key=randomUUID();
  const created=await create(state,key);eq(created.id,state.id,'actual SQL creates the right plan');eq(created.revision,1);eq(created.state.invitees.length,2);
  const retry=await create(make(),key);eq(retry.id,state.id,'same owner create key returns same plan');
  const separate=await create(make(other),key);ok(separate.id!==state.id,'create keys are scoped to owner');
  for(const role of ['anon','authenticated']) {
    await assert.rejects(()=>asRole(role,'select * from public.wf_group_plans'),/permission denied/i);count++;
    await assert.rejects(()=>asRole(role,'select * from public.wf_group_plan_notices'),/permission denied/i);count++;
    await assert.rejects(()=>asRole(role,'select public.wf_group_plan_rate_limit($1,10)',['b'.repeat(64)]),/permission denied/i);count++;
    await assert.rejects(()=>asRole(role,'select public.wf_group_plan_create($1,$2,$3,false)',[JSON.stringify(make()),'c'.repeat(64),randomUUID()]),/permission denied/i);count++;
  }
  const roleRead=await asRole('service_role','select id from public.wf_group_plans where id=$1',[state.id]);eq(roleRead.rows.length,1,'only server role can read');
  const tooMany=make();tooMany.invitees=Array.from({length:11},(_,i)=>({...tooMany.invitees[0],id:randomUUID(),name:`Friend ${i}`}));
  await assert.rejects(()=>create(tooMany),/check constraint/i);count++;
  const missing=make();delete missing.invitees;await assert.rejects(()=>create(missing),/check constraint/i);count++;
  const open=applyGroupPlanCommand(state,{id:randomUUID(),type:'start'},{now:new Date(now).toISOString()});
  const opened=await commit(state,open,'start');eq(opened.status,'open');eq(opened.revision,2);
  const stale=await commit(state,open,'start');eq(stale.error,'conflict','stale CAS cannot duplicate a change');
  const altered={...open,revision:3,places:[{id:'forged',name:'Other place'}]};eq((await commit(open,altered,'respond')).error,'immutable');
  const first=applyGroupPlanCommand(open,{id:randomUUID(),type:'respond',slotId:open.invitees[0].id,placeId:'place-one',availableTimeIds:[open.times[0].id]},{now:new Date(now).toISOString()});
  eq((await commit(open,first,'respond')).status,'open');
  const close=applyGroupPlanCommand(first,{id:randomUUID(),type:'respond',slotId:first.invitees[1].id,placeId:'place-one',availableTimeIds:[first.times[0].id]},{now:new Date(now).toISOString()});
  eq((await commit(first,close,'respond')).status,'closed');
  eq((await db.query('select count(*)::int as n from public.wf_group_plan_notices where plan_id=$1',[state.id])).rows[0].n,1,'closing saves one durable notice');
  eq((await commit(first,close,'respond')).error,'conflict');
  eq((await db.query('select count(*)::int as n from public.wf_group_plan_notices where plan_id=$1',[state.id])).rows[0].n,1,'retry cannot add another notice');
  const finalized=applyGroupPlanCommand(close,{id:randomUUID(),type:'finalize',placeId:'place-one',timeId:close.times[0].id},{now:new Date(now).toISOString()});
  eq((await commit(close,finalized,'finalize')).status,'finalized');
  eq((await db.query('select count(*)::int as n from public.wf_group_plan_notices where plan_id=$1',[state.id])).rows[0].n,2);
  const late=make();await create(late);const lateOpen=applyGroupPlanCommand(late,{id:randomUUID(),type:'start'},{now:new Date(now).toISOString()});await commit(late,lateOpen,'start');
  const expired=new Date(now-1000).toISOString();await db.query(`update public.wf_group_plans set deadline=$2::text::timestamptz,state=jsonb_set(state,'{deadline}',to_jsonb($2::text)) where id=$1`,[late.id,expired]);
  const reply=applyGroupPlanCommand(lateOpen,{id:randomUUID(),type:'respond',slotId:lateOpen.invitees[0].id,placeId:'place-one',availableTimeIds:[]},{now:new Date(now).toISOString()});
  eq((await commit(lateOpen,reply,'respond')).error,'deadline','database server time rejects late response even if app used an earlier clock');
  for(let i=0;i<3;i++)eq(await invoke('wf_group_plan_rate_limit',['b'.repeat(64),2]),i<2);
  const flags=await db.query(`select relname,relrowsecurity from pg_class where relname in ('wf_group_plans','wf_group_plan_notices','wf_group_plan_limits')`);eq(flags.rows.length,3);ok(flags.rows.every((r)=>r.relrowsecurity),'all tables enable RLS');
  const defs=await db.query(`select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wf_group_plan_%'`);ok(defs.rows.every((r)=>r.prosecdef===false),'no SECURITY DEFINER bypass');
  const emailPlan=make();await invoke('wf_group_plan_create',[JSON.stringify(emailPlan),'e'.repeat(64),randomUUID(),true]);
  let emailState=emailPlan;
  for(const command of [{id:randomUUID(),type:'start'},...emailPlan.invitees.map((slot)=>({id:randomUUID(),type:'respond',slotId:slot.id,placeId:'place-one',availableTimeIds:[]}))]){const next=applyGroupPlanCommand(emailState,command,{now:new Date(now).toISOString()});await commit(emailState,next,command.type);emailState=next;}
  const claim=randomUUID(),notice=await invoke('wf_group_plan_claim_notice',[claim]);ok(notice&&notice.email_consent);eq(notice.email_status,'attempted');eq(notice.attempts,1);
  eq(await invoke('wf_group_plan_claim_notice',[randomUUID()]),null,'active lease excludes another worker');
  eq(await invoke('wf_group_plan_finish_notice',[notice.id,randomUUID(),'provider_accepted',null]),false,'wrong claim cannot acknowledge');
  eq(await invoke('wf_group_plan_finish_notice',[notice.id,claim,'failed','provider_unconfirmed']),true);
  eq(await invoke('wf_group_plan_claim_notice',[randomUUID()]),null,'backoff prevents immediate retry');
  await db.query("update public.wf_group_plan_notices set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[notice.id]);
  const claim2=randomUUID(),retryNotice=await invoke('wf_group_plan_claim_notice',[claim2]);eq(retryNotice.id,notice.id);eq(retryNotice.attempts,2);
  eq(await invoke('wf_group_plan_finish_notice',[notice.id,claim2,'provider_accepted',null]),true);eq(await invoke('wf_group_plan_claim_notice',[randomUUID()]),null,'accepted notice is never retried');
  const beforeCleanup=(await db.query('select count(*)::int as n from public.wf_group_plans')).rows[0].n;
  eq((await invoke('wf_group_plan_cleanup',[])).expired_plans_removed,0,'retention never removes active plans');
  const oldDeadline=new Date(now-86400000).toISOString(),oldCreated=new Date(now-120*86400000).toISOString(),oldExpiry=new Date(now-1000).toISOString();
  await db.query(`update public.wf_group_plans set created_at=$2::timestamptz,deadline=$3::text::timestamptz,expires_at=$4::timestamptz,state=jsonb_set(state,'{deadline}',to_jsonb($3::text)) where id=$1`,[state.id,oldCreated,oldDeadline,oldExpiry]);
  eq((await invoke('wf_group_plan_cleanup',[])).expired_plans_removed,1,'only the expired plan is removed');
  eq((await db.query('select count(*)::int as n from public.wf_group_plans')).rows[0].n,beforeCleanup-1,'other plans remain');
  eq((await db.query('select count(*)::int as n from public.wf_group_plan_notices where plan_id=$1',[state.id])).rows[0].n,0,'expired plan notices are removed with it');
  console.log(`test-group-plan-schema: ${count} assertions passed on embedded PostgreSQL; hosted and multi-connection checks remain separate`);
} finally {await db.close();}
