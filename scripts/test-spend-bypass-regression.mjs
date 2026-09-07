#!/usr/bin/env node
// Hermetic regression proof for three paid-provider spend boundaries.
// It executes the production photo resolver and route source with mocked cache,
// ledger, and fetch dependencies. No external request is possible in this test.
import { readFileSync } from "node:fs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { autocompleteCap, effectiveCap, gateMode, geocodingCap, spendAllow, spendAllowCapped } from "../lib/spendGate.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("spend-bypass-regression: FAIL — " + message);
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (got ${actual}, expected ${expected})`);

async function sourceModule(path, prelude) {
  let source = readFileSync(path, "utf8");
  source = source.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source));
}

// 0. Missing or mistyped gate configuration cannot become unmetered spend;
// explicit enabled modes still take the atomic ledger.
{
  const keys = ["WAYFIND_GATE", "AUTOCOMPLETE_MONTH_CAP", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const savedFetch = globalThis.fetch;
  try {
    for (const key of keys) delete process.env[key];
    delete process.env.WAYFIND_GATE;
    delete process.env.AUTOCOMPLETE_MONTH_CAP;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("closed gate reached network"); };
    eq(gateMode(), "shut", "unset gate fails closed");
    eq(await spendAllow("photos"), false, "unset gate denies a known paid SKU");
    eq(calls, 0, "unset gate reaches neither ledger nor provider");
    eq(autocompleteCap(), null, "autocomplete requires an explicit operator cap");

    process.env.WAYFIND_GATE = "typo";
    eq(gateMode(), "shut", "unknown gate value fails closed");
    process.env.WAYFIND_GATE = "open";
    process.env.SUPABASE_URL = "https://ledger.example.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    globalThis.fetch = async (url) => {
      calls++;
      ok(String(url).endsWith("/rest/v1/rpc/wf_spend_take"), "enabled spend asks only the atomic ledger");
      return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    };
    eq(await spendAllow("photos"), true, "explicit open mode still needs and receives a ledger grant");
    eq(calls, 1, "explicit open mode takes exactly one ledger grant");
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of keys) delete process.env[key];
  }
}

// 1. A denied photo budget is cache/inventory-only: its Google dependency must
// never run. Positive control proves the same ref does run after a grant.
{
  const ref = "places/ChIJ1234567890/photos/A1234567890";
  let deniedFetches = 0;
  const denied = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, spendAllowed: false, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => { throw new Error("denied path must not cache a paid result"); },
      inventoryGet: async () => null,
      fetchOwnedUri: async () => { deniedFetches++; return "https://lh3.googleusercontent.com/p/should-not-run"; },
    },
  );
  eq(deniedFetches, 0, "denied photo budget performs zero paid fetches");
  eq(denied.type, "empty", "denied uncached catalogued ref does not masquerade as a fetched photo");

  let grantedFetches = 0;
  const granted = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, spendAllowed: true, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => {},
      inventoryGet: async () => null,
      fetchOwnedUri: async () => { grantedFetches++; return "https://lh3.googleusercontent.com/p/granted"; },
    },
  );
  eq(grantedFetches, 1, "positive control: granted photo budget reaches Google once");
  eq(granted.reason, "google", "positive control is labelled as a ledger-authorized Google fetch");
}

// 2. The retired Nearby probe executes the actual GET body and cannot reach an
// upstream even if a caller supplies an arbitrary field mask.
{
  const route = await sourceModule("app/api/places/search/route.js", `
    const DAY = 86400000;
    const NextResponse = { json(value, init = {}) { return new Response(JSON.stringify(value), { status: init.status || 200, headers: init.headers }); } };
  `);
  let fetches = 0;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches++; throw new Error("retired probe called upstream"); };
  try {
    const response = await route.GET(new Request("https://www.gowayfind.com/api/places/search?probe=nearby&fields=places.editorialSummary"));
    eq(response.status, 410, "nearby probe is retired with 410");
    eq(fetches, 0, "retired nearby probe performs zero paid fetches");
    eq(response.headers.get("cache-control"), "no-store", "retired nearby probe is never cached as a normal result");
  } finally {
    globalThis.fetch = savedFetch;
  }
}

// The browser-side reverse-geocode helper must never revive a denied server
// request through the paid Maps SDK. This static boundary complements the
// executed server-route proof below; getLoader remains valid elsewhere for
// explicit user map/detail work.
{
  const google = readFileSync("lib/google.js", "utf8");
  const start = google.indexOf("async function _reverseGeocodeUncached(lat, lng) {");
  const end = google.indexOf("\n}\n", start) + 3;
  const helper = google.slice(start, end);
  ok(start >= 0 && end > start, "reverse-geocode helper was located before testing its fallback boundary");
  ok(/fetch\("\/api\/geocode\?lat="/.test(helper), "reverse-geocode helper still calls the guarded server route");
  ok(!/getLoader\(\)\.importLibrary\("geocoding"\)/.test(helper), "reverse-geocode helper cannot bypass a denied server budget through Maps SDK");
  ok(/if \(!r\.ok\) return "";/.test(helper) && /catch \(e\) \{\s*return "";/.test(helper), "all server route failures fail soft without paid client fallback");
}

// 3. Execute the actual geocode route with mocked dependencies: cache wins
// before the ledger, a denied explicit cap prevents fetch, and a grant permits
// precisely one provider call. The ledger helper itself is also checked in
// open, free, and shut modes.
{
  const keys = ["WAYFIND_GATE", "GOOGLE_GEOCODING_MONTH_CAP", "GOOGLE_MAPS_SERVER_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const savedFetch = globalThis.fetch;
  try {
    for (const key of keys) delete process.env[key];
    delete process.env.GOOGLE_GEOCODING_MONTH_CAP;
    process.env.WAYFIND_GATE = "open";
    eq(geocodingCap(), null, "absent geocoding cap is disabled");
    eq(effectiveCap("geocoding", geocodingCap()), null, "absent geocoding cap fails closed in open mode");

    process.env.GOOGLE_GEOCODING_MONTH_CAP = "7";
    process.env.GOOGLE_MAPS_SERVER_KEY = "placeholder-google-key";
    process.env.SUPABASE_URL = "https://ledger.example.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    let ledgerCalls = 0;
    globalThis.fetch = async (url) => {
      ledgerCalls++;
      ok(String(url).includes("/rpc/wf_spend_take"), "geocoding allowance uses the atomic spend ledger");
      return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    };
    eq(await spendAllowCapped("geocoding", geocodingCap()), true, "configured cap grants through the ledger in open mode");
    eq(ledgerCalls, 1, "open mode performs one ledger grant");
    process.env.WAYFIND_GATE = "free";
    eq(effectiveCap("geocoding", geocodingCap()), 7, "configured geocoding ceiling remains finite in free mode");
    process.env.WAYFIND_GATE = "shut";
    ledgerCalls = 0;
    eq(await spendAllowCapped("geocoding", geocodingCap()), false, "shut mode denies geocoding");
    eq(ledgerCalls, 0, "shut mode never contacts the ledger or provider");

    const cache = { hit: { v: { name: "Cached City, FL" } }, writes: [] };
    globalThis.__spendBypassGeocode = {
      cget: async () => cache.hit,
      cset: async (...args) => cache.writes.push(args),
      spendAllowCapped: async () => { throw new Error("cache hit must not take a spend grant"); },
      geocodingCap: () => 7,
    };
    const geocode = await sourceModule("app/api/geocode/route.js", `
      const cget = (...args) => globalThis.__spendBypassGeocode.cget(...args);
      const cset = (...args) => globalThis.__spendBypassGeocode.cset(...args);
      const spendAllowCapped = (...args) => globalThis.__spendBypassGeocode.spendAllowCapped(...args);
      const geocodingCap = (...args) => globalThis.__spendBypassGeocode.geocodingCap(...args);
    `);

    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls++; throw new Error("cache hit called provider"); };
    let response = await geocode.GET(new Request("https://www.gowayfind.com/api/geocode?lat=27.5689&lng=-82.4393"));
    eq(response.status, 200, "geocode cache hit succeeds");
    eq(providerCalls, 0, "geocode cache hit makes zero paid fetches");
    eq((await response.json()).name, "Cached City, FL", "geocode cache value is preserved");

    cache.hit = null;
    globalThis.__spendBypassGeocode.spendAllowCapped = async () => false;
    globalThis.fetch = async () => { providerCalls++; throw new Error("denied cap called provider"); };
    response = await geocode.GET(new Request("https://www.gowayfind.com/api/geocode?lat=27.5689&lng=-82.4393"));
    eq(response.status, 503, "denied geocoding budget is explicit");
    eq(providerCalls, 0, "denied geocoding budget makes zero paid fetches");

    globalThis.__spendBypassGeocode.spendAllowCapped = async () => true;
    globalThis.fetch = async (url) => {
      providerCalls++;
      ok(String(url).startsWith("https://maps.googleapis.com/maps/api/geocode/json?"), "positive control calls only Google Geocoding");
      return new Response(JSON.stringify({ results: [{ address_components: [
        { long_name: "Bradenton", types: ["locality"] },
        { short_name: "FL", types: ["administrative_area_level_1"] },
      ] }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    response = await geocode.GET(new Request("https://www.gowayfind.com/api/geocode?lat=27.5689&lng=-82.4393"));
    eq(response.status, 200, "granted geocoding budget succeeds");
    eq(providerCalls, 1, "positive control makes exactly one provider fetch");
    eq((await response.json()).name, "Bradenton, FL", "positive control preserves city-first normalization");
    eq(cache.writes.length, 1, "fresh geocode preserves the 30-day cache write");
  } finally {
    delete globalThis.__spendBypassGeocode;
    globalThis.fetch = savedFetch;
    for (const key of keys) delete process.env[key];
  }
}

if (failures) process.exit(1);
console.log("spend-bypass-regression: OK — denied budgets make zero paid fetches; retired Nearby is inert; geocoding is cache-first and finite-ledger gated");
