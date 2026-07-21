// scripts/test-things-to-do.mjs — lock test for Things To Do (lib/thingsToDo.js).
// Pure + deterministic. Pins: curiosity labels (never raw category names), non-empty collections,
// honest hidden-gem/locals logic, dedupe. Wire into prebuild.
import { buildCollections, COLLECTIONS, RAW_CATEGORY_NAMES } from "../lib/thingsToDo.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

// no collection label is a raw category name
ok(COLLECTIONS.every((c) => !RAW_CATEGORY_NAMES.includes(c.label)), "labels are never raw category names");

const center = { lat: 27.34, lng: -82.53 };
const p = (id, o) => ({ place_id: id, name: id, lat: 27.34, lng: -82.53, ...o });
const places = [
  p("g1", { rating: 4.8, reviewCount: 120 }),   // hidden gem
  p("g2", { rating: 4.6, reviewCount: 90 }),    // hidden gem
  p("g3", { rating: 4.7, reviewCount: 200 }),   // hidden gem
  p("l1", { rating: 4.8, reviewCount: 1500 }),  // locals
  p("l2", { rating: 4.7, reviewCount: 900 }),   // locals
  p("l3", { rating: 4.9, reviewCount: 2200 }),  // locals
  p("d1", { rating: 4.7, reviewCount: 400, lat: 27.55, lng: -82.7 }), // drive (~20mi)
  p("d2", { rating: 4.8, reviewCount: 350, lat: 27.6, lng: -82.75 }),
  p("d3", { rating: 4.6, reviewCount: 600, lat: 27.58, lng: -82.72 }),
  p("d4", { rating: 4.7, reviewCount: 380, lat: 27.57, lng: -82.71 }),
  p("o1", { rating: 4.4, reviewCount: 50, openNow: true }),
  p("o2", { rating: 4.5, reviewCount: 60, openNow: true }),
  p("o3", { rating: 4.3, reviewCount: 70, openNow: true }),
];
const cols = buildCollections(places, { center });

ok(cols.length >= 3 && cols.length <= 5, "3–5 collections built: " + cols.length);
ok(cols.every((c) => c.places.length >= 3), "every collection has >=3 real places");
ok(cols.every((c) => c.places.every((pl) => pl.place_id && typeof pl.rating === "number")), "places are real");

// dedupe: no place appears in two collections
const seen = new Set(); let dup = false;
for (const c of cols) for (const pl of c.places) { if (seen.has(pl.place_id)) dup = true; seen.add(pl.place_id); }
ok(!dup, "no place appears in two collections");

// hidden gems excludes a high-review place; locals requires many reviews
const gems = cols.find((c) => c.id === "hidden-gems");
if (gems) ok(gems.places.every((pl) => pl.reviewCount < 300), "hidden gems are low-review only");
const locals = cols.find((c) => c.id === "locals-recommend");
if (locals) ok(locals.places.every((pl) => pl.reviewCount >= 500), "locals are high-review only");

// a place with no rating is dropped (never fabricated)
const cols2 = buildCollections([...places, { place_id: "x", name: "x" }], { center });
ok(!cols2.some((c) => c.places.some((pl) => pl.place_id === "x")), "rating-less place excluded");

console.log(`test-things-to-do: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
