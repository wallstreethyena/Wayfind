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
// ?source=at-risk|all (2026-09-09, "beat the cliff"). Unset is the smart
// default lib/placePhotoBackfill.js's runBackfill already applies: drain
// wf_photo_at_risk (earliest-expiring places first) THEN fall back to the
// general beach/attractions scan with whatever `limit` budget is left — see
// that file's header for the full incident this exists to answer (5,238
// places' cached Google photos expire 2026-09-25..2026-10-04). The explicit
// values let an operator drive ONE worklist by hand: `at-risk` to work only
// the cliff, `all` to reproduce this route's pre-vault behaviour exactly (the
// general beach/attractions scan alone). Any other value is ignored, same as
// unset.
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
// 300s, with the worker held to WORK_BUDGET_MS below it. The two numbers are a
// pair: the platform ceiling is what the function is ALLOWED, the budget is
// what the worker will USE, and the gap between them is the room the run needs
// to finish its in-flight candidates, write their rows, and file its pulse. A
// ceiling without a budget is just a longer silence — see the 504 described in
// lib/placePhotoBackfill.js's `deadlineAt`.
export const maxDuration = 300;

// 45s of headroom under maxDuration. Sized for the worst tail this route has:
// the last POOL_SIZE candidates already in flight when the budget expires, each
// possibly mid-Commons-download, plus their upserts and the pulse write.
const WORK_BUDGET_MS = 255_000;

import { runBackfill, describeAtRisk, describeReplay } from "../../../../lib/placePhotoBackfill";
import { recordPulse, isDeterministicFailureNote } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("place-photos", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  const startedAt = Date.now();
  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 25));
  const scanLimit = Math.max(1, Math.min(5000, Number(u.searchParams.get("scan")) || 1000));
  const sourceParam = u.searchParams.get("source");
  const source = sourceParam === "at-risk" || sourceParam === "all" ? sourceParam : undefined;

  let result;
  try {
    result = await runBackfill({ limit, scanLimit, source, deadlineAt: startedAt + WORK_BUDGET_MS, sbEnv: { url: /^https?:\/\//i.test(url) ? url : "https://" + url, key: svc } });
  } catch (e) {
    return jobFailed("place-photos", "worker threw: " + (e && e.message ? e.message : String(e)));
  }
  if (!result.ok) return jobCannotRun("place-photos", result.reason || "worker could not run");

  // NEVER RE-WRAP A NOTE THAT ALREADY CARRIES A DETERMINISTIC PREFIX
  // (lib/jobPulse.js's `unavailable:`/`billing:`/`quota:` — 2026-09-09). The
  // `^` anchor in DETERMINISTIC_NOTE_PREFIX only matches at column 0, so
  // prepending "place-photos: " in front of runBackfill's
  // "unavailable: place-photos wf_photo_at_risk read failed (HTTP 500)"
  // would push the prefix off column 0 and silence the very page this exists
  // to cause — exactly the bug this route shipped with in production. Every
  // OTHER note (idle, tableUnavailable, the ordinary summary) still gets the
  // "place-photos: " job label, because those notes carry no anchor to
  // protect.
  const note = result.tableUnavailable
    ? `place-photos: table unavailable (${result.tableStatus != null ? result.tableStatus : "error"})`
    : result.note
      ? (isDeterministicFailureNote(result.note) ? result.note : `place-photos: ${result.note}`)
      : `place-photos: ${result.active} active (${result.vaulted || 0} vaulted), ${result.rejected} rejected, ${result.failed} failed, ${result.deferred || 0} deferred${result.partial ? ` — PARTIAL: stopped on its own ${Math.round(WORK_BUDGET_MS / 1000)}s budget with ${result.deadlineStopped} candidate(s) unstarted` : ""} (${describeAtRisk({ ...result, source })}, ${describeReplay({ ...result, source })}, general scanned ${result.scanned}, ${result.alreadyCovered} already covered)`;

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
    source: source || "at-risk-then-all",
    attempted: result.attempted,
    active: result.active,
    rejected: result.rejected,
    failed: result.failed,
    vaulted: result.vaulted || 0,
    vaultSkipped: result.vaultSkipped || 0,
    scanned: result.scanned || 0,
    atRiskScanned: result.atRiskScanned || 0,
    atRiskTaken: result.atRiskTaken || 0,
    atRiskUnavailable: !!result.atRiskUnavailable,
    replayTaken: result.replayTaken || 0,
    replayBacklog: result.replayBacklog || 0,
    replayUnavailable: !!result.replayUnavailable,
    replayStatus: result.replayStatus != null ? result.replayStatus : null,
    alreadyCovered: result.alreadyCovered || 0,
    tableUnavailable: !!result.tableUnavailable,
  });
}
