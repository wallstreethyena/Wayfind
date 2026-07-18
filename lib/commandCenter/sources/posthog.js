// lib/commandCenter/sources/posthog.js — server-side PostHog analytics via the
// Query API (HogQL). This is where traffic, acquisition, geography, devices,
// entry/exit paths, field Core Web Vitals, and error trends come from.
//
// Credentials are SERVER-ONLY: a PostHog *personal API key* with Query Read
// scope in POSTHOG_PERSONAL_API_KEY (never NEXT_PUBLIC_*; the browser key that
// ingests events cannot read analytics and stays untouched). Without the key,
// every helper returns a labeled "Not connected" block with the exact setup
// step — the dashboard never guesses traffic numbers.
//
// Every HogQL string here was validated against the live project (project
// 507756, us.posthog.com) before shipping. Notes from that validation:
//   • The project's SDK has no $virt_is_bot property — no bot filter exists,
//     so PostHog counts are labeled "includes any bot traffic".
//   • sessions table carries $channel_type, $entry_pathname, $exit_pathname,
//     $entry_referring_domain, $entry_utm_*, $is_bounce, $session_duration.
//   • The custom `web_vitals` event stores CLS ×1000 (see app/home.js).

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "PostHog";
const NEXT = "Create a personal API key with Query Read scope (PostHog → Settings → Personal API keys), then add POSTHOG_PERSONAL_API_KEY (and optionally POSTHOG_PROJECT_ID / POSTHOG_API_HOST) to the Vercel environment.";

function cfg(env = process.env) {
  const key = String(env.POSTHOG_PERSONAL_API_KEY || "").trim();
  const project = String(env.POSTHOG_PROJECT_ID || "507756").trim();
  const host = String(env.POSTHOG_API_HOST || "https://us.posthog.com").trim().replace(/\/+$/, "");
  return key ? { key, project, host } : null;
}

export function posthogConfigured(env = process.env) { return !!cfg(env); }
export const posthogMissing = () => ({ source: srcMissing(NAME, NEXT), data: null });

async function hogql(query, opts = {}) {
  const c = cfg(opts.env);
  if (!c) throw new Error("posthog_not_configured");
  const fetchImpl = opts.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 15000);
  try {
    const r = await fetchImpl(`${c.host}/api/environments/${encodeURIComponent(c.project)}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`posthog ${r.status}: ${t.slice(0, 140)}`);
    }
    const d = await r.json();
    return { columns: d.columns || [], results: d.results || [] };
  } finally {
    clearTimeout(timer);
  }
}

// rows -> array of objects keyed by column name
function shape({ columns, results }) {
  return (results || []).map((row) => {
    const o = {};
    columns.forEach((c, i) => { o[String(c).replace(/^\$/, "")] = row[i]; });
    return o;
  });
}

const esc = (s) => String(s).replace(/'/g, "\\'");
const isoZ = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
// All windows are explicit UTC instants (computed ET-boundary-correct by
// lib/commandCenter/time.js) — never interval arithmetic in the query.
const win = (from, to, col = "timestamp") =>
  `${col} >= toDateTime('${isoZ(from)}') AND ${col} < toDateTime('${isoZ(to)}')`;

async function run(cacheKey, ttlMs, query, opts) {
  if (!cfg(opts && opts.env)) return posthogMissing();
  try {
    const rows = await memTTL(cacheKey, ttlMs, async () => shape(await hogql(query, opts)));
    return { source: srcOk(NAME, { confidence: "measured", note: "no bot filter available in this SDK config" }), data: rows };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}

// ── traffic ─────────────────────────────────────────────────────────────────
export function overviewCounts(from, to, opts) {
  const q = `SELECT uniq(person_id) AS visitors, uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews
FROM events WHERE ${win(from, to)}`;
  return run(`ph:ov:${+from}:${+to}`, 60 * 1000, q, opts);
}

export function liveByMinute(opts) {
  const q = `SELECT toStartOfMinute(timestamp) AS minute, uniq(person_id) AS visitors
FROM events WHERE timestamp >= now() - INTERVAL 60 MINUTE GROUP BY minute ORDER BY minute`;
  return run(`ph:live:${Math.floor(Date.now() / 30000)}`, 25 * 1000, q, opts);
}

export function liveNow(opts) {
  const q = `SELECT uniq(person_id) AS visitors FROM events WHERE timestamp >= now() - INTERVAL 5 MINUTE`;
  return run(`ph:now:${Math.floor(Date.now() / 30000)}`, 25 * 1000, q, opts);
}

export function dailyTraffic(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, uniq(person_id) AS visitors, uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews
FROM events WHERE ${win(from, to)} GROUP BY day ORDER BY day`;
  return run(`ph:daily:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function channels(from, to, opts) {
  const q = `SELECT coalesce(nullif($channel_type, ''), 'Unknown') AS channel, uniq(session_id) AS sessions, uniq(distinct_id) AS visitors, countIf($is_bounce) AS bounces, round(avg($session_duration)) AS avg_duration_s
FROM sessions WHERE ${win(from, to, "$start_timestamp")} GROUP BY channel ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:chan:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function referrers(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_referring_domain, ''), '$direct') AS referrer, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} GROUP BY referrer ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:ref:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function utms(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_utm_source, ''), '(none)') AS utm_source, coalesce(nullif($entry_utm_campaign, ''), '(none)') AS utm_campaign, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} AND ($entry_utm_source != '' OR $entry_utm_campaign != '')
GROUP BY utm_source, utm_campaign ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:utm:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function entryExit(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_pathname, ''), '/') AS entry, coalesce(nullif($exit_pathname, ''), '/') AS exit, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} GROUP BY entry, exit ORDER BY sessions DESC LIMIT 40`;
  return run(`ph:ee:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function topPages(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.$pathname, ''), '/') AS path, count() AS pageviews, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} GROUP BY path ORDER BY pageviews DESC LIMIT 15`;
  return run(`ph:pages:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function devices(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.$device_type, ''), 'Unknown') AS device, coalesce(nullif(properties.$browser, ''), 'Unknown') AS browser, coalesce(nullif(properties.$os, ''), 'Unknown') AS os, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} GROUP BY device, browser, os ORDER BY visitors DESC LIMIT 40`;
  return run(`ph:dev:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function viewports(from, to, opts) {
  const q = `SELECT multiIf(toFloat(properties.$viewport_width) < 480, '<480', toFloat(properties.$viewport_width) < 768, '480-767', toFloat(properties.$viewport_width) < 1024, '768-1023', toFloat(properties.$viewport_width) < 1440, '1024-1439', '1440+') AS bucket, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND properties.$viewport_width IS NOT NULL
GROUP BY bucket ORDER BY visitors DESC`;
  return run(`ph:vp:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

// Aggregated + thresholded (>= minVisitors) — never street-level.
export function geo(from, to, opts) {
  const min = (opts && opts.minVisitors) || 3;
  const q = `SELECT coalesce(nullif(properties.$geoip_country_code, ''), '??') AS country, coalesce(nullif(properties.$geoip_subdivision_1_code, ''), '') AS region, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} GROUP BY country, region HAVING visitors >= ${Number(min)} ORDER BY visitors DESC LIMIT 25`;
  return run(`ph:geo:${+from}:${+to}:${min}`, 10 * 60 * 1000, q, opts);
}

export function newVsReturning(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, uniqIf(person_id, person.created_at >= toDateTime('${isoZ(from)}')) AS new_visitors, uniqIf(person_id, person.created_at < toDateTime('${isoZ(from)}')) AS returning_visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} GROUP BY day ORDER BY day`;
  return run(`ph:nvr:${+from}:${+to}`, 10 * 60 * 1000, q, opts);
}

// ── quality ─────────────────────────────────────────────────────────────────
// Field Core Web Vitals p75 from the custom web_vitals event. CLS is stored
// ×1000 by the client (see app/home.js) — divided back here, at the ONE place.
export function webVitalsField(from, to, opts) {
  const q = `SELECT properties.metric AS metric, coalesce(nullif(properties.device, ''), 'unknown') AS device, count() AS samples, round(quantile(0.75)(toFloat(properties.value)), 1) AS p75
FROM events WHERE event = 'web_vitals' AND ${win(from, to)} GROUP BY metric, device ORDER BY metric, device`;
  return run(`ph:cwv:${+from}:${+to}`, 10 * 60 * 1000, q, opts).then((r) => {
    if (r.data) for (const row of r.data) { if (row.metric === "CLS") row.p75 = Math.round((row.p75 / 1000) * 1000) / 1000; }
    return r;
  });
}

export function webVitalsByRoute(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.route, ''), '/') AS route, count() AS samples, round(quantile(0.75)(toFloat(properties.value))) AS lcp_p75
FROM events WHERE event = 'web_vitals' AND properties.metric = 'LCP' AND ${win(from, to)} GROUP BY route HAVING samples >= 5 ORDER BY lcp_p75 DESC LIMIT 10`;
  return run(`ph:cwvroute:${+from}:${+to}`, 10 * 60 * 1000, q, opts);
}

export function errorsDaily(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, countIf(event = '$exception') AS exceptions, countIf(event = 'app_error') AS app_errors, countIf(event = '$rageclick') AS rage_clicks, countIf(event = '$dead_click') AS dead_clicks
FROM events WHERE event IN ('$exception', 'app_error', '$rageclick', '$dead_click') AND ${win(from, to)} GROUP BY day ORDER BY day`;
  return run(`ph:err:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function errorCount24h(opts) {
  const q = `SELECT countIf(event = '$exception') AS exceptions, countIf(event = 'app_error') AS app_errors
FROM events WHERE timestamp >= now() - INTERVAL 24 HOUR AND event IN ('$exception', 'app_error')`;
  return run(`ph:err24:${Math.floor(Date.now() / 60000)}`, 55 * 1000, q, opts);
}
