// app/api/cron/photo-repair/route.js — drains lib/photoRepair.js's
// wf_photo_repair_queue against the LIVE database on a schedule. This route
// is a THIN CALLER: all the logic (exact-ref/same-place recovery,
// classification, backoff) lives in lib/, not scripts/, so it stays
// testable without an HTTP server (see scripts/test-photo-protection.mjs)
// AND so this import is an ordinary app/ -> lib/ import rather than an
// app/ -> scripts/ import.
//
// Shape copied from app/api/cron/inventory-refresh/route.js. Same fail-closed
// contract: CRON_SECRET bearer or 401 (scripts/check-cron-failclosed.mjs),
// jobCannotRun() on missing Supabase env (503, never a 2xx failure body —
// scripts/check-cron-honesty.mjs), jobFailed() when the run itself errors,
// recordPulse() on every path.
//
// QUEUE AVAILABILITY (v8.56.12): a missing wf_photo_repair_queue table (the
// migration has not landed on this environment) is reported by runRepair as
// ok:true, attempted:0, queueUnavailable:true — never jobFailed, never a
// crash. The pulse still files so the absence is visible.
//
// NEVER CALLS GOOGLE. No import of lib/spendGate.js, no reference to the
// Places media host (googleapis dot com/v1/.../media) anywhere in this file
// — scripts/test-photo-protection.mjs case 5 checks this file by name.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { runRepair } from "../../../../lib/photoRepair";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("photo-repair", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(u.searchParams.get("limit")) || 200));

  let result;
  try {
    result = await runRepair({ limit, sbEnv: { url: /^https?:\/\//i.test(url) ? url : "https://" + url, key: svc } });
  } catch (e) {
    return jobFailed("photo-repair", "worker threw: " + (e && e.message ? e.message : String(e)));
  }
  if (!result.ok) return jobCannotRun("photo-repair", result.reason || "worker could not run");

  // 2026-09-09 — the note now names every drain outcome by its own field
  // (recovered / classified / blocked / released / failed), plus the
  // allowance measurement the run actually used, so an operator can tell
  // "the queue is stuck on money" from "the queue is stuck on data" without
  // opening wf_photo_repair_queue. `allowance` is the DRAIN's own measured
  // value (null when nothing this run needed to check the ledger at all —
  // see lib/photoRepair.js's lazy, once-per-run read) — never fabricated.
  const allowanceNote = !result.allowance
    ? "unread"
    : result.allowance.phase === "unknown"
      ? "unreadable"
      : `${result.allowance.used}/${result.allowance.cap}`;
  const note = result.queueUnavailable
    ? `photos: queue unavailable (${result.queueStatus != null ? result.queueStatus : "error"})`
    : `photos: recovered=${result.recovered} classified=${result.classified} blocked=${result.blocked} released=${result.released} failed=${result.failed} allowance=${allowanceNote}`;
  if (!result.queueUnavailable && result.attempted > 0 && result.failed === result.attempted) {
    return jobFailed("photo-repair", note, { attempted: result.attempted, succeeded: 0 });
  }

  await recordPulse("photo-repair", {
    // A row the worker correctly parked in budget_blocked is the worker
    // doing its job, not a failure — same treatment "classified" already
    // got before blocked split out of it as its own status.
    attempted: result.attempted,
    succeeded: result.recovered + result.classified + result.blocked,
    note,
  });

  return Response.json({
    ok: true,
    attempted: result.attempted,
    recovered: result.recovered,
    classified: result.classified,
    blocked: result.blocked,
    released: result.released,
    failed: result.failed,
    allowance: result.allowance,
    queueUnavailable: !!result.queueUnavailable,
  });
}
