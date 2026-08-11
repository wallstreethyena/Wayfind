// scripts/check-quick-bite-identity.mjs — the 30-Minute Break keeps its
// promise BY IDENTITY, asserted on the call.
//
// Born 2026-08-11, same day as the list: the first shipped version relied on
// query phrasing and converged with Actually Worth Eating (owner caught it in
// hours). This guard executes the classifier and the composition gate against
// known place shapes, so the convergence cannot quietly return.

import { readFileSync } from "node:fs";

let failures = 0;
const ok = (cond, m) => { if (cond) console.log("  ok:", m); else { failures++; console.error("  FAIL:", m); } };

const { isQuickService } = await import("../lib/quickService.js");
const { sectionAllowed, INTENT_PAGES } = await import("../lib/intentPages.js");

// ── 1. the classifier, executed — positive AND negative controls ────────────
const CASES = [
  // [row, expected, why]
  [{ name: "Chipotle Mexican Grill", types: ["mexican_restaurant", "fast_food_restaurant", "restaurant"] }, true, "fast_food type admits (and 'Grill' in a name grants nothing)"],
  [{ name: "Five Guys", types: ["hamburger_restaurant", "fast_food_restaurant"] }, true, "counter burger admits on TYPE, never on the word burger"],
  [{ name: "Starbucks", types: ["coffee_shop", "cafe"] }, true, "cafe/coffee counter admits"],
  [{ name: "Joe's Pizzeria", types: ["pizza_restaurant", "restaurant"] }, true, "name evidence: pizzeria"],
  [{ name: "Maria's Taqueria", types: ["mexican_restaurant"] }, true, "name evidence: taqueria"],
  [{ name: "Aloha Poke Bowls", types: ["restaurant"] }, true, "name evidence: poke/bowls"],
  [{ name: "Olive Garden Italian Restaurant", types: ["italian_restaurant", "restaurant"] }, false, "THE SEPARATOR: a good sit-down restaurant with no quick evidence is refused"],
  [{ name: "Red Robin Gourmet Burgers", types: ["hamburger_restaurant", "restaurant"] }, false, "'Burgers' is not evidence — table-service burger chains stay out"],
  [{ name: "Bonefish Grill", types: ["seafood_restaurant", "restaurant"] }, false, "'Grill' is not evidence"],
  [{ name: "Ruth's Chris Steak House", types: ["steak_house", "restaurant"] }, false, "slow-format type vetoes"],
  [{ name: "The Capital Grille", types: ["fine_dining_restaurant", "sandwich_shop"] }, false, "veto is ABSOLUTE: fine dining loses even holding a quick type"],
  [{ name: "Sakura Omakase", types: ["japanese_restaurant"] }, false, "slow-format name vetoes"],
  [{ name: "", types: [] }, false, "nothing in, nothing admitted"],
];
for (const [row, want, why] of CASES) {
  ok(isQuickService(row) === want, `${row.name || "(empty)"} -> ${want}: ${why}`);
}

// ── 2. the composition gate enforces it — asserted through sectionAllowed ───
const compose = INTENT_PAGES["quick-bite"] && INTENT_PAGES["quick-bite"].compose;
ok(!!compose && compose.identity === "quickbite", "quick-bite's compose names the identity (identity: 'quickbite')");
ok(sectionAllowed({ name: "Olive Garden Italian Restaurant", types: ["italian_restaurant", "restaurant"] }, compose) === false,
   "sectionAllowed refuses the sit-down restaurant under the quick-bite compose");
ok(sectionAllowed({ name: "Chipotle Mexican Grill", types: ["mexican_restaurant", "fast_food_restaurant", "restaurant"] }, compose) === true,
   "sectionAllowed admits the counter-serve place under the quick-bite compose (Food section resolves from types)");
// The gate must be the compose's doing, not a global food rule:
ok(sectionAllowed({ name: "Olive Garden Italian Restaurant", types: ["italian_restaurant", "restaurant"] }, { sections: ["Food"] }) === true,
   "control: the same sit-down row IS allowed on a compose without the identity — the refusal above is the identity's doing");

// ── 3. the menu row carries the fast symbol, not a duplicate food icon ──────
const BN = readFileSync("app/components/BestNearby.js", "utf8");
const row = BN.match(/\{ id: "quickbite",[^\n]*\},/);
ok(!!row && /emoji: "⚡"/.test(row[0]), "the 30-Minute Break menu row carries ⚡ (owner: the symbol must say FAST)");
ok(!!row && !/icon: "food"/.test(row[0]), "…and no longer duplicates Actually Worth Eating's food icon");

console.log(failures ? `check-quick-bite-identity: ${failures} FAILURE(S)` : `check-quick-bite-identity: all green — classifier executed on ${CASES.length} controls, composition gate proven to be the identity's doing, ⚡ on the row`);
process.exit(failures ? 1 : 0);
