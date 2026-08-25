// lib/jobPulse.js — "it ran" and "it accomplished something" are separate facts.
//
// THE FAILURE THIS ANSWERS. atlas-build returned HTTP 200 on every invocation
// for five days while publishing nothing: 525 rows written, 0 published. Four
// layers reported green — the 200s, a guard asserting the cron was scheduled, an
// env audit that only checked key PRESENCE, and an Anthropic spend column nobody
// read. The earliest available signal was that spend dropped to zero on
// 2026-07-22 and stayed there. Nothing was watching it.
//
// The generic shape: a job that ATTEMPTS work and SUCCEEDS at none of it,
// repeatedly. Nothing about that is specific to atlas-build or to Anthropic — the
// same pattern catches Places going quiet, blurbs, or any metered job added
// later. So every metered job records attempted/succeeded per run and
// /api/cron/job-watch reads the streak.
//
// DELIBERATELY NOT a provider billing integration. Billing APIs lag hours to
// days, and the fact we care about — this job stopped accomplishing anything —
// is observable locally and immediately.
//
// FAIL-SOFT, ALWAYS. A pulse write must never break the job it is measuring.
// Every function here swallows its own errors and returns a boolean.

import { sbEnv } from "./serverCache.js";

/**
 * Record one run. Call it once, at the END of a metered job, on EVERY path
 * including the failure paths — a job that only pulses when it succeeds is
 * exactly as blind as one that never pulses at all.
 *
 *   attempted  units of work the run took on (0 = idle, nothing to do)
 *   succeeded  units that produced the thing the job exists to produce
 *   note       short dominant failure reason, so the alert can say WHAT broke
 */
export async function recordPulse(job, { attempted = 0, succeeded = 0, failed = null, note = null } = {}) {
  try {
    const s = sbEnv();
    if (!s || !s.url || !s.key) return false;
    const body = {
      job: String(job).slice(0, 80),
      attempted: Math.max(0, attempted | 0),
      succeeded: Math.max(0, succeeded | 0),
      failed: failed == null ? Math.max(0, (attempted | 0) - (succeeded | 0)) : Math.max(0, failed | 0),
      note: note == null ? null : String(note).slice(0, 200),
    };
    const r = await fetch(`${s.url}/rest/v1/wf_job_pulse`, {
      method: "POST",
      headers: {
        apikey: s.key, authorization: "Bearer " + s.key,
        "content-type": "application/json", prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

/** Read per-job health. Returns [] on any failure — never throws at a caller. */
export async function jobHealth(lookbackHours = 48) {
  try {
    const s = sbEnv();
    if (!s || !s.url || !s.key) return [];
    const r = await fetch(`${s.url}/rest/v1/rpc/wf_job_health`, {
      method: "POST",
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" },
      body: JSON.stringify({ p_lookback_hours: lookbackHours }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (e) {
    return [];
  }
}

// How many consecutive all-failure runs before a job is an incident.
//
// 1 is too twitchy: a single transient upstream blip would page. 2 is the first
// count that cannot be one bad minute, and at an hourly cadence it means the
// alert lands roughly two hours in rather than five days in. That is the number
// that matters here — the previous detection latency was 120 hours.
export const DEAD_RUN_THRESHOLD = 2;

/**
 * Classify health rows into incidents. Pure — no I/O, so the thresholds are
 * unit-testable without a database.
 *
 * A job is an INCIDENT when it attempted real work and succeeded at none of it
 * for DEAD_RUN_THRESHOLD consecutive runs. A job that attempted nothing is IDLE
 * — self-terminating jobs legitimately have nothing to do, and treating that as
 * failure would train everyone to ignore the alert.
 */
export function classifyHealth(rows, threshold = DEAD_RUN_THRESHOLD) {
  const incidents = [], healthy = [], idle = [];
  for (const r of rows || []) {
    const attempted = Number(r.attempted || 0);
    const zero = Number(r.consecutive_zero || 0);
    // BILLING/QUOTA ESCALATES IMMEDIATELY (2026-08-25). The generic threshold
    // exists because one bad run can be a transient blip. A provider refusing
    // for billing cannot be — the 579-call incident was deterministic from the
    // first 400, and waiting DEAD_RUN_THRESHOLD runs just delays the human who
    // has to add credits. lib/providerHealth notes carry the "billing:" /
    // "quota:" prefix precisely so this classifier can page on the first run.
    const deterministic = /^(billing|quota):/i.test(String(r.last_note || ""));
    if (attempted === 0) idle.push(r);
    else if (zero >= (deterministic ? 1 : threshold)) incidents.push(r);
    else healthy.push(r);
  }
  // Loudest first: the longest dead streak is the oldest undetected failure.
  incidents.sort((a, b) => Number(b.consecutive_zero || 0) - Number(a.consecutive_zero || 0));
  return { incidents, healthy, idle };
}

/** One line per incident, in the form a human can act on without opening a dashboard. */
export function incidentLine(r) {
  const n = Number(r.consecutive_zero || 0);
  const att = Number(r.attempted || 0), suc = Number(r.succeeded || 0);
  return `${r.job}: ${n} consecutive runs attempted work and produced nothing ` +
    `(${suc}/${att} succeeded over the window)${r.last_note ? ` — last reason: ${r.last_note}` : ""}`;
}
