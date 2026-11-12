// scripts/test-osm-regional.mjs — behavioral lock for lib/osmRegional.js and
// its wiring (owner brief 2026-11-06, "finish the discovery cache fix").
//
// Deterministic: Overpass and Supabase are simulated in memory. The fake
// Supabase implements exactly the PostgREST calls the module makes (upsert
// with merge/ignore duplicates, k=in.(..), k=eq, conditional PATCH on exp,
// holder filter), so persistence is proven across SEPARATE invocations that
// share nothing but the store. No live provider is ever called.
import { readFileSync } from "fs";
import * as M from "../lib/osmRegional.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { buildOwnerBriefing, withBriefingOperations, briefingText } from "../lib/commandCenter/briefing.js";

let pass = 0;
const fail = (m) => { console.error("test-osm-regional: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── fake clock ──────────────────────────────────────────────────────────────
let clock = Date.parse("2026-11-06T11:00:00Z");
const now = () => clock;

// ── fake Supabase (PostgREST subset) ────────────────────────────────────────
function makeStore() {
  const rows = new Map();
  let failWrites = false;
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
  async function handler(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || "GET").toUpperCase();
    const q = (name) => u.searchParams.get(name);
    if (method === "POST") {
      if (failWrites) return json({ message: "boom" }, 500);
      const row = JSON.parse(init.body);
      const prefer = (init.headers && init.headers.Prefer) || "";
      if (rows.has(row.k) && /ignore-duplicates/.test(prefer)) return json(null, 201);
      rows.set(row.k, { k: row.k, v: row.v, exp: row.exp });
      return json(null, 201);
    }
    if (method === "PATCH") {
      const k = (q("k") || "").replace(/^eq\./, "");
      const row = rows.get(k);
      const expLt = q("exp");
      const holder = u.searchParams.get("v->>holder");
      let match = !!row;
      if (match && expLt) match = Date.parse(row.exp) < Date.parse(expLt.replace(/^lt\./, ""));
      if (match && holder) match = row.v && row.v.holder === holder.replace(/^eq\./, "");
      if (!match) return json([]);
      Object.assign(row, JSON.parse(init.body));
      return json([row]);
    }
    const kParam = q("k") || "";
    if (kParam.startsWith("in.(")) {
      const keys = kParam.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
      return json(keys.filter((k) => rows.has(k)).map((k) => ({ ...rows.get(k) })));
    }
    const k = kParam.replace(/^eq\./, "");
    return json(rows.has(k) ? [{ ...rows.get(k) }] : []);
  }
  return { rows, handler, setFailWrites: (b) => { failWrites = b; } };
}

// ── fake Overpass ───────────────────────────────────────────────────────────
const SB = { url: "https://sb.test", key: "svc" };
function overpassBody(n, offsetLat = 0) {
  // Real Overpass shape for `out center`: nodes carry lat/lon, ways carry center.
  return JSON.stringify({ elements: Array.from({ length: n }, (_, i) => (i % 2
    ? { type: "node", id: 1000 + i, lat: 27.95 + offsetLat + i * 0.001, lon: -82.45, tags: { name: "Pier " + i, man_made: "pier" } }
    : { type: "way", id: 1000 + i, center: { lat: 27.95 + offsetLat + i * 0.001, lon: -82.45 }, tags: { name: "Park " + i, leisure: "park" } })) });
}
function makeFetch(store, overpass) {
  const calls = { overpass: 0, maxInFlight: 0, inFlight: 0 };
  const f = async (url, init) => {
    if (String(url).startsWith(SB.url)) return store.handler(url, init);
    calls.overpass++; calls.inFlight++; calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
    try {
      const r = await overpass(url, init);
      // The client abort fires 2s after the query's own [timeout:N]; a reply
      // slower than the attempt's budget is an abort, exactly as in production.
      const budgetMs = ((parseInt((decodeURIComponent(String(init.body)).match(/\[timeout:(\d+)\]/) || [])[1], 10) || 0) + 2) * 1000;
      const took = r.ms || 1000;
      if (r.abort || took > budgetMs) { clock += budgetMs; const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      clock += took;
      return { status: r.status, ok: r.status < 300, headers: { get: (h) => (h.toLowerCase() === "retry-after" ? r.retryAfter || null : null) }, text: async () => r.body || "" };
    } finally { calls.inFlight--; }
  };
  return { f, calls };
}

// 0. Geography: every Florida landing market sits inside a region; Hawaii none.
for (const [slug, c] of Object.entries(LANDING_CITIES)) {
  const inside = M.regionsFor(c.lat, c.lng, 0).length > 0;
  ok(c.state === "FL" ? inside : !inside, `${slug} (${c.state}) ${c.state === "FL" ? "is covered by a region" : "is out of market and not queried"}`);
}

// 1. Classification: valid empty vs every failure kind.
ok(M.classifyOverpass({ status: 200, text: overpassBody(3) }).kind === "ok", "a 200 with named elements is ok");
ok(M.classifyOverpass({ status: 200, text: JSON.stringify({ elements: [] }) }).kind === "valid_empty", "a 200 with no elements and no error remark is a valid empty answer");
ok(M.classifyOverpass({ status: 200, text: JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 25 seconds." }) }).kind === "timeout", "a 200 carrying a runtime-error remark is a TIMEOUT, never a valid empty answer");
ok(M.classifyOverpass({ aborted: true }).kind === "timeout", "a client abort is a timeout");
ok(M.classifyOverpass({ status: 429, text: "" }).kind === "rate_limited", "429 is rate limited");
ok(M.classifyOverpass({ status: 406, text: "" }).kind === "denied" && M.classifyOverpass({ status: 403, text: "" }).kind === "denied", "403/406 are access denied");
ok(M.classifyOverpass({ status: 200, text: "<html>busy</html>" }).kind === "malformed", "a non-JSON 200 is malformed");
ok(M.classifyOverpass({ networkError: true }).kind === "network", "a socket failure is a network error");

// 2. Parsing keeps provenance, drops disused features and same-place duplicates.
const parsed = M.parseElements({ elements: [
  { type: "way", id: 1, center: { lat: 27.9, lon: -82.4 }, tags: { name: "Bay Park", leisure: "park" } },
  { type: "node", id: 2, lat: 27.9001, lon: -82.4001, tags: { name: "Bay Park", leisure: "park" } },
  { type: "way", id: 3, center: { lat: 27.8, lon: -82.5 }, tags: { name: "Old Pier", man_made: "pier", disused: "yes" } },
  { type: "way", id: 4, center: { lat: 27.7, lon: -82.6 }, tags: { name: "Gulf Beach", natural: "beach" } },
] });
ok(parsed.length === 2 && parsed[0].id === "osm:way1" && parsed[1].kind === "Beach", "parsing keeps OSM ids, maps categories, drops the disused pier and the duplicate park");

// 3. Success persists, and a SEPARATE invocation (fresh module calls, same
//    store) serves it to a visitor away from the region center.
{
  const store = makeStore();
  const { f, calls } = makeFetch(store, async () => ({ status: 200, body: overpassBody(5), ms: 3000 }));
  const r = await M.warmRegions(SB, { fetchImpl: f, now, only: ["tampa"] });
  ok(r.refreshed === 1 && r.regions.tampa.status === "refreshed" && r.regions.tampa.places === 5, "a verified Overpass answer is written AND read back before it counts as refreshed");
  ok(M.overpassQuery(M.REGIONS[0], 20).includes("out center 2000;") && !/out center tags/.test(M.overpassQuery(M.REGIONS[0], 20)), "the query uses body verbosity, so point features (nodes) keep their coordinates");
  ok(store.rows.get(M.regionKey("tampa")).v.places.filter((p) => p.id.startsWith("osm:node")).length === 2, "point features (piers mapped as nodes) survive parsing and persistence");
  ok(calls.maxInFlight === 1, "the warm never has two Overpass queries in flight");
  const rows = await M.readRegions(SB, ["tampa"], { fetchImpl: f });
  const served = M.serveFromRegions(rows, 27.951, -82.449, 20000, now());
  ok(served.places.length === 5 && served.places[0].distMi < served.places[4].distMi, "a separate read serves the saved places to a visitor, nearest first, distance from the visitor");
  ok(served.newestVerifiedAt === r.regions.tampa.verifiedAt, "freshness is the provider's verification time");
  const before = calls.overpass;
  clock += 3600 * 1000;
  const again = M.serveFromRegions(await M.readRegions(SB, ["tampa"], { fetchImpl: f }), 27.951, -82.449, 20000, now());
  ok(calls.overpass === before && again.newestVerifiedAt === r.regions.tampa.verifiedAt, "a visitor read never calls the provider and never re-stamps the data as newly verified");
  const r2 = await M.warmRegions(SB, { fetchImpl: f, now, only: ["tampa"] });
  ok(r2.cached === 1 && calls.overpass === before, "a fresh region is reported 'cached' without touching the provider");

  // 4. Failed refresh preserves the good copy (timeout remark, 500, write failure).
  clock += 6 * 86400000; // past FRESH_MS (5d), inside STALE_MAX_MS (7d)
  const goodV = JSON.stringify(store.rows.get(M.regionKey("tampa")).v);
  const { f: f2 } = makeFetch(store, async () => ({ status: 200, body: JSON.stringify({ elements: [], remark: "runtime error: Query timed out" }), ms: 4000 }));
  const r3 = await M.warmRegions(SB, { fetchImpl: f2, now, only: ["tampa"] });
  ok(r3.stale === 1 && r3.regions.tampa.why === "timeout" && JSON.stringify(store.rows.get(M.regionKey("tampa")).v) === goodV, "a timed-out refresh is a failure ('stale'), and the last good copy is untouched");
  const { f: f3 } = makeFetch(store, async () => ({ status: 200, body: JSON.stringify({ elements: [] }), ms: 1000 }));
  const r4 = await M.warmRegions(SB, { fetchImpl: f3, now, only: ["tampa"] });
  ok(r4.regions.tampa.why === "valid_empty" && JSON.stringify(store.rows.get(M.regionKey("tampa")).v) === goodV, "a valid-empty answer never overwrites a copy that had places");
  store.setFailWrites(true);
  const { f: f4 } = makeFetch(store, async () => ({ status: 200, body: overpassBody(9), ms: 1000 }));
  const r5 = await M.warmRegions(SB, { fetchImpl: f4, now, only: ["tampa"] });
  store.setFailWrites(false);
  ok(r5.regions.tampa.why === "persistence_failed" && r5.refreshed === 0 && JSON.stringify(store.rows.get(M.regionKey("tampa")).v) === goodV, "a failed write is reported as persistence_failed, never as refreshed");
  clock += 2 * 86400000; // past STALE_MAX_MS
  ok(M.serveFromRegions(await M.readRegions(SB, ["tampa"], { fetchImpl: f }), 27.95, -82.45, 20000, now()).servedRows === 0, "nothing is served past the 7-day limit (retention not extended)");
}

// 5. Rate limit opens the breaker, honors Retry-After, does not shop the
//    workload to the second host, and defers the rest.
{
  const store = makeStore();
  const { f, calls } = makeFetch(store, async () => ({ status: 429, retryAfter: "7200", ms: 300 }));
  const r = await M.warmRegions(SB, { fetchImpl: f, now });
  ok(calls.overpass === 1, "a 429 stops the run after ONE request — no second host, no second region");
  ok(r.breaker && r.breaker.open && r.breaker.forMs === 7200 * 1000, "Retry-After (2h) sets the cooldown when longer than the 30-minute floor");
  ok(r.unavailable === 1 && r.deferred === r.total - 1, "the rate-limited region is a failure; the rest are deferred, not failed");
  const r2 = await M.warmRegions(SB, { fetchImpl: f, now });
  ok(calls.overpass === 1 && r2.deferred === r2.total && r2.breaker.open, "while the breaker is open no request reaches the provider");
}

// 6. Lease: an overlapping run (another instance) is refused.
{
  const store = makeStore();
  const { f } = makeFetch(store, async () => ({ status: 200, body: overpassBody(2), ms: 500 }));
  ok(await M.acquireLease(SB, "other", 60000, { fetchImpl: f, now }), "a first holder takes the lease");
  const r = await M.warmRegions(SB, { fetchImpl: f, now });
  ok(r.lease === "held_elsewhere" && r.deferred === r.total, "an overlapping warm is refused by the lease and touches nothing");
  clock += 61000;
  const r2 = await M.warmRegions(SB, { fetchImpl: f, now, deadlineMs: 600000 });
  ok(r2.lease === "acquired" && r2.refreshed === r2.total, "an expired lease is taken over");
}

// 7. Time box + rotation: partial progress survives, the leftovers go first
//    next time (no starvation).
{
  const store = makeStore();
  const { f } = makeFetch(store, async () => ({ status: 200, body: overpassBody(3), ms: 15000 }));
  const r = await M.warmRegions(SB, { fetchImpl: f, now, deadlineMs: 38000, perAttemptMs: 18000 });
  ok(r.refreshed === 2 && r.deferred === r.total - 2 && r.stale + r.unavailable === 0, "a slow (15s) provider fills exactly what fits the 38s box (2 regions) and defers the rest; no doomed short attempt is counted as a failure");
  ok(r.attempts.every((a) => a.kind === "ok"), "no attempt was launched that could not finish inside the box");
  const done = Object.keys(r.regions).filter((k) => r.regions[k].status === "refreshed");
  ok(done.length >= 1 && done.includes(done[0]) && Object.keys(r.regions).some((k) => r.regions[k].status === "deferred" && !done.includes(k)), "positive control: the probe finds a refreshed region and a deferred one it does not contain");
  clock += 86400000;
  const r2 = await M.warmRegions(SB, { fetchImpl: f, now, deadlineMs: 38000, perAttemptMs: 18000 });
  {
    const { f: slow } = makeFetch(makeStore(), async () => ({ status: 200, body: overpassBody(3), ms: 25000 }));
    const rs = await M.warmRegions(SB, { fetchImpl: slow, now, deadlineMs: 38000, perAttemptMs: 18000, only: ["tampa"] });
    ok(rs.regions.tampa.why === "timeout" && rs.attempts.length === 2 && rs.attempts.every((a) => a.kind === "timeout"), "a reply slower than the attempt budget is a timeout on each host, recorded per attempt");
  }
  const done2 = Object.keys(r2.regions).filter((k) => r2.regions[k].status === "refreshed");
  ok(done2.length >= 1 && done2.every((k) => !done.includes(k)), "the next run starts with regions that have no copy, so yesterday's leftovers are not starved");
  for (const rr of [r, r2]) ok(["refreshed", "cached", "stale", "unavailable", "deferred"].reduce((t, k) => t + rr[k], 0) === rr.total, "every region lands in exactly one status (counts reconcile)");
}

let threw = false;
try { await M.warmRegions(SB, { fetchImpl: async () => { throw new Error("x"); }, now, only: ["atlantis"] }); } catch { threw = true; }
ok(threw, "an unknown region slug is rejected, never silently counted as zero regions");

// 8. Briefing: the region counts render, reconcile, and name failures.
{
  const base = buildOwnerBriefing({ now: new Date("2026-11-06T11:00:00Z") });
  const osmWarm = { unit: "region", total: 6, refreshed: 2, cached: 1, stale: 1, unavailable: 1, deferred: 1, regions: { tampa: { status: "refreshed" }, miami: { status: "stale", why: "timeout" }, venice: { status: "unavailable", why: "rate_limited" }, orlando: { status: "deferred", why: "breaker_open" } }, breaker: { open: true, reason: "rate_limited" } };
  const text = briefingText(withBriefingOperations(base, { osmWarm, notes: [] }));
  ok(/2 refreshed · 1 still fresh · 1 refresh failed \(serving last good copy\) · 1 refresh failed \(no copy\) · 1 not attempted, of 6 regions/.test(text), "the briefing states one status per region and the unit");
  ok(/miami: timeout/.test(text) && /venice: rate_limited/.test(text) && /cooldown is on/.test(text), "the briefing names each failure and the provider cooldown");
  ok(!/do not reconcile/.test(text), "reconciling counts produce no warning");
  const err = briefingText(withBriefingOperations(base, { osmWarm: { unit: "region", total: 6, refreshed: 0, cached: 0, stale: 0, unavailable: 0, deferred: 6, regions: {}, error: "boom" }, notes: [] }));
  ok(/0 refreshed .* 6 not attempted, of 6 regions/.test(err) && /stopped with an error: boom/.test(err), "a warm that threw is still reported (all regions not attempted, with the error)");
  const bad = briefingText(withBriefingOperations(base, { osmWarm: { ...osmWarm, refreshed: 5 }, notes: [] }));
  ok(/do not reconcile/.test(bad), "non-reconciling counts are flagged, not hidden");
}

// 9. Wiring (static, comments stripped): visitors never call the provider;
//    refresh access is protected; the cron runs the warm in-process.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const route = strip(readFileSync(new URL("../app/api/outdoors/route.js", import.meta.url), "utf8"));
const cron = strip(readFileSync(new URL("../app/api/cron/route.js", import.meta.url), "utf8"));
ok(/overpass|fetchRegion\(|interpreter/i.test("const a = await fetchRegion(x.g, host)") && /overpass|fetchRegion\(|interpreter/i.test(readFileSync(new URL("../lib/osmRegional.js", import.meta.url), "utf8")), "positive control: the provider probe matches a real provider call and the module that holds it");
ok(!/overpass|fetchRegion\(|interpreter/i.test(route.replace(/warmRegions\(/g, "")), "the route never builds or sends an Overpass request itself");
const visitor = route.slice(route.indexOf("async function osmForVisitor("), route.indexOf("\n}", route.indexOf("async function osmForVisitor(")));
ok(/readRegions\(/.test(visitor) && /serveFromRegions\(/.test(visitor) && !/warmRegions\(/.test(visitor), "the visitor path only reads saved regions");
const get = route.slice(route.indexOf("export async function GET("));
const warmAt = get.indexOf('searchParams.get("warm") === "1"');
const warmBranch = get.slice(warmAt, get.indexOf("\n  }\n", warmAt));
ok(warmAt >= 0 && /await warmAuthorized\(req\)/.test(warmBranch) && /status: 401/.test(warmBranch) && warmBranch.indexOf("warmAuthorized") < warmBranch.indexOf("warmRegions("), "the refresh branch authorizes (cron secret or signed-in owner) before any provider work");
ok(warmAt >= 0 && warmAt < get.indexOf('parseFloat(searchParams.get("lat"))'), "the refresh branch runs before the coordinate check, so a coordinate-free canary actually warms");
ok(/osmFrom: "out_of_region"/.test(visitor) && /ok: true, places: \[\] \}, osmFrom: "out_of_region"/.test(visitor), "outside every region is a settled (cacheable) answer, not an outage");
ok((get.match(/warmRegions\(/g) || []).length === 1, "warmRegions is reachable from exactly one, protected, branch of GET");
const auth = route.slice(route.indexOf("async function warmAuthorized("), route.indexOf("\n}", route.indexOf("async function warmAuthorized(")));
ok(/Bearer \$\{secret\}/.test(auth) && /requireOwner\(req\)/.test(auth) && /if \(secret &&/.test(auth), "refresh access is the cron secret or requireOwner — an unset secret never matches");
const cw = cron.slice(cron.indexOf("async function warmOsm("), cron.indexOf("\n}", cron.indexOf("async function warmOsm(")));
ok(/warmRegions\(/.test(cw) && !/fetch\(`\$\{CANON\}/.test(cw), "the cron runs the warm in-process, not through an HTTP self-call");
ok(/deferred: total/.test(cw) && /error:/.test(cw) && !/return null/.test(cw), "a warm that throws still returns a reconciling region result with the error");
const libSrc = strip(readFileSync(new URL("../lib/osmRegional.js", import.meta.url), "utf8"));
const sbCalls = (libSrc.match(/fetchImpl\(`\$\{sb\.url\}/g) || []).length;
const boundedCalls = (libSrc.match(/fetchImpl\(`\$\{sb\.url\}[^\n]*?(bounded\(|signal: ctrl\.signal)/g) || []).length;
ok(sbCalls >= 5 && boundedCalls === sbCalls, `every Supabase call is time-bounded (${boundedCalls}/${sbCalls})`);

console.log(`test-osm-regional: OK — ${pass} assertions (simulated Overpass + Supabase; persistence across invocations, failure kinds, breaker, lease, time box, rotation, briefing reconciliation, protected access)`);
