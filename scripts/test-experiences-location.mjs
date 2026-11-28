// scripts/test-experiences-location.mjs — locks "experiences follow the user's
// location": a far-away user is NEVER served Florida tours (destsWithin returns
// empty past ~150mi), and the rail then fetches LIVE for their real city.
import { readFileSync } from "fs";
import { destsWithin, DESTS, CATEGORY_BY_KEY } from "../lib/experiencesData.js";
import { GET as experienceRoute } from "../app/api/experiences/route.js";
import { WAYFIND_VIATOR_PID } from "../lib/viatorPid.js";
import { chipSearchQuery } from "../lib/browseCommerceMap.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── destsWithin: no Florida for out-of-region users ──
ok(destsWithin({ lat: 32.7765, lng: -79.9311 }, 60).length === 0, "Charleston SC (~350mi) → NO Florida markets (empty)");
ok(destsWithin({ lat: 40.7128, lng: -74.006 }, 60).length === 0, "New York → NO Florida markets");
ok(destsWithin({ lat: 34.0007, lng: -81.0348 }, 90).length === 0, "Columbia SC → NO Florida markets");
// ── but Florida + immediate surroundings still resolve (no regression) ──
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 30).length === 1, "Sarasota still gets its home market");
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 120).includes("663"), "Sarasota at 120mi still reaches Orlando");
ok(destsWithin({ lat: 28.9, lng: -81.3 }, 30).length >= 1, "a near-Florida user (Ocala, ~55mi) still gets the nearest market via the bounded fallback");
ok(destsWithin(null, 60).length === 5, "no location → all markets (unchanged)");

// ── the rail fetches live for the user's city when the pre-pull is dark ──
const home = read("app/home.js");
const browseRail = read("app/components/UnifiedBrowseCommerceRail.js");
ok(/function UnifiedBrowseCommerceRail\(\{ cat: browseCat = "attractions", sub,[^)]*city, region \}\)/.test(browseRail), "the extracted unified rail takes its CATEGORY plus the user's city + region");
// 2026-08-02 — these two used to pin the fallback's exact SYNTAX: the literal
// `if (!rows.length && city)` and the template `${city} ${cat}`. Both went red
// when the fallback was extracted into liveSearch() and the search text became
// the chip's own human query instead of a catalogue key — a refactor that
// STRENGTHENED the behaviour they exist to protect. That is the CLAUDE.md
// "assert the invariant, not the file path" trap, and its dangerous half is the
// inverse: pinned to `${city} ${cat}`, they would have gone GREEN on a version
// that dropped the city from the query entirely, as long as the template
// survived. So they now assert the three things that actually matter.
//
// 1. There IS a live fallback, and it runs only when the local read is empty.
ok(/shouldLiveSearchFallback\(\{[^}]*initialExperiences,[^}]*cachedCount: cachedRows\.length[^}]*\}\)\) rows = await liveSearch\(\)/.test(browseRail), "when local inventory is dark and this rail owns the live lane, it falls back to a LIVE tours search without duplicating a parent-owned call");
// 2. That fallback is gated on a known city, which is what stops an
//    out-of-region visitor being served Florida inventory.
ok(/const liveSearch = async \(\) => \{[\s\S]{0,800}?if \(!city\) return \[\];/.test(browseRail), "the live search refuses to run without a known city — the out-of-region guard");
ok(/const searchText = chipSearchQuery\(browseCat, sub \|\| "all", city\)/.test(browseRail), "the fallback resolves its search from the active category, submenu and known city");
// 3. The query is city-scoped and is HUMAN text, proven by CALLING the
//    resolver rather than by matching the template that builds it.
ok(/encodeURIComponent\(searchText\)/.test(browseRail) && /const searchText = chipSearchQuery\(browseCat, sub \|\| "all", city\)/.test(browseRail), "the live search asks for the chip's own query text, scoped to its CATEGORY and the user's city");
// 2026-08-04 — chips are keyed by CATEGORY:SUB now, because sub ids collide
// across the seven browse categories ("all" exists in every one). Passing a
// bare sub silently resolved to the attractions fallback. The food cases are
// the point of the change: Viator has no food tag, so the live-search text is
// the only thing that can carry the intent into an empty market.
for (const [cat, chip, city] of [
  ["attractions", "spa", "Sarasota"], ["attractions", "museums", "Orlando"],
  ["food", "all", "Tampa"], ["food", "dessert", "Tampa"],
  ["nightlife", "bars", "Orlando"], ["shopping", "outlets", "Sarasota"],
]) {
  const q = chipSearchQuery(cat, chip, city);
  ok(q.startsWith(city + " "), `chipSearchQuery("${cat}:${chip}") is scoped to the user's city (got "${q}")`);
  ok(!CATEGORY_BY_KEY[q.replace(city + " ", "")], `chipSearchQuery("${cat}:${chip}") is human search text, not a bare catalogue key (got "${q}")`);
}
// The food chips must actually ask for FOOD, not for the generic attractions text.
for (const chip of ["all", "breakfast", "dinner", "dessert"]) {
  ok(/food|tasting|chocolate|brunch|crawl|coffee/i.test(chipSearchQuery("food", chip, "Tampa")),
     `the food:${chip} live search asks for something food-shaped (got "${chipSearchQuery("food", chip, "Tampa")}")`);
}
ok(/&region=" \+ encodeURIComponent\(region \|\| city\)/.test(browseRail), "the live search passes the REGION (state) — required, or the anti-foreign filter returns 0 tours");
ok(/<UnifiedBrowseCommerceRail[^>]*city=\{locName \? locName\.split\(","\)\[0\] : ""\}/.test(home), "the rail is passed the current location's city");

// Exercise the actual home route against an owned catalog containing two real
// cross-filed product shapes. No network request is allowed outside the fake table.
const fixtureRow = (city, dest, code, title, rating, reviews) => ({
  dest_id: dest, city, product_code: code, title, rating, reviews, link_ok: true, provider: "viator",
  categories: ["water"], image: "https://images.example.test/product.jpg",
  product_url: `https://www.viator.com/tours/${city.replaceAll(" ", "-")}/Tour/d${dest}-${code}?pid=${WAYFIND_VIATOR_PID}`,
});
const miami = fixtureRow("Miami", "662", "342209P11", "Raccoon Island Exploration on SUP/Kayak", 4.9, 1363);
const miamiSecond = fixtureRow("Miami", "662", "288880P2", "Private Night/Sunset Boat Cruise in Miami", 4.9, 682);
const keys = fixtureRow("Key West", "661", "6426SHARKECO", "Shark and Wildlife Viewing Adventure in Key West", 5, 3367);
const keysSecond = fixtureRow("Key West", "661", "86549P2", "Guided Bike Tour of Old Town Key West", 4.9, 2728);
const miamiPass = fixtureRow("Miami", "662", "3958GOMIA", "Go City: Miami All-Inclusive Pass", 5, 9999);
const ftLauderdale = fixtureRow("Fort Lauderdale", "660", "5865P8", "Everglades Airboat Tour from Fort Lauderdale", 5, 9999);
const otherPid = new URL(miami.product_url); otherPid.searchParams.set("pid", "other-account");
const badRows = [
  { ...miamiPass, city: "Key West", dest_id: "661" },
  { ...ftLauderdale, city: "Miami", dest_id: "662" },
  fixtureRow("Miami", "662", "9001P8", "Miami to Key West day trip", 5, 9000),
  { ...keys, product_code: "9001P9" },
  { ...miami, product_url: miami.product_url.replace("www.viator.com", "unrelated.example") },
  { ...miami, product_url: otherPid.href },
  { ...keys, product_url: keys.product_url.replace("www.viator.com", "www.viator.com:8443") },
  { ...keys, product_url: keys.product_url.replace("www.viator.com", "test@www.viator.com") },
  { ...keys, product_url: keys.product_url.split("?")[0] },
  { ...miami, product_url: miami.product_url + "&pid=extra" },
  { ...miami, provider: "other" }, { ...miami, city: "Naples" },
  { ...miami, link_ok: false }, { ...keys, image: "" },
];
const rows = [keysSecond, miamiSecond, ...badRows, miami, keys];
const restoreFetch = globalThis.fetch;
const ownedCatalog = "https://owned-catalog.invalid";
process.env.SUPABASE_URL = ownedCatalog;
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test";
const queries = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(input);
  const onlyOwnedRead = url.origin === ownedCatalog && url.pathname === "/rest/v1/wf_experiences" && (!init?.method || init.method === "GET");
  ok(onlyOwnedRead, "every underlying network call is a read of the owned catalog");
  if (!onlyOwnedRead) throw new Error("Unexpected external request");
  const ids = url.searchParams.get("dest_id").match(/^in\.\((.*)\)$/)?.[1].split(",") || [];
  queries.push(ids);
  return Response.json(rows.filter(row => ids.includes(row.dest_id)));
};
try {
  const get = async params => (await experienceRoute(new Request("https://wayfind.invalid/api/experiences?" + new URLSearchParams(params)))).json();
  for (const [city, lat, lng, dest, first, second] of [
    ["Miami", 25.77, -80.19, "662", miami, miamiSecond], ["Key West", 24.56, -81.78, "661", keys, keysSecond],
  ]) {
    for (const params of [{ city, lat, lng, mi: 120 }, { city }]) {
      const res = await get(params);
      ok(!res.dark && res.markets.join() === dest, `${city} resolves by name and position to its actual market`);
      ok(res.total === 2 && res.chipCounts.all === 2, `${city} counts only attributable and geographically proven rows`);
      ok(res.items.map(r => r.code).join() === [first.product_code, second.product_code].join(), `${city} returns two distinct legitimate products in displayed score order`);
    }
  }
  const allNegative = rows.splice(0, rows.length, ...badRows);
  const noOffers = await get({ city: "Miami", lat: 25.77, lng: -80.19, mi: 120 });
  ok(noOffers.dark && noOffers.reason === "empty" && !noOffers.items.length, "a local market consisting only of unusable offers stays dark");
  rows.splice(0, rows.length, ...allNegative);
  const classicIds = ["25738","5403","22457","666","663"];
  ok(DESTS.map(d => d.destId).join() === classicIds.join(), "the paid scheduled collector still has exactly its five destinations");
  ok((await get({})).markets.join() === classicIds.join(), "unlocated home retains its exact five-market default");
  ok((await get({ city: "Kissimmee" })).markets.join() === "663", "existing legacy metro folds do not change");
  ok(!(await get({ lat: 32.77, lng: -79.93, mi: 120 })).markets.length, "an out-of-region coordinate cannot borrow either new market");
  ok(queries.length >= 7, "the positive, negative, and default probes actually queried the owned table");
} finally {
  globalThis.fetch = restoreFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

console.log(`test-experiences-location: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
