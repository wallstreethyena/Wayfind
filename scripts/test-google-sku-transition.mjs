#!/usr/bin/env node
// Hermetic regression for corrected Google billing classes. No provider call;
// fetch is replaced with an atomic-ledger stub and every requested SKU/cap is
// asserted from the production spendGate implementation.
import { readFileSync } from "node:fs";
import { spendAllowSkuTransition } from "../lib/spendGate.js";
import { preflightTypes, sweepDistricts } from "../lib/nightlifeCensus.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-google-sku-transition: FAIL — " + message);
};

async function sourceModule(path, prelude, suffix = "") {
  let source = readFileSync(path, "utf8");
  source = source.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source + "\n" + suffix));
}

const envKeys = ["WAYFIND_GATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_MAPS_SERVER_KEY"];
const savedFetch = globalThis.fetch;

async function run(grants, args) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const allowed = grants[body.p_sku] !== false;
    return new Response(JSON.stringify(allowed), { status: 200, headers: { "content-type": "application/json" } });
  };
  const allowed = await spendAllowSkuTransition(...args);
  return { allowed, calls };
}

try {
  process.env.WAYFIND_GATE = "open";
  process.env.SUPABASE_URL = "https://ledger.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
  process.env.GOOGLE_MAPS_SERVER_KEY = "placeholder";

  const oldExhausted = await run({ text_pro: false }, ["text_pro", "text_enterprise", 5000]);
  ok(!oldExhausted.allowed, "an exhausted legacy bucket blocks the corrected bucket");
  ok(oldExhausted.calls.length === 1 && oldExhausted.calls[0].p_sku === "text_pro", "legacy denial stops before corrected ledger or provider");
  ok(oldExhausted.calls[0].p_cap === 950, "legacy allowance is clamped to 950 during transition");

  const correctedDenied = await run({ nearby_pro: true, nearby_enterprise: false }, ["nearby_pro", "nearby_enterprise"]);
  ok(!correctedDenied.allowed, "corrected SKU denial blocks spend after a legacy grant");
  ok(correctedDenied.calls.map((x) => x.p_sku).join(",") === "nearby_pro,nearby_enterprise", "both legacy and corrected rows are debited in order");
  ok(correctedDenied.calls.every((x) => x.p_cap === 950), "neither transition bucket can be raised above 950");

  const granted = await run({}, ["details_enterprise", "details_enterprise_atmosphere"]);
  ok(granted.allowed, "positive control: two atomic grants allow the corrected request");
  ok(granted.calls.map((x) => x.p_sku).join(",") === "details_enterprise,details_enterprise_atmosphere", "Atmosphere request retains its legacy debit");

  const missingCap = await run({}, ["text_pro", "text_enterprise", null]);
  ok(!missingCap.allowed && missingCap.calls.length === 0, "missing rich Text Search cap fails before any ledger request");

  const unknownPair = await run({}, ["photos", "text_enterprise", 950]);
  ok(!unknownPair.allowed && unknownPair.calls.length === 0, "arbitrary SKU pairs cannot use the transition helper");

  let providerCalls = 0;
  const provider = async () => { providerCalls++; throw new Error("denied Nearby request reached provider"); };
  const preflightDenied = await preflightTypes(["bar"], "placeholder", provider, async () => false);
  ok(preflightDenied.gated === true && providerCalls === 0, "Nearby preflight denial stops before provider");
  const sweepDenied = await sweepDistricts([{ label: "test", lat: 1, lng: 1, radius: 500 }], ["bar"], "placeholder", provider, async () => false);
  ok(sweepDenied.stats.budgetExhausted === true && sweepDenied.stats.calls === 0 && providerCalls === 0, "Nearby full-mask denial halts the sweep and counts zero provider calls");

  let fullMask = "";
  const sweepGranted = await sweepDistricts(
    [{ label: "test", lat: 1, lng: 1, radius: 500 }], ["bar"], "placeholder",
    async (_url, init) => {
      providerCalls++;
      fullMask = init.headers["X-Goog-FieldMask"];
      return { ok: true, status: 200, json: async () => ({ places: [] }) };
    },
    async (tier) => tier === "enterprise",
  );
  ok(sweepGranted.stats.calls === 1 && providerCalls === 1, "positive control: an authorized full Nearby request reaches the provider once");
  ok(fullMask === "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.formattedAddress,places.types,places.primaryType,places.businessStatus,places.priceLevel,places.regularOpeningHours,places.utcOffsetMinutes,places.websiteUri", "full Nearby quality/ranking/hours mask is unchanged");

  const spend = readFileSync("lib/spendGate.js", "utf8");
  const landing = readFileSync("lib/landing.js", "utf8");
  const unlock = readFileSync("app/api/city/unlock/route.js", "utf8");
  const details = readFileSync("app/api/places/details/route.js", "utf8");
  const nearby = readFileSync("lib/nightlifeCensus.js", "utf8");
  ok(/details_enterprise_atmosphere:\s*950/.test(spend) && /nearby_enterprise:\s*950/.test(spend), "corrected finite SKU caps remain declared");
  ok(/spendAllowSkuTransition\("text_pro",\s*"text_enterprise",\s*textEnterpriseCap\(\)\)/.test(landing), "landing rich mask uses corrected Text Enterprise transition");
  ok(/spendAllowSkuTransition\([\s\S]*?\)\) return null;/.test(landing), "landing budget denial preserves stale fallback instead of caching empty results");
  ok(landing.includes('const mask = "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.formattedAddress,places.types,places.businessStatus,places.priceLevel,places.regularOpeningHours,places.utcOffsetMinutes"'), "landing rating/ranking/hours mask is unchanged");
  ok(/spendAllowSkuTransition\("text_pro",\s*"text_enterprise",\s*textEnterpriseCap\(\)\)/.test(unlock), "each city-unlock search uses an explicit corrected transition");
  ok(unlock.includes('const FIELD_MASK = ["places.id", "places.displayName", "places.location", "places.rating", "places.userRatingCount", "places.types", "places.businessStatus", "places.regularOpeningHours", "places.utcOffsetMinutes", "places.photos"].join(",");'), "city unlock rating/hours/photos mask is unchanged");
  ok(/sessionToken \|\| kind === "detail" \? "details_enterprise_atmosphere"/.test(details), "terminal and rich detail requests map to Atmosphere");
  ok(details.includes('place: "id,location,displayName,formattedAddress,types,primaryType,rating,userRatingCount,photos,priceLevel,regularOpeningHours,businessStatus"'), "selected-place quality, hours, photos and category mask is unchanged");
  ok(details.includes('area: "location,formattedAddress,displayName"') && details.includes('detail: "editorialSummary,reviews,regularOpeningHours,nationalPhoneNumber,websiteUri,photos"'), "area and opened-detail masks are unchanged");
  ok(/nearbyAllowed\("enterprise", authorize\)/.test(nearby), "full Nearby mask maps to Enterprise");
  ok(!/if \(injectedTransport\) return true/.test(nearby), "injecting a transport alone cannot bypass Nearby authorization");

  // Execute the production Details POST with injected inventory, gates and
  // provider transport. This proves the mapping controls dispatch, not merely
  // that the expected SKU names occur somewhere in source.
  globalThis.__skuTest = { inventory: null, grants: [], provider: 0, denyTransition: false };
  const detailsRoute = await sourceModule("app/api/places/details/route.js", `
    const NextResponse = { json(value, init = {}) { return new Response(JSON.stringify(value), { status: init.status || 200, headers: init.headers }); } };
    const getInventoryIdentity = async () => globalThis.__skuTest.inventory;
    const gateShut = () => false;
    const spendAllow = async (sku) => { globalThis.__skuTest.grants.push([sku]); return true; };
    const spendAllowSkuTransition = async (legacy, actual) => { globalThis.__skuTest.grants.push([legacy, actual]); return !globalThis.__skuTest.denyTransition; };
  `);
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://places.googleapis.com/")) {
      globalThis.__skuTest.provider++;
      return new Response(JSON.stringify({ id: "ChIJtest", location: { latitude: 1, longitude: 1 }, displayName: { text: "Test" } }), { status: 200 });
    }
    throw new Error("unexpected Details test fetch " + url);
  };
  const postDetails = async (kind, sessionToken) => detailsRoute.POST(new Request("https://www.gowayfind.com/api/places/details", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ placeId: "ChIJtest", kind, ...(sessionToken ? { sessionToken } : {}) }),
  }));
  for (const [kind, token, expected] of [
    ["area", false, ["details_pro"]],
    ["place", false, ["details_enterprise"]],
    ["area", true, ["details_pro", "details_enterprise_atmosphere"]],
    ["place", true, ["details_enterprise", "details_enterprise_atmosphere"]],
    ["detail", false, ["details_enterprise", "details_enterprise_atmosphere"]],
  ]) {
    globalThis.__skuTest.grants = []; globalThis.__skuTest.provider = 0;
    await postDetails(kind, token ? "session" : "");
    ok(JSON.stringify(globalThis.__skuTest.grants[0]) === JSON.stringify(expected) && globalThis.__skuTest.provider === 1, `Details ${kind}${token ? " terminal" : ""} uses its billed SKU and one provider call`);
  }
  globalThis.__skuTest.inventory = { place_id: "ChIJtest", name: "Owned", lat: 1, lng: 1, signals: {} };
  globalThis.__skuTest.grants = []; globalThis.__skuTest.provider = 0;
  await postDetails("place", "session");
  ok(globalThis.__skuTest.grants.length === 0 && globalThis.__skuTest.provider === 0, "owned selected place returns before ledger and provider");
  globalThis.__skuTest.inventory = null; globalThis.__skuTest.denyTransition = true;
  globalThis.__skuTest.grants = []; globalThis.__skuTest.provider = 0;
  await postDetails("detail", "");
  ok(globalThis.__skuTest.grants.length === 1 && globalThis.__skuTest.provider === 0, "Details transition denial stops before provider");

  // Execute the production retry helper: attempt zero is pre-authorized by the
  // caller, and every subsequent outbound attempt takes its own grant.
  const promoteSource = readFileSync("app/api/cron/promote-index/route.js", "utf8");
  const retryStart = promoteSource.indexOf("async function details(");
  const retryEnd = promoteSource.indexOf("// cache: \"no-store\" IS LOAD-BEARING", retryStart);
  const retryBody = promoteSource.slice(retryStart, retryEnd);
  globalThis.__retryTest = { grants: 0, providers: 0 };
  const retryModule = await import("data:text/javascript," + encodeURIComponent(`
    const DETAILS_MASK = "id"; const PROMOTE_SKU = "details_pro";
    const isTerminalStatus = (status) => status >= 400 && status < 500 && status !== 429;
    const sleep = async () => {};
    const spendAllowCapped = async () => { globalThis.__retryTest.grants++; return true; };
    ${retryBody}
    export { details };
  `));
  globalThis.fetch = async () => {
    globalThis.__retryTest.providers++;
    return globalThis.__retryTest.providers === 1
      ? new Response("temporary", { status: 503 })
      : new Response('{"id":"ChIJtest"}', { status: 200, headers: { "content-type": "application/json" } });
  };
  const retried = await retryModule.details("key", "ChIJtest", "id", "details_pro", 4800);
  ok(retried.ok && globalThis.__retryTest.providers === 2 && globalThis.__retryTest.grants === 1, "one transient retry takes one additional grant before its second provider call");

  // Execute city-unlock denial with its production POST. Six pool tasks may ask
  // the injected authorizer, but none may reach Google or mark partial data live.
  globalThis.__cityTest = { provider: 0 };
  const cityRoute = await sourceModule("app/api/city/unlock/route.js", `
    const gateShut = () => false; const gateFree = () => false;
    const spendAllowSkuTransition = async () => false; const textEnterpriseCap = () => 950;
    const sbEnv = () => ({ url: "https://db.example.test", key: "service" });
    const isOperational = () => true; const pullViatorCityRows = async () => ({ rows: [] });
    const credential = () => null;
  `);
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://places.googleapis.com/")) { globalThis.__cityTest.provider++; throw new Error("denied city crawl reached Google"); }
    if (String(url).includes("wf_gate_status")) return new Response('"cold"', { status: 200 });
    return new Response("[]", { status: 200, headers: { "content-range": "0/0", "content-type": "application/json" } });
  };
  const cityResponse = await cityRoute.POST(new Request("https://www.gowayfind.com/api/city/unlock", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: 28.5, lng: -81.4, city: "Test City" }),
  }));
  const cityPayload = await cityResponse.json();
  ok(globalThis.__cityTest.provider === 0 && cityPayload.status === "budget" && cityPayload.added === 0 && cityPayload.google_spend === "denied", "city budget denial reaches no provider, writes no partial crawl, and reports budget state");
} finally {
  globalThis.fetch = savedFetch;
  for (const key of envKeys) delete process.env[key];
}

if (failures) process.exit(1);
console.log("test-google-sku-transition: OK — legacy exhaustion blocks corrected SKUs, exact masks retain bounded accounting");
