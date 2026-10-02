#!/usr/bin/env node
/**
 * test-redirect-visitor-scope — partner redirects never count as visitors
 * (2026-10-02, analytics reconciliation).
 *
 * The /api/*\/go redirect routes capture provider_redirect_* events server-side
 * (lib/serverEvents.js captureServer, $lib "wayfind-server"). With no PostHog
 * cookie they fall back to the click id as distinct_id, so every such click
 * minted a new PostHog person, and the Command Center's uniq(person_id) visitor
 * counts (Overview, Live now, by-minute, daily) counted each one as a visitor,
 * the owner's own partner clicks included.
 *
 * 1. CALLED, the real /api/commerce/go handler with fetch stubbed (nothing
 *    leaves the process): with no cookie the PostHog body carries
 *    $process_person_profile:false and distinct_id = the click id; WITH the
 *    visitor's ph_<key>_posthog cookie it carries their distinct_id and no
 *    personless flag (a real visitor's click still joins their person).
 * 2. The other three go routes pass personless: !cookieDistinctId to
 *    captureServer (structural: same shape, asserted per route).
 * 3. CALLED, the four PostHog visitor queries (overviewCounts, liveByMinute,
 *    liveNow, dailyTraffic) with hogql intercepted: each query text carries the
 *    $lib != 'wayfind-server' clause, while a commerce query that NEEDS the
 *    server events (funnel/revenue) does not.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── 1. the real route, fetch stubbed ─────────────────────────────────────────
const KEY = "phc_guardtest_redirect_scope_not_real";
process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
delete process.env.WF_SUPPRESS_ANALYTICS; // the gate is re-armed in finally; fetch is stubbed, nothing can leave
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  if (/posthog\.com\/capture/.test(String(url))) { sent.push(JSON.parse(init.body)); return { ok: true }; }
  throw new Error("guard: no network (" + String(url).slice(0, 60) + ")");
};
const settle = () => new Promise((r) => setTimeout(r, 60));
try {
  const mod = await import("../app/api/commerce/go/route.js");
  const call = (headers) => mod.GET(new Request("https://wayfind.test/api/commerce/go?provider=viator&offer=abc", { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", ...headers } }));

  sent.length = 0;
  const r1 = await call({});
  await settle();
  ok(r1.status === 302, `cookie-less click still redirects (302), got ${r1.status}`);
  ok(sent.length >= 1, `cookie-less click captured an event (sent ${sent.length})`);
  const c1 = sent[0] || { properties: {} };
  ok(c1.properties.$process_person_profile === false, `cookie-less click is personless: $process_person_profile=${JSON.stringify(c1.properties.$process_person_profile)}`);
  ok(c1.properties.$lib === "wayfind-server", "server events keep $lib wayfind-server (the reader's visitor exclusion key)");

  sent.length = 0;
  const visitorId = "0190fixture-visitor-distinct-id";
  const cookie = `ph_${KEY}_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: visitorId }))}`;
  const r2 = await call({ cookie });
  await settle();
  ok(r2.status === 302, `click with the visitor cookie still redirects (302), got ${r2.status}`);
  const c2 = sent[0] || { properties: {} };
  ok(c2.distinct_id === visitorId, `a cookied click joins the visitor's person: distinct_id=${c2.distinct_id}`);
  ok(!("$process_person_profile" in c2.properties), "a cookied click is NOT personless (positive control for the flag)");
  ok(r1.headers.get("location") === r2.headers.get("location"), "the redirect target is identical with and without the cookie (analytics only, no routing change)");
} catch (e) {
  ok(false, "route invocation threw: " + (e && e.message));
} finally {
  globalThis.fetch = realFetch;
  process.env.WF_SUPPRESS_ANALYTICS = "1";
}

// ── 2. the other three routes (structural) ───────────────────────────────────
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
for (const r of ["hotels", "ticketmaster", "viator", "commerce"]) {
  const src = strip(readFileSync(path.join(ROOT, `app/api/${r}/go/route.js`), "utf8"));
  ok(/const cookieDistinctId = distinctIdFromCookies\(req\.headers\.get\("cookie"\)\);/.test(src), `${r}/go reads the cookie id into cookieDistinctId`);
  const caps = src.match(/captureServer\([^;]*\);/g) || [];
  ok(caps.length >= 1 && caps.every((c) => /personless:\s*!cookieDistinctId/.test(c)), `${r}/go: every captureServer call passes personless: !cookieDistinctId (${caps.length} call(s))`);
}

// ── 3. the visitor queries, hogql intercepted ────────────────────────────────
process.env.POSTHOG_PERSONAL_API_KEY = "phx_guardtest_not_real";
process.env.POSTHOG_PROJECT_ID = "1";
const queries = [];
globalThis.fetch = async (url, init = {}) => {
  if (/\/query\/?/.test(String(url))) { try { queries.push(JSON.parse(init.body).query.query); } catch (e) { queries.push(String(init.body)); } return { ok: true, status: 200, json: async () => ({ results: [], columns: [] }) }; }
  if (/supabase|rpc/.test(String(url))) return { ok: true, status: 200, json: async () => [] };
  return { ok: true, status: 200, json: async () => ({ results: [], columns: [] }) };
};
try {
  const ph = await import("../lib/commandCenter/sources/posthog.js");
  const from = new Date("2026-09-30T04:00:00Z"), to = new Date("2026-10-01T04:00:00Z");
  const env = { POSTHOG_PERSONAL_API_KEY: "phx_guardtest_not_real", POSTHOG_PROJECT_ID: "1" };
  // hogql's own injection points: no global fetch, no exclusion RPC.
  const fetchImpl = async (url, init = {}) => { queries.push(JSON.parse(init.body).query.query); return { ok: true, status: 200, json: async () => ({ results: [], columns: [] }) }; };
  const opts = { env, fetchImpl, excludedUserIds: [] };
  for (const [name, fn] of [["overviewCounts", () => ph.overviewCounts(from, to, opts)], ["liveByMinute", () => ph.liveByMinute(opts)], ["liveNow", () => ph.liveNow(opts)], ["dailyTraffic", () => ph.dailyTraffic(from, to, opts)]]) {
    queries.length = 0;
    try { await fn(); } catch (e) {}
    const q = queries.find((x) => /uniq\(person_id\)/.test(x)) || "";
    ok(q.length > 0, `${name}: the visitor query was issued (probe positive control)`);
    ok(/coalesce\(toString\(properties\.\$lib\), ''\) != 'wayfind-server'/.test(q), `${name}: visitor query excludes server ($lib wayfind-server) events`);
  }
} catch (e) {
  ok(false, "posthog source threw: " + (e && e.message));
} finally {
  globalThis.fetch = realFetch;
}
// negative control: the commerce/revenue readers must keep server events
const phSrc = strip(readFileSync(path.join(ROOT, "lib/commandCenter/sources/posthog.js"), "utf8"));
const uses = (phSrc.match(/\$\{VISITOR_EVENTS\}/g) || []).length;
ok(uses === 4, `VISITOR_EVENTS is applied to exactly the 4 visitor queries, found ${uses}`);
ok(/const REAL_EVENTS = "\{filters\} AND \{wayfindRealEvents\}";/.test(phSrc), "REAL_EVENTS (shared by commerce/revenue panels) is unchanged");

if (fail.length) {
  console.error(`✗ test-redirect-visitor-scope: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-redirect-visitor-scope: ${pass} assertions (commerce/go CALLED with and without the visitor cookie; 4 visitor queries CALLED; 4 routes checked)`);
