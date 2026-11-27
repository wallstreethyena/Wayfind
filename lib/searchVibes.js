// lib/searchVibes.js — Florida "vibe" searches: hidden springs, family beaches.
//
// Owner ask (2026-11-27): let people search Florida by vibe ("hidden springs",
// "family beaches") and get real places back. These phrases did not match the
// phrase map (lib/searchIntent.js), so they fell to a generic text match.
//
// THE RULE: a place gets a vibe only when OUR OWN DATA says so. Nothing here
// calls a model, and nothing here invents a place, a label or a claim:
//   springs        the place's own name is "<Something> Spring(s)" (Blue
//                  Spring, Wekiwa Springs) and its type is outdoors (park,
//                  state park, preserve, refuge, trail, campground,
//                  attraction). City and brand names that merely contain the
//                  word ("Tarpon Springs Sponge Docks", "Disney Springs",
//                  "Spring Hill Pink Dinosaur") are not springs.
//   hidden         we cannot know what is "hidden", so we say nothing about
//                  it: a hidden/secret/quiet/less-crowded spring search orders
//                  well-rated springs by FEWER reviews first (a real crowd
//                  signal), with a quality floor. No card claims "hidden".
//   family beach   a beach whose own editorial text says it is good for
//                  families (family friendly, great for kids, playground,
//                  lifeguards on duty, calm shallow water) and does not warn
//                  against it (rip currents, no lifeguard, not for kids).
//                  Those beaches lead; other beaches follow with no family
//                  claim, so a city with few such beaches still answers.
//                  "Beach" means Google's own beach type, never our stored
//                  category (which also holds a casino named "... Beach").
//                  Nude / clothing-optional beaches never appear.
//
// PURE, IMPORT-FREE: scripts/test-search-vibes.mjs imports and calls it.

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const HIDDEN_WORDS = "hidden|secret|quiet|quieter|lesser known|less known|less crowded|uncrowded|not crowded|off the beaten path|underrated|local";
const SPRING_LEAD = `(?:(?:best|top|great|good|cool|${HIDDEN_WORDS}|natural|freshwater|fresh water|crystal clear|clear|clear water|swimming|swimmable|cold|blue|florida|beautiful|pretty)\\s+)*`;
const SPRING_TAIL = "(?:\\s+(?:to swim|to swim in|for swimming|to visit|to see|to go to|for kids|with kids|for families|for the family|to kayak|for kayaking|to snorkel|for snorkeling|with manatees|day trip|day trips|near me|nearby|around here))?";
const SPRINGS_RX = new RegExp(`^${SPRING_LEAD}springs${SPRING_TAIL}$`);
// "hidden spring" (singular) only WITH a qualifier: a bare "spring" is a season.
const SPRING_ONE_RX = new RegExp(`^(?:(?:${HIDDEN_WORDS}|natural|freshwater|swimming)\\s+)+spring${SPRING_TAIL}$`);
const SPRING_SWIM_RX = /^(?:swimming|swim|tubing|kayaking|snorkeling|paddling) (?:in |at )?(?:the |a )?(?:natural )?springs?$/;
const HIDDEN_RX = new RegExp(`\\b(?:${HIDDEN_WORDS})\\b`);

const FAMILY_WORDS = "family|family friendly|kid friendly|kids friendly|kid|kids|toddler|toddler friendly|child friendly|children";
const BEACH_LEAD = "(?:(?:best|top|great|good|calm|quiet|safe|safest|easy)\\s+)*";
const FAMILY_BEACH_RX = new RegExp(`^${BEACH_LEAD}(?:${FAMILY_WORDS})\\s+(?:friendly\\s+)?beach(?:es)?$`);
const BEACH_FOR_FAMILY_RX = /^(?:(?:best|top|great|good|calm|quiet|safe|safest)\s+)*beach(?:es)? (?:for|with) (?:the |my |our |small |young |little )?(?:kids|families|family|toddlers|children|little ones)$/;

/**
 * The vibe in a search's text (city already removed), or null.
 * { id: "springs" | "family-beaches", hidden: boolean }
 */
export function detectSearchVibe(text) {
  const t = normalize(text);
  if (!t || t.length > 80) return null;
  if (SPRINGS_RX.test(t) || SPRING_ONE_RX.test(t) || SPRING_SWIM_RX.test(t)) {
    return { id: "springs", hidden: HIDDEN_RX.test(t) };
  }
  if (FAMILY_BEACH_RX.test(t) || BEACH_FOR_FAMILY_RX.test(t)) {
    return { id: "family-beaches", hidden: false };
  }
  return null;
}

// Place and brand names that contain "Spring(s)" and are not springs.
const NOT_A_SPRING_NAME = /\b(?:tarpon|altamonte|winter|coral|green cove|sarasota|palm|disney|howey in the hills|crystal springs village|spring hill|spring garden|spring lake|springs? village|springtime)\b(?:\s+springs?)?/g;
const SPRING_IN_NAME = /\b[a-z][a-z.'-]*\s+springs?\b/;
const OUTDOOR_TYPES = new Set([
  "park", "city_park", "state_park", "national_park", "natural_feature", "nature_preserve",
  "wildlife_refuge", "wildlife_park", "hiking_area", "campground", "picnic_ground",
  "tourist_attraction", "scenic_spot", "historical_landmark", "visitor_center",
]);
const NOT_OUTDOOR_CATEGORIES = new Set(["food", "shopping", "hotels", "nightlife", "services", "health"]);

function typesOf(row) {
  const list = [];
  const primary = String(row.primary_type || row.primaryType || "").toLowerCase();
  if (primary) list.push(primary);
  for (const t of row.google_types || row.types || []) list.push(String(t).toLowerCase());
  return list;
}

/** True when the row's own name and type say it is a natural spring. */
export function isNaturalSpring(row) {
  if (!row || typeof row !== "object") return false;
  const name = normalize(row.name);
  if (!name || /^springs?\b/.test(name)) return false;
  const cleaned = name.replace(NOT_A_SPRING_NAME, " ").replace(/\s+/g, " ").trim();
  if (!SPRING_IN_NAME.test(cleaned)) return false;
  if (NOT_OUTDOOR_CATEGORIES.has(String(row.category || "").toLowerCase())) return false;
  const types = typesOf(row);
  if (types.includes("water_park") || types.includes("amusement_park")) return false;
  const primary = types[0] || "";
  return OUTDOOR_TYPES.has(primary);
}

// The spring a row belongs to ("rainbow springs" for its campground, visitor
// center and tubing rows), so one spring shows once.
export function springKey(row) {
  const cleaned = normalize(row && row.name).replace(NOT_A_SPRING_NAME, " ").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/\b([a-z][a-z.'-]*)\s+springs?\b/);
  return m ? `${m[1]} spring` : null;
}

const NOT_FAMILY_BEACH = /\b(?:nude|naturist|clothing optional|adults only)\b/;

/**
 * True for a beach. Google's own type only: the stored category "beach" also
 * holds anything whose name says Beach (a casino, a concert hall, an escape
 * room in Miami Beach), so it is not evidence of a beach.
 */
export function isBeachRow(row) {
  if (!row || typeof row !== "object") return false;
  return typesOf(row).includes("beach");
}

const FAMILY_YES = /\b(?:family friendly|kid friendly|great for (?:kids|families|children|little ones)|good for (?:kids|families|children)|ideal for (?:kids|families|children)|perfect for (?:kids|families|children)|popular with families|families love|kids love|playgrounds?|lifeguards? (?:on duty|stations?|present|in season)|calm,? shallow|shallow,? calm|calm waters?|gentle waves|shallow waters?)\b/;
const FAMILY_NO = /\b(?:no lifeguards?|not (?:ideal|great|good|suitable|recommended|safe) for (?:kids|children|families|swimming)|rip currents?|strong currents?|dangerous currents?|clothing optional|nude beach|adults only)\b/;

function editorialText(row) {
  const parts = [];
  if (typeof row.editorial === "string") parts.push(row.editorial);
  const card = row.editorial_card;
  if (card && typeof card === "object") {
    for (const key of ["bestFor", "vibeCheck", "knownFor", "whyGo", "insiderMove", "watchOut", "currentUsefulDetail"]) {
      const v = card[key];
      if (typeof v === "string") parts.push(v);
      else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === "string").join(" "));
    }
  }
  return normalize(parts.join(" "));
}

/** True when the beach's own editorial text says families do well there and nothing warns against it. */
export function hasFamilyBeachEvidence(row) {
  if (!isBeachRow(row) || NOT_FAMILY_BEACH.test(normalize(row.name))) return false;
  const text = editorialText(row);
  if (!text) return false;
  return FAMILY_YES.test(text) && !FAMILY_NO.test(text);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function milesTo(row, city) {
  const lat = num(row.lat), lng = num(row.lng);
  if (lat == null || lng == null || !city) return null;
  const p = Math.PI / 180;
  const dLat = (lat - city.lat) * p;
  const dLng = (lng - city.lng) * p;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(city.lat * p) * Math.cos(lat * p) * Math.sin(dLng / 2) ** 2;
  return (2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)))) / 1609.344;
}

export const VIBE_RADIUS_MI = Object.freeze({ springs: 100, "family-beaches": 40 });
// A "hidden" spring is a well-rated one fewer people review. The floor keeps
// an unknown, unrated or poorly rated spot from leading just for being empty.
export const HIDDEN_MIN_RATING = 4.4;
export const HIDDEN_MIN_REVIEWS = 50;

function ratingOf(row) {
  const s = row.signals || {};
  return num(s.rating != null ? s.rating : row.rating) || 0;
}
function reviewsOf(row) {
  const s = row.signals || {};
  return num(s.reviews != null ? s.reviews : row.reviews) || 0;
}

/**
 * Rows → the vibe's places, best first. Every row returned passed the vibe's
 * evidence rule (family beaches: evidence rows first, then other beaches).
 * Rows must already be operational, not excluded and rated (the caller's
 * serving gate); this only applies the vibe.
 */
export function selectVibeRows(rows, vibe, city, { limit = 12 } = {}) {
  if (!vibe || !Array.isArray(rows) || !city) return [];
  const radius = VIBE_RADIUS_MI[vibe.id] || 40;
  const seen = new Set();
  const within = [];
  for (const row of rows) {
    if (!row || !row.place_id || seen.has(row.place_id)) continue;
    const d = milesTo(row, city);
    if (d == null || d > radius) continue;
    seen.add(row.place_id);
    within.push({ row, d });
  }
  const quality = (x) => ratingOf(x.row) * Math.log10(1 + reviewsOf(x.row)) - x.d / 40;
  const onePerSpring = (list) => {
    const keys = new Set();
    return list.filter((x) => {
      const key = springKey(x.row);
      if (!key || keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  };
  if (vibe.id === "springs") {
    const springs = within.filter((x) => isNaturalSpring(x.row));
    if (vibe.hidden) {
      const quiet = springs.filter((x) => ratingOf(x.row) >= HIDDEN_MIN_RATING && reviewsOf(x.row) >= HIDDEN_MIN_REVIEWS);
      // Best-known row of each spring first, so the spring's main entry stands for it.
      const main = onePerSpring([...quiet].sort((a, b) => quality(b) - quality(a)));
      main.sort((a, b) => reviewsOf(a.row) - reviewsOf(b.row) || a.d - b.d);
      return main.slice(0, limit).map((x) => x.row);
    }
    springs.sort((a, b) => quality(b) - quality(a));
    return onePerSpring(springs).slice(0, limit).map((x) => x.row);
  }
  if (vibe.id === "family-beaches") {
    const beaches = within.filter((x) => isBeachRow(x.row) && !NOT_FAMILY_BEACH.test(normalize(x.row.name)) && !NOT_FAMILY_BEACH.test(editorialText(x.row)));
    const family = beaches.filter((x) => hasFamilyBeachEvidence(x.row)).sort((a, b) => quality(b) - quality(a));
    const rest = beaches.filter((x) => !hasFamilyBeachEvidence(x.row)).sort((a, b) => quality(b) - quality(a));
    return [...family, ...rest].slice(0, limit).map((x) => x.row);
  }
  return [];
}

/** The PostgREST filter that narrows the read to the vibe's candidates. */
export function vibeCandidateFilter(vibe) {
  if (!vibe) return null;
  if (vibe.id === "springs") return "(name.ilike.*spring*)";
  if (vibe.id === "family-beaches") return "(primary_type.eq.beach,google_types.cs.{beach})";
  return null;
}
