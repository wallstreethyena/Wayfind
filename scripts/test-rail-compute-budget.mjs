#!/usr/bin/env node
/**
 * scripts/test-rail-compute-budget.mjs — WO8 (2026-09-02), PRODUCTION PERF
 * REGRESSION. THE HARNESS, not the guard — this is the before/after evidence.
 *
 * PRODUCTION MEASUREMENT (owner, Bradenton/Lakewood Ranch, 27.3939,-82.4436):
 * /api/rails cold compute = 20.3s (== RAILS_SERVER_DEADLINE_MS), returning a
 * degraded 11KB payload. DB execution itself is ~20ms (EXPLAIN ANALYZE) — the
 * cost is ROUND TRIPS x PAYLOAD: ~30 wf_inventory reads per cold compute
 * across loadPools (cats x cities), the nearby pools and buildIdentityPool
 * x6+, each up to 1,000 rows x ~1KB WITH editorial text.
 *
 * WHAT THIS RUNS: railsData.js's real loadRailPlaces("bradenton", {origin})
 * — Lakewood Ranch's own metro pool (bradenton/parrish/anna-maria-island/
 * sarasota, RAIL_METRO_POOLS) — against a MOCKED global.fetch that serves
 * FIXTURE rows and RECORDS every call: url, row count, response bytes. No
 * real network, no real Supabase, no real Google — offline and deterministic.
 *
 * WHY THE FIXTURE IS DENSE ON PURPOSE. Every wf_inventory box read returns
 * exactly `limit` rows, scattered inside the requested box — the worst case
 * ("a dense Florida cell", the WO's own words) and the one that makes the
 * ladders in nearbyPool.js/buildIdentityPool actually stop early rather than
 * widening past a thin fixture, which is closer to what the pool builders
 * really do in Bradenton than a sparse fixture would be.
 *
 * WHAT IS NOT MEASURED. Wall-clock. An offline mock resolves close to
 * instantly regardless of payload size, so this harness cannot reproduce the
 * production SECONDS number — only what actually drives it: how many round
 * trips happen and how many bytes cross on each one. scripts/run-guards.mjs's
 * own `rm -rf .next && next build` timing and production APM are where wall-
 * clock gets re-measured after a real deploy.
 */
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// A synthetic block of prose the same rough shape as a real wf_inventory
// `editorial` cell (Google's own editorialSummary text, or an owner-verified
// line — see lib/railsData.js slimPlace's comment). Length is FIXED and
// EXPORTED so the guard's red-prove can compute an exact byte counterfactual
// rather than re-measuring a magic number.
export const FIXTURE_EDITORIAL = "A locally loved spot with a loyal following, known for consistent quality and a menu regulars keep coming back for — the kind of place a neighbor recommends before a guidebook does.";
export const FIXTURE_EDITORIAL_BYTES = Buffer.byteLength(FIXTURE_EDITORIAL, "utf8");

// The 4 physical categories the rail pipeline reads from wf_inventory.
const CATS = ["food", "attractions", "nightlife", "beach"];
const TYPE_BY_CAT = {
  food: ["restaurant", "point_of_interest"],
  attractions: ["tourist_attraction", "point_of_interest"],
  nightlife: ["bar", "point_of_interest"],
  beach: ["natural_feature", "point_of_interest"],
};
const PRIMARY_BY_CAT = { food: "restaurant", attractions: "tourist_attraction", nightlife: "bar", beach: "natural_feature" };

function parseIntent(url) {
  const u = new URL(url);
  const sp = u.searchParams;
  const select = sp.get("select") || "";
  const limit = Number(sp.get("limit")) || 0;
  const latGte = Number(sp.get("lat")?.replace(/^gte\./, "")) || null;
  // URLSearchParams.get("lat") only returns the FIRST lat= — this endpoint
  // sends both lat=gte.X and lat=lte.Y, so read the raw query string instead.
  const raw = u.search;
  const num = (re) => { const m = raw.match(re); return m ? Number(m[1]) : null; };
  const minLat = num(/lat=gte\.(-?[\d.]+)/);
  const maxLat = num(/lat=lte\.(-?[\d.]+)/);
  const minLng = num(/lng=gte\.(-?[\d.]+)/);
  const maxLng = num(/lng=lte\.(-?[\d.]+)/);
  const catMatch = raw.match(/category(?:\.eq\.|=eq\.)([a-z]+)/) || raw.match(/or=\(category\.eq\.([a-z]+)/);
  const category = catMatch ? catMatch[1] : null;
  return { select, limit, minLat, maxLat, minLng, maxLng, category };
}

let seq = 0;
function fixtureRows(intent) {
  const n = Math.max(0, intent.limit || 0);
  const cat = intent.category && CATS.includes(intent.category) ? intent.category : "food";
  const wantsEditorial = /(^|,)editorial(,|$)/.test(intent.select);
  const hasBox = [intent.minLat, intent.maxLat, intent.minLng, intent.maxLng].every((v) => Number.isFinite(v));
  const rows = [];
  for (let i = 0; i < n; i++) {
    seq += 1;
    const lat = hasBox ? intent.minLat + Math.random() * (intent.maxLat - intent.minLat) : 27.4;
    const lng = hasBox ? intent.minLng + Math.random() * (intent.maxLng - intent.minLng) : -82.44;
    const row = {
      place_id: `fixture_${cat}_${seq}`,
      name: `Fixture ${cat[0].toUpperCase()}${cat.slice(1)} Spot ${seq}`,
      lat, lng,
      category: cat,
      secondary_categories: [],
      primary_type: PRIMARY_BY_CAT[cat],
      google_types: TYPE_BY_CAT[cat],
      cuisines: cat === "food" ? ["american"] : [],
      status: "OPERATIONAL",
      excluded: false,
      signals: { rating: 3.8 + (seq % 12) / 10, reviews: 40 + (seq % 900), priceNum: seq % 4 },
      photo_ref: null,
    };
    if (wantsEditorial) row.editorial = FIXTURE_EDITORIAL;
    rows.push(row);
  }
  return rows;
}

function fixtureBeachWater(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ beach_place_id: `fixture_beach_${i}`, result: "good", advisory: false, sampled_at: "2026-09-01", lat: 27.4 + i * 0.01, lng: -82.6 - i * 0.01 });
  }
  return rows;
}

function jsonResponse(body, ok = true) {
  const text = JSON.stringify(body);
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => text,
    __bytes: Buffer.byteLength(text, "utf8"),
  };
}

/**
 * Runs one full loadRailPlaces("bradenton", {origin}) against a mocked
 * global.fetch. Returns { calls, restCalls, restBytes, ok, places, thin }.
 * `calls` is EVERY intercepted fetch (rest + anything else); `restCalls` is
 * the subset under /rest/v1/wf_inventory — the budget this WO is about.
 */
export async function runComputeHarness({ beachRows = 6, unknownAsEmpty = true } = {}) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/rest/v1/wf_inventory")) {
      const intent = parseIntent(url);
      const rows = fixtureRows(intent);
      const resp = jsonResponse(rows);
      calls.push({ url, table: "wf_inventory", rows: rows.length, bytes: resp.__bytes, editorial: /(^|,)editorial(,|$)/.test(intent.select) });
      return resp;
    }
    if (url.includes("/rest/v1/wf_beach_water_geo")) {
      const rows = fixtureBeachWater(beachRows);
      const resp = jsonResponse(rows);
      calls.push({ url, table: "wf_beach_water_geo", rows: rows.length, bytes: resp.__bytes, editorial: false });
      return resp;
    }
    if (url.includes("/rest/v1/")) {
      // wf_places_cache (getPlaceDetails' cget) and anything else this compute
      // touches indirectly. Not part of the wf_inventory budget — recorded
      // separately so the report is honest about what else fired.
      const resp = jsonResponse(unknownAsEmpty ? [] : null, unknownAsEmpty);
      calls.push({ url, table: "other", rows: 0, bytes: resp.__bytes, editorial: false });
      return resp;
    }
    // Anything else (Google, etc.) — should not be reachable: no
    // GOOGLE_MAPS_SERVER_KEY is set, so getPlaceDetails never calls out.
    calls.push({ url, table: "unexpected", rows: 0, bytes: 0, editorial: false });
    return jsonResponse([], false);
  };
  // WRITE, not read-with-fallback: the ambient shell must not change what this
  // harness measures (check-guard-hermeticity.mjs) — a session with
  // .env.production.local sourced has to see the exact same fixture values as
  // a clean one.
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
  delete process.env.GOOGLE_MAPS_SERVER_KEY;

  try {
    const mod = await loadComponent(join(ROOT, "lib/railsData.js"), ROOT);
    const t0 = Date.now();
    const result = await mod.loadRailPlaces("bradenton", {
      origin: { lat: 27.3939, lng: -82.4436 },
      requireOrigin: true,
      band: "afternoon",
    });
    const ms = Date.now() - t0;
    const restCalls = calls.filter((c) => c.table === "wf_inventory" || c.table === "wf_beach_water_geo");
    const restBytes = restCalls.reduce((s, c) => s + c.bytes, 0);
    return {
      ok: true, ms, places: result.places, thin: result.thin,
      calls, restCalls, restBytes,
      restCallCount: restCalls.length,
      editorialCalls: restCalls.filter((c) => c.editorial).length,
    };
  } finally {
    globalThis.fetch = origFetch;
  }
}

// CLI: print the baseline report. No pass/fail here — that is
// scripts/check-rail-compute-budget.mjs, which imports runComputeHarness.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runComputeHarness();
  if (!r.ok) { console.error("test-rail-compute-budget: harness did not complete"); process.exit(1); }
  const byTable = {};
  for (const c of r.calls) byTable[c.table] = (byTable[c.table] || 0) + 1;
  console.log("test-rail-compute-budget: BASELINE for loadRailPlaces(\"bradenton\", {origin: 27.3939,-82.4436})");
  console.log(`  wall time (mocked, not representative of network latency): ${r.ms}ms`);
  console.log(`  wf_inventory + wf_beach_water_geo calls: ${r.restCallCount} (${r.editorialCalls} still select editorial)`);
  console.log(`  wf_inventory + wf_beach_water_geo bytes: ${r.restBytes} (${(r.restBytes / 1024).toFixed(1)} KB)`);
  console.log(`  calls by table: ${JSON.stringify(byTable)}`);
  console.log(`  rails shipped: ${Object.keys(r.places).filter((k) => (r.places[k] || []).length > 0).length} / ${Object.keys(r.places).length}, thin: ${r.thin.length}`);
  let fail = 0;
  if (r.restCallCount === 0) { console.error("  FAIL: CONTROL — zero wf_inventory calls happened; the harness exercised nothing"); fail++; }
  if (Object.keys(r.places).length === 0) { console.error("  FAIL: CONTROL — loadRailPlaces returned no rail keys at all"); fail++; }
  if (fail) { console.error(`test-rail-compute-budget: ${fail} control failure(s)`); process.exit(1); }
  console.log("test-rail-compute-budget: OK — harness executed the real pipeline against a mocked fetch");
}
