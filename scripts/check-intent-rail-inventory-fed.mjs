import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/night-out/route.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");

let pass = 0;
const fail = [];
const ok = (condition, message) => condition ? pass++ : fail.push(message);

ok(/fetchJsonWithDeadline\("\/api\/night-out\?"/.test(component),
  "NightOutRails must fetch the dedicated bounded Night Out endpoint");
// v8.97b — FOLLOWED TO THE INVARIANT. These three read the ROUTE for strings
// that belonged to the retrieval, and the retrieval moved into
// lib/nightOutPool.js (identity before the cost bound). A path-pinned check
// goes red on a correct move and — the half that actually costs — goes GREEN on
// a version that keeps the strings in the route and drops the behaviour. So:
// assert the exported CONTRACT and CALL it, rather than matching the old file.
const { NIGHT_OUT_CATEGORIES, admitNightOutRows } = await import("../lib/nightOutPool.js");
ok(NIGHT_OUT_CATEGORIES.length === 3 && ["food", "nightlife", "attractions"].every((c) => NIGHT_OUT_CATEGORIES.includes(c)),
  `the Night Out endpoint must read food, nightlife and attraction inventory (reads: ${NIGHT_OUT_CATEGORIES.join(", ")})`);
ok(/fetchNightOutPool\(/.test(route),
  "the route no longer calls the Night Out pool reader — follow the retrieval rather than deleting this assertion");
{
  // Parallel + fail-soft, asserted by CALLING the reader with one dead category.
  // The string "Promise.allSettled" is not the invariant; surviving a stalled
  // category is. (This assertion caught a real regression the day it moved: the
  // new reader was first written with Promise.all.)
  const { fetchNightOutPool } = await import("../lib/nightOutPool.js");
  const live = { place_id: "np1", name: "Neon Room", lat: 27.60, lng: -82.43, primary_type: "night_club", google_types: [], status: "OPERATIONAL", editorial: "A dance floor and a DJ every weekend.", signals: { rating: 4.6, reviews: 700 } };
  const impl = async (url) => {
    if (/attractions/.test(url)) throw new Error("attractions stalled");
    return { ok: true, json: async () => (/nightlife/.test(url) ? [live] : []) };
  };
  let out = null;
  try { out = await fetchNightOutPool(27.5949, -82.4265, { env: { url: "https://example.invalid", key: "k" }, fetchImpl: impl }); } catch (e) { out = null; }
  ok(!!out && out.places.some((p) => p.id === "np1"),
    "one failed category blanked the whole answer — the surviving owned categories must still compose");
}
{
  // Dedupe, asserted by CALLING. A place can be reached through BOTH its
  // category and another category's secondary_categories, so the same row
  // legitimately arrives twice and must be composed once.
  const row = { place_id: "dupe", name: "Comedy Cellar", lat: 27.60, lng: -82.43, primary_type: "comedy_club", google_types: [], status: "OPERATIONAL", signals: { rating: 4.7, reviews: 500 } };
  const { places } = admitNightOutRows([row, { ...row }, { ...row }], { lat: 27.5949, lng: -82.4265 });
  ok(places.filter((p) => p.id === "dupe").length === 1,
    `the combined inventory must deduplicate before composition (the same row three times produced ${places.filter((p) => p.id === "dupe").length} cards)`);
  ok(places.length === 1, "positive control: the dedupe fixture really did qualify, so the assertion above is not vacuous");
}
ok(/night-out:v4/.test(route), "the expanded answer must use the v4 cache identity");
ok(!/useIntentCandidates/.test(daypart),
  "DaypartRail must not issue a duplicate inventory request while NightOutRails loads the complete answer");
ok(/<NightOutRails[\s\S]{0,400}?places=\{nightOutPlaces\}/.test(daypart),
  "NightOutRails must retain the existing client pool as its fail-soft fallback");

if (fail.length) {
  console.error("check-intent-rail-inventory-fed: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-intent-rail-inventory-fed: OK — ${pass} assertions; one bounded endpoint owns the full inventory and the client keeps a no-cost fallback`);
