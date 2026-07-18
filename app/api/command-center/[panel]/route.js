// /api/command-center/[panel] — the Command Center's ONE data choke point.
// Owner-only (server-verified — see lib/commandCenter/auth.js), GET-only,
// no-store. Panels: overview | traffic | journey | places | retention |
// health | ops | alerts | meta.
//
// Design rules enforced here:
//   • requireOwner() runs BEFORE any provider call. 401/403/503 carry no data.
//   • Every number in a response sits next to a `source` block (connected /
//     not_configured / error + fetchedAt + confidence + exact nextStep).
//   • Providers are queried server-side only; no credential, device id, or
//     score internal ever enters a response. Account emails appear in EXACTLY
//     one place — the retention panel's owner-eyes-only signup/share tables
//     (explicit owner decision 2026-07-18) — and nowhere else.
//   • All day boundaries are site-local (America/New_York) via
//     lib/commandCenter/time.js — never UTC days.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { requireOwner } from "../../../../lib/commandCenter/auth.js";
import { jsonNoStore } from "../../../../lib/commandCenter/respond.js";
import { rangeFor, comparisonsFor, zonedParts, zonedDayStart } from "../../../../lib/commandCenter/time.js";
import { EVENT_MAP, KPI_DEFS } from "../../../../lib/commandCenter/eventMap.js";
import { computeAlerts } from "../../../../lib/commandCenter/alerts.js";
import * as fp from "../../../../lib/commandCenter/sources/firstParty.js";
import * as ph from "../../../../lib/commandCenter/sources/posthog.js";
import { tpStats } from "../../../../lib/commandCenter/sources/travelpayouts.js";
import { repoSnapshot } from "../../../../lib/commandCenter/sources/github.js";
import { runtimeDeployment, deploymentsList } from "../../../../lib/commandCenter/sources/vercel.js";
import { sentryIssues } from "../../../../lib/commandCenter/sources/sentry.js";
import { selfCheck, integrationsStatus, labCWV } from "../../../../lib/commandCenter/sources/synthetic.js";

function parseRange(searchParams, now) {
  const key = String(searchParams.get("range") || "today");
  const custom = key === "custom"
    ? { from: searchParams.get("from"), to: searchParams.get("to") }
    : null;
  const range = rangeFor(["today", "yesterday", "7d", "30d", "month", "last_month", "custom"].includes(key) ? key : "today", now, undefined, custom);
  return range;
}

const rangeOut = (r) => ({ key: r.key, label: r.label, from: r.from.toISOString(), to: r.to.toISOString(), complete: r.complete, days: r.days });

// KPI + its comparison values from first-party kpis() over each window.
async function fpWithComps(range, comps) {
  const [cur, ...prev] = await Promise.all([
    fp.kpis(range.from, range.to),
    ...comps.map((c) => fp.kpis(c.from, c.to)),
  ]);
  return { cur, prev: prev.map((p, i) => ({ ...comps[i], from: comps[i].from.toISOString(), to: comps[i].to.toISOString(), kpis: p.data, source: p.source })) };
}

async function phWithComps(range, comps) {
  const [cur, ...prev] = await Promise.all([
    ph.overviewCounts(range.from, range.to),
    ...comps.map((c) => ph.overviewCounts(c.from, c.to)),
  ]);
  return { cur, prev: prev.map((p, i) => ({ ...comps[i], from: comps[i].from.toISOString(), to: comps[i].to.toISOString(), counts: p.data && p.data[0], source: p.source })) };
}

async function overview(now, range, comps) {
  const [liveFp, livePh, fpk, phk, signupsCur, signupsComps, totals, tpToday, err24, sentry, syn] = await Promise.all([
    fp.liveNow(),
    ph.posthogConfigured() ? ph.liveNow() : Promise.resolve(ph.posthogMissing()),
    fpWithComps(range, comps),
    phWithComps(range, comps),
    fp.signups(range.from, range.to),
    Promise.all(comps.map((c) => fp.signups(c.from, c.to))),
    fp.userTotals(),
    tpStats(range.from, range.to),
    ph.posthogConfigured() ? ph.errorCount24h() : Promise.resolve(ph.posthogMissing()),
    sentryIssues(),
    selfCheck(),
  ]);

  const sumSignups = (r) => (r && r.data ? r.data.reduce((a, x) => a + Number(x.signups || 0), 0) : null);
  const checks = syn.data && syn.data.checks ? syn.data.checks : [];
  const healthOk = checks.length ? checks.every((c) => c.ok) : null;

  return {
    live: {
      firstParty: { source: liveFp.source, devices: liveFp.data ? liveFp.data.devices : null, def: KPI_DEFS.live_now },
      posthog: { source: livePh.source, visitors: livePh.data && livePh.data[0] ? livePh.data[0].visitors : null },
    },
    firstParty: { source: fpk.cur.source, kpis: fpk.cur.data, comparisons: fpk.prev },
    posthog: { source: phk.cur.source, counts: phk.cur.data && phk.cur.data[0], comparisons: phk.prev },
    signups: {
      source: signupsCur.source,
      current: sumSignups(signupsCur),
      comparisons: comps.map((c, i) => ({ key: c.key, label: c.label, value: sumSignups(signupsComps[i]) })),
      totals: { source: totals.source, data: totals.data },
    },
    affiliate: { travelpayouts: tpToday },
    errors: {
      posthog24h: { source: err24.source, data: err24.data && err24.data[0] },
      sentry: sentry,
    },
    health: { source: syn.source, ok: healthOk, failing: checks.filter((c) => !c.ok).map((c) => c.label) },
    definitions: KPI_DEFS,
  };
}

async function traffic(range) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const cfg = ph.posthogConfigured();
  const miss = () => Promise.resolve(ph.posthogMissing());
  const [fpMin, fpDaily, phLiveMin, phDaily, channels, referrers, utms, pages, devices, viewports, geo, nvr, entryExit, fpRef] = await Promise.all([
    fp.minutes(hourAgo, now),
    fp.daily(range.from, range.to),
    cfg ? ph.liveByMinute() : miss(),
    cfg ? ph.dailyTraffic(range.from, range.to) : miss(),
    cfg ? ph.channels(range.from, range.to) : miss(),
    cfg ? ph.referrers(range.from, range.to) : miss(),
    cfg ? ph.utms(range.from, range.to) : miss(),
    cfg ? ph.topPages(range.from, range.to) : miss(),
    cfg ? ph.devices(range.from, range.to) : miss(),
    cfg ? ph.viewports(range.from, range.to) : miss(),
    cfg ? ph.geo(range.from, range.to) : miss(),
    cfg ? ph.newVsReturning(range.from, range.to) : miss(),
    cfg ? ph.entryExit(range.from, range.to) : miss(),
    fp.breakdown(range.from, range.to, "referrer", 10),
  ]);
  return {
    liveMinutes: { firstParty: fpMin, posthog: phLiveMin },
    daily: { firstParty: fpDaily, posthog: phDaily },
    channels, referrers, utms, pages, devices, viewports,
    geo: { ...geo, privacyNote: "Aggregated to country/region with a minimum of 3 visitors per row — no city-level rows below threshold, never precise locations." },
    newVsReturning: nvr,
    entryExit,
    firstPartyReferrers: fpRef,
  };
}

async function journey(range) {
  const [funnel, searches, noResults, screens, categories, curated, shareKinds, kpis, nvr] = await Promise.all([
    fp.funnel(range.from, range.to),
    fp.breakdown(range.from, range.to, "search", 12),
    fp.breakdown(range.from, range.to, "no_result", 12),
    fp.breakdown(range.from, range.to, "screen", 12),
    fp.breakdown(range.from, range.to, "category", 12),
    fp.breakdown(range.from, range.to, "curated", 10),
    fp.breakdown(range.from, range.to, "share_kind", 10),
    fp.kpis(range.from, range.to),
    fp.newReturning(range.from, range.to),
  ]);
  const k = kpis.data || {};
  const rate = (a, b) => (b > 0 ? a / b : null);
  return {
    funnel, searches, noResults, screens, categories, curated, shareKinds,
    rates: {
      source: kpis.source,
      data: {
        save_rate: rate(k.saves, k.detail_opens),
        share_rate: rate(k.shares, k.detail_opens),
        directions_rate: rate(k.directions, k.detail_opens),
        out_click_rate: rate(k.out_clicks, k.detail_opens),
        engage_rate: rate(k.engaged_devices, k.active_devices),
        no_result_rate: rate(k.no_result_searches, (k.searches || 0) + (k.no_result_searches || 0)),
        denominators: { detail_opens: k.detail_opens || 0, active_devices: k.active_devices || 0, searches: (k.searches || 0) + (k.no_result_searches || 0) },
      },
    },
    newVsReturning: nvr,
    eventMap: EVENT_MAP,
  };
}

async function places(range) {
  const [views, saves, shares, likes, directions, outs, outProviders, outSrc, kpis, tp] = await Promise.all([
    fp.topPlaces(range.from, range.to, "view", 5),
    fp.topPlaces(range.from, range.to, "save", 5),
    fp.topPlaces(range.from, range.to, "share", 5),
    fp.topPlaces(range.from, range.to, "like", 5),
    fp.topPlaces(range.from, range.to, "directions", 5),
    fp.topPlaces(range.from, range.to, "out", 5),
    fp.breakdown(range.from, range.to, "out_provider", 10),
    fp.breakdown(range.from, range.to, "out_src", 10),
    fp.kpis(range.from, range.to),
    tpStats(range.from, range.to),
  ]);
  const k = kpis.data || {};
  return {
    top: { views, saves, shares, likes, directions, outs },
    affiliate: {
      providers: outProviders,
      placements: outSrc,
      travelpayouts: tp,
      integrityNote: "Affiliate availability and payout NEVER feed Wayfind Scores or editorial ranking — reporting here is read-only and fully separate from lib/score.js / lib/ranking.js.",
    },
    conversion: {
      source: kpis.source,
      data: {
        detail_opens: k.detail_opens || 0,
        engaged_devices: k.engaged_devices || 0,
        out_clicks: k.out_clicks || 0,
        view_to_engage: k.detail_opens > 0 ? (k.engaged_devices || 0) / k.detail_opens : null,
      },
    },
  };
}

async function retention(range, now) {
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const [signupSeries, totals, ret, cohorts, nvr, recentSignups, recentShares] = await Promise.all([
    fp.signups(range.from, range.to),
    fp.userTotals(),
    fp.retention(since30, now),
    fp.cohortsWeekly(8),
    fp.newReturning(range.from, range.to),
    fp.recentSignups(50),
    fp.recentShares(30),
  ]);
  return {
    signups: signupSeries, totals, retention: ret, cohorts, newVsReturning: nvr,
    recentSignups, recentShares,
    piiNote: "Owner-eyes only: these two tables contain account emails — the one deliberate exception to the dashboard's no-PII rule (owner decision 2026-07-18).",
    definitionNote: "Retention is device-based (anonymous device ids; larger honest sample). The weekly cohort table is account-based: signed-in activity by weeks since signup. Internal traffic — the owner's accounts and every device that ever signed in as them — is excluded from all first-party numbers (server-side list). No bot filter exists in the current SDK config.",
  };
}

async function health(range) {
  const cfg = ph.posthogConfigured();
  const miss = () => Promise.resolve(ph.posthogMissing());
  const [syn, integrations, cwvField, cwvRoutes, lab, errDaily, err24, sentry] = await Promise.all([
    selfCheck(),
    Promise.resolve(integrationsStatus()),
    cfg ? ph.webVitalsField(range.from, range.to) : miss(),
    cfg ? ph.webVitalsByRoute(range.from, range.to) : miss(),
    labCWV(),
    cfg ? ph.errorsDaily(range.from, range.to) : miss(),
    cfg ? ph.errorCount24h() : miss(),
    sentryIssues(),
  ]);
  return {
    synthetic: syn, integrations,
    webVitals: { field: cwvField, byRoute: cwvRoutes, lab, thresholds: { LCP: 2500, INP: 200, CLS: 0.1 }, note: "Field = real visits (web_vitals event, p75). Lab = hourly PageSpeed cron (cwv_runs table)." },
    errors: { daily: errDaily, last24h: err24, sentry },
    uptime: { source: { name: "Uptime monitor", connected: false, reason: "not_configured", nextStep: "No uptime vendor is configured. Recommended: point UptimeRobot (free) or BetterStack at https://www.gowayfind.com and /api/geo; alerts land in email. The synthetic self-check above is a single-region spot check, not history.", confidence: "unavailable" }, data: null },
  };
}

async function ops() {
  const [gh, deploys] = await Promise.all([repoSnapshot(), deploymentsList()]);
  const rt = runtimeDeployment();
  let buildInfo = null;
  try { buildInfo = process.env.WF_CC_BUILD_INFO ? JSON.parse(process.env.WF_CC_BUILD_INFO) : null; } catch { buildInfo = null; }
  return {
    runtime: rt,
    deployments: deploys,
    repo: gh,
    build: {
      source: { name: "Build stamp", connected: !!buildInfo, ...(buildInfo ? { fetchedAt: process.env.WF_CC_BUILD_TIME || null, confidence: "measured" } : { reason: "not_configured", nextStep: "Build info is injected by next.config.js at build time; it appears after the next deploy.", confidence: "unavailable" }) },
      data: buildInfo,
      note: "Files/lines counted at build time over app/, lib/, scripts/ — operational context, not a product metric.",
    },
    quality: {
      coverage: { source: { name: "Test coverage", connected: false, reason: "not_configured", nextStep: "No coverage tool is configured (the repo uses assertion locks via `npm run prebuild`, not coverage). If you want a % number, wire c8 into a CI step first — it will not be shown until truly measured.", confidence: "unavailable" }, data: null },
      vulnerabilities: { source: { name: "Dependency scanner", connected: false, reason: "not_configured", nextStep: "No scanner is configured. Enable GitHub Dependabot alerts on wallstreethyena/Wayfind (Settings → Code security) or add `npm audit` to CI; results will surface here once a real scanner exists.", confidence: "unavailable" }, data: null },
    },
  };
}

async function alertsPanel(now) {
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
  return { alerts, baselineNote: "Baselines are medians of the last complete days (time-of-day adjusted). Rules stay silent until 7 days of history and minimum volume exist — no false alarms off tiny numbers.", sources };
}

export async function GET(req, ctx) {
  const auth = await requireOwner(req);
  if (!auth.ok) return jsonNoStore(auth.body, auth.status);

  const params = ctx && ctx.params ? await ctx.params : {};
  const panel = String(params.panel || "");
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const range = parseRange(searchParams, now);
  const comps = comparisonsFor(range, now);

  try {
    let data;
    switch (panel) {
      case "overview": data = await overview(now, range, comps); break;
      case "traffic": data = await traffic(range); break;
      case "journey": data = await journey(range); break;
      case "places": data = await places(range); break;
      case "retention": data = await retention(range, now); break;
      case "health": data = await health(range); break;
      case "ops": data = await ops(); break;
      case "alerts": data = await alertsPanel(now); break;
      case "meta": data = { eventMap: EVENT_MAP, definitions: KPI_DEFS, authMode: auth.mode }; break;
      default: return jsonNoStore({ ok: false, reason: "unknown_panel" }, 404);
    }
    return jsonNoStore({
      ok: true, panel, generatedAt: now.toISOString(),
      range: rangeOut(range),
      comparisons: comps.map((c) => ({ key: c.key, label: c.label, from: c.from.toISOString(), to: c.to.toISOString() })),
      data,
    });
  } catch (e) {
    // A panel-level failure must never leak internals — short reason only.
    return jsonNoStore({ ok: false, panel, reason: "panel_failed", note: String((e && e.message) || "error").slice(0, 200) }, 500);
  }
}
