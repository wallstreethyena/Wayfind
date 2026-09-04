// lib/revenueHeartbeat.js — detects the "silent zero" signature: affiliate
// CTAs/clicks collapse toward zero WHILE TRAFFIC IS STILL PRESENT.
//
// WHY RATIO, NOT ABSOLUTE COUNT. An absolute floor ("alert if fewer than N
// affiliate clicks in the window") pages on a quiet Tuesday night and stays
// silent through a real outage that happens to land during a quiet stretch —
// wrong in both directions. This compares the CURRENT affiliate-activity /
// traffic ratio against a trailing BASELINE ratio, and only calls it an
// incident when traffic is itself healthy (there were enough visitors to
// judge from) and the ratio — not the count — has collapsed. A slow night
// where both numbers drop together is healthy: the ratio survives. A CHECK_ENV
// class incident (lib/envPlaceholder.js — a placeholder PID makes every
// Viator link fail closed) drops affiliate activity to near-zero while
// traffic is unaffected: the ratio collapses and this fires.
//
// Deliberately pure — no network, no Supabase, no PostHog. The live caller
// (app/api/cron/revenue-heartbeat/route.js) gathers the two counts and the
// baseline and hands them here; this file is what scripts/test-revenue-
// heartbeat.mjs can red-prove hermetically.

// Below this many visits in the window, the sample is too small to trust a
// ratio at all — a single visitor who does not click is a 0% "collapse" that
// means nothing. This is the ratio-based analogue of jobPulse's "attempted=0
// is idle, not an incident": here attempted is nonzero but too small to judge.
export const MIN_TRAFFIC_FOR_SIGNAL = 30;

// The current ratio must fall below this fraction of the baseline ratio to be
// called a collapse. 0.2 = the current rate is under a fifth of normal.
// Deliberately not "affiliate count near zero" — a real partial degrade
// (one of several providers going dark) should still trip this well before
// the count hits literal zero.
export const COLLAPSE_FRACTION = 0.2;

/**
 * Judge one window against a trailing baseline. Pure; never throws.
 *
 * @param {object} input
 * @param {number} input.trafficCount    visits/pageviews in the CURRENT window
 * @param {number} input.affiliateCount  affiliate CTA impressions+clicks (or
 *                                       redirect starts) in the CURRENT window
 * @param {number|null} input.baselineRatio  affiliateCount/trafficCount over a
 *                                       trailing historical period, or null/NaN
 *                                       when there is not enough history yet
 * @param {number} [input.minTraffic]        override MIN_TRAFFIC_FOR_SIGNAL
 * @param {number} [input.collapseFraction]  override COLLAPSE_FRACTION
 * @returns {{status:'idle'|'no_baseline'|'incident'|'healthy', ratio:number|null,
 *            baselineRatio:number|null, reason:string}}
 */
export function revenueSignal({
  trafficCount,
  affiliateCount,
  baselineRatio,
  minTraffic = MIN_TRAFFIC_FOR_SIGNAL,
  collapseFraction = COLLAPSE_FRACTION,
} = {}) {
  const traffic = Math.max(0, Math.floor(Number(trafficCount) || 0));
  const affiliate = Math.max(0, Math.floor(Number(affiliateCount) || 0));
  const baseline = Number(baselineRatio);

  if (traffic < minTraffic) {
    return {
      status: "idle",
      ratio: null,
      baselineRatio: Number.isFinite(baseline) ? baseline : null,
      reason: `traffic ${traffic} is below the minimum ${minTraffic} to judge a ratio — too quiet to call this an incident either way`,
    };
  }
  if (!Number.isFinite(baseline) || baseline <= 0) {
    return {
      status: "no_baseline",
      ratio: traffic > 0 ? affiliate / traffic : null,
      baselineRatio: null,
      reason: "no positive historical baseline ratio yet — cannot judge a collapse without something to compare against",
    };
  }

  const ratio = affiliate / traffic;
  const floor = baseline * collapseFraction;
  if (ratio < floor) {
    return {
      status: "incident",
      ratio,
      baselineRatio: baseline,
      reason: `affiliate/traffic ratio ${ratio.toFixed(4)} is below ${(collapseFraction * 100).toFixed(0)}% of the ${baseline.toFixed(4)} baseline while traffic is healthy (${traffic} >= ${minTraffic}) — silent-zero-revenue signature`,
    };
  }
  return {
    status: "healthy",
    ratio,
    baselineRatio: baseline,
    reason: `ratio ${ratio.toFixed(4)} is within normal range of the ${baseline.toFixed(4)} baseline`,
  };
}

/**
 * A trailing baseline ratio from a list of historical {trafficCount,
 * affiliateCount} windows (e.g. one per day for the last 14 days).
 *
 * SUMS FIRST, THEN DIVIDES — never the average of per-day ratios. Averaging
 * ratios lets a single near-zero-traffic day (where the day's own ratio is
 * wild noise, e.g. 1 click / 2 visits = 0.5) dominate the baseline as much as
 * a normal 5,000-visit day. Summing counts first weights every day by its
 * actual volume, which is the same reasoning classifyHealth in lib/jobPulse.js
 * uses per-run rather than per-job-family.
 *
 * @returns {number|null} null when there is no traffic at all in the history
 */
export function baselineRatioFromHistory(rows) {
  let traffic = 0;
  let affiliate = 0;
  for (const r of rows || []) {
    traffic += Math.max(0, Math.floor(Number(r && r.trafficCount) || 0));
    affiliate += Math.max(0, Math.floor(Number(r && r.affiliateCount) || 0));
  }
  return traffic > 0 ? affiliate / traffic : null;
}

/**
 * Render a revenueSignal() result as a wf_job_pulse row shape, so the live
 * route and any dashboard agree on what a heartbeat run produced. Reuses the
 * SAME attempted/succeeded/note contract every other metered job in this repo
 * already writes (lib/jobPulse.js recordPulse) — this is deliberately NOT a
 * new alert path. attempted is the traffic count (the job "had work to
 * judge"); succeeded is the traffic count again when healthy/no_baseline/idle
 * (nothing is wrong) and 0 when it is an incident, so job-watch's existing
 * "attempted>0, succeeded=0" dead-run detector — the same one that pages on
 * atlas-build and provider circuit breaks — covers delivery for free.
 */
export function toPulseRow(signal, { trafficCount, affiliateCount }) {
  const attempted = Math.max(0, Math.floor(Number(trafficCount) || 0));
  const isIncident = signal.status === "incident";
  return {
    attempted,
    succeeded: isIncident ? 0 : attempted,
    note: `${signal.status}: ${signal.reason} (affiliate=${Math.max(0, Math.floor(Number(affiliateCount) || 0))})`.slice(0, 200),
  };
}
