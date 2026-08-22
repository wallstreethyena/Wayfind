#!/usr/bin/env node
/**
 * check-outing-identity — IS THIS SOMETHING TO GO AND DO?
 *
 * THE DEFECT, measured 2026-08-22 against live inventory, and found by checking
 * production after v8.31.2 shipped rather than by assuming the fix was done.
 * "Places You'd Never Find" near Parrish served, in order:
 *
 *   1. Elite Medical Spa of Parrish     (spa)
 *   2. Ryan's Coffee House              (coffee_shop)
 *   3. Bakers Ranch Wedding Venue       (wedding_venue)
 *   4. MassageLuXe Parrish              (massage_spa)
 *   5. Blue Door Spa Ellenton           (spa)
 *
 * Near Lakewood Ranch, NINE of the `things-to-do` pool's top fifteen were spas,
 * med spas, gyms, yoga studios and a chiropractor. Sarasota's top twenty-six
 * carried seven spas. Every rail that reads that pool — gems, best, today,
 * drive, season, trending, family — was drawing from it.
 *
 * WHY THE POOL IS NOT WRONG TO CONTAIN THEM. lib/placeFilter.js's `attractions`
 * gate admits /\bspa\b|wellness/ deliberately, because /things-to-do has a Spa
 * SUBCATEGORY — a browsable tab, and the right place for a day spa. Nothing
 * about that gate should change; changing it would delete a real section of the
 * site. What was missing is the RAIL-side question, which is different: a
 * homepage discovery rail answers "what should I go and DO near me", and a med
 * spa, a gym, a chiropractor and a wedding venue are not answers to it.
 *
 * The Wayfind Score cannot tell the difference. A med spa with a 4.9 from 300
 * clients scores exactly like a museum with a 4.9 from 300 visitors, because the
 * score measures how well a place is REGARDED and never what KIND of thing it
 * is. Same root cause as every rail identity shipped this month
 * (scripts/check-rail-identity.mjs): asking how good when the question is what.
 *
 * WHAT THIS PINS:
 *   1. The businesses refused, by real name and real primary type.
 *   2. The attractions KEPT — the half that matters more, because a veto that
 *      quietly deletes the Ringling or a fishing charter would make a discovery
 *      product emptier, not better. A rural market's outings are charters,
 *      state parks and a working farm, and all of them survive.
 *   3. It is a VETO, not an allowlist. An unusual local attraction with an odd
 *      primary type must still get through — that is what the product is for.
 *   4. The pool wiring: NEARBY_CATS["things-to-do"] carries the identity, so
 *      this cannot be satisfied by a rule nothing calls.
 */
import { isOuting, NOT_AN_OUTING_PRIMARY } from "../lib/outing.js";
import { NEARBY_CATS } from "../lib/nearbyPool.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };

const row = (name, primaryType, types) => ({ id: "x", name, primaryType, types: types || [primaryType] });

// ── refused: measured from the live pools ───────────────────────────────────
const REFUSED = [
  ["Elite Medical Spa of Parrish", "spa", ["skin_care_clinic", "spa", "hair_care"]],
  ["MassageLuXe Parrish", "massage_spa", ["massage_spa", "spa", "massage"]],
  ["Blue Door Spa Ellenton", "spa", ["sauna", "nail_salon", "massage_spa"]],
  ["Blue Door Med Spa - Lakewood Ranch", "spa", ["medical_center", "massage_spa", "wellness_center"]],
  ["BlueAloe Day Spa", "spa", ["massage_spa", "spa", "beauty_salon"]],
  ["Woodhouse Spa - Sarasota", "spa", ["spa", "point_of_interest", "establishment"]],
  ["Holistica Head Spa & Skin", "spa", ["spa", "massage_spa", "beauty_salon"]],
  ["The Covery | Health - Sarasota", "spa", ["wellness_center", "spa", "health"]],
  ["Perspire Sauna Studio", "spa", ["sauna", "wellness_center", "spa"]],
  ["ULTIMATE IV AND WELLNESS", "health", ["wellness_center", "spa", "point_of_interest"]],
  ["The Wellness Way- Sarasota", "chiropractor", ["chiropractor", "wellness_center", "health"]],
  ["The Aesthetics Lounge and Spa Lakewood Ranch", "spa", ["skin_care_clinic", "hair_care", "medical_clinic"]],
  ["Crunch Fitness - Parrish", "gym", ["gym", "tanning_studio", "yoga_studio"]],
  ["Row House Fitness Lakewood Ranch", "gym", ["gym", "sports_activity_location", "health"]],
  ["YogaSix Lakewood Ranch", "yoga_studio", ["yoga_studio", "fitness_center", "sports_school"]],
  ["Thavma Yoga Lakewood Ranch", "yoga_studio", ["yoga_studio", "fitness_center", "gym"]],
  ["CycleBar Sarasota UTC", "gym", ["gym", "fitness_center"]],
  ["Bakers Ranch Wedding Venue", "wedding_venue", ["wedding_venue", "event_venue", "point_of_interest"]],
  ["Fisherman's Cove RV Resort", "rv_park", ["rv_park", "lodging", "point_of_interest"]],
  ["Turtle Beach Campground", "campground", ["campground", "rv_park", "park"]],
  ["St Mary Star of the Sea Church", "church", ["church", "place_of_worship"]],
  // typed generously by Google, refused on the NAME — the case a type list alone cannot reach
  ["Sarasota Med Spa", "tourist_attraction", ["tourist_attraction", "point_of_interest"]],
  ["Gulf Coast Chiropractic", "point_of_interest", ["point_of_interest", "establishment"]],
  ["Bayshore Self Storage", "tourist_attraction", ["tourist_attraction"]],
  ["The Spa at Longboat Key Club", "tourist_attraction", ["tourist_attraction", "spa"]],
  // RULE-ISOLATION SHAPES. Every measured row above is refused by at least two
  // rules at once — "Elite Medical Spa" fails on the primary AND on the name —
  // so a mutation that breaks ONE of them still passes on all of them. These
  // rows are constructed so exactly one rule can refuse each, which is what makes
  // the mutations detectable. Proven: without the first, moving the primary veto
  // behind a "unless it also carries tourist_attraction" escape hatch went
  // completely unnoticed by twenty-five real rows.
  ["Aurora Wellbeing Rooms", "spa", ["spa", "tourist_attraction", "point_of_interest"]],
  ["Nine Elms Studio", "gym", ["gym", "tourist_attraction", "point_of_interest"]],
  ["Riverside Meadows", "wedding_venue", ["wedding_venue", "tourist_attraction", "park"]],
];
for (const [name, primary, types] of REFUSED) {
  ok(isOuting(row(name, primary, types)) === false, `"${name}" (${primary}) is not an outing`);
}

// ── kept: the half that matters more ────────────────────────────────────────
// A veto that deletes the reason to visit a town is worse than the leak it fixes.
const KEPT = [
  ["The John and Mable Ringling Museum of Art", "art_museum", ["art_museum", "history_museum", "tourist_attraction"]],
  ["Marie Selby Botanical Gardens", "botanical_garden", ["botanical_garden", "tourist_attraction", "museum"]],
  ["Ca' d'Zan", "museum", ["museum", "tourist_attraction", "point_of_interest"]],
  ["Sarasota Opera House", "performing_arts_theater", ["opera_house", "tourist_attraction", "performing_arts_theater"]],
  ["Historic Asolo Theater", "performing_arts_theater", ["performing_arts_theater", "event_venue"]],
  ["Kayaking SRQ", "tour_agency", ["tour_agency", "travel_agency", "point_of_interest"]],
  ["Lido Key Mangrove Kayak Tours", "tour_agency", ["tour_agency", "travel_agency"]],
  ["Poseidon Fishing Charters", "fishing_charter", ["fishing_charter", "point_of_interest"]],
  ["CB's Saltwater Outfitters", "service", ["fishing_charter", "clothing_store", "tour_agency"]],
  ["Premier Escape Adventures", "amusement_center", ["amusement_center", "event_venue"]],
  ["Arcade Monsters", "video_arcade", ["video_arcade", "bar", "amusement_center"]],
  ["Bradenton Motorsports Park", "race_course", ["race_course", "event_venue", "sports_activity_location"]],
  ["Little Manatee River State Park", "state_park", ["state_park", "tourist_attraction", "park"]],
  ["Rye Preserve", "nature_preserve", ["nature_preserve", "park", "point_of_interest"]],
  ["Gamble Creek Farms", "farm", ["farm", "point_of_interest", "service"]],
  ["Riviera Dunes Marina", "marina", ["marina", "point_of_interest"]],
  ["Dr Otts Off Leash Dog Sanctuary", "dog_park", ["dog_park", "park", "point_of_interest"]],
  ["JJ Fox's Treehouse", "indoor_playground", ["indoor_playground", "playground"]],
  ["Big Cat Habitat", "zoo", ["zoo", "tourist_attraction", "non_profit_organization"]],
  ["Mote Science Education Aquarium (SEA)", "aquarium", ["aquarium", "point_of_interest"]],
  ["The Fish Hole at Lakewood Ranch", "miniature_golf_course", ["miniature_golf_course", "point_of_interest"]],
  ["Florida Railroad Museum", "museum", ["tourist_attraction", "museum", "point_of_interest"]],
  ["Sailor Circus", "tourist_attraction", ["tourist_attraction", "point_of_interest"]],
  ["Celery Fields", "park", ["park", "point_of_interest"]],
  // deliberately kept — see the DELIBERATE CALLS block in lib/outing.js
  ["Legacy Golf Club at Lakewood Ranch", "golf_course", ["golf_course", "sports_complex"]],
  ["Mixon Fruit Farms", "farm", ["farm", "tourist_attraction"]],
  // the unusual local thing an allowlist would have deleted — this is the product
  ["Solomon's Castle", "point_of_interest", ["point_of_interest", "establishment"]],
  ["The Bubble Room", "tourist_attraction", ["tourist_attraction"]],
];
for (const [name, primary, types] of KEPT) {
  ok(isOuting(row(name, primary, types)) === true, `"${name}" (${primary}) IS an outing and must survive the veto`);
}

// ── it is a veto, not an allowlist ──────────────────────────────────────────
ok(isOuting(row("Something Nobody Has Typed Yet", "", [])) === true,
  "an untyped row must PASS — this rule is a veto, and an allowlist here would delete the odd local attraction that makes a town worth visiting");
ok(isOuting(row("A Perfectly Normal Attraction", "point_of_interest", ["point_of_interest"])) === true,
  "a generic point_of_interest must pass");

// ── the primary type is the CLAIM (v8.30.1) ─────────────────────────────────
ok(isOuting(row("Marie Selby Botanical Gardens", "botanical_garden", ["botanical_garden", "spa", "wellness_center"])) === true,
  "a garden that carries a spa token is still a garden — a secondary token may never outvote the primary");
ok(isOuting(row("Serenity Med Spa", "spa", ["spa", "tourist_attraction", "point_of_interest"])) === false,
  "…and a spa that carries tourist_attraction is still a spa");

// ── malformed rows ──────────────────────────────────────────────────────────
for (const bad of [null, undefined, {}, { name: null }, { types: null }, { primaryType: null }]) {
  ok(typeof isOuting(bad) === "boolean", "a malformed row is answered, never thrown on");
}
ok(isOuting(null) === false, "a null row is not an outing");

// ── the wiring ──────────────────────────────────────────────────────────────
ok(NEARBY_CATS["things-to-do"] && NEARBY_CATS["things-to-do"].identity === isOuting,
  "the things-to-do pool must carry this identity — a rule nothing calls is a comment (this is exactly how beaches shipped a radius with no identity in v8.31)");
ok(NEARBY_CATS.beaches.identity, "…and beaches must still carry its own");
ok(NOT_AN_OUTING_PRIMARY.has("spa") && NOT_AN_OUTING_PRIMARY.has("gym") && NOT_AN_OUTING_PRIMARY.has("wedding_venue"),
  "the measured leak families stay named in the veto set");
ok(!NOT_AN_OUTING_PRIMARY.has("park") && !NOT_AN_OUTING_PRIMARY.has("museum") && !NOT_AN_OUTING_PRIMARY.has("golf_course") && !NOT_AN_OUTING_PRIMARY.has("farm"),
  "…and the outing families stay OUT of it");

if (failures) {
  console.error(`\ncheck-outing-identity: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-outing-identity: ${asserts} assertions OK — ${REFUSED.length} service businesses refused, ${KEPT.length} real outings kept, veto not allowlist`);
