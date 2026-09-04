// app/api/cron/revenue-heartbeat/route.js — REVENUE HEARTBEAT, layer 3 of the
// revenue-guard stack added after the check-env.mjs incident (a guard that
// could never fail, wired into nothing, silently let NEXT_PUBLIC_VIATOR_PID
// go missing/placeholder — see lib/envPlaceholder.js). lib/affiliates.js
// fails CLOSED on that condition: no broken link, no error, nothing looks
// wrong — just SILENT ZERO REVENUE. This is the runtime detector for that
// signature: affiliate CTA activity collapsing toward zero WHILE TRAFFIC IS
// STILL PRESENT.
//
// RATIO, NOT ABSOLUTE. See lib/revenueHeartbeat.js for why — a fixed floor
// on affiliate-event count either pages on a quiet night or misses a real
// collapse that happens to land during one. This compares the CURRENT
// affiliate-activity/traffic ratio in the window against a trailing 14-day
// baseline ratio, and only calls it an incident when traffic itself is
// healthy (enough visitors to judge from).
//
// NOT A NEW ALERT PATH. This writes to wf_job_pulse via the SAME recordPulse
// every other metered job in this repo already uses (lib/jobPulse.js), and
// leaves DELIVERY to the existing app/api/cron/job-watch, which already
// reads wf_job_pulse, escalates a job whose runs "attempted work and
// succeeded at none of it" for DEAD_RUN_THRESHOLD consecutive runs, and
// emails via Resend (DIGEST_EMAIL). attempted=traffic, succeeded=0 only when
// this run judged an incident — see lib/revenueHeartbeat.js toPulseRow().
//
// CRON_SECRET-gated, same as every other cron here (job-watch, booking-audit,
// cc-alerts). Read-only against PostHog; the only write is the pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as ph from "../../../../lib/commandCenter/sources/posthog.js";
import { revenueSignal, baselineRatioFromHistory, toPulseRow } from "../../../../lib/revenueHeartbeat.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";

const JOB = "revenue-heartbeat";
const WINDOW_HOURS = 3;      // the current window judged for an incident
const BASELINE_DAYS = 14;    // trailing history the baseline ratio is built from

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!ph.posthogConfigured()) {
    return jobCannotRun(JOB, "POSTHOG_PERSONAL_API_KEY is not set — cannot measure traffic or affiliate CTA activity");
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_HOURS * 3600 * 1000);
  const baselineEnd = windowStart; // no overlap with the window being judged
  const baselineStart = new Date(baselineEnd.getTime() - BASELINE_DAYS * 86400000);

  const [current, dailyHist] = await Promise.all([
    ph.revenueHeartbeatCounts(windowStart, now),
    ph.revenueHeartbeatDaily(baselineStart, baselineEnd),
  ]);

  if (!current.source || current.source.connected === false) {
    return jobFailed(JOB, "PostHog query failed for the current window: " + (current.source && current.source.note || "unknown error"));
  }

  const currentRow = (current.data && current.data[0]) || {};
  const trafficCount = Number(currentRow.traffic) || 0;
  const affiliateCount = Number(currentRow.affiliate_activity) || 0;

  const historyRows = (dailyHist && dailyHist.data) || [];
  const baselineRatio = baselineRatioFromHistory(
    historyRows.map((r) => ({ trafficCount: Number(r.traffic) || 0, affiliateCount: Number(r.affiliate_activity) || 0 }))
  );

  const signal = revenueSignal({ trafficCount, affiliateCount, baselineRatio });
  const pulseRow = toPulseRow(signal, { trafficCount, affiliateCount });
  const pulsed = await recordPulse(JOB, pulseRow);

  try {
    console.log(JSON.stringify({ tag: "revenue_heartbeat", status: signal.status, ratio: signal.ratio, baselineRatio: signal.baselineRatio, trafficCount, affiliateCount, windowHours: WINDOW_HOURS, baselineDays: BASELINE_DAYS }));
  } catch {}

  return Response.json({
    ok: true,
    job: JOB,
    status: signal.status,
    reason: signal.reason,
    windowHours: WINDOW_HOURS,
    baselineDays: BASELINE_DAYS,
    trafficCount,
    affiliateCount,
    ratio: signal.ratio,
    baselineRatio: signal.baselineRatio,
    historyDays: historyRows.length,
    pulseRecorded: pulsed,
    note: "delivery is via the existing app/api/cron/job-watch pulse alert, not a new alert path",
  });
}
