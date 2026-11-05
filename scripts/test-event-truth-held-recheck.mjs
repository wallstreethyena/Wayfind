#!/usr/bin/env node
// Execute the COMPLETE committed held-recheck migrations in isolated PostgreSQL (PGlite).
// The baseline functions below were read from production on 2026-11-05; their originals
// are production-only historical exceptions. No credentials, network or event data used.
// Positive controls keep earlier deadlines, status/dates, and excluded row classes intact.
// Each historical-defect mutation runs this same suite as a child and MUST exit nonzero.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const FLOOR = "supabase/migrations/20261104150000_event_truth_held_recheck_floor.sql";
const GUARD = "supabase/migrations/20261105120000_event_truth_held_recheck_guard.sql";
const CAP = "supabase/migrations/20261105120035_event_truth_held_recheck_renewal_cap.sql";
const baseline = String.raw`
CREATE OR REPLACE FUNCTION public.wf_event_truth_integrity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with today as (select (now() at time zone 'America/New_York')::date d),
disp as (
  select e.*, split_part(coalesce(e.verify_note,''),' || ',1) as latest_note
  from wf_events e where e.event_status in ('scheduled','sold_out')
),
chk as (
  select 'ended_displayable'::text k, event_id from disp, today where coalesce(end_date,start_date) < today.d
  union all select 'never_verified', event_id from disp where last_verified_at is null
  union all select 'missing_source_url', event_id from disp where source_url is null
  union all select 'recheck_overdue', event_id from disp, today where recheck_on < today.d
  union all select 'id_year_mismatch', event_id from disp
     where event_id ~ '-20[0-9]{2}$' and right(event_id,4)::int <> extract(year from start_date)::int
  union all select 'timezone_mismatch', event_id from disp
     where (lower(coalesce(county,'')) in ('escambia','santa rosa','okaloosa','walton','holmes','washington','bay','jackson','calhoun')
            and timezone is distinct from 'America/Chicago')
        or (timezone = 'America/Chicago' and county is not null
            and lower(county) not in ('escambia','santa rosa','okaloosa','walton','holmes','washington','bay','jackson','calhoun','gulf'))
  union all select 'overnight_unexplained', event_id from disp
     where start_time is not null and end_time is not null and end_time < start_time
       and (end_date is null or end_date = start_date)
       and coalesce(schedule_note,'') !~* '(\m(1[0-2]|[1-9])\s*a\.?m\.?|midnight)'
  union all select 'note_end_time_mismatch', event_id from disp
     where end_time >= time '12:00'
       and (end_date is null or end_date = start_date or schedule_note ~* 'both days|each day|daily|nightly')
       and substring(coalesce(schedule_note,'') from '(?i)(?:to|until|-|–)\s*(1[0-2]|[1-9])(?::[0-5][0-9])?\s*(?:pm|p\.m\.)') is not null
       and substring(schedule_note from '(?i)(?:to|until|-|–)\s*(1[0-2]|[1-9])(?::[0-5][0-9])?\s*(?:pm|p\.m\.)')::int % 12 + 12 <> extract(hour from end_time)::int
  union all select 'setup_or_private_day_mention', event_id from disp
     where (coalesce(schedule_note,'') || ' ' || latest_note) ~* '(set[- ]?up day|load[- ]in|drop[- ]off|members[- ]only|member preview|private (event|preview)|preview night|invitation only|vip[- ]only)'
       and coalesce(schedule_note,'') !~* 'not open to the public' and recheck_on is null
  union all select 'conflict_without_recheck', event_id from disp
     where latest_note ~* '(conflict:|\munresolved\M|conflicts with|\mcontradicts\M)' and recheck_on is null
  union all select 'stale_year_in_copy', event_id from disp
     where start_date is not null and exists (
       select 1 from regexp_matches(coalesce(card_hook,'') || ' ' || coalesce(schedule_note,''), '\m(20[0-9]{2})\M(?![-–/][0-9]{2})', 'g') m(y)
       where m.y[1]::int < extract(year from start_date)::int)
  union all select 'duplicate_name_date', unnest(ids) from (
       select array_agg(event_id) ids from disp
       group by lower(regexp_replace(event_name,'[^a-zA-Z0-9]','','g')), start_date having count(*) > 1) d
  union all select 'duplicate_url_overlap', x from (
       select unnest(array[a.event_id, b.event_id]) x from disp a join disp b
         on a.event_id < b.event_id and a.official_event_url = b.official_event_url
        and daterange(a.start_date, coalesce(a.end_date,a.start_date), '[]') && daterange(b.start_date, coalesce(b.end_date,b.start_date), '[]')
        and lower(regexp_replace(a.event_name,'[^a-zA-Z0-9]','','g')) = lower(regexp_replace(b.event_name,'[^a-zA-Z0-9]','','g'))) u
)
select jsonb_build_object(
  'checked_at', now(),
  'today_et', (select d from today),
  'displayable', (select count(*) from disp),
  'total_flags', (select count(distinct (k, event_id)) from chk),
  'counts', coalesce((select jsonb_object_agg(k, n) from (select k, count(distinct event_id) n from chk group by k) c), '{}'::jsonb),
  'ids', coalesce((select jsonb_object_agg(k, ids) from (select k, (array_agg(distinct event_id order by event_id))[1:25] ids from chk group by k) c), '{}'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.wf_event_truth_integrity_enforce()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r jsonb := wf_event_truth_integrity();
  v_today date := (now() at time zone 'America/New_York')::date;
  v_tz int := 0; v_re int := 0;
begin
  -- (a) timezone from county, same list as the app (lib/eventTime.js FL_CENTRAL_COUNTIES); Gulf (split) never auto-set.
  with fixed as (
    update wf_events set timezone = case when lower(county) in ('escambia','santa rosa','okaloosa','walton','holmes','washington','bay','jackson','calhoun')
                                         then 'America/Chicago' else 'America/New_York' end,
           verify_note = to_char(v_today,'YYYY-MM-DD') || ' integrity: timezone set from county (' || county || ') || ' || coalesce(verify_note,'')
     where event_id in (select jsonb_array_elements_text(coalesce(r->'ids'->'timezone_mismatch','[]'::jsonb)))
       and county is not null and lower(county) <> 'gulf'
    returning 1)
  select count(*) into v_tz from fixed;

  -- (b) additive structured recheck (queue class 8) for flagged rows with none; at most once per row per 7 days.
  with flagged as (
    select k, jsonb_array_elements_text(r->'ids'->k) as event_id
      from unnest(array['conflict_without_recheck','setup_or_private_day_mention','overnight_unexplained',
                        'note_end_time_mismatch','stale_year_in_copy','missing_source_url','duplicate_name_date',
                        'duplicate_url_overlap','id_year_mismatch']) k
     where r->'ids' ? k),
  agg as (select event_id, string_agg(k, ',' order by k) ks from flagged group by event_id),
  upd as (
    update wf_events w set recheck_on = v_today + 1,
           recheck_reason = 'integrity: ' || a.ks || ' (auto-scheduled ' || to_char(v_today,'YYYY-MM-DD') || ')',
           recheck_set_at = now()
      from agg a where w.event_id = a.event_id and w.recheck_on is null
       and (w.recheck_set_at is null or w.recheck_set_at < now() - interval '7 days')
    returning 1)
  select count(*) into v_re from upd;

  return jsonb_build_object('at', now(), 'timezone_fixed', v_tz, 'rechecks_scheduled', v_re, 'scan', r->'counts');
end $function$;
`;

const mutation = process.argv.find((a) => a.startsWith("--mutation="))?.split("=")[1];
assert.ok(!mutation || ["drop-floor", "drop-guard", "allow-postpone", "renew-late", "remove-cap"].includes(mutation), "known mutation");
const db = new PGlite();
let checks = 0;
const ok = (v, message) => { assert.ok(v, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const snapshot = async (id) => one("select * from wf_events where event_id=$1", [id]);
async function seed(id, status, offset, recheckOffset = null) {
  await db.query(
    "insert into wf_events(event_id,event_name,event_status,start_date,end_date,recheck_on,recheck_reason,recheck_set_at) " +
    "values($1,$1,$2,today_et()+$3::int,today_et()+$3::int,case when $4::int is null then null else today_et()+$4::int end,'original deadline',now()-interval '1 day')",
    [id, status, offset, recheckOffset]);
}
try {
  // Deliberately use a timezone other than ET. Compare SQL dates to avoid host
  // timezone conversion or fixtures that become incorrect at midnight UTC.
  await db.exec([
    "set timezone = 'Pacific/Honolulu';",
    "create role anon; create role authenticated;",
    "create function today_et() returns date language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;",
    "create table wf_events (event_id text primary key,event_name text,event_status text,start_date date,end_date date,start_time time,end_time time,timezone text,county text,last_verified_at timestamptz,source_url text,verify_note text,schedule_note text,card_hook text,official_event_url text,recheck_on date,recheck_reason text,recheck_set_at timestamptz);",
  ].join("\n"));
  await db.exec(baseline);
  await seed("held-missing", "unannounced", 40);
  await seed("held-existing", "uncertain", 40, 1);
  await seed("past", "postponed", -1);
  await seed("undated", "unannounced", null);
  await seed("displayable", "scheduled", 40, 1);

  const floor = read(FLOOR);
  if (mutation !== "drop-floor") await db.exec(floor);
  const report = (await one("select wf_event_truth_integrity() as result")).result;
  eq(report.ids.held_without_recheck, ["held-missing"], "floor flags only a dated future held row without its next check");
  const untouched = await Promise.all(["held-existing", "past", "undated", "displayable"].map(snapshot));
  const enforced = (await one("select wf_event_truth_integrity_enforce() as result")).result;
  eq(enforced.held_rechecks_scheduled, 1, "floor repairs the missing held deadline");
  ok((await one("select recheck_on = today_et()+2 as pass from wf_events where event_id='held-missing'")).pass, "floor schedules exactly ET today+2");
  eq(await Promise.all(["held-existing", "past", "undated", "displayable"].map(snapshot)), untouched, "floor preserves existing deadlines and excluded rows");
  const repaired = await snapshot("held-missing");
  eq([repaired.event_status, repaired.start_date, repaired.end_date], ["unannounced", untouched[0].start_date, untouched[0].end_date], "floor preserves held status and event dates");
  await db.exec(floor);
  eq((await one("select wf_event_truth_integrity_enforce() as result")).result.held_rechecks_scheduled, 0, "floor payload and enforcement are idempotent");

  const guard = read(GUARD);
  const cap = read(CAP);
  await assert.rejects(db.exec(cap), /apply 20261105120000_event_truth_held_recheck_guard.sql first/, "renewal cap refuses missing prerequisite trigger");
  checks++;
  await db.exec(guard);
  await db.exec(guard);
  await db.exec(cap);
  await db.exec(cap);
  // Mutate the FINAL effective payload after all three migrations have run; a
  // later replacement must not accidentally repair a mutation under test.
  let effective = cap;
  if (mutation === "allow-postpone") {
    const find = "old.recheck_on > v_today";
    eq(effective.split(find).length, 2, "postponement mutation has exactly one target");
    effective = effective.replace(find, "false");
  }
  if (mutation === "renew-late") {
    const find = "new.recheck_on := v_today + 2;";
    eq(effective.split(find).length, 2, "renewal mutation has exactly one target");
    effective = effective.replace(find, "new.recheck_on := v_today + 3;");
  }
  if (mutation === "remove-cap") {
    const find = "and new.recheck_on > v_today + 2";
    eq(effective.split(find).length, 2, "cap mutation has exactly one target");
    effective = effective.replace(find, "and false");
  }
  await db.exec(effective);
  if (mutation === "drop-guard") await db.exec("drop trigger wf_events_held_recheck_guard on wf_events");
  for (const status of ["unannounced", "uncertain", "postponed"]) {
    const id = "insert-" + status;
    await seed(id, status, 40);
    ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id=$1", [id])).pass, status + " INSERT gets a deadline atomically");
    const before = await snapshot(id);
    await db.query("update wf_events set recheck_on=null where event_id=$1", [id]);
    eq(await snapshot(id), before, status + " clearing a future deadline preserves its date and metadata");
    await db.query("update wf_events set recheck_on=today_et()+9, recheck_reason='later proposal',recheck_set_at=now() where event_id=$1", [id]);
    eq(await snapshot(id), before, status + " later proposal preserves earlier future deadline and metadata");
    await db.query("update wf_events set recheck_on=today_et()+1,recheck_reason='earlier proposal' where event_id=$1", [id]);
    ok((await one("select recheck_on=today_et()+1 and recheck_reason='earlier proposal' as pass from wf_events where event_id=$1", [id])).pass, status + " permits an earlier deadline");

    const due = "partial-" + status;
    await seed(due, status, 40, 0);
    const dueBefore = await snapshot(due);
    // The scheduled task's PASS/PARTIAL apply operation clears an arrived check.
    await db.query("update wf_events set recheck_on=null where event_id=$1", [due]);
    ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id=$1", [due])).pass, status + " due PARTIAL renews immediately at ET+2");
    const dueAfter = await snapshot(due);
    eq([dueAfter.event_status, dueAfter.start_date, dueAfter.end_date], [dueBefore.event_status, dueBefore.start_date, dueBefore.end_date], status + " PARTIAL preserves status/dates");
    for (const oldOffset of [0, -1]) {
      const explicit = "explicit-" + status + "-" + oldOffset;
      await seed(explicit, status, 40, oldOffset);
      const beforeExplicit = await snapshot(explicit);
      await db.query("update wf_events set recheck_on=today_et()+30 where event_id=$1", [explicit]);
      ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id=$1", [explicit])).pass, status + " explicit due/overdue PARTIAL renewal today+30 is capped to ET+2");
      const afterExplicit = await snapshot(explicit);
      eq([afterExplicit.event_status, afterExplicit.start_date, afterExplicit.end_date], [beforeExplicit.event_status, beforeExplicit.start_date, beforeExplicit.end_date], status + " explicit renewal preserves status/dates");
    }
    const missing = "missing-" + status;
    await seed(missing, status, null);
    await db.query("update wf_events set start_date=today_et()+40,recheck_on=today_et()+30 where event_id=$1", [missing]);
    ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id=$1", [missing])).pass, status + " UPDATE from absent old deadline caps explicit renewal");
    const earlier = "due-earlier-" + status;
    await seed(earlier, status, 40, 0);
    await db.query("update wf_events set recheck_on=today_et()+1,recheck_reason='earlier check' where event_id=$1", [earlier]);
    ok((await one("select recheck_on=today_et()+1 and recheck_reason='earlier check' as pass from wf_events where event_id=$1", [earlier])).pass, status + " due renewal permits an earlier ET+1 proposal");
  }
  await seed("intentional-future-milestone", "unannounced", 175, 5);
  const milestone = await snapshot("intentional-future-milestone");
  await db.exec("update wf_events set recheck_on=today_et()+30,recheck_reason='later proposal',recheck_set_at=now() where event_id='intentional-future-milestone'");
  eq(await snapshot("intentional-future-milestone"), milestone, "existing intentional future milestone beyond ET+2 retains its earlier date and metadata");
  await db.exec("update wf_events set recheck_on=null where event_id='intentional-future-milestone'");
  eq(await snapshot("intentional-future-milestone"), milestone, "clearing intentional future milestone also retains its date and metadata");
  await db.exec("update wf_events set recheck_on=today_et()+4 where event_id='intentional-future-milestone'");
  ok((await one("select recheck_on=today_et()+4 as pass from wf_events where event_id='intentional-future-milestone'")).pass, "existing future milestone can move earlier without a blanket ET+2 cap");
  for (const [id, status, offset] of [
    ["past-write", "postponed", -1], ["undated-write", "uncertain", null],
    ["scheduled-write", "scheduled", 40], ["sold-out-write", "sold_out", 40],
    ["cancelled-write", "cancelled", 40],
  ]) {
    await seed(id, status, offset);
    const before = await snapshot(id);
    await db.query("update wf_events set recheck_on=null where event_id=$1", [id]);
    eq(await snapshot(id), before, id + " INSERT and UPDATE remain untouched");
    eq(before.recheck_on, null, id + " has no forced recheck");
    await db.query("update wf_events set recheck_on=today_et()+30 where event_id=$1", [id]);
    ok((await one("select recheck_on=today_et()+30 as pass from wf_events where event_id=$1", [id])).pass, id + " explicit deadline remains exempt from renewal cap");
    const after = await snapshot(id);
    eq([after.event_status, after.start_date, after.end_date], [before.event_status, before.start_date, before.end_date], id + " explicit deadline preserves excluded status/dates");
  }
  await seed("today-write", "postponed", 0);
  ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id='today-write'")).pass, "held event starting today is protected");
  await db.exec("update wf_events set event_status='scheduled',recheck_on=null where event_id='today-write'");
  eq((await snapshot("today-write")).recheck_on, null, "release to scheduled permits clearing the held deadline");
  await seed("status-transition", "scheduled", 40);
  await db.exec("update wf_events set event_status='uncertain' where event_id='status-transition'");
  ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id='status-transition'")).pass, "entering held status is protected without mentioning recheck_on");
  await seed("date-transition", "uncertain", null);
  await db.exec("update wf_events set start_date=today_et()+40 where event_id='date-transition'");
  ok((await one("select recheck_on=today_et()+2 as pass from wf_events where event_id='date-transition'")).pass, "adding known future start_date activates protection");
  const acl = await one("select has_function_privilege('anon','wf_events_held_recheck_guard()','EXECUTE') as anon,has_function_privilege('authenticated','wf_events_held_recheck_guard()','EXECUTE') as authenticated");
  eq(acl, { anon: false, authenticated: false }, "trigger helper is not executable by public clients");
} finally {
  await db.close();
}
if (!mutation) {
  for (const defect of ["drop-floor", "drop-guard", "allow-postpone", "renew-late", "remove-cap"]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--mutation=" + defect], {
      encoding: "utf8", env: { TZ: "Pacific/Honolulu" }, timeout: 60000,
    });
    eq(child.signal, null, defect + " process completes without a signal");
    eq(child.status, 1, defect + " reintroduced defect exits nonzero");
    ok(child.stderr.includes("AssertionError"), defect + " fails a behavioral assertion");
    console.log("  red proof: " + defect + " -> exit 1");
  }
}
console.log("test-event-truth-held-recheck: OK — " + checks + " assertions; 3 complete SQL payloads, ET deadlines, excluded controls, 5 process mutation proofs.");

