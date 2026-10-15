// app/api/cron/sighting-renewal/route.js — keeps recorded Google sightings in
// wf_inventory.independent_coords current, at zero cost.
//
// WHY (2026-10-15 audit): 2,674 map-drawable rows are drawable ONLY through a
// wf_place_ids-sighting entry copied in once by
// scripts/backfill-coords-from-place-sightings.mjs. A sighting may be drawn for
// 30 days from seen_at, so all of them expire by 2026-11-13 and nothing renewed
// them (inventory-refresh is spend-gated). Fresh sightings keep arriving for
// free: lib/serverCache.upsertPlaceIds stamps wf_place_ids.seen_at after every
// live Google searchText that real user searches trigger.
//
// WHAT IT DOES, daily: reads fresh wf_place_ids sightings and the inventory rows
// they could serve, and through lib/sightingRenewal.js (the SAME rules as the
// backfill script) replaces a row's sighting entry only with a strictly newer
// one, adds a first entry where the backfill rules allow, and deletes expired
// sighting entries (Google requires deleting expired lat/lng). Other
// independent_coords entries are never touched; every write is a
// compare-and-swap on the exact value it judged.
//
// ZERO GOOGLE CALLS: Supabase PostgREST only. No spend, no cap or gate.
// CRON_SECRET-gated, service role server-side, pulses wf_job_pulse every run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbEnv } from "../../../../lib/serverCache.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { loadExcludedIds, runSightingRenewal, renewalNote } from "../../../../lib/sightingRenewal.js";

const JOB = "sighting-renewal";
const MAX_WRITES = 800;      // per run; a backlog drains over following days
const WORK_BUDGET_MS = 40_000; // stop starting writes with 20 s of platform time left

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sb = sbEnv();
  if (!sb) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot read wf_place_ids / wf_inventory");

  let excluded;
  try { excluded = await loadExcludedIds(); }
  catch (e) { return jobCannotRun(JOB, "seed/atlas exclusion list unreadable — " + String((e && e.message) || e).slice(0, 120)); }

  const started = Date.now();
  let stats;
  try {
    stats = await runSightingRenewal({ sb, excluded, now: started, maxWrites: MAX_WRITES, deadlineAt: started + WORK_BUDGET_MS });
  } catch (e) {
    return jobFailed(JOB, "unavailable: " + String((e && e.message) || e).slice(0, 160));
  }

  const note = renewalNote(stats);
  // Every planned write failed: that is a broken job, not an idle one.
  if (stats.attempted > 0 && stats.succeeded === 0 && stats.writeFailed > 0) {
    return jobFailed(JOB, "write-failed: " + note, { attempted: stats.attempted, succeeded: 0 });
  }
  const pulsed = await recordPulse(JOB, { attempted: stats.attempted, succeeded: stats.succeeded, note });
  try { console.log(JSON.stringify({ tag: "sighting_renewal", ...stats })); } catch {}
  return Response.json({ ok: true, job: JOB, pulsed, note, ...stats }, { headers: { "cache-control": "no-store" } });
}
