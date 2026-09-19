// scripts/test-menu-taxonomy-audit.mjs — locks the four defect classes found
// by the 2026-09-02 menu taxonomy audit (owner: "there's a lot of places that
// don't belong in a menu now"). Fixtures below are REAL wf_inventory rows
// (name/types/primary_type pulled live from Supabase), not invented shapes.
//
//   A. CAT_ALLOW.family's bare "activity" token substring-matched the type
//      `sports_activity_location`, which every CrossFit/yoga/Pilates studio
//      carries — none of them are a family activity.
//   B. crossVeto() had NO rule for categoryId "attractions" at all, unlike
//      every other category. A Food/Nightlife/Hotels/Shopping-identity place
//      could ride a NAME coincidence (a street's "Beach" suffix, a hotel's
//      "Historic District" marketing copy) into Activities sub-chips. Spa is
//      a deliberate exception (scripts/guards.txt, 2026-08-22 med-spa
//      incident) — Hotels rides the veto for subId "spa" only.
//   C. Active houses of worship (church/place_of_worship/mosque/synagogue/
//      hindu_temple/buddhist_temple) always carry `tourist_attraction` as a
//      secondary Google type, which cleared attractions:all / family:all on
//      a positive type match. Gated on PRIMARY type only (not a CAT_EXCLUDE
//      types-string entry) because real landmarks/gardens (Thanks-Giving
//      Square) carry "church" as a genuine SECONDARY type and must still pass.
//   D. lib/placeCategory.js's sectionFromPrimary() Food branch never named
//      acai_shop/pastry_shop/salad_shop/kebab_shop/noodle_shop, so those
//      primaryTypes fell through into the generic "*_shop"-suffix Shopping
//      branch. 67 live rows affected — see
//      scripts/data/menu-taxonomy-repair-2026-09-02.sql for the data repair.
import { placeAllowed } from "../lib/placeFilter.js";
import { classify } from "../lib/placeCategory.js";

let pass = 0;
const fail = (m) => { console.error("test-menu-taxonomy-audit: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const mk = (name, types, primary_type) => ({ name, types, primary_type, primaryType: primary_type });

// ── A: sports_activity_location is not a family "activity" ─────────────────
ok(placeAllowed("family", "all", mk("Crossfit Yellow Falcon", ["sports_activity_location", "gym"], "sports_activity_location")) === false,
  "A: Crossfit Yellow Falcon is not a Family result");
ok(placeAllowed("family", "all", mk("YogaSix", ["yoga_studio", "sports_activity_location"], "yoga_studio")) === false,
  "A: YogaSix is not a Family result");
ok(placeAllowed("family", "all", mk("Miami Pilates Company", ["pilates_studio", "sports_activity_location"], "pilates_studio")) === false,
  "A: Miami Pilates Company is not a Family result");
// control: a real family entertainment center is untouched
ok(placeAllowed("family", "all", mk("Sky Zone Trampoline Park", ["amusement_center"], "amusement_center")) === true,
  "A control: a real trampoline park is still a Family result");

// ── B: crossVeto — Food/Hotels identity must not leak into Activities on a NAME hit ──
ok(placeAllowed("attractions", "outdoors", mk("Limoncello Miami beach", ["italian_restaurant", "restaurant", "food"], "italian_restaurant")) === false,
  "B: an Italian restaurant does not clear attractions:outdoors on its street-suffix name");
ok(placeAllowed("attractions", "museums", mk("Hampton Inn & Suites Downtown Historic District", ["hotel", "lodging"], "hotel")) === false,
  "B: a hotel does not clear attractions:museums on its own marketing name");
// control: the deliberate spa carve-out (resort spa still browsable under Activities > Spa)
ok(placeAllowed("attractions", "spa", mk("The Ritz-Carlton Spa", ["spa", "hotel", "lodging"], "spa")) === true,
  "B control: a resort spa still clears attractions:spa (deliberate 2026-08-22 carve-out)");
// control: identity-protected zoo/marina cases from test-classifier-veto stay intact
ok(placeAllowed("attractions", "all", mk("City Zoo", ["zoo", "veterinary_care"], "zoo")) === true,
  "B control: a zoo carrying veterinary_care is still an attraction");

// ── C: active houses of worship must not clear Activities / Family ─────────
ok(placeAllowed("attractions", "all", mk("Basilica of the National Shrine of Mary, Queen of the Universe",
  ["tourist_attraction", "church", "place_of_worship"], "church")) === false,
  "C: the Basilica does not clear attractions:all on its tourist_attraction secondary type");
ok(placeAllowed("family", "all", mk("Our Lady of Guadalupe Catholic Church",
  ["tourist_attraction", "church", "place_of_worship"], "church")) === false,
  "C: Our Lady of Guadalupe does not clear family:all");
ok(placeAllowed("attractions", "all", mk("Hindu Temple of Florida",
  ["hindu_temple", "tourist_attraction", "place_of_worship"], "hindu_temple")) === false,
  "C: Hindu Temple of Florida does not clear attractions:all");
// control: a real landmark/garden carrying "church" only as a SECONDARY type still passes
ok(placeAllowed("attractions", "landmarks", mk("Thanks-Giving Square",
  ["tourist_attraction", "historical_landmark", "garden", "historical_place", "church", "place_of_worship"], "tourist_attraction")) === true,
  "C control: Thanks-Giving Square (garden, secondary church type) still clears attractions:landmarks");

// ── D: acai/pastry/salad/kebab/noodle shop classify as Food, not Shopping ──
for (const [pt, name] of [
  ["acai_shop", "Oakberry Acai"],
  ["pastry_shop", "Le Macaron French Pastries"],
  ["salad_shop", "Crisp & Green"],
  ["kebab_shop", "King Kabab"],
  ["noodle_shop", "Token Ramen"],
]) {
  const c = classify(mk(name, [pt, "point_of_interest", "establishment"], pt));
  ok(c && c.section === "Food", `D: ${pt} ("${name}") classifies as Food, not Shopping (got ${c && c.section})`);
}

// ── E: broad category identity must beat incidental tags / name words ───────
// Real wf_inventory shapes from data/atlas/fixtures-real-types.json.
ok(placeAllowed("food", "all", mk("Island Discount Tackle",
  ["fishing_charter", "marina", "sporting_goods_store", "store"], "store")) === false,
  "E: a tackle store does not become a restaurant because fishing contains the loose food token fish");
ok(placeAllowed("food", "all", mk("Royal Palm Marina",
  ["marina", "bar_and_grill", "bar", "restaurant", "food"], "marina")) === false,
  "E: a marina does not become a restaurant because it has an incidental grill");
ok(placeAllowed("family", "all", mk("Island Sun Inn & Suites - Historic Venice & Beach Getaway",
  ["hotel", "lodging"], "hotel")) === false,
  "E: a hotel does not become a Family activity because Beach appears in its name");
ok(placeAllowed("family", "all", mk("Venice Beach Villas",
  ["hotel", "lodging"], "hotel")) === false,
  "E: beach-named lodging stays out of the Family activity category");
ok(placeAllowed("nightlife", "all", mk("Seasons 52",
  ["steak_house", "wine_bar", "vegan_restaurant", "vegetarian_restaurant", "fine_dining_restaurant", "seafood_restaurant", "bar", "american_restaurant", "restaurant"], "american_restaurant")) === false,
  "E: a dining-first restaurant with a wine-bar amenity is not Night out");

// Positive controls: the new cross-category vetoes must preserve genuine dual
// identities instead of making each broad category mutually exclusive.
ok(placeAllowed("food", "all", mk("The End Zone Sports Grille",
  ["sports_bar", "bar", "restaurant", "food"], "sports_bar")) === true,
  "E control: a sports-bar primary with a kitchen remains Food");
ok(placeAllowed("nightlife", "all", mk("House of Blues",
  ["american_restaurant", "live_music_venue", "event_venue", "bar", "restaurant"], "american_restaurant")) === true,
  "E control: an explicit live-music venue remains Night out even when Google calls it a restaurant");
ok(placeAllowed("family", "all", mk("City Zoo",
  ["zoo", "tourist_attraction"], "zoo")) === true,
  "E control: a real family destination remains admitted");

console.log(`test-menu-taxonomy-audit: OK — ${pass} assertions (family-activity anchor, attractions crossVeto, worship exclude, shop-primaryType food branch, broad-category identity)`);
