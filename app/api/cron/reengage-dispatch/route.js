// app/api/cron/reengage-dispatch/route.js — the sender for wf_reengage_queue, every 5 minutes.
// All rules (confirmed contacts only, suppression re-checked at send time, 2 push and 2 email
// per 7 days, quiet hours, claim before send, stale and stuck rows) live in
// lib/reengageDispatch.js. Kill switch: WF_REENGAGE_DISPATCH=off sends nothing and pulses.
// Fail closed: no CRON_SECRET -> 401; no Supabase env -> 503; a failed due select -> 500 and a
// failed pulse (never "nothing due"). Every terminal path records a wf_job_pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbEnv } from "../../../../lib/serverCache.js";
import { runReengageDispatch } from "../../../../lib/reengageDispatch.js";
import { reengageConfigured } from "../../../../lib/reengageServer.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";

const JOB = "reengage-dispatch";
const NO_STORE = { "cache-control": "no-store" };

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  if (String(process.env.WF_REENGAGE_DISPATCH || "").trim().toLowerCase() === "off") {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "skipped: WF_REENGAGE_DISPATCH=off" });
    return Response.json({ ok: true, skipped: "off" }, { headers: NO_STORE });
  }
  if (!reengageConfigured({ sb: s })) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "skipped: re-engagement not enabled" });
    return Response.json({ ok: true, skipped: "not_enabled" }, { headers: NO_STORE });
  }
  try {
    const r = await runReengageDispatch({ sb: s });
    if (r.selectFailed) return jobFailed(JOB, "due select failed", { attempted: r.attempted, succeeded: r.sent });
    if (!r.ok) {
      await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "skipped: " + r.reason });
      return Response.json({ ok: true, skipped: r.reason }, { headers: NO_STORE });
    }
    // Store errors (a failed claim, settle, reap or sweep) are not a success: nothing sent plus errors is a failed run,
    // and errors beside real sends are counted as failures in the pulse so job-watch sees them.
    if (r.errors > 0 && r.sent === 0) return jobFailed(JOB, `${r.errors} store error(s) and nothing sent`, { attempted: r.attempted, succeeded: 0 });
    await recordPulse(JOB, { attempted: r.attempted, succeeded: r.sent, failed: r.failed + r.errors, note: `cap=${r.skippedCap} supp=${r.skippedSuppressed} stale=${r.stale} reaped=${r.reaped} deferred=${r.deferred} errors=${r.errors}` });
    try { console.log(JSON.stringify({ tag: "reengage_dispatch", ...r })); } catch {}
    return Response.json(r, { headers: NO_STORE });
  } catch (e) {
    return jobFailed(JOB, String((e && e.message) || e));
  }
}
