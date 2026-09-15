#!/usr/bin/env node
// check-search-no-rebuy — a free-mode text search that produced nothing
// serveable is NOT bought again on the next identical request.
//
// THE LEAK (measured 2026-09-15, wf_spend_ledger + wf_places_cache):
//   September text_pro grants taken ........ 4,800 (cap hit 07:05 UTC Sep 15)
//   v1p cache rows written in September .....  1,014
//   → 3,786 grants (79%) bought a Google answer that left NO cache row.
//   August 25–31 (free mode's first week): 2,291 grants → 1,149 rows (50%).
//   The productive share FELL as the warm keys filled the cache: what was
//   left buying every day were the keys that can never be cached.
//
// THE MECHANISM, in app/api/places/search/route.js (free mode):
//   1. buy searchText with the Pro mask (no rating)            ← ledger grant
//   2. enrichFromInventory(): only places we already OWN get a rating
//   3. served = places.filter(hasScoreSignal)  → [] when we own none
//   4. `if (served.length) cset(...)`         → NOTHING written for this key
//   5. next identical request: cget(k) misses → step 1 again  ← another grant
//   Also: a fresh cached row whose rows are all lean fell THROUGH to the paid
//   path ("let it buy a fresh answer") — so even a cached empty re-bought.
//   wf_place_ids: 11,892 ids seen this month, 8,174 (69%) not in wf_inventory.
//
// This EXECUTES the route's handleSearch hermetically (mocked ledger, cache,
// inventory and Google) and counts grants across two identical requests.
// Old code: 2 grants. Fixed code: 1. The same harness proves the enrich-on-
// read path: once inventory learns one of the cached lean ids, the cached
// row serves it with ZERO further grants.
import { readFileSync } from "node:fs";
// The REAL card gate and the REAL owned-signal merge run inside the harness;
// only the network edges (ledger, cache, Google, Supabase) are mocked.
import { hasScoreSignal } from "../lib/score.js";
import { mergeOwnedSignals, ownedLookupIds } from "../lib/ownedLibrary.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const ROUTE = "app/api/places/search/route.js";

// Hermetic module loader: strip the route's imports, inject mocks as a prelude.
async function loadRoute(prelude) {
  let src = readFileSync(new URL("../" + ROUTE, import.meta.url), "utf8");
  src = src.replace(/^import[^;]+;\n/gm, "");
  src = src.replace(/^export const dynamic[^\n]*\n/m, "");
  src += "\nexport { handleSearch as __handleSearch };\n";
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + src));
}

function harness({ google, inventoryRows = () => [] }) {
  const state = { grants: 0, googleCalls: 0, cache: new Map(), invReads: 0, idUpserts: 0 };
  const prelude = `
    const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) };
    const gateFree = () => true, gateShut = () => false, textEnterpriseCap = () => null;
    const spendAllowCapped = async () => false;
    const spendAllow = async (sku) => { __S.grants++; return true; };
    const cget = async (k, opts) => { const r = __S.cache.get(k); if (!r) return null; return { v: r.v, stale: false, due: false, ageMs: 0 }; };
    const cset = async (k, v, ttl) => { __S.cache.set(k, { v, ttl }); };
    const upsertPlaceIds = async (rows) => { __S.idUpserts += (rows || []).length; };
    const cacheConfigured = () => true, lastWrite = () => null, memSize = () => __S.cache.size;
    const DAY = 86400000;
    const serveFromInventory = async () => [];
    const serveInventoryByPlaceIds = async () => [];
    const hasScoreSignal = __S.real.hasScoreSignal;
    const ownedLookupIds = __S.real.ownedLookupIds;
    const mergeOwnedSignals = __S.real.mergeOwnedSignals;
    const attractionDiscoveryPlaceIds = () => [];
    const loadAttractionDiscovery = async () => [];
    const __env = globalThis.process.env;
    __env.GOOGLE_MAPS_SERVER_KEY = "test-key";
    __env.SUPABASE_URL = "https://inv.example.test";
    __env.SUPABASE_SERVICE_ROLE_KEY = "x";
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("places.googleapis.com")) { __S.googleCalls++; return new Response(JSON.stringify({ places: __S.google() }), { status: 200 }); }
      if (u.includes("/rest/v1/wf_inventory")) { __S.invReads++; return new Response(JSON.stringify(__S.inventoryRows()), { status: 200 }); }
      throw new Error("unexpected fetch " + u);
    };
  `;
  globalThis.__S = Object.assign(state, { google, inventoryRows, real: { hasScoreSignal, ownedLookupIds, mergeOwnedSignals } });
  return { state, prelude };
}

const P = { q: "theme parks", lat: 27.58, lng: -82.42, radius: 27000, n: 10 };
const lean = (n) => Array.from({ length: n }, (_, i) => ({ id: "unowned" + i, displayName: { text: "Place " + i }, location: { latitude: 27.58, longitude: -82.42 }, types: ["tourist_attraction"] }));

// A. Google finds 20 places, we own none → served is empty. Ask twice.
{
  const { state, prelude } = harness({ google: () => lean(20) });
  const m = await loadRoute(prelude);
  const r1 = await m.__handleSearch(P, "https://x.test");
  const r2 = await m.__handleSearch(P, "https://x.test");
  ok(Array.isArray(r1.body.places) && r1.body.places.length === 0, "A1: first answer is honestly empty (lean rows never reach the client)");
  ok(state.idUpserts === 20, "A2: the 20 discovered ids are still learned into wf_place_ids on the first buy");
  ok(state.grants === 1, `A3: two identical requests take ONE ledger grant (got ${state.grants}) — the re-buy loop`);
  ok(state.googleCalls === 1, `A4: Google is asked once, not twice (got ${state.googleCalls})`);
  ok(Array.isArray(r2.body.places) && r2.body.places.length === 0, "A5: second answer is still honestly empty, not a fabricated list");
}

// B. Same key, but inventory has since learned one of those ids (promotion
//    landed). The cached lean row must serve it with ZERO further grants.
{
  let owned = [];
  const { state, prelude } = harness({ google: () => lean(20), inventoryRows: () => owned });
  const m = await loadRoute(prelude);
  await m.__handleSearch(P, "https://x.test");
  owned = [{ place_id: "unowned3", status: "OPERATIONAL", signals: { rating: 4.6, reviews: 812 } }];
  const r = await m.__handleSearch(P, "https://x.test");
  ok(state.grants === 1, `B1: promotion landing costs no grant (got ${state.grants})`);
  ok(r.body.places.length === 1 && r.body.places[0].id === "unowned3" && r.body.places[0].rating === 4.6, "B2: the cached lean row now serves the newly-owned place with its owned rating");
}

// C. Google returns NOTHING for this question. Ask twice → one grant.
{
  const { state, prelude } = harness({ google: () => [] });
  const m = await loadRoute(prelude);
  await m.__handleSearch(P, "https://x.test");
  await m.__handleSearch(P, "https://x.test");
  ok(state.grants === 1, `C1: an empty Google answer is remembered — one grant for two asks (got ${state.grants})`);
  const row = [...state.cache.values()][0];
  ok(row && Array.isArray(row.v) && row.v.length === 0 && row.ttl < 30 * 86400000, "C2: the empty answer is cached under a SHORT negative TTL, not the 30-day content clock");
}

// D. The productive path is the old behaviour: owned rows are served, cached
//    under the 30-day clock, and never re-bought.
{
  const { state, prelude } = harness({ google: () => lean(20), inventoryRows: () => [{ place_id: "unowned0", status: "OPERATIONAL", signals: { rating: 4.8, reviews: 100 } }] });
  const m = await loadRoute(prelude);
  const r1 = await m.__handleSearch(P, "https://x.test");
  const r2 = await m.__handleSearch(P, "https://x.test");
  ok(r1.body.places.length === 1 && r2.body.places.length === 1 && r2.body.cached === true, "D1: a productive answer serves the owned row and hits cache on the second ask");
  ok(state.grants === 1, "D2: one grant");
  const row = [...state.cache.values()][0];
  ok(row && row.v.length === 1 && row.ttl === 30 * 86400000, "D3: the served set is cached under the unchanged 30-day clock");
}

// E. Structural: the clocks and the gate order are untouched.
{
  const src = readFileSync(new URL("../" + ROUTE, import.meta.url), "utf8");
  ok(/const FRESH_TTL_MS = 30 \* DAY;/.test(src) && /const STALE_MAX_MS = 30 \* DAY;/.test(src), "E1: FRESH_TTL_MS / STALE_MAX_MS are still 30 days");
  ok(/if \(fresh\.due\) pokeRefresh\(origin, k/.test(src), "E2: the jittered refresh-ahead poke is untouched");
  ok(src.indexOf("const rich = await cget(kRich") < src.indexOf('spendAllow("text_pro")'), "E3: the rich cache is still read before any ledger grant");
}

delete globalThis.__S;
if (fail.length) {
  console.error(`check-search-no-rebuy: FAIL (${pass} ok, ${fail.length} failed)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-search-no-rebuy: OK (${pass} checks)`);
