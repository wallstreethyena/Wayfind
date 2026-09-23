// lib/eventOuting.js — THE BEFORE/AFTER OUTING ENGINE.
//
// OWNER RULE (2026-09-22): every event page recommends places for BEFORE and
// AFTER that event based on what people actually do — never a generic
// top-rated list. A "Nearby places" shelf sorted only by Wayfind Score
// answered the wrong question: nobody asks "what's the best-rated restaurant
// within 12 miles of this arena," they ask "where do I eat before the show"
// and "where do people go after." Those two questions have different answers
// for a symphony, a food festival, a kids' matinee and a 21+ hip-hop show —
// this module is what tells them apart and slots real, already-scored
// candidates (never invents a place or a score) into "before" and "after"
// picks that match the event.
//
// Research sources for the archetype/slot judgment calls below live in
// docs/proposals/events-outing-intelligence.md, and the guard that proves
// this module behaves is scripts/check-event-outing.mjs.
//
// PURE. No I/O, no React, no clock read. Everything here is a function of the
// event fields and the candidate rows it is handed — server-only usage
// (lib/eventPairings.js, lib/eventPairingsCache.js).
//
// HONESTY RULES, same family as lib/eventPairings.js's:
//   1. NEVER CLAIM HOURS. Inventory carries no open/close data. Nothing here
//      may say "open late," "open now" or "hours" — the timing judgment is
//      about the EVENT's schedule, never a claim about the place's.
//   2. NO INVENTED PLACES OR SCORES. Every row this module returns is a row
//      it was handed, stamped with WHY it was picked (a slot), never a
//      manufactured one.
//   3. NO DASHES IN READER-FACING COPY (owner rule). Slot labels and rail
//      copy read as plain sentences; grep for "-", "–", "—" is a
//      guard assertion, not a style suggestion.

// ---------------------------------------------------------------- classify

function normalizeEvent(e) {
  const ev = e || {};
  return {
    name: String(ev.name || ev.event_name || ""),
    time: String(ev.time || ev.start_time || ""),
    date: String(ev.date || ev.start_date || ""),
    endDate: String(ev.end_date || ev.endDate || ""),
    segment: String(ev.segment || ""),
    genre: String(ev.genre || ""),
    category: String(ev.category || ""),
    subcategory: String(ev.subcategory || ""),
    tags: Array.isArray(ev.tags) ? ev.tags.map(String) : [],
    audience: Array.isArray(ev.audience) ? ev.audience.map(String) : [],
    minimumAge: ev.minimum_age != null && Number.isFinite(Number(ev.minimum_age)) ? Number(ev.minimum_age) : null,
  };
}

// <11 morning, <16 day, <20 evening, >=20 late. Missing time falls back to
// the event's shape: a multi day spread or a festival/market row is allDay;
// otherwise Music/Arts/Sports/Comedy lean evening and everything else
// (Family/Community, unknown) lands on day — the safe generic default.
function computeDaypart(n) {
  const m = /^(\d{1,2}):(\d{2})/.exec(n.time.trim());
  if (m) {
    const hh = Number(m[1]);
    if (hh < 11) return { daypart: "morning", allDay: false };
    if (hh < 16) return { daypart: "day", allDay: false };
    if (hh < 20) return { daypart: "evening", allDay: false };
    return { daypart: "late", allDay: false };
  }
  const spansDays = !!(n.date && n.endDate && n.endDate > n.date);
  const festivalish = /festival|market/i.test(n.category) || /festival|market/i.test(n.subcategory);
  if (spansDays || festivalish) return { daypart: "day", allDay: true };
  const seg = String(n.segment || n.category || "");
  if (/^(music|arts|arts & theatre|arts and theatre|sports|comedy)$/i.test(seg)) return { daypart: "evening", allDay: false };
  return { daypart: "day", allDay: false };
}

function computeFamily(n) {
  if (/^family$/i.test(n.segment)) return true;
  if (n.audience.some((a) => /family|kids/i.test(a))) return true;
  if (/^family[-_]|^pumpkin[-_]patch$|^holiday[-_]lights$|^parade$|^kids$/i.test(n.subcategory)) return true;
  const hay = `${n.genre} ${n.name}`;
  if (/kids|children|family|disney on ice|sesame|paw patrol/i.test(hay)) return true;
  return false;
}

function computeAdult(n) {
  if (n.minimumAge != null && n.minimumAge >= 18) return true;
  if (/hip.?hop|edm|electronic|dance|club|bar.?crawl/i.test(n.genre)) return true;
  if (n.tags.some((t) => /21\+/.test(t))) return true;
  return false;
}

function computeComedy(n) {
  return /comedy/i.test(n.segment) || /comedy/i.test(n.genre) || /comedy/i.test(n.category) || /comedy/i.test(n.name);
}

// Already-fed events invert the model: attendees showed up to eat/drink, so
// the "before" meal never fires and "after" is coffee/dessert/low-key only
// (SLOT_TABLE.festival_fed).
function computeAlreadyFed(n) {
  if (/^food$/i.test(n.category)) return true;
  if (/^food[-_]festival$|wine.?festival|beer.?festival|seafood.?festival|food[-_]wine[-_]festival|^bar[-_]crawl$|^market$|^farmers[-_]market$|^night[-_]market$/i.test(n.subcategory)) return true;
  if (/food (festival|truck)|wine fest|beer fest|brew fest|taste of|seafood fest/i.test(n.name)) return true;
  return false;
}

function computeSports(n) {
  const seg = String(n.segment || n.category || "").toLowerCase();
  if (seg === "sports") return true;
  // Only lean on the name when neither field told us — " vs "/" vs. " is the
  // one pattern common to every league's matchup naming and rare elsewhere.
  if (!n.segment && !n.category && /\bvs\.?\s/i.test(n.name)) return true;
  return false;
}

function computeTheater(n) {
  const hay = `${n.genre} ${n.name} ${n.segment} ${n.category}`;
  return /theatre|theater|musical|broadway|ballet|opera|symphony|orchestra|philharmonic|jazz|classical/i.test(hay);
}

function resolveArchetype(n, f) {
  if (f.comedy) return "comedy";
  if (f.sports) return f.daypart === "evening" || f.daypart === "late" ? "sports_night" : "sports_day";
  if (f.alreadyFed) return "festival_fed";
  if (f.theater) return f.daypart === "morning" || f.daypart === "day" ? "show_matinee" : "show_classy";
  if (f.family) return f.daypart === "morning" || f.daypart === "day" || f.allDay ? "family_day" : "family_evening";
  if (f.allDay) return "festival_allday";
  const genreHay = n.genre.toLowerCase();
  if (f.adult && /hip.?hop|edm|electronic|dance|club/i.test(genreHay)) return "club_night";
  if (/country|jam band|\bjam\b|reggae|bluegrass|folk|americana/i.test(genreHay)) return "country_jam";
  const segLower = String(n.segment || n.category || "").toLowerCase();
  if (segLower === "music") return "concert_evening";
  return f.daypart === "morning" || f.daypart === "day" ? "generic_day" : "generic_evening";
}

/**
 * One event -> the shape everything else in this module keys off.
 * @param {object} e live fields (name,date,time,segment,genre) or curated
 *   fields (event_name, category, subcategory, tags, audience, minimum_age,
 *   start_date, end_date, start_time) — either shape is read.
 * @returns {{archetype:string, daypart:string, allDay:boolean, family:boolean, adult:boolean, alreadyFed:boolean}}
 */
export function classifyEvent(e) {
  const n = normalizeEvent(e);
  const { daypart, allDay } = computeDaypart(n);
  const family = computeFamily(n);
  const adult = computeAdult(n);
  const comedy = computeComedy(n);
  const alreadyFed = computeAlreadyFed(n);
  const sports = computeSports(n);
  const theater = computeTheater(n);
  const archetype = resolveArchetype(n, { daypart, allDay, family, adult, comedy, alreadyFed, sports, theater });
  return { archetype, daypart, allDay, family, adult, alreadyFed };
}

/** A short, deterministic string identity for one classification — two
 *  events that classify the same way get the same outing picks, so this is
 *  what lib/eventPairingsCache.js keys the Data Cache on in addition to the
 *  venue's coordinates. */
export function outingCacheKey(ctx) {
  const c = ctx || {};
  return [c.archetype || "generic_evening", c.daypart || "day", c.allDay ? 1 : 0, c.family ? 1 : 0, c.adult ? 1 : 0, c.alreadyFed ? 1 : 0].join("|");
}

// -------------------------------------------------------------- slot table

const DINNER_PRIMARY = ["restaurant", "steak_house"];
const DINNER_ANY = ["italian_restaurant", "mexican_restaurant", "american_restaurant", "seafood_restaurant", "sushi_restaurant", "french_restaurant", "asian_restaurant", "mediterranean_restaurant", "fine_dining_restaurant", "japanese_restaurant", "thai_restaurant", "chinese_restaurant", "indian_restaurant", "greek_restaurant", "spanish_restaurant", "brazilian_restaurant", "vietnamese_restaurant", "korean_restaurant", "hamburger_restaurant", "barbecue_restaurant"];
const CLASSY_DINNER_PRIMARY = ["restaurant", "fine_dining_restaurant", "steak_house"];
const CLASSY_DINNER_ANY = ["french_restaurant", "italian_restaurant", "seafood_restaurant", "japanese_restaurant", "mediterranean_restaurant"];
const CASUAL_DINNER_ANY = ["barbecue_restaurant", "hamburger_restaurant", "american_restaurant", "pizza_restaurant", "mexican_restaurant"];
const FAMILY_LUNCH_PRIMARY = ["restaurant", "family_restaurant"];
const FAMILY_LUNCH_ANY = ["pizza_restaurant", "hamburger_restaurant", "american_restaurant", "breakfast_restaurant", "brunch_restaurant"];
const BREAKFAST_PRIMARY = ["breakfast_restaurant", "brunch_restaurant"];
const BREAKFAST_ANY = ["cafe", "bakery", "diner"];

const PREGAME_BAR_PRIMARY = ["bar", "pub"];
const PREGAME_BAR_ANY = ["irish_pub", "brewery", "brewpub", "sports_bar", "bar_and_grill", "gastropub"];
const SPORTS_BAR_PRIMARY = ["sports_bar"];

const LATE_NIGHT_PRIMARY = ["pizza_restaurant", "fast_food_restaurant"];
const LATE_NIGHT_ANY = ["diner", "hamburger_restaurant", "mexican_restaurant", "taco_restaurant"];

const NIGHTCAP_PRIMARY = ["cocktail_bar", "wine_bar"];
const NIGHTCAP_ANY = ["bar", "lounge"];
const WINE_BAR_PRIMARY = ["wine_bar"];
const WINE_BAR_ANY = ["cocktail_bar", "lounge"];
const LOUNGE_PRIMARY = ["cocktail_bar", "lounge"];
const LOUNGE_ANY = ["bar", "wine_bar"];
const NIGHTCLUB_PRIMARY = ["night_club"];
const NIGHTCLUB_ANY = ["lounge", "cocktail_bar", "dance_hall"];

const SWEET_PRIMARY = ["ice_cream_shop", "dessert_shop"];
const SWEET_ANY = ["bakery", "cafe", "coffee_shop", "donut_shop", "candy_store", "chocolate_shop", "frozen_yogurt_shop", "juice_shop", "patisserie", "cake_shop"];
const COFFEE_PRIMARY = ["cafe", "coffee_shop"];
const COFFEE_ANY = ["bakery", "donut_shop"];
const PARK_PRIMARY = ["park", "playground"];

// festival_fed inverts the meal model — a full restaurant identity of ANY
// kind is excluded, whatever a slot's own exclude list adds on top.
const MEAL_EXCLUDE = ["restaurant", "steak_house", "fine_dining_restaurant", "family_restaurant", "italian_restaurant", "mexican_restaurant", "american_restaurant", "seafood_restaurant", "sushi_restaurant", "french_restaurant", "asian_restaurant", "mediterranean_restaurant", "japanese_restaurant", "thai_restaurant", "chinese_restaurant", "indian_restaurant", "greek_restaurant", "spanish_restaurant", "brazilian_restaurant", "vietnamese_restaurant", "korean_restaurant", "hamburger_restaurant", "barbecue_restaurant", "pizza_restaurant", "fast_food_restaurant", "diner", "breakfast_restaurant", "brunch_restaurant", "sandwich_shop", "meal_takeaway", "meal_delivery", "food_court"];

// family_* excludes every alcohol-adjacent type, whatever a slot adds.
const ALCOHOL_EXCLUDE = ["bar", "pub", "irish_pub", "brewery", "brewpub", "wine_bar", "cocktail_bar", "night_club", "lounge", "sports_bar", "bar_and_grill", "liquor_store", "adult_entertainment"];

// A second event venue is not a before/after stop, and none of these read as
// "worth going to on the way" for the events this module covers. Applies to
// every archetype except family_day, where park/playground/museum are real
// family destinations (see FAMILY_DAY_AVOID_SET below).
export const AVOID = ["tour_agency", "travel_agency", "boat_tour_agency", "spa", "gym", "fitness_center", "yoga_studio", "wellness_center", "museum", "art_museum", "tourist_attraction", "marina", "dog_park", "hotel", "lodging", "adult_entertainment", "event_venue", "concert_hall", "performing_arts_theater"];
const AVOID_SET = new Set(AVOID);
// family_day is the one archetype whose base AVOID differs from every other
// archetype's (park/playground/museum are real family destinations there).
const FAMILY_DAY_AVOID_SET = new Set(AVOID.filter((t) => t !== "museum"));

/**
 * archetype -> ordered slots. Order is the round-robin fill order (pass 1)
 * and the reading order of "before" then "after" copy in docs — it is not a
 * merchandising ranking within a timing bucket (score decides that).
 */
export const SLOT_TABLE = {
  concert_evening: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "drinks_before", label: "Drinks before", timing: "before", primary: PREGAME_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "late_night_bites", label: "Late night bites", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "nightcap", label: "Nightcap", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
  show_classy: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: CLASSY_DINNER_PRIMARY, any: CLASSY_DINNER_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 1.0, quota: 3 },
    { key: "wine_before", label: "Wine before", timing: "before", primary: WINE_BAR_PRIMARY, any: WINE_BAR_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 1 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 2 },
    { key: "quiet_drink_after", label: "A quiet drink after", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 1 },
  ],
  show_matinee: [
    { key: "lunch_before", label: "Lunch before the show", timing: "before", primary: ["restaurant"], any: [...CLASSY_DINNER_ANY, "cafe"], exclude: ["night_club"], maxMi: 1.0, quota: 3 },
    { key: "coffee_before", label: "Coffee before", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 0.8, quota: 1 },
    { key: "early_dinner_after", label: "Early dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: ["night_club"], maxMi: 1.0, quota: 2 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
  club_night: [
    { key: "lounge_before", label: "Lounge before", timing: "before", primary: LOUNGE_PRIMARY, any: LOUNGE_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "quick_bite_before", label: "Quick bite before", timing: "before", primary: ["restaurant"], any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "after_hours", label: "After hours", timing: "after", primary: NIGHTCLUB_PRIMARY, any: NIGHTCLUB_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
  ],
  country_jam: [
    { key: "casual_bite_before", label: "Casual bite before", timing: "before", primary: ["restaurant", "barbecue_restaurant"], any: ["american_restaurant", "hamburger_restaurant"], exclude: ["fine_dining_restaurant"], maxMi: 1.0, quota: 2 },
    { key: "pregame_drinks", label: "Pregame drinks", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: ["fine_dining_restaurant", "wine_bar"], maxMi: 0.8, quota: 2 },
    { key: "casual_bar_after", label: "Casual bar after", timing: "after", primary: ["bar", "pub"], any: PREGAME_BAR_ANY, exclude: ["fine_dining_restaurant", "wine_bar"], maxMi: 1.0, quota: 2 },
    { key: "late_night_bites", label: "Late night bites", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: ["fine_dining_restaurant"], maxMi: 1.0, quota: 2 },
  ],
  comedy: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "drinks_after", label: "Drinks after", timing: "after", primary: ["bar", "cocktail_bar"], any: ["pub", "lounge", "wine_bar"], exclude: [], maxMi: 0.8, quota: 2 },
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
  ],
  sports_day: [
    { key: "brunch_before", label: "Brunch before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "sports_bar_before", label: "Sports bar before", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "early_dinner_after", label: "Early dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "ice_cream_after", label: "Ice cream after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
  sports_night: [
    { key: "dinner_before", label: "Dinner before the game", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "sports_bar_before", label: "Sports bar before", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "bar_after", label: "Bar after", timing: "after", primary: ["bar", "sports_bar"], any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
  ],
  festival_allday: [
    { key: "coffee_before", label: "Coffee before the gates", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "breakfast_before", label: "Breakfast before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "quick_bite_after", label: "Quick bite after", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
  // Already fed: no restaurant slot exists at all, by construction — every
  // slot here also carries MEAL_EXCLUDE so a mislabeled bistro can't sneak
  // in through a permissive `any` match.
  festival_fed: [
    { key: "coffee_after", label: "Coffee after", timing: "after", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: MEAL_EXCLUDE, maxMi: 1.0, quota: 2 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: MEAL_EXCLUDE, maxMi: 1.0, quota: 2 },
    { key: "low_key_wine_after", label: "A low key wine bar after", timing: "after", primary: WINE_BAR_PRIMARY, any: ["brewery"], exclude: MEAL_EXCLUDE, maxMi: 0.8, quota: 1, adultOnly: true },
    { key: "bakery_after", label: "Bakery after", timing: "after", primary: ["bakery"], any: ["pastry_shop", "donut_shop"], exclude: MEAL_EXCLUDE, maxMi: 1.0, quota: 2 },
  ],
  family_day: [
    { key: "lunch_before", label: "Lunch before", timing: "before", primary: FAMILY_LUNCH_PRIMARY, any: FAMILY_LUNCH_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "breakfast_before", label: "Breakfast before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 2 },
    { key: "ice_cream_after", label: "Ice cream after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "park_time_after", label: "Park time after", timing: "after", primary: PARK_PRIMARY, any: [], exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 2 },
  ],
  family_evening: [
    { key: "dinner_before", label: "Dinner before", timing: "before", primary: FAMILY_LUNCH_PRIMARY, any: FAMILY_LUNCH_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "ice_cream_after", label: "Ice cream after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "dessert_cafe_after", label: "Dessert cafe after", timing: "after", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 2 },
  ],
  generic_evening: [
    { key: "dinner_before", label: "Dinner before", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "drinks_before", label: "Drinks before", timing: "before", primary: PREGAME_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "nightcap", label: "Nightcap", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
  generic_day: [
    { key: "lunch_before", label: "Lunch before", timing: "before", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "coffee_before", label: "Coffee before", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "dinner_after", label: "Dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 1 },
  ],
};

export const OUTING_ARCHETYPES = Object.keys(SLOT_TABLE);

// ------------------------------------------------------------------ copy

const OUTING_COPY = {
  concert_evening: { railTitle: "Make a night of it" },
  club_night: { railTitle: "Make a night of it" },
  country_jam: { railTitle: "Make a night of it" },
  show_classy: { railTitle: "Dinner and a show" },
  show_matinee: { railTitle: "Dinner and a show" },
  sports_day: { railTitle: "Game day, sorted" },
  sports_night: { railTitle: "Game day, sorted" },
  family_day: { railTitle: "Before and after, kid friendly" },
  family_evening: { railTitle: "Before and after, kid friendly" },
  festival_fed: { railTitle: "After you've had your fill" },
  festival_allday: { railTitle: "Before the gates, after the encore" },
  comedy: { railTitle: "Dinner, laughs, drinks" },
  generic_evening: { railTitle: "Make an outing of it" },
  generic_day: { railTitle: "Make an outing of it" },
};
const OUTING_RAIL_NOTE = "Picks for before and after, ranked by Wayfind Score and walking distance.";

/** archetype -> the rail's title + note. Never mentions hours — inventory
 *  carries none, so nothing here may claim "open late" or "open now". */
export function outingCopy(archetype) {
  const hit = OUTING_COPY[archetype] || OUTING_COPY.generic_evening;
  return { railTitle: hit.railTitle, railNote: OUTING_RAIL_NOTE };
}

// --------------------------------------------------------------- fill

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const MAX_OVERALL_MI = 12; // pass 3's widen, and pass 4's overflow, both stop here
const TYPE_CAP = 3; // "no more than 3 of the same primaryType"

function typesOf(c) {
  return Array.isArray(c.types) ? c.types : [];
}

/** 1 exact primaryType match, 0.6 a secondary/either-list match, 0 ineligible. */
function candidateFit(c, slot) {
  const primary = c.primaryType || "";
  if (slot.primary.includes(primary)) return 1;
  const pool = slot._pool || (slot._pool = new Set([...(slot.primary || []), ...(slot.any || [])]));
  if (pool.has(primary)) return 0.6;
  if (typesOf(c).some((t) => pool.has(t))) return 0.6;
  return 0;
}

/** True when the AVOID set or (unless bypassed) the slot's own exclude list
 *  vetoes this candidate for this slot. `ignoreSlotExclude` exists ONLY for
 *  scripts/check-event-outing.mjs's red-proof — production never sets it. */
function candidateExcluded(c, slot, avoidSet, ignoreSlotExclude) {
  const primary = c.primaryType || "";
  const types = typesOf(c);
  if (avoidSet.has(primary) || types.some((t) => avoidSet.has(t))) return true;
  if (ignoreSlotExclude) return false;
  const ex = slot.exclude || [];
  if (!ex.length) return false;
  return ex.includes(primary) || types.some((t) => ex.includes(t));
}

function scoreFor(c, fit, effMaxMi) {
  const gov = Number(c.governed_score) || 0;
  const distScore = Math.pow(clamp01(1 - c.distMi / effMaxMi), 1.5);
  return 0.55 * (gov / 100) + 0.30 * distScore + 0.15 * fit;
}

function eligibleForSlot(candidates, slot, avoidSet, effMaxMi, ignoreSlotExclude) {
  const out = [];
  for (const c of candidates) {
    if (!(Number.isFinite(c.distMi) && c.distMi <= effMaxMi)) continue;
    if (candidateExcluded(c, slot, avoidSet, ignoreSlotExclude)) continue;
    const fit = candidateFit(c, slot);
    if (fit <= 0) continue;
    out.push({ candidate: c, fit, score: scoreFor(c, fit, effMaxMi) });
  }
  out.sort((a, b) => b.score - a.score || a.candidate.distMi - b.candidate.distMi || String(a.candidate.id).localeCompare(String(b.candidate.id)));
  return out;
}

// One full round: pass 1 (round robin, one best per slot) then pass 2 (fill
// to max by score, respecting each slot's quota and the global type cap).
// Called fresh at each mile multiplier — pass 3's "redo" is a clean rerun,
// not an incremental build on the narrower attempt.
function runFill(slots, candidates, avoidSet, miMultiplier, max, ignoreSlotExclude) {
  const effSlots = slots.map((s) => ({ ...s, effMaxMi: Math.min(s.maxMi * miMultiplier, MAX_OVERALL_MI) }));
  const bySlot = new Map(effSlots.map((s) => [s.key, eligibleForSlot(candidates, s, avoidSet, s.effMaxMi, ignoreSlotExclude)]));
  const usedIds = new Set();
  const typeCounts = new Map();
  const slotCounts = new Map();
  const picks = [];

  const canTake = (c) => !usedIds.has(c.id) && (typeCounts.get(c.primaryType || "unknown") || 0) < TYPE_CAP;
  const take = (c, slot, score) => {
    usedIds.add(c.id);
    typeCounts.set(c.primaryType || "unknown", (typeCounts.get(c.primaryType || "unknown") || 0) + 1);
    slotCounts.set(slot.key, (slotCounts.get(slot.key) || 0) + 1);
    picks.push({ candidate: c, slot, score });
  };

  // Pass 1 — round robin, table order, one best per slot.
  for (const slot of effSlots) {
    const best = (bySlot.get(slot.key) || []).find((item) => canTake(item.candidate));
    if (best) take(best.candidate, slot, best.score);
  }

  // Pass 2 — fill to max by score, respecting quotas.
  if (picks.length < max) {
    const pool = [];
    for (const slot of effSlots) {
      for (const item of bySlot.get(slot.key) || []) {
        if (usedIds.has(item.candidate.id)) continue;
        if ((slotCounts.get(slot.key) || 0) >= (slot.quota || Infinity)) continue;
        pool.push({ ...item, slot });
      }
    }
    pool.sort((a, b) => b.score - a.score || a.candidate.distMi - b.candidate.distMi || String(a.candidate.id).localeCompare(String(b.candidate.id)));
    for (const item of pool) {
      if (picks.length >= max) break;
      if (!canTake(item.candidate)) continue;
      if ((slotCounts.get(item.slot.key) || 0) >= (item.slot.quota || Infinity)) continue;
      take(item.candidate, item.slot, item.score);
    }
  }
  return picks;
}

const ALSO_NEARBY_SLOT = { key: "also_nearby", label: "Also nearby", timing: "after" };

function overflowFill(picks, candidates, avoidSet, max) {
  const usedIds = new Set(picks.map((p) => p.candidate.id));
  const typeCounts = new Map();
  for (const p of picks) typeCounts.set(p.candidate.primaryType || "unknown", (typeCounts.get(p.candidate.primaryType || "unknown") || 0) + 1);

  const pool = candidates
    .filter((c) => !usedIds.has(c.id) && Number.isFinite(c.distMi) && c.distMi <= MAX_OVERALL_MI)
    .filter((c) => {
      const primary = c.primaryType || "";
      return !(avoidSet.has(primary) || typesOf(c).some((t) => avoidSet.has(t)));
    })
    .map((c) => ({ candidate: c, score: 0.6 * ((Number(c.governed_score) || 0) / 100) + 0.4 * clamp01(1 - c.distMi / MAX_OVERALL_MI) }))
    .sort((a, b) => b.score - a.score || a.candidate.distMi - b.candidate.distMi || String(a.candidate.id).localeCompare(String(b.candidate.id)));

  const out = picks.slice();
  for (const item of pool) {
    if (out.length >= max) break;
    const pt = item.candidate.primaryType || "unknown";
    if ((typeCounts.get(pt) || 0) >= TYPE_CAP) continue;
    typeCounts.set(pt, (typeCounts.get(pt) || 0) + 1);
    out.push({ candidate: item.candidate, slot: ALSO_NEARBY_SLOT, score: item.score });
  }
  return out;
}

function finalizePicks(picks, archetype) {
  const copy = outingCopy(archetype);
  const rows = picks.map((p) => {
    const timing = p.slot.timing === "before" ? "before" : "after";
    return {
      ...p.candidate,
      outing: { archetype, slotKey: p.slot.key, slotLabel: p.slot.label, timing, railTitle: copy.railTitle, railNote: copy.railNote },
      rankingNote: `${p.slot.label} · ${Number(p.candidate.distMi).toFixed(1)} mi from the venue`,
      _outingScore: p.score,
    };
  });
  rows.sort((a, b) => {
    const ta = a.outing.timing === "before" ? 0 : 1;
    const tb = b.outing.timing === "before" ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (b._outingScore !== a._outingScore) return b._outingScore - a._outingScore;
    if (a.distMi !== b.distMi) return a.distMi - b.distMi;
    return String(a.id).localeCompare(String(b.id));
  });
  return rows.map(({ _outingScore, ...row }) => row);
}

/**
 * Slot real candidates into before/after picks for one classified event.
 *
 * @param {{archetype?:string}} ctx classifyEvent(event)'s result (or a plain
 *   object naming an archetype — an unknown one falls back to generic_evening)
 * @param {object[]} candidates merged, already-scored, already-distanced rows
 *   (id, primaryType, types[], governed_score, distMi — the shape
 *   lib/eventPairings.js's merged pool already produces)
 * @param {{max?:number, min?:number, avoidSet?:Set|string[], ignoreSlotExclude?:boolean}} [opts]
 *   `avoidSet` and `ignoreSlotExclude` are red-proof seams for
 *   scripts/check-event-outing.mjs only — production never sets either, so
 *   the module always applies its own AVOID/exclude lists.
 * @returns {object[]} candidate rows stamped with `outing` + `rankingNote`,
 *   grouped before-then-after, each group ranked by score.
 */
export function fillOutingSlots(ctx, candidates, opts = {}) {
  const archetype = ctx && SLOT_TABLE[ctx.archetype] ? ctx.archetype : "generic_evening";
  const slots = (SLOT_TABLE[archetype] || SLOT_TABLE.generic_evening).filter((s) => !s.adultOnly || (ctx && ctx.adult));
  const overridden = !!opts.avoidSet;
  const baseAvoid = overridden
    ? (opts.avoidSet instanceof Set ? opts.avoidSet : new Set(opts.avoidSet))
    : (archetype === "family_day" ? FAMILY_DAY_AVOID_SET : AVOID_SET);
  const ignoreSlotExclude = !!opts.ignoreSlotExclude;
  // Pass 4 (overflow) has no slot to check a candidate against, so a promise
  // like show_classy's "no night club" or festival_fed's "no restaurant"
  // would otherwise only hold for passes 1-3 and quietly leak back in as
  // "Also nearby". Folding every ACTIVE slot's own `exclude` list into the
  // overflow avoid set closes that: production always gets the union, and
  // only an explicit test override (avoidSet or ignoreSlotExclude) bypasses
  // it, so scripts/check-event-outing.mjs can still red-prove the exclusion.
  const overflowAvoidSet = (overridden || ignoreSlotExclude)
    ? baseAvoid
    : new Set([...baseAvoid, ...slots.flatMap((s) => s.exclude || [])]);
  const max = opts.max || 8;
  const min = opts.min || 3;
  const list = Array.isArray(candidates) ? candidates.filter((c) => c && c.id && Number.isFinite(c.distMi)) : [];

  let picks = runFill(slots, list, baseAvoid, 1, max, ignoreSlotExclude);
  if (picks.length < min) picks = runFill(slots, list, baseAvoid, 2, max, ignoreSlotExclude); // pass 3: suburban widen, capped at MAX_OVERALL_MI
  if (picks.length < min) picks = overflowFill(picks, list, overflowAvoidSet, max); // pass 4: overflow

  return finalizePicks(picks, archetype);
}
