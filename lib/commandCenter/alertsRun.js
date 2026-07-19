// lib/commandCenter/alertsRun.js — ONE place that gathers the alert bundle.
// Used by BOTH the /api/command-center/alerts panel (owner is looking) and
// the /api/cron/cc-alerts mailer (owner is not). Extracted so the two can
// never drift: same sources, same baselines, same rules (lib/…/alerts.js).

import { zonedParts, zonedDayStart } from "./time.js";
import { computeAlerts } from "./alerts.js";
import * as fp from "./sources/firstParty.js";
import * as ph from "./sources/posthog.js";
import { tpStats } from "./sources/travelpayouts.js";
import { deploymentsList } from "./sources/vercel.js";
import { sentryIssues } from "./sources/sentry.js";
import { selfCheck, labCWV } from "./sources/synthetic.js";

export async function gatherAlerts(now = new Date()) {
  const p = zonedParts(now);
  const dayStart = zonedDayStart(p);
  const fractionOfDay = Math.max(0.02, (now - dayStart) / 86400000);
  const hist14From = new Date(dayStart.getTime() - 14 * 86400000);
  const cfg = ph.posthogConfigured();
  const miss = () => Promise.resolve(ph.posthogMissing());
  const week = new Date(now.getTime() - 7 * 86400000);

  const [dailyHist, todayK, signupHist, signupToday, cwvField, lab, err24, sentry, syn, deploys, tpToday] = await Promise.all([
    fp.daily(hist14From, dayStart),
    fp.kpis(dayStart, now),
    fp.signups(hist14From, dayStart),
    fp.signups(dayStart, now),
    cfg ? ph.webVitalsField(week, now) : miss(),
    labCWV(),
    cfg ? ph.errorCount24h() : miss(),
    sentryIssues(),
    selfCheck(),
    deploymentsList(),
    tpStats(dayStart, now),
  ]);

  const k = todayK.data || {};
  const signupDays = new Map((signupHist.data || []).map((r) => [r.day, Number(r.signups) || 0]));
  const signupHistory = (dailyHist.data || []).map((d) => ({ day: d.day, signups: signupDays.get(d.day) || 0 }));
  const sources = [
    todayK.source, cwvField.source, lab.source, err24.source, sentry.source, syn.source, deploys.source, tpToday.source,
  ].filter(Boolean);

  const alerts = computeAlerts({
    fractionOfDay,
    dailyHistory: dailyHist.data || [],
    today: { devices: k.active_devices, sessions: k.sessions, out_clicks: k.out_clicks, searches: k.searches, no_result_searches: k.no_result_searches },
    signupsHistory: signupHistory,
    signupsToday: (signupToday.data || []).reduce((a, x) => a + Number(x.signups || 0), 0),
    webVitalsField: cwvField.data,
    labCwv: lab.data,
    errors24h: err24.data && err24.data[0],
    sentryUnresolved: sentry.data ? sentry.data.unresolved_24h : null,
    synthetic: syn.data,
    deployments: deploys.data,
    sources,
    tpRevenue: tpToday.data,
    tpRevenueHistory: null, // needs daily provider imports (phase 2)
  });

  return {
    alerts,
    sources,
    baselineNote: "Baselines are medians of the last complete days (time-of-day adjusted). Rules stay silent until 7 days of history and minimum volume exist — no false alarms off tiny numbers.",
  };
}
