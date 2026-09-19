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
//   • $virt_is_bot is a PostHog query-time virtual event property. Every query
//     excludes it, the project's test-account rules, $internal_or_test_user,
//     and the same server-only account ids as the first-party Command Center.
//   • sessions table carries $channel_type, $entry_pathname, $exit_pathname,
//     $entry_referring_domain, $entry_utm_*, $is_bounce, $session_duration.
//   • The custom `web_vitals` event stores CLS ×1000 (see app/home.js).
//   • Field CWV uses PostHog's own test-account filter layer. The project owns
//     those rules; Wayfind never copies private filter values into source.

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";
import { rpc } from "../supabaseAdmin.js";
import { buildVisitorReport } from "../visitorReport.js";

const NAME = "PostHog";
const NEXT = "Create a personal API key with Query Read scope (PostHog → Settings → Personal API keys), then add POSTHOG_PERSONAL_API_KEY (and optionally POSTHOG_PROJECT_ID / POSTHOG_API_HOST) to the Vercel environment.";
const REAL_EVENTS = "{filters} AND {wayfindRealEvents}";

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
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
          filters: { filterTestAccounts: true },
        },
      }),
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

function scalarIds(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (typeof row === "string") return row;
    if (!row || typeof row !== "object") return "";
    return row.wf_cc_excluded_users || row.id || Object.values(row)[0] || "";
  }).map((id) => String(id || "").trim()).filter(Boolean);
}

async function excludedUserIds(opts = {}) {
  const env = opts.env || process.env;
  if (Array.isArray(opts.excludedUserIds)) {
    return [...new Set([...opts.excludedUserIds, env.WF_OWNER_USER_ID].map((id) => String(id || "").trim()).filter(Boolean))];
  }
  const rows = await memTTL("ph:excluded-users:v1", 5 * 60 * 1000, () =>
    rpc("wf_cc_excluded_users", {}, {
      env,
      ...(opts.exclusionFetchImpl ? { fetchImpl: opts.exclusionFetchImpl } : {}),
      ...(opts.sb ? { sb: opts.sb } : {}),
    }));
  return [...new Set([...scalarIds(rows), String(env.WF_OWNER_USER_ID || "").trim()].filter(Boolean))];
}

function idList(ids) {
  return ids.length ? `(${ids.map((id) => `'${esc(id)}'`).join(", ")})` : "('')";
}

// A signed-in account may have earlier anonymous distinct_ids merged into the
// same PostHog person. The person_id subquery removes that history too; only
// aggregate report data leaves this server module.
function realEventPredicate(ids) {
  const list = idList(ids);
  const accountMatch = `(distinct_id IN ${list} OR coalesce(toString(properties.$user_id), '') IN ${list})`;
  return `coalesce(toString(properties.$virt_is_bot), 'false') NOT IN ('true', '1')
AND coalesce(toString(person.properties.$internal_or_test_user), 'false') NOT IN ('true', '1')
AND NOT ${accountMatch}
AND person_id NOT IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN ${list})`;
}

function excludedEventPredicate(ids) {
  const list = idList(ids);
  return `coalesce(toString(properties.$virt_is_bot), 'false') IN ('true', '1')
OR coalesce(toString(person.properties.$internal_or_test_user), 'false') IN ('true', '1')
OR distinct_id IN ${list}
OR coalesce(toString(properties.$user_id), '') IN ${list}
OR person_id IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN ${list})`;
}

function realSessionPredicate(ids, eventScope) {
  if (!eventScope) throw new Error("posthog_session_scope_required");
  const list = idList(ids);
  const linkedIds = `(SELECT distinct_id FROM person_distinct_ids WHERE person_id IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN ${list}))`;
  return `distinct_id NOT IN ${list}
AND distinct_id NOT IN ${linkedIds}
AND session_id IN (SELECT DISTINCT properties.$session_id FROM events WHERE ${eventScope} AND properties.$session_id IS NOT NULL AND {filters} AND ${realEventPredicate(ids)})
AND session_id NOT IN (SELECT DISTINCT properties.$session_id FROM events WHERE ${eventScope} AND properties.$session_id IS NOT NULL AND (${excludedEventPredicate(ids)}))`;
}

function exclusionFingerprint(ids) {
  let h = 5381;
  for (const ch of ids.slice().sort().join("|")) h = ((h << 5) + h) ^ ch.charCodeAt(0);
  return (h >>> 0).toString(36);
}

async function run(cacheKey, ttlMs, query, opts, eventScope) {
  if (!cfg(opts && opts.env)) return posthogMissing();
  try {
    const ids = await excludedUserIds(opts || {});
    const scoped = query
      .replaceAll("{wayfindRealEvents}", realEventPredicate(ids))
      .replaceAll("{wayfindRealSessions}", query.includes("{wayfindRealSessions}") ? realSessionPredicate(ids, eventScope) : "");
    if (scoped.includes("{wayfindReal")) throw new Error("posthog_query_missing_real_visitor_scope");
    const rows = await memTTL(`${cacheKey}:ex:${exclusionFingerprint(ids)}`, ttlMs, async () => shape(await hogql(scoped, opts)));
    const note = `project test-account filters applied; known bots, internal/test people, and ${ids.length} server-listed internal account id${ids.length === 1 ? "" : "s"} excluded`;
    return { source: srcOk(NAME, { confidence: "measured", note }), data: rows };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}

// ── traffic ─────────────────────────────────────────────────────────────────
export function overviewCounts(from, to, opts) {
  const q = `SELECT uniq(person_id) AS visitors, uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews
FROM events WHERE ${win(from, to)} AND ${REAL_EVENTS}`;
  return run(`ph:ov:${+from}:${+to}`, 60 * 1000, q, opts);
}

export function liveByMinute(opts) {
  const q = `SELECT toStartOfMinute(timestamp) AS minute, uniq(person_id) AS visitors
FROM events WHERE timestamp >= now() - INTERVAL 60 MINUTE AND ${REAL_EVENTS} GROUP BY minute ORDER BY minute`;
  return run(`ph:live:${Math.floor(Date.now() / 30000)}`, 25 * 1000, q, opts);
}

export function liveNow(opts) {
  const q = `SELECT uniq(person_id) AS visitors FROM events WHERE timestamp >= now() - INTERVAL 5 MINUTE AND ${REAL_EVENTS}`;
  return run(`ph:now:${Math.floor(Date.now() / 30000)}`, 25 * 1000, q, opts);
}

export function dailyTraffic(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, uniq(person_id) AS visitors, uniq($session_id) AS sessions, countIf(event = '$pageview') AS pageviews
FROM events WHERE ${win(from, to)} AND ${REAL_EVENTS} GROUP BY day ORDER BY day`;
  return run(`ph:daily:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function channels(from, to, opts) {
  const q = `SELECT coalesce(nullif($channel_type, ''), 'Unknown') AS channel, uniq(session_id) AS sessions, uniq(distinct_id) AS visitors, countIf($is_bounce) AS bounces, round(avg($session_duration)) AS avg_duration_s
FROM sessions WHERE ${win(from, to, "$start_timestamp")} AND {wayfindRealSessions} GROUP BY channel ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:chan:${+from}:${+to}`, 5 * 60 * 1000, q, opts, win(from, to));
}

export function referrers(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_referring_domain, ''), '$direct') AS referrer, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} AND {wayfindRealSessions} GROUP BY referrer ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:ref:${+from}:${+to}`, 5 * 60 * 1000, q, opts, win(from, to));
}

export function utms(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_utm_source, ''), '(none)') AS utm_source, coalesce(nullif($entry_utm_campaign, ''), '(none)') AS utm_campaign, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} AND {wayfindRealSessions} AND ($entry_utm_source != '' OR $entry_utm_campaign != '')
GROUP BY utm_source, utm_campaign ORDER BY sessions DESC LIMIT 12`;
  return run(`ph:utm:${+from}:${+to}`, 5 * 60 * 1000, q, opts, win(from, to));
}

export function entryExit(from, to, opts) {
  const q = `SELECT coalesce(nullif($entry_pathname, ''), '/') AS entry, coalesce(nullif($exit_pathname, ''), '/') AS exit, uniq(session_id) AS sessions
FROM sessions WHERE ${win(from, to, "$start_timestamp")} AND {wayfindRealSessions} GROUP BY entry, exit ORDER BY sessions DESC LIMIT 40`;
  return run(`ph:ee:${+from}:${+to}`, 5 * 60 * 1000, q, opts, win(from, to));
}

export function topPages(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.$pathname, ''), '/') AS path, count() AS pageviews, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY path ORDER BY pageviews DESC LIMIT 15`;
  return run(`ph:pages:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function devices(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.$device_type, ''), 'Unknown') AS device, coalesce(nullif(properties.$browser, ''), 'Unknown') AS browser, coalesce(nullif(properties.$os, ''), 'Unknown') AS os, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY device, browser, os ORDER BY visitors DESC LIMIT 40`;
  return run(`ph:dev:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function viewports(from, to, opts) {
  const q = `SELECT multiIf(toFloat(properties.$viewport_width) < 480, '<480', toFloat(properties.$viewport_width) < 768, '480-767', toFloat(properties.$viewport_width) < 1024, '768-1023', toFloat(properties.$viewport_width) < 1440, '1024-1439', '1440+') AS bucket, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND ${REAL_EVENTS} AND properties.$viewport_width IS NOT NULL
GROUP BY bucket ORDER BY visitors DESC`;
  return run(`ph:vp:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

// Aggregated + thresholded (>= minVisitors) — never street-level.
export function geo(from, to, opts) {
  const min = (opts && opts.minVisitors) || 3;
  const q = `SELECT coalesce(nullif(properties.$geoip_country_code, ''), '??') AS country, coalesce(nullif(properties.$geoip_subdivision_1_code, ''), '') AS region, uniq(person_id) AS visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY country, region HAVING visitors >= ${Number(min)} ORDER BY visitors DESC LIMIT 25`;
  return run(`ph:geo:${+from}:${+to}:${min}`, 10 * 60 * 1000, q, opts);
}

export function newVsReturning(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, uniqIf(person_id, person.created_at >= toDateTime('${isoZ(from)}')) AS new_visitors, uniqIf(person_id, person.created_at < toDateTime('${isoZ(from)}')) AS returning_visitors
FROM events WHERE event = '$pageview' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY day ORDER BY day`;
  return run(`ph:nvr:${+from}:${+to}`, 10 * 60 * 1000, q, opts);
}

// ── visitor story ───────────────────────────────────────────────────────────
// This intentionally reads a bounded set of privacy-safe interaction events
// and aggregates them in server memory. visit_id/session_id never leave this
// module; the API receives only ranked paths, counts, durations and buckets.
// The extra row detects truncation so a cap can never masquerade as complete.
export async function visitorStory(from, to, opts) {
  const q = `SELECT event, timestamp, coalesce(toString($session_id), '') AS session_id,
  coalesce(toString(properties.visit_id), '') AS visit_id,
  coalesce(toString(properties.page_path), '/') AS page_path,
  coalesce(toString(properties.page_surface), 'document') AS page_surface,
  properties.active_ms AS active_ms, properties.max_scroll_pct AS max_scroll_pct,
  properties.reason AS reason, properties.element_type AS element_type,
  properties.element_label AS element_label, properties.destination_type AS destination_type,
  properties.destination_path AS destination_path, properties.outbound_domain AS outbound_domain,
  properties.viewport_bucket AS viewport_bucket, properties.document_bucket AS document_bucket
FROM events
WHERE event IN ('page_visit', 'page_active_time', 'page_exit', 'element_click', 'attention_sample')
  AND ${win(from, to)} AND ${REAL_EVENTS}
ORDER BY timestamp, uuid
LIMIT 50001`;
  const diagnosticsQ = `SELECT event,
  coalesce(nullif(toString(properties.page_path), ''), nullif(toString(properties.$pathname), ''), 'Unknown page') AS page_path,
  count() AS occurrences, uniq(person_id) AS visitors
FROM events
WHERE event IN ('places_none', 'events_none', 'app_error', '$rageclick', 'provider_redirect_failed', 'primary_cta_null', 'content_disliked', 'dislike', 'rail_retry')
  AND ${win(from, to)} AND ${REAL_EVENTS}
GROUP BY event, page_path
ORDER BY occurrences DESC
LIMIT 51`;
  const [result, diagnosticResult] = await Promise.all([
    run(`ph:visitor-story:v2:${+from}:${+to}`, 5 * 60 * 1000, q, opts),
    run(`ph:visitor-diagnostics:v1:${+from}:${+to}`, 5 * 60 * 1000, diagnosticsQ, opts),
  ]);
  if (!result.data) {
    return {
      source: result.source,
      visitorReport: {
        source: result.source,
        coverage: { status: "unavailable", notes: [result.source.note || result.source.nextStep || "PostHog visitor events are unavailable."], events: {} },
        journeys: [], pageAttention: [], lastClicks: [], exits: [], heatmap: [], findings: [],
      },
    };
  }
  const truncated = result.data.length > 50000;
  const rows = truncated ? result.data.slice(0, 50000) : result.data;
  const diagnosticsTruncated = (diagnosticResult.data || []).length > 50;
  const diagnostics = diagnosticsTruncated ? diagnosticResult.data.slice(0, 50) : (diagnosticResult.data || []);
  const report = buildVisitorReport(rows, { truncated, diagnostics, diagnosticsTruncated });
  if (!diagnosticResult.data) {
    report.coverage.status = report.coverage.status === "measured" ? "partial" : report.coverage.status;
    report.coverage.notes.push("Current issue/opportunity diagnostics were unavailable, so findings may be incomplete.");
  }
  return { source: result.source, visitorReport: { source: result.source, ...report } };
}

// ── quality ─────────────────────────────────────────────────────────────────
// Field Core Web Vitals p75 from the custom web_vitals event. CLS is stored
// ×1000 by the client (see app/home.js) — divided back here, at the ONE place.
// `{filters}` is not string interpolation: it is PostHog's HogQL filter
// placeholder. `filterTestAccounts:true` makes PostHog itself expand the
// project's current test-account rules, so the Command Center measures the
// same real-user population as PostHog without hardcoding private filter data.
export function webVitalsField(from, to, opts) {
  const q = `SELECT properties.metric AS metric, coalesce(nullif(properties.device, ''), 'unknown') AS device, count() AS samples, round(quantile(0.75)(toFloat(properties.value)), 1) AS p75
FROM events WHERE event = 'web_vitals' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY metric, device ORDER BY metric, device`;
  return run(`ph:cwv:${+from}:${+to}`, 10 * 60 * 1000, q, opts).then((r) => {
    if (r.data) for (const row of r.data) { if (row.metric === "CLS") row.p75 = Math.round((row.p75 / 1000) * 1000) / 1000; }
    return r;
  });
}

export function webVitalsByRoute(from, to, opts) {
  const q = `SELECT coalesce(nullif(properties.route, ''), '/') AS route, count() AS samples, round(quantile(0.75)(toFloat(properties.value))) AS lcp_p75
FROM events WHERE event = 'web_vitals' AND properties.metric = 'LCP' AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY route HAVING samples >= 5 ORDER BY lcp_p75 DESC LIMIT 10`;
  return run(`ph:cwvroute:${+from}:${+to}`, 10 * 60 * 1000, q, opts);
}

export function errorsDaily(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, countIf(event = '$exception') AS exceptions, countIf(event = 'app_error') AS app_errors, countIf(event = '$rageclick') AS rage_clicks, countIf(event = '$dead_click') AS dead_clicks
FROM events WHERE event IN ('$exception', 'app_error', '$rageclick', '$dead_click') AND ${win(from, to)} AND ${REAL_EVENTS} GROUP BY day ORDER BY day`;
  return run(`ph:err:${+from}:${+to}`, 5 * 60 * 1000, q, opts);
}

export function errorCount24h(opts) {
  const q = `SELECT countIf(event = '$exception') AS exceptions, countIf(event = 'app_error') AS app_errors
FROM events WHERE timestamp >= now() - INTERVAL 24 HOUR AND event IN ('$exception', 'app_error') AND ${REAL_EVENTS}`;
  return run(`ph:err24:${Math.floor(Date.now() / 60000)}`, 55 * 1000, q, opts);
}

// Boundary errors in the LAST HOUR, split by build.
//
// WHY NOT errorCount24h. On 2026-07-30 a ReferenceError shipped in v6.56 and took
// down every bookable place sheet: 14 boundary errors, 3 real users, one
// afternoon. Nothing paged — the first report was the owner's own phone. The
// existing rule needs 20+ errors across 24 HOURS, so a brand-new build failing
// hard is diluted by a quiet day and lands under the threshold.
//
// Two dimensions fix that. The HOUR makes a burst visible while it is still a
// burst, and the BUILD separates "a new deploy is broken" from a long-standing
// trickle — which is the difference between paging and not.
//
// `people` is uniq(person_id), not a row count: one user in a retry loop can post
// a dozen errors, and that must not read the same as a dozen users each hitting it
// once. The alert rule keys on people for exactly that reason.
// ── revenue heartbeat (app/api/cron/revenue-heartbeat) ──────────────────────
// Traffic vs. affiliate CTA activity in one window, and the same shape
// bucketed per day for a trailing baseline. commerce_impression/
// commerce_cta_clicked are the two COMMERCE_EVENTS (lib/commerce.js) that
// fire client-side before any redirect — the earliest place a "silent zero"
// (e.g. a placeholder NEXT_PUBLIC_VIATOR_PID making ticketsUrl() return null,
// see lib/envPlaceholder.js) would show up, because a null URL means the CTA
// never renders and never gets impression-tracked, well before anyone could
// click it.
export function revenueHeartbeatCounts(from, to, opts) {
  const q = `SELECT countIf(event = '$pageview') AS traffic, countIf(event IN ('commerce_impression', 'commerce_cta_clicked')) AS affiliate_activity
FROM events WHERE ${win(from, to)} AND ${REAL_EVENTS}`;
  return run(`ph:rev:${+from}:${+to}`, 60 * 1000, q, opts);
}

export function revenueHeartbeatDaily(from, to, opts) {
  const q = `SELECT toStartOfDay(timestamp, 'America/New_York') AS day, countIf(event = '$pageview') AS traffic, countIf(event IN ('commerce_impression', 'commerce_cta_clicked')) AS affiliate_activity
FROM events WHERE ${win(from, to)} AND ${REAL_EVENTS} GROUP BY day ORDER BY day`;
  return run(`ph:revdaily:${+from}:${+to}`, 30 * 60 * 1000, q, opts);
}

export function boundaryErrorsByBuild(opts) {
  const q = `SELECT properties.build AS build, count() AS errors, uniq(person_id) AS people
FROM events WHERE event = 'app_error' AND timestamp >= now() - INTERVAL 1 HOUR
AND ${REAL_EVENTS}
GROUP BY build ORDER BY errors DESC LIMIT 20`;
  return run(`ph:boundary1h:${Math.floor(Date.now() / 60000)}`, 55 * 1000, q, opts);
}
