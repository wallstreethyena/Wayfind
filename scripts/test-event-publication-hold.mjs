import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { isPendingEventPageRow, pendingEventPageRow } from "../lib/eventPublicationHold.js";
import { fetchCuratedEventBySlug, isEligible, eventJsonLd } from "../lib/curatedEvents.js";
import { christmasEventPageRow } from "../lib/christmasEventPage.js";
import { reminderFactsFor } from "../lib/eventReminderFacts.js";

let assertions = 0;
const eq = (a,b) => { assert.deepEqual(a,b); assertions++; };
const held = { event_id:"santas-wonderland-festival-2026",slug:"santas-wonderland-festival-2026",year:2026,
  source_url:"https://santaswonderlandfestival.com",event_status:"unannounced",verification_confidence:"low",
  start_date:null,end_date:null,start_time:null,end_time:null,state:"FL",city:"Wimauma",source_tier:1,
  event_name:"Santa's Wonderland Festival",card_hook:"stale Dec 19 and 20, 2026",schedule_note:"stale Dec 19",editorial_summary:"second year" };
const mock = row => { const q = { select:()=>q,eq:()=>q,abortSignal:()=>q,retry:()=>q,maybeSingle:async()=>({data:row,error:null}) }; return {from:()=>q}; };
eq(isPendingEventPageRow(held),true);
eq((await fetchCuratedEventBySlug(held.slug,{db:mock(held)})).event_id,held.event_id);
const page = christmasEventPageRow(held,held.slug);
eq(page.christmas_watchlist,true);
eq(page.when_label,"2026 dates not confirmed yet");
eq(/Dec 19|Dec 20|second year/.test(JSON.stringify([page.card_hook,page.schedule_note,page.editorial_summary])),false);
eq(isEligible(held),false);
eq(eventJsonLd(page),null);
eq(reminderFactsFor(page),null);
eq(held.card_hook,"stale Dec 19 and 20, 2026"); // no input mutation
for (const patch of [{event_id:"another"},{slug:"another"},{source_url:"https://example.com"},{year:2027},
  {event_status:"cancelled"},{event_status:"paused"},{event_status:"postponed"},{start_date:"2026-12-19"},
  {end_date:"2026-12-20"},{start_time:"12:00"},{end_time:"13:00"},{verification_confidence:"medium"}]) {
  const row = {...held,...patch};
  eq(isPendingEventPageRow(row),false);
  eq(pendingEventPageRow(row),null);
  if (!["scheduled","sold_out"].includes(row.event_status)) eq(await fetchCuratedEventBySlug(row.slug,{db:mock(row)}),null);
}
const good = {...held,event_id:"healthy",slug:"healthy",event_status:"scheduled",verification_confidence:"high",start_date:"2026-12-19",end_date:"2026-12-20"};
eq((await fetchCuratedEventBySlug(good.slug,{db:mock(good)})).event_id,"healthy");
eq(isEligible(good,{now:new Date("2026-11-06T12:00:00Z")}),true);
eq(christmasEventPageRow(good,good.slug),good);
await assert.rejects(()=>fetchCuratedEventBySlug(held.slug,{db:{from(){throw new Error("permission denied")}}})); assertions++;

// Execute the complete committed migration payload in isolated PostgreSQL.
const sql = readFileSync(new URL("../supabase/migrations/20261106233000_santas_wonderland_dates_unconfirmed.sql",import.meta.url),"utf8");
const db = new PGlite();
await db.exec(`create table public.wf_events(event_id text primary key,slug text,year int,event_status text,verification_confidence text,
 start_date date,end_date date,start_time time,end_time time,select_nights boolean,last_verified_at timestamptz,recheck_on date,
 source_url text,official_event_url text,card_hook text,schedule_note text,recheck_reason text,editorial_summary text,verify_note text,
 check(event_status in ('scheduled','sold_out','unannounced','paused','cancelled','postponed','completed')),
 check(event_status not in ('scheduled','sold_out') or (start_date is not null and verification_confidence in ('medium','high'))),
 check(verification_confidence <> 'low' or (start_date is null and end_date is null)),
 check(start_date is not null or (start_time is null and end_time is null)));`);
const before = {...held,event_status:"scheduled",verification_confidence:"medium",start_date:"2026-12-19",end_date:"2026-12-20",select_nights:false,
 last_verified_at:"2026-10-22 09:01:58.73262+00",recheck_on:"2026-11-08",official_event_url:held.source_url,
 card_hook:"Santa's Wonderland Festival returns to Lake Wimauma Convention Center for its second year, Dec 19 and 20, 2026.",schedule_note:"Sat Dec 19 to Sun Dec 20, 2026",
 recheck_reason:"2026-11-06 SWEEP FAIL: organizer site still 2025-only",verify_note:"Prior organizer evidence: Dec 19-20, 2026"};
const columns = ["event_id","slug","year","event_status","verification_confidence","start_date","end_date","start_time","end_time","select_nights","last_verified_at","recheck_on","source_url","official_event_url","card_hook","schedule_note","recheck_reason","editorial_summary","verify_note"];
async function seed(patch={}) { await db.exec("truncate public.wf_events"); const r={...before,...patch}; await db.query(`insert into public.wf_events (${columns.join(",")}) values (${columns.map((_,i)=>"$"+(i+1)).join(",")})`,columns.map(k=>r[k])); }
await seed(); await db.exec(sql);
const after = (await db.query("select event_status,verification_confidence,start_date,end_date,start_time,end_time,recheck_on::text,last_verified_at::text,verify_note from public.wf_events")).rows[0];
eq(after.event_status,"unannounced"); eq(after.verification_confidence,"low");
for(const k of ["start_date","end_date","start_time","end_time"]) eq(after[k],null);
eq(after.recheck_on,"2026-11-08");
eq(after.last_verified_at,"2026-10-22 09:01:58.73262+00");
eq(after.verify_note.includes(before.verify_note),true);
eq(after.verify_note.includes("No cancellation inferred"),true);
await assert.rejects(()=>db.exec(sql),/re-review required/); assertions++;
for(const patch of [{source_url:"https://new-source.example"},{start_date:"2026-12-18"},{recheck_on:"2026-11-09"},
 {last_verified_at:"2026-11-06T23:00:00Z"},{card_hook:"fresh announcement"},{recheck_reason:"new evidence"}]) {
 await seed(patch); await assert.rejects(()=>db.exec(sql),/re-review required/); assertions++;
 eq((await db.query("select event_status from public.wf_events")).rows[0].event_status,"scheduled");
}
await db.close();
console.log(`test-event-publication-hold: OK — ${assertions} assertions (live-read fixtures and full isolated SQL payload)`);
