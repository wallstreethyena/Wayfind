#!/usr/bin/env node
// Offline runtime controls for actual masks, conservative ledger reconciliation,
// per-attempt promotion grants, and honest budget-truncated city/census results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spendAllowDetailsAtmosphere, effectiveCap } from "../lib/spendGate.js";
import { preflightTypes, sweepDistricts } from "../lib/nightlifeCensus.js";

const envKeys = ["WAYFIND_GATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_MAPS_SERVER_KEY", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP"];
// This standalone guard owns its fixture environment; never read shell credentials.
const oldFetch = globalThis.fetch;
async function sourceModule(file, prelude, suffix = "") {
  const source = readFileSync(file, "utf8").replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source + "\n" + suffix));
}
try {
  process.env.WAYFIND_GATE = "open";
  process.env.SUPABASE_URL = "https://ledger.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-not-a-key";
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";
  process.env.WAYFIND_PROMOTE_PAID = "1";
  process.env.PROMOTE_DETAILS_MONTH_CAP = "6650";
  let grants = [], denied = null, providers = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).hostname, "ledger.example.test", "no real ledger/provider may be reached");
    const body = JSON.parse(init.body); grants.push(body);
    return Response.json(body.p_sku !== denied);
  };
  for (const legacy of ["details_pro", "details_enterprise"]) {
    grants = []; denied = legacy;
    assert.equal(await spendAllowDetailsAtmosphere(legacy), false);
    assert.deepEqual(grants.map((x) => [x.p_sku, x.p_cap]), [[legacy, 950]], "legacy exhaustion blocks a fresh corrected row");
    grants = []; denied = "details_enterprise_atmosphere";
    assert.equal(await spendAllowDetailsAtmosphere(legacy), false);
    assert.deepEqual(grants.map((x) => [x.p_sku, x.p_cap]), [[legacy, 950], ["details_enterprise_atmosphere", 950]]);
    grants = []; denied = null;
    assert.equal(await spendAllowDetailsAtmosphere(legacy), true);
    assert.equal(grants.length, 2);
    assert(grants.every((x) => x.p_cap === 950), "paid promotion cannot expand terminal Details headroom");
  }
  grants = [];
  assert.equal(await spendAllowDetailsAtmosphere("photos"), false);
  assert.equal(grants.length, 0, "unrelated SKUs cannot use this helper");
  process.env.WAYFIND_GATE = "shut";
  assert.equal(await spendAllowDetailsAtmosphere("details_pro"), false);
  assert.equal(grants.length, 0);
  process.env.WAYFIND_GATE = "free";
  assert.equal(effectiveCap("details_pro", 4800), 6650, "approved promotion paid ceiling remains intact");
  assert.equal(effectiveCap("text_enterprise", 1250), 1250, "operator rich Search caps remain intact");
  process.env.WAYFIND_GATE = "open";

  // Full production POST body, with only imported dependencies replaced.
  globalThis.__detailsAccounting = { inventory: null, grants: [], denied: false };
  const route = await sourceModule("app/api/places/details/route.js", `
    const NextResponse = { json: (body, init) => Response.json(body, init) };
    const getInventoryIdentity = async () => globalThis.__detailsAccounting.inventory;
    const gateShut = () => false;
    const spendAllow = async (sku) => { globalThis.__detailsAccounting.grants.push([sku]); return !globalThis.__detailsAccounting.denied; };
    const spendAllowDetailsAtmosphere = async (sku) => { globalThis.__detailsAccounting.grants.push([sku, "details_enterprise_atmosphere"]); return !globalThis.__detailsAccounting.denied; };
  `);
  const masks = {
    area: "location,formattedAddress,displayName",
    place: "id,location,displayName,formattedAddress,types,primaryType,rating,userRatingCount,photos,priceLevel,regularOpeningHours,businessStatus",
    detail: "editorialSummary,reviews,regularOpeningHours,nationalPhoneNumber,websiteUri,photos",
  };
  let mask;
  globalThis.fetch = async (url, init) => { assert.equal(new URL(url).hostname, "places.googleapis.com"); providers++; mask = init.headers["X-Goog-FieldMask"]; return Response.json({ id: "ChIJfixture", priceLevel: "PRICE_LEVEL_MODERATE" }); };
  const post = (kind, token) => route.POST(new Request("https://fixture.test/api/places/details", { method: "POST", body: JSON.stringify({ placeId: "ChIJfixture", kind, ...(token ? { sessionToken: "fixture-session" } : {}) }) }));
  for (const [kind, token, expected] of [["area", false, ["details_pro"]], ["place", false, ["details_enterprise"]], ["area", true, ["details_pro", "details_enterprise_atmosphere"]], ["place", true, ["details_enterprise", "details_enterprise_atmosphere"]], ["detail", false, ["details_enterprise", "details_enterprise_atmosphere"]]]) {
    globalThis.__detailsAccounting.grants = []; providers = 0;
    assert.equal((await (await post(kind, token)).json()).place.priceLevel, "MODERATE");
    assert.deepEqual(globalThis.__detailsAccounting.grants, [expected]);
    assert.equal(providers, 1); assert.equal(mask, masks[kind]);
  }
  globalThis.__detailsAccounting.inventory = { place_id: "ChIJfixture", name: "Owned fixture", lat: 1, lng: 1, signals: {} };
  globalThis.__detailsAccounting.grants = []; providers = 0;
  assert.equal((await (await post("place", true)).json()).source, "inventory");
  assert.equal(providers, 0); assert.equal(globalThis.__detailsAccounting.grants.length, 0);
  globalThis.__detailsAccounting.inventory = null; globalThis.__detailsAccounting.denied = true;
  assert.equal((await (await post("detail", false)).json()).error, "budget"); assert.equal(providers, 0);

  // Missing key must not consume a ledger grant on a durable place cache miss.
  globalThis.__durableDetails = { grants: 0 };
  const durable = await sourceModule("lib/placeDetails.js", `
    const DAY = 86400000; const cget = async () => null; const cset = async () => {};
    const keepPhotoCredits = () => {}; const gateShut = () => false;
    const spendAllow = async () => { globalThis.__durableDetails.grants++; return true; };
  `);
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  assert.equal(await durable.getPlaceDetails("ChIJfixture"), null); assert.equal(globalThis.__durableDetails.grants, 0);
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";
  providers = 0;
  await durable.getPlaceDetails("ChIJfixture"); assert.equal(globalThis.__durableDetails.grants, 1); assert.equal(providers, 1);

  // Transport injection cannot grant spend in a closed gate.
  process.env.WAYFIND_GATE = "shut";
  let censusCalls = 0;
  const censusTransport = async () => { censusCalls++; return Response.json({ places: [] }); };
  assert.equal((await preflightTypes(["bar"], "fixture", censusTransport)).gated, true);
  const district = [{ label: "fixture", lat: 1, lng: 1, radius: 500 }];
  const blocked = await sweepDistricts(district, ["bar"], "fixture", censusTransport);
  assert.equal(blocked.stats.budgetExhausted, true); assert.equal(blocked.stats.calls, 0); assert.equal(censusCalls, 0);
  const approved = await sweepDistricts(district, ["bar"], "fixture", censusTransport, async (tier) => tier === "enterprise");
  assert.equal(approved.stats.calls, 1); assert.equal(censusCalls, 1);

  // Production promotion retry helper: initial grant stays with the caller.
  const promote = readFileSync("app/api/cron/promote-index/route.js", "utf8");
  const retry = promote.slice(promote.indexOf("async function details("), promote.indexOf('// cache: "no-store" IS LOAD-BEARING'));
  globalThis.__retryAccounting = { grants: 0, denied: false };
  const retryModule = await import("data:text/javascript," + encodeURIComponent(`
    const DETAILS_MASK = "id"; const PROMOTE_SKU = "details_pro";
    const sleep = async () => {}; const isTerminalStatus = (s) => s >= 400 && s < 500 && s !== 429;
    const spendAllowCapped = async (sku, cap) => { globalThis.__retryAccounting.grants++; if (sku !== "details_enterprise" || cap !== 950) throw new Error("retry changed SKU/ceiling"); return !globalThis.__retryAccounting.denied; };
    ${retry}\nexport { details };
  `));
  providers = 0;
  globalThis.fetch = async () => { providers++; return providers === 1 ? new Response("transient", { status: 503 }) : Response.json({ id: "ChIJfixture" }); };
  assert.equal((await retryModule.details("fixture", "ChIJfixture", "rating", "details_enterprise", 950)).ok, true);
  assert.equal(providers, 2); assert.equal(globalThis.__retryAccounting.grants, 1);
  providers = 0; globalThis.__retryAccounting.grants = 0; globalThis.__retryAccounting.denied = true;
  assert.equal((await retryModule.details("fixture", "ChIJfixture", "rating", "details_enterprise", 950)).budget, true);
  assert.equal(providers, 1); assert.equal(globalThis.__retryAccounting.grants, 1);
  providers = 0; globalThis.__retryAccounting.grants = 0;
  globalThis.fetch = async () => { providers++; return new Response("missing", { status: 404 }); };
  assert.equal((await retryModule.details("fixture", "ChIJfixture", "rating", "details_enterprise", 950)).terminal, true);
  assert.equal(providers, 1); assert.equal(globalThis.__retryAccounting.grants, 0);

  // Production city POST with one accepted pull and the remainder denied.
  const city = await sourceModule("app/api/city/unlock/route.js", `
    const gateShut = () => false; const gateFree = () => false;
    let grants = 0; const spendAllowCapped = async () => ++grants === 1; const textEnterpriseCap = () => 950;
    const sbEnv = () => ({ url: "https://db.example.test", key: "fixture" });
    const isOperational = () => true; const pullViatorCityRows = async () => ({ rows: [] }); const credential = () => null;
  `);
  let inserts = 0, liveWrites = 0; providers = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://places.googleapis.com/")) { providers++; return Response.json({ places: [{ id: "ChIJpartial", displayName: { text: "Partial fixture" }, location: { latitude: 1, longitude: 1 } }] }); }
    if (u.includes("wf_gate_status")) return Response.json("cold");
    if (u.includes("wf_add_inventory_place")) inserts++;
    if (u.includes("wf_city_requests") && init.method === "PATCH" && JSON.parse(init.body).status === "live") liveWrites++;
    return Response.json([], { headers: { "content-range": "0/0" } });
  };
  const cityPayload = await (await city.POST(new Request("https://fixture.test/api/city/unlock", { method: "POST", body: JSON.stringify({ lat: 28.5, lng: -81.4, city: "Fixture" }) }))).json();
  assert.equal(providers, 1); assert.equal(inserts, 0); assert.equal(liveWrites, 0);
  assert.equal(cityPayload.status, "budget"); assert.equal(cityPayload.google_spend, "denied"); assert.equal(cityPayload.added, 0);
  console.log("test-google-details-accounting: OK — real route masks/grants, legacy exhaustion, paid ceilings, retry denial, missing-key order, injected census gate, and partial-city negative controls");
} finally {
  globalThis.fetch = oldFetch;
  for (const key of envKeys) delete process.env[key];
  delete globalThis.__detailsAccounting; delete globalThis.__durableDetails; delete globalThis.__retryAccounting;
}
