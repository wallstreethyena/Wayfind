// lib/cuisine.js — what KIND of food, as a FILTER over inventory we already hold.
//
// ────────────────────────────────────────────────────────────────────────────
// THE RULE, ABOVE EVERYTHING ELSE IN THIS FILE
// A cuisine label is a FILTER on already-geofenced local inventory. It is NEVER
// a search query. If "Puerto Rican" reaches a Places text search, Google returns
// restaurants in Puerto Rico — 1,100 miles from Orlando, with real names, real
// ratings and real photos, which is exactly what would make the bug survive
// review. scripts/check-cuisine-never-queried.mjs fails the build if a label can
// reach a query builder.
//
// Everything below is therefore read-only classification of rows ALREADY inside
// a metro's inventory. Nothing here fetches. Nothing here composes a query.
// ────────────────────────────────────────────────────────────────────────────
//
// WHY NAME PATTERNS EXIST AND ARE NOT A SHORTCUT
// Google's types[] carries roughly fifteen usable cuisine types, and they
// collapse exactly the distinctions Florida diners care most about. There is no
// `cuban_restaurant`, no `puerto_rican_restaurant`, no `colombian_restaurant`,
// no `venezuelan_restaurant` — all of it lands in `latin_american_restaurant` or
// plain `restaurant`. In Tampa and Orlando that is not a rounding error: Cuban
// and Puerto Rican are distinct, large, and not interchangeable.
//
// So names carry signal types cannot. Names also lie, and this file's job is to
// use them without being fooled:
//   "Kobe Steakhouse"         must NOT classify japanese  (a beef breed; it is a
//                             steakhouse)
//   "Havana Nights Nightclub" must NOT classify cuban     (it is a nightclub)
// Both are locked as fixtures in scripts/test-cuisine-classify.mjs.
//
// CONFIDENCE AND SOURCE ARE STORED, NOT DISCARDED
// A types[] hit is strong evidence; a lone name token is weak. Collapsing both to
// "korean" throws away the only thing that lets a cron re-check the weak ones
// later. Every classification carries its confidence and which signals produced
// it.

// ── 1. Google types[] → cuisine. Strong signal, narrow coverage. ───────────
export const TYPE_CUISINE = Object.freeze({
  italian_restaurant: "italian", chinese_restaurant: "chinese",
  japanese_restaurant: "japanese", korean_restaurant: "korean",
  mexican_restaurant: "mexican", thai_restaurant: "thai",
  indian_restaurant: "indian", vietnamese_restaurant: "vietnamese",
  greek_restaurant: "greek", french_restaurant: "french",
  spanish_restaurant: "spanish", turkish_restaurant: "turkish",
  lebanese_restaurant: "lebanese", middle_eastern_restaurant: "middle-eastern",
  mediterranean_restaurant: "mediterranean", brazilian_restaurant: "brazilian",
  american_restaurant: "american", seafood_restaurant: "seafood",
  steak_house: "steakhouse", pizza_restaurant: "pizza",
  sushi_restaurant: "sushi", barbecue_restaurant: "barbecue",
  ramen_restaurant: "ramen", hamburger_restaurant: "burgers",
  breakfast_restaurant: "breakfast", brunch_restaurant: "breakfast",
  vegetarian_restaurant: "vegetarian", vegan_restaurant: "vegan",
  asian_restaurant: "asian", latin_american_restaurant: "latin-american",
  afghani_restaurant: "afghan", african_restaurant: "african",
  indonesian_restaurant: "indonesian",
});

// ── 2. Name patterns — the only route to the Caribbean and South America ────
//
// Each entry needs a DISH or an unambiguous cultural marker, not merely a place
// name. "Havana" alone is a neighbourhood, a cigar brand and a nightclub;
// "ropa vieja" is dinner.
export const NAME_CUISINE = Object.freeze([
  { cuisine: "cuban", rx: /\b(cubana|cubano|cuban|habana|havana|ropa vieja|lechon|palomilla|medianoche|croqueta|croquetas|pastelito|vaca frita)\b/i },
  { cuisine: "puerto-rican", rx: /\b(puerto[ -]?rican|puerto[ -]?rico|boricua|borinquen|mofongo|lechonera|alcapurria|pernil|jibarito|tostones|piragua)\b/i },
  { cuisine: "colombian", rx: /\b(colombiana|colombiano|colombian|bandeja paisa|arepa|arepas|ajiaco|lechona|bunuelo|chuzo)\b/i },
  { cuisine: "venezuelan", rx: /\b(venezolana|venezuelan|pabellon|cachapas?|tequenos?|patacon(es)?|reina pepiada)\b/i },
  { cuisine: "dominican", rx: /\b(dominicana|dominican|la bandera|mangu|chimi)\b/i },
  { cuisine: "peruvian", rx: /\b(peruvian|peruano|lomo saltado|anticucho|pollo a la brasa|chifa)\b/i },
  { cuisine: "haitian", rx: /\b(haitian|ayiti|griot|tassot)\b/i },
  { cuisine: "jamaican", rx: /\b(jamaican|jamaica|jerk chicken|jerk pork|ackee|oxtail|patty shop|irie)\b/i },
  { cuisine: "caribbean", rx: /\b(caribbean|west indian|trinidad|bajan|roti shop|doubles)\b/i },
  { cuisine: "salvadoran", rx: /\b(salvadorena|salvadoran|pupuseria|pupusas|pupusa|curtido)\b/i },
  { cuisine: "argentine", rx: /\b(argentina|argentine|parrilla|choripan|milanesa)\b/i },
  { cuisine: "ethiopian", rx: /\b(ethiopian|injera|doro wat|habesha|berbere)\b/i },
  { cuisine: "filipino", rx: /\b(filipino|pinoy|lumpia|kamayan|halo[ -]?halo|lechon kawali)\b/i },
  { cuisine: "korean", rx: /\b(korean|k[ -]?bbq|kpot|k[ -]?pot|bibimbap|bulgogi|banchan|tteokbokki|jjigae|gochujang)\b/i },
  { cuisine: "japanese", rx: /\b(japanese|izakaya|yakitori|omakase|donburi|okonomiyaki|udon|teppanyaki|hibachi)\b/i },
  { cuisine: "vietnamese", rx: /\b(vietnamese|pho|banh mi|bun bo|com tam|banh xeo)\b/i },
  { cuisine: "thai", rx: /\b(thai|pad thai|tom yum|som tam|khao soi)\b/i },
  { cuisine: "indian", rx: /\b(indian|tandoori|tandoor|biryani|masala|dosa|chaat|punjabi|kerala)\b/i },
  { cuisine: "greek", rx: /\b(greek|souvlaki|gyro|gyros|taverna|spanakopita)\b/i },
  { cuisine: "turkish", rx: /\b(turkish|kebap|doner|anatolia)\b/i },
  { cuisine: "middle-eastern", rx: /\b(shawarma|falafel|hummus|kabob|kebab)\b/i },
  // "hot pot" is deliberately ABSENT: it is pan-Asian, and it tagged
  // "KPOT Korean BBQ & Hot Pot" as chinese alongside korean. For a FILTER that is
  // not a harmless extra label — someone filtering Chinese would be shown a
  // Korean restaurant. Unambiguous regional markers only.
  { cuisine: "chinese", rx: /\b(chinese|dim sum|szechuan|sichuan|cantonese|hunan|dumpling house)\b/i },
  { cuisine: "mexican", rx: /\b(mexican|taqueria|birria|barbacoa|al pastor|elote|mariscos|antojitos)\b/i },
  { cuisine: "soul-food", rx: /\b(soul food|southern kitchen|fish fry|smothered)\b/i },
  { cuisine: "barbecue", rx: /\b(bbq|barbecue|barbeque|smokehouse|brisket)\b/i },
]);

// ── 3. The veto list — names that LOOK like a cuisine and are not ──────────
//
// Every entry is a real Florida business a naive name match gets wrong. This
// list is the difference between a name signal and a liability.
export const NAME_VETO = Object.freeze([
  // "Kobe" is a beef breed before it is a city; these are steakhouses.
  { rx: /\bkobe\b/i, unless: /japanese|sushi|hibachi|teppan|izakaya/i, blocks: ["japanese"],
    why: "Kobe is a beef breed — Kobe Steakhouse is a steakhouse, not Japanese cuisine" },
  // A nightclub is not a restaurant, whatever it is called.
  { rx: /\b(nightclub|night club|hookah|cigar)\b/i, unless: null, blocks: ["*"],
    why: "Havana Nights Nightclub is a nightclub — a cuisine label on it is a category error" },
  // A cuisine word inside a property or service name is not a kitchen.
  { rx: /\b(apartments?|realty|salon|barber|storage|dentist|urgent care)\b/i, unless: null, blocks: ["*"],
    why: "a plaza, salon or clinic carrying a cuisine word is not a restaurant" },
  // National chains whose branding borrows a country word.
  { rx: /\b(outback|texas roadhouse|longhorn steakhouse)\b/i, unless: null, blocks: ["*"],
    why: "national steakhouse chains carry country words that are branding, not cuisine" },
]);

const norm = (s) => String(s || "").toLowerCase();

// Generic buckets. Knowing a place is "asian" is worth little next to knowing it
// is Korean, so these are kept only when nothing specific was found.
const GENERIC = new Set(["asian", "latin-american", "american", "mediterranean", "caribbean"]);

/**
 * Classify one inventory row. PURE — no I/O, no fetch, no query construction.
 *
 * @param {{name:string, google_types?:string[], primary_type?:string,
 *          editorial?:string}} row
 * @returns {{cuisines:string[], confidence:number, sources:string[], reason:string}}
 *
 * confidence: 0.9 types[] · 0.7 name+dish · 0.55 editorial prose · 0 nothing.
 *
 * An empty cuisines[] with reason "unclassifiable" is an HONEST answer and is
 * stored as such. It is NOT the same as "not yet attempted", and conflating the
 * two is what let atlas-build hide a 100% failure rate for five days.
 */
export function classifyCuisine(row) {
  if (!row || !row.name) return { cuisines: [], confidence: 0, sources: [], reason: "no-name" };
  const name = norm(row.name);
  const types = Array.isArray(row.google_types) ? row.google_types.map(norm) : [];
  const editorial = norm(row.editorial);
  const sources = [];
  const found = new Map();

  // Vetoes first, and they are IDENTITY vetoes: a nightclub is not a restaurant
  // however many dish words are in its name.
  const blocked = new Set();
  for (const v of NAME_VETO) {
    if (!v.rx.test(name)) continue;
    if (v.unless && v.unless.test(name)) continue;
    for (const b of v.blocks) blocked.add(b);
  }
  if (blocked.has("*")) {
    return { cuisines: [], confidence: 0, sources: ["name-veto"], reason: "vetoed: not a cuisine-bearing restaurant" };
  }

  // 1. types[] — strongest.
  for (const t of types) {
    const c = TYPE_CUISINE[t];
    if (!c || blocked.has(c)) continue;
    found.set(c, Math.max(found.get(c) || 0, 0.9));
    if (!sources.includes("google-types")) sources.push("google-types");
  }
  // 2. name — the only route to Cuban / Puerto Rican / Colombian.
  for (const { cuisine, rx } of NAME_CUISINE) {
    if (blocked.has(cuisine) || !rx.test(name)) continue;
    found.set(cuisine, Math.max(found.get(cuisine) || 0, 0.7));
    if (!sources.includes("name")) sources.push("name");
  }
  // 3. existing Wayfind editorial — prose a human or the verifier already checked.
  if (editorial) {
    for (const { cuisine, rx } of NAME_CUISINE) {
      if (blocked.has(cuisine) || !rx.test(editorial)) continue;
      found.set(cuisine, Math.max(found.get(cuisine) || 0, 0.55));
      if (!sources.includes("editorial")) sources.push("editorial");
    }
  }

  if (!found.size) return { cuisines: [], confidence: 0, sources: [], reason: "unclassifiable" };
  const specific = [...found.keys()].filter((c) => !GENERIC.has(c));
  const keep = specific.length ? specific : [...found.keys()];
  const cuisines = keep.sort((a, b) => (found.get(b) - found.get(a)) || a.localeCompare(b));
  return {
    cuisines,
    confidence: Math.max(...cuisines.map((c) => found.get(c))),
    sources,
    reason: specific.length ? "classified" : "generic-only",
  };
}

/** Below this, the cron re-checks rather than trusting. */
export const LOW_CONFIDENCE = 0.7;

/** Every cuisine this module can ever emit — the closed vocabulary. */
export const ALL_CUISINES = Object.freeze(
  [...new Set([...Object.values(TYPE_CUISINE), ...NAME_CUISINE.map((n) => n.cuisine)])].sort()
);
