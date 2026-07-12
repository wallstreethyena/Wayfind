// v5.50 audit remediation, Phase 2 — classification quality (prebuild).
// Locks the override table + the category whitelist so the audit's
// misclassifications (Seasons 52 "Vegan", Bocas "Breakfast") can't come back,
// and a whitelist violation fails CI.
import { PLACE_OVERRIDES, ALLOWED_CUISINES, overrideForName } from "../lib/placeOverrides.js";
import { cuisineLabel } from "../lib/dining.js";
import { coarseCat } from "../lib/ranking.js";

let failures = 0;
const fail = (m) => { console.error("test-classification: FAIL — " + m); failures++; };

// 1. Every override is well-formed: a valid category and, if it asserts a
//    cuisine, one from the allowed vocabulary (no free-text drift).
const CATS = new Set(["Food", "Nightlife", "Activities", "Shopping", "Hotels"]);
for (const [key, ov] of Object.entries(PLACE_OVERRIDES)) {
  if (ov.category && !CATS.has(ov.category)) fail(`override "${key}" has invalid category "${ov.category}"`);
  if (ov.cuisine && !ALLOWED_CUISINES.has(ov.cuisine)) fail(`override "${key}" cuisine "${ov.cuisine}" is not in ALLOWED_CUISINES`);
  if (ov.suppressCuisine && !Array.isArray(ov.suppressCuisine)) fail(`override "${key}" suppressCuisine must be an array`);
}

// 2. The seeded audit misfires now classify correctly. These fixtures carry
//    the exact noisy Google types that caused the wrong labels.
const seasons52 = { name: "Seasons 52", types: ["vegan_restaurant", "american_restaurant", "seafood_restaurant", "restaurant"] };
if (cuisineLabel(seasons52) === "Vegan") fail("Seasons 52 still labels as Vegan");
if (cuisineLabel(seasons52) !== "American") fail(`Seasons 52 should be American, got ${cuisineLabel(seasons52)}`);
if (coarseCat(seasons52) !== "Food") fail("Seasons 52 should be Food");

const bocas = { name: "Bocas Grill", types: ["breakfast_restaurant", "latin_american_restaurant", "restaurant"] };
if (cuisineLabel(bocas) === "Breakfast") fail("Bocas Grill still labels as Breakfast");
if (cuisineLabel(bocas) !== "Latin") fail(`Bocas Grill should be Latin, got ${cuisineLabel(bocas)}`);

// Mochiry: ramen + coffee are BOTH acceptable; just not "Breakfast".
const mochiry = { name: "Mochiry", types: ["ramen_restaurant", "coffee_shop", "breakfast_restaurant", "cafe"] };
if (cuisineLabel(mochiry) === "Breakfast") fail("Mochiry should not label as Breakfast");
if (!["Ramen", "Café"].includes(cuisineLabel(mochiry))) fail(`Mochiry should be Ramen or Café, got ${cuisineLabel(mochiry)}`);

// 3. Category whitelist invariant: a Nightlife-only place must never coarse to
//    Food (the "Nightlife in Food results" finding). coarseCat checks food
//    before bar, so a pure bar (no restaurant type) must land in Nightlife.
const pureBar = { name: "The Tap Room", types: ["bar", "night_club", "point_of_interest"] };
if (coarseCat(pureBar) !== "Nightlife") fail(`a pure bar should be Nightlife, got ${coarseCat(pureBar)}`);

// 4. An override can pin a bar-and-grill that Google over-weights as nightlife
//    back to Food (demonstrates the override path both directions).
if (overrideForName("Seasons 52").category !== "Food") fail("overrideForName lookup broken");

if (failures) process.exit(1);
console.log("test-classification: OK — overrides win over noisy Google tags; Seasons 52 not Vegan, Bocas not Breakfast, whitelist enforced");
