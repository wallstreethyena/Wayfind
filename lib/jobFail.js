// lib/jobFail.js — a job that cannot do its work must not answer 200.
//
// THE INCIDENT (2026-08-13 to 2026-08-16). SUPABASE_SERVICE_ROLE_KEY was the
// literal string "[SENSITIVE]" for three days. app/api/cron/popularity did
// this, and seven other crons did the same across twelve sites:
//
//     if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
//
// Every run answered 200. Vercel's cron log showed success. Any status-code
// monitor showed success. The job wrote nothing for three days and the
// popularity table stopped growing, which is one of the two reasons the
// "Exploding Trends" rail is empty.
//
// WORSE, AND THE PART THAT MADE IT UNDETECTABLE: the early return fires BEFORE
// recordPulse(), so a dead-key run left no trace at all — not even a failed
// pulse. app/api/cron/job-watch, which exists precisely to notice a job that
// stopped, cannot see a job that never reported.
//
// AND recordPulse CANNOT BE THE FIX ON ITS OWN. It calls sbEnv() and needs the
// same service key, so in the exact failure this guards against it is also
// unable to write. The signal that does not depend on the database is the
// STATUS CODE. That is why this returns 503 rather than logging harder.
//
// 503, not 500: this is "correctly configured code that cannot run right now",
// which is retryable and is what a scheduler should back off and re-fire. It is
// also unambiguously not success, which is the whole point.
//
// AGENTS.md §5: absent configuration fails loudly, never silently. This is that
// rule expressed as a response.
import { recordPulse } from "./jobPulse.js";

/**
 * The response a cron returns when it cannot do its work at all.
 * @param {string} job    the job name, as used in wf_job_pulse
 * @param {string} reason what is missing, in words a human can act on
 */
export async function jobCannotRun(job, reason) {
  // Best effort only, and deliberately not awaited for its result: if the
  // missing config IS the database credential this write cannot land, and that
  // is exactly why the status code above carries the signal instead.
  try { await recordPulse(job, { attempted: 0, succeeded: 0, failed: 1, note: "cannot run: " + reason }); } catch (e) {}
  return Response.json(
    { ok: false, job, error: reason, ranWork: false },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

/**
 * The response a cron returns when it ran but the work failed.
 * Separate from jobCannotRun because the two are different operationally: one
 * is a configuration problem an operator fixes, the other is a runtime failure
 * that may clear on its own.
 */
export async function jobFailed(job, reason, stats = {}) {
  try { await recordPulse(job, { attempted: stats.attempted || 0, succeeded: stats.succeeded || 0, failed: 1, note: String(reason).slice(0, 180) }); } catch (e) {}
  return Response.json(
    { ok: false, job, error: reason, ranWork: true, ...stats },
    { status: 500, headers: { "cache-control": "no-store" } }
  );
}
