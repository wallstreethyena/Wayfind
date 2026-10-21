// lib/applePlaceMatch.js — DECIDE WHETHER AN APPLE MAPS PLACE IS THE SAME
// PLACE AS A WAYFIND LIST PLACE. Pure: no imports, no I/O, no Google, no clock.
// Shared by the one-time Place ID matcher (scripts/apple-place-match.mjs, Apple
// Maps Server API) and the browser (lib/appleMapRecovery.js, MapKit JS), so
// both sides accept and refuse exactly the same matches.
//
// WHY (2026-10-21, owner: "I want the pins, and I don't want to buy that").
// Stored list coordinates are Google's and may be drawn for 30 days only
// (lib/coordProvenance.js). Apple's terms let us keep exactly one Apple thing
// forever — the Place ID:
//   "Place IDs are exempt from the storage restrictions in Section 2.5 of
//    Attachment 6 to the Apple Developer Program License Agreement."
//   https://developer.apple.com/documentation/mapkit/identifying-unique-locations-with-place-ids
// Everything else Apple returns (name, address, coordinate) is Map Data that
// may only be held "on a temporary and limited basis" (DPLA Attachment 6 §2.5)
// and must be shown on an Apple map (§2.4). So this module reads Apple's name,
// locality, category and coordinate ONLY to decide identity, and returns the
// Place ID plus Wayfind's own match evidence (scores, reasons) — never Apple's
// text or coordinate for storage.
//
// WRONG PINS ARE WORSE THAN NONE. Every rule below refuses when unsure:
//   1. name: normalized names must agree (score >= NAME_MIN; >= NAME_STRICT
//      when Apple gives no category to cross-check);
//   2. area: the Apple point must sit inside the requested Wayfind area
//      (metro box for the one-time match, the visible map for live lookups);
//   3. category: Apple's point-of-interest category must be compatible with
//      the Wayfind place's own type family when both are known;
//   4. locality: when both sides name a city, they must be the same city;
//   5. uniqueness: exactly ONE distinct Apple place may survive 1-4. Two
//      survivors (branches, look-alikes) is "ambiguous" and nothing is stored;
//   6. chains: a known chain name, or a name Wayfind holds for more than one
//      id, is refused unless the Wayfind place's own city agrees with Apple's;
//   7. generic names made only of ordinary words ("Village Cafe") likewise.
// Measured 2026-10-21 against live MapKit JS Search for 1,828 unpinnable list
// places (Parrish cafés, Sarasota food, Tampa food) and 27 venues with an
// independent (Wikidata/Census) coordinate: 23 of 27 matched, every one within
// 424 m of the independent point; refusals were mostly chains (ambiguous).

// 6 of 7 shared tokens ("Jpan Sushi & Grill" / "JPAN Sushi Bar & Grill") is 0.857.
export const NAME_MIN = 0.85;
export const NAME_STRICT = 0.96;
// A stored Place ID resolved later must still look like the same business.
// Below this the Apple place was renamed/replaced: refuse the pin.
export const NAME_RECHECK_MIN = 0.6;
// Two Apple results this close together with the same identity are one place
// listed twice (e.g. a building entrance and the venue), not two branches.
export const SAME_PLACE_METERS = 60;

const STOP = new Set(["the", "and", "of", "at", "a", "an", "llc", "inc", "co", "company", "fl", "florida"]);
const SYNONYM = { "&": "and", st: "saint", ste: "saint", mt: "mount", ctr: "center", centre: "center", cafe: "cafe", caffe: "cafe", coffeehouse: "coffee house" };

export function normalizeName(s) {
  return String(s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  return normalizeName(s).split(" ").filter(Boolean)
    .flatMap((t) => String(SYNONYM[t] || t).split(" "))
    .filter((t) => !STOP.has(t));
}

const compact = (s) => tokens(s).join("");

// 0..1. 1 = same normalized name. Token Dice, with credit for a clean prefix
// ("Ryan's Coffee House" vs "Ryan's Coffee House Parrish").
// "RomanSQ | artisan pizza", "Bohemios - SARASOTA", "Hot Rocks (Town n Country)":
// the part before a spaced separator / parenthesis is the business name.
function nameForms(s) {
  const raw = String(s || "");
  const head = raw.split(/\s+[|\-–—:]\s+|\s*\(|\s*\//)[0].trim();
  return head && head !== raw.trim() && compact(head).length >= 4 ? [raw, head] : [raw];
}

export function nameScore(a, b) {
  let best = 0;
  for (const x of nameForms(a)) for (const y of nameForms(b)) best = Math.max(best, nameScoreOne(x, y));
  return best;
}

function nameScoreOne(a, b) {
  const ca = compact(a), cb = compact(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  const ta = tokens(a), tb = tokens(b);
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const dice = (2 * inter) / (sa.size + sb.size);
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  // Prefix credit only when the shorter name is itself distinctive (>= 8
  // letters, >= 2 tokens) and covers most of the longer one.
  const shortTokens = ca.length <= cb.length ? sa.size : sb.size;
  const prefix = long.startsWith(short) && short.length >= 8 && shortTokens >= 2 && short.length / long.length >= 0.6 ? 0.9 : 0;
  // Branch qualifier: one side is the other plus trailing words ("Bean
  // Wandering Coffee Downtown" / "Bean Wandering"). Whole-token prefix of
  // >= 2 tokens and >= 8 letters only; scored below NAME_STRICT so it is
  // accepted ONLY when Apple's category independently agrees.
  const [st, lt] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const tokenPrefix = st.length >= 2 && st.join("").length >= 8 && st.every((t, i) => lt[i] === t) ? 0.88 : 0;
  return Math.max(dice, prefix, tokenPrefix);
}

// Same city? "St. Petersburg" and "Saint Petersburg" are one city.
export function sameLocality(a, b) {
  const ca = compact(a), cb = compact(b);
  return !!ca && ca === cb;
}

// Wayfind type family from the place's own type evidence (primary type first).
const FAMILY_OF_TYPE = [
  [/^(cafe|coffee_shop|bakery|tea_house|donut_shop|dessert_shop|ice_cream_shop|juice_shop|breakfast_restaurant|brunch_restaurant|cafeteria)$/, "cafe"],
  [/^(bar|pub|night_club|wine_bar|brewery|cocktail_bar|lounge|sports_bar|brewpub|bar_and_grill)$/, "nightlife"],
  [/restaurant$|^(food|meal_takeaway|meal_delivery|food_court|deli|diner|steak_house|pizza|sandwich_shop|bistro)$/, "food"],
  [/^(lodging|hotel|motel|resort_hotel|inn|bed_and_breakfast|campground|rv_park)$/, "stay"],
  [/museum$|^(art_gallery|zoo|aquarium|amusement_park|water_park|tourist_attraction|performing_arts_theater|opera_house|concert_hall|movie_theater|stadium|arena|planetarium|historical_landmark|historical_place|bowling_alley|event_venue|cultural_center|library|wildlife_park)$/, "attraction"],
  [/park$|garden$|^(beach|hiking_area|marina|nature_preserve|playground|natural_feature)$/, "outdoors"],
  [/store$|^(shopping_mall|market|supermarket|grocery_store|farmers_market)$/, "shopping"],
];

export function wayfindFamily(place) {
  const types = [place && (place.primaryType || place.primary_type), ...((place && (place.types || place.google_types)) || [])]
    .filter((t) => typeof t === "string" && t);
  for (const t of types) for (const [rx, fam] of FAMILY_OF_TYPE) if (rx.test(t)) return fam;
  const cat = place && typeof place.category === "string" ? place.category : "";
  if (cat === "food") return "food";
  if (cat === "nightlife") return "nightlife";
  return null;
}

// Apple POI categories (MapKit JS mapkit.PointOfInterestCategory / Server API
// PoiCategory string values) each Wayfind family accepts.
const APPLE_OK = {
  cafe: ["Cafe", "Bakery", "Restaurant", "FoodMarket"],
  food: ["Restaurant", "Cafe", "Bakery", "FoodMarket", "Brewery", "Winery", "Distillery", "Nightlife"],
  nightlife: ["Nightlife", "Brewery", "Winery", "Distillery", "Restaurant", "MusicVenue"],
  stay: ["Hotel", "Campground", "RVPark"],
  outdoors: ["Park", "NationalPark", "Beach", "Campground", "Marina", "Hiking", "NationalMonument", "Landmark", "Fishing", "Kayaking", "Swimming", "Zoo", "Museum", "Fairground"],
  attraction: ["Museum", "Zoo", "Aquarium", "AmusementPark", "Theater", "MovieTheater", "Stadium", "Planetarium", "Landmark", "NationalMonument", "CastleFortress", "Park", "NationalPark", "MusicVenue", "ConventionCenter", "Library", "Bowling", "MiniGolf", "GoKart", "Fairground", "Beach", "Marina", "University"],
  shopping: ["Store", "FoodMarket", "Pharmacy", "Restaurant"],
};

export function categoryCompatible(family, appleCategory) {
  if (!family || !appleCategory) return null; // unknown: neutral
  const ok = APPLE_OK[family];
  return ok ? ok.includes(String(appleCategory)) : null;
}

const KNOWN_CHAINS = /^(starbucks|dunkin|dunkindonuts|mcdonalds|panerabread|chickfila|chipotle|subway|wawa|7eleven|tropicalsmoothiecafe|firstwatch|burgerking|wendys|tacobell|dominos|pizzahut|publix|walmart|target|cvs|walgreens|olivegarden|applebees|chilis|outback|crackerbarrel|ihop|dennys|sonic|kfc|popeyes|jerseymikes|firehousesubs|5guys|fiveguys|shakeshack|bjsrestaurant|cheesecakefactory|texasroadhouse|hootersrestaurant|hooters|perkins|krispykreme|cinnabon|jambajuice|smoothieking|scooterscoffee|duttonbros|dutchbros|peetscoffee|timhortons|sevenbrew|7brew)$/;

export function isKnownChain(name) { return KNOWN_CHAINS.test(compact(name)); }

// A name made only of ordinary words ("The Park", "Village Cafe", "Sage")
// names many businesses; Apple's single hit in a metro may be a different one.
const GENERIC = new Set(["park", "cafe", "grill", "kitchen", "bar", "pub", "house", "place", "spot", "corner", "diner", "deli", "bistro", "tavern", "village", "garden", "gardens", "market", "eatery", "social", "lounge", "club", "coffee", "bakery", "pizza", "pizzeria", "sushi", "tacos", "taco", "bbq", "restaurant", "cantina", "kitchen", "local", "public", "common", "commons", "station", "depot", "yard", "dock", "pier", "beach", "bay", "harbor", "harbour", "sage", "basil", "olive", "salt", "smoke", "brew", "brewing", "bistro", "table", "room", "shack", "hut", "joint", "cuisine", "food", "foods", "express", "original", "new", "old", "little", "big", "top", "best", "central", "downtown", "main", "street", "avenue", "city", "town", "square", "plaza", "point", "island", "key", "coast", "gulf", "sun", "sunset", "palm", "palms", "ocean", "sea", "blue", "green", "red", "gold", "golden", "white", "black"]);
export function isGenericName(name) {
  const t = tokens(name);
  return t.length > 0 && t.length <= 3 && t.every((w) => GENERIC.has(w));
}

function validPoint(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function inBox(box, lat, lng) {
  return !!box && validPoint(lat, lng) && lat <= box.north && lat >= box.south && lng <= box.east && lng >= box.west;
}

function meters(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Normalize one Apple result from EITHER API to a transient shape.
//   MapKit JS Place:   { id, alternateIds, name, coordinate:{latitude,longitude}, locality, pointOfInterestCategory }
//   Server API Place:  { id, alternateIds, name, coordinate:{latitude,longitude}, structuredAddress:{locality}, poiCategory }
export function normalizeApplePlace(p) {
  if (!p || typeof p !== "object") return null;
  const c = p.coordinate || p.center || {};
  return {
    id: typeof p.id === "string" && p.id ? p.id : null,
    alternateIds: Array.isArray(p.alternateIds) ? p.alternateIds.filter((x) => typeof x === "string") : [],
    name: typeof p.name === "string" ? p.name : "",
    lat: typeof c.latitude === "number" ? c.latitude : NaN,
    lng: typeof c.longitude === "number" ? c.longitude : NaN,
    locality: (typeof p.locality === "string" && p.locality) || (p.structuredAddress && typeof p.structuredAddress.locality === "string" && p.structuredAddress.locality) || null,
    category: p.pointOfInterestCategory || p.poiCategory || null,
  };
}

// matchApplePlace(place, results, { box, sameNameIds })
//   place        Wayfind place: { id, name, locality?, primaryType?, types?, category? }
//   results      raw Apple results (either API)
//   box          { north, south, east, west } the Wayfind area the place must be in
//   sameNameIds  how many distinct Wayfind ids carry this normalized name (>1 = chain-like)
// -> { ok:true, appleId, lat, lng, nameScore, category, evidence }
//    { ok:false, reason, considered }
// lat/lng are returned for IMMEDIATE display only; callers must not persist them.
export function matchApplePlace(place, results, { box, sameNameIds = 1 } = {}) {
  if (!place || !compact(place.name)) return { ok: false, reason: "no-wayfind-name", considered: 0 };
  if (!box) return { ok: false, reason: "no-area", considered: 0 };
  const family = wayfindFamily(place);
  const ourCity = place.locality || place.city || "";
  const chainLike = isKnownChain(place.name) || sameNameIds > 1;
  const raw = (Array.isArray(results) ? results : []).map(normalizeApplePlace).filter(Boolean);
  const survivors = [];
  const why = {};
  const note = (r) => { why[r] = (why[r] || 0) + 1; };
  for (const a of raw) {
    if (!a.id) { note("no-apple-id"); continue; }
    const score = nameScore(place.name, a.name);
    if (score < NAME_MIN) { note("name-mismatch"); continue; }
    if (!inBox(box, a.lat, a.lng)) { note("outside-area"); continue; }
    const cat = categoryCompatible(family, a.category);
    if (cat === false) { note("category-mismatch"); continue; }
    if (cat === null && score < NAME_STRICT) { note("name-not-strict-without-category"); continue; }
    const theirCity = a.locality || "";
    const cityAgrees = sameLocality(ourCity, theirCity);
    // Wayfind's locality is often a census place ("Town 'n' Country",
    // "Carrollwood") where Apple gives the postal city ("Tampa"). A different
    // city is tolerated ONLY for an exact name whose Apple category agrees;
    // uniqueness inside the area still decides below.
    if (compact(ourCity) && compact(theirCity) && !cityAgrees && !(score >= NAME_STRICT && cat === true)) { note("locality-mismatch"); continue; }
    survivors.push({ ...a, score, cityAgrees });
  }
  // Collapse one place listed twice: same id/alternate id, or the same
  // identity within SAME_PLACE_METERS.
  const distinct = [];
  for (const s of survivors.sort((x, y) => y.score - x.score)) {
    const dup = distinct.find((d) => d.id === s.id || d.alternateIds.includes(s.id) || s.alternateIds.includes(d.id)
      || meters(d, s) <= SAME_PLACE_METERS);
    if (!dup) distinct.push(s);
  }
  if (distinct.length === 0) {
    const top = Object.entries(why).sort((a, b) => b[1] - a[1])[0];
    return { ok: false, reason: raw.length ? (top ? top[0] : "no-candidate") : "no-results", considered: raw.length };
  }
  if (distinct.length > 1) return { ok: false, reason: "ambiguous", considered: raw.length };
  const best = distinct[0];
  if (chainLike && !best.cityAgrees) return { ok: false, reason: "chain-needs-locality", considered: raw.length };
  if (isGenericName(place.name) && !best.cityAgrees) return { ok: false, reason: "generic-name-needs-locality", considered: raw.length };
  return {
    ok: true, appleId: best.id, lat: best.lat, lng: best.lng, nameScore: Math.round(best.score * 100) / 100,
    category: best.category || null,
    evidence: { family, categoryChecked: categoryCompatible(family, best.category) === true, cityAgrees: best.cityAgrees, chainLike, candidates: raw.length },
  };
}

// A stored Place ID resolved at render time: Apple returns the place's CURRENT
// data. Refuse the pin when the business behind the ID no longer looks like
// the Wayfind place (renamed, replaced) or sits outside the visible map.
export function recheckResolvedPlace(place, applePlace, box) {
  const a = normalizeApplePlace(applePlace);
  if (!a || !validPoint(a.lat, a.lng)) return { ok: false, reason: "apple-no-coordinate" };
  if (nameScore(place && place.name, a.name) < NAME_RECHECK_MIN) return { ok: false, reason: "apple-identity-changed" };
  if (box && !inBox(box, a.lat, a.lng)) return { ok: false, reason: "outside-area" };
  return { ok: true, lat: a.lat, lng: a.lng };
}
