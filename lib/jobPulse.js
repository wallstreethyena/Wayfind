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
// THE DESTRUCTURED SIGNATURE IS LOAD-BEARING. scripts/check-job-pulse-contract.mjs
// derives the set of legal option keys by READING this parameter list, then
// checks every recordPulse call site against it — because an unknown key is
// dropped silently, leaving attempted/succeeded at 0 so job-watch reads a dying
// job as idle. Collapsing this to `(job, opts)` emptied that contract and made
// all 172 call sites look wrong; the guard caught it immediately, which is the
// system working. Keep the keys spelled out here.
export async function recordPulse(job, { attempted = 0, succeeded = 0, failed = null, note = null } = {}) {
  const r = await recordPulseDetailed(job, { attempted, succeeded, failed, note });
  return r.ok;
}

/**
 * The same write, with the OUTCOME it actually had.
 *
 * WHY THIS EXISTS (2026-09-09). recordPulse returns a bare boolean, and that
 * boolean collapses three different states into one:
 *
 *     the row was written                       -> true
 *     the server refused it (4xx/5xx)           -> false
 *     the request timed out or the socket died  -> false
 *
 * The third is not the second. The abort happens CLIENT-side; the server may
 * already have committed. Observed live the day this was written: a heartbeat
 * printed "NOT RECORDED", and the row was sitting in the table (id 8788). An
 * instrument that reports a successful write as a failure is lying about
 * itself, which is the exact defect class this whole lane exists to catch — so
 * the boolean stays for every existing caller, and anything that REPORTS on
 * the write uses this instead and says "unknown" when it does not know.
 *
 * Returns { ok, status, indeterminate, error }:
 *   ok             true only on a 2xx that was actually read back
 *   status         the HTTP status when one was received, else null
 *   indeterminate  the request never completed — the row MAY exist
 *   error          short message, never a credential
 */
export async function recordPulseDetailed(job, { attempted = 0, succeeded = 0, failed = null, note = null } = {}) {
  const s = sbEnv();
  if (!s || !s.url || !s.key) {
    return { ok: false, status: null, indeterminate: false, error: "no Supabase env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" };
  }
  const body = {
    job: String(job).slice(0, 80),
    attempted: Math.max(0, attempted | 0),
    succeeded: Math.max(0, succeeded | 0),
    failed: failed == null ? Math.max(0, (attempted | 0) - (succeeded | 0)) : Math.max(0, failed | 0),
    note: note == null ? null : String(note).slice(0, 200),
  };
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_job_pulse`, {
      method: "POST",
      cache: "no-store",
      // 15s, not 10s. A cold process pays DNS + TLS before the first byte and
      // was measured at 3.8s on an ordinary connection; 10s left too little
      // headroom, and an abort here is worse than a slow write because it
      // reports a committed row as lost.
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: s.key, authorization: "Bearer " + s.key,
        "content-type": "application/json", prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (r.ok) return { ok: true, status: r.status, indeterminate: false, error: null };
    let detail = "";
    try { detail = (await r.text()).slice(0, 180); } catch { /* body is optional diagnostics */ }
    return { ok: false, status: r.status, indeterminate: false, error: detail || `HTTP ${r.status}` };
  } catch (e) {
    // Timeout, DNS, TLS, reset. The server may have committed — say so.
    return { ok: false, status: null, indeterminate: true, error: String((e && e.message) || e).slice(0, 160) };
  }
}

/** Read per-job health. Returns [] on any failure — never throws at a caller. */
export async function jobHealth(lookbackHours = 48) {
  try {
    const s = sbEnv();
    if (!s || !s.url || !s.key) return [];
    const r = await fetch(`${s.url}/rest/v1/rpc/wf_job_health`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
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

// DETERMINISTIC FAILURE NOTE PREFIXES (2026-08-25, extended 2026-09-09).
//
// A note carrying one of these prefixes describes a failure that CANNOT be a
// transient blip, so classifyHealth below escalates it to an incident on the
// very run that produced it — no waiting for DEAD_RUN_THRESHOLD, and (as of
// 2026-09-09) no exemption just because the run "attempted" zero units.
//
//   billing:      a provider refused for lack of funds. Retrying does nothing;
//                 a human has to add credits. (2026-08-25, the 579-call
//                 Anthropic incident — see lib/providerHealth.js.)
//   quota:        a provider refused for exhausted plan/usage quota. Same
//                 shape as billing — deterministic until a human acts.
//   unavailable:  A REQUIRED INPUT COULD NOT BE READ. This is deterministic
//                 infrastructure failure (a worklist view timed out, a table
//                 could not be reached), never a transient blip, and — this
//                 is the point — NEVER "nothing to do". Added 2026-09-09
//                 after the hourly at-risk photo drain read wf_photo_at_risk,
//                 got PostgREST 500 / 57014 statement timeout, filed
//                 `note="place-photos: wf_photo_at_risk unavailable"` with
//                 attempted=0 failed=0, and was filed as IDLE by both this
//                 classifier (attempted===0 && zero===0 matched first) and
//                 by public.wf_job_health's `dead` expression (also gated on
//                 attempted>0 OR failed>0) — a job that cannot even ATTEMPT
//                 work because its input is gone could stay dead forever and
//                 never page. supabase/migrations/
//                 20260909_wf_job_health_unavailable_is_dead.sql carries the
//                 SAME three prefixes into the SQL `dead` expression so the
//                 two layers cannot drift — scripts/test-job-pulse.mjs counts
//                 both lists and asserts they match.
//
// EXPORTED (not inlined into classifyHealth) so callers that COMPOSE a note —
// app/api/cron/place-photos/route.js, in particular — can ask "does this note
// already carry a deterministic prefix?" before deciding whether to wrap it
// with a job-name prefix that would push the deterministic prefix off column
// 0 and break the `^` anchor. One definition, not a second copy re-derived at
// the call site.
export const DETERMINISTIC_NOTE_PREFIX = /^(billing|quota|unavailable):/i;

/** True when `note` carries a deterministic-failure prefix (see above). */
export function isDeterministicFailureNote(note) {
  return DETERMINISTIC_NOTE_PREFIX.test(String(note || ""));
}

/**
 * Classify health rows into incidents. Pure — no I/O, so the thresholds are
 * unit-testable without a database.
 *
 * A job is an INCIDENT when it attempted real work and succeeded at none of it
 * for DEAD_RUN_THRESHOLD consecutive runs. A job that attempted nothing is IDLE
 * — self-terminating jobs legitimately have nothing to do, and treating that as
 * failure would train everyone to ignore the alert.
 *
 * THE ORDER BELOW IS LOAD-BEARING (2026-09-09). A deterministic-prefix note
 * (see DETERMINISTIC_NOTE_PREFIX above) is checked BEFORE the idle branch, and
 * it is checked without regard to `attempted` or `consecutive_zero` — a run
 * that failed before it could attempt anything still reports attempted=0,
 * and the old order (`zero >= threshold` first, "attempted===0 && zero===0 is
 * idle" second) let that zero silently classify as idle no matter what the
 * note said. Checking the note FIRST closes that hole for every job that
 * fails before it can attempt anything, not just this one.
 */
export function classifyHealth(rows, threshold = DEAD_RUN_THRESHOLD) {
  const incidents = [], healthy = [], idle = [];
  for (const r of rows || []) {
    const attempted = Number(r.attempted || 0);
    const succeeded = Number(r.succeeded || 0);
    const zero = Number(r.consecutive_zero || 0);
    // DETERMINISTIC FAILURE OUTRANKS EVERYTHING ELSE, INCLUDING "IDLE". A
    // deterministic note with nothing succeeded is an incident regardless of
    // attempted (a failed read never gets to attempt) and regardless of
    // consecutive_zero (this classifier pages on the run that PRODUCED the
    // note, it does not wait for public.wf_job_health to have caught up —
    // that RPC gets the same fix in
    // 20260909_wf_job_health_unavailable_is_dead.sql, but this JS layer must
    // not depend on that migration having been applied to page correctly).
    if (isDeterministicFailureNote(r.last_note) && succeeded === 0) {
      incidents.push(r);
      continue;
    }
    if (zero >= threshold) incidents.push(r);
    else if (attempted === 0 && zero === 0) idle.push(r);
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
  return `${r.job}: ${n} consecutive runs failed to produce results ` +
    `(${suc}/${att} succeeded over the window)${r.last_note ? ` — last reason: ${r.last_note}` : ""}`;
}
