// lib/placeTaxonomy.js — PURE + shared (server + client, zero deps). The
// deterministic taxonomy mapper for the owned candidate set (PR-B slice 1).
// Given a place's Google types (+ optional primaryType and name), it assigns
// exactly one Wayfind category and a set of sub-filter tags. Same inputs always
// give the same output — no network, no ranking, no randomness.
//
// GROUNDED IN REAL GOOGLE OUTPUT, not assumptions (test-taxonomy.mjs pins each
// case to what /api/places/search actually returns for these places):
//   • Selby    -> botanical_garden, tourist_attraction, museum            -> attractions
//   • Ringling -> art_museum, history_museum, museum, performing_arts..., garden -> attractions
//   • Myakka   -> state_park, park                                        -> attractions
//   • Owen's   -> seafood_restaurant, restaurant, food                    -> food
//   • Siesta Beach -> point_of_interest, establishment (NO `beach` type!) -> beach, via NAME
//   • Mote     -> research_institute (NO `aquarium` type; name is "Mote Marine
//                 Laboratory", no "aquarium" token) -> null. Types AND name are
//                 insufficient, so a marquee place like this MUST be an anchor
//                 with an explicit category (slice 4). Returning null here is the
//                 CORRECT, honest signal that the seeder should trust the anchor.
//
// KEY RULE (the correction that fixes the whole bug): bare `tourist_attraction`
// is a WEAK signal — famous restaurants and shopping circles carry it — so the
// STRONG attraction types (museum / aquarium / botanical_garden / zoo /
// state_park / performing_arts_theater / ...) are matched BEFORE food / hotels /
// shopping, while tourist_attraction / park / garden / historical_landmark only
// decide a place that nothing stronger already claimed. That is what puts Selby,
// Ringling and Myakka in attractions WITHOUT dragging in restaurants that happen
// to be tourist attractions.
//
// Category is one of: food | nightlife | attractions | beach | hotels | shopping
// (or null when nothing classifies it). Every emitted tag is a real sub-filter
// id from lib/google.js SUBFILTERS; the read path (slice 3) matches tags to
// sub-filters by equality, so the vocabulary MUST stay in lock-step — the test
// asserts every emitted tag is a member of that category's sub-filter ids.

const norm = (s) => String(s || "").toLowerCase().trim();
const asSet = (types) => new Set((Array.isArray(types) ? types : []).map(norm).filter(Boolean));
const hasAny = (set, arr) => arr.some((t) => set.has(t));

// ── STRONG attraction types: decisive, checked before food/hotels/shopping ──
const STRONG_ATTRACTION = [
  "museum", "art_museum", "history_museum", "art_gallery", "aquarium", "zoo",
  "botanical_garden", "amusement_park", "water_park", "national_park", "state_park",
  "planetarium", "performing_arts_theater", "cultural_center", "wildlife_park",
  "wildlife_refuge", "hiking_area", "observation_deck", "sculpture",
];
const LODGING = [
  "hotel", "motel", "resort_hotel", "lodging", "bed_and_breakfast", "guest_house",
  "extended_stay_hotel", "inn", "cottage", "hostel",
];
const NIGHTLIFE = ["night_club", "bar", "pub", "brewery", "wine_bar", "beer_garden", "casino"];
const SHOPPING = [
  "shopping_mall", "department_store", "clothing_store", "book_store", "shoe_store",
  "jewelry_store", "gift_shop", "home_goods_store", "furniture_store", "electronics_store",
  "boutique", "outlet_store", "market", "flea_market", "warehouse_store",
];
// WEAK attraction types: only decide a place nothing stronger claimed.
const WEAK_ATTRACTION = [
  "tourist_attraction", "park", "garden", "historical_landmark", "historical_place",
  "monument", "natural_feature", "campground", "rv_park", "point_of_interest_park",
];

// Food is matched by a pattern because Google emits dozens of *_restaurant types.
const FOOD_RE = /(^|_)restaurant$|^cafe$|^coffee_shop$|^bakery$|^meal_(takeaway|delivery)$|^ice_cream_shop$|^deli$|^delicatessen$|^sandwich_shop$|^fast_food_restaurant$|^food_court$|^bar_and_grill$|^bagel_shop$|^donut_shop$|^diner$|^cafeteria$|^pizza_restaurant$/;

// Map a SINGLE type (used for primaryType, the strongest single signal) to a
// category, or null. Deliberately narrower than the full-list resolver.
function categoryOfType(t) {
  t = norm(t);
  if (!t) return null;
  if (STRONG_ATTRACTION.includes(t)) return "attractions";
  if (LODGING.includes(t)) return "hotels";
  if (FOOD_RE.test(t)) return "food";
  if (NIGHTLIFE.includes(t)) return "nightlife";
  if (t === "beach" || t === "marina") return "beach";
  if (SHOPPING.includes(t) || /_store$/.test(t)) return "shopping";
  if (WEAK_ATTRACTION.includes(t)) return "attractions";
  return null;
}

// Resolve the category from the full type set, in strict precedence order.
function categoryFromTypes(set) {
  if (hasAny(set, STRONG_ATTRACTION)) return "attractions";
  if (hasAny(set, LODGING)) return "hotels";
  for (const t of set) if (FOOD_RE.test(t)) return "food";
  if (hasAny(set, NIGHTLIFE)) return "nightlife";
  if (set.has("beach") || set.has("marina")) return "beach";
  if (hasAny(set, SHOPPING)) return "shopping";
  for (const t of set) if (/_store$/.test(t)) return "shopping";
  if (hasAny(set, WEAK_ATTRACTION)) return "attractions";
  return null;
}

// Name heuristics — the safety net for type-poor places. Google frequently
// returns only point_of_interest/establishment for famous beaches, gardens and
// museums (Siesta Beach has NO `beach` type). A confident token in the display
// name recovers the category the types dropped.
function categoryFromName(name) {
  const n = norm(name);
  if (!n) return null;
  if (/\bbeach\b/.test(n)) return "beach";
  if (/\baquarium\b|\bzoo\b/.test(n)) return "attractions";
  if (/\bmuseum\b|\bgallery\b|\bplanetarium\b/.test(n)) return "attractions";
  if (/botanical|\bgardens?\b|\bpreserve\b|\bnature\s+(park|trail|center)\b/.test(n)) return "attractions";
  return null;
}

// Compute the sub-filter tags for a resolved category, from the full type set +
// name. Every value returned here is a real sub-filter id from SUBFILTERS.
function tagsFor(category, set, name) {
  const n = norm(name);
  const out = [];
  const add = (id) => { if (!out.includes(id)) out.push(id); };
  if (category === "attractions") {
    if (hasAny(set, ["museum", "art_museum", "history_museum", "planetarium"]) || /\bmuseum\b/.test(n)) add("museums");
    if (hasAny(set, ["art_gallery", "art_museum", "performing_arts_theater", "cultural_center"]) || /\bgallery\b|\btheat(er|re)\b/.test(n)) add("arts");
    if (hasAny(set, ["park", "state_park", "national_park", "botanical_garden", "garden", "hiking_area", "campground", "rv_park", "natural_feature"]) || /botanical|\bgardens?\b|\bpark\b|\bpreserve\b|\btrail\b/.test(n)) add("outdoors");
    if (hasAny(set, ["aquarium", "zoo", "amusement_park", "water_park", "wildlife_park"]) || /\baquarium\b|\bzoo\b/.test(n)) add("family");
    if (hasAny(set, ["spa", "wellness_center", "day_spa", "health_spa", "sauna", "massage"])) add("spa");
    if (hasAny(set, ["historical_landmark", "historical_place", "monument"])) add("landmarks");
    if (hasAny(set, ["tour_agency", "travel_agency"])) add("tours");
  } else if (category === "food") {
    if (hasAny(set, ["breakfast_restaurant", "brunch_restaurant", "bagel_shop"])) add("breakfast");
    if (hasAny(set, ["bakery", "ice_cream_shop", "dessert_shop", "donut_shop", "chocolate_shop", "candy_store"])) add("dessert");
    if (hasAny(set, ["fast_food_restaurant", "meal_takeaway", "sandwich_shop", "food_court", "hamburger_restaurant"])) add("quickbites");
  } else if (category === "nightlife") {
    if (hasAny(set, ["bar", "pub", "wine_bar", "brewery", "beer_garden"])) add("bars");
    if (set.has("night_club")) add("clubs");
    if (set.has("karaoke")) add("karaoke");
  } else if (category === "beach") {
    if (set.has("beach") || /\bbeach\b/.test(n)) add("beaches");
    if (set.has("marina")) add("marinas");
  } else if (category === "shopping") {
    if (set.has("shopping_mall") || /\bmall\b/.test(n)) add("malls");
    if (hasAny(set, ["market", "flea_market"]) || /\bmarket\b/.test(n)) add("markets");
    if (set.has("outlet_store") || /\boutlet\b/.test(n)) add("outlets");
    if (set.has("boutique") || /\bboutique\b/.test(n)) add("boutiques");
  }
  return out;
}

// classifyPlace — the mapper. primaryType (when the seeder supplies it via the
// field mask) is the strongest single signal and votes first; otherwise the
// full-type precedence decides; name heuristics are the last-chance net for
// type-poor places. Returns { category, tags, via } where via records HOW the
// category was decided: "primaryType" | "types" | "name" | null. That is
// load-bearing for the seeder: a category recovered by NAME (not by a real
// Google type) must NOT be silently trusted — the seeder flags those rows for
// review with last_verified_at=null. The name net can flag; it cannot decide.
// category is null when nothing classifies the place (the seeder then relies on
// the anchor list, or skips it).
export function classifyPlace(types, primaryType, name) {
  const set = asSet(types);
  let category = categoryOfType(primaryType), via = category ? "primaryType" : null; // strongest single signal
  if (!category) { category = categoryFromTypes(set); if (category) via = "types"; } // full-type precedence
  if (!category) { category = categoryFromName(name); if (category) via = "name"; }  // type-poor safety net
  if (!category) return { category: null, tags: [], via: null };
  return { category, tags: tagsFor(category, set, name), via };
}
