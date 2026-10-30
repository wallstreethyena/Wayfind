// Command Center prebuild lock (v6.42). Pure node, no network, no deps.
// Guards the four things that would make the dashboard lie or leak:
//   1. AUTH — /api/command-center/* is fail-closed server-side: unconfigured
//      => 503, bad/absent token => 401, wrong user => 403, owner/secret => ok.
//   2. TIME MATH — "today"/"month" are SITE-LOCAL (ET) days incl. DST edges;
//      comparisons are equivalent windows (same elapsed time / same weekday /
//      comparable month dates with clamping).
//   3. HONESTY — a missing provider yields a labeled not_configured block with
//      a nextStep (never invented numbers); alert rules stay silent without
//      baseline history and minimum volume; SQL action lists stay in lockstep
//      with the JS event map.
//   4. PRIVACY/LEAKS — the client bundle never imports server-only modules,
//      never calls providers directly, never uses dangerouslySetInnerHTML;
//      the page is noindexed; no NEXT_PUBLIC_ variant of any CC secret exists.

import { readFileSync } from "node:fs";
import { requireOwner } from "../lib/commandCenter/auth.js";
import { rangeFor, comparisonsFor, delta, dayList, dayStr, zonedDayStart, zonedParts } from "../lib/commandCenter/time.js";
import { gatherTrafficPace, trafficPaceWindows } from "../lib/commandCenter/trafficPace.js";
import { buildAlertsReport } from "../lib/commandCenter/alertsRun.js";
import { computeAlerts, MIN_BASELINE_DAYS } from "../lib/commandCenter/alerts.js";
import { comparableTrafficDays, trafficCountsContradict, trafficDayQuality, trafficTrackingState, FIRST_COMPARABLE_TRAFFIC_DAY, VISIT_TRACKING_INCIDENT_STARTED_AT, VISIT_TRACKING_REPAIRED_AT } from "../lib/commandCenter/trafficDataQuality.js";
import { srcMissing, srcOk, srcError, jsonNoStore } from "../lib/commandCenter/respond.js";
import { memTTL } from "../lib/commandCenter/cache.js";
import { OUT_ACTIONS, ENGAGE_ACTIONS, BROWSE_ACTIONS, EVENT_MAP, KPI_DEFS } from "../lib/commandCenter/eventMap.js";
import { buildVisitorReport } from "../lib/commandCenter/visitorReport.js";
import { classifySessions, REPEAT_MIN } from "../lib/commandCenter/trafficQuality.js";

let failures = 0;
const fail = (m) => { console.error("test-command-center: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// Alert assembly must preserve an unavailable source through to the rules.
{
  const good = (data) => ({ source: srcOk("fixture"), data });
  const missing = { source: srcError("First party", "offline"), data: null };
  const fixture = {
    fractionOfDay: 0.75,
    todayKey: "2026-10-04",
    asOf: new Date("2026-10-04T16:00:00.000Z"),
    dailyHist: good(Array.from({ length: 14 }, (_, i) => ({ day: `2026-${i < 11 ? "09" : "10"}-${String(i < 11 ? i + 20 : i - 10).padStart(2, "0")}`, devices: 110, sessions: 100, out_clicks: 10 }))),
    trafficPace: good(Array.from({ length: 14 }, (_, i) => ({ day: `2026-${i < 11 ? "09" : "10"}-${String(i < 11 ? i + 20 : i - 10).padStart(2, "0")}`, devices: 100, sessions: 90 }))),
    todayK: good({ active_devices: 39, sessions: 40, out_clicks: 0 }),
    signupHist: good(Array.from({ length: 14 }, (_, i) => ({ day: `2026-${i < 11 ? "09" : "10"}-${String(i < 11 ? i + 20 : i - 10).padStart(2, "0")}`, signups: 10 }))),
    signupToday: good([{ signups: 0 }]),
    ...Object.fromEntries(["cwvField", "lab", "err24", "boundary1h", "sentry", "syn", "deploys", "tpToday", "freshness"].map((key) => [key, good(null)])),
  };
  const has = (report, id) => report.alerts.some((a) => a.id === id);
  const measured = buildAlertsReport(fixture);
  ok(has(measured, "traffic_drop") && has(measured, "signup_drop"), "alerts assembly: genuine measured drops still warn");
  const trackingGap = buildAlertsReport({ ...fixture, todayK: good({ active_devices: 39, sessions: 0, out_clicks: 0 }) });
  ok(has(trackingGap, "visit_tracking_gap") && !has(trackingGap, "traffic_drop"), "alerts assembly: a repaired-era session regression suppresses the unreliable downturn claim and shows the tracking gap instead");
  const inverseTrackingGap = buildAlertsReport({ ...fixture, todayK: good({ active_devices: 0, sessions: 9, out_clicks: 0 }) });
  ok(has(inverseTrackingGap, "device_tracking_gap") && !has(inverseTrackingGap, "traffic_drop"), "alerts assembly: visits without device identifiers suppress the unreliable downturn claim and show the tracking gap instead");
  const affectedHistory = good(Array.from({ length: 9 }, (_, i) => ({ day: `2026-09-${String(i + 11).padStart(2, "0")}`, devices: 110, sessions: 0, out_clicks: 10 })));
  const historical = buildAlertsReport({ ...fixture, todayKey: "2026-09-19", asOf: new Date("2026-09-20T02:00:00.000Z"), dailyHist: affectedHistory, todayK: good({ active_devices: 47, sessions: 0, out_clicks: 0 }) });
  ok(has(historical, "visit_tracking_history_repaired") && !has(historical, "traffic_drop") && /0 comparable days available; 7 required/.test(historical.baselineNote), "alerts assembly: pre-fix 47/0 is labeled repaired history and affected days cannot manufacture a traffic baseline");
  const historicalPartial = buildAlertsReport({ ...fixture, todayKey: "2026-09-19", asOf: new Date("2026-09-20T02:00:00.000Z"), dailyHist: affectedHistory, todayK: good({ active_devices: 47, sessions: 6, out_clicks: 0 }) });
  ok(has(historicalPartial, "visit_tracking_history_repaired") && /6 recorded visit events/.test(historicalPartial.alerts.find((a) => a.id === "visit_tracking_history_repaired")?.detail || "") && !has(historicalPartial, "traffic_drop"), "alerts assembly: positive partial historical sessions remain labeled incomplete without a zero claim");
  const sixClean = good(Array.from({ length: 6 }, (_, i) => ({ day: `2026-09-${i + 20}`, devices: 110, sessions: 100, out_clicks: 10 })));
  const tooYoung = buildAlertsReport({ ...fixture, todayKey: "2026-09-26", asOf: new Date("2026-09-26T16:00:00.000Z"), dailyHist: sixClean });
  ok(!has(tooYoung, "traffic_drop") && /6 comparable days available; 7 required/.test(tooYoung.baselineNote), "alerts assembly: traffic collapse stays silent until seven complete comparable repaired-era days exist");
  const unavailable = buildAlertsReport({ ...fixture, todayK: missing, signupToday: missing });
  ok(!has(unavailable, "traffic_drop") && !has(unavailable, "out_clicks_drop") && !has(unavailable, "signup_drop"), "alerts assembly: failed current sources never become zero-count drops");
  ok(unavailable.sources.some((source) => source.connected === false), "alerts assembly: missing sources remain visible");
  const staleCurrent = buildAlertsReport({ ...fixture, todayK: { ...fixture.todayK, source: srcOk("fixture", { confidence: "stale-cache" }) } });
  ok(!has(staleCurrent, "traffic_drop"), "alerts assembly: a stale current count cannot establish a fresh traffic drop");
  const missingPace = buildAlertsReport({ ...fixture, trafficPace: missing });
  ok(!has(missingPace, "traffic_drop") && missingPace.sources.some((source) => source.connected === false), "alerts assembly: failed same-time comparisons suppress traffic claims and retain source-error visibility");
  const missingHistory = buildAlertsReport({ ...fixture, dailyHist: missing, signupHist: missing });
  ok(!has(missingHistory, "traffic_drop") && !has(missingHistory, "signup_drop"), "alerts assembly: missing baseline sources cannot establish a drop");
}

{
  ok(FIRST_COMPARABLE_TRAFFIC_DAY === "2026-09-20", "traffic quality: first full repaired ET day is Sep 20");
  ok(VISIT_TRACKING_INCIDENT_STARTED_AT === "2026-09-11T16:37:11.000Z" && VISIT_TRACKING_REPAIRED_AT === "2026-09-20T01:35:00.000Z", "traffic quality: measured incident and production-ready repair instants are locked exactly");
  ok(trafficDayQuality("2026-09-10") === "pre_filter_incomparable" && trafficDayQuality("2026-09-11") === "known_session_gap" && trafficDayQuality("2026-09-19") === "known_session_gap" && trafficDayQuality("2026-09-20") === "comparable_repaired", "traffic quality: pre-filter, incident, and repaired-era dates are explicit");
  ok(trafficTrackingState("2026-09-19", "2026-09-20T02:00:00.000Z") === "historical_repaired" && trafficTrackingState("2026-09-19", "2026-09-20T00:00:00.000Z") === "active_known_incident", "traffic quality: repair readiness separates active incident from historical repaired data");
  ok(trafficCountsContradict(10, 0) && trafficCountsContradict(0, 10) && !trafficCountsContradict(10, 10) && !trafficCountsContradict(0, 0), "traffic quality: either one-sided positive counter is the same shared contradiction signal");
  ok(comparableTrafficDays([{ day: "2026-09-10", devices: 10, sessions: 10 }, { day: "2026-09-15", devices: 10, sessions: 0 }, { day: "2026-09-20", devices: 10, sessions: 10 }, { day: "2026-09-21", devices: 10, sessions: 0 }]).length === 1, "traffic quality: only complete, internally consistent post-repair/filter-era days enter the normal baseline");
}

// ── 1. AUTH ────────────────────────────────────────────────────────────────
const mkReq = (headers = {}) => ({ headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
const fetchOwner = (id, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ id }) });

{
  const r = await requireOwner(mkReq({}), { env: {} });
  ok(!r.ok && r.status === 503 && r.body.reason === "not_configured", "auth: nothing configured -> 503 fail-closed");
}
{
  const env = { METRICS_SECRET: "sekrit-123456" };
  const good = await requireOwner(mkReq({ "x-wf-cc-key": "sekrit-123456" }), { env });
  ok(good.ok && good.mode === "secret", "auth: header secret unlocks (mode=secret)");
  const bad = await requireOwner(mkReq({ "x-wf-cc-key": "wrong-key-000" }), { env });
  ok(!bad.ok && bad.status === 401, "auth: wrong secret -> 401");
}
{
  const env = { WF_OWNER_USER_ID: "uuid-owner", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(30) };
  const tok = "t".repeat(40);
  const owner = await requireOwner(mkReq({ authorization: `Bearer ${tok}` }), { env, fetchImpl: fetchOwner("uuid-owner") });
  ok(owner.ok && owner.mode === "owner", "auth: verified owner token -> ok (mode=owner)");
  const stranger = await requireOwner(mkReq({ authorization: `Bearer ${"s".repeat(40)}` }), { env, fetchImpl: fetchOwner("uuid-someone-else") });
  ok(!stranger.ok && stranger.status === 403, "auth: verified NON-owner -> 403 (server is the boundary)");
  const expired = await requireOwner(mkReq({ authorization: `Bearer ${"e".repeat(40)}` }), { env, fetchImpl: fetchOwner(null, 401) });
  ok(!expired.ok && expired.status === 401, "auth: invalid/expired token -> 401");
  const down = await requireOwner(mkReq({ authorization: `Bearer ${"d".repeat(40)}` }), { env, fetchImpl: async () => { throw new Error("net"); } });
  ok(!down.ok && down.status === 503 && down.body.reason === "auth_unavailable", "auth: Supabase outage -> 503, NEVER a silent allow");
  ok(!(await requireOwner(mkReq({ authorization: "Bearer short" }), { env })).ok, "auth: garbage token -> denied");
  // token cache: second call with same token must not re-verify
  let calls = 0;
  const counting = async () => { calls++; return { ok: true, status: 200, json: async () => ({ id: "uuid-owner" }) }; };
  const t2 = "c".repeat(40);
  await requireOwner(mkReq({ authorization: `Bearer ${t2}` }), { env, fetchImpl: counting });
  await requireOwner(mkReq({ authorization: `Bearer ${t2}` }), { env, fetchImpl: counting });
  ok(calls === 1, "auth: verified token cached ~60s (1 upstream call for 2 requests)");
}

// ── 2. TIME MATH ───────────────────────────────────────────────────────────
{
  // 2026-07-18T02:30Z == July 17, 22:30 ET -> "today" is July 17 ET.
  const now = new Date("2026-07-18T02:30:00Z");
  const r = rangeFor("today", now);
  ok(r.from.toISOString() === "2026-07-17T04:00:00.000Z", "time: ET day start (EDT, UTC-4) — 02:30Z belongs to July 17 ET, from=04:00Z");
  ok(dayStr(now) === "2026-07-17", "time: dayStr uses the ET calendar day");
  const comps = comparisonsFor(r, now);
  const y = comps.find((c) => c.key === "yesterday");
  ok(y && y.from.toISOString() === "2026-07-16T04:00:00.000Z", "time: vs yesterday starts at yesterday's ET midnight");
  ok(y && (y.to - y.from) === (r.to - r.from), "time: vs yesterday spans the SAME elapsed time (fair partial-day)");
  const w = comps.find((c) => c.key === "last_week");
  ok(w && w.from.toISOString() === "2026-07-10T04:00:00.000Z", "time: vs last week = same weekday (Fri Jul 17 -> Fri Jul 10)");
  const m = comps.find((c) => c.key === "last_month");
  ok(m && m.from.toISOString() === "2026-06-17T04:00:00.000Z", "time: vs last month = same date prior month");
}
{
  // Month-end clamp: July 31 compared against June 30 (June has no 31st).
  const now = new Date("2026-07-31T12:00:00Z");
  const comps = comparisonsFor(rangeFor("today", now), now);
  const m = comps.find((c) => c.key === "last_month");
  ok(m && m.from.toISOString().startsWith("2026-06-30"), "time: month comparison clamps 31st -> June 30");
}
{
  // DST spring-forward: March 8 2026, 2h30 ET elapsed (EST midnight = 05:00Z).
  const now = new Date("2026-03-08T07:30:00Z");
  const r = rangeFor("today", now);
  ok(r.from.toISOString() === "2026-03-08T05:00:00.000Z", "time: DST day starts at EST midnight (05:00Z)");
  const days = dayList(new Date("2026-03-07T05:00:00Z"), new Date("2026-03-10T04:00:00Z"));
  ok(days.join(",") === "2026-03-07,2026-03-08,2026-03-09", "time: dayList crosses spring-forward without skipping/duplicating a day");
  // Fall-back boundary: Nov 1 2026 (EDT midnight = 04:00Z, day is 25h long).
  const nov = rangeFor("yesterday", new Date("2026-11-02T10:00:00Z"));
  ok(nov.from.toISOString() === "2026-11-01T04:00:00.000Z" && nov.to.toISOString() === "2026-11-02T05:00:00.000Z",
    "time: fall-back 'yesterday' spans the true 25-hour ET day");
}
{
  // Custom range: plain local dates resolve to ET day boundaries SERVER-side
  // (inclusive end). Jan dates are EST (UTC-5) — the old client-side "-04:00"
  // guess would have been an hour off; this pins the fix.
  const now = new Date("2026-07-18T02:30:00Z");
  const c = rangeFor("custom", now, undefined, { from: "2026-01-10", to: "2026-01-12" });
  ok(c.from.toISOString() === "2026-01-10T05:00:00.000Z", "time: custom start = ET midnight (EST, UTC-5) of the picked date");
  ok(c.to.toISOString() === "2026-01-13T05:00:00.000Z", "time: custom end date is INCLUSIVE (to = next ET midnight)");
  ok(c.complete === true && c.days === 3, "time: past custom range is complete with correct day count");
}
{
  const r7 = rangeFor("7d", new Date("2026-07-18T02:30:00Z"));
  ok(r7.days === 7 && r7.complete === true, "time: last-7-days is a complete range");
  const c7 = comparisonsFor(r7, new Date("2026-07-18T02:30:00Z"));
  ok(c7[0] && (c7[0].to.getTime() === r7.from.getTime()) && (c7[0].to - c7[0].from) === (r7.to - r7.from), "time: complete range compares to the immediately prior equal period");
  ok(delta(10, 0).pct === null && delta(10, 0).dir === "up", "time: delta with zero baseline -> pct null (rendered 'new'), never Infinity");
  ok(Math.round(delta(120, 100).pct) === 20 && delta(120, 100).dir === "up", "time: delta +20%");
  ok(delta(100, 100.2).dir === "flat", "time: <0.5% is flat (no jitter arrows)");
}

// ── 3a. RESPONSE HONESTY ───────────────────────────────────────────────────
{
  const miss = srcMissing("PostHog", "Add POSTHOG_PERSONAL_API_KEY …");
  ok(miss.connected === false && miss.reason === "not_configured" && miss.nextStep.length > 5, "respond: not-configured carries the exact next step");
  ok(srcOk("X").connected === true && !!srcOk("X").fetchedAt, "respond: ok carries a freshness stamp");
  const err = srcError("Sentry", "boom 500");
  ok(err.connected === false && err.reason === "error" && err.note.includes("boom"), "respond: provider failure is 'error', distinct from not-configured");
  const res = jsonNoStore({ ok: true });
  ok(res.headers.get("cache-control").includes("no-store"), "respond: owner data is never cached");
  ok(res.headers.get("x-robots-tag").includes("noindex"), "respond: API responses are noindexed");
}
{
  const at = (event, session_id, visit_id, timestamp, extra = {}) => ({ event, session_id, visit_id, timestamp, page_path: "/", ...extra });
  const report = buildVisitorReport([
    at("page_visit", "s1", "v1", "2026-09-01T10:00:00Z"),
    at("attention_sample", "s1", "v1", "2026-09-01T10:00:05Z", { active_ms: 5000, document_bucket: "top", viewport_bucket: "phone" }),
    at("element_click", "s1", "v1", "2026-09-01T10:00:10Z", { element_type: "link", element_label: "Map", destination_type: "internal", destination_path: "/map" }),
    at("page_exit", "s1", "v1", "2026-09-01T10:00:12Z", { active_ms: 10000, max_scroll_pct: 35, reason: "route_change" }),
    at("page_visit", "s1", "v2", "2026-09-01T10:00:13Z", { page_path: "/map" }),
    at("page_exit", "s1", "v2", "2026-09-01T10:00:20Z", { page_path: "/map", active_ms: 6000, max_scroll_pct: 20, reason: "hidden" }),
    at("page_visit", "s2", "v3", "2026-09-01T11:00:00Z", { page_path: "/deals" }),
    at("element_click", "s2", "v3", "2026-09-01T11:00:04Z", { page_path: "/deals", element_type: "button", element_label: "Book", destination_type: "external", outbound_domain: "partner.test" }),
    at("page_exit", "s2", "v3", "2026-09-01T11:00:05Z", { page_path: "/deals", active_ms: 4000, max_scroll_pct: 50, reason: "pagehide" }),
  ]);
  ok(report.coverage.status === "measured", "visitor report: all core events present -> measured coverage");
  ok(report.journeys.some((row) => row.label === "/ → /map" && row.visits === 1), "visitor report: page visits become an ordered aggregate journey without exposing session ids");
  ok(report.pageAttention.some((row) => row.page_path === "/" && row.active_s_avg === 10), "visitor report: page-exit active_ms becomes measured active seconds");
  ok(report.lastClicks.some((row) => row.element_label === "Book" && row.visits === 1), "visitor report: last click is grouped without visit ids");
  ok(report.exits.some((row) => row.page_path === "/deals" && row.classification === "external_click_before_exit"), "visitor report: a generic external click is not mislabeled as a booking/partner outcome");
  ok(report.exits.some((row) => row.page_path === "/map" && row.classification === "unobserved_exit" && /unknown/i.test(row.reason)), "visitor report: no click stays unknown, never abandonment");
  ok(report.heatmap[0]?.active_s === 5 && report.heatmap[0]?.document_bucket === "top", "visitor report: incremental attention samples sum into the heatmap");
  ok(!JSON.stringify(report).includes('"s1"') && !JSON.stringify(report).includes('"v1"'), "visitor report: raw session and visit identifiers never serialize");
  ok(buildVisitorReport([]).coverage.status === "unavailable", "visitor report: absent instrumentation is unavailable, not a measured zero");
  const diagnostic = buildVisitorReport([], { diagnostics: [
    { event: "places_none", page_path: "/explore", occurrences: 4, visitors: 3 },
    { event: "primary_cta_null", page_path: "/place/free-park", occurrences: 3, visitors: 2 },
    { event: "$rageclick", page_path: "/map", occurrences: 2, visitors: 2 },
    { event: "rail_retry", page_path: "/", occurrences: 1, visitors: 1 },
  ] });
  ok(diagnostic.findings.some((row) => row.kind === "opportunity" && row.value === 4 && /no useful result/.test(row.title)), "visitor report: existing empty-result events produce a data-supported opportunity with sample size");
  ok(diagnostic.coverage.status === "partial", "visitor report: diagnostics remain visible while new visit-story instrumentation is not yet populated");
  ok(diagnostic.findings.some((row) => row.id.startsWith("diagnostic:primary_cta_null") && row.kind === "opportunity" && /Directions can be the correct action/.test(row.evidence)), "visitor report: missing monetizable CTA is an inventory opportunity, not a broken-link claim");
  ok(diagnostic.findings.some((row) => row.id.startsWith("diagnostic:rageclick") && row.kind === "clue"), "visitor report: repeated clicks are a clue until the control is verified broken");
  ok(diagnostic.findings.some((row) => row.id.startsWith("diagnostic:rail_retry") && row.kind === "clue"), "visitor report: a manual rail retry is a clue, not proof of a loading failure");
  const labelRows = [
    at("page_visit", "s3", "v4", "2026-09-01T12:00:00Z", { page_path: "/p/ChIJopaque" }),
    ...Array.from({ length: 5 }, (_, i) => at("attention_sample", "s3", "v4", `2026-09-01T12:00:0${i + 1}Z`, { page_path: "/p/ChIJopaque", active_ms: 1000, document_bucket: "4", viewport_bucket: "phone" })),
  ];
  const labels = buildVisitorReport(labelRows);
  ok(labels.findings.some((row) => /Place page/.test(row.title) && /40–50% down the page/.test(row.evidence)), "visitor report: opaque place ids become 'Place page' and decile 4 becomes the 40–50% depth band");

  const staleClick = buildVisitorReport([
    at("page_visit", "s4", "v5", "2026-09-01T13:00:00Z", { page_path: "/map" }),
    at("element_click", "s4", "v5", "2026-09-01T13:00:01Z", { page_path: "/map", destination_type: "internal", destination_path: "/saved" }),
    at("page_exit", "s4", "v5", "2026-09-01T13:02:00Z", { page_path: "/map", active_ms: 60000, reason: "pagehide" }),
  ]);
  ok(staleClick.exits[0]?.classification === "unobserved_exit", "visitor report: an old click cannot claim what caused a later page end");

  // ── traffic quality: behaviour decides, country never does ────────────────
  // Every call below runs the REAL classifier/report; nothing is a regex over
  // source. The farm fixture mirrors the Sep 2026 proxy traffic (desktop, no
  // referrer, one page, 0 taps, ~3 s) — but half of it is stamped "US" to prove
  // the country cannot be what excludes it.
  const id = { browser: "Chrome", os: "Windows", device: "Desktop" };
  const farmSession = (n, extra = {}) => [
    at("page_visit", `farm${n}`, `fv${n}`, `2026-09-01T14:${String(n).padStart(2, "0")}:00Z`, { page_path: `/p/ChIJfarm${n}`, ...id, country: n % 2 ? "US" : "SC", referrer_domain: null, ...extra }),
    at("page_exit", `farm${n}`, `fv${n}`, `2026-09-01T14:${String(n).padStart(2, "0")}:03Z`, { page_path: `/p/ChIJfarm${n}`, ...id, active_ms: 3000, max_scroll_pct: 12, reason: "pagehide", ...extra }),
  ];
  const farm = Array.from({ length: 6 }, (_, n) => farmSession(n)).flat();
  const phoneBounce = Array.from({ length: 6 }, (_, n) => [
    at("page_visit", `ph${n}`, `pv${n}`, `2026-09-01T15:0${n}:00Z`, { page_path: "/guides/things-to-do-orlando-not-theme-parks", browser: "Mobile Safari", os: "iOS", device: "Mobile", country: "BR", referrer_domain: null }),
    at("page_exit", `ph${n}`, `pv${n}`, `2026-09-01T15:0${n}:04Z`, { page_path: "/guides/things-to-do-orlando-not-theme-parks", browser: "Mobile Safari", os: "iOS", device: "Mobile", active_ms: 4000, max_scroll_pct: 20, reason: "pagehide" }),
  ]).flat();
  const reader = [
    at("page_visit", "r1", "rv1", "2026-09-01T16:00:00Z", { page_path: "/guides/things-to-do-orlando-not-theme-parks", ...id, country: "SC", referrer_domain: "google.com" }),
    at("element_click", "r1", "rv1", "2026-09-01T16:00:40Z", { page_path: "/guides/things-to-do-orlando-not-theme-parks", ...id, element_type: "link", destination_type: "internal", destination_path: "/api/commerce/go", place_id: null }),
    at("page_exit", "r1", "rv1", "2026-09-01T16:00:41Z", { page_path: "/guides/things-to-do-orlando-not-theme-parks", ...id, active_ms: 41000, max_scroll_pct: 40, reason: "pagehide" }),
    at("page_visit", "r2", "rv2", "2026-09-01T16:10:00Z", { page_path: "/", page_surface: "suggested", browser: "Chrome", os: "Android", device: "Mobile", country: "US", referrer_domain: "instagram.com" }),
    at("element_click", "r2", "rv2", "2026-09-01T16:10:09Z", { page_surface: "suggested", browser: "Chrome", os: "Android", device: "Mobile", element_type: "button", destination_type: "none", place_id: "ChIJlakeeola" }),
    at("page_exit", "r2", "rv2", "2026-09-01T16:10:10Z", { page_surface: "suggested", browser: "Chrome", os: "Android", device: "Mobile", active_ms: 10000, max_scroll_pct: 30, reason: "route_change" }),
  ];
  const oddities = [
    at("page_visit", "ua1", "uv1", "2026-09-01T17:00:00Z", { ...id, user_agent: "Mozilla/5.0 HeadlessChrome/120.0", referrer_domain: "google.com" }),
    at("page_visit", "phb", "pb1", "2026-09-01T17:01:00Z", { ...id, ph_bot: "true", referrer_domain: "google.com" }),
    at("page_visit", "noid", "ni1", "2026-09-01T17:02:00Z", { browser: null, os: null, device: "Desktop", referrer_domain: "google.com" }),
    at("page_visit", "noidtap", "nt1", "2026-09-01T17:03:00Z", { browser: null, os: null, device: "Mobile", referrer_domain: null }),
    at("element_click", "noidtap", "nt1", "2026-09-01T17:03:09Z", { browser: null, os: null, device: "Mobile", element_type: "button", destination_type: "none" }),
  ];
  const tq = classifySessions(new Map(Object.entries(Object.groupBy([...farm, ...phoneBounce, ...reader, ...oddities], (row) => row.session_id))));
  const reasonsOf = (sid) => tq.bySession.get(sid)?.reasons || [];
  ok([0, 1, 2, 3, 4, 5].every((n) => reasonsOf(`farm${n}`).includes("repeated_no_engagement")), "traffic quality: a repeated empty desktop visit is automated whether it is stamped US or SC");
  ok([0, 1, 2, 3, 4, 5].every((n) => !tq.bySession.get(`ph${n}`)?.automated) && tq.bySession.get("ph0")?.soft.includes("no_engagement"), "traffic quality: repeated quick PHONE bounces stay people (chat-app links carry no referrer)");
  ok(!tq.bySession.get("r1")?.automated, "traffic quality: an engaged reader from outside the US is a person — country never excludes");
  ok(reasonsOf("ua1").includes("crawler_user_agent") && reasonsOf("phb").includes("posthog_bot_flag") && reasonsOf("noid").includes("no_browser_identity"), "traffic quality: crawler UA, PostHog bot flag and missing browser identity are each hard reasons");
  const fewFarm = classifySessions(new Map(Object.entries(Object.groupBy(Array.from({ length: REPEAT_MIN - 1 }, (_, n) => farmSession(n)).flat(), (row) => row.session_id))));
  ok(fewFarm.summary.automated_sessions === 0, `traffic quality: below ${REPEAT_MIN} repeats an empty desktop visit is not called a bot`);
  ok(!tq.bySession.get("noidtap")?.automated, "traffic quality: a visitor whose UA failed to parse but who TAPPED is kept");
  ok(tq.summary.raw_sessions === 18 && tq.summary.automated_sessions === 9 && tq.summary.people_sessions === 9, "traffic quality: raw = people + automated, nothing silently dropped");

  const story = buildVisitorReport([...farm, ...phoneBounce, ...reader, ...oddities], {
    names: { ChIJlakeeola: "Lake Eola Park" },
    guideTitles: { "things-to-do-orlando-not-theme-parks": "12 Things to Do in Orlando That Aren't Theme Parks" },
  });
  const cmp = story.story.traffic.comparison;
  ok(cmp.unfiltered.some((row) => /place page/.test(row.title)) && !cmp.filtered.some((row) => /place page/.test(row.title)), "visitor story: the unfiltered comparison keeps the bot landing pages the filtered view removes");
  ok(story.story.sessions_total === 18 && story.story.sessions_people === 9, "visitor story: raw and filtered session counts both reported");
  ok(!story.journeys.some((row) => row.path.some((path) => /ChIJfarm/.test(path))), "visitor story: automated sessions never reach the ranked journeys");
  const orlandoVisit = story.story.visits.find((visit) => visit.steps[0]?.includes("12 Things to Do in Orlando"));
  ok(orlandoVisit && orlandoVisit.outcome === "partner" && /partner booking link/.test(orlandoVisit.steps.join(" ")), "visitor story: a legacy internal-typed /api/commerce/go click reads as a partner booking, with the real guide title");
  const cardVisit = story.story.visits.find((visit) => visit.source === "Instagram");
  ok(cardVisit && cardVisit.steps.some((step) => step === "opened the card for Lake Eola Park"), "visitor story: a card tap names the place that was tapped");
  ok(story.exits.some((row) => row.classification === "partner_click_before_exit"), "visitor report: a click into /api/*/go ends as a partner click, not internal navigation");
  ok(!JSON.stringify(story).includes('"farm0"') && !JSON.stringify(story).includes('"rv1"'), "visitor story: session and visit ids never serialize into the story");
}
{
  // cache: stale-on-error + inflight dedupe
  let n = 0;
  const v1 = await memTTL("t1", 50, async () => { n++; return { v: n }; });
  const [a, b] = await Promise.all([memTTL("t2", 50, async () => { n++; return n; }), memTTL("t2", 50, async () => { n++; return n; })]);
  ok(v1.v >= 1 && a === b, "cache: concurrent callers share one in-flight load");
  // A 5ms sleep can exceed the old 10ms stale window on a busy build runner.
  // Advance a scoped clock so both sides of the real expiry boundary are tested.
  const realNow = Date.now;
  let now = realNow();
  try {
    Date.now = () => now;
    await memTTL("t3", 1000, async () => ({ good: true }));
    now += 1001;
    const stale = await memTTL("t3", 1000, async () => { throw new Error("provider down"); });
    ok(stale && stale.good === true && stale._stale === true, "cache: provider failure serves last-known value flagged _stale");
    now += 9000;
    let expired = false;
    try { await memTTL("t3", 1000, async () => { throw new Error("provider down"); }); }
    catch (error) { expired = error.message === "provider down"; }
    ok(expired, "cache: provider failure beyond the stale window remains an error");
  } finally { Date.now = realNow; }
}

// ── 3b. ALERT RULES ────────────────────────────────────────────────────────
const histDays = (n, devices = 40, extra = {}) => Array.from({ length: n }, (_, i) => ({ day: `d${i}`, devices, sessions: 50, out_clicks: 10, searches: 20, no_results: 2, ...extra }));
{
  ok(MIN_BASELINE_DAYS === 7, "alerts: baseline minimum is 7 complete days");
  // Not enough history -> NO traffic alert even on zero traffic today.
  const quiet = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(3), today: { devices: 0, out_clicks: 0, searches: 0, no_result_searches: 0 } });
  ok(!quiet.find((a) => a.id === "traffic_drop"), "alerts: silent without 7 days of history (no false positives on a young site)");
  // Enough history + a real drop -> fires with baseline text.
  const drop = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), trafficPaceHistory: histDays(10, 20), today: { devices: 2, out_clicks: 5, searches: 10, no_result_searches: 1 } });
  const t = drop.find((a) => a.id === "traffic_drop");
  ok(t && t.baseline && t.current === "2", "alerts: traffic drop fires with explicit current vs baseline");
  // Healthy today -> silent.
  const fine = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), trafficPaceHistory: histDays(10, 20), today: { devices: 25, out_clicks: 6, searches: 12, no_result_searches: 1 } });
  ok(!fine.find((a) => a.id === "traffic_drop"), "alerts: no drop alert when tracking at baseline");
}
// Oct 29 regression: midnight is not 2% of a full day, and missing
// comparisons never fall back to a uniform estimate. Replay production counts.
{
  const now = new Date("2026-10-29T04:07:33.255Z");
  const fullCounts = [99,172,200,319,379,335,253,388,131,721,511,488,188,413];
  const partialCounts = [0,0,1,1,1,1,0,2,1,0,2,3,0,0];
  const history = fullCounts.map((devices, i) => ({ day: `2026-10-${15 + i}`, devices, sessions: devices }));
  let reads = 0, active = 0, maxActive = 0;
  const pace = await gatherTrafficPace(history, now, async (from, to) => {
    reads++; active++; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    const index = Number(dayStr(from).slice(-2)) - 15;
    ok(zonedParts(to).hh === 0 && zonedParts(to).mm === 7 && zonedParts(to).ss === 33, "traffic pace: every historical cutoff matches 00:07:33 ET");
    ok(to > from && to - from === 453000, "traffic pace: samples cover seven minutes, not full days");
    active--;
    return { source: srcOk("fixture"), data: { active_devices: partialCounts[index], sessions: partialCounts[index] } };
  });
  ok(reads === 14 && maxActive <= 4 && pace.source.connected && pace.data.length === 14, "traffic pace: all 14 clean days are measured with bounded concurrency");
  const bundle = { fractionOfDay: 0.02, trafficHistory: history, trafficPaceHistory: pace.data, today: { devices: 0, sessions: 0 } };
  ok(!computeAlerts(bundle).some((a) => a.id === "traffic_drop"), "traffic pace: real Oct 29 midnight sample no longer sends the false 0-vs-7 alarm");
  ok(!computeAlerts({ ...bundle, trafficPaceHistory: [] }).some((a) => a.id === "traffic_drop"), "traffic pace: missing same-time history cannot revive the linear estimate");
  ok(computeAlerts({ ...bundle, trafficPaceHistory: history }).some((a) => a.id === "traffic_drop"), "traffic pace: zero still warns when measured same-time history shows real demand");
  ok(!computeAlerts({ ...bundle, trafficPaceHistory: history, today: { devices: null, sessions: null } }).some((a) => a.id === "traffic_drop"), "traffic pace: missing current counters are never a measured zero");
  const failed = await gatherTrafficPace(history, now, async () => ({ source: srcError("fixture", "timeout"), data: null }));
  ok(!failed.source.connected && failed.source.reason === "error" && failed.data === null, "traffic pace: an unavailable source remains visible, without fabricated baseline counts");
  const malformed = await gatherTrafficPace(history, now, async () => ({ source: srcOk("fixture"), data: {} }));
  ok(!malformed.source.connected && malformed.data === null, "traffic pace: empty KPI responses are not successful zero samples");
  const stale = await gatherTrafficPace(history, now, async () => ({ source: srcOk("fixture", { confidence: "stale-cache" }), data: { active_devices: 100, sessions: 100 } }));
  ok(!stale.source.connected, "traffic pace: stale samples are not fresh same-time measurements");
  const short = await gatherTrafficPace(history.slice(0, 6), now, () => { throw new Error("must not query"); });
  ok(short.source.connected && short.data.length === 0, "traffic pace: fewer than seven clean days issue no additional RPCs");
  const contradiction = await gatherTrafficPace(history, now, async () => ({ source: srcOk("fixture"), data: { active_devices: 9, sessions: 0 } }));
  ok(contradiction.source.connected && contradiction.data.length === 0, "traffic pace: contradictory partial windows cannot normalize a tracking regression");
  const winter = trafficPaceWindows([{ day: "2026-10-31", devices: 100, sessions: 100 }], new Date("2026-11-02T15:30:00Z"));
  ok(winter[0].from.toISOString() === "2026-10-31T04:00:00.000Z" && winter[0].to.toISOString() === "2026-10-31T14:30:00.000Z", "traffic pace: clocks remain 10:30 ET across the DST fallback");
  const spring = trafficPaceWindows([{ day: "2027-03-14", devices: 100, sessions: 100 }], new Date("2027-03-15T06:30:00Z"));
  ok(spring.length === 0, "traffic pace: nonexistent 02:30 spring-forward samples are excluded");
}

{
  // No-result spike needs volume.
  const lowVol = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), today: { devices: 25, searches: 2, no_result_searches: 3, out_clicks: 5 } });
  ok(!lowVol.find((a) => a.id === "no_results_spike"), "alerts: no-result rule needs >=10 searches today");
  const spike = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), today: { devices: 25, searches: 10, no_result_searches: 10, out_clicks: 5 } });
  ok(spike.find((a) => a.id === "no_results_spike"), "alerts: 50% empty-result rate vs ~9% baseline fires");
}
{
  // CWV: real fixture from live validation (mobile LCP 4009ms, CLS 0.266) must fire; INP 80 must not.
  const cwv = computeAlerts({ fractionOfDay: 0.5, dailyHistory: [], webVitalsField: [
    { metric: "LCP", device: "mobile", p75: 4009, samples: 201 },
    { metric: "CLS", device: "desktop", p75: 0.266, samples: 64 },
    { metric: "INP", device: "mobile", p75: 80, samples: 152 },
    { metric: "LCP", device: "desktop", p75: 2600, samples: 5 },
  ] });
  ok(cwv.find((a) => a.id === "cwv_LCP_mobile"), "alerts: failing mobile LCP p75 fires");
  ok(cwv.find((a) => a.id === "cwv_CLS_desktop"), "alerts: failing desktop CLS fires");
  ok(!cwv.find((a) => a.id === "cwv_INP_mobile"), "alerts: passing INP stays silent");
  ok(!cwv.find((a) => a.id === "cwv_LCP_desktop"), "alerts: <20 samples never alerts (noise floor)");
}
{
  // Data freshness watchdog: catches a cron that returns 200 but writes nothing.
  const neverWritten = computeAlerts({ fractionOfDay: 0.5, dailyHistory: [], dataFreshness: [
    { pipeline: "cwv", last_success: null, hours_since: null },
    { pipeline: "popularity", last_success: "2026-07-22T10:00:00Z", hours_since: 2 },
    { pipeline: "beach_water", last_success: "2026-07-20T12:00:00Z", hours_since: 48 },
  ] });
  ok(neverWritten.find((a) => a.id === "stale_cwv" && a.severity === "warn" && a.current === "never"), "alerts: a pipeline with no row ever written fires 'never stored'");
  ok(!neverWritten.find((a) => a.id === "stale_popularity"), "alerts: popularity within its ~9h cadence stays silent");
  ok(!neverWritten.find((a) => a.id === "stale_beach_water"), "alerts: beach water within its ~120h cadence stays silent");
  const stale = computeAlerts({ fractionOfDay: 0.5, dailyHistory: [], dataFreshness: [
    { pipeline: "cwv", last_success: "2026-07-22T02:00:00Z", hours_since: 6 },
    { pipeline: "beach_water", last_success: "2026-06-01T00:00:00Z", hours_since: 240 },
  ] });
  ok(stale.find((a) => a.id === "stale_cwv" && /6\.0h ago/.test(stale.find((a) => a.id === "stale_cwv").current)), "alerts: cwv stale past its ~3h cadence fires with hours-ago detail");
  ok(stale.find((a) => a.id === "stale_beach_water"), "alerts: beach water stale past its ~120h cadence fires");
  const healthy = computeAlerts({ fractionOfDay: 0.5, dailyHistory: [], dataFreshness: [
    { pipeline: "cwv", last_success: "2026-07-22T15:00:00Z", hours_since: 1 },
    { pipeline: "popularity", last_success: "2026-07-22T13:00:00Z", hours_since: 3 },
    { pipeline: "beach_water", last_success: "2026-07-19T12:00:00Z", hours_since: 96 },
  ] });
  ok(!healthy.find((a) => a.id && a.id.startsWith("stale_")), "alerts: all pipelines within cadence -> no freshness alerts");
}
{
  const dep = computeAlerts({ fractionOfDay: 0.1, dailyHistory: [], deployments: [{ state: "ERROR", target: "production", ref: "main", sha: "abc1234" }] });
  ok(dep.find((a) => a.id === "deploy_failed" && a.severity === "critical"), "alerts: failed production deploy is critical");
  const site = computeAlerts({ fractionOfDay: 0.1, dailyHistory: [], synthetic: { checks: [{ key: "home", label: "Homepage", ok: false, status: 0, ms: 6000, error: "timeout" }] } });
  ok(site.find((a) => a.id === "site_check_failed" && a.severity === "critical"), "alerts: homepage self-check failure is critical");
  const info = computeAlerts({ fractionOfDay: 0.1, dailyHistory: [], sources: [srcMissing("PostHog", "add key"), srcOk("Supabase")] });
  const inf = info.find((a) => a.id === "sources_unconnected");
  ok(inf && inf.severity === "info", "alerts: a missing provider is an INFO setup note, not a metric alarm");
  const sev = computeAlerts({ fractionOfDay: 0.1, dailyHistory: [], deployments: [{ state: "ERROR", target: "production" }], sources: [srcMissing("X", "y")] });
  ok(sev[0].severity === "critical", "alerts: sorted most-severe first");
  // Revenue rule NEVER fires without provider history (no click-derived revenue alarms).
  const rev = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), today: { devices: 40 }, tpRevenue: { revenue_paid_usd: 0 }, tpRevenueHistory: null });
  ok(!rev.find((a) => a.id === "revenue_drop"), "alerts: revenue rule requires provider-reported history");
}

// ── 3c. SQL ↔ JS lockstep ──────────────────────────────────────────────────
{
  const sql = readFileSync(new URL("../supabase/command-center.sql", import.meta.url), "utf8");
  const arr = (name) => {
    const m = sql.match(new RegExp(name + "\\(\\)[\\s\\S]*?array\\[([^\\]]+)\\]"));
    return m ? m[1].split(",").map((s) => s.trim().replace(/'/g, "")) : null;
  };
  const sqlOut = arr("wf_cc_out_actions");
  const sqlEng = arr("wf_cc_engage_actions");
  ok(sqlOut && sqlOut.join("|") === OUT_ACTIONS.join("|"), "lockstep: SQL out-action list === eventMap.OUT_ACTIONS");
  ok(sqlEng && sqlEng.join("|") === ENGAGE_ACTIONS.join("|"), "lockstep: SQL engage-action list === eventMap.ENGAGE_ACTIONS");
  const sqlBrowse = arr("wf_cc_browse_actions");
  ok(sqlBrowse && sqlBrowse.join("|") === BROWSE_ACTIONS.join("|"), "lockstep: SQL browse-action list === eventMap.BROWSE_ACTIONS (funnel step 2 + discovery rate share one list)");
  ok(/no_result_city/.test(sql) && /regexp_replace\(coalesce\(meta->>'loc',''\), '\^\[\^,\]\*\[0-9\]/.test(sql.replace(/\\/g, "")) || /\[0-9\]\[\^,\]\*,/.test(sql), "privacy: no-result locations strip street-address segments to city level");
  const created = [...sql.matchAll(/create or replace function public\.(wf_cc_\w+)\(/g)].map((m) => m[1]);
  const locked = [...sql.matchAll(/'(wf_cc_\w+)\(/g)].map((m) => m[1]);
  for (const fn of created) ok(locked.includes(fn), `lockstep: ${fn} is in the revoke/grant lock list (server-only EXECUTE)`);
  ok(/revoke all on function public\.%s from public, anon, authenticated/.test(sql), "lockstep: revoke covers public+anon+authenticated");
  for (const name of ["place_detail_opened", "place_saved", "place_shared", "directions_clicked", "affiliate_link_clicked", "booking_confirmed", "signup_completed", "itinerary_created", "search_submitted", "search_no_results", "city_changed", "category_selected", "place_card_viewed"]) {
    ok(EVENT_MAP[name] && typeof EVENT_MAP[name].definition === "string" && typeof EVENT_MAP[name].tracked === "boolean", `dictionary: canonical event '${name}' is defined with an explicit tracked flag`);
  }
  ok(Object.values(EVENT_MAP).every((e) => e.tracked === false ? e.sources.length === 0 : e.sources.length > 0), "dictionary: tracked events cite real sources; untracked cite none (never estimated)");
  ok(Object.values(KPI_DEFS).every((s) => typeof s === "string" && s.length > 20), "dictionary: every KPI has a plain-English definition");
}

// ── 4. LEAK / CLIENT-BUNDLE LOCKS ──────────────────────────────────────────
{
  const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  // Code-only view: strip comments so a doc reference never trips a leak lock.
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  const route = read("app/api/command-center/[panel]/route.js");
  ok(route.indexOf("requireOwner(") !== -1 && route.indexOf("requireOwner(") < route.indexOf("switch (panel)"), "route: requireOwner runs before any panel dispatch");
  ok(/force-dynamic/.test(route), "route: force-dynamic (no static caching of owner data)");
  const ui = read("app/command-center/ui.js");
  const charts = read("app/command-center/charts.js");
  const page = read("app/command-center/page.js");
  for (const [name, raw] of [["ui.js", ui], ["charts.js", charts], ["page.js", page]]) {
    const src = code(raw);
    ok(!/dangerouslySetInnerHTML/.test(src), `client: ${name} never uses dangerouslySetInnerHTML (all provider text is untrusted)`);
    ok(!/from\s+["'][^"']*commandCenter\/(auth|supabaseAdmin|sources\/|alerts)/.test(src), `client: ${name} never imports server-only Command Center modules`);
    ok(!/https?:\/\/[^"'`\s]*(posthog\.com|sentry\.io\/api|api\.vercel\.com|travelpayouts\.com|api\.stay22\.com|api\.github\.com)/.test(src), `client: ${name} talks only to /api/command-center/*, never to providers`);
    ok(!/SERVICE_ROLE|PERSONAL_API_KEY|AUTH_TOKEN|ACCESS_TOKEN|STAY22_REPORTING_API_KEY/.test(src), `client: ${name} references no server secrets`);
  }
  ok(/robots:\s*\{\s*index:\s*false/.test(page), "page: /command-center is noindexed");
  ok(/Briefing & metrics/.test(ui) && /Fixed previous-day briefing/.test(ui) && /unaffected by the metrics date range/.test(ui), "ui: fixed previous-day briefing is explicitly separate from the selected metrics window");
  ok(/healthy:\s*"Report complete"/.test(ui) && !/healthy:\s*"Working well"/.test(ui), "ui: a healthy briefing status means report complete, not a claim that live signals are working well");
  ok(/Live alerts · today/.test(ui) && /Current-day signals, unaffected by the metrics date range/.test(ui), "ui: live current-day alerts are explicitly separate from the fixed briefing and selected metrics window");
  ok(/Metrics date range/.test(ui) && /Selected metrics window:/.test(ui), "ui: date controls and overview identify their scope as metrics only");
  ok(/Verified in this report/.test(ui) && /No alerts triggered by the available data/.test(ui), "ui: mixed-period report confirmations and underpowered alert inputs do not overclaim current health");
  ok(!/No active alerts[^\n]*all monitored baselines are within range/.test(ui), "ui: no-alert state does not claim every baseline was eligible and healthy");
  ok(/healthOk === true \? "all checks passing"[^\n]*"health status unavailable"/.test(ui), "ui: missing live health status is unavailable, never all checks passing");
  // React hooks rule (regression: unlock crashed with "Rendered fewer hooks
  // than expected"): inside every component function of ui.js, NO hook call
  // (useX / usePanel) may appear after a `return` statement — an early
  // error-return above a hook changes the hook count between renders.
  {
    // Split on top-level component declarations (function / export default function).
    const chunks = code(ui).split(/\n(?:export default )?function /).slice(1);
    for (const chunk of chunks) {
      const name = (chunk.match(/^(\w+)/) || [])[1] || "?";
      if (!/^[A-Z]/.test(name)) continue; // components only
      // Component-top-level statements in this file are 2-space indented;
      // returns inside nested callbacks/JSX sit deeper and are ignored.
      const lines = chunk.split("\n");
      let guardSeen = null;
      for (const line of lines) {
        if (/^  (if \([^\n]*\) )?return[\s(;]/.test(line)) { guardSeen = guardSeen || line.trim().slice(0, 60); continue; }
        if (guardSeen && /^  (const|let|var)?[^=\n]*=?\s*\buse[A-Z]\w*\s*\(/.test(line)) {
          fail(`hooks: <${name}> calls a hook after top-level '${guardSeen}' (conditional-hooks crash)`);
          break;
        }
      }
    }
  }
  const sitemap = read("app/sitemap.js");
  ok(!/command-center/.test(sitemap), "sitemap: /command-center is not listed");
  const example = read(".env.local.example");
  for (const k of ["POSTHOG_PERSONAL_API_KEY", "SENTRY_AUTH_TOKEN", "VERCEL_API_TOKEN", "TRAVELPAYOUTS_TOKEN", "STAY22_REPORTING_API_KEY"]) {
    ok(example.includes(k), `env: ${k} documented in .env.local.example`);
    ok(!example.includes("NEXT_PUBLIC_" + k), `env: ${k} has no NEXT_PUBLIC_ variant (server-only secret)`);
  }
  const audit = read("lib/envAudit.js");
  ok(/POSTHOG_PERSONAL_API_KEY/.test(audit) && /SENTRY_AUTH_TOKEN/.test(audit) && /STAY22_REPORTING_API_KEY/.test(audit), "env: Command Center keys registered in envAudit OPTIONAL");

  // Regression: the Health panel once queried raw web_vitals rows even though
  // PostHog's project-level test-account filters were enabled by default. That
  // made owner/internal sessions push desktop CLS from the real-user 0.086 to
  // ~0.16 and raised a false red health alarm. Drive the real source with a
  // fake PostHog Query API and inspect the issued request: this proves the
  // filter is ACTIVE at runtime, not merely mentioned in source text.
  const posthogPath = "lib/commandCenter/sources/posthog.js";
  const posthogSource = read(posthogPath);
  const posthogModule = await import("../lib/commandCenter/sources/posthog.js");
  const { webVitalsField, visitorStory } = posthogModule;
  let posthogBody = null;
  const posthogProbe = await webVitalsField(
    new Date("2026-09-01T00:00:00Z"),
    new Date("2026-09-02T00:00:00Z"),
    {
      env: {
        POSTHOG_PERSONAL_API_KEY: "test-query-key",
        POSTHOG_PROJECT_ID: "507756",
        POSTHOG_API_HOST: "https://posthog.invalid",
      },
      fetchImpl: async (_url, init = {}) => {
        posthogBody = JSON.parse(init.body || "{}");
        return {
          ok: true,
          status: 200,
          json: async () => ({ columns: ["metric", "device", "samples", "p75"], results: [["CLS", "desktop", 30, 86]] }),
          text: async () => "",
        };
      },
      excludedUserIds: ["uuid-owner", "uuid-staff"],
    },
  );
  const posthogCwvFiltered = posthogProbe?.data?.[0]?.p75 === 0.086
    && posthogBody?.query?.filters?.filterTestAccounts === true
    && /\{filters\}/.test(posthogBody?.query?.query || "")
    && /properties\.\$virt_is_bot/.test(posthogBody?.query?.query || "")
    && /person_distinct_ids/.test(posthogBody?.query?.query || "")
    && /uuid-owner/.test(posthogBody?.query?.query || "")
    && (posthogSource.match(/REAL_EVENTS/g) || []).length >= 10;

  const visitorQueries = [];
  const visitorProbe = await visitorStory(
    new Date("2026-09-01T00:00:00Z"), new Date("2026-09-02T00:00:00Z"), {
      env: { POSTHOG_PERSONAL_API_KEY: "test-query-key", POSTHOG_PROJECT_ID: "507756", POSTHOG_API_HOST: "https://posthog.invalid" },
      excludedUserIds: ["uuid-owner"],
      fetchImpl: async (_url, init = {}) => {
        visitorQueries.push(JSON.parse(init.body || "{}").query?.query || "");
        return { ok: true, status: 200, json: async () => ({ columns: ["event", "timestamp", "session_id", "visit_id", "page_path"], results: [["page_visit", "2026-09-01T12:00:00Z", "private-session", "private-visit", "/"]] }), text: async () => "" };
      },
    });
  ok(visitorProbe.visitorReport?.journeys?.[0]?.visits === 1, "visitor source: visitorStory returns the aggregate report contract");
  ok(!JSON.stringify(visitorProbe).includes("private-session") && !JSON.stringify(visitorProbe).includes("private-visit"), "visitor source: visitorStory never returns correlation ids");
  const visitorQuery = visitorQueries.find((query) => /page_active_time/.test(query)) || "";
  const diagnosticQuery = visitorQueries.find((query) => /places_none/.test(query)) || "";
  // The story classifies bots itself so it can show raw vs filtered: PostHog's
  // flag must arrive as a COLUMN, and must NOT be filtered away in SQL.
  ok(/LIMIT 50001/.test(visitorQuery) && /properties\.\$virt_is_bot AS ph_bot/.test(visitorQuery) && !/\$virt_is_bot\), 'false'\) NOT IN/.test(visitorQuery) && !/\{wayfind/.test(visitorQuery), "visitor source: report query is bounded, carries the bot flag as a column, and leaves no unresolved scope placeholder");
  ok(/uuid-owner/.test(visitorQuery) && /\$internal_or_test_user/.test(visitorQuery), "visitor source: internal/test people are still excluded from both views");
  ok(/provider_redirect_failed/.test(diagnosticQuery) && /Unknown page/.test(diagnosticQuery), "visitor source: diagnostics use verified event names and preserve missing paths as unknown");

  const allQueries = [];
  const allOpts = {
    env: { POSTHOG_PERSONAL_API_KEY: "test-query-key", POSTHOG_PROJECT_ID: "507756", POSTHOG_API_HOST: "https://posthog.invalid" },
    excludedUserIds: ["uuid-owner", "uuid-staff"],
    fetchImpl: async (_url, init = {}) => {
      allQueries.push(JSON.parse(init.body || "{}"));
      return { ok: true, status: 200, json: async () => ({ columns: [], results: [] }), text: async () => "" };
    },
  };
  const qFrom = new Date("2026-10-03T00:00:00Z");
  const qTo = new Date("2026-10-04T00:00:00Z");
  await Promise.all([
    posthogModule.overviewCounts(qFrom, qTo, allOpts), posthogModule.dailyTraffic(qFrom, qTo, allOpts),
    posthogModule.channels(qFrom, qTo, allOpts), posthogModule.referrers(qFrom, qTo, allOpts), posthogModule.utms(qFrom, qTo, allOpts),
    posthogModule.entryExit(qFrom, qTo, allOpts), posthogModule.topPages(qFrom, qTo, allOpts), posthogModule.devices(qFrom, qTo, allOpts),
    posthogModule.viewports(qFrom, qTo, allOpts), posthogModule.geo(qFrom, qTo, allOpts), posthogModule.newVsReturning(qFrom, qTo, allOpts),
    posthogModule.webVitalsByRoute(qFrom, qTo, allOpts), posthogModule.errorsDaily(qFrom, qTo, allOpts),
    posthogModule.revenueHeartbeatCounts(qFrom, qTo, allOpts), posthogModule.revenueHeartbeatDaily(qFrom, qTo, allOpts),
    posthogModule.liveByMinute(allOpts), posthogModule.liveNow(allOpts), posthogModule.errorCount24h(allOpts), posthogModule.boundaryErrorsByBuild(allOpts),
  ]);
  ok(allQueries.length === 19, `posthog scope: all 19 query helpers executed against the fake Query API (got ${allQueries.length})`);
  ok(allQueries.every((body) => body.query?.filters?.filterTestAccounts === true && /\$virt_is_bot/.test(body.query?.query || "") && /person_distinct_ids/.test(body.query?.query || "")), "posthog scope: every query applies project test filters plus bot/internal/linked-account exclusion at runtime");
  ok(allQueries.filter((body) => /FROM sessions/.test(body.query?.query || "")).every((body) => /\{filters\}/.test(body.query?.query || "")), "posthog scope: session helpers apply PostHog's project test-account predicate inside their bounded eligible-event subquery");
  const exclusionFailure = await posthogModule.overviewCounts(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-02T00:00:00Z"), {
    env: { POSTHOG_PERSONAL_API_KEY: "test-query-key", POSTHOG_PROJECT_ID: "507756", POSTHOG_API_HOST: "https://posthog.invalid" },
    fetchImpl: async () => { throw new Error("PostHog must not run without exclusions"); },
  });
  ok(exclusionFailure.data === null && exclusionFailure.source?.reason === "error" && /supabase_not_configured/.test(exclusionFailure.source?.note || ""), "posthog scope: unavailable exclusion source fails closed instead of reporting contaminated traffic");

  // Stay22 Hub Data Reporting API contract (GET /v1/reporting/transactions with X-API-KEY):
  // verifies missing-token visibility, HTTP 401/403 visibility, pagination, idempotent
  // deduplication across repeated runs, status transitions (pending -> approved -> paid),
  // cancellations/reversals, multi-currency flagging, reporting lag note, and separate
  // booking approval vs. commission payment totals.
  const stay22Module = await import("../lib/commandCenter/sources/stay22.js");
  const { stay22Stats, reconcileStay22Transactions } = stay22Module;
  const s22Missing = await stay22Stats(qFrom, qTo, { env: {} });
  ok(s22Missing.data === null && s22Missing.source?.connected === false && s22Missing.source?.reason === "not_configured" && s22Missing.source?.confidence === "unavailable", "stay22: missing STAY22_REPORTING_API_KEY returns explicit not_configured (never silent $0.00)");
  const s22AuthFail = await stay22Stats(qFrom, qTo, {
    env: { STAY22_REPORTING_API_KEY: "invalid-key" },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) }),
  });
  ok(s22AuthFail.data === null && s22AuthFail.source?.connected === false && s22AuthFail.source?.reason === "error" && /HTTP 401/.test(s22AuthFail.source?.note || ""), "stay22: HTTP 401 auth failure is surfaced as error, never silent $0.00");

  const s22Calls = [];
  const page1 = [
    // Tx 1: initially pending on page 1, upgraded to approved on page 2 (idempotent status update)
    { transaction_id: "tx-101", status: "pending", commission: 18.5, currency: "USD", campaign: "click-uuid-1", created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-03T12:00:00Z" },
    // Tx 2: initially approved, then canceled on page 2 (reversal must remove approved commission)
    { transaction_id: "tx-102", status: "approved", commission: 42.0, currency: "USD", campaign: "click-uuid-2", created_at: "2026-10-03T13:00:00Z", updated_at: "2026-10-03T13:00:00Z" },
  ];
  const page2 = [
    // Duplicate of tx-101 with newer updated_at and approved status
    { transaction_id: "tx-101", status: "confirmed", commission: 18.5, currency: "USD", campaign: "click-uuid-1", created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-04T08:00:00Z" },
    // Reversal of tx-102
    { transaction_id: "tx-102", status: "cancelled", commission: 42.0, currency: "USD", campaign: "click-uuid-2", created_at: "2026-10-03T13:00:00Z", updated_at: "2026-10-04T09:00:00Z" },
    // Tx 3: paid booking (distinct from approved-unpaid)
    { transaction_id: "tx-103", status: "paid", payout_status: "paid", commission: 31.25, gross_amount: 450, currency: "USD", campaign: "click-uuid-3", created_at: "2026-10-03T15:00:00Z", updated_at: "2026-10-04T10:00:00Z" },
    // Exact duplicate of tx-103 (repeated run / page overlap)
    { transaction_id: "tx-103", status: "paid", payout_status: "paid", commission: 31.25, gross_amount: 450, currency: "USD", campaign: "click-uuid-3", created_at: "2026-10-03T15:00:00Z", updated_at: "2026-10-04T10:00:00Z" },
  ];
  const s22Paged = await stay22Stats(qFrom, qTo, {
    env: { STAY22_REPORTING_API_KEY: "s22-test-key" },
    pageLimit: 2,
    fetchImpl: async (url, init = {}) => {
      s22Calls.push({ url: String(url), headers: init.headers || {} });
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") || 0);
      const rows = offset === 0 ? page1 : offset === 2 ? page2 : [];
      return { ok: true, status: 200, json: async () => ({ data: rows, has_more: offset === 0 }) };
    },
  });
  ok(s22Calls.length === 2 && /\/v1\/reporting\/transactions\?/.test(s22Calls[0].url) && s22Calls[0].headers["X-API-KEY"] === "s22-test-key", "stay22: calls GET /v1/reporting\/transactions with X-API-KEY header and paginates until complete");
  ok(/start_date=2026-10-03/.test(s22Calls[0].url) && /end_date=2026-10-04/.test(s22Calls[0].url), "stay22: passes date window parameters start_date and end_date");
  ok(s22Paged.source?.connected === true && s22Paged.source?.confidence === "provider-reported", "stay22: USD-only complete reconciliation is marked connected and provider-reported");
  ok(s22Paged.data?.unique_transactions === 3 && s22Paged.data?.rows_seen === 6, "stay22: deduplicates repeated transaction_ids idempotently across pages and runs");
  ok(s22Paged.data?.confirmed_bookings === 2 && s22Paged.data?.commission_approved_usd === 49.75, "stay22: status transition pending->confirmed counts in confirmed_bookings and commission_approved_usd");
  ok(s22Paged.data?.paid_bookings === 1 && s22Paged.data?.revenue_paid_usd === 31.25, "stay22: separates total approved commission ($49.75 across 2 bookings) from paid commission ($31.25 across 1 booking)");
  ok(s22Paged.data?.canceled === 1 && s22Paged.data?.commission_reversed_usd === 42, "stay22: reversal approved->cancelled moves commission out of approved into canceled and commission_reversed_usd");
  ok(typeof s22Paged.data?.reporting_lag_note === "string" && /checkout/.test(s22Paged.data.reporting_lag_note) && s22Paged.data?.covered_period?.from === "2026-10-03", "stay22: includes explicit reporting lag note and covered period");

  // Multi-currency safeguard: non-USD rows are bucketed in by_currency and never silently summed into USD
  const s22MultiCurr = reconcileStay22Transactions([
    { transaction_id: "tx-eur-1", status: "approved", commission: 25, currency: "EUR", campaign: "click-eur" },
  ]);
  ok(s22MultiCurr.partial?.reason === "multi_currency_unconverted" && s22MultiCurr.agg.commission_approved_usd === null && s22MultiCurr.agg.by_currency.EUR.commission_approved === 25, "stay22: non-USD transactions are isolated in by_currency and never summed into USD without FX conversion");

  const srcFiles = [posthogPath, "lib/commandCenter/sources/sentry.js", "lib/commandCenter/sources/travelpayouts.js", "lib/commandCenter/sources/stay22.js", "lib/commandCenter/sources/vercel.js"];
  for (const f of srcFiles) ok(/srcMissing\(/.test(read(f)) && (f !== posthogPath || posthogCwvFiltered), `source: ${f} has an explicit not-configured path; every PostHog query also applies project, bot, internal-person, and server-listed account exclusions`);
  // Alerts email cron: fail-closed auth, fail-soft capability, one shared gatherer.
  const cron = code(read("app/api/cron/cc-alerts/route.js"));
  ok(/CRON_SECRET/.test(cron) && /status:\s*401/.test(cron) && cron.indexOf("401") < cron.indexOf("RESEND_API_KEY"), "cron: cc-alerts is fail-closed on CRON_SECRET before any work");
  ok(/gatherAlerts/.test(cron) && /gatherAlerts/.test(read("app/api/command-center/[panel]/route.js")), "cron: panel and mailer share ONE alert gatherer (no drift)");
  ok(/idle: true/.test(cron), "cron: missing Resend config is an idle response, not an error");
  ok(!/searchParams\.get\(["']key["']\)/.test(cron), "cron: no query-param secrets");
  const vj = JSON.parse(read("vercel.json"));
  ok(vj.crons.some((c) => c.path === "/api/cron/cc-alerts"), "cron: cc-alerts is registered in vercel.json");
  const fpSrc = read("lib/commandCenter/sources/firstParty.js");
  ok(/wf_cc_/.test(fpSrc) && !/from\("events"\)|rest\/v1\/events\?/.test(fpSrc), "source: first-party reads go through wf_cc_* aggregate RPCs only (no raw event rows)");
}

if (failures) { console.error(`test-command-center: ${failures} failure(s)`); process.exit(1); }
console.log("test-command-center: OK — auth fail-closed, ET windows + DST, honest not-connected states, alert baselines, SQL↔JS lockstep, no client leaks");
