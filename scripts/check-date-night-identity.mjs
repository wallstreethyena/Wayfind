#!/usr/bin/env node
// scripts/check-date-night-identity.mjs — ONE DATE-NIGHT RULE, ON EVERY SURFACE.
//
// v8.82 (owner, 2026-08-28, screenshot of the Date Night sheet led by the
// SUNSHINE SKYWAY BRIDGE wearing a "🌹 Date Night" chip): "a bridge for date
// night is ridiculous."
//
// Three surfaces make the date-night claim. Only one of them had a rule:
//   · the RAIL (lib/railSelect.js)        — had isDateRoom. Correct.
//   · the EXPERIENCE SHEET (app/home.js)  — `rating >= 4.3 && !fast_food`.
//     A quality bar with no identity in it, so a 4.8-rated bridge passed; and
//     two of its own queries went looking for a "scenic sunset spot" and a
//     "botanical garden" in `attractions`, so it was not merely admitting the
//     bridge, it was going out to find it.
//   · the CARD CHIP (app/components/IconicPlaceCard.js) — correctly gated, and
//     never the leak. The chip in the screenshot came from experienceBadges,
//     which UNSHIFTED the open sheet's own key onto every card past both the
//     evidence set and Tags.filterAllowed.
//
// This guard exists so those three can never drift again. Where the rule can
// be executed it is EXECUTED; the two source assertions that remain are
// scoped to a syntactic position and say plainly that they are the weaker
// check, because app/home.js is a 12k-line client component that cannot be
// imported into node.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDateRoom, isRooftopDatePlace, isDateNightStreetEvent, DATENIGHT_NEAR_MI } from "../lib/dateRoom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE RULE, CALLED ─────────────────────────────────────────────────────
// Row 1 is the owner's screenshot, with the primary type wf_inventory really
// carries for it. Every refusal below is a place that would otherwise pass the
// old `rating >= 4.3` filter — each has the rating to clear it.
const CASES = [
  ["Sunshine Skyway Bridge", "bridge", ["bridge", "tourist_attraction", "transportation_service"], 4.8, false,
    "THE SCREENSHOT: a 4.8-rated bridge cleared the old rating-only filter"],
  ["Emerson Point Preserve", "nature_preserve", ["nature_preserve", "park"], 4.8, false, "a preserve that locks at dusk"],
  ["Siesta Beach", "beach", ["beach", "natural_feature"], 4.7, false, "a beach"],
  ["Anna Maria Island Dolphin Tours", "tour_agency", ["tour_agency", "travel_agency"], 4.9, false, "a daytime tour boat"],
  ["Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "restaurant", "food"], 4.4, false, "a real meal in a real room that is shut before date night starts"],
  ["Corner Taco", "fast_food_restaurant", ["fast_food_restaurant", "restaurant", "food"], 4.6, false, "counter service — the whole difference between this and `eat`"],
  ["Paddy Wagon Sports Bar", "sports_bar", ["sports_bar", "bar"], 4.6, false, "a sports bar is Tonight's Move, and the two rails exist because they are different evenings"],
  ["Sofra Kitchen Bar & Bistro", "italian_restaurant", ["italian_restaurant", "restaurant", "food"], 4.8, true, "the room that actually led the rail once the preserve was gone"],
  ["Bern's Steak House", "steak_house", ["steak_house", "restaurant", "food"], 4.7, true, "a steakhouse"],
  ["Vintage Wine Room", "wine_bar", ["wine_bar", "bar"], 4.7, true, "a wine bar — the sheet's own copy promises them, and a wine bar is not a meal place, so the rail's three-part rule alone would have deleted what the tile advertises"],
  ["Bahi Hut Tiki Cocktail Lounge", "cocktail_bar", ["cocktail_bar", "bar"], 4.7, true, "a cocktail lounge"],
];
for (const [name, primaryType, types, rating, want, why] of CASES) {
  const got = isDateRoom({ name, primaryType, types, rating, reviews: 500 });
  ok(got === want, `${want ? "admit" : "refuse"} ${name} (${primaryType}) — ${why}; got ${got}`);
}
// Positive AND negative controls: a rule that answered one way to everything
// would satisfy half of the table above.
ok(CASES.some(([, , , , w]) => w) && CASES.some(([, , , , w]) => !w), "positive control: the table exercises both verdicts");
ok(isDateRoom(null) === false && isDateRoom({}) === false, "total over garbage: null and an empty row are not date rooms");

// ── 2. ONE RULE, NOT THREE COPIES ───────────────────────────────────────────
// The rule may be declared in exactly one place. It moved out of railSelect.js
// (server-only: seasons, creatorBoost, ranking) precisely so a CLIENT surface
// could import it — a second copy would put the sheet straight back to
// disagreeing with the rail.
{
  const files = ["lib/railSelect.js", "app/home.js", "lib/dateRoom.js"];
  let declarations = 0;
  for (const rel of files) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    const decls = src.match(/(?:const|function|export function|export const)\s+isDateRoom\b/g) || [];
    declarations += decls.length;
  }
  ok(declarations === 1, `isDateRoom is DECLARED exactly once across the rail, the sheet and its module (found ${declarations})`);
}

// ── 3. THE TWO SOURCE ASSERTIONS, NAMED AS WEAKER ───────────────────────────
// app/home.js is a client component of ~12k lines that node cannot import, so
// these read source. Both are scoped to a syntactic position rather than a
// substring, and both were red-proved by reverting the fix they guard.
{
  const home = stripComments(readFileSync(join(ROOT, "app/home.js"), "utf8"));

  // (a) the sheet's membership gate calls the shared rule.
  const dn = home.match(/datenight:\s*\{[\s\S]{0,3000}?filter:\s*\(p\)\s*=>([^\n]*)/);
  ok(!!dn, "positive control (weaker check, source): the datenight EXPERIENCE and its filter are still found under their known shape");
  ok(!!dn && /isDateRoom\(p\)/.test(dn[1]),
    `the Date Night sheet gates on isDateRoom — not on a rating alone (got: ${dn ? dn[1].trim().slice(0, 90) : "rule missing"})`);
  ok(!!dn && !/^\s*\(p\.rating \|\| 0\) >= [\d.]+ && !\/fast_food/.test(dn[1]),
    "the old rating-only filter is gone, not merely supplemented");

  // (b) a chip is a claim about the PLACE. The open sheet's key may be
  // PROMOTED to the front of a card's tags, never MINTED onto a card that did
  // not earn it — that unshift walked past both the evidence set and
  // Tags.filterAllowed, the trust layer written for exactly this.
  const sel = home.match(/if \(selectedKey && EXPERIENCES\[selectedKey\][\s\S]{0,90}?\)\s*\{/);
  ok(!!sel, "positive control (weaker check, source): the selectedKey promotion block is still found");
  ok(!!sel && /keys\.indexOf\(selectedKey\) !== -1/.test(sel[0]),
    `the open sheet's key is promoted only when the place EARNED it — never injected (got: ${sel ? sel[0].trim() : "block missing"})`);
}

// ── 4. THE SHEET'S OWN QUERIES MAY NOT GO HUNTING FOR NON-ROOMS ─────────────
// A correct filter over a query that searches `attractions` for scenic spots
// just burns the query and thins the sheet. Both offending queries were
// re-pointed at `food`, so the "sunset views" the tile promises now resolves
// to a room with a view.
{
  const home = stripComments(readFileSync(join(ROOT, "app/home.js"), "utf8"));
  const block = home.match(/datenight:\s*\{[\s\S]{0,3000}?filter:/);
  ok(!!block, "positive control: the datenight query block is still found");
  ok(!!block && !/cat:\s*"attractions"/.test(block[0]),
    "the Date Night sheet no longer asks `attractions` for anything — that is how it went looking for a scenic sunset spot and found a bridge");
}

ok(DATENIGHT_NEAR_MI === 27, "Date Night's hard radius is 27.0");
ok(isRooftopDatePlace({ name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"] }),
  "a rooftop_bar classifies as a rooftop");
ok(isDateNightStreetEvent({ name: "Night Market Pop-Up", types: ["festival"] }),
  "a pop-up PLACE classifies from existing inventory");
ok(!isDateRoom({ name: "Van Wezel Hall", types: ["performing_arts_theater"] }),
  "a show venue is not a date ROOM — the room rule is unchanged");
{
  const intent = stripComments(readFileSync(join(ROOT, "lib/intentPages.js"), "utf8"));
  const block = intent.match(/"date-night":\s*\{[\s\S]{0,2500}?queries:\s*\(c\)\s*=>/);
  ok(!!block, "positive control: date-night queries still exist as a dead fallback");
  const q = intent.match(/"date-night":\s*\{[\s\S]{0,3500}?titles:/);
  ok(!!q && !/cat:\s*"attractions"/.test(q[0]) && !/scenic sunset spot/.test(q[0]),
    "the /date-night fallback queries no longer hunt attractions / scenic sunset (the Skyway leak)");
}

console.log(`\ncheck-date-night-identity: ${fail ? "FAIL" : "OK"} — ${pass} assertions; ${CASES.length} rows EXECUTED through the room rule, plus rooftop/pop-up classifiers and the Skyway-query lock`);
process.exit(fail ? 1 : 0);
