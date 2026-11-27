// lib/groupVoteSmartSearch.js — plain-language search for the Group Vote
// place picker (owner, 2026-11-27: "turn open ai into this feature"; the
// picker answered "somewhere fun" with "No spots or experiences matched").
//
// How it stays honest:
//   1. OpenAI never names a place. It only translates the ask ("somewhere
//      fun", "date night", "rainy day with kids") into place TYPES picked from
//      a closed list (SMART_TYPES) plus up to two tour words. Anything outside
//      the list is dropped, so the model cannot invent a category either.
//   2. The places come from Wayfind's own inventory (wf_inventory), read by
//      lib/groupPlanPlaceData.js smartSearch: operational, not excluded, near
//      the organizer, ranked by rating weighted by review count.
//   3. The label shown to the organizer is built HERE from the type list,
//      never from model text, so no AI wording reaches the page.
//
// Money and failure:
//   - The OpenAI call goes through lib/openAiCopy.js, lane "group_search"
//     (its own monthly cap, the account-wide OPENAI_MONTHLY_REQUEST_CAP, the
//     shared breaker and WAYFIND_GATE). Nothing here can spend unmetered.
//   - Each normalized ask is cached for 30 days (lib/serverCache.js), so a
//     common ask costs one call ever, not one per organizer.
//   - Common asks are answered by RULES first and never reach OpenAI.
//   - If OpenAI is off, capped, slow or returns junk, the rules answer (or
//     the caller's keyword search) stands. Nothing here throws.

export const GROUP_SEARCH_LANE = "group_search";
export const SMART_CACHE_TTL_MS = 30 * 86400000;
const CACHE_PREFIX = "gvs1|";

// The closed vocabulary: Google primary types that exist in Wayfind's
// inventory (checked against wf_inventory 2026-11-27) and suit a group outing.
// Value = the plural phrase used in the label the organizer reads.
export const SMART_TYPES = Object.freeze({
  video_arcade: "arcades",
  bowling_alley: "bowling",
  miniature_golf_course: "mini golf",
  amusement_center: "fun centers and escape rooms",
  amusement_park: "amusement parks",
  water_park: "water parks",
  go_karting_venue: "go karts",
  indoor_golf_course: "indoor golf",
  adventure_sports_center: "adventure parks",
  indoor_playground: "indoor play spaces",
  playground: "playgrounds",
  karaoke: "karaoke",
  comedy_club: "comedy clubs",
  live_music_venue: "live music",
  movie_theater: "movie theaters",
  performing_arts_theater: "theaters",
  night_club: "night clubs",
  cocktail_bar: "cocktail bars",
  wine_bar: "wine bars",
  lounge_bar: "lounges",
  bar: "bars",
  pub: "pubs",
  sports_bar: "sports bars",
  brewery: "breweries",
  beer_garden: "beer gardens",
  winery: "wineries",
  museum: "museums",
  art_museum: "art museums",
  history_museum: "history museums",
  art_gallery: "art galleries",
  planetarium: "planetariums",
  aquarium: "aquariums",
  zoo: "zoos",
  botanical_garden: "gardens",
  park: "parks",
  state_park: "state parks",
  nature_preserve: "nature preserves",
  hiking_area: "hiking spots",
  beach: "beaches",
  marina: "marinas",
  scenic_spot: "scenic spots",
  observation_deck: "lookouts",
  tourist_attraction: "attractions",
  historical_landmark: "landmarks",
  spa: "spas",
  fine_dining_restaurant: "fine dining",
  restaurant: "restaurants",
  seafood_restaurant: "seafood",
  italian_restaurant: "Italian",
  steak_house: "steakhouses",
  sushi_restaurant: "sushi",
  mexican_restaurant: "Mexican",
  brunch_restaurant: "brunch",
  breakfast_restaurant: "breakfast",
  family_restaurant: "family restaurants",
  pizza_restaurant: "pizza",
  coffee_shop: "coffee shops",
  dessert_shop: "dessert",
  ice_cream_shop: "ice cream",
  farmers_market: "farmers markets",
  shopping_mall: "shopping",
  fishing_charter: "fishing charters",
});
const TYPE_SET = new Set(Object.keys(SMART_TYPES));

// Rules for the asks people type most. Checked before OpenAI; a match costs
// nothing. Each rule: words that must appear (any one of `any`) → types.
const RULES = [
  { any: ["fun", "entertain", "something to do", "things to do", "activity", "activities", "bored"], types: ["video_arcade", "bowling_alley", "miniature_golf_course", "amusement_center", "go_karting_venue", "indoor_golf_course"] },
  { any: ["date night", "date", "romantic", "anniversary"], types: ["fine_dining_restaurant", "cocktail_bar", "wine_bar", "italian_restaurant", "lounge_bar"] },
  { any: ["rainy", "rain", "indoor", "inside"], types: ["museum", "aquarium", "bowling_alley", "video_arcade", "indoor_playground", "movie_theater"] },
  { any: ["kids", "kid", "family", "children", "toddler"], types: ["indoor_playground", "aquarium", "zoo", "miniature_golf_course", "amusement_center", "playground"] },
  { any: ["drinks", "drink", "happy hour", "night out", "nightlife", "party"], types: ["cocktail_bar", "bar", "brewery", "lounge_bar", "night_club"] },
  { any: ["outdoor", "outdoors", "nature", "outside", "hike", "hiking"], types: ["park", "state_park", "nature_preserve", "hiking_area", "beach", "botanical_garden"] },
  { any: ["beer"], types: ["brewery", "beer_garden", "pub"] },
  { any: ["wine"], types: ["wine_bar", "winery"] },
  { any: ["chill", "relax", "relaxing", "low key", "lowkey"], types: ["coffee_shop", "wine_bar", "beer_garden", "park", "spa"] },
  { any: ["live music", "music", "concert"], types: ["live_music_venue", "bar", "brewery"] },
  { any: ["comedy", "laugh"], types: ["comedy_club"] },
  { any: ["culture", "art", "history"], types: ["museum", "art_museum", "art_gallery", "history_museum"] },
  { any: ["dinner", "eat", "food", "hungry"], types: ["restaurant", "seafood_restaurant", "italian_restaurant", "steak_house"] },
  { any: ["brunch"], types: ["brunch_restaurant", "breakfast_restaurant"] },
  { any: ["breakfast"], types: ["breakfast_restaurant", "brunch_restaurant"] },
  { any: ["coffee"], types: ["coffee_shop"] },
  { any: ["dessert", "sweet"], types: ["dessert_shop", "ice_cream_shop"] },
  { any: ["water", "boat", "beach day"], types: ["beach", "marina", "water_park"] },
];

// Tour words the model may return for wf_experiences (Viator) matching.
const TOUR_WORD = /^[a-z]{3,20}$/;

/** Lowercase, collapse spaces, strip punctuation. PURE. */
export function normalizeAsk(q) {
  return String(q || "").toLowerCase().replace(/[^a-z0-9\s'&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function hasWord(text, phrase) {
  if (phrase.includes(" ")) return (" " + text + " ").includes(" " + phrase + " ");
  return new RegExp(`(^|\\s)${phrase.replace(/[^a-z]/g, "")}(s|es)?(\\s|$)`).test(text);
}

/** Rules answer for an ask, or null. PURE. Order-preserving, deduped, max 6. */
export function rulesForAsk(q) {
  const text = normalizeAsk(q);
  if (!text) return null;
  const out = [];
  for (const rule of RULES) {
    if (rule.any.some((w) => hasWord(text, w))) for (const t of rule.types) if (!out.includes(t)) out.push(t);
  }
  return out.length ? out.slice(0, 6) : null;
}

/** Keep only allowlisted types and plain tour words. PURE. */
export function validateSmartAnswer(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const types = [];
  for (const raw of Array.isArray(json.types) ? json.types : []) {
    const t = String(raw || "").trim().toLowerCase();
    if (TYPE_SET.has(t) && !types.includes(t)) types.push(t);
    if (types.length >= 6) break;
  }
  const tourWords = [];
  for (const raw of Array.isArray(json.tourWords) ? json.tourWords : []) {
    const w = String(raw || "").trim().toLowerCase();
    if (TOUR_WORD.test(w) && !tourWords.includes(w)) tourWords.push(w);
    if (tourWords.length >= 2) break;
  }
  return types.length ? { types, tourWords } : null;
}

/** The label the organizer reads, built from the types (never model text). PURE. */
export function smartLabel(types) {
  const words = [];
  for (const t of types || []) {
    const w = SMART_TYPES[t];
    if (w && !words.includes(w)) words.push(w);
    if (words.length >= 3) break;
  }
  if (!words.length) return "";
  if (words.length === 1) return words[0];
  return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
}

export const SMART_SYSTEM = [
  "You turn a person's loose request for a group outing into place categories.",
  "Pick 2 to 6 values for \"types\" ONLY from this exact list:",
  Object.keys(SMART_TYPES).join(", ") + ".",
  "Optionally add up to 2 single lowercase words in \"tourWords\" for guided tours that fit (for example kayak, boat, food, dolphin, ghost), or an empty list.",
  "Never name a business. Never add a value that is not in the list.",
  "If the request is not about going somewhere, return {\"types\":[],\"tourWords\":[]}.",
  "Return JSON only: {\"types\":[...],\"tourWords\":[...]}",
].join(" ");

/**
 * Understand one ask. Resolves { types, tourWords, label, source } where
 * source is "cache" | "rules" | "openai" | "none". Never throws.
 * deps are injectable for tests.
 */
export async function understandGroupAsk(query, deps = {}) {
  const text = normalizeAsk(query);
  const none = { types: [], tourWords: [], label: "", source: "none" };
  if (text.length < 2) return none;
  const rules = rulesForAsk(text);
  if (rules) return { types: rules, tourWords: [], label: smartLabel(rules), source: "rules" };
  try {
    const cache = deps.cache || (await import("./serverCache.js"));
    const key = CACHE_PREFIX + text;
    const hit = await cache.cget(key).catch(() => null);
    if (hit && hit.v && Array.isArray(hit.v.types)) {
      return { types: hit.v.types, tourWords: hit.v.tourWords || [], label: smartLabel(hit.v.types), source: hit.v.types.length ? "cache" : "none" };
    }
    const ai = deps.openAiCopy || (await import("./openAiCopy.js")).openAiCopy;
    const res = await ai(GROUP_SEARCH_LANE, { system: SMART_SYSTEM, user: JSON.stringify({ request: text }), json: true, temperature: 0 });
    if (!res || !res.ok) return none; // a failed call is not cached: it may work next time
    const valid = validateSmartAnswer(res.json);
    const stored = valid || { types: [], tourWords: [] };
    // An empty answer is cached too, so a nonsense ask cannot cost twice.
    try { await cache.cset(key, stored, SMART_CACHE_TTL_MS); } catch { /* best effort */ }
    if (!valid) return none;
    return { ...valid, label: smartLabel(valid.types), source: "openai" };
  } catch {
    return none;
  }
}

// Shown when nothing matched, so the picker never dead-ends. Tapping one runs
// that search. Every entry is answered by the rules above or keyword search.
export const PICKER_SUGGESTIONS = Object.freeze(["Somewhere fun", "Date night", "Rainy day with kids", "Drinks", "Brunch", "Outdoors"]);

/** Rank inventory rows: rating weighted by review count, then nearer. PURE. */
export function rankSmartRows(rows, near, milesOf) {
  const prior = 4.2, weight = 50;
  return (rows || [])
    .map((r) => {
      const rating = Number(r?.signals?.rating), reviews = Number(r?.signals?.reviews) || 0;
      const bayes = Number.isFinite(rating) ? (rating * reviews + prior * weight) / (reviews + weight) : 0;
      return { r, bayes, dist: milesOf(near, r) };
    })
    .filter((x) => x.dist !== null)
    .sort((a, b) => (b.bayes - a.bayes) || (a.dist - b.dist) || String(a.r.place_id).localeCompare(String(b.r.place_id)))
    .map((x) => x.r);
}
