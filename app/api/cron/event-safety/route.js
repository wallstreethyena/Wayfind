// app/api/cron/event-safety/route.js — deterministic event safety, hourly.
//
// Event truth is verified by an LLM scheduled task. On 2026-10-26/27 that task
// could not run (account USAGE_LIMIT_REACHED): 47 ended events stayed
// `scheduled` (still displayable) and 347 imminent events went past the 1-day
// verification SLA. Nothing deterministic kept the data safe. This cron does:
//
//   1. ROLLOVER (pulse `event-rollover`): every displayable row whose final
//      occurrence day is before today (America/New_York, and also before the
//      row's own timezone day) -> event_status='completed', verify_note
//      prefixed "ROLLOVER <date>". Idempotent (the PATCH re-asserts the
//      displayable status and the date filter), scoped to those rows, never
//      deletes, never touches a row with no date or a future final day.
//   2. FRESHNESS (pulse `event-freshness`): reads the DATA (last_verified_at of
//      imminent displayable events) plus whether event-truth-daily did USEFUL
//      work (succeeded>0) in 30h. A degraded result writes failed>0, so
//      public.wf_job_health marks it dead and /api/cron/job-watch (hourly :45)
//      pages through its existing email path after DEAD_RUN_THRESHOLD runs.
//      Read failures write an `unavailable:` note, which pages on first sight.
//
// The selection/classification logic is pure, in lib/eventSafety.js, locked by
// scripts/test-event-safety.mjs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbEnv } from "../../../../lib/serverCache.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { occurrenceDatesFor } from "../../../../lib/eventOccurrences.js";
import {
  ROLLOVER_JOB, FRESHNESS_JOB, TRUTH_JOB, DISPLAYABLE_STATUSES, IMMINENT_DAYS,
  dayInZone, addDays, planRollover, classifyFreshness, freshnessPulse, rolloverPulse,
} from "../../../../lib/eventSafety.js";

const MAX_ROLLOVER_PER_RUN = 300;
const STATUS_IN = `in.(${DISPLAYABLE_STATUSES.join(",")})`;

function endedFilter(today) {
  // coalesce(end_date, start_date) < today
  return `or=(end_date.lt.${today},and(end_date.is.null,start_date.lt.${today}))`;
}

async function readJson(url, headers) {
  const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  if (!Array.isArray(body)) throw new Error("expected array");
  return { rows: body, range: r.headers.get("content-range") };
}

async function readEndedCandidates(s, h, today) {
  const url = `${s.url}/rest/v1/wf_events?select=event_id,event_status,start_date,end_date,timezone,verify_note`
    + `&event_status=${STATUS_IN}&${endedFilter(today)}&order=start_date.asc&limit=1000`;
  return (await readJson(url, h)).rows;
}

async function pool(thunks, limit) {
  const out = []; let i = 0;
  async function worker() { while (i < thunks.length) { const idx = i++; out[idx] = await thunks[idx](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

async function runRollover(s, h, now) {
  const today = dayInZone(now);
  let rows;
  try {
    rows = await readEndedCandidates(s, h, today);
  } catch (e) {
    const pulse = rolloverPulse({ today, attempted: 0, succeeded: 0, failed: 0, error: `wf_events read failed (${String(e?.message || e).slice(0, 60)})` });
    return { ok: false, today, pulse };
  }
  const plan = planRollover(rows, now, { occurrencesFor: occurrenceDatesFor });
  const todo = plan.candidates.slice(0, MAX_ROLLOVER_PER_RUN);
  const capped = plan.candidates.length > todo.length;
  const results = await pool(todo.map((c) => async () => {
    // Re-assert status + ended-date filter in the PATCH itself: a row that was
    // re-verified, re-dated or already completed concurrently is not touched.
    const url = `${s.url}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(c.event_id)}`
      + `&event_status=${STATUS_IN}&${endedFilter(today)}&select=event_id`;
    try {
      const r = await fetch(url, {
        method: "PATCH",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: { ...h, "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ event_status: "completed", verify_note: c.note }),
      });
      if (!r.ok) return { id: c.event_id, ok: false };
      const back = await r.json();
      return { id: c.event_id, ok: Array.isArray(back) && back.length === 1, raced: Array.isArray(back) && back.length === 0 };
    } catch {
      return { id: c.event_id, ok: false };
    }
  }), 6);
  const succeeded = results.filter((r) => r.ok).length;
  const raced = results.filter((r) => r.raced).length;
  const failed = results.length - succeeded - raced;
  // A row another writer completed first is not work this run attempted.
  const pulse = rolloverPulse({ today, attempted: todo.length - raced, succeeded, failed, capped });
  return { ok: failed === 0, today, candidates: plan.candidates.length, succeeded, raced, failed, capped, ids: results.filter((r) => r.ok).map((r) => r.id), pulse };
}

async function runFreshness(s, h, now) {
  const today = dayInZone(now);
  const horizon = addDays(today, IMMINENT_DAYS);
  try {
    const evUrl = `${s.url}/rest/v1/wf_events?select=event_id,event_status,start_date,end_date,last_verified_at`
      + `&event_status=${STATUS_IN}&start_date=lte.${horizon}`
      + `&or=(end_date.gte.${today},and(end_date.is.null,start_date.gte.${today}))&limit=5000`;
    const ev = await readJson(evUrl, { ...h, prefer: "count=exact" });
    // A silently row-capped read would under-count staleness: prove completeness.
    const total = Number(String(ev.range || "").split("/")[1]);
    if (!Number.isFinite(total) || total !== ev.rows.length) {
      throw new Error(`incomplete read ${ev.rows.length}/${Number.isFinite(total) ? total : "?"}`);
    }
    const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const pulses = (await readJson(
      `${s.url}/rest/v1/wf_job_pulse?select=id,job,ran_at,attempted,succeeded,failed&job=eq.${TRUTH_JOB}&ran_at=gte.${since}&order=ran_at.desc,id.desc&limit=100`, h,
    )).rows;
    // Re-read the ended set AFTER rollover: anything still here is displayable
    // and over, i.e. the rollover did not land.
    const remaining = planRollover(await readEndedCandidates(s, h, today), now, { occurrencesFor: occurrenceDatesFor }).candidates.length;
    const c = classifyFreshness(ev.rows, pulses, now, { endedDisplayable: remaining });
    const pulse = freshnessPulse(c);
    return { ok: !c.degraded, classification: { ...c, oldestAgeMs: c.oldestAgeMs === Infinity ? "never-verified" : c.oldestAgeMs }, pulse };
  } catch (e) {
    const pulse = { attempted: 0, succeeded: 0, failed: 1, note: `unavailable: event freshness read failed (${String(e?.message || e).slice(0, 120)})` };
    return { ok: false, pulse };
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const s = sbEnv();
  if (!s) {
    const note = "unavailable: no Supabase service env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)";
    await recordPulse(ROLLOVER_JOB, { attempted: 0, succeeded: 0, failed: 1, note });
    await recordPulse(FRESHNESS_JOB, { attempted: 0, succeeded: 0, failed: 1, note });
    return Response.json({ ok: false, error: note }, { status: 503 });
  }
  const h = { apikey: s.key, authorization: `Bearer ${s.key}` };
  const now = new Date();
  // Each step returns its pulse; GET records both on every path (the pulse
  // contract scanned by scripts/check-cron-pulse-coverage.mjs).
  let rollover;
  try {
    rollover = await runRollover(s, h, now);
  } catch (e) {
    rollover = { ok: false, pulse: { attempted: 0, succeeded: 0, failed: 1, note: `unavailable: rollover threw (${String(e?.message || e).slice(0, 120)})` } };
  }
  await recordPulse(ROLLOVER_JOB, rollover.pulse);
  // Freshness runs AFTER the rollover so ended_still_displayable measures
  // whether the rollover actually landed.
  let freshness;
  try {
    freshness = await runFreshness(s, h, now);
  } catch (e) {
    freshness = { ok: false, pulse: { attempted: 0, succeeded: 0, failed: 1, note: `unavailable: freshness threw (${String(e?.message || e).slice(0, 120)})` } };
  }
  await recordPulse(FRESHNESS_JOB, freshness.pulse);
  return Response.json({ ok: rollover.ok && freshness.ok, rollover, freshness }, { headers: { "cache-control": "no-store" } });
}
