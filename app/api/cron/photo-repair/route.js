// app/api/cron/photo-repair/route.js — drains lib/photoRepair.js's
// wf_photo_repair_queue against the LIVE database on a schedule. This route
// is a THIN CALLER: all per-row logic (exact-ref/same-place recovery,
// classification, backoff) lives in lib/, not scripts/, so it stays testable
// without an HTTP server (see scripts/test-photo-protection.mjs).
//
// Shape copied from app/api/cron/inventory-refresh/route.js. Same fail-closed
// contract: CRON_SECRET bearer or 401 (scripts/check-cron-failclosed.mjs),
// jobCannotRun() on missing Supabase env (503, never a 2xx failure body —
// scripts/check-cron-honesty.mjs), jobFailed() when the run itself errors,
// recordPulse() on every terminal path.
//
// QUEUE AVAILABILITY (v8.56.12): a missing wf_photo_repair_queue table (the
// migration has not landed on this environment) is reported by runRepair as
// ok:true, attempted:0, queueUnavailable:true — never jobFailed, never a
// crash. The pulse still files so the absence is visible.
//
// DEADLINE CONTROL (2026-09-10). The production 04:20 run was killed by
// Vercel at exactly 60s after mutating 109 queue rows and BEFORE recordPulse
// could run. That left partial work with no heartbeat. The sibling
// place-photos cron already solved the same failure class with a platform
// ceiling plus a smaller worker-owned budget. This route now does the same,
// but in bounded 25-row batches because lib/photoRepair.js intentionally has
// no platform concept and its CLI must remain able to drain without a Vercel
// clock. We never start a new batch after WORK_BUDGET_MS. A batch that reports
// any row failure also stops the same run so that an unpatched failed row is
// not immediately selected and hammered again by the next batch.
//
// NEVER CALLS GOOGLE. No import of lib/spendGate.js, no reference to the
// Places media host (googleapis dot com/v1/.../media) anywhere in this file
// — scripts/test-photo-protection.mjs case 5 checks this file by name.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The platform may run for five minutes. The controller deliberately stops
// starting repair batches after 225s, leaving 75s for the current 25-row
// batch to finish, its writes to land, and recordPulse() to complete. The
// previous production rate was 109 rows in ~59s, so 25 rows is intentionally
// much smaller than the observed one-minute kill window.
export const maxDuration = 300;
const WORK_BUDGET_MS = 225_000;
const BATCH_SIZE = 25;
const DEFAULT_LIMIT = 500;
const MIN_PLATFORM_HEADROOM_MS = 60_000;

import { runRepair } from "../../../../lib/photoRepair";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

// Fail closed if somebody later widens the worker clock until it nearly
// equals the platform clock. A longer ceiling without owned headroom merely
// recreates the same silent-kill failure with a larger number.
if (WORK_BUDGET_MS > maxDuration * 1000 - MIN_PLATFORM_HEADROOM_MS) {
  throw new Error("photo-repair budget must leave at least 60s beneath maxDuration");
}

/**
 * Cron-only controller around the existing per-batch worker.
 *
 * Keeping batching here preserves lib/photoRepair.js's CLI contract while
 * making the hosted route resumable by construction: each completed batch
 * advances/recovers its rows, and the next batch re-queries only what is still
 * due. `run` and `now` are injectable so this controller can be exercised
 * deterministically without Supabase or a wall clock.
 */
export async function runRepairWithinBudget({ limit, sbEnv, startedAt = Date.now(), run = runRepair, now = Date.now } = {}) {
  const requested = Math.max(1, Math.min(500, Number(limit) || DEFAULT_LIMIT));
  const deadlineAt = startedAt + WORK_BUDGET_MS;
  let remaining = requested;
  let attempted = 0;
  let recovered = 0;
  let classified = 0;
  let blocked = 0;
  let released = 0;
  let failed = 0;
  let batches = 0;
  let allowance = null;
  let stopReason = null;

  while (remaining > 0) {
    if (now() >= deadlineAt) {
      stopReason = "deadline";
      break;
    }

    const batchLimit = Math.min(BATCH_SIZE, remaining);
    const result = await run({ limit: batchLimit, sbEnv });
    batches++;

    if (!result || result.ok !== true) {
      return {
        ok: false,
        reason: (result && result.reason) || "worker could not run",
        attempted,
        recovered,
        classified,
        blocked,
        released,
        failed,
        batches,
        allowance,
        partial: attempted > 0,
        stopReason: "worker-unavailable",
      };
    }

    if (result.queueUnavailable) {
      return {
        ok: true,
        attempted,
        recovered,
        classified,
        blocked,
        released,
        failed,
        batches,
        allowance,
        queueUnavailable: true,
        queueStatus: result.queueStatus,
        partial: attempted > 0,
        stopReason: "queue-unavailable",
      };
    }

    attempted += Number(result.attempted || 0);
    recovered += Number(result.recovered || 0);
    classified += Number(result.classified || 0);
    blocked += Number(result.blocked || 0);
    released += Number(result.released || 0);
    failed += Number(result.failed || 0);
    if (result.allowance) allowance = result.allowance;

    const batchAttempted = Math.max(0, Number(result.attempted || 0));
    remaining = Math.max(0, remaining - batchAttempted);

    // A short batch means the due queue is exhausted right now. A batch with
    // a failure stops too: failed rows are deliberately left unpatched by
    // lib/photoRepair.js, so another immediate query could select the exact
    // same row and retry it repeatedly inside one cron invocation.
    if (batchAttempted < batchLimit) break;
    if (Number(result.failed || 0) > 0) {
      stopReason = "row-failure";
      break;
    }
  }

  return {
    ok: true,
    attempted,
    recovered,
    classified,
    blocked,
    released,
    failed,
    batches,
    allowance,
    partial: stopReason != null,
    stopReason,
    requested,
    remainingLimit: remaining,
    workBudgetMs: WORK_BUDGET_MS,
  };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("photo-repair", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  const startedAt = Date.now();
  const u = new URL(req.url);
  // Current production opens hundreds of repair rows per day. A 200-row daily
  // ceiling cannot catch a ~300/day inflow even when every row is cheap. The
  // controller may consider up to 500, but the 225s work budget — not this
  // number — is the hard runtime wall.
  const limit = Math.max(1, Math.min(500, Number(u.searchParams.get("limit")) || DEFAULT_LIMIT));

  let result;
  try {
    result = await runRepairWithinBudget({
      limit,
      startedAt,
      sbEnv: { url: /^https?:\/\//i.test(url) ? url : "https://" + url, key: svc },
    });
  } catch (e) {
    return jobFailed("photo-repair", "worker threw: " + (e && e.message ? e.message : String(e)));
  }
  if (!result.ok) return jobCannotRun("photo-repair", result.reason || "worker could not run");

  const allowanceNote = !result.allowance
    ? "unread"
    : result.allowance.phase === "unknown"
      ? "unreadable"
      : `${result.allowance.used}/${result.allowance.cap}`;

  const partialNote = result.stopReason === "deadline"
    ? ` — PARTIAL: stopped on its own ${Math.round(WORK_BUDGET_MS / 1000)}s budget after ${result.attempted}/${limit} attempted`
    : result.stopReason === "row-failure"
      ? ` — PARTIAL: stopped after a batch reported a row failure to avoid same-run retry (${result.attempted}/${limit} attempted)`
      : "";

  const note = result.queueUnavailable
    ? `photos: queue unavailable (${result.queueStatus != null ? result.queueStatus : "error"})${result.attempted ? ` after ${result.attempted} attempted` : ""}`
    : `photos: recovered=${result.recovered} classified=${result.classified} blocked=${result.blocked} released=${result.released} failed=${result.failed} allowance=${allowanceNote} batches=${result.batches}${partialNote}`;

  if (!result.queueUnavailable && result.attempted > 0 && result.failed === result.attempted) {
    return jobFailed("photo-repair", note, { attempted: result.attempted, succeeded: 0 });
  }

  await recordPulse("photo-repair", {
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
    batches: result.batches,
    partial: !!result.partial,
    stopReason: result.stopReason,
    remainingLimit: result.remainingLimit ?? null,
    allowance: result.allowance,
    queueUnavailable: !!result.queueUnavailable,
  });
}