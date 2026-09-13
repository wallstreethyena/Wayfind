#!/usr/bin/env node
/**
 * Regression guard for the Breakfast + Quick Eats candidate dependency.
 *
 * This calls railsData's real buildMorningIdentityPools through the real
 * ownedPool reader. Only fetch is replaced, so the test exercises the same
 * identity predicates, deterministic read, admission order, photo hydration,
 * and failure contract used by the rail pipeline. It is fully offline.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Optional entry exists for the guard's red proof: a temporary, deliberately
// regressed railsData copy can be executed without touching the product file.
const ENTRY = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "lib/railsData.js");
const ORIGIN = { lat: 27.5876, lng: -82.4237 };
let passed = 0;
let failed = 0;
const ok = (condition, message) => {
  if (condition) passed++;
  else { failed++; console.error("FAIL:", message); }
};

const savedFetch = globalThis.fetch;

// Write fixed fixture credentials. Ambient developer configuration must not
// change what this guard calls or let it reach a real service.
process.env.SUPABASE_URL = "https://morning-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://morning-fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";

const response = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const ownedRow = (place_id, extra = {}) => ({
  place_id,
  name: `Generic Restaurant ${place_id}`,
  lat: ORIGIN.lat,
  lng: ORIGIN.lng,
  category: "food",
  secondary_categories: [],
  primary_type: "restaurant",
  google_types: ["restaurant", "food"],
  cuisines: ["american"],
  status: "OPERATIONAL",
  excluded: false,
  signals: { rating: 4.9, reviews: 10_000 },
  editorial: null,
  ...extra,
});

const creator = {
  id: "creator-coffee",
  name: "Creator Coffee Counter",
  lat: ORIGIN.lat,
  lng: ORIGIN.lng,
  distMi: 1,
  primaryType: "coffee_shop",
  types: ["coffee_shop", "cafe", "food"],
  rating: 4.6,
  reviews: 120,
  _creatorSources: [{ handle: "localmorning", platform: "instagram", url: "https://example.invalid/creator" }],
};

try {
  // Load once so every scenario calls the same real production functions.
  // fetchDeadline resolves global fetch at call time, after each scenario has
  // installed its deterministic response function.
  globalThis.fetch = async () => { throw new Error("fixture fetch was not installed"); };
  const mod = await loadComponent(ENTRY, ROOT);
  const { buildMorningIdentityPools } = mod;
  ok(typeof buildMorningIdentityPools === "function",
    "PROBE: buildMorningIdentityPools is exported and callable");

  // More than 400 high-score generic restaurants come first. The two useful
  // candidates sit below that shelf and have deliberately lower scores, so a
  // cap-before-identity implementation cannot find them.
  const generic = Array.from({ length: 425 }, (_, i) => ownedRow(`generic-${String(i).padStart(3, "0")}`));
  const breakfastRow = ownedRow("zz-breakfast", {
    name: "Buried Pancake House",
    primary_type: "breakfast_restaurant",
    google_types: ["breakfast_restaurant", "restaurant", "food"],
    signals: { rating: 4.2, reviews: 80 },
  });
  const quickRow = ownedRow("zz-quick", {
    name: "Buried Taco Counter",
    primary_type: "restaurant",
    google_types: ["restaurant", "food"],
    signals: { rating: 4.1, reviews: 60 },
  });
  const world = [...generic, breakfastRow, quickRow];
  ok(world.indexOf(breakfastRow) > 400 && world.indexOf(quickRow) > 400,
    "CONTROL: both qualifying rows are buried below more than 400 nonqualifying rows");
  const capFirst = world.slice(0, 400);
  ok(!capFirst.includes(breakfastRow) && !capFirst.includes(quickRow),
    "RED CONTROL: a 400-row shelf cannot see either buried candidate");

  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input);
    calls.push({ url, range: init.headers && init.headers.Range });
    if (!url.startsWith("https://morning-fixture.invalid/")) {
      throw new Error(`offline guard reached an unexpected URL: ${url}`);
    }
    if (/select=place_id,photo_ref/.test(url)) {
      return response([
        { place_id: "zz-breakfast", photo_ref: "breakfast-photo" },
        { place_id: "zz-quick", photo_ref: "quick-photo" },
      ]);
    }
    if (url.includes("/rest/v1/wf_inventory")) return response(world);
    throw new Error(`offline guard reached an unexpected endpoint: ${url}`);
  };

  const healthy = await buildMorningIdentityPools({ restaurants: [], creators: [creator] }, ORIGIN);
  const breakfastIds = healthy.breakfast.map((place) => place.id);
  const quickIds = healthy.quickeats.map((place) => place.id);
  ok(breakfastIds.includes("zz-breakfast"),
    "the real owned pool admits a breakfast candidate buried below the old shelf");
  ok(quickIds.includes("zz-quick"),
    "the same real owned pool admits a quick-service candidate buried below the old shelf");
  ok(breakfastIds.includes(creator.id) && quickIds.includes(creator.id),
    "the creator pool remains a morning source for both qualifying identities");
  const exhaustiveReads = calls.filter(({ url }) => /\/rest\/v1\/wf_inventory\?select=/.test(url)
    && /order=place_id\.asc/.test(url));
  ok(exhaustiveReads.length === 1,
    `Breakfast and Quick Eats share one exhaustive food read (saw ${exhaustiveReads.length})`);
  ok(/category\.eq\.food|category=eq\.food/.test(exhaustiveReads[0]?.url || "")
    && exhaustiveReads[0]?.range === "0-999",
  "the shared dependency is the deterministic first food page, not an unrelated read");

  // An owned inventory outage must reject the morning builder. Returning only
  // the creator row would turn a dependency failure into plausible scarcity.
  globalThis.fetch = async (input) => {
    const url = String(input && input.url ? input.url : input);
    if (url.startsWith("https://morning-fixture.invalid/")) throw new Error("owned food offline");
    throw new Error(`offline guard reached an unexpected URL: ${url}`);
  };
  let outageError = null;
  try { await buildMorningIdentityPools({ restaurants: [], creators: [creator] }, ORIGIN); }
  catch (error) { outageError = error; }
  ok(outageError instanceof Error && /owned inventory reads failed|owned food offline/i.test(outageError.message),
    "a failed owned food read rejects instead of returning a partial creator-only morning pool");

  // Six full 1,000-row pages hit OWNED_POOL_MAX_ROWS. This must reject before
  // identity/ranking can make that slice look complete.
  let truncatedPages = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input);
    if (!url.startsWith("https://morning-fixture.invalid/rest/v1/wf_inventory")) {
      throw new Error(`offline guard reached an unexpected URL: ${url}`);
    }
    if (/select=place_id,photo_ref/.test(url)) throw new Error("photo hydration must not run after truncation");
    truncatedPages++;
    const from = Number(String(init.headers?.Range || "0-999").split("-")[0]);
    return response(Array.from({ length: 1000 }, (_, i) => ownedRow(`truncated-${from + i}`)));
  };
  let truncationError = null;
  try { await buildMorningIdentityPools({ restaurants: [], creators: [creator] }, ORIGIN); }
  catch (error) { truncationError = error; }
  ok(truncatedPages === 6,
    `CONTROL: truncation fixture filled all six owned pages (saw ${truncatedPages})`);
  ok(truncationError instanceof Error && /hit OWNED_POOL_MAX_ROWS|incomplete/i.test(truncationError.message),
    "a truncated owned food pool rejects instead of returning a normal morning result");

  // A successful identity read plus failed survivor hydration returns an
  // explicitly degraded owned pool. The morning builder must reject that too.
  let broadSucceeded = false;
  let photoFailed = false;
  globalThis.fetch = async (input) => {
    const url = String(input && input.url ? input.url : input);
    if (!url.startsWith("https://morning-fixture.invalid/rest/v1/wf_inventory")) {
      throw new Error(`offline guard reached an unexpected URL: ${url}`);
    }
    if (/select=place_id,photo_ref/.test(url)) {
      photoFailed = true;
      return response({ message: "photo dependency unavailable" }, { status: 503 });
    }
    broadSucceeded = true;
    // The healthy scenario's real hydrator mutates its admitted source row.
    // Supply a fresh database row here so this scenario still has a survivor
    // whose photo dependency must run.
    return response([{ ...breakfastRow, photo_ref: null }]);
  };
  let degradedError = null;
  try { await buildMorningIdentityPools({ restaurants: [], creators: [] }, ORIGIN); }
  catch (error) { degradedError = error; }
  ok(broadSucceeded && photoFailed,
    "CONTROL: the degraded fixture completed admission and failed only survivor hydration");
  ok(degradedError instanceof Error && /morning inventory is incomplete/i.test(degradedError.message),
    "an explicitly degraded owned pool rejects instead of being presented as a complete morning pool");
} finally {
  globalThis.fetch = savedFetch;
}

console.log(`test-morning-candidate-integrity: ${failed ? "FAIL" : "OK"} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
