import { existsSync, readFileSync } from "node:fs";

const component = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/night-out/route.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
const nearby = readFileSync(new URL("../lib/nearbyPool.js", import.meta.url), "utf8");
const batch = readFileSync(new URL("../lib/inventoryBoxBatch.js", import.meta.url), "utf8");
const batchCode = batch.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const railsData = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
const dateNight = readFileSync(new URL("../app/api/date-night/route.js", import.meta.url), "utf8");
const today = readFileSync(new URL("../app/api/today-discovery/route.js", import.meta.url), "utf8");
const obsoleteIntentRoute = new URL("../app/api/intent-candidates/route.js", import.meta.url);
const obsoleteIntentHook = new URL("../app/components/useIntentCandidates.js", import.meta.url);

let pass = 0;
const fail = [];
const ok = (condition, message) => condition ? pass++ : fail.push(message);

ok(/fetchJsonWithDeadline\("\/api\/night-out\?"/.test(component),
  "NightOutRails must fetch the dedicated bounded Night Out endpoint");

const { NIGHT_OUT_CATEGORIES, admitNightOutRows } = await import("../lib/nightOutPool.js");
ok(NIGHT_OUT_CATEGORIES.length === 3 && ["food", "nightlife", "attractions"].every((c) => NIGHT_OUT_CATEGORIES.includes(c)),
  `the Night Out endpoint must read food, nightlife and attraction inventory (reads: ${NIGHT_OUT_CATEGORIES.join(", ")})`);
ok(/fetchNightOutPool\(/.test(route),
  "the route no longer calls the Night Out pool reader — follow the retrieval rather than deleting this assertion");
{
  const { fetchNightOutPool } = await import("../lib/nightOutPool.js");
  const live = { place_id: "np1", name: "Neon Room", lat: 27.60, lng: -82.43, primary_type: "night_club", google_types: [], status: "OPERATIONAL", editorial: "A dance floor and a DJ every weekend.", signals: { rating: 4.6, reviews: 700 } };
  const impl = async (url) => {
    if (/attractions/.test(url)) throw new Error("attractions stalled");
    return { ok: true, json: async () => (/nightlife/.test(url) ? [live] : []) };
  };
  let out = null;
  try { out = await fetchNightOutPool(27.5949, -82.4265, { env: { url: "https://example.invalid", key: "k" }, fetchImpl: impl }); } catch { out = null; }
  ok(!!out && out.places.some((p) => p.id === "np1"),
    "one failed category blanked the whole answer — the surviving owned categories must still compose");
}
{
  const row = { place_id: "dupe", name: "Comedy Cellar", lat: 27.60, lng: -82.43, primary_type: "comedy_club", google_types: [], status: "OPERATIONAL", signals: { rating: 4.7, reviews: 500 } };
  const { places } = admitNightOutRows([row, { ...row }, { ...row }], { lat: 27.5949, lng: -82.4265 });
  ok(places.filter((p) => p.id === "dupe").length === 1,
    `the combined inventory must deduplicate before composition (the same row three times produced ${places.filter((p) => p.id === "dupe").length} cards)`);
  ok(places.length === 1, "positive control: the dedupe fixture really did qualify, so the assertion above is not vacuous");
}
ok(/const key = `night-out:v5:\$\{geoCell\(lat\)\}:\$\{geoCell\(lng\)\}`/.test(route) && !/night-out:v4/.test(route),
  "the intent-admission change must use the v5 cache identity at the real route key");
ok(!/useIntentCandidates/.test(daypart),
  "DaypartRail must not issue a duplicate inventory request while NightOutRails loads the complete answer");
ok(/<NightOutRails[\s\S]{0,400}?places=\{nightOutPlaces\}/.test(daypart),
  "NightOutRails must retain the existing client pool as its fail-soft fallback");

// GLOBAL CANDIDATE-INTEGRITY LOCK, 2026-09-11.
// Find the right identity first. Rank second. Apply presentation caps last.
ok(!existsSync(obsoleteIntentRoute) && !existsSync(obsoleteIntentHook),
  "the retired cap-first generic intent feed or client hook returned");

ok(/order=place_id\.asc/.test(batchCode)
  && /Prefer:\s*"count=exact"/.test(batchCode)
  && /Range:\s*`\$\{from\}-\$\{limit\}`/.test(batchCode)
  && /if \(rows\.length > limit\) return \{ rows: \[\], complete: false \}/.test(batchCode),
  "inventoryBoxBatch must page deterministic item Ranges and refuse a union beyond its ceiling");

ok(!/order=signals->reviews\.desc\.nullslast&limit=400/.test(nearby)
  && /readOwnedCategory/.test(nearby)
  && /result\.truncated/.test(nearby),
  "Nearby must read the ring completely before category identity or fall back");

ok(/function buildMorningIdentityPools\(/.test(railsData)
  && /categories:\s*\["food"\]/.test(railsData)
  && /isBreakfastPlace\(place\)/.test(railsData)
  && /isStrongQuickService\(place\)/.test(railsData),
  "Breakfast and Quick Eats must share an identity-first owned food read");

ok(!/buildIdentityPool\(pools, origin, isBreakfastPlace/.test(railsData)
  && !/buildIdentityPool\(pools, origin, isQuickService/.test(railsData),
  "Breakfast or Quick Eats fell back to the old broad top-300 widening path");

ok(/if \(url && anon && typeOv\.length\)/.test(railsData),
  "the remaining 300-row synthetic widening path must be gated by a real type identity before its cap");

ok(/categories:\s*\["shopping"\][\s\S]{0,220}?identity:\s*isDateShopping/.test(dateNight),
  "Date Night Shopping must be fed by an exact shopping identity-first owned pool");

ok(/serveInventoryByPlaceIds/.test(today)
  && /function instagramPlaceIds\(\)/.test(today)
  && /exactInstagramInventory/.test(today),
  "creator-backed Today inventory must be reached by curated exact Place IDs");

if (fail.length) {
  console.error("check-intent-rail-inventory-fed: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-intent-rail-inventory-fed: OK — ${pass} assertions; identity-before-rank is locked across Night Out, Breakfast/Quick Eats, Nearby, Date Night Shopping, creator exact IDs, and the batch accelerator`);
