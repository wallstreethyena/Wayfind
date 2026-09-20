// lib/commandCenter/alertsRun.js — ONE place that gathers the alert bundle.
// Used by BOTH the /api/command-center/alerts panel (owner is looking) and
// the /api/cron/cc-alerts mailer (owner is not). Extracted so the two can
// never drift: same sources, same baselines, same rules (lib/…/alerts.js).

import { zonedParts, zonedDayStart, dayStr } from "./time.js";
import { computeAlerts } from "./alerts.js";
import { comparableTrafficDays, trafficTrackingState } from "./trafficDataQuality.js";
import * as fp from "./sources/firstParty.js";
import * as ph from "./sources/posthog.js";
import { tpStats } from "./sources/travelpayouts.js";
import { deploymentsList } from "./sources/vercel.js";
import { sentryIssues } from "./sources/sentry.js";
import { selfCheck, labCWV, dataFreshness } from "./sources/synthetic.js";

export async function gatherAlerts(now = new Date()) {
  const p = zonedParts(now);
  const dayStart = zonedDayStart(p);
  const fractionOfDay = Math.max(0.02, (now - dayStart) / 86400000);
  const hist14From = new Date(dayStart.getTime() - 14 * 86400000);
  const cfg = ph.posthogConfigured();
  const miss = () => Promise.resolve(ph.posthogMissing());
  const week = new Date(now.getTime() - 7 * 86400000);

  const [dailyHist, todayK, signupHist, signupToday, cwvField, lab, err24, boundary1h, sentry, syn, deploys, tpToday, freshness] = await Promise.all([
    fp.daily(hist14From, dayStart),
    fp.kpis(dayStart, now),
    fp.signups(hist14From, dayStart),
    fp.signups(dayStart, now),
    cfg ? ph.webVitalsField(week, now) : miss(),
    labCWV(),
    cfg ? ph.errorCount24h() : miss(),
    cfg ? ph.boundaryErrorsByBuild() : miss(),
    sentryIssues(),
    selfCheck(),
    deploymentsList(),
    tpStats(dayStart, now),
    dataFreshness(),
  ]);

  return buildAlertsReport({ fractionOfDay, todayKey: dayStr(dayStart), asOf: now, dailyHist, todayK, signupHist, signupToday,
    cwvField, lab, err24, boundary1h, sentry, syn, deploys, tpToday, freshness });
}

// Source failures are not measured zeroes. Keep the assembly testable without
// provider calls so an outage cannot masquerade as a traffic/signup collapse.
export function buildAlertsReport({ fractionOfDay, todayKey, asOf, dailyHist, todayK, signupHist, signupToday,
  cwvField, lab, err24, boundary1h, sentry, syn, deploys, tpToday, freshness }) {
  const connectedData = (result) => result?.source?.connected === true ? result.data : null;
  const k = connectedData(todayK);
  const history = connectedData(dailyHist);
  const trafficHistory = comparableTrafficDays(history);
  const signupRows = connectedData(signupToday);
  const signupHistoryRows = connectedData(signupHist);
  const signupDays = new Map((signupHistoryRows || []).map((r) => [r.day, Number(r.signups) || 0]));
  const signupHistory = (history || []).map((d) => ({ day: d.day, signups: signupDays.get(d.day) || 0 }));
  const sources = [
    dailyHist.source, todayK.source, signupHist.source, signupToday.source, cwvField.source, lab.source, err24.source, boundary1h.source, sentry.source, syn.source, deploys.source, tpToday.source, freshness.source,
  ].filter(Boolean);

  const alerts = computeAlerts({
    fractionOfDay,
    dailyHistory: history || [],
    trafficHistory,
    trafficTracking: trafficTrackingState(todayKey, asOf),
    today: k ? { devices: k.active_devices, sessions: k.sessions, out_clicks: k.out_clicks, searches: k.searches, no_result_searches: k.no_result_searches } : null,
    signupsHistory: signupHistoryRows ? signupHistory : [],
    signupsToday: signupRows ? signupRows.reduce((a, x) => a + Number(x.signups || 0), 0) : null,
    webVitalsField: cwvField.data,
    labCwv: lab.data,
    errors24h: err24.data && err24.data[0],
    // Per-build, per-hour boundary crashes — the dimension errors24h cannot express.
    boundaryErrors: { windowHours: 1, byBuild: boundary1h.data || [] },
    sentryUnresolved: sentry.data ? sentry.data.unresolved_24h : null,
    synthetic: syn.data,
    deployments: deploys.data,
    sources,
    tpRevenue: tpToday.data,
    tpRevenueHistory: null, // needs daily provider imports (phase 2)
    dataFreshness: freshness.data,
  });

  return {
    alerts,
    sources,
    baselineNote: `Traffic baselines use only complete repaired-era ET days on or after Sep 20 (${trafficHistory.length} comparable day${trafficHistory.length === 1 ? "" : "s"} available; 7 required). Pace estimates scale the clean-day median by the elapsed share of today; other rules retain their own history and volume minimums.`,
  };
}
