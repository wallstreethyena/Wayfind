// scripts/check-candidate-pools.mjs — v7.23
//
// THE PRINCIPLE (owner, 2026-08-12): "the category is not the result; it is the
// rule set that decides what kinds of places are allowed to compete." A rail
// must fetch a real pool and THEN choose, rather than showing the only twelve
// rows it happened to find.
//
// Measured before this shipped, at 17 miles of Parrish:
//   · "Actually Worth Eating" read 18 rows from a pool of 60 — and exactly ONE
//     of those 18 was a breakfast place, at 10:30 in the morning.
//   · "Places You'd Never Find" ran 2 of its 5 queries; "Tonight's Move" 2 of 4.
//     The ladder that spends the rest only fired on a result under THREE rows,
//     so a rail that scraped together five never deepened.
//   · "The Best Around You" fanned out across 3 categories.
//
// This guard executes the composition rules and pins the pool constants, so a
// future "let's trim the limit" cannot quietly restore the shelf.
import { readFileSync } from "fs";
import path from "path";
import { mealCompose, daypartCompose } from "../lib/todaysBest.js";
import { nowContext, mealForHour } from "../lib/nowContext.js";

let pass = 0;
const fail = (m) => { console.error("check-candidate-pools: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

// ── 1. The meal window is one derivation, shared ───────────────────────────
{
  ok(nowContext({ hour: 8 }).meal === "breakfast", "nowContext carries the meal window at 8am");
  ok(nowContext({ hour: 12.5 }).meal === "lunch", "…and at lunch");
  ok(nowContext({ hour: 19 }).meal === "dinner", "…and at dinner");
  ok(nowContext({ hour: 23 }).meal === "late-night", "…and late");
  ok(nowContext({ hour: 8 }).meal === mealForHour(8),
    "…and it is mealForHour, not a second private clock — check-one-clock's whole point");
}

// ── 2. mealCompose caps the contradicting types, and only those ─────────────
// These are the real primary_types and the real order wf_best_picks returned
// for Parrish at p_local_hour=10, top to bottom.
{
  const R = (name, primary_type) => ({ name, primary_type, category: "food" });
  const morningPool = [
    R("American Honey Creamery", "ice_cream_shop"),
    R("Cracker Barrel", "american_restaurant"),
    R("PIER 22", "american_restaurant"),
    R("Chick-fil-A", "fast_food_restaurant"),
    R("Rocco's Tacos & Tequila Bar", "mexican_restaurant"),
    R("Riverhouse Waterfront", "restaurant"),
    R("Keke's Breakfast Cafe", "breakfast_restaurant"),
    R("GROVE", "american_restaurant"),
    R("Golden Corral", "buffet_restaurant"),
    R("Louie Beans Coffee Co", "coffee_shop"),
    R("Southside Coffee Brew Bar", "coffee_shop"),
    R("P J's Sandwich Shop", "sandwich_shop"),
  ];
  const out = mealCompose(morningPool, { meal: "breakfast" }).map((r) => r.name);

  ok(!out.includes("Golden Corral"),
    "a BUFFET holds no breakfast seat — max 0, the identity contradicts the meal");
  ok(out.includes("Rocco's Tacos & Tequila Bar"),
    "…but a mexican_restaurant is only tier-2 capped, not banned: plenty serve a real breakfast, and the type alone cannot tell us which");
  ok(mealCompose([
    R("Bar A", "bar"), R("Steak", "steak_house"), R("Wine", "wine_bar"),
    R("Cafe", "coffee_shop"), R("Keke's", "breakfast_restaurant"), R("Bagels", "bagel_shop"),
  ], { meal: "breakfast" }).map((r) => r.name).join() === "Cafe,Keke's,Bagels",
    "…and a bar, a steakhouse and a wine bar all hold zero breakfast seats");
  ok(mealCompose([
    R("Mex A", "mexican_restaurant"), R("Mex B", "mexican_restaurant"), R("Mex C", "mexican_restaurant"),
    R("Cafe", "coffee_shop"), R("Keke's", "breakfast_restaurant"),
  ], { meal: "breakfast" }).map((r) => r.name).join() === "Mex A,Mex B,Cafe,Keke's",
    "…and the tier-2 cap is what stops one leaning cuisine from filling a breakfast row");
  ok(out.includes("Keke's Breakfast Cafe") && out.includes("Louie Beans Coffee Co") && out.includes("Southside Coffee Brew Bar"),
    "…and the breakfast and coffee rows that were already in the pool still reach the rail");
  ok(out.includes("American Honey Creamery") && out.includes("Chick-fil-A") && out.includes("Cracker Barrel"),
    "…while uncapped types are untouched — Cracker Barrel is a genuine breakfast institution and capping american_restaurant would have been a claim the data cannot support");

  // THE LAW: selection only. Relative order must be identical to the input.
  const idx = out.map((n) => morningPool.findIndex((r) => r.name === n));
  ok(idx.every((v, i) => i === 0 || idx[i - 1] < v),
    "mealCompose NEVER re-sorts — what survives is still in governed-score order, so shown == sorted holds");

  // Fail-soft: a market with nothing but dinner rooms keeps its list.
  const allDinner = [R("A", "steak_house"), R("B", "steak_house"), R("C", "fine_dining_restaurant"), R("D", "steak_house")];
  ok(mealCompose(allDinner, { meal: "breakfast" }).length === 4,
    "a market with only dinner rooms at 8am gets its honest list back, not an empty rail");

  // An unknown type is never capped.
  const unknown = [R("A", null), R("B", ""), R("C", "some_new_google_type")];
  ok(mealCompose(unknown, { meal: "breakfast" }).length === 3,
    "an unrecognised primary_type is never capped — absence of evidence is not evidence of a bad fit");

  // Dinner is the mirror image.
  const dinnerOut = mealCompose([
    R("Coffee A", "coffee_shop"), R("Coffee B", "coffee_shop"), R("Coffee C", "coffee_shop"),
    R("Bagels", "bagel_shop"), R("Keke's", "breakfast_restaurant"), R("Steak", "steak_house"),
  ], { meal: "dinner" }).map((r) => r.name);
  ok(!dinnerOut.includes("Coffee C"), "at DINNER the caps invert — a third coffee shop takes no dinner seat");
  ok(!dinnerOut.includes("Keke's"), "…and only one breakfast room may hold one");
  ok(dinnerOut.includes("Steak"), "…while the steakhouse is welcome");

  // No ctx / no meal = untouched, so every existing caller is unchanged.
  ok(mealCompose(morningPool, null).length === morningPool.length, "no ctx leaves the list alone");
  ok(mealCompose(morningPool, { timeBucket: "morning" }).length === morningPool.length,
    "…and so does a ctx with no meal window");
}

// ── 3. mealCompose is applied to the FOOD rail and nowhere else ────────────
{
  const bn = read("app/components/BestNearby.js");
  ok(/mealCompose/.test(bn), "BestNearby imports and uses mealCompose");
  ok(/id === "eat" \? mealCompose\(composed, n\) : composed/.test(bn),
    "…on the eat rail ONLY — the daypart quota already owns the mixed-category rails, and two composers on one list would fight");
  ok(/daypartCompose\(gateOutdoor\(data, n\), n\)/.test(bn),
    "…and it runs AFTER the weather gate and the daypart quota, never instead of them");
}

// ── 4. The pools are actually wider ────────────────────────────────────────
{
  const bn = read("app/components/BestNearby.js");
  const cats = (bn.match(/const TOP40_CATEGORIES = \[(.*?)\]/) || [])[1] || "";
  ok(/"beach"/.test(cats),
    "The Best Around You competes beaches — safe only because v7.22 taught the gate to see one");
  ok(/"food"/.test(cats) && /"attractions"/.test(cats) && /"nightlife"/.test(cats),
    "…without dropping the three it already had");
  ok(!/"shopping"/.test(cats),
    "…and shopping stays OUT: that removal was an owner call after a beauty salon took #1");
  ok(!/"hotels"/.test(cats), "…as do hotels — a trip decision, not a 'near me right now' pick");

  const per = Number((bn.match(/const TOP40_PER_CATEGORY = (\d+)/) || [])[1]);
  ok(per >= 16, "each category is read deep enough to survive the filters that follow (got " + per + ")");

  ok(/category: "food", limit: 40/.test(bn), "the eat rail reads 40 rows, not 18");
  ok(/fetchThingsToDo\(\{ \.\.\.baseArgs\(\), limit: 40/.test(bn), "…and so does the things-to-do rail");

  const tb = read("lib/todaysBest.js");
  ok(/if \(pool\.length < 3 && category !== "beach"\)/.test(tb),
    "adding beach to the fan-out does NOT buy a metered Google search in inland markets — owned inventory is authoritative for beaches, and beachesWithin already vets the distance");
}

// ── 5. The intent rails spend their whole bank ─────────────────────────────
{
  const rail = read("app/components/IntentRail.js");
  ok(/THE DEEPENING PASS/.test(rail), "IntentRail has a deepening pass");
  ok(/if \(whole\.length > first\.length && ranked\.length >= 3\)/.test(rail),
    "…which fires when the bank has unspent queries — NOT only when the result was under three rows, which is the ladder that let 2-of-5 ship");
  ok(/POOL\.set\(key, ranked\);\s*\n\s*setRows\(ranked\);/.test(rail),
    "…AFTER the rail has already rendered, so first paint is not delayed by the wider fetch");
  ok(/deeper\.length > ranked\.length && POOL\.get\(key\) === ranked/.test(rail),
    "…it may only ever ADD choice, and it refuses to write over a list the reader has already moved on from");
  ok(/withMarquee\(await sweep\(near, whole, def\.floor\)\)/.test(rail),
    "…and it re-applies the marquee lane, or deepening worth-the-drive would silently delete Disney Springs and the parks");
}

// ── 6. The daypart quota still holds after all of it ───────────────────────
{
  const rows = [
    { name: "Bar A", category: "nightlife" },
    { name: "Cafe A", category: "food" },
    { name: "Park A", category: "attractions" },
    { name: "Cafe B", category: "food" },
  ];
  const morning = daypartCompose(rows, { timeBucket: "morning" }).map((r) => r.name);
  ok(!morning.includes("Bar A"), "bars still take no morning seat — the v7.22/v7.23 work did not weaken the quota");
}

console.log("check-candidate-pools: " + pass + " assertions green");
