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
import { computeAlerts, MIN_BASELINE_DAYS } from "../lib/commandCenter/alerts.js";
import { srcMissing, srcOk, srcError, jsonNoStore } from "../lib/commandCenter/respond.js";
import { memTTL } from "../lib/commandCenter/cache.js";
import { OUT_ACTIONS, ENGAGE_ACTIONS, EVENT_MAP, KPI_DEFS } from "../lib/commandCenter/eventMap.js";

let failures = 0;
const fail = (m) => { console.error("test-command-center: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

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
  // cache: stale-on-error + inflight dedupe
  let n = 0;
  const v1 = await memTTL("t1", 50, async () => { n++; return { v: n }; });
  const [a, b] = await Promise.all([memTTL("t2", 50, async () => { n++; return n; }), memTTL("t2", 50, async () => { n++; return n; })]);
  ok(v1.v >= 1 && a === b, "cache: concurrent callers share one in-flight load");
  await memTTL("t3", 1, async () => ({ good: true }));
  await new Promise((r) => setTimeout(r, 5));
  const stale = await memTTL("t3", 1, async () => { throw new Error("provider down"); });
  ok(stale && stale.good === true && stale._stale === true, "cache: provider failure serves last-known value flagged _stale");
}

// ── 3b. ALERT RULES ────────────────────────────────────────────────────────
const histDays = (n, devices = 40, extra = {}) => Array.from({ length: n }, (_, i) => ({ day: `d${i}`, devices, sessions: 50, out_clicks: 10, searches: 20, no_results: 2, ...extra }));
{
  ok(MIN_BASELINE_DAYS === 7, "alerts: baseline minimum is 7 complete days");
  // Not enough history -> NO traffic alert even on zero traffic today.
  const quiet = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(3), today: { devices: 0, out_clicks: 0, searches: 0, no_result_searches: 0 } });
  ok(!quiet.find((a) => a.id === "traffic_drop"), "alerts: silent without 7 days of history (no false positives on a young site)");
  // Enough history + a real drop -> fires with baseline text.
  const drop = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), today: { devices: 2, out_clicks: 5, searches: 10, no_result_searches: 1 } });
  const t = drop.find((a) => a.id === "traffic_drop");
  ok(t && t.baseline && t.current === "2", "alerts: traffic drop fires with explicit current vs baseline");
  // Healthy today -> silent.
  const fine = computeAlerts({ fractionOfDay: 0.5, dailyHistory: histDays(10), today: { devices: 25, out_clicks: 6, searches: 12, no_result_searches: 1 } });
  ok(!fine.find((a) => a.id === "traffic_drop"), "alerts: no drop alert when tracking at baseline");
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
    ok(!/https?:\/\/[^"'`\s]*(posthog\.com|sentry\.io\/api|api\.vercel\.com|travelpayouts\.com|api\.github\.com)/.test(src), `client: ${name} talks only to /api/command-center/*, never to providers`);
    ok(!/SERVICE_ROLE|PERSONAL_API_KEY|AUTH_TOKEN|ACCESS_TOKEN/.test(src), `client: ${name} references no server secrets`);
  }
  ok(/robots:\s*\{\s*index:\s*false/.test(page), "page: /command-center is noindexed");
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
  for (const k of ["POSTHOG_PERSONAL_API_KEY", "SENTRY_AUTH_TOKEN", "VERCEL_API_TOKEN", "TRAVELPAYOUTS_TOKEN"]) {
    ok(example.includes(k), `env: ${k} documented in .env.local.example`);
    ok(!example.includes("NEXT_PUBLIC_" + k), `env: ${k} has no NEXT_PUBLIC_ variant (server-only secret)`);
  }
  const audit = read("lib/envAudit.js");
  ok(/POSTHOG_PERSONAL_API_KEY/.test(audit) && /SENTRY_AUTH_TOKEN/.test(audit), "env: Command Center keys registered in envAudit OPTIONAL");
  const srcFiles = ["lib/commandCenter/sources/posthog.js", "lib/commandCenter/sources/sentry.js", "lib/commandCenter/sources/travelpayouts.js", "lib/commandCenter/sources/vercel.js"];
  for (const f of srcFiles) ok(/srcMissing\(/.test(read(f)), `source: ${f} has an explicit not-configured path`);
  const fpSrc = read("lib/commandCenter/sources/firstParty.js");
  ok(/wf_cc_/.test(fpSrc) && !/from\("events"\)|rest\/v1\/events\?/.test(fpSrc), "source: first-party reads go through wf_cc_* aggregate RPCs only (no raw event rows)");
}

if (failures) { console.error(`test-command-center: ${failures} failure(s)`); process.exit(1); }
console.log("test-command-center: OK — auth fail-closed, ET windows + DST, honest not-connected states, alert baselines, SQL↔JS lockstep, no client leaks");
