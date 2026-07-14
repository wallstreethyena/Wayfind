// scripts/test-classify.mjs — the unified classifier's contract, pinned to REAL
// Google output. Every fixture in data/atlas/fixtures-real-types.json is a
// verbatim production row from wf_inventory, never an assumed type list.
//
// This exists because of a near-miss: the v6.04 taxonomy mapper was almost
// tested against ASSUMED types (an `aquarium` type for Mote, a `beach` type for
// Siesta Beach) that Google does not actually return. A classifier tested on
// guesses passes green while the seeder still mislabels the world.
//
// HALF of these cases are NEGATIVE CONTROLS — real places that must SURVIVE.
// An exclusion rule that is too eager is worse than the junk it removes.

import fs from "node:fs";
import { classify, isExcluded, exclusionReason, EXCLUSION } from "../lib/placeCategory.js";

const F = JSON.parse(fs.readFileSync(new URL("../data/atlas/fixtures-real-types.json", import.meta.url), "utf8"));
let pass = 0, fail = 0;
const failures = [];

const t = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; failures.push(`  ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); }
};
const of = (name) => { const f = F[name]; if (!f) { console.error(`fixture missing: ${name}`); process.exit(1); } return classify(f); };

// ── 1. EXCLUSIONS: junk that is ADMITTED by the live gate today ─────────────
// Cabinetree is a KEPT case, on purpose. It carries general_contractor, and an
// earlier rule excluded it — but that same rule also deleted Hudson's Furniture
// (994 reviews), DICK'S Sporting Goods (291) and Staples (223), because Google
// tags big-box retailers with `manufacturer`/`supplier`/`general_contractor` as
// SECONDARY types. Cabinetree's type signature is INDISTINGUISHABLE from
// Hudson's; only primaryType separates a trade from a shop, and both say
// `furniture_store`. So Cabinetree stays: a showroom you can walk into is a
// weak Shopping result, not junk — and precision beats recall on exclusions.
t("Cabinetree (primaryType=furniture_store) SURVIVES as a shop", isExcluded(F["Cabinetree"]), false);
t("Cabinetree lands in shopping", of("Cabinetree").category, "shopping");
t("Ideal Classic Cars (car_dealer) is excluded", exclusionReason(F["Ideal Classic Cars"]), EXCLUSION.SERVICE);
t("MarineMax (primaryType=supplier, despite a marina type) is excluded", exclusionReason(F["MarineMax Venice"]), EXCLUSION.SERVICE);
t("Bay Indies (mobile_home_park) is excluded as residential", exclusionReason(F["Bay Indies"]), EXCLUSION.RESIDENTIAL);
t("Park Store Go (parking_lot) is excluded as residential/infra", exclusionReason(F["Park Store Go"]), EXCLUSION.RESIDENTIAL);
t("Camelot Lakes Village is excluded as residential", exclusionReason(F["Camelot Lakes Village"]), EXCLUSION.RESIDENTIAL);
t("Vizcaya Lakes is excluded as residential", exclusionReason(F["Vizcaya Lakes"]), EXCLUSION.RESIDENTIAL);
t("scraped rental 'Beautiful 3-bedroom house' is excluded", exclusionReason(F["Beautiful 3-bedroom house in Florida"]), EXCLUSION.RENTAL);
t("scraped rental 'Private Waterfront Cottage' is excluded", exclusionReason(F["Private Waterfront Cottage with pool on 5 Acres Lakewood Ranch Area in Myakka FL - Entire Place"]), EXCLUSION.RENTAL);

// ── 2. NEGATIVE CONTROLS: real places that MUST survive ─────────────────────
// A name-based rental rule wrongly killed all four of these. Types are the truth.
for (const n of ["Island Sun Inn & Suites - Historic Venice & Beach Getaway", "Venice Beach Villas", "A Beach Retreat On Casey Key", "Siesta Heron Suites & Villas"]) {
  t(`REAL hotel survives: ${n.slice(0, 34)}`, isExcluded(F[n]), false);
  t(`REAL hotel is Hotels: ${n.slice(0, 34)}`, of(n).category, "hotels");
}
// The array-order bug: types START wellness_center/spa/gym, but primaryType=hotel.
t("EVEN Hotel (spa/gym listed first) is a HOTEL, not an Activity", of("EVEN Hotel Sarasota-Lakewood Ranch by IHG").category, "hotels");
t("EVEN Hotel resolves via primaryType", of("EVEN Hotel Sarasota-Lakewood Ranch by IHG").via, "primaryType");

// ── 3. MARINAS: on-the-water under Activities, never 'beach' ────────────────
for (const n of ["Venice Yacht Club", "Royal Palm Marina", "Freedom Boat Club - Venice La Guna"]) {
  t(`marina is attractions, not beach: ${n.slice(0, 30)}`, of(n).category, "attractions");
  t(`marina carries the on-the-water tag: ${n.slice(0, 30)}`, of(n).tags.includes("marinas"), true);
  t(`marina survives: ${n.slice(0, 30)}`, isExcluded(F[n]), false);
}
// A tackle SHOP that carries a marina type is a shop, not a marina (primaryType=store).
t("Island Discount Tackle (primaryType=store) is Shopping", of("Island Discount Tackle").category, "shopping");
t("Island Discount Tackle is NOT tagged as a marina", of("Island Discount Tackle").tags.includes("marinas"), false);

// ── 4. GROCERY: Food identity, Markets list, out of 'places to eat' ─────────
for (const n of ["Whole Foods Market", "Detwiler's Farm Market"]) {
  t(`grocery identity is Food: ${n}`, of(n).section, "Food");
  t(`grocery is NOT in the food list: ${n}`, of(n).category, "shopping");
  t(`grocery is tagged markets: ${n}`, of(n).tags.includes("markets"), true);
}

// ── 5. FOOD vs NIGHTLIFE decided per-place by primaryType, not by array order ──
t("Seasons 52 (has wine_bar, primaryType=american_restaurant) is FOOD", of("Seasons 52").category, "food");
t("The End Zone Sports Grille (primaryType=sports_bar) is NIGHTLIFE", of("The End Zone Sports Grille").category, "nightlife");

// ── 6. CAMPGROUNDS: an Activity that ALSO serves Stay Tonight ───────────────
const koa = classify({ types: ["campground", "rv_park", "lodging", "point_of_interest"], primaryType: "campground", name: "Bradenton KOA" });
t("campground is an Activity", koa.category, "attractions");
t("campground ALSO serves the hotels list (secondary)", koa.secondary, ["hotels"]);
t("campground is not excluded as a rental", koa.excluded, false);

// ── 7. LIVE places (no primaryType) must not regress ────────────────────────
// The live Google path never sends primaryType. A thinly-typed live hotel must
// still classify as a hotel and must NOT be caught by the rental rule.
const liveHotel = classify({ types: ["lodging", "point_of_interest", "establishment"], name: "Some Hotel" });
t("live thin lodging is NOT excluded (no primaryType => rule cannot fire)", liveHotel.excluded, false);
t("live thin lodging still classifies as hotels", liveHotel.category, "hotels");
const liveRestaurant = classify({ types: ["italian_restaurant", "restaurant", "food"], name: "Trattoria" });
t("live restaurant classifies via types", liveRestaurant.category, "food");
t("live restaurant via=types", liveRestaurant.via, "types");

// ── 8. the Mote class: honest null, not a guess ─────────────────────────────
const mote = classify({ types: ["research_institute", "point_of_interest", "establishment"], primaryType: "research_institute", name: "Mote Marine Laboratory & Aquarium" });
t("Mote is NOT excluded (it is a real place)", mote.excluded, false);
t("Mote classifies as Activities via its NAME net (aquarium), flagged for review", mote.via, "name");
t("a name-recovered category is flagged via=name so the seeder can gate it", mote.via === "name", true);

// ── 9. tags stay inside the sub-filter vocabulary the read path matches ─────
const VOCAB = new Set(["breakfast", "lunch", "dinner", "quickbites", "dessert", "bars", "clubs", "speakeasy", "karaoke", "outdoors", "museums", "family", "tours", "spa", "landmarks", "arts", "beaches", "marinas", "malls", "markets", "outlets", "boutiques"]);
for (const [name, f] of Object.entries(F)) {
  if (name.startsWith("__")) continue;
  for (const tag of classify(f).tags) t(`tag "${tag}" is a real sub-filter id (${name.slice(0, 24)})`, VOCAB.has(tag), true);
}

console.log(`test-classify: ${pass} passed, ${fail} failed`);
if (fail) { console.error("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log("test-classify: OK — one classifier, pinned to REAL Google types; junk excluded, real places survive");
