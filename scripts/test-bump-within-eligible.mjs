// scripts/test-bump-within-eligible.mjs — ELIGIBILITY FIRST, IDENTITY SECOND,
// RANKING AND BUMPS LAST (owner invariant, 2026-10-02).
//
// A score, an owner bump (the curator pick), a like or a creator boost may
// change the ORDER of places that already belong to a category. None of them
// may make an ineligible place appear. This executes the real pipelines in the
// order production runs them:
//   • client rails (app/components/BreakfastRails.js): useCuratedRows →
//     applyCuratorPicks, THEN splitBreakfastRails (identity), THEN rank;
//   • the Food menu (app/home.js): placeAllowed filter, then applyCuratorPicks
//     on the surviving rows (a map — it can re-stamp, never add);
//   • home rails on the server (lib/railsData.js): applyCuratorPicksServer on
//     the pools, THEN railSelect.selectFor (adult veto + identity + pick).
// For each: an ineligible place with an enormous score AND a bump stays out;
// bumping one eligible place re-orders only eligible places; removing the bump
// restores the original order; membership is identical in all three states.
// The bump is a bounded band (lib/ownerBump.js), so the assertion is "moves
// up", never "jumps to #1"; ties fall to byTopRated (reviews).
import { applyCuratorPicks } from "../lib/curatorPicks.js";
import { applyCuratorPicksServer } from "../lib/curatorPicksServer.js";
import { stampOwnerPick } from "../lib/ownerBump.js";
import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { placeAllowed } from "../lib/placeFilter.js";
import { morningDisplayIdentity } from "../lib/morningIdentity.js";
import { isBreakfastPlace } from "../lib/breakfast.js";
import { isAdultVenue } from "../lib/placeCategory.js";
import { RAIL_SELECT, selectFor } from "../lib/railSelect.js";

let total = 0;
let failed = 0;
const ok = (cond, msg) => { total++; if (!cond) { failed++; console.error("FAIL: " + msg); } };
const snap = (ids) => { const set = new Set(ids); return { ready: true, v: 1, has: (id) => set.has(String(id)), known: () => true }; };
const ids = (rows) => rows.map((p) => p.id);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const place = (id, name, primaryType, types, wfScore, extra = {}) => ({ id, name, primaryType, types, wfScore, rating: 4.5, reviews: 400, distMi: 2, lat: 27.5, lng: -82.4, ...extra });

// ── 0. Stamping is identity-neutral: the bump touches score fields only ─────
{
  const rows = [
    place("fogata", "Fogata Street Tacos Ocoee Fl", "restaurant", ["restaurant", "breakfast_restaurant", "taco_restaurant"], 99),
    place("keke", "Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "cafe"], 60),
    place("hardrock", "Hard Rock Cafe", "restaurant", ["restaurant", "american_restaurant"], 99),
    place("strip", "Mons Venus World Famous Nude Strip Club Tampa", "bar", ["bar", "night_club"], 99),
  ];
  for (const p of rows) {
    const b = stampOwnerPick(p, true);
    ok(b.primaryType === p.primaryType && JSON.stringify(b.types) === JSON.stringify(p.types) && b.name === p.name, `bump leaves ${p.name}'s identity fields untouched`);
    for (const sub of ["breakfast", "cafes", "dessert"]) ok(placeAllowed("food", sub, b) === placeAllowed("food", sub, p), `bump cannot change Food → ${sub} membership for ${p.name}`);
    ok(morningDisplayIdentity(b) === morningDisplayIdentity(p) && isBreakfastPlace(b) === isBreakfastPlace(p) && isAdultVenue(b) === isAdultVenue(p),
      `bump cannot change ${p.name}'s morning identity, rail identity or adult verdict`);
  }
}

// ── 1. Breakfast + Cafés poster rails (curate → split → rank) ───────────────
{
  const base = [
    place("fogata", "Fogata Street Tacos Ocoee Fl", "restaurant", ["restaurant", "breakfast_restaurant", "taco_restaurant"], 99),
    place("robeks", "Robeks Fresh Juice & Smoothies", "juice_shop", ["juice_shop", "acai_shop", "breakfast_restaurant"], 98),
    place("hardrock", "Hard Rock Cafe", "restaurant", ["restaurant", "american_restaurant"], 99),
    place("keke", "Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "cafe"], 90),
    place("eggs", "Eggs Up Grill", "restaurant", ["restaurant", "brunch_restaurant", "breakfast_restaurant"], 85),
    place("dennys", "Denny's Restaurant", "restaurant", ["restaurant", "breakfast_restaurant", "diner", "american_restaurant"], 70),
    place("buddy", "Buddy Brew Coffee", "coffee_shop", ["coffee_shop", "cafe"], 92),
    // (2026-10-07: a cuisine-primary restaurant is no longer a café; Arte Caffè is modelled as the café it is.)
    place("arte", "Arte Caffè", "cafe", ["cafe", "bakery"], 80),
    // 2026-10-07 owner ask: cafés are coffee shops only; MERCI CAFÉ's production primary is `cafe`.
    place("merci", "MERCI CAFÉ", "cafe", ["cafe", "coffee_shop", "coffee_stand"], 66),
  ];
  const run = (pickIds) => splitBreakfastRails(applyCuratorPicks(base.map((p) => ({ ...p })), snap(pickIds)));
  const [bk0, cf0] = run([]);
  const [bkB, cfB] = run(["fogata", "robeks", "hardrock", "dennys", "merci"]); // bump ineligible AND eligible tail rows
  const [bk1, cf1] = run([]); // bump removed
  const bad = new Set(["fogata", "robeks", "hardrock"]);
  for (const [label, rail] of [["Best Breakfast", bk0], ["Best Breakfast (bumped)", bkB], ["Best Cafés", cf0], ["Best Cafés (bumped)", cfB]]) {
    ok(!rail.places.some((p) => bad.has(p.id)), `${label}: no ineligible place appears, even with a bump and a 99 score (got ${ids(rail.places).join(",")})`);
  }
  ok(sameSet(ids(bk0.places), ids(bkB.places)) && sameSet(ids(cf0.places), ids(cfB.places)), "Breakfast/Cafés membership is identical with and without bumps");
  ok(ids(bk0.places).at(-1) === "dennys" && ids(bkB.places).indexOf("dennys") < ids(bk0.places).indexOf("dennys"), `bumping Denny's moves it up among eligible breakfast rooms (before ${ids(bk0.places)}, bumped ${ids(bkB.places)})`);
  ok(ids(cf0.places).at(-1) === "merci" && ids(cfB.places).indexOf("merci") < ids(cf0.places).indexOf("merci"), `bumping MERCI CAFÉ moves it up among eligible cafés (before ${ids(cf0.places)}, bumped ${ids(cfB.places)})`);
  ok(JSON.stringify(ids(bk1.places)) === JSON.stringify(ids(bk0.places)) && JSON.stringify(ids(cf1.places)) === JSON.stringify(ids(cf0.places)),
    "removing the bump restores the normal Breakfast and Cafés order exactly");
  // The Food menu runs the same contract: filter, then re-stamp survivors.
  const menu = (sub, pickIds) => applyCuratorPicks(base.filter((p) => placeAllowed("food", sub, p)).map((p) => ({ ...p })), snap(pickIds));
  for (const sub of ["breakfast", "cafes"]) {
    const plain = menu(sub, []);
    const bumped = menu(sub, ["fogata", "robeks", "hardrock", "dennys", "merci"]);
    ok(sameSet(ids(plain), ids(bumped)) && !bumped.some((p) => bad.has(p.id)), `Food → ${sub}: a bump never adds a row; membership unchanged`);
  }
  ok(sameSet(ids(menu("breakfast", [])), ids(bk0.places)) && sameSet(ids(menu("cafes", [])), ids(cf0.places)), "the Food menu and the home Breakfast/Cafés rails agree on membership");
}

// ── 2. Non-food: the Tonight home rail on the server path ───────────────────
{
  const cfg = RAIL_SELECT.tonight;
  const pool = [
    place("strip", "Mons Venus World Famous Nude Strip Club Tampa", "bar", ["bar", "night_club"], 99, { rating: 4.9, reviews: 5000 }),
    place("gents", "Emperors Gentlemen's Club Tampa", "adult_entertainment", ["night_club", "bar"], 99, { rating: 4.9, reviews: 5000 }),
    place("b1", "The Gator Club", "night_club", ["night_club", "bar"], 90, { rating: 4.7, reviews: 900 }),
    place("b2", "Ella's Americana Folk Art Cafe", "bar", ["bar", "live_music_venue"], 80, { rating: 4.6, reviews: 800 }),
    place("b3", "Sandbar Tavern", "bar", ["bar"], 70, { rating: 4.3, reviews: 300 }),
    // Not a night-out venue at all — a coffee shop with a perfect score.
    place("coffee", "Buddy Brew Coffee", "coffee_shop", ["coffee_shop", "cafe"], 99, { rating: 4.9, reviews: 5000 }),
  ];
  const run = (pickIds) => {
    const pools = {};
    for (const c of cfg.pools) pools[c] = applyCuratorPicksServer(pool.map((p) => ({ ...p })), pickIds);
    return selectFor("tonight", pools, {}).map((p) => p.id);
  };
  const plain = run([]);
  const bumped = run(["strip", "gents", "coffee", "b3"]);
  const back = run([]);
  ok(!plain.includes("strip") && !bumped.includes("strip") && !bumped.includes("gents"), `Tonight never serves an adult venue, bumped or not (got ${bumped.join(",")})`);
  ok(!plain.includes("coffee") && !bumped.includes("coffee"), `Tonight never serves a non-nightlife place, even bumped with a 99 score (got ${bumped.join(",")})`);
  ok(plain.length > 0 && sameSet(plain, bumped), `Tonight membership is identical with and without bumps (${plain} vs ${bumped})`);
  ok(bumped.indexOf("b3") < plain.indexOf("b3"), `bumping an eligible bar moves it up on Tonight (${plain} → ${bumped})`);
  ok(JSON.stringify(back) === JSON.stringify(plain), "removing the bump restores Tonight's normal order");
}

console.log(`test-bump-within-eligible: ${total - failed}/${total} passed — bumps re-order eligible places only (Breakfast, Cafés, Food menu, Tonight); ineligible + bumped stays out; unbump restores order`);
if (failed) process.exit(1);
