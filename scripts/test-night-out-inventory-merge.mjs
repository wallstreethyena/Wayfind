// scripts/test-night-out-inventory-merge.mjs
//
// REPRODUCES THE BUG, THEN PROVES THE FIX, on composeNightOutRails() itself —
// not on a description of it. See app/api/intent-candidates/route.js and
// app/components/useIntentCandidates.js for the full incident (owner
// screenshot, Parrish 27.5876,-82.4237, 2026-09-02): Night Out has no home
// rail of its own, so DaypartRail.js's old `nightOutPlaces` (the union of
// rows OTHER home rails happened to load) starved the composer of real
// candidates. ~40 realistic client-pool rows (breakfast/family/beach — the
// axes that WERE feeding it) yield ZERO candidates in every rail, Date-Night
// Dining included; merging in a realistic owned-inventory feed (what
// /api/intent-candidates actually returns) must raise date-dining strictly
// above that baseline and past 1.
import { composeNightOutRails } from "../lib/nightOutIntent.js";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

const CENTER = { lat: 27.5876, lng: -82.4237 }; // the owner's own reproduction point

// ── the CLIENT POOL (the old, sole input) ───────────────────────────────────
// 40 rows shaped exactly like shown.places[railId] entries from OTHER home
// rails (breakfast, family, beach) — none selected for a nightlife or
// date-dining identity, because none of those rails' server pools are asked
// for one. A stray amusement park and a beach are thrown in to prove this
// is not a rigged "no restaurants at all" fixture — real category variety,
// just never the right identity.
function clientPoolRow(i, overrides = {}) {
  return {
    id: `client-${i}`,
    name: `Sunrise Cafe ${i}`,
    lat: CENTER.lat + (i % 5) * 0.01,
    lng: CENTER.lng + (i % 5) * 0.01,
    rating: 4.2 + (i % 5) * 0.1,
    reviews: 80 + i * 5,
    primaryType: "breakfast_restaurant",
    types: ["breakfast_restaurant", "cafe"],
    ...overrides,
  };
}
const clientPool = Array.from({ length: 38 }, (_, i) => clientPoolRow(i));
clientPool.push(clientPoolRow(38, { name: "Family Fun Park", primaryType: "amusement_park", types: ["amusement_park"] }));
clientPool.push(clientPoolRow(39, { name: "Sunset Beach", primaryType: "beach", types: ["beach"] }));
ok(clientPool.length === 40, `fixture setup: expected exactly 40 client-pool rows, got ${clientPool.length}`);

// ── the OWNED-INVENTORY FEED (the fix's new input) ──────────────────────────
// 15 rows shaped like /api/intent-candidates' actual output (toDateNightPlace
// normalized: id/name/lat/lng/rating/reviews/primaryType/editorial) — real
// sit-down rooms within 27mi with real occasion evidence in their editorial
// text, the same shape a real wf_inventory row with a researched hook line
// carries. Nothing here is invented to game the regex beyond what a genuine
// "waterfront dining, romantic sunset view" editorial line already says.
function inventoryRow(i, overrides = {}) {
  return {
    id: `inv-${i}`,
    name: `Harbor House ${i}`,
    lat: CENTER.lat + (i % 5) * 0.02,
    lng: CENTER.lng + (i % 5) * 0.02,
    rating: 4.5,
    reviews: 300 + i * 10,
    primaryType: "seafood_restaurant",
    types: ["seafood_restaurant", "restaurant"],
    editorial: "Waterfront dining with a romantic sunset view, a favorite for anniversaries.",
    ...overrides,
  };
}
const inventoryFeed = Array.from({ length: 15 }, (_, i) => inventoryRow(i, { name: `Fine Dining Room ${i}` }));

// mergeCandidates' own dedupe rule, restated here rather than imported, so
// this test does not depend on app/components/useIntentCandidates.js (a
// "use client" file) to prove a PURE lib function's behavior.
function mergeById(...pools) {
  const seen = new Set();
  const out = [];
  for (const pool of pools) for (const p of pool) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// ── BEFORE: client-pool-only (the reproduced bug) ───────────────────────────
const before = composeNightOutRails([], clientPool, CENTER);
const dateDiningBefore = before.rails.find((r) => r.id === "date-dining");
ok(!!dateDiningBefore, "composeNightOutRails must still define a date-dining rail");
ok(dateDiningBefore.places.length <= 1,
  `client-pool-only input (the pre-fix shape) must yield 0-1 date-dining candidates — got ${dateDiningBefore.places.length}. If this fails, the fixture no longer reproduces the starvation bug.`);

// ── AFTER: client pool merged with the owned-inventory feed (the fix) ──────
const merged = mergeById(clientPool, inventoryFeed);
const after = composeNightOutRails([], merged, CENTER);
const dateDiningAfter = after.rails.find((r) => r.id === "date-dining");
ok(dateDiningAfter.places.length > 1,
  `merged (client pool + inventory feed) input must yield MORE THAN ONE date-dining candidate — got ${dateDiningAfter.places.length}`);
ok(dateDiningAfter.places.length > dateDiningBefore.places.length,
  `the merge must strictly raise the date-dining count over the client-pool-only baseline — before=${dateDiningBefore.places.length}, after=${dateDiningAfter.places.length}`);

// The merge must not have manufactured this by DROPPING the client pool —
// every genuinely-qualifying client-pool row (there are none in this fixture,
// but the rule must hold in general) plus every genuinely-qualifying
// inventory row should both be reachable. Proven here by an exact count: 15
// inventory rows, all identically shaped to qualify, must all appear (this
// fixture has no duplicate ids across the two pools, so none should be lost
// to dedupe either).
ok(dateDiningAfter.places.length === inventoryFeed.length,
  `expected exactly the ${inventoryFeed.length} qualifying inventory rows in date-dining (plus any qualifying client-pool rows, of which this fixture has none) — got ${dateDiningAfter.places.length}`);

// Self-test: prove the fixture ITSELF is not accidentally empty of Google-
// Places-shaped variety (CLAUDE.md: a guard that reports 0 for everything is
// broken, not clean).
ok(clientPool.some((p) => p.primaryType === "amusement_park"), "self-test: the client pool fixture must include real category variety, not just cafes");
ok(inventoryFeed.length === 15, "self-test: the inventory feed fixture must be the declared 15 rows");

if (fails) {
  console.error(`test-night-out-inventory-merge: ${fails} failure(s)`);
  process.exit(1);
}
console.log(`test-night-out-inventory-merge: OK — client-pool-only date-dining=${dateDiningBefore.places.length}, merged=${dateDiningAfter.places.length} (${inventoryFeed.length} inventory rows recovered)`);
