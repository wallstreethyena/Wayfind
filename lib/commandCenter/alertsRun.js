// lib/commandCenter/alertsRun.js — ONE place that gathers the alert bundle.
// Used by BOTH the /api/command-center/alerts panel (owner is looking) and
// the /api/cron/cc-alerts mailer (owner is not). Extracted so the two can
// never drift: same sources, same baselines, same rules (lib/…/alerts.js).

import { zonedParts, zonedDayStart, dayStr } from "./time.js";
import { memTTL } from "./cache.js";
import { gatherTrafficPace } from "./trafficPace.js";
import { computeAlerts } from "./alerts.js";
import { comparableTrafficDays, trafficTrackingState } from "./trafficDataQuality.js";
import * as fp from "./sources/firstParty.js";
import * as ph from "./sources/posthog.js";
import { tpStats } from "./sources/travelpayouts.js";
import { deploymentsList } from "./sources/vercel.js";
import { sentryIssues } from "./sources/sentry.js";
import { selfCheck, labCWV, dataFreshness } from "./sources/synthetic.js";
import { photoServing, photoQuotaBreaker } from "./sources/photos.js";
import { photoGoogleQuota } from "./sources/photoQuota.js";
import { COUPON_AUDIT_FUSES } from "../couponAuditFuses.js";
import { siteTodayStr } from "../siteTime.js";

export async function gatherAlerts(now = new Date()) {
  const p = zonedParts(now);
  const dayStart = zonedDayStart(p);
  const fractionOfDay = Math.max(0, (now - dayStart) / 86400000);
  // Stable five-minute windows bound cached baseline reads. Today and every
  // historical sample share this cutoff; never compare mismatched windows.
  const trafficAsOf = new Date(Math.floor(now.getTime() / 300000) * 300000);
  const hist14From = zonedDayStart(zonedParts(new Date(dayStart.getTime() - 14 * 86400000 + 12 * 3600000)));
  const cfg = ph.posthogConfigured();
  const miss = () => Promise.resolve(ph.posthogMissing());
  const week = new Date(now.getTime() - 7 * 86400000);

  const dailyPromise = fp.daily(hist14From, dayStart);
  const pacePromise = dailyPromise.then((result) => result.source.connected === true
    ? memTTL(`traffic-pace:${+trafficAsOf}`, 5 * 60 * 1000, () => gatherTrafficPace(result.data, trafficAsOf, fp.kpis))
    : { source: result.source, data: null });

  const [dailyHist, trafficPace, todayK, signupHist, signupToday, cwvField, lab, err24, boundary1h, chunk1h, sentry, syn, deploys, tpToday, freshness, photos, quotaBreaker, googleQuota] = await Promise.all([
    dailyPromise,
    pacePromise,
    fp.kpis(dayStart, trafficAsOf),
    fp.signups(hist14From, dayStart),
    fp.signups(dayStart, now),
    cfg ? ph.webVitalsField(week, now) : miss(),
    labCWV(),
    cfg ? ph.errorCount24h() : miss(),
    cfg ? ph.boundaryErrorsByBuild() : miss(),
    cfg ? ph.chunkFailuresHour() : miss(),
    sentryIssues(),
    selfCheck(),
    deploymentsList(),
    tpStats(dayStart, now),
    dataFreshness(),
    photoServing({ now }),
    photoQuotaBreaker({ now }),
    photoGoogleQuota({ now }),
  ]);

  return buildAlertsReport({ fractionOfDay, todayKey: dayStr(dayStart), asOf: now, dailyHist, trafficPace, trafficAsOf, todayK, signupHist, signupToday,
    cwvField, lab, err24, boundary1h, chunk1h, sentry, syn, deploys, tpToday, freshness, photos, quotaBreaker, googleQuota,
    couponAudit: { today: siteTodayStr(now), fuses: COUPON_AUDIT_FUSES } });
}

// Source failures are not measured zeroes. Keep the assembly testable without
// provider calls so an outage cannot masquerade as a traffic/signup collapse.
export function buildAlertsReport({ fractionOfDay, todayKey, asOf, dailyHist, trafficPace, trafficAsOf, todayK, signupHist, signupToday,
  cwvField, lab, err24, boundary1h, chunk1h, sentry, syn, deploys, tpToday, freshness, photos, quotaBreaker, googleQuota, couponAudit }) {
  const connectedData = (result) => result?.source?.connected === true && result.source.confidence !== "stale-cache" ? result.data : null;
  const k = connectedData(todayK);
  const history = connectedData(dailyHist);
  const trafficHistory = comparableTrafficDays(history);
  const signupRows = connectedData(signupToday);
  const signupHistoryRows = connectedData(signupHist);
  const signupDays = new Map((signupHistoryRows || []).map((r) => [r.day, Number(r.signups) || 0]));
  const signupHistory = (history || []).map((d) => ({ day: d.day, signups: signupDays.get(d.day) || 0 }));
  const sources = [
    dailyHist.source, trafficPace?.source, todayK.source, signupHist.source, signupToday.source, cwvField.source, lab.source, err24.source, boundary1h.source, sentry.source, syn.source, deploys.source, tpToday.source, freshness.source, photos && photos.source, quotaBreaker && quotaBreaker.source,
    // googleQuota.source is deliberately NOT listed: an unreadable count must mean "no pacing alert",
    // not a source_errors page (the photos_quota_exhausted breaker alert still covers the real outage).
  ].filter(Boolean);

  const alerts = computeAlerts({
    fractionOfDay,
    asOf,
    dailyHistory: history || [],
    trafficHistory,
    trafficPaceHistory: comparableTrafficDays(connectedData(trafficPace)),
    trafficAsOf,
    trafficTracking: trafficTrackingState(todayKey, asOf),
    today: k ? { devices: k.active_devices, sessions: k.sessions, out_clicks: k.out_clicks, searches: k.searches, no_result_searches: k.no_result_searches } : null,
    signupsHistory: signupHistoryRows ? signupHistory : [],
    signupsToday: signupRows ? signupRows.reduce((a, x) => a + Number(x.signups || 0), 0) : null,
    webVitalsField: cwvField.data,
    labCwv: lab.data,
    errors24h: err24.data && err24.data[0],
    // Per-build, per-hour boundary crashes — the dimension errors24h cannot express.
    boundaryErrors: { windowHours: 1, byBuild: boundary1h.data || [] },
    // Scripts that never arrived (chunk failures) — a delivery problem, counted apart from crashes.
    chunkFailures: { windowHours: 1, byBuild: (chunk1h && chunk1h.data) || [] },
    sentryUnresolved: sentry.data ? sentry.data.unresolved_24h : null,
    synthetic: syn.data,
    deployments: deploys.data,
    sources,
    tpRevenue: tpToday.data,
    tpRevenueHistory: null, // needs daily provider imports (phase 2)
    dataFreshness: freshness.data,
    photoServing: photos ? photos.data : null,
    photoQuotaBreaker: quotaBreaker && quotaBreaker.source && quotaBreaker.source.connected === true ? quotaBreaker.data : null,
    googlePhotoQuota: googleQuota && googleQuota.source && googleQuota.source.connected === true ? googleQuota.data : null,
    couponAudit: couponAudit || null,
  });

  return {
    alerts,
    sources,
    baselineNote: `Traffic baselines use only complete repaired-era ET days on or after Sep 20 (${trafficHistory.length} comparable day${trafficHistory.length === 1 ? "" : "s"} available; 7 required). Traffic alerts compare measured midnight-to-the-same-ET-clock counts, using a shared five-minute cutoff (${comparableTrafficDays(connectedData(trafficPace)).length} same-time samples available); missing comparisons never become estimated traffic. Other rules retain their own history and volume minimums.`,
  };
}
