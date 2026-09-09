// app/api/cron/place-photos/route.js — drains lib/placePhotoBackfill.js's
// candidate scan against the LIVE database on a schedule. This route is a
// THIN CALLER: all the logic (candidate selection, priority, Commons
// resolution, writes) lives in lib/, not scripts/, so it stays testable
// without an HTTP server (see scripts/test-commons-photos.mjs for the
// resolver, lib/placePhotoBackfill.js for the drain) AND so this import is
// an ordinary app/ -> lib/ import rather than an app/ -> scripts/ import.
//
// Shape copied from app/api/cron/photo-repair/route.js. Same fail-closed
// contract: CRON_SECRET bearer or 401 (scripts/check-cron-failclosed.mjs),
// jobCannotRun() on missing Supabase env (503, never a 2xx failure body —
// scripts/check-cron-honesty.mjs), jobFailed() when the run itself errors,
// recordPulse() on every path.
//
// TABLE AVAILABILITY: a missing wf_place_photo table (the migration has not
// landed on this environment) is reported by runBackfill as ok:true,
// attempted:0, tableUnavailable:true — never jobFailed, never a crash. The
// pulse still files so the absence is visible.
//
// A RUN THAT FINDS NOTHING TO DO IS NOT A FAILURE. Every beach/attractions
// place already covered, or the scan turning up zero eligible rows, pulses
// attempted=0 succeeded=0 with a plain note carrying NO "billing:"/"quota:"
// prefix — lib/jobPulse.js's classifyHealth escalates a "billing:"/"quota:"
// note to an immediate page (deterministic provider failure), and an idle
// day for a keyless, un-metered backfill is exactly the opposite of that.
//
// NEVER CALLS GOOGLE. No import of lib/spendGate.js, no reference to the
// Places media host (googleapis dot com/v1/.../media) anywhere in this file,
// in lib/placePhotoBackfill.js, or in lib/commonsPhotos.js — this lane is
// Wikimedia-only and keyless by construction (scripts/test-commons-photos.mjs
// checks lib/commonsPhotos.js by name, and scripts/check-promote-spend-gate.mjs
// scans every app/api/cron/**/route.js for exactly this host literally, so
// even naming it plainly in a comment here would trip that guard).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { runBackfill } from "../../../../lib/placePhotoBackfill";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("place-photos", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 25));
  const scanLimit = Math.max(1, Math.min(5000, Number(u.searchParams.get("scan")) || 1000));

  let result;
  try {
    result = await runBackfill({ limit, scanLimit, sbEnv: { url: /^https?:\/\//i.test(url) ? url : "https://" + url, key: svc } });
  } catch (e) {
    return jobFailed("place-photos", "worker threw: " + (e && e.message ? e.message : String(e)));
  }
  if (!result.ok) return jobCannotRun("place-photos", result.reason || "worker could not run");

  const note = result.tableUnavailable
    ? `place-photos: table unavailable (${result.tableStatus != null ? result.tableStatus : "error"})`
    : result.note
      ? `place-photos: ${result.note}`
      : `place-photos: ${result.active} active, ${result.rejected} rejected, ${result.failed} failed (scanned ${result.scanned}, ${result.alreadyCovered} already covered)`;

  if (!result.tableUnavailable && result.attempted > 0 && result.failed === result.attempted) {
    return jobFailed("place-photos", note, { attempted: result.attempted, succeeded: 0 });
  }

  await recordPulse("place-photos", {
    attempted: result.attempted,
    succeeded: result.active,
    note,
  });

  return Response.json({
    ok: true,
    attempted: result.attempted,
    active: result.active,
    rejected: result.rejected,
    failed: result.failed,
    scanned: result.scanned || 0,
    alreadyCovered: result.alreadyCovered || 0,
    tableUnavailable: !!result.tableUnavailable,
  });
}
