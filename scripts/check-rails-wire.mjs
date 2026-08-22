#!/usr/bin/env node
/**
 * check-rails-wire — ONE COPY OF EACH PLACE ON THE WIRE.
 *
 * THE MEASUREMENT, production, 2026-08-22, immediately after v8.33 removed
 * every card ceiling. One /api/rails response for Sarasota:
 *
 *   1,885 rows · 1,691 KB raw · 524 KB as Vercel actually served it
 *
 * The rows are not the problem — the owner asked for them and they are all real
 * places that earned a card. The DUPLICATION is: about 450 distinct places sit
 * behind those 1,885 rows, because `eat`, `best`, `today` and `datenight`
 * legitimately share the same restaurants and each rail was shipping a full
 * copy of every one, photo reference and type array included.
 *
 * That is a payload problem, not a product one, and it must be fixed as a
 * payload problem. Trimming rails to make the response smaller would be the
 * ceiling coming back through the back door (scripts/check-no-card-cap.mjs).
 *
 * v=2 sends every place ONCE in `placeIndex` and each rail as a list of ids.
 *
 * WHY IT IS OPT-IN AND NOT A STRAIGHT SHAPE CHANGE. A tab opened before the
 * deploy is still running the old client, which reads `places[railId]` as an
 * array of place objects; hand it ids and every rail renders empty until
 * VersionWatch reloads it. The CDN keys on the query string, so v1 and v2 cache
 * independently and each client keeps getting the shape it understands. This is
 * the difference between a safe rollout and a five-minute outage nobody sees in
 * a test.
 *
 * WHAT THIS PINS:
 *   1. The transform is LOSSLESS and ORDER-PRESERVING. Rehydration must return
 *      byte-identical rail arrays — this is asserted by round-tripping, because
 *      a subtly reordered rail would break shown == sorted invisibly.
 *   2. It actually shrinks: a response with heavy cross-rail sharing must lose
 *      most of its bytes. A "dedupe" that does not dedupe is a comment.
 *   3. v1 still works, untouched, in both directions.
 *   4. The client asks for v=2, or the whole thing is dead code.
 */
import { readFileSync } from "node:fs";
import { dedupeWire } from "../lib/railsWire.js";
import { liveFromRailsResponse } from "../lib/locationHonesty.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// A response shaped like the real one: four rails sharing most of their rows,
// which is exactly what removing the ceiling produced.
const mk = (i) => ({
  id: "p" + i, name: "Place " + i, rating: 4.6, reviews: 400 - i,
  types: ["italian_restaurant", "restaurant", "food", "point_of_interest"],
  primaryType: "italian_restaurant", status: "OPERATIONAL",
  lat: 27.3 + i / 1000, lng: -82.5 - i / 1000, priceLevel: "PRICE_LEVEL_MODERATE",
  photoRef: "places/ChIJ" + String(i).padStart(4, "0") + "/photos/" + "A".repeat(180),
  city: "Sarasota", distMi: 3.2, oh: null, utcOffset: null, trending: false,
  trend_reason: null, governed_score: 99 - i / 10, wfScore: 9.2,
});
const all = Array.from({ length: 240 }, (_, i) => mk(i));
// `scrambled` exists so a reordering bug is VISIBLE. The other rails are in
// descending-review order, which is also what a naive `.sort()` would produce —
// so a rehydration that sorted would round-trip them unchanged and the lossless
// assertion would pass while silently breaking shown == sorted in production.
// Proven: without this rail, adding a `.sort((a,b) => b.reviews - a.reviews)`
// to the rehydration went completely undetected.
const scrambled = [all[7], all[0], all[199], all[42], all[3], all[120], all[1]];
// `repeated` pins the other half: the transform must reproduce a rail row for
// row, INCLUDING a repeat, rather than quietly collapsing it. selectFor already
// dedupes within a rail, so this can only ever be the wire format losing a row.
const repeated = [all[0], all[1], all[0], all[2], all[1]];
const data = {
  places: {
    eat: all.slice(0, 200), best: all, today: all.slice(20, 220),
    datenight: all.slice(0, 150), beach: [], scrambled, repeated,
  },
  thin: ["beach"], region: "gulf", citySlug: "sarasota", cityLabel: "Sarasota",
};

// ── 1. lossless and order-preserving ────────────────────────────────────────
const wired = dedupeWire(data);
const back = liveFromRailsResponse({ covered: true, data: wired });
for (const railId of Object.keys(data.places)) {
  ok(JSON.stringify(back.places[railId]) === JSON.stringify(data.places[railId]),
    `${railId}: rehydration must return the identical array, in the identical order — a silent reorder here breaks shown == sorted`);
}
ok(Object.keys(back.places).length === Object.keys(data.places).length, "every rail survives the round trip");
ok(back.cityLabel === "Sarasota" && back.region === "gulf" && back.citySlug === "sarasota" && back.covered === true,
  "the rest of the payload is untouched by the transform");
ok(JSON.stringify(back.thin) === JSON.stringify(data.thin), "the thin list survives");

// ── 2. it actually shrinks ──────────────────────────────────────────────────
const rawBytes = JSON.stringify({ covered: true, data }).length;
const wireBytes = JSON.stringify({ covered: true, data: wired }).length;
ok(wireBytes < rawBytes / 2,
  `the deduped wire must be less than half the raw payload (${Math.round(rawBytes / 1024)}KB -> ${Math.round(wireBytes / 1024)}KB)`);
ok(Object.keys(wired.placeIndex).length === 240,
  `every distinct place appears exactly once in the index (${Object.keys(wired.placeIndex).length} of 240)`);
ok(wired.places.repeated.length === 5 && back.places.repeated.length === 5,
  "a rail keeps every row it had, repeats included — the index is deduped, the rail is not");
ok(JSON.stringify(back.places.scrambled.map((p) => p.id)) === JSON.stringify(scrambled.map((p) => p.id)),
  "a rail whose order is NOT a natural sort must survive byte-for-byte — this is the assertion that catches a rehydration that reorders");
ok(wired.places.best.every((x) => typeof x === "string"), "a rail on the wire is a list of ids");
ok(wired.places.beach.length === 0, "an empty rail stays empty, not undefined");

// ── 3. v1 still works, in both directions ──────────────────────────────────
const v1 = liveFromRailsResponse({ covered: true, data });
ok(JSON.stringify(v1.places.eat) === JSON.stringify(data.places.eat),
  "a v1 response (an old CDN entry, or a client that did not ask for v=2) passes through untouched");
ok(dedupeWire({ places: null }) && !dedupeWire({ places: null }).placeIndex, "a malformed payload is returned as-is, never thrown on");
ok(liveFromRailsResponse({ covered: false, data: null }).covered !== true, "an uncovered response is still honest-empty");
// A mixed array (a v2 index that lost a row) must drop the hole, not render undefined.
{
  const broken = { ...wired, placeIndex: { ...wired.placeIndex } };
  delete broken.placeIndex.p5;
  const out = liveFromRailsResponse({ covered: true, data: broken });
  ok(out.places.best.every(Boolean) && out.places.best.length === 239,
    "an id with no entry in the index is dropped, never passed on as undefined");
}

// ── 4. the client asks for it ───────────────────────────────────────────────
ok(/[?&]v=2/.test(read("../app/components/DaypartRail.js")),
  "DaypartRail must request v=2, or the deduped wire is dead code and production keeps paying for the duplicates");
ok(/sp\.get\("v"\) === "2"/.test(read("../app/api/rails/route.js")),
  "…and the route must read it");
ok(/placeIndex/.test(read("../lib/locationHonesty.js")),
  "…and exactly one adapter rehydrates it");

if (failures) {
  console.error(`\ncheck-rails-wire: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-rails-wire: ${asserts} assertions OK — lossless round trip, ${Math.round(rawBytes / 1024)}KB -> ${Math.round(wireBytes / 1024)}KB on a 4-rail fixture, v1 untouched`);
