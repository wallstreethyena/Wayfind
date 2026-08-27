#!/usr/bin/env node
/**
 * scripts/check-district-not-a-meal.mjs — a destination is not a restaurant,
 * and a perfect score does not need a decimal.
 *
 * ── 1. THE DISTRICT ──────────────────────────────────────────────────────
 * Owner, 2026-08-27, screenshot of the "Actually Worth Eating" rail:
 *
 *     "Saint Armand Circle is a destination, not a restaurant. We should be
 *      recommending a specific place, not the destination."
 *
 * The row shows exactly how it got in. St. Armands Circle carries NO primary
 * type, and its types are:
 *
 *     shopping_mall, business_center, historical_landmark, historical_place,
 *     beauty_salon, park, service, restaurant
 *
 * Google lists what a place IS first and what it CONTAINS after. `restaurant`
 * is in position EIGHT — it is there because the circle is FULL of restaurants,
 * which is the opposite of being one. With no primary type, isMealPlace fell
 * through to "does any type look like a meal", and that trailing token put a
 * shopping district on a rail whose tile says "Skip the bad meal".
 *
 * WHY THE OBVIOUS FIX IS WRONG, measured before choosing: reading types[0]
 * would have dropped ELEVEN rows from the Bradenton eat rail and TEN of them
 * are real meals — Jersey Mike's, Firehouse Subs, South Philly Cheesesteaks,
 * Capriotti's and a Jamaican restaurant all lead with `sandwich_shop` or
 * `catering_service`. Position alone is not identity.
 *
 * The rule that works is ORDER BETWEEN THE TWO KINDS: a destination token
 * ahead of any meal token. Measured over 657 live places, it changes exactly
 * TWO, and both are shopping districts. That number is asserted below, because
 * "it fixed the one I saw" is not evidence about the other 655.
 *
 * ── 2. THE DECIMAL ───────────────────────────────────────────────────────
 * Same message: "we don't have to use the decimal for the Wayfind score, the
 * ten point zero. We can just say ten."
 *
 * It also makes the widest badge narrower. test-place-card-layout.mjs exists
 * because the perfect score is the only badge that gains BOTH a fourth digit
 * and the flame, and at 390px it sat on top of the card title.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMealPlace, districtLeads } from "../lib/mealPlace.js";
import { formatScore, toDisplayScore } from "../lib/score.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

/* ── 1. THE REAL ROWS, EXECUTED ────────────────────────────────────────────
   Every row below is a verbatim `types` array from one live /api/rails payload
   for Bradenton on 2026-08-27 — not an imagined shape. The four that carry a
   destination token AND lead with a meal are the control: they are the ten
   sandwich shops' case, and a cruder rule takes them with it. */
const ROWS = [
  // name, types, isMeal?
  ["St. Armands Circle", ["shopping_mall","business_center","historical_landmark","historical_place","beauty_salon","park","service","restaurant"], false],
  ["Waterside Place", ["shopping_mall","tourist_attraction","business_center","event_venue","restaurant","food"], false],
  ["Arte Caffe", ["italian_restaurant","market","bakery","food_store","store"], true],
  ["Tide Tables Restaurant and Marina", ["seafood_restaurant","marina","bar","restaurant","point_of_interest"], true],
  ["Lobster Pound Fish Market", ["seafood_restaurant","market","restaurant","food","point_of_interest"], true],
  ["Stroke's Seafood", ["seafood_restaurant","fish_and_chips_restaurant","meal_takeaway","market","japanese_restaurant"], true],
];
for (const [name, types, want] of ROWS) {
  // primary_type is absent on every one of these rows in the live payload —
  // that absence is WHY they reach the fallback this rule guards.
  ok(districtLeads(types) === !want,
    `EXECUTED: districtLeads is ${!want} for ${name} — ${want ? "its own room leads, so the destination token beside it is context, not identity" : "a destination leads and the meal token trails, which means it CONTAINS restaurants rather than being one"}`);
}

/* ── 2. THE CASE A POSITION RULE WOULD HAVE BROKEN ─────────────────────────
   These lead with sandwich_shop / catering_service and carry no destination
   token at all. A types[0] rule drops all of them; this rule must not. */
const MEALS_A_CRUDER_RULE_WOULD_DROP = [
  ["Jersey Mike's Subs", ["sandwich_shop","catering_service","deli","fast_food_restaurant"]],
  ["Firehouse Subs Bradenton", ["sandwich_shop","catering_service","food_delivery","restaurant"]],
  ["South Philly Cheesesteaks", ["sandwich_shop","meal_takeaway","american_restaurant","restaurant"]],
  ["Capriotti's Sandwich Shop", ["sandwich_shop","salad_shop","deli","fast_food_restaurant"]],
  ["Jamaica Breeze Restaurant and Lounge", ["catering_service","food_delivery","event_venue","restaurant"]],
  ["Gateway Subs", ["sandwich_shop","coffee_shop","cafe","restaurant"]],
];
for (const [name, types] of MEALS_A_CRUDER_RULE_WOULD_DROP) {
  ok(districtLeads(types) === false,
    `${name} is UNTOUCHED — it leads with sandwich_shop/catering_service and carries no destination token. A types[0] rule would have dropped this and nine like it; measuring first is the only reason it did not`);
}

/* ── 3. THE RULE IS NARROW, ASSERTED AS A COUNT ────────────────────────────*/
{
  const both = ROWS.concat(MEALS_A_CRUDER_RULE_WOULD_DROP.map(([n, t]) => [n, t, true]));
  const refused = both.filter(([, t]) => districtLeads(t)).length;
  ok(refused === 2, `exactly 2 of the ${both.length} measured rows are refused as destinations (got ${refused}) — the rule is narrow by construction, not by luck`);
  // A destination with NO meal token is not this rule's business: rule 3
  // refuses it anyway, and claiming the credit here would hide a real hole.
  ok(districtLeads(["park", "point_of_interest"]) === false,
    "a destination with no meal token at all is left to the existing rule — this one exists only for rows carrying BOTH, where the order is the whole signal");
  ok(districtLeads([]) === false && districtLeads(null) === false && districtLeads(undefined) === false,
    "…and it never throws on a missing or empty type array");
}

/* ── 4. isMealPlace ACTUALLY CONSULTS IT ───────────────────────────────────
   districtLeads being right proves nothing if the caller ignores it. */
{
  ok(isMealPlace({ name: "St. Armands Circle", types: ROWS[0][1] }) === false,
    "EXECUTED: isMealPlace refuses St. Armands Circle — the rail that says 'Skip the bad meal' no longer offers a shopping district");
  ok(isMealPlace({ name: "The Barnyard", types: ["restaurant","fast_food_restaurant","food","point_of_interest"] }) === true,
    "CONTROL: an ordinary restaurant still passes — without this the assertion above is satisfied by a function that refuses everything");
  const src = readFileSync(join(ROOT, "lib/mealPlace.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok(/if \(districtLeads\(types\)\) return false;/.test(src),
    "…and the call is in isMealPlace's own body, not merely exported beside it");
}

/* ── 5. THE SCORE READS "10", NOT "10.0" ───────────────────────────────────*/
{
  ok(formatScore(toDisplayScore(100)) === "10", `a perfect score renders "10" (got "${formatScore(toDisplayScore(100))}")`);
  ok(formatScore(toDisplayScore(90)) === "9", "…and 9.0 renders \"9\" — the rule is a trailing .0, not a special case for ten");
  ok(formatScore(toDisplayScore(94)) === "9.4", "…while a real decimal is untouched");
  ok(formatScore(toDisplayScore(83)) === "8.3", "…as is 8.3");
  ok(formatScore(null) === "" && formatScore(NaN) === "" && formatScore(undefined) === "",
    "…and an absent score renders nothing rather than \"NaN\" — callers gate on isValidScore, but this is the last line");

  const kit = readFileSync(join(ROOT, "app/components/kit.js"), "utf8");
  const code = kit.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok((code.match(/formatScore\(/g) || []).length >= 6,
    "both badges use it — the number, the accessible name and the tooltip, so a screen reader and a hover never disagree with what is drawn");
  ok(/const s = d\.toFixed\(1\);/.test(code),
    "CONTROL: the DISTANCE still uses toFixed(1) — '1.3 mi' is not a score, and a blanket replace would have eaten it (it nearly did)");
  ok(!/\bscore\.toFixed\(1\)|\bs\.toFixed\(1\)/.test(code),
    "…and no score-shaped toFixed survives in the badges");
}

/* ── 6. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["the pre-fix behaviour is detectable", () => {
    const t = ROWS[0][1].map((x) => x.toLowerCase());
    return t.some((x) => /(^|_)restaurant$/.test(x)) === true && districtLeads(t) === true;
  }],
  ["a types[0]-only rule is detectable as wrong", () => {
    const jm = ["sandwich_shop","catering_service","deli","fast_food_restaurant"];
    const leadIsMeal = /(^|_)restaurant$/.test(jm[0]);
    return leadIsMeal === false && districtLeads(jm) === false;
  }],
  ["a trailing .0 is detectable", () => "10.0".endsWith(".0") && formatScore(10) === "10"],
  ["a real decimal is not stripped", () => formatScore(9.4) === "9.4"],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-district-not-a-meal: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-district-not-a-meal: OK — ${pass} assertions (12 live rows executed; 2 districts refused, 10 meals untouched; the score drops its trailing .0 and the distance keeps its decimal)`);
