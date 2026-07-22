// lib/commandCenter/alerts.js — the actionable-alerts engine. PURE: takes the
// already-fetched panel bundle, returns alert objects; no network, so the unit
// lock (scripts/test-command-center.mjs) exercises every rule with fixtures.
//
// Anti-noise rules, in priority order:
//   1. A DISCONNECTED source never alerts on "its" metric (a missing PostHog
//      key is a setup note, not a traffic drop). Connection gaps surface as
//      one 'info' item, not as metric alarms.
//   2. Baselines need history: traffic/signup/conversion rules stay silent
//      until >= MIN_BASELINE_DAYS complete days exist in the window.
//   3. Ratios need volume: no-result-rate and conversion rules require a
//      minimum denominator before they may fire.
//   4. Every alert carries {current, baseline} so the UI states the comparison
//      instead of a bare adjective, plus an anchor into the relevant section.
//
// Severity: critical (site broken / money broken) > warn (trend broken) >
// info (setup / freshness).

export const MIN_BASELINE_DAYS = 7;

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const median = (arr) => {
  const a = arr.map(num).filter((x) => isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

function alert(id, severity, title, detail, extra = {}) {
  return { id, severity, title, detail, ...extra };
}

// bundle: {
//   fractionOfDay        0..1 (how much of the ET day has elapsed)
//   dailyHistory         [{day, devices, sessions, out_clicks, no_results, searches}] complete days, oldest→newest (today EXCLUDED)
//   today                {devices, sessions, out_clicks, searches, no_result_searches}
//   signupsHistory       [{day, signups}] complete days
//   signupsToday         number|null
//   webVitalsField       [{metric, device, p75, samples}] | null
//   labCwv               [{url, lcp_ms, cls}] | null
//   errors24h            {exceptions, app_errors}|null,  sentryUnresolved number|null
//   synthetic            {checks:[{label,ok,status,ms}]}|null
//   deployments          [{state,target,created}]|null
//   sources              [{name, connected, reason, nextStep}]
//   tpRevenue            {confirmed_bookings, revenue_paid_usd}|null
//   dataFreshness        [{pipeline, last_success, hours_since}] | null
// }
export function computeAlerts(bundle) {
  const out = [];
  const b = bundle || {};
  const frac = Math.min(1, Math.max(0.02, num(b.fractionOfDay) || 0.02));
  const hist = Array.isArray(b.dailyHistory) ? b.dailyHistory : [];

  // — Site down / broken endpoints (synthetic; fires regardless of baselines) —
  if (b.synthetic && Array.isArray(b.synthetic.checks)) {
    const bad = b.synthetic.checks.filter((c) => !c.ok);
    if (bad.length) {
      out.push(alert("site_check_failed", bad.some((c) => c.key === "home") ? "critical" : "warn",
        bad.some((c) => c.key === "home") ? "Production homepage is failing its self-check" : "An endpoint is failing its self-check",
        bad.map((c) => `${c.label}: ${c.error || "HTTP " + c.status} (${c.ms}ms)`).join(" · "),
        { anchor: "health", current: `${bad.length} failing`, baseline: "all checks passing" }));
    }
    const slow = (b.synthetic.checks || []).filter((c) => c.ok && c.ms > 3000);
    if (slow.length) {
      out.push(alert("site_check_slow", "warn", "Slow responses from production",
        slow.map((c) => `${c.label} ${c.ms}ms`).join(" · "), { anchor: "health", current: `${slow[0].ms}ms`, baseline: "< 3000ms" }));
    }
  }

  // — Traffic vs baseline —
  if (hist.length >= MIN_BASELINE_DAYS && b.today) {
    const base = median(hist.map((d) => d.devices));
    if (base != null && base >= 10) {
      const expected = base * frac;
      const cur = num(b.today.devices);
      if (expected >= 5 && cur < expected * 0.5) {
        out.push(alert("traffic_drop", "warn", "Traffic is materially below baseline",
          `Active devices today are tracking at ${cur} vs ~${Math.round(expected)} expected by this time (median of last ${hist.length} days, time-adjusted).`,
          { anchor: "traffic", current: String(cur), baseline: `~${Math.round(expected)} by now` }));
      }
    }
  }

  // — No-result searches rising —
  if (hist.length >= MIN_BASELINE_DAYS && b.today) {
    const histSearches = hist.reduce((a, d) => a + num(d.searches), 0);
    const histNoRes = hist.reduce((a, d) => a + num(d.no_results), 0);
    const todayDen = num(b.today.searches) + num(b.today.no_result_searches);
    if (histSearches + histNoRes >= 50 && todayDen >= 10) {
      const baseRate = histNoRes / Math.max(1, histSearches + histNoRes);
      const curRate = num(b.today.no_result_searches) / todayDen;
      if (curRate > Math.max(0.15, baseRate * 1.5)) {
        out.push(alert("no_results_spike", "warn", "Empty-result searches are spiking",
          `${Math.round(curRate * 100)}% of today's searches/browses hit an empty state vs ${Math.round(baseRate * 100)}% baseline. Top gaps are listed in the Journey section.`,
          { anchor: "journey", current: `${Math.round(curRate * 100)}%`, baseline: `${Math.round(baseRate * 100)}%` }));
      }
    }
  }

  // — Partner-click conversion drop —
  if (hist.length >= MIN_BASELINE_DAYS && b.today) {
    const base = median(hist.map((d) => num(d.out_clicks)));
    const expected = (base || 0) * frac;
    const cur = num(b.today.out_clicks);
    if (base != null && base >= 5 && expected >= 3 && cur < expected * 0.4) {
      out.push(alert("out_clicks_drop", "warn", "Partner clicks are below baseline",
        `${cur} affiliate/partner clicks today vs ~${Math.round(expected)} expected by now. If this persists, check outbound links and the affiliate section.`,
        { anchor: "places", current: String(cur), baseline: `~${Math.round(expected)} by now` }));
    }
  }

  // — Signups drop —
  if (Array.isArray(b.signupsHistory) && b.signupsHistory.length >= MIN_BASELINE_DAYS && b.signupsToday != null) {
    const base = median(b.signupsHistory.map((d) => num(d.signups)));
    if (base != null && base >= 3) {
      const expected = base * frac;
      if (expected >= 2 && num(b.signupsToday) < expected * 0.4) {
        out.push(alert("signup_drop", "warn", "Signups are below baseline",
          `${num(b.signupsToday)} signups today vs ~${Math.round(expected)} expected by now (median ${base}/day).`,
          { anchor: "retention", current: String(num(b.signupsToday)), baseline: `~${Math.round(expected)} by now` }));
      }
    }
  }

  // — Error spike —
  if (b.errors24h) {
    const total = num(b.errors24h.exceptions) + num(b.errors24h.app_errors);
    if (total >= 20) {
      out.push(alert("error_spike", total >= 100 ? "critical" : "warn", "Elevated error volume in the last 24h",
        `${num(b.errors24h.exceptions)} exceptions + ${num(b.errors24h.app_errors)} app errors captured by PostHog in 24h.`,
        { anchor: "health", current: String(total), baseline: "near zero" }));
    }
  }
  if (b.sentryUnresolved != null && num(b.sentryUnresolved) > 0) {
    out.push(alert("sentry_unresolved", "warn", "Unresolved Sentry issues",
      `${num(b.sentryUnresolved)} unresolved issue(s) saw events in the last 24h.`,
      { anchor: "health", current: String(num(b.sentryUnresolved)), baseline: "0" }));
  }

  // — Core Web Vitals regressions (field data; Google thresholds) —
  if (Array.isArray(b.webVitalsField)) {
    const TH = { LCP: 2500, INP: 200, CLS: 0.1 };
    for (const row of b.webVitalsField) {
      const th = TH[row.metric];
      if (!th || num(row.samples) < 20) continue;
      if (num(row.p75) > th) {
        const val = row.metric === "CLS" ? num(row.p75).toFixed(3) : Math.round(num(row.p75)) + "ms";
        out.push(alert(`cwv_${row.metric}_${row.device}`, "warn", `${row.metric} is failing on ${row.device}`,
          `Field p75 ${row.metric} on ${row.device} is ${val} over the selected window (${row.samples} samples). Google's "good" threshold is ${row.metric === "CLS" ? th : th + "ms"}.`,
          { anchor: "health", current: val, baseline: row.metric === "CLS" ? `≤ ${th}` : `≤ ${th}ms` }));
      }
    }
  }

  // — Stale/empty data pipelines (a cron that returns 200 while writing
  //   nothing is invisible to every other rule above — this reads the actual
  //   table timestamps the crons write to, not the cron's own exit status).
  //   Thresholds are ~3x each pipeline's own cadence, so a single missed run
  //   never fires; only a pipeline that's actually stopped writing does. —
  if (Array.isArray(b.dataFreshness)) {
    const THRESH = {
      cwv: { hours: 3, label: "PageSpeed CWV cron (cwv_runs)" },
      popularity: { hours: 9, label: "Place popularity cron (wf_place_popularity)" },
      beach_water: { hours: 120, label: "Beach water quality cron (wf_beach_water)" },
    };
    for (const row of b.dataFreshness) {
      const th = THRESH[row.pipeline];
      if (!th) continue;
      if (row.last_success == null) {
        out.push(alert(`stale_${row.pipeline}`, "warn", `${th.label} has never stored a row`,
          `The cron is configured but no successful write has ever landed in the table — check recent runtime logs for a silent failure.`,
          { anchor: "ops", current: "never", baseline: `within ${th.hours}h` }));
      } else if (num(row.hours_since) > th.hours) {
        out.push(alert(`stale_${row.pipeline}`, "warn", `${th.label} data is stale`,
          `Last successful write was ${num(row.hours_since).toFixed(1)}h ago, vs an expected cadence of ~${th.hours}h. The cron may be running without actually writing.`,
          { anchor: "ops", current: `${num(row.hours_since).toFixed(1)}h ago`, baseline: `within ${th.hours}h` }));
      }
    }
  }

  // — Failed deployment —
  if (Array.isArray(b.deployments) && b.deployments.length) {
    const latestProd = b.deployments.find((d) => d.target === "production");
    if (latestProd && String(latestProd.state).toUpperCase() === "ERROR") {
      out.push(alert("deploy_failed", "critical", "Latest production deployment failed",
        `${latestProd.ref || "?"} @ ${latestProd.sha || "?"} errored; production is serving the last good build.`,
        { anchor: "ops", current: "ERROR", baseline: "READY" }));
    }
  }

  // — Revenue drop (only when provider reporting is truly connected) —
  if (b.tpRevenue && Array.isArray(b.tpRevenueHistory) && b.tpRevenueHistory.length >= MIN_BASELINE_DAYS) {
    const base = median(b.tpRevenueHistory.map((d) => num(d.revenue)));
    if (base != null && base > 5 && num(b.tpRevenue.revenue_paid_usd) < base * 0.3) {
      out.push(alert("revenue_drop", "warn", "Confirmed commission is below baseline",
        `$${num(b.tpRevenue.revenue_paid_usd).toFixed(2)} paid commission in window vs ~$${base.toFixed(2)} median.`,
        { anchor: "places", current: `$${num(b.tpRevenue.revenue_paid_usd).toFixed(2)}`, baseline: `~$${base.toFixed(2)}` }));
    }
  }

  // — Disconnected / stale sources (one info line, never a metric alarm).
  //   Deduped by source NAME: several panels share one provider (PostHog
  //   feeds CWV + errors + traffic) and must not count twice. —
  if (Array.isArray(b.sources)) {
    const uniq = (list) => [...new Map(list.map((s) => [s.name, s])).values()];
    const missing = uniq(b.sources.filter((s) => s && s.connected === false && s.reason === "not_configured"));
    const erroring = uniq(b.sources.filter((s) => s && s.connected === false && s.reason === "error"));
    if (erroring.length) {
      out.push(alert("source_errors", "warn", "A connected data source is failing",
        erroring.map((s) => `${s.name}: ${s.note || "error"}`).join(" · "), { anchor: "health" }));
    }
    if (missing.length) {
      out.push(alert("sources_unconnected", "info", `${missing.length} data source${missing.length > 1 ? "s" : ""} not connected`,
        missing.map((s) => s.name).join(" · ") + " — each panel shows its exact setup step.", { anchor: "health" }));
    }
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  out.sort((a, z) => (rank[a.severity] ?? 3) - (rank[z.severity] ?? 3));
  return out;
}
