#!/usr/bin/env node
// scripts/test-map-release-2026-10.mjs — locks the October 2026 map release
// (docs/runbooks/map-release-2026-10.md). Hermetic: no network, no real Apple
// or Supabase; every Apple/Supabase response is simulated, so no quota burns.
//
//   A. LIST-TO-MAP: the map opened from a list draws exactly that list's ids
//      with a permitted coordinate (lib/coordProvenance.js), no hidden 9.2
//      floor; the standalone area map keeps MAP_MIN_SCORE; Apple recovery
//      tries list places regardless of score; one pin per place (clusters).
//   B. BUDGET: unauthorized callers cannot reach the protected budget; the
//      real wf_reserve_free_provider_call (PGlite, live definition) under
//      parallel callers never lets the backfill pass its daily limit nor the
//      shared ceiling be exceeded.
//   C. STOPS: cap reached / Apple 429 / 5xx / timeout stop new matching
//      cleanly; independently verified pins stay drawable.
//   D. CREDENTIALS: server token (path A) and signed ES256 JWT (path B,
//      throwaway key generated here), literal-\n PEM, 401 -> clean stop once
//      per day, missing -> controlled fallback, ledger missing -> no-op; no
//      secret ever reaches a pulse or the console.
//   E. IDENTITY: similar names, nearby branches, chains, "Joe's Pizza" vs
//      "Joe's Pizza & Pasta", generic names never match without support.
//   F. RESUME: backlog derived from state, DB-ordered paging with the cursor
//      guard, exhausted -> zero Apple calls.
//
// `--red-prove` re-runs the groups against mutated copies of the libs (each
// mutation breaks one protected thing) and requires every one to go RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { generateKeyPairSync, verify } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { reserveAppleServiceCalls } from "../lib/applePlaceIds.js";
import { resolveMapCoordinate } from "../lib/coordProvenance.js";
import { toDisplayScore } from "../lib/score.js";
import { guardPaidRoute, APPLE_BUDGET_RL } from "../lib/apiGuard.js";
import { siteTodayStr } from "../lib/siteTime.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const libUrl = pathToFileURL(path.join(ROOT, "lib/")).href;
let assertions = 0;
const ok = (v, m) => { assert.ok(v, m); assertions++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); assertions++; };
const asModule = (src) => import("data:text/javascript," + encodeURIComponent(
  src.replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${libUrl}${f}"`).replace(/from '\.\/([^']+)'/g, (_, f) => `from '${libUrl}${f}'`)));
const LIBS = { job: "lib/appleMatchJob.js", scope: "lib/mapListScope.js", area: "lib/mapAreaData.js", rec: "lib/appleMapRecovery.js", ident: "lib/applePlaceMatch.js" };
async function load(over = {}) {
  const out = {};
  for (const [k, rel] of Object.entries(LIBS)) out[k] = await asModule(over[k] || read(rel));
  return out;
}
function mutated(rel, find, replace) {
  const raw = read(rel);
  assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, "red-prove setup: mutation did not apply");
  return out;
}

const NOW = Date.parse("2026-10-22T14:00:00Z");
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const origin = { lat: 27.5, lng: -82.45 };
const cfg = { url: "https://db.example.test", key: "service-fixture" };
const row = (id, extra = {}) => ({
  place_id: id, name: `Place ${id}`, metro: "manatee-sarasota", lat: 27.5, lng: -82.45, category: "food", secondary_categories: [],
  primary_type: "cafe", google_types: ["cafe", "food", "point_of_interest", "establishment"], cuisines: [], status: "OPERATIONAL",
  excluded: false, signals: { rating: 4.9, reviews: 400 }, photo_ref: null, refreshed_at: iso(NOW - 5 * DAY), independent_coords: null, ...extra,
});
// A PostgREST stand-in for wf_inventory `place_id=in.(...)` reads.
function inventoryFetcher(rows, calls = [], leak = null) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    const m = /^in\.\((.*)\)$/.exec(u.searchParams.get("place_id") || "");
    const want = new Set(m ? m[1].split(",") : []);
    // `leak`: a misbehaving response that also carries a row nobody asked for.
    return { ok: true, status: 200, json: async () => [...rows.filter((r) => want.has(r.place_id)), ...(leak ? [leak] : [])] };
  };
}

// ── A. LIST-TO-MAP ──────────────────────────────────────────────────────────
async function groupA(L) {
  const { area: D, scope: S, rec: R } = L;
  const low = row("ChIJlow8point0", { signals: { rating: 4.4, reviews: 60 } });
  const high = row("ChIJhigh9point5");
  const expired = row("ChIJexpiredGoogle", { refreshed_at: iso(NOW - 40 * DAY) });
  const osm = row("ChIJosmIndependent", { refreshed_at: iso(NOW - 60 * DAY), independent_coords: [{ source: "osm", lat: 27.51, lng: -82.46 }] });
  const excludedRow = row("ChIJexcludedRow", { excluded: true });
  const notAsked = row("ChIJnotInTheList");
  const rows = [low, high, expired, osm, excludedRow, notAsked];
  const ids = [low, high, expired, osm, excludedRow].map((r) => r.place_id);
  const calls = [];
  const res = await D.readMapPlacesByIds({ ids: [...ids, ids[0], "bad id!", "ChIJmissingRow"], origin, config: cfg, fetcher: inventoryFetcher(rows, calls, notAsked), now: NOW });
  const got = res.places.map((p) => p.id).sort();
  eq(got, [high.place_id, low.place_id, osm.place_id].sort(), "A1 the list read returns exactly the requested ids with a permitted coordinate (expired Google refused, excluded refused, unrequested ignored)");
  const lowPin = res.places.find((p) => p.id === low.place_id);
  ok(toDisplayScore(lowPin.governed_score) < D.MAP_MIN_SCORE, `A1 precondition: the low fixture is under the 9.2 floor (${toDisplayScore(lowPin.governed_score)})`);
  ok(!D.mapPlaceQualifies(lowPin), "A1 positive control: the area map's floor WOULD refuse it");
  const osmPin = res.places.find((p) => p.id === osm.place_id);
  eq([osmPin.lat, osmPin.lng, osmPin.coordSource], [27.51, -82.46, "osm"], "A2 a list pin uses the server-resolved coordinate and its source (never the expired Google one)");
  ok(calls.length === 1 && !calls.some((u) => /googleapis|apple\.com/.test(u)), "A2 one DB read, no Google or Apple host");
  // Chunking: 400 ids -> 3 reads of <= 150.
  const many = Array.from({ length: 400 }, (_, i) => `ChIJmany${String(i).padStart(4, "0")}`);
  const c2 = [];
  await D.readMapPlacesByIds({ ids: many, origin, config: cfg, fetcher: inventoryFetcher(many.map((id) => row(id)), c2), now: NOW });
  ok(c2.length === 3, `A3 ids are read in bounded chunks (${c2.length} reads for 400 ids)`);
  ok(D.mapListIds(Array.from({ length: 900 }, (_, i) => `ChIJcap${String(i).padStart(4, "0")}`)).length === D.MAP_LIST_MAX_IDS, "A3 the server caps ids per request");

  // Scope decision.
  const list = [{ id: high.place_id }, { id: low.place_id }];
  eq(S.mapListSource({ enteredFromList: true, list }).map((p) => p.id), list.map((p) => p.id), "A4 a list/search/category entry draws that result set");
  ok(S.mapListSource({ enteredFromList: false, list }) === null, "A4 a first open with nothing chosen is the standalone area map");
  ok(S.mapListSource({ areaOnly: true, enteredFromList: true, list, override: list }) === null, "A4 'All places' / in-map choices are the standalone area map (9.2 floor unchanged)");
  ok(S.mapListSource({ override: [{ id: "rail1" }], enteredFromList: false, list }).map((p) => p.id).join() === "rail1", "A4 a rail/theme override always draws that rail");
  ok(S.enteredMapFromList({ chosen: true }) && S.enteredMapFromList({ searchMode: true }) && !S.enteredMapFromList({}), "A4 entry = a chosen category/chip or a search");

  // Pins = exactly the list's ids, one per place, no floor.
  const pins = S.selectListMapPlaces([low.place_id, osm.place_id], [...res.places, ...res.places, { ...high }]);
  eq(pins.map((p) => p.id).sort(), [low.place_id, osm.place_id].sort(), "A5 pins are exactly the list ids (deduped: a cluster counts places, not copies), no 9.2 floor");
  ok(S.selectListMapPlaces([low.place_id], [{ ...lowPin, lat: null }]).length === 0, "A5 no point, no pin (never guessed)");

  // Truth: an id the server did not draw is "no permitted coordinate" even if the cached verdict says ok.
  const truth = S.listScopeTruth([{ id: "a", mapCoord: { ok: true } }, { id: "b", mapCoord: { ok: true } }], [{ id: "a" }], "ready", { b: "IAPPLEB001" });
  eq([truth[0].mapCoord.ok, truth[1].mapCoord.ok, truth[1].mapCoord.reason, truth[1].applePlaceId], [true, false, "no-permitted-coordinate", "IAPPLEB001"], "A6 the server's fresh verdict replaces a stale cached ok; fresh Apple Place IDs attach");
  ok(S.listScopeTruth([{ id: "b", mapCoord: { ok: true } }], [], "loading")[0].mapCoord.ok === true, "A6 nothing is refused before the read settles");

  // Apple recovery: list scope tries a below-9.2 list place; the area map does not.
  const bounds = { north: 27.62, south: 27.02, east: -82.15, west: -82.72 };
  const cand = { id: "ChIJlowNoCoord", name: "Ryan's Coffee House", type: "cafe", primaryType: "cafe", types: ["cafe"], category: "food", rating: 4.4, reviews: 60, wfScore: 84, governed_score: 84, mapCoord: { ok: false }, status: "OPERATIONAL" };
  ok(R.planAppleMapRecovery({ places: [cand], bounds }).length === 0, "A7 positive control: the area map's floor refuses a 8.4 place for Apple recovery");
  ok(R.planAppleMapRecovery({ places: [cand], bounds, minScore: null }).length === 1, "A7 a list-scoped map plans Apple recovery for it regardless of score");
  const apple = { id: "IAPPLE0001", name: "Ryan’s Coffee House", coordinate: { latitude: 27.55, longitude: -82.43 }, locality: "Parrish", pointOfInterestCategory: "Cafe" };
  const engine = R.createAppleMapRecovery({ search: async () => ({ places: [apple] }) });
  const st = await engine.recover({ places: [cand], bounds, origin, minScore: null });
  ok(st.recovered === 1 && st.places[0].coordSource === "apple_live", "A7 the list place is pinned from Apple's live point, session-only");
  const stArea = await R.createAppleMapRecovery({ search: async () => ({ places: [apple] }) }).recover({ places: [cand], bounds, origin });
  ok(stArea.calls === 0 && stArea.recovered === 0, "A7 the area map spends no Apple call on a below-floor place");
}

// ── B. BUDGET ───────────────────────────────────────────────────────────────
// The live definition (read-only pg_get_functiondef, 2026-10-22), verbatim body.
const RPC_SQL = `
create table wf_source_registry (provider text primary key, status text, internal_use boolean, cost_after_free_micros bigint, hard_call_ceiling_daily bigint);
create table wf_provider_call_budget_daily (provider text, usage_date date, calls bigint, updated_at timestamptz default now(), primary key (provider, usage_date));
create table wf_provider_usage_daily (provider text, capability text, usage_date date, calls bigint, free_units bigint, updated_at timestamptz default now(), primary key (provider, capability, usage_date));
CREATE OR REPLACE FUNCTION wf_reserve_free_provider_call(p_provider text, p_capability text, p_usage_date date, p_units integer DEFAULT 1)
 RETURNS TABLE(allowed boolean, reason text, calls bigint, free_units bigint) LANGUAGE plpgsql AS $function$
declare
  source_row wf_source_registry%rowtype;
  usage_row wf_provider_usage_daily%rowtype;
  provider_calls bigint;
begin
  if p_units is null or p_units < 1 then
    return query select false, 'invalid_units'::text, 0::bigint, 0::bigint; return;
  end if;
  select * into source_row from wf_source_registry where provider=p_provider;
  if not found or source_row.status <> 'healthy' or not source_row.internal_use then
    return query select false, 'provider_unavailable_or_rights_denied'::text, 0::bigint, 0::bigint; return;
  end if;
  if source_row.cost_after_free_micros is null or source_row.cost_after_free_micros <> 0 then
    return query select false, 'not_a_zero_cost_source'::text, 0::bigint, 0::bigint; return;
  end if;
  if source_row.hard_call_ceiling_daily is null or p_units > source_row.hard_call_ceiling_daily then
    return query select false, 'missing_or_insufficient_ceiling'::text, 0::bigint, 0::bigint; return;
  end if;
  insert into wf_provider_call_budget_daily(provider, usage_date, calls) values (p_provider, p_usage_date, p_units)
  on conflict (provider, usage_date) do update set calls=wf_provider_call_budget_daily.calls + excluded.calls, updated_at=now()
  where wf_provider_call_budget_daily.calls + excluded.calls <= source_row.hard_call_ceiling_daily
  returning wf_provider_call_budget_daily.calls into provider_calls;
  if not found then
    select b.calls into provider_calls from wf_provider_call_budget_daily b where b.provider=p_provider and b.usage_date=p_usage_date;
    return query select false, 'daily_ceiling_reached'::text, coalesce(provider_calls,0), coalesce(provider_calls,0); return;
  end if;
  insert into wf_provider_usage_daily(provider, capability, usage_date, calls, free_units) values (p_provider, p_capability, p_usage_date, p_units, p_units)
  on conflict (provider, capability, usage_date) do update set calls=wf_provider_usage_daily.calls + excluded.calls, free_units=wf_provider_usage_daily.free_units + excluded.free_units, updated_at=now()
  returning * into usage_row;
  return query select true, 'reserved'::text, provider_calls, usage_row.free_units;
end $function$;`;
async function ledger(ceiling) {
  const db = new PGlite();
  await db.exec(RPC_SQL);
  await db.query("insert into wf_source_registry values ('apple_maps','healthy',true,0,$1)", [ceiling]);
  const rpc = async (url, init) => {
    assert.ok(/\/rest\/v1\/rpc\/wf_reserve_free_provider_call$/.test(url), "only the reservation RPC is reachable");
    const b = JSON.parse(init.body);
    const r = await db.query("select * from wf_reserve_free_provider_call($1,$2,$3::date,$4)", [b.p_provider, b.p_capability, b.p_usage_date, b.p_units]);
    return { ok: true, status: 200, json: async () => r.rows.map((x) => ({ ...x, calls: Number(x.calls), free_units: Number(x.free_units) })) };
  };
  return { db, rpc };
}
async function groupB(L) {
  const { job: J } = L;
  // B1 unauthorized callers.
  const routeSrc = read("app/api/cron/apple-place-match/route.js");
  ok(/if \(!secret \|\| auth !== "Bearer " \+ secret\) return Response\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\);/.test(routeSrc), "B1 the cron route is CRON_SECRET (Bearer) gated, fail-closed");
  const route = await import(pathToFileURL(path.join(ROOT, "app/api/cron/apple-place-match/route.js")).href);
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { seen.push(String(u)); return { ok: false, status: 599, json: async () => ({}) }; };
  try {
    for (const env of [{}, { CRON_SECRET: "s3cret" }]) {
      // Set explicitly (never read from the shell); removed again below.
      if (env.CRON_SECRET) process.env.CRON_SECRET = env.CRON_SECRET; else delete process.env.CRON_SECRET;
      for (const auth of [null, "Bearer wrong", "s3cret"]) {
        const res = await route.GET(new Request("https://x.test/api/cron/apple-place-match", auth ? { headers: { authorization: auth } } : {}));
        ok(res.status === 401, `B1 unauthorized cron call (${env.CRON_SECRET ? "secret set" : "no secret"}, ${auth || "no header"}) -> 401`);
      }
      delete process.env.CRON_SECRET;
    }
  } finally { globalThis.fetch = realFetch; }
  ok(seen.length === 0, "B1 an unauthorized cron call makes zero requests (no reservation, no Apple)");
  const mw = read("middleware.js");
  ok(/"\/api\/maps\/apple-budget",/.test(mw) && /"\/api\/places\/map\/list",/.test(mw), "B1 the budget route and the list read are in the middleware matcher");
  const cross = new Request("https://www.gowayfind.com/api/maps/apple-budget", { method: "POST", headers: { host: "www.gowayfind.com", origin: "https://evil.example", "x-forwarded-for": "203.0.113.9" } });
  const denied = guardPaidRoute(cross, { routeLimit: APPLE_BUDGET_RL });
  ok(denied && denied.status === 403, "B1 a cross-site POST to the budget route is refused before it can reserve");
  let limited = null;
  for (let i = 0; i < APPLE_BUDGET_RL.limit + 1; i++) {
    limited = guardPaidRoute(new Request("https://www.gowayfind.com/api/maps/apple-budget", { method: "POST", headers: { host: "www.gowayfind.com", origin: "https://www.gowayfind.com", "sec-fetch-site": "same-origin", "x-forwarded-for": "198.51.100.7" } }), { routeLimit: APPLE_BUDGET_RL });
  }
  ok(limited && limited.status === 429, `B1 same-origin bursts past ${APPLE_BUDGET_RL.limit}/min per IP are rate limited`);

  // B2 parallel backfill reservations against the real RPC: exactly dailyMax spendable.
  const { db, rpc } = await ledger(15000);
  const sb = { url: "https://db.example.test", key: "service-fixture" };
  const grants = await Promise.all(Array.from({ length: 60 }, () => J.reserveBackfillUnit({ sb, fetchImpl: rpc, nowMs: NOW, dailyMax: 25, providerStop: 12000 })));
  ok(grants.filter((g) => g.allowed).length === 25, `B2 60 parallel callers, daily backfill limit 25: exactly 25 spendable (${grants.filter((g) => g.allowed).length})`);
  const positions = grants.map((g) => g.backfillCalls).sort((a, b) => a - b);
  eq(positions, Array.from({ length: 60 }, (_, i) => i + 1), "B2 every reserved unit has a unique position (no read-then-act race)");
  // Live headroom: provider total already high from live traffic.
  await db.query("update wf_provider_call_budget_daily set calls = 11999 where provider='apple_maps'");
  const head = await Promise.all(Array.from({ length: 5 }, () => J.reserveBackfillUnit({ sb, fetchImpl: rpc, nowMs: NOW, dailyMax: 6000, providerStop: 12000 })));
  ok(head.filter((g) => g.allowed).length <= 1 && head.some((g) => g.reason === "live_headroom" || g.reason === "backfill_daily_max"), "B2 the backfill stops at the live-traffic headroom (12,000 of 15,000)");
  // Shared ceiling: browser grants + backfill in parallel never exceed it.
  const small = await ledger(40);
  const today = siteTodayStr(new Date(NOW));
  const browser = Array.from({ length: 6 }, () => reserveAppleServiceCalls(24, { env: sb, fetchImpl: small.rpc, now: NOW }));
  const backfill = Array.from({ length: 30 }, () => J.reserveBackfillUnit({ sb, fetchImpl: small.rpc, nowMs: NOW }));
  const [b1, b2] = await Promise.all([Promise.all(browser), Promise.all(backfill)]);
  const spent = b1.reduce((a, g) => a + g.granted, 0) + b2.filter((g) => g.allowed).length;
  const total = Number((await small.db.query("select calls from wf_provider_call_budget_daily where provider='apple_maps' and usage_date=$1::date", [today])).rows[0].calls);
  ok(spent <= 40 && total <= 40, `B2 browser + backfill in parallel never exceed the shared ceiling (spent ${spent}, ledger ${total}, ceiling 40)`);
  ok(J.BACKFILL_DAILY_MAX <= 6000 && J.BACKFILL_PROVIDER_STOP <= 15000 - 3000, "B2 committed limits: backfill <= 6,000/day, >= 3,000 left for live traffic");
  await db.close(); await small.db.close();
}

// ── fake Supabase + Apple for job runs ──────────────────────────────────────
function world({ inventory = [], stored = [], appleResponses = null, tokenStatus = 200, ledgerRows = [{ provider: "apple_maps", status: "healthy", hard_call_ceiling_daily: 15000 }], appleTable = true, reserveLimit = Infinity, lastPulse = null } = {}) {
  const log = { apple: 0, token: 0, reserve: 0, writes: [], pulses: [], urls: [], authHeaders: [] };
  let reserved = 0;
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const page = (all, url) => {
    const u = new URL(url);
    const gt = (u.searchParams.get("place_id") || "").replace(/^gt\./, "");
    // Database (en_US-like, case-insensitive) order, never JS code-unit order.
    const sorted = [...all].sort((a, b) => a.place_id.toLowerCase().localeCompare(b.place_id.toLowerCase()) || a.place_id.localeCompare(b.place_id));
    const start = gt ? sorted.findIndex((r) => r.place_id === gt) + 1 : 0;
    return sorted.slice(start, start + Number(u.searchParams.get("limit") || 1000));
  };
  const fetchImpl = async (url, init = {}) => {
    url = String(url); log.urls.push(url);
    const h = init.headers || {};
    if (h.Authorization) log.authHeaders.push(h.Authorization);
    if (url.startsWith("https://maps-api.apple.com/v1/token")) { log.token++; return tokenStatus === 200 ? json({ accessToken: "ACCESS-TOKEN-FIXTURE", expiresInSeconds: 1800 }) : json({ error: "x" }, tokenStatus); }
    if (url.startsWith("https://maps-api.apple.com/v1/search")) {
      const r = appleResponses ? appleResponses(log.apple++, url) : { results: [] };
      if (r === "timeout") throw new Error("The operation was aborted due to timeout");
      if (typeof r === "number") return json({}, r);
      return json(r);
    }
    if (url.includes("/rpc/wf_reserve_free_provider_call")) {
      log.reserve++;
      if (reserved >= reserveLimit) return json([{ allowed: false, reason: "daily_ceiling_reached", calls: reserved, free_units: reserved }]);
      reserved++;
      return json([{ allowed: true, reason: "reserved", calls: reserved, free_units: reserved }]);
    }
    if (url.includes("/rest/v1/wf_source_registry")) return json(ledgerRows);
    if (url.includes("/rest/v1/wf_apple_place_ids") && (init.method || "GET") === "POST") { log.writes.push(...JSON.parse(init.body)); return json(null, 201); }
    if (url.includes("/rest/v1/wf_apple_place_ids")) return appleTable ? json(page(stored, url)) : json({ message: "relation does not exist" }, 404);
    if (url.includes("/rest/v1/wf_inventory")) return json(page(inventory, url));
    if (url.includes("/rest/v1/wf_job_pulse") && (init.method || "GET") === "POST") { log.pulses.push(JSON.parse(init.body)); return json(null, 201); }
    if (url.includes("/rest/v1/wf_job_pulse")) return json(lastPulse ? [lastPulse] : []);
    if (url.includes("/rest/v1/wf_promote_metros")) return json([]);
    throw new Error("unexpected request " + url);
  };
  return { fetchImpl, log };
}
const inv = (id, extra = {}) => ({ place_id: id, name: `Cafe ${id}`, metro: "manatee-sarasota", locality: "Parrish", primary_type: "cafe", google_types: ["cafe"], category: "food", status: "OPERATIONAL", excluded: false, refreshed_at: iso(NOW - 50 * DAY), ...extra });
const appleHit = (name, id = "IAPPLE" + Math.abs(name.length * 7919) + "X") => ({ results: [{ id, name, coordinate: { latitude: 27.55, longitude: -82.43 }, structuredAddress: { locality: "Parrish" }, poiCategory: "Cafe" }] });
const SB = { url: "https://db.example.test", key: "service-fixture" };
const BOXES = { "manatee-sarasota": { minLat: 27.02, maxLat: 27.62, minLng: -82.72, maxLng: -82.15 } };

// ── C. STOPS ────────────────────────────────────────────────────────────────
async function groupC(L) {
  const { job: J } = L;
  const many = Array.from({ length: 12 }, (_, i) => inv(`ChIJstop${String(i).padStart(2, "0")}`));
  const run = async (w, extra = {}) => J.runAppleMatch({ sb: SB, fetchImpl: w.fetchImpl, search: J.createAppleSearch({ creds: { kind: "server-token", token: "SERVER-TOKEN-FIXTURE" }, fetchImpl: w.fetchImpl, now: () => NOW }), boxes: BOXES, nowMs: NOW, clock: () => NOW, ...extra });
  // Cap reached mid-run.
  let w = world({ inventory: many, appleResponses: (i) => appleHit(`Cafe ChIJstop${String(i).padStart(2, "0")}`), reserveLimit: 4 });
  let s = await run(w);
  ok(s.stop === "cap:daily_ceiling_reached" && w.log.apple === 4 && w.log.writes.length === 4, `C1 the daily cap stops new matching cleanly (apple ${w.log.apple}, writes ${w.log.writes.length}, stop ${s.stop})`);
  ok(s.remaining === 8, "C1 the rest stays in the backlog for the next run");
  // Apple 429.
  w = world({ inventory: many, appleResponses: (i) => (i === 2 ? 429 : appleHit(`Cafe ChIJstop${String(i).padStart(2, "0")}`)) });
  s = await run(w);
  ok(s.stop === "apple-429" && w.log.apple === 3 && w.log.writes.length === 2, `C2 Apple 429 stops immediately; nothing stored for the refused call (apple ${w.log.apple}, writes ${w.log.writes.length})`);
  // 5xx / timeout streak.
  for (const bad of [503, "timeout"]) {
    w = world({ inventory: many, appleResponses: () => bad });
    s = await run(w);
    ok(s.stop.startsWith("apple-errors") && w.log.apple === J.MAX_CONSECUTIVE_ERRORS && w.log.writes.length === 0, `C3 Apple ${bad} x${J.MAX_CONSECUTIVE_ERRORS} stops the run; errors store nothing (apple ${w.log.apple})`);
  }
  // A single transient error does not stop the run, and its place is retried later.
  w = world({ inventory: many.slice(0, 3), appleResponses: (i) => (i === 0 ? 500 : appleHit(`Cafe ChIJstop0${i - 1 + 1}`)) });
  s = await run(w);
  ok(s.errors === 1 && !w.log.writes.some((r) => r.place_id === "ChIJstop00"), "C3 one transient error is skipped (not stored), the run continues");
  // Run-size and time budgets.
  w = world({ inventory: many, appleResponses: () => ({ results: [] }) });
  s = await run(w, { maxCalls: 5 });
  ok(s.stop === "run-batch-done" && w.log.apple === 5, "C4 the per-run batch is bounded");
  let t = NOW;
  w = world({ inventory: many, appleResponses: () => ({ results: [] }) });
  s = await run(w, { clock: () => (t += 1000), deadlineAt: NOW + 3500 });
  ok(s.stop === "run-time-budget" && w.log.apple <= 3, "C4 the run stops starting calls at its time budget");
  // Independently verified pins never depend on Apple.
  const osm = resolveMapCoordinate({ lat: 27.5, lng: -82.4, refreshed_at: iso(NOW - 90 * DAY), independent_coords: [{ source: "osm", lat: 27.51, lng: -82.41 }] }, NOW);
  const sighting = resolveMapCoordinate({ lat: 27.5, lng: -82.4, refreshed_at: iso(NOW - 90 * DAY), independent_coords: [{ source: "google_places", method: "wf_place_ids-sighting", lat: 27.5, lng: -82.4, observed_at: iso(NOW - 3 * DAY) }] }, NOW);
  ok(osm.ok && osm.source === "osm" && sighting.ok, "C5 independent (OSM) and sighting coordinates stay drawable with Apple capped or down");
  const R = L.rec;
  const failing = R.createAppleMapRecovery({ search: async () => { throw Object.assign(new Error("HTTP 429"), { status: 429 }); } });
  const cand = { id: "ChIJneedsApple", name: "Ryan's Coffee House", primaryType: "cafe", types: ["cafe"], category: "food", wfScore: 95, governed_score: 95, mapCoord: { ok: false }, status: "OPERATIONAL" };
  const st = await failing.recover({ places: [cand], bounds: { north: 27.62, south: 27.02, east: -82.15, west: -82.72 }, origin, minScore: null });
  const existing = [{ id: "ChIJverified", lat: 27.51, lng: -82.41, governed_score: 80, coordSource: "osm" }];
  const pins = L.scope.selectListMapPlaces(["ChIJverified", "ChIJneedsApple"], [...existing, ...st.places]);
  ok(st.errors === 1 && pins.map((p) => p.id).join() === "ChIJverified", "C5 an Apple failure adds no pin and removes none: the verified pin stays drawn");
}

// ── D. CREDENTIALS ──────────────────────────────────────────────────────────
async function groupD(L) {
  const { job: J } = L;
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const envB = { APPLE_MAPS_TEAM_ID: "TEAMFIXTURE", APPLE_MAPS_KEY_ID: "KEYFIXTURE", APPLE_MAPS_PRIVATE_KEY: pem.replace(/\n/g, "\\n") };
  ok(J.appleCredentials({}) === null, "D1 no credentials -> null (controlled fallback)");
  ok(J.appleCredentials({ APPLE_MAPS_TEAM_ID: "T", APPLE_MAPS_KEY_ID: "K" }) === null, "D1 a partial path B is not a credential");
  eq(J.appleCredentials({ ...envB, APPLE_MAPS_SERVER_TOKEN: "SERVER-TOKEN-FIXTURE" }), { kind: "server-token", token: "SERVER-TOKEN-FIXTURE" }, "D1 path A (server token) wins when both are set");
  const b = J.appleCredentials(envB);
  ok(b.kind === "jwt" && b.pem === pem.trim(), "D2 a literal-\\n PEM is normalized to real newlines");
  ok(J.appleCredentials({ ...envB, APPLE_MAPS_PRIVATE_KEY: pem }).pem === pem.trim(), "D2 a real-newline PEM is accepted unchanged");
  const jwt = J.mapsAuthToken(b, NOW);
  const [h, p, sig] = jwt.split(".");
  const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  eq(dec(h), { alg: "ES256", kid: "KEYFIXTURE", typ: "JWT" }, "D2 JWT header {alg:ES256,kid,typ:JWT}");
  const payload = dec(p);
  ok(payload.iss === "TEAMFIXTURE" && payload.scope === "server_api" && payload.exp - payload.iat <= 3600 && !("origin" in payload), "D2 payload {iss:team, iat, exp<=1h, scope:server_api}, no origin");
  ok(verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64")), "D2 the signature verifies with the throwaway public key");
  // Path A and B exchange at /v1/token and search with the access token.
  for (const creds of [{ kind: "server-token", token: "SERVER-TOKEN-FIXTURE" }, b]) {
    const w = world({ inventory: [inv("ChIJcredA")], appleResponses: () => appleHit("Cafe ChIJcredA") });
    const s = await J.runAppleMatch({ sb: SB, fetchImpl: w.fetchImpl, search: J.createAppleSearch({ creds, fetchImpl: w.fetchImpl, now: () => NOW }), boxes: BOXES, nowMs: NOW, clock: () => NOW });
    const searchAuth = w.log.authHeaders.filter((x) => x === "Bearer ACCESS-TOKEN-FIXTURE").length;
    ok(w.log.token === 1 && s.matched === 1 && searchAuth === 1, `D3 ${creds.kind}: one /v1/token exchange, search uses the access token`);
    if (creds.kind === "server-token") ok(w.log.authHeaders.includes("Bearer SERVER-TOKEN-FIXTURE"), "D3 path A sends the portal token only to /v1/token");
  }
  // 401 at /v1/token: clean stop, no reservation, no search.
  const w401 = world({ inventory: [inv("ChIJcred401")], tokenStatus: 401 });
  const s401 = await J.runAppleMatch({ sb: SB, fetchImpl: w401.fetchImpl, search: J.createAppleSearch({ creds: { kind: "server-token", token: "EXPIRED-TOKEN-FIXTURE" }, fetchImpl: w401.fetchImpl, now: () => NOW }), boxes: BOXES, nowMs: NOW, clock: () => NOW });
  ok(s401.stop === "credentials-invalid" && w401.log.reserve === 0 && w401.log.apple === 0, "D4 401 at /v1/token -> clean stop before any reservation or search");
  ok(J.pulseNote(s401) === J.CREDENTIALS_INVALID_NOTE, "D4 the pulse says the credentials are invalid or expired");

  // The real route, end to end with stubbed fetch/env.
  const route = await import(pathToFileURL(path.join(ROOT, "app/api/cron/apple-place-match/route.js")).href);
  const SECRETS = ["SERVER-TOKEN-FIXTURE", "EXPIRED-TOKEN-FIXTURE", "ACCESS-TOKEN-FIXTURE", pem.split("\n")[1], "s3cret"];
  const runRoute = async (env, w, url = "https://x.test/api/cron/apple-place-match") => {
    const keys = ["CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "APPLE_MAPS_SERVER_TOKEN", "APPLE_MAPS_TEAM_ID", "APPLE_MAPS_KEY_ID", "APPLE_MAPS_PRIVATE_KEY"];
    for (const k of keys) delete process.env[k]; // fixture env only, set explicitly below
    for (const [k, v] of Object.entries({ CRON_SECRET: "s3cret", SUPABASE_URL: SB.url, SUPABASE_SERVICE_ROLE_KEY: SB.key, ...env })) process.env[k] = v;
    const realFetch = globalThis.fetch, realLog = console.log, realErr = console.error;
    const out = [];
    globalThis.fetch = w.fetchImpl;
    console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
    try {
      const res = await route.GET(new Request(url, { headers: { authorization: "Bearer s3cret" } }));
      return { res, body: await res.json(), out };
    } finally {
      globalThis.fetch = realFetch; console.log = realLog; console.error = realErr;
      for (const k of keys) delete process.env[k];
    }
  };
  let w = world({ inventory: [inv("ChIJroute1")] });
  let r = await runRoute({}, w);
  ok(r.res.status === 200 && r.body.note === J.CREDENTIALS_MISSING_NOTE && w.log.pulses.length === 1 && w.log.pulses[0].attempted === 0 && w.log.apple === 0 && w.log.reserve === 0, "D5 missing credentials -> 200, one idle pulse 'apple credentials not configured', zero Apple calls");
  w = world({ inventory: [inv("ChIJroute1")], ledgerRows: [] });
  r = await runRoute({ APPLE_MAPS_SERVER_TOKEN: "SERVER-TOKEN-FIXTURE" }, w);
  ok(r.body.note === J.LEDGER_MISSING_NOTE && w.log.token === 0 && w.log.reserve === 0, "D6 ledger not provisioned (no apple_maps registry row) -> no-op pulse, zero Apple calls");
  w = world({ inventory: [inv("ChIJroute1")], appleTable: false });
  r = await runRoute({ APPLE_MAPS_SERVER_TOKEN: "SERVER-TOKEN-FIXTURE" }, w);
  ok(r.body.note === J.LEDGER_MISSING_NOTE && w.log.token === 0, "D6 Place ID table missing -> same no-op");
  w = world({ inventory: [inv("ChIJroute1")], tokenStatus: 401 });
  r = await runRoute({ APPLE_MAPS_SERVER_TOKEN: "EXPIRED-TOKEN-FIXTURE" }, w);
  ok(r.body.note === J.CREDENTIALS_INVALID_NOTE && w.log.pulses.length === 1 && w.log.pulses[0].attempted === 0 && w.log.reserve === 0, "D7 expired token -> one idle pulse, no reservation (never a dead-run streak that pages)");
  w = world({ inventory: [inv("ChIJroute1")], tokenStatus: 401, lastPulse: { note: J.CREDENTIALS_INVALID_NOTE, ran_at: iso(NOW - 3600000) } });
  const realNow = Date.now;
  Date.now = () => NOW;
  try { r = await runRoute({ APPLE_MAPS_SERVER_TOKEN: "EXPIRED-TOKEN-FIXTURE" }, w); } finally { Date.now = realNow; }
  ok(w.log.pulses.length === 0 && w.log.token === 0, "D7 already reported today -> no second pulse, no Apple call (once per day)");
  w = world({ inventory: [inv("ChIJroute1")], appleResponses: () => appleHit("Cafe ChIJroute1") });
  r = await runRoute({ ...envB }, w);
  ok(r.body.matched === 1 && w.log.pulses.length === 1 && w.log.pulses[0].succeeded === 1, "D8 path B end to end: matched, stored, pulsed");
  const everything = JSON.stringify({ pulses: w.log.pulses, out: r.out, body: r.body });
  for (const sec of SECRETS) ok(!everything.includes(sec), `D9 no secret value in pulses, console output or the response (${sec.slice(0, 6)}…)`);
}

// ── E. IDENTITY ─────────────────────────────────────────────────────────────
function groupE(L) {
  const { matchApplePlace } = L.ident;
  const box = { north: 27.62, south: 27.02, east: -82.15, west: -82.72 };
  const ours = (name, extra = {}) => ({ id: "w", name, primaryType: "restaurant", types: ["restaurant", "food"], ...extra });
  const ap = (name, extra = {}) => ({ id: "IAPPLE" + name.replace(/\W/g, "").slice(0, 10) + "01", name, coordinate: { latitude: 27.4, longitude: -82.5 }, locality: "Sarasota", pointOfInterestCategory: "Restaurant", ...extra });
  ok(matchApplePlace(ours("Joe's Pizza", { locality: "Sarasota" }), [ap("Joe's Pizza")], { box }).ok, "E0 positive control: one exact, in-area, category-agreeing match is accepted");
  const ext = matchApplePlace(ours("Joe's Pizza"), [ap("Joe's Pizza & Pasta")], { box });
  ok(!ext.ok && ext.reason === "name-extended", "E1 'Joe's Pizza' never matches 'Joe's Pizza & Pasta'");
  ok(!matchApplePlace(ours("Joe's Pizza", { locality: "Sarasota" }), [ap("Joe's Pizza & Pasta")], { box }).ok, "E1 not even with the city agreeing");
  ok(!matchApplePlace(ours("The Rosemary"), [ap("Rosemary and Thyme")], { box }).ok, "E2 a similar but different name is refused");
  const branches = [ap("Joe's Pizza"), ap("Joe's Pizza", { id: "IAPPLEJOE002", coordinate: { latitude: 27.35, longitude: -82.53 } })];
  ok(matchApplePlace(ours("Joe's Pizza"), branches, { box }).reason === "ambiguous", "E3 two nearby branches -> ambiguous, nothing stored");
  ok(matchApplePlace(ours("Panera Bread"), [ap("Panera Bread", { locality: "Bradenton" })], { box }).reason === "chain-needs-locality", "E4 a chain without an agreeing city is refused");
  ok(matchApplePlace(ours("Joe's Pizza"), [ap("Joe's Pizza", { locality: null })], { box, sameNameIds: 3 }).reason === "chain-needs-locality", "E4 a name Wayfind holds for several ids is chain-like");
  ok(matchApplePlace(ours("Village Cafe", { primaryType: "cafe", types: ["cafe"] }), [ap("Village Cafe", { pointOfInterestCategory: "Cafe", locality: null })], { box }).reason === "generic-name-needs-locality", "E5 a generic name needs the city to agree");
  ok(!matchApplePlace(ours("Joe's Pizza"), [ap("Joe's Pizza", { coordinate: { latitude: 28.5, longitude: -81.4 } })], { box }).ok, "E6 the right name outside the area is refused");
}

// ── F. RESUME ───────────────────────────────────────────────────────────────
async function groupF(L) {
  const { job: J } = L;
  // Collation-crossing ids across a page boundary (en_US: "ChIJZ_" after "ChIJjb").
  const ids = Array.from({ length: 1500 }, (_, i) => (i % 2 ? `ChIJZ_${String(i).padStart(5, "0")}` : `ChIJjb${String(i).padStart(5, "0")}`));
  const stored = ids.slice(0, 1200).map((id) => ({ place_id: id, status: "refused", reason: "ambiguous", matched_name: `Cafe ${id}`, checked_at: iso(NOW - 10 * DAY) }));
  const renamed = { place_id: ids[1300], status: "matched", reason: null, matched_name: "Old Name", checked_at: iso(NOW - DAY) };
  const retry = { place_id: ids[1301], status: "refused", reason: "no-results", matched_name: `Cafe ${ids[1301]}`, checked_at: iso(NOW - 8 * DAY) };
  const stale = { place_id: ids[1302], status: "matched", reason: null, matched_name: `Cafe ${ids[1302]}`, checked_at: iso(NOW - 100 * DAY) };
  const fresh = { place_id: ids[1303], status: "matched", reason: null, matched_name: `Cafe ${ids[1303]}`, checked_at: iso(NOW - DAY) };
  const w = world({ inventory: [...ids.map((id) => inv(id)), inv("ChIJclosed", { status: "CLOSED_PERMANENTLY" })], stored: [...stored, renamed, retry, stale, fresh] });
  const b = await J.loadBacklog({ sb: SB, fetchImpl: w.fetchImpl, nowMs: NOW });
  ok(b.inventory === 1501 && b.stored === 1204, `F1 both tables paged completely across collation-crossing pages (${b.inventory} rows, ${b.stored} stored)`);
  ok(b.todo.length === 1500 - 1204 + 3, `F1 backlog = unchecked + renamed + retryable + stale (${b.todo.length})`);
  const t = new Set(b.todo.map((r) => r.place_id));
  ok(t.has(renamed.place_id) && t.has(retry.place_id) && t.has(stale.place_id) && !t.has(fresh.place_id) && !t.has(ids[0]) && !t.has("ChIJclosed"), "F1 renamed/retryable/stale re-enter; fresh and identity-refused rows wait; closed rows never");
  // A stuck page (the cursor row comes back) throws instead of looping.
  const stuck = async (url) => ({ ok: true, status: 200, json: async () => (url.includes("wf_inventory") ? Array.from({ length: 1000 }, () => inv("ChIJsame")) : []) });
  await assert.rejects(J.loadBacklog({ sb: SB, fetchImpl: stuck, nowMs: NOW }), /did not advance/); assertions++;
  // Exhausted -> zero Apple calls.
  const done = world({ inventory: [inv("ChIJall1")], stored: [{ place_id: "ChIJall1", status: "matched", matched_name: "Cafe ChIJall1", checked_at: iso(NOW - DAY) }] });
  const s = await J.runAppleMatch({ sb: SB, fetchImpl: done.fetchImpl, search: J.createAppleSearch({ creds: { kind: "server-token", token: "SERVER-TOKEN-FIXTURE" }, fetchImpl: done.fetchImpl, now: () => NOW }), boxes: BOXES, nowMs: NOW, clock: () => NOW });
  ok(s.stop === "backlog-exhausted" && done.log.token === 0 && done.log.apple === 0 && done.log.reserve === 0, "F2 backlog exhausted -> zero Apple calls, zero reservations");
  ok(J.pulseNote(s) === J.BACKLOG_EXHAUSTED_NOTE, "F2 pulse 'backlog exhausted'");
  const note = J.pulseNote({ checked: 900, matched: 600, refused: 300, remaining: 14000, stop: "run-batch-done", backfillCalls: 1000, reasons: { ambiguous: 200, "name-mismatch": 100 } });
  ok(note.length <= 200 && /remaining 14000/.test(note) && /ETA ~3d/.test(note) && /ambiguous 200/.test(note), `F3 the progress pulse carries done/remaining/ETA/refusal reasons: ${note}`);
  ok(!/^(billing|quota|unavailable):/i.test(J.CREDENTIALS_MISSING_NOTE + "") && !/^(billing|quota|unavailable):/i.test(J.CREDENTIALS_INVALID_NOTE) && !/^(billing|quota|unavailable):/i.test(J.LEDGER_MISSING_NOTE), "F3 controlled no-op notes carry no deterministic-failure prefix (they never page)");
}

async function runAll(L) {
  await groupA(L); await groupB(L); await groupC(L); await groupD(L); groupE(L); await groupF(L);
}

// Static wiring checks (the scheduled path exists and is covered).
const vercel = JSON.parse(read("vercel.json"));
const cron = (vercel.crons || []).find((c) => c.path === "/api/cron/apple-place-match");
ok(cron && /^\d+ \d+-\d+ \* \* \*$/.test(cron.schedule), "setup: vercel.json schedules the backfill in a nightly window");
ok(/'apple-place-match',\s*1800/.test(read("supabase/migrations/20261022120000_wf_heartbeat_expected_apple_place_match.sql")), "setup: a heartbeat row (1800 min) covers apple-place-match");
ok(/from "\.\.\/lib\/appleMatchJob\.js"/.test(read("scripts/apple-place-match.mjs")), "setup: the manual CLI runs the same job lib");
ok(!/NEXT_PUBLIC_APPLE_MAPS_(SERVER_TOKEN|PRIVATE_KEY|KEY_ID|TEAM_ID)/.test(read("lib/appleMatchJob.js") + read("app/api/cron/apple-place-match/route.js")), "setup: Apple server credentials are never NEXT_PUBLIC_");
const real = await load();
await runAll(real);
const FIRST = assertions;

if (process.argv.includes("--red-prove")) {
  const M = [
    ["list read applies the 9.2 floor", "area", "      if (p && mapCategoryMatches(p, 'all') && !seen.has(p.id) && seen.add(p.id)) places.push(p);", "      if (p && mapPlaceQualifies(p) && mapCategoryMatches(p, 'all') && !seen.has(p.id) && seen.add(p.id)) places.push(p);"],
    ["list read skips the coordinate rule", "area", "  const coord = resolveMapCoordinate(row, now);", "  const coord = { ok: true, lat: row.lat, lng: row.lng, source: 'google_places' };"],
    ["list read returns unrequested ids", "area", "      if (!row || !chunk.includes(row.place_id)) continue;", "      if (!row) continue;"],
    ["list pins not deduped (cluster counts copies)", "scope", "allowed.has(String(p.id)) && !seen.has(p.id)", "allowed.has(String(p.id))"],
    ["stale cached ok survives the server verdict", "scope", "if (status === \"ready\" && !drawn.has(p.id)", "if (false && !drawn.has(p.id)"],
    ["All places draws the list (floor bypassed)", "scope", "  if (areaOnly) return null;\n", ""],
    ["list-scoped Apple recovery keeps the floor", "rec", "const belowFloor = (score, minScore) => toDisplayScore(score) == null || (minScore != null && toDisplayScore(score) < minScore);", "const belowFloor = (score) => toDisplayScore(score) == null || toDisplayScore(score) < MAP_MIN_SCORE;"],
    ["backfill daily limit ignored", "job", "  if (!Number.isFinite(backfillCalls) || backfillCalls > dailyMax) return", "  if (false) return"],
    ["live headroom ignored", "job", "  if (!Number.isFinite(providerCalls) || providerCalls > providerStop) return", "  if (false) return"],
    ["429 does not stop", "job", "      if (res.quota) { stats.stop = \"apple-429\"; break; }", "      if (res.quota) { stats.errors++; continue; }"],
    ["error streak does not stop", "job", "        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {", "        if (false) {"],
    ["errors are stored as refusals", "job", "        stats.errors++; consecutiveErrors++;", "        stats.errors++; consecutiveErrors++; out.push({ place_id: row.place_id, status: \"refused\", reason: \"error\" });"],
    ["cap refusal does not stop", "job", "      if (!grant.allowed) { stats.stop = `cap:${grant.reason}`; break; }", "      if (!grant.allowed) { stats.skipped++; }"],
    ["credentials checked after reserving", "job", "  if (typeof search.prepare === \"function\") {", "  if (false) {"],
    ["path B JWT without scope", "job", ", scope: \"server_api\" }));", " }));"],
    ["literal \\n PEM not normalized", "job", "  return String(pem || \"\").trim().replace(/^[\"']|[\"']$/g, \"\").replace(/\\\\r\\\\n|\\\\n/g, \"\\n\").replace(/\\r\\n/g, \"\\n\").trim();", "  return String(pem || \"\").trim();"],
    ["path A ignored", "job", "  if (serverToken) return { kind: \"server-token\", token: serverToken };\n", ""],
    ["exhausted backlog still calls Apple", "job", "  if (!todo.length) { stats.stop = \"backlog-exhausted\"; return stats; }", "  if (!todo.length) { await search(\"probe\", { north: 1, south: 0, east: 1, west: 0 }); stats.stop = \"backlog-exhausted\"; return stats; }"],
    ["cursor guard removed", "job", "      if (!guard.admit(row && row.place_id)) throw new Error(`${table} pagination did not advance`);", "      guard.admit(row && row.place_id);"],
    ["renamed places not rechecked", "job", "  if (prev.matched_name !== row.name) return true;\n", ""],
    ["prefix-extended names accepted", "ident", 'if (rel.kind !== "branch") {', 'if (false) {'],
    ["two branches no longer ambiguous", "ident", '  if (distinct.length > 1) return { ok: false, reason: "ambiguous", considered: raw.length };', ''],
    ["chains matched without the city", "ident", '  if (chainLike && !best.cityAgrees) return { ok: false, reason: "chain-needs-locality", considered: raw.length };', ''],
    ["generic names matched without the city", "ident", '  if (isGenericName(place.name) && !best.cityAgrees) return { ok: false, reason: "generic-name-needs-locality", considered: raw.length };', ''],
    ["retryable reason never retried", "job", "  return retry != null && nowMs - checked > retry * DAY;", "  return false;"],
  ];
  const reds = [];
  for (const [label, k, find, replace] of M) {
    const L = await load({ [k]: mutated(LIBS[k], find, replace) });
    try { await runAll(L); } catch (e) {
      if (/red-prove setup/.test(String(e && e.message))) throw e;
      reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0].slice(0, 150)}`); continue;
    }
    throw new Error(`red-prove: ${label} stayed GREEN`);
  }
  console.log(`test-map-release-2026-10: red-prove OK — ${reds.length}/${M.length} mutations went RED`);
}

console.log(`test-map-release-2026-10: OK — ${FIRST} assertions. A list-to-map (exact list ids, permitted coordinate only, no hidden 9.2 floor, All places keeps 9.2, Apple recovery regardless of score, one pin per place); B budget (401 + zero requests unauthorized, cross-site 403, per-IP 429, real reservation RPC in PGlite under 60 parallel callers: exactly the limit, live headroom, shared ceiling never exceeded); C stops (cap, 429, 5xx, timeout, run/time budgets; verified pins unaffected); D credentials (server token, ES256 JWT verified with a throwaway key, literal-\\n PEM, 401 once/day, missing, ledger missing, no secret in pulses/logs); E identity (extended/similar/branches/chains/generic/area); F resume (DB-ordered paging with cursor guard, renamed/retryable/stale, exhausted = zero calls).`);
