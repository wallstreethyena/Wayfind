// app/api/cron/spend-pacing/route.js — daily pacing forecast for every row of
// public.wf_spend_ledger. READ-ONLY against the ledger: it never takes, refunds,
// or edits a cap (free-first: degrade, never auto-raise).
//
// Delivery is NOT a new alert path. It records one wf_job_pulse row through
// lib/jobPulse.js and leaves paging to app/api/cron/job-watch:
//   CAPPED within the first 10 days or an unreadable cap -> `quota:` / `unavailable:`
//     note, succeeded=0 -> job-watch incident on this run.
//   WARN (projected to exhaust with >3 days left, or >=80% used) -> pulse note
//     `warn: ...`, succeeded=attempted -> visible, non-paging.
// Absent config fails loudly (AGENTS.md §5): no CRON_SECRET -> 401, no Supabase
// env -> 503 + cannot-run pulse, unreadable ledger -> 500 + `unavailable:` pulse.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sbEnv } from "../../../../lib/serverCache.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { clockParts, paceLedger, pacingPulse } from "../../../../lib/spendPacing.js";

const JOB = "spend-pacing";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot read wf_spend_ledger");

  const now = new Date();
  const { month, dayOfMonth } = clockParts(now);

  let rows;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_spend_ledger?month=eq.${month}&select=sku,used,cap`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key },
    });
    if (!r.ok) return jobFailed(JOB, `unavailable: wf_spend_ledger read HTTP ${r.status}`);
    rows = await r.json();
  } catch (e) {
    return jobFailed(JOB, "unavailable: wf_spend_ledger read failed — " + String((e && e.message) || e).slice(0, 120));
  }
  if (!Array.isArray(rows)) return jobFailed(JOB, "unavailable: wf_spend_ledger returned a non-array payload");
  // Rows are created lazily by the first grant of the month, so the first day or two may be genuinely empty.
  if (!rows.length && dayOfMonth > 2) return jobFailed(JOB, `unavailable: no wf_spend_ledger rows for ${month} on day ${dayOfMonth}`);

  const report = paceLedger(rows, now);
  const pulse = pacingPulse(report);
  const pulsed = await recordPulse(JOB, pulse);
  try { console.log(JSON.stringify({ tag: "spend_pacing", month, dayOfMonth, level: pulse.level, note: pulse.note })); } catch {}

  return Response.json(
    { ok: true, job: JOB, pulsed, level: pulse.level, month: report.month, dayOfMonth: report.dayOfMonth, daysInMonth: report.daysInMonth, skus: report.results },
    { headers: { "cache-control": "no-store" } }
  );
}
