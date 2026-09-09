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

// 1. Photo authorization is lazy: free cache/inventory hits never consume the
// finite photo ledger. A cold denied ref never reaches Google, while the same
// cold ref reaches it exactly once after one grant.
{
  const ref = "places/ChIJ1234567890/photos/A1234567890";
  let cacheAuthorizations = 0;
  let cacheFetches = 0;
  const cached = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, authorizeSpend: async () => { cacheAuthorizations++; return true; }, serverKey: "placeholder" },
    {
      cacheGet: async () => ({ uri: "https://lh3.googleusercontent.com/p/cached" }),
      cacheSet: async () => {},
      inventoryGet: async () => { throw new Error("cache hit must not read inventory"); },
      fetchOwnedUri: async () => { cacheFetches++; return "https://lh3.googleusercontent.com/p/should-not-run"; },
    },
  );
  eq(cacheAuthorizations, 0, "cached photo consumes zero ledger grants");
  eq(cacheFetches, 0, "cached photo performs zero paid fetches");
  eq(cached.reason, "cache", "cached photo remains a cache result");

  let inventoryAuthorizations = 0;
  const inventory = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, authorizeSpend: async () => { inventoryAuthorizations++; return true; }, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => {},
      inventoryGet: async () => ({ signals: { photo_url: "https://cdn.example.test/place-owned.jpg" } }),
      fetchOwnedUri: async () => { throw new Error("inventory hit must not fetch Google"); },
    },
  );
  eq(inventoryAuthorizations, 0, "inventory-owned photo consumes zero ledger grants");
  eq(inventory.reason, "inventory", "inventory-owned photo remains an inventory result");

  const oldRef = ref;
  const currentRef = "places/ChIJ1234567890/photos/CURRENT123456";
  let currentRefAuthorizations = 0;
  let currentRefFetches = 0;
  let currentRefWrites = 0;
  const currentRefCache = await resolvePlacePhoto(
    { ref: oldRef, w: 640, gateShut: false, authorizeSpend: async () => { currentRefAuthorizations++; return true; }, serverKey: "placeholder" },
    {
      cacheGet: async (key) => key.includes(currentRef) ? { uri: "https://lh3.googleusercontent.com/p/current-ref-cache" } : null,
      cacheSet: async () => { currentRefWrites++; },
      inventoryGet: async () => ({ photo_ref: currentRef, signals: {} }),
      fetchOwnedUri: async () => { currentRefFetches++; return "https://lh3.googleusercontent.com/p/should-not-run"; },
    },
  );
  eq(currentRefAuthorizations, 0, "a newer same-place inventory ref cache consumes zero ledger grants");
  eq(currentRefFetches, 0, "a newer same-place inventory ref cache performs zero paid fetches");
  eq(currentRefWrites, 0, "reusing a newer same-place cache does not rewrite or extend its 30-day lifetime");
  eq(currentRefCache.reason, "inventory-ref-cache", "stale card ref reuses the current same-place cached ref");

  let foreignAuthorizations = 0;
  const foreignRef = "places/ChIJOTHERPLACE999/photos/FOREIGN123456";
  const foreign = await resolvePlacePhoto(
    { ref: oldRef, w: 640, gateShut: false, authorizeSpend: async () => { foreignAuthorizations++; return false; }, serverKey: "placeholder" },
    {
      cacheGet: async (key) => key.includes(foreignRef) ? { uri: "https://lh3.googleusercontent.com/p/foreign" } : null,
      cacheSet: async () => {},
      inventoryGet: async () => ({ photo_ref: foreignRef, signals: {} }),
      fetchOwnedUri: async () => { throw new Error("denied path must not fetch"); },
    },
  );
  eq(foreignAuthorizations, 1, "a foreign inventory ref is refused before its cache can be reused");
  eq(foreign.reason, "spend-denied", "a place never wears another place's cached inventory photo");

  let deniedAuthorizations = 0;
  let deniedFetches = 0;
  const denied = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, authorizeSpend: async () => { deniedAuthorizations++; return false; }, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => { throw new Error("denied path must not cache a paid result"); },
      inventoryGet: async () => null,
      fetchOwnedUri: async () => { deniedFetches++; return "https://lh3.googleusercontent.com/p/should-not-run"; },
    },
  );
  eq(deniedAuthorizations, 1, "cold photo asks the ledger exactly once");
  eq(deniedFetches, 0, "denied photo budget performs zero paid fetches");
  eq(denied.type, "miss", "denied uncached catalogued ref becomes an honest image miss, not a shared fallback");
  eq(denied.location, null, "denied uncached catalogued ref has no shared fallback location");
  eq(denied.reason, "spend-denied", "denied cold photo is distinguishable from a place with no photo");

  let grantedAuthorizations = 0;
  let grantedFetches = 0;
  const granted = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, authorizeSpend: async () => { grantedAuthorizations++; return true; }, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => {},
      inventoryGet: async () => null,
      fetchOwnedUri: async () => { grantedFetches++; return "https://lh3.googleusercontent.com/p/granted"; },
    },
  );
  eq(grantedAuthorizations, 1, "cold granted photo consumes exactly one ledger grant");
  eq(grantedFetches, 1, "positive control: granted photo budget reaches Google once");
  eq(granted.reason, "google", "positive control is labelled as a ledger-authorized Google fetch");

  let noKeyAuthorizations = 0;
  const noKey = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, authorizeSpend: async () => { noKeyAuthorizations++; return true; }, serverKey: "" },
    { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, fetchOwnedUri: async () => { throw new Error("missing key must not fetch"); } },
  );
  eq(noKeyAuthorizations, 0, "missing photo server key consumes zero ledger grants");
  eq(noKey.reason, "unconfigured", "missing photo server key remains operationally distinguishable");

  const route = readFileSync("app/api/photo/route.js", "utf8");
  // 2026-09-09: the authorizer is per-SKU so the resolver's self-heal fan-out can
  // take one grant per outbound request; `photos` goes through spendAllowPhotos
  // (free tier, or the owner's photo-only cap), every other SKU through spendAllow.
  // 2026-09-09 (#1188): recovery and the free-permanent-photo lookup are now
  // awaited TOGETHER (Promise.all) before either decision — see
  // scripts/test-free-photo-serving.mjs for the executed (not merely
  // pattern-matched) proof that a free photo refuses a `photos` grant while
  // leaving `details_ids_only` untouched.
  const authorizer = route.match(/authorizeSpend:\s*\(sku\s*=\s*"photos"\)\s*=>\s*Promise\.all\(\[getRecovery\(\),\s*getFreePhoto\(\)\]\)\.then\(\(\[hit,\s*free\]\)\s*=>\s*\{([\s\S]*?)\}\),/);
  ok(!!authorizer, "photo route injects lazy per-SKU ledger authorization (recovery + free-photo lookup, awaited together) into the resolver");
  ok(!!authorizer && /if \(hit \|\| shut\) return false;/.test(authorizer[1]), "photo route's authorizer refuses on a same-place recovery hit and on a shut gate");
  ok(!!authorizer && /if \(sku === "photos" && free\) return false;/.test(authorizer[1]), "photo route's authorizer refuses a `photos` grant outright when a free permanent photo exists for this place, and ONLY for `photos`");
  ok(!!authorizer && /return sku === "photos" \? spendAllowPhotos\(\) : spendAllow\(sku\);/.test(authorizer[1]), "photo route's authorizer routes photos through spendAllowPhotos and every other SKU through spendAllow");
  ok(!/const\s+spendAllowed\s*=\s*!shut\s*&&\s*\(await\s+spendAllow\("photos"\)\)/.test(route), "photo route cannot consume a grant before cache and inventory are checked");
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
