#!/usr/bin/env node
// scripts/test-rail-select.mjs — every rail must actually SELECT.
//
// THE BUG THIS LOCKS DOWN, measured on the preview against real Sarasota data
// (2026-08-15): six of the fifteen rails opened with the same place and two
// more with the same restaurant, because every rail without a filter took the
// unfiltered top of the same ranked pool.
//
//   season, events, best, locals, family, today  -> Ca' d'Zan
//   eat, datenight                               -> Beach House Waterfront
//
// "Unique curated experiences" was fifteen names over one list. A rail whose
// axis does not select is not a rail, it is a duplicate — and nothing failed,
// because a duplicate list is a perfectly valid list.
//
// The fixture below is a small synthetic market with exactly the shapes the
// axes key on: a museum anchor, a zoo, a theatre, a far preserve, a beach, a
// far beach, an under-reviewed gallery, a bakery, an expensive bistro, a taco
// counter, a bar, a comedy club. It is deliberately NOT real data — a test
// that needs Google to pass is a test that goes quiet the day the key expires.
import { RAILS } from "../lib/rails.js";
import { RAIL_SELECT, selectFor, fillRails, MIN_CARDS, MAX_CARDS } from "../lib/railSelect.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(a === b, `${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

const mk = (id, o) => ({
  id, name: o.name, rating: o.rating ?? 4.5, reviews: o.reviews ?? 1200,
  types: o.types || ["tourist_attraction"], distMi: o.distMi ?? 3, _s: o._s ?? 50,
  priceLevel: o.priceLevel || null, trending: !!o.trending, trend_score: o.trend_score || 0,
});
const pools = {
  "things-to-do": [
    mk("a", { name: "Ca d Zan", _s: 99, types: ["museum", "tourist_attraction"] }),
    mk("b", { name: "Manatee Springs", _s: 80, types: ["natural_feature", "park"] }),
    mk("c", { name: "Van Wezel Hall", _s: 78, types: ["performing_arts_theater"] }),
    mk("d", { name: "Far Preserve", _s: 60, distMi: 22, types: ["park"] }),
    mk("e", { name: "Tiny Gallery", _s: 55, rating: 4.7, reviews: 120, types: ["art_gallery"] }),
    mk("f", { name: "Big Cat Habitat", _s: 70, types: ["zoo"] }),
    mk("g", { name: "Jungle Gardens", _s: 68, types: ["zoo", "botanical_garden"] }),
    mk("h", { name: "Distant Springs", _s: 52, distMi: 25, types: ["natural_feature"] }),
    mk("i", { name: "Little Maritime Museum", _s: 48, rating: 4.7, reviews: 210, types: ["museum"] }),
    mk("j", { name: "Bayfront Amphitheatre", _s: 66, types: ["amphitheatre"] }),
    mk("k", { name: "Opera House", _s: 58, types: ["opera_house"] }),
  ],
  restaurants: [
    mk("r1", { name: "Beach House Waterfront", _s: 90, types: ["restaurant"], priceLevel: "PRICE_LEVEL_MODERATE" }),
    mk("r2", { name: "Quick Bagel Co", _s: 70, types: ["bakery", "cafe"], distMi: 2 }),
    mk("r3", { name: "Owen Bistro", _s: 85, types: ["restaurant"], priceLevel: "PRICE_LEVEL_EXPENSIVE" }),
    mk("r4", { name: "Corner Taco", _s: 60, types: ["fast_food_restaurant"], distMi: 1 }),
    mk("r5", { name: "Hidden Deli", _s: 58, rating: 4.8, reviews: 90, types: ["deli"], distMi: 2 }),
    mk("r6", { name: "Sunset Chophouse", _s: 72, types: ["restaurant"], priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }),
    mk("r7", { name: "Nonna Trattoria", _s: 64, rating: 4.7, reviews: 320, types: ["restaurant"], priceLevel: "PRICE_LEVEL_MODERATE" }),
  ],
  beaches: [
    mk("bh1", { name: "Siesta Key Beach", _s: 95, types: ["beach"] }),
    mk("bh2", { name: "Lido Beach", _s: 88, types: ["beach"] }),
    mk("bh3", { name: "Far Beach", _s: 70, distMi: 30, types: ["beach"] }),
  ],
  nightlife: [
    mk("n1", { name: "Bamboo Island Bar", _s: 80, types: ["bar"] }),
    mk("n2", { name: "The Club", _s: 75, types: ["night_club"] }),
    mk("n3", { name: "Comedy Room", _s: 60, types: ["comedy_club"] }),
    // The exact shape that broke the events axis on real data: a bar & grill
    // whose Google types include night_club. Open every night — the opposite of
    // "it has a date on it and then it is gone".
    mk("n4", { name: "The Mable Bar & Grill", _s: 92, types: ["bar", "night_club", "restaurant"] }),
  ],
};

// ── structure ───────────────────────────────────────────────────────────────
for (const r of RAILS) {
  if (r.list) ok(!!RAIL_SELECT[r.id], `${r.id}: has a selector`);
  if (r.guides) ok(!RAIL_SELECT[r.id], `${r.id}: the guides rail has no ranked selector`);
}
for (const [id, cfg] of Object.entries(RAIL_SELECT)) {
  ok(!!RAILS.find((r) => r.id === id), `selector "${id}" belongs to a real rail`);
  ok(Array.isArray(cfg.pools) && cfg.pools.length > 0, `${id}: reads at least one pool`);
  for (const c of cfg.pools) ok(!!pools[c], `${id}: pool "${c}" is a real ranking category`);
}

// ── each axis actually selects ──────────────────────────────────────────────
const lead = (id) => { const r = selectFor(id, pools); return r.length ? r[0].name : null; };
const namesOf = (id) => selectFor(id, pools).map((p) => p.name);

eq(lead("beach"), "Siesta Key Beach", "beach leads with the top beach");
eq(lead("tonight"), "The Mable Bar & Grill", "tonight leads with the top-scoring nightlife room");
eq(lead("events"), "Van Wezel Hall", "events leads with a ticketed venue, not a museum");
eq(lead("break"), "Quick Bagel Co", "the 30-minute break leads with counter service");
// Gems still ranks by score WITHIN the axis — the filter decides membership,
// never order. Nonna (4.7 / 320) outscores Hidden Deli (4.8 / 90) and leads.
eq(lead("gems"), "Nonna Trattoria", "gems ranks by score inside its own axis");
ok(!namesOf("gems").includes("Ca d Zan"), "the 1,200-review anchor is not a hidden gem");
ok(selectFor("gems", pools).every((p) => p.rating >= 4.6 && p.reviews >= 40 && p.reviews <= 600),
  "every gem really is over 4.6 and under 600 reviews");
eq(lead("datenight"), "Beach House Waterfront", "date night leads on the room, not the counter");
// Assert the invariant, not the name: a fixture row called "Far Beach" proves
// nothing about the predicate.
ok(selectFor("drive", pools).every((p) => p.distMi >= 12), "worth-the-drive only carries places 12+ miles out");
ok(selectFor("break", pools).every((p) => p.distMi <= 8), "the 30-minute break stays inside its time budget");
ok(namesOf("break").every((n) => !/Beach House|Owen Bistro/.test(n)), "no sit-down room in a 30-minute break");
ok(!namesOf("events").includes("Ca d Zan"), "a museum is not an event");
ok(!namesOf("events").includes("The Mable Bar & Grill"), "a bar open every night is not a dated, ticketed event");
ok(namesOf("tonight").includes("The Mable Bar & Grill"), "...but it is absolutely a move for tonight");
ok(!namesOf("datenight").includes("Corner Taco"), "a taco counter is not date night");
ok(namesOf("family").includes("Big Cat Habitat"), "family finds the zoo");
ok(!namesOf("family").includes("Bamboo Island Bar"), "family never reaches nightlife");
ok(namesOf("best").includes("Siesta Key Beach") && namesOf("best").includes("Beach House Waterfront"),
  "the best-around-you rail really does see every pool");
eq(selectFor("trending", pools).length, 0, "nothing is trending in the fixture, so the rail is empty — not padded");

// spread: a DAY, not eight of one thing
{
  const cats = selectFor("today", pools).slice(0, 4).map((p) => p.types[0]);
  ok(new Set(cats).size >= 2, `today spreads across categories (got ${JSON.stringify(cats)})`);
}

// ── the fill rules ──────────────────────────────────────────────────────────
const { places, thin } = fillRails(pools);
ok(thin.includes("trending"), "a rail that cannot fill honestly is reported thin");
for (const id of thin) eq(places[id].length, 0, `${id}: thin means EMPTY, never padded`);
for (const [id, rows] of Object.entries(places)) {
  ok(rows.length === 0 || rows.length >= MIN_CARDS, `${id}: at least MIN_CARDS or none`);
  ok(rows.length <= MAX_CARDS, `${id}: never more than MAX_CARDS`);
  eq(rows.length - new Set(rows.map((p) => p.id)).size, 0, `${id}: no place twice in one rail`);
}
// THE headline assertion.
{
  const leads = Object.entries(places).filter(([, r]) => r.length).map(([id, r]) => [id, r[0].id]);
  const byPlace = {};
  for (const [rail, pid] of leads) (byPlace[pid] ||= []).push(rail);
  const shared = Object.entries(byPlace).filter(([, v]) => v.length > 1);
  ok(shared.length === 0, `no place leads two rails (shared: ${JSON.stringify(shared)})`);
  // Pinned, not a floor: an 18-row fixture is thin on purpose, and naming the
  // exact set means a selector that silently stops matching shows up here as a
  // named rail rather than a count that still clears a bar.
  eq(leads.map(([id]) => id).sort().join(","),
    "beach,best,break,datenight,drive,eat,events,family,gems,season,today,tonight",
    "exactly the rails this fixture can fill honestly, and no others");
  // locals needs a real creator video and trending needs real demand data.
  // Neither can be faked into a fixture, and neither may be faked onto a page.
  eq(thin.sort().join(","), "locals,trending",
    "and exactly these cannot — each for its own stated reason");
}
// Determinism: same pools in, same lists out. The route is ISR-cached, so a
// selector that depended on iteration order would produce a different homepage
// per regeneration and nothing would ever reproduce a report.
{
  const again = fillRails(pools);
  eq(JSON.stringify(again.places), JSON.stringify(places), "fillRails is deterministic");
}
// A rail must not crash on a junk row — a live pool carries nulls and rows
// with no types the day an upstream field mask changes.
{
  const junk = { "things-to-do": [null, {}, { id: "x" }, ...pools["things-to-do"]], restaurants: [], beaches: [], nightlife: [] };
  let threw = null;
  try { fillRails(junk); } catch (e) { threw = e; }
  ok(!threw, `fillRails survives null / typeless rows (${threw && threw.message})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
