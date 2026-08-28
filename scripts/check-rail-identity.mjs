#!/usr/bin/env node
/**
 * check-rail-identity — EVERY RAIL MUST SAY WHAT ITS PLACES ARE.
 *
 * THE CLASS OF DEFECT THIS CLOSES. Four separate rail bugs shipped this month
 * and every one of them was the same mistake wearing a different coat:
 *
 *   v8.30.1  "Best Breakfast Picks" served Pizza Haven - NY Style. The rail
 *            asked "does ANY type token say breakfast", not "what IS this".
 *   v8.31    "Beach Day" served tennis courts, a car park and a massage
 *            parlour. The rail asked only "is it within 23 miles".
 *   v8.31.1  "Actually Worth Eating" led with Pomegranate Frozen Yogurt. The
 *            rail asked only "is it summer-sourced" — no identity at all.
 *   v8.31.2  "Tonight's Move" served six bar-and-grills, "Date Night" served a
 *            bagel counter and a Culver's, and "Places You'd Never Find" ranked
 *            Papa Johns seventh. Same absence, three more tiles.
 *
 * The common root cause is NOT that someone wrote a wrong predicate. It is that
 * a rail with NO identity looks exactly like a rail with a correct one: the
 * board is full, the cards are pretty, the Wayfind Score is descending. The
 * governed score measures QUALITY, and a dessert counter with a 4.9 and 600
 * reviews scores wonderfully — so the absence of an identity does not fail, it
 * silently substitutes "what is best" for "what is this". Nothing in the suite
 * could see it, because nothing ever asked.
 *
 * SO THE FIX IS NOT A PREDICATE, IT IS A CONTRACT. Every entry in RAIL_SELECT
 * must now carry an `identity` key:
 *
 *   identity: <fn>              the predicate that answers "is this the kind of
 *                               thing this rail is about". Enforced in
 *                               selectFor() BEFORE the pick, so it is the gate
 *                               and not documentation.
 *   identity: null + waiver:""  a WRITTEN reason that cross-category is the
 *                               promise ("Any category. No paid placement.").
 *
 * A missing key fails this guard. Silence is the bug, so silence is what is now
 * impossible: a new rail cannot ship until someone has answered the question,
 * and answering "it is deliberately any category" is a legitimate answer that
 * has to be defended in prose the next reader can argue with.
 *
 * WHY THE FIXTURES ARE REAL. Every row asserted below was measured from live
 * wf_inventory near Parrish, Sarasota or Lakewood Ranch on 2026-08-22 — the
 * exact rows the live rails were serving. A rewrite is measured against the
 * data, never against an invented shape that happens to suit the new code.
 *
 * AND THE LOAD-BEARING TEST. For every rail that was fixed, this guard also
 * asserts the leak row PASSES that rail's `pick` on its own. That is what makes
 * the identity provably load-bearing rather than decorative: delete it, or fold
 * it back into a pick that does not run it, and the leak returns — and this
 * assertion goes red the moment it does.
 */
import { RAIL_SELECT, selectFor } from "../lib/railSelect.js";
import { RAILS } from "../lib/rails.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };
const fail = (msg) => { asserts++; failures++; console.error("  FAIL: " + msg); };

// ── 1. THE CONTRACT ─────────────────────────────────────────────────────────
const MIN_WAIVER = 80;
for (const rail of RAILS) {
  if (!rail.list) continue;
  const cfg = RAIL_SELECT[rail.id];
  ok(!!cfg, `rail "${rail.id}" is listed in lib/rails.js but has no RAIL_SELECT entry`);
  if (!cfg) continue;
  const declared = Object.prototype.hasOwnProperty.call(cfg, "identity");
  ok(declared,
    `rail "${rail.id}" (${rail.title}) declares no \`identity\`. Every rail must answer what its ` +
    `places ARE: give it an identity predicate, or set identity:null with a written \`waiver\` ` +
    `saying why cross-category is the promise. Four live bugs this month were exactly this silence.`);
  if (!declared) continue;
  const id = cfg.identity;
  ok(id === null || typeof id === "function",
    `rail "${rail.id}" has an \`identity\` that is neither a function nor null`);
  if (id === null) {
    ok(typeof cfg.waiver === "string" && cfg.waiver.trim().length >= MIN_WAIVER,
      `rail "${rail.id}" waives its identity but the \`waiver\` is missing or under ${MIN_WAIVER} ` +
      `characters. A waiver is an argument the next reader has to be able to disagree with.`);
    // Anywhere in the text, not just as the whole of it: a waiver that OPENS
    // "TBD" and then runs on for another hundred characters of leftover prose
    // still passes a length check, which is exactly how a real reason decays
    // into a rubber stamp one edit at a time.
    ok(!/\b(tbd|todo|fixme|xxx|placeholder|for now|temporar(?:y|ily)|revisit later)\b/i.test(String(cfg.waiver || "")),
      `rail "${rail.id}" waiver contains a placeholder word — a waiver is a decision, not a note to self`);
  } else {
    ok(typeof cfg.waiver === "undefined",
      `rail "${rail.id}" has BOTH an identity and a waiver — one of them is a lie`);
  }
}
const WAIVED = Object.entries(RAIL_SELECT).filter(([, c]) => c.identity === null).map(([k]) => k).sort();
ok(WAIVED.join(",") === "best,drive,locals,season,today,trending",
  `the set of rails with NO identity changed to [${WAIVED.join(", ")}]. That is a product decision, ` +
  `not a refactor: update this line deliberately and say why in the waiver.`);

// ── 2. THE MEASURED ROWS ────────────────────────────────────────────────────
// Shape mirrors lib/nearbyPool.js shapeNearbyRow: primaryType is the CLAIM,
// types[] is unordered EVIDENCE (v8.30.1).
const row = (name, primaryType, types, extra) =>
  ({ id: "p_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name, primaryType, types,
     rating: 4.7, reviews: 250, distMi: 3, priceLevel: 2, ...(extra || {}) });

const CASES = [
  // rail, row, expected identity verdict, note
  // ── eat: the meal (v8.31.1) ───────────────────────────────────────────────
  ["eat", row("Pomegranate Frozen Yogurt", "dessert_shop", ["dessert_shop", "confectionery", "food_store", "store"]), false, "led Actually Worth Eating near Parrish"],
  ["eat", row("Ryan's Coffee House", "coffee_shop", ["coffee_shop", "cafe", "food_store", "store"]), false, "3rd on Actually Worth Eating"],
  ["eat", row("Gelateria Degli Angeli", "ice_cream_shop", ["ice_cream_shop", "dessert_shop", "confectionery", "food_store"]), false, "Sarasota"],
  ["eat", row("Gofruit Juice Bar", "juice_shop", ["juice_shop", "acai_shop", "food_store", "store"]), false, "Lakewood Ranch"],
  ["eat", row("Good Liquid Brewing", "brewpub", ["brewpub", "pub", "bar", "restaurant"]), false, "a brewery is not the answer to where to eat"],
  ["eat", row("P J's Sandwich Shop", "sandwich_shop", ["sandwich_shop", "restaurant", "food", "point_of_interest"]), true, "a sandwich IS a meal"],
  ["eat", row("First Watch", "breakfast_restaurant", ["breakfast_restaurant", "brunch_restaurant", "restaurant", "food"]), true, "breakfast IS a meal"],
  ["eat", row("Restaurant iDalia", "italian_restaurant", ["italian_restaurant", "restaurant", "food", "point_of_interest"]), true, "kept"],

  // ── tonight: the nightlife venue (v8.31.2) ───────────────────────────────
  ["tonight", row("Salty Jim's Island Bar & Grill", "bar_and_grill", ["bar_and_grill", "bar", "restaurant", "food"]), false, "a restaurant with a liquor licence"],
  ["tonight", row("Jaxx Wing Co.", "bar_and_grill", ["bar_and_grill", "chicken_wings_restaurant", "family_restaurant", "salad_shop"]), false, "a FAMILY restaurant on Tonight's Move"],
  ["tonight", row("Evie's Tavern & Grill", "bar_and_grill", ["bar_and_grill", "bar", "restaurant", "food"]), false, "Sarasota"],
  ["tonight", row("The Big Tiki Lounge", "bar", ["bar", "point_of_interest", "establishment"]), true, "kept — a bar is its own identity"],
  ["tonight", row("McCurdy's Comedy Theatre", "comedy_club", ["comedy_club", "night_club", "point_of_interest", "establishment"]), true, "kept"],
  ["tonight", row("Oscura", "live_music_venue", ["live_music_venue", "bar", "event_venue", "point_of_interest"]), true, "kept"],
  ["tonight", row("McCabe's Irish Pub", "irish_pub", ["irish_pub", "pub", "live_music_venue", "event_venue"]), true, "kept"],

  // ── datenight: the room (v8.31.2) ────────────────────────────────────────
  ["datenight", row("Jersey Girl Bagels Parrish", "bakery", ["bakery", "food_store", "food", "store"]), false, "a bagel counter on Date Night"],
  ["datenight", row("Culver's", "american_restaurant", ["american_restaurant", "ice_cream_shop", "dessert_restaurant", "hamburger_restaurant"]), false, "counter service"],
  ["datenight", row("Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "restaurant", "food", "point_of_interest"]), false, "closed by the time date night starts"],
  ["datenight", row("The Breakfast Company", "brunch_restaurant", ["brunch_restaurant", "restaurant", "food", "point_of_interest"]), false, "Lakewood Ranch"],
  ["datenight", row("Crumbl", "bakery", ["bakery", "dessert_shop", "food_store", "store"]), false, "a cookie counter"],
  ["datenight", row("Empanadas Valrico", "colombian_restaurant", ["colombian_restaurant", "meal_takeaway", "restaurant", "food"]), false, "takeaway is not a room"],
  ["datenight", row("Fleming's Prime Steakhouse & Wine Bar", "steak_house", ["steak_house", "bar_and_grill", "wine_bar", "fine_dining_restaurant"]), true, "kept"],
  ["datenight", row("Thai Spice & Sushi", "thai_restaurant", ["thai_restaurant", "sushi_restaurant", "japanese_restaurant", "restaurant"]), true, "kept"],
  ["datenight", row("Gulley's", "seafood_restaurant", ["seafood_restaurant", "restaurant", "food", "point_of_interest"]), true, "kept — Parrish must still fill"],

  // ── gems: the independent (v8.31.2) ──────────────────────────────────────
  ["gems", row("Papa Johns Pizza", "pizza_restaurant", ["pizza_restaurant", "restaurant", "food", "point_of_interest"]), false, "ranked 7th on Places You'd Never Find"],
  ["gems", row("7 Brew Coffee", "coffee_shop", ["coffee_shop", "cafe", "food", "store"]), false, "a national drive-thru chain"],
  ["gems", row("Jeremiah's Italian Ice", "ice_cream_shop", ["ice_cream_shop", "dessert_shop", "confectionery", "food_store"]), false, "a chain"],
  ["gems", row("Tropical Smoothie Cafe", "juice_shop", ["juice_shop", "acai_shop", "food_store", "store"]), false, "a chain"],
  ["gems", row("Taqueria Maty", "mexican_restaurant", ["mexican_restaurant", "restaurant", "food", "point_of_interest"]), true, "kept — this is the whole point of the rail"],
  ["gems", row("Vampire Penguin", "dessert_shop", ["dessert_shop", "confectionery", "food_store", "store"]), true, "kept — a local dessert counter genuinely IS a hidden gem"],
  ["gems", row("Restaurant iDalia", "italian_restaurant", ["italian_restaurant", "restaurant", "food", "point_of_interest"]), true, "kept"],
];

for (const [railId, place, want, note] of CASES) {
  const cfg = RAIL_SELECT[railId];
  if (!cfg || typeof cfg.identity !== "function") { fail(`${railId} has no identity function to test`); continue; }
  const got = cfg.identity(place, {}) === true;
  ok(got === want, `${railId}: "${place.name}" (${place.primaryType}) should be ${want ? "KEPT" : "REFUSED"} — ${note}`);
}

// ── 3. THE IDENTITY IS LOAD-BEARING ─────────────────────────────────────────
// Each leak below passes its rail's `pick` on its own. That is the proof the
// identity is the ONLY thing keeping it off the card — delete the identity and
// these rows come straight back.
const LOAD_BEARING = [
  ["eat", row("Pomegranate Frozen Yogurt", "dessert_shop", ["dessert_shop", "confectionery", "food_store", "store"])],
  ["tonight", row("Salty Jim's Island Bar & Grill", "bar_and_grill", ["bar_and_grill", "bar", "restaurant", "food"])],
  ["datenight", row("Jersey Girl Bagels Parrish", "bakery", ["bakery", "food_store", "food", "store"], { priceLevel: 2 })],
  ["gems", row("Papa Johns Pizza", "pizza_restaurant", ["pizza_restaurant", "restaurant", "food", "point_of_interest"], { rating: 4.6, reviews: 300 })],
];
for (const [railId, place] of LOAD_BEARING) {
  const cfg = RAIL_SELECT[railId];
  ok(!cfg.pick || cfg.pick(place, {}) === true,
    `${railId}: "${place.name}" no longer passes the pick, so this guard has stopped proving the ` +
    `identity is what refuses it. Re-measure a row that DOES pass the pick rather than deleting this.`);
  ok(cfg.identity(place, {}) === false, `${railId}: the identity must be what refuses "${place.name}"`);
}

// ── 4. selectFor ACTUALLY RUNS THE IDENTITY ─────────────────────────────────
// A declaration that the selector does not execute is a comment. This proves
// the gate is wired, end to end, through the function the rails actually call.
{
  const leak = row("Pomegranate Frozen Yogurt", "dessert_shop", ["dessert_shop", "confectionery", "food_store", "store"], { rating: 4.9, reviews: 608, city: "Parrish" });
  const real = row("Restaurant iDalia", "italian_restaurant", ["italian_restaurant", "restaurant", "food", "point_of_interest"], { rating: 4.6, reviews: 300, city: "Parrish" });
  const out = selectFor("eat", { restaurants: [leak, real], summer: [] }, {}).map((p) => p.name);
  ok(!out.includes("Pomegranate Frozen Yogurt"), "selectFor('eat') still returned the dessert counter — the identity gate is declared but not executed");
  ok(out.includes("Restaurant iDalia"), "selectFor('eat') dropped a real restaurant");

  const barGrill = row("Salty Jim's Island Bar & Grill", "bar_and_grill", ["bar_and_grill", "bar", "restaurant", "food"], { city: "Sarasota" });
  const lounge = row("The Big Tiki Lounge", "bar", ["bar", "point_of_interest", "establishment"], { city: "Sarasota" });
  const night = selectFor("tonight", { nightlife: [barGrill, lounge], summer: [] }, {}).map((p) => p.name);
  ok(!night.includes("Salty Jim's Island Bar & Grill"), "selectFor('tonight') still returned a bar-and-grill restaurant");
  ok(night.includes("The Big Tiki Lounge"), "selectFor('tonight') dropped a real bar");
}

// ── 5. THE SUMMER REGISTRY STILL RIDES ──────────────────────────────────────
// The identities for beach/family/events/tonight/datenight are DISJUNCTIONS: a
// registry row carries its own tag instead of passing the type test. v8.17's
// bug was the opposite of an absent identity — an identity too loose — so both
// directions are pinned here.
{
  const pier = { id: "pier", name: "Skyway Fishing Pier", primaryType: "park", types: ["park"], rating: 4.6, reviews: 900, distMi: 9, _summerSourced: true, _summerRails: ["tonight"] };
  const park = { id: "park", name: "Emerson Point Preserve", primaryType: "park", types: ["park"], rating: 4.8, reviews: 900, distMi: 9, _summerSourced: true, _summerRails: ["datenight"] };
  ok(RAIL_SELECT.tonight.identity(pier, {}) === true, "a tonight-tagged summer row must still reach Tonight's Move");
  ok(RAIL_SELECT.tonight.identity(park, {}) === false, "a datenight-only summer row must NOT reach Tonight's Move (v8.17)");
  // v8.82 — REVERSED DELIBERATELY, on the owner's report (2026-08-28: the date
  // night card is "horrible for night time, nothing is an actual recommendation
  // I would follow"). This assertion used to pin the OPPOSITE, and it was
  // pinning the defect: a registry tag REPLACED the rail's identity, so the
  // live top four on Date Night were a dolphin-tour boat, a beach 16 miles
  // away, a room, and a nature preserve that locks at dusk — under a tile that
  // says "Quiet enough to talk". A summer tag now chooses WHICH rails a row is
  // eligible for; it can no longer exempt the row from what the rail IS.
  // The row keeps its home on `season`, which every summer row serves.
  ok(RAIL_SELECT.datenight.identity(park, {}) === false, "a datenight-tagged summer PARK does not reach Date Night — a tag qualifies a row, it does not exempt it from the room (v8.82)");
  {
    const room = { id: "room", name: "Sunset Supper Club", primaryType: "restaurant", types: ["restaurant", "food"], rating: 4.7, reviews: 400, distMi: 4, _summerSourced: true, _summerRails: ["datenight"] };
    ok(RAIL_SELECT.datenight.identity(room, {}) === true, "…and a datenight-tagged summer ROOM still does — the gate is BOTH, not neither");
  }
  ok(RAIL_SELECT.datenight.identity(pier, {}) === false, "a tonight-only summer row must NOT reach Date Night");
}

if (failures) {
  console.error(`\ncheck-rail-identity: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-rail-identity: ${asserts} assertions OK — ${CASES.length} measured rows, ${Object.keys(RAIL_SELECT).length} rails each declaring what they are (${WAIVED.length} deliberately cross-category)`);
