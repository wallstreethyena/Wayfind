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

// The one read outside this file's pure logic: lib/photoWorthy.js resolves
// "people photograph this place" from committed data (creator registry,
// curated tags). It is itself pure: no I/O, no clock.
import { photoWorthy } from "./photoWorthy.js";

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
    // Curated subcategories arrive both as "holiday-lights" and "holiday lights".
    subcategory: String(ev.subcategory || "").trim().replace(/[\s_]+/g, "-"),
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
  // allDay is a property of the event's SHAPE, independent of its start time.
  // Fable audit 2026-09-23: 46 multi day festival rows and 14 daytime music
  // festival rows carry a start_time, and returning on the time alone sent a
  // noon, three day bluegrass festival to "Dinner before the show".
  const spansDays = !!(n.date && n.endDate && n.endDate > n.date);
  const festivalish = /festival|market/i.test(n.category) || /festival|market/i.test(n.subcategory) || /festival|farmers market/i.test(n.genre);
  const allDay = spansDays || festivalish;
  const m = /^(\d{1,2}):(\d{2})/.exec(n.time.trim());
  if (m) {
    const hh = Number(m[1]);
    if (hh < 11) return { daypart: "morning", allDay };
    if (hh < 16) return { daypart: "day", allDay };
    if (hh < 20) return { daypart: "evening", allDay };
    return { daypart: "late", allDay };
  }
  if (allDay) return { daypart: "day", allDay: true };
  const seg = String(n.segment || n.category || "");
  if (/^(music|arts|arts & theatre|arts and theatre|sports|comedy)$/i.test(seg)) return { daypart: "evening", allDay: false };
  return { daypart: "day", allDay: false };
}

function computeFamily(n) {
  if (/^family$/i.test(n.segment)) return true;
  if (n.audience.some((a) => /family|kids/i.test(a))) return true;
  if (/^family[-_]|^pumpkin[-_]patch$|^holiday[-_]lights$|^parade$|^kids$/i.test(n.subcategory)) return true;
  const hay = `${n.genre} ${n.name}`;
  if (/kids|children|family|disney (on ice|junior|jr)|sesame|paw patrol|bluey|cocomelon|puppet|peppa|blippi|monster jam|circus/i.test(hay)) return true;
  return false;
}

function computeAdult(n) {
  if (n.minimumAge != null && n.minimumAge >= 18) return true;
  if (/hip.?hop|edm|electronic|dance|club|bar.?crawl/i.test(n.genre)) return true;
  if (n.tags.some((t) => /21\+/.test(t))) return true;
  // A 21+ crawl often arrives with minimum_age null; the crawl itself says it.
  if (/^bar-crawl$|^pub-crawl$/i.test(n.subcategory) || /\b(bar|pub) crawl\b|\b21\+/i.test(n.name)) return true;
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
  if (/food (festival|truck)|wine fest|beer fest|brew fest|taste of|seafood fest|bbq fest|barbecue fest|rib fest|chili cook/i.test(n.name)) return true;
  if (/farmers market|food festival|wine|beer festival|night market/i.test(n.genre)) return true;
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
  // Order matters. A kids show is a FAMILY outing before it is theater: live
  // run 2026-09-23, "Disney Junior Live" (segment Family, genre Children's
  // Theatre, 11:00) resolved to show_matinee and was handed a wine bar. So a
  // family event that is not flagged adult resolves to family_* ahead of
  // theater and concerts. Sports and already-fed keep precedence (a family
  // food festival is still "already fed"); the global family alcohol veto in
  // fillOutingSlots covers those too.
  if (f.comedy && !f.family) return "comedy";
  if (f.sports) return f.daypart === "evening" || f.daypart === "late" ? "sports_night" : "sports_day";
  if (f.alreadyFed) return "festival_fed";
  if (f.family && !f.adult) return f.daypart === "evening" || f.daypart === "late" ? "family_evening" : "family_day";
  if (f.theater) return f.daypart === "morning" || f.daypart === "day" ? "show_matinee" : "show_classy";
  if (f.allDay && (f.daypart === "morning" || f.daypart === "day")) return "festival_allday";
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
 *  a readable identity for logs and tests. lib/eventPairingsCache.js keys the
 *  Data Cache on the full classification JSON (the same six fields) plus the
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

// "Make a day of it" (2026-09-30): a daytime event leaves hours on the clock,
// and the owner's ask is "other places near the location that are worth
// going to." Downtown St Pete alone holds 65 owned attractions within a mile
// of Jannus Live, none of which could ever surface: AVOID vetoes museum and
// tourist_attraction for every archetype. This slot, and ONLY this slot,
// re-admits those real sights via `allow`, for daytime archetypes only. An
// evening concert still never gets "go to a museum after the encore".
const EXPLORE_PRIMARY = ["museum", "art_museum", "art_gallery", "aquarium", "botanical_garden", "historical_landmark"];
const EXPLORE_ANY = ["tourist_attraction", "park", "garden", "historical_place", "cultural_landmark", "monument", "plaza", "sculpture", "zoo", "observation_deck", "pier"];
const EXPLORE_ALLOW = ["museum", "art_museum", "tourist_attraction"];
const EXPLORE_SLOT = { key: "explore_after", label: "Make a day of it", timing: "after", primary: EXPLORE_PRIMARY, any: EXPLORE_ANY, allow: EXPLORE_ALLOW, exclude: [], maxMi: 1.2, quota: 2 };

// "Make the night unforgettable" (owner, 2026-09-30): an evening outing is
// more than dinner and a drink. Three slots add the moments people remember
// and post, each built from real place types only:
//
//   GOLDEN_HOUR_SLOT  "Make it memorable": the pier, a garden, an observation
//     deck, a glass studio, or a sunset sail or tiki boat before the show.
//     A plain city park is not on the list: nothing in inventory says which
//     park is the waterfront one (live run 2026-09-30 picked a downtown
//     square over the St. Pete Pier). A destination earns a longer walk:
//     distance is flat to 0.6 mi and the slot reaches 1.5 mi. Tour operators are
//     re-admitted ONLY here, and only when their own name says boat, sail,
//     cruise, tiki, dolphin, kayak, paddle, yacht or pontoon (`nameRx`): a
//     generic "tours" storefront is a sales counter, not a stop. Booking
//     stays exactly where it was (curated partner picks, /api/viator/go);
//     this adds no link.
//   SECOND_ACT_SLOT   "Keep the night going": live music, karaoke, bowling,
//     arcades, mini golf, escape rooms, comedy clubs, pool halls. A bar whose
//     own Google types say live_music_venue or karaoke counts (`secondaryOk`):
//     that is how most music bars are stored.
//   FAMILY_FUN_SLOT   "Fun after": the kid safe version. Arcades, bowling, mini
//     golf, a pier or aquarium. Never a boat sale, never a bar.
//
// A label says when in the evening the EVENT leaves room for it. It never
// says when the PLACE is open (inventory has no hours).
const EXPERIENCE_NAME_RX = /sunset|sail|cruise|tiki|dolphin|boat|kayak|paddle|yacht|pontoon/i;
const GOLDEN_HOUR_SLOT = { key: "memorable_before", label: "Make it memorable", timing: "before",
  primary: ["observation_deck", "pier", "fishing_pier", "botanical_garden", "scenic_spot", "garden"],
  any: ["tourist_attraction", "boat_tour_agency", "tour_agency", "marina"],
  allow: ["tourist_attraction", "marina", "tour_agency", "boat_tour_agency"],
  nameRxTypes: ["tour_agency", "boat_tour_agency", "marina"], nameRx: EXPERIENCE_NAME_RX,
  secondaryOk: ["fishing_pier", "pier", "observation_deck"],
  exclude: ["museum", "art_museum", "dog_park", "playground"], maxMi: 1.5, walkFlatMi: 0.6, quota: 2 };
const SECOND_ACT_TYPES = ["live_music_venue", "karaoke", "bowling_alley", "amusement_center", "video_arcade", "escape_room_center", "miniature_golf_course", "comedy_club", "dance_hall", "pool_hall"];
const SECOND_ACT_SLOT = { key: "second_act_after", label: "Keep the night going", timing: "after",
  primary: SECOND_ACT_TYPES, any: ["amusement_park", "go_karting_venue"], secondaryOk: ["live_music_venue", "karaoke", "comedy_club"],
  // Nearly every music bar also carries Google's "event_venue" type, which
  // AVOID vetoes (live run: Ruby's Elixir, Mandarin Hide, Flute & Dram all
  // blocked). Lifted here only; a row still needs a second act identity above.
  allow: ["event_venue"], exclude: [], maxMi: 1.0, quota: 2 };
const FAMILY_FUN_SLOT = { key: "family_fun_after", label: "Fun after", timing: "after",
  primary: ["bowling_alley", "amusement_center", "video_arcade", "miniature_golf_course", "pier", "fishing_pier"],
  any: ["tourist_attraction", "aquarium", "amusement_park", "playground"], allow: ["tourist_attraction"],
  exclude: ["karaoke", "hookah_bar", "tour_agency", "boat_tour_agency", "marina"], maxMi: 1.0, quota: 3 };

// Price bands, Google priceNum 0 to 4. A SOFT fit: an out of band place loses
// PRICE_MISS_PENALTY, it is never vetoed, and an unpriced place is neutral.
// A symphony dinner leans $$ to $$$$; a kids lunch or a late night slice
// leans $ to $$.
const PRICE_UPSCALE = [2, 4];
const PRICE_CASUAL = [0, 2];
const PRICE_MID = [1, 3];

// festival_fed inverts the meal model — a full restaurant identity of ANY
// kind is excluded, whatever a slot's own exclude list adds on top.
const MEAL_EXCLUDE = ["restaurant", "steak_house", "fine_dining_restaurant", "family_restaurant", "italian_restaurant", "mexican_restaurant", "american_restaurant", "seafood_restaurant", "sushi_restaurant", "french_restaurant", "asian_restaurant", "mediterranean_restaurant", "japanese_restaurant", "thai_restaurant", "chinese_restaurant", "indian_restaurant", "greek_restaurant", "spanish_restaurant", "brazilian_restaurant", "vietnamese_restaurant", "korean_restaurant", "hamburger_restaurant", "barbecue_restaurant", "pizza_restaurant", "fast_food_restaurant", "diner", "breakfast_restaurant", "brunch_restaurant", "sandwich_shop", "meal_takeaway", "meal_delivery", "food_court"];

// family_* excludes every alcohol-adjacent type, whatever a slot adds.
const ALCOHOL_EXCLUDE = ["bar", "pub", "irish_pub", "brewery", "brewpub", "wine_bar", "cocktail_bar", "night_club", "lounge", "sports_bar", "bar_and_grill", "liquor_store", "adult_entertainment"];

// Never on a family page, in any slot, whatever that slot's `allow` says.
export const FAMILY_HARD = [...ALCOHOL_EXCLUDE, "tour_agency", "boat_tour_agency", "marina", "karaoke", "hookah_bar", "pool_hall", "dance_hall", "comedy_club"];

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
 * Quotas (2026-09-30) sum to 12 for every archetype but festival_fed, to
 * match lib/eventPairings.js's max. They used to sum to 8, which silently
 * capped a dense downtown venue at 8 picks whatever `max` said.
 *
 * archetype -> ordered slots. Order is the round-robin fill order (pass 1)
 * and the reading order of "before" then "after" copy in docs — it is not a
 * merchandising ranking within a timing bucket (score decides that).
 */
export const SLOT_TABLE = {
  concert_evening: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3, price: PRICE_MID },
    { key: "drinks_before", label: "Drinks before", timing: "before", primary: PREGAME_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    GOLDEN_HOUR_SLOT,
    { key: "late_night_bites", label: "Late night bites", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 1, price: PRICE_CASUAL },
    SECOND_ACT_SLOT,
    { key: "nightcap", label: "Nightcap", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: [], maxMi: 0.8, quota: 2 },
  ],
  show_classy: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: CLASSY_DINNER_PRIMARY, any: CLASSY_DINNER_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 1.0, quota: 3, price: PRICE_UPSCALE },
    { key: "wine_before", label: "Wine before", timing: "before", primary: WINE_BAR_PRIMARY, any: WINE_BAR_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 2 },
    GOLDEN_HOUR_SLOT,
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 2 },
    { key: "quiet_drink_after", label: "A quiet drink after", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: ["night_club", "fast_food_restaurant"], maxMi: 0.8, quota: 3 },
  ],
  show_matinee: [
    { key: "lunch_before", label: "Lunch before the show", timing: "before", primary: ["restaurant"], any: [...CLASSY_DINNER_ANY, "cafe"], exclude: ["night_club"], maxMi: 1.0, quota: 3 },
    { key: "coffee_before", label: "Coffee before", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "early_dinner_after", label: "Early dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: ["night_club"], maxMi: 1.0, quota: 3 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    EXPLORE_SLOT,
  ],
  club_night: [
    { key: "lounge_before", label: "Lounge before", timing: "before", primary: LOUNGE_PRIMARY, any: LOUNGE_ANY, exclude: [], maxMi: 0.8, quota: 3 },
    { key: "quick_bite_before", label: "Quick bite before", timing: "before", primary: ["restaurant"], any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2, price: PRICE_CASUAL },
    { ...GOLDEN_HOUR_SLOT, quota: 1 },
    { key: "after_hours", label: "Keep the night going", timing: "after", primary: NIGHTCLUB_PRIMARY, any: NIGHTCLUB_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 3 },
  ],
  country_jam: [
    { key: "casual_bite_before", label: "Casual bite before", timing: "before", primary: ["restaurant", "barbecue_restaurant"], any: ["american_restaurant", "hamburger_restaurant"], exclude: ["fine_dining_restaurant"], maxMi: 1.0, quota: 3, price: PRICE_CASUAL },
    { key: "pregame_drinks", label: "Pregame drinks", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: ["fine_dining_restaurant", "wine_bar"], maxMi: 0.8, quota: 2 },
    { ...GOLDEN_HOUR_SLOT, quota: 1 },
    { key: "casual_bar_after", label: "Casual bar after", timing: "after", primary: ["bar", "pub"], any: PREGAME_BAR_ANY, exclude: ["fine_dining_restaurant", "wine_bar"], maxMi: 1.0, quota: 2 },
    SECOND_ACT_SLOT,
    { key: "late_night_bites", label: "Late night bites", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: ["fine_dining_restaurant"], maxMi: 1.0, quota: 2 },
  ],
  comedy: [
    { key: "dinner_before", label: "Dinner before the show", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 4 },
    { ...GOLDEN_HOUR_SLOT, quota: 1 },
    { key: "drinks_after", label: "Drinks after", timing: "after", primary: ["bar", "cocktail_bar"], any: ["pub", "lounge", "wine_bar"], exclude: [], maxMi: 0.8, quota: 3 },
    { ...SECOND_ACT_SLOT, exclude: ["comedy_club"] },
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
  ],
  sports_day: [
    { key: "brunch_before", label: "Brunch before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "sports_bar_before", label: "Sports bar before", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "early_dinner_after", label: "Early dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "ice_cream_after", label: "Something sweet after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    EXPLORE_SLOT,
  ],
  sports_night: [
    { key: "dinner_before", label: "Dinner before the game", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "sports_bar_before", label: "Sports bar before", timing: "before", primary: SPORTS_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { ...GOLDEN_HOUR_SLOT, quota: 1 },
    { key: "bar_after", label: "Bar after", timing: "after", primary: ["bar", "sports_bar"], any: PREGAME_BAR_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    SECOND_ACT_SLOT,
    { key: "late_night_food", label: "Late night food", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 2 },
  ],
  festival_allday: [
    { key: "coffee_before", label: "Coffee before the gates", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 1.0, quota: 2 },
    { key: "breakfast_before", label: "Breakfast before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "quick_bite_after", label: "Quick bite after", timing: "after", primary: LATE_NIGHT_PRIMARY, any: LATE_NIGHT_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    EXPLORE_SLOT,
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
    { key: "lunch_before", label: "Lunch before", timing: "before", primary: FAMILY_LUNCH_PRIMARY, any: FAMILY_LUNCH_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 4, price: PRICE_CASUAL },
    { key: "breakfast_before", label: "Breakfast before", timing: "before", primary: BREAKFAST_PRIMARY, any: BREAKFAST_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 2 },
    { key: "ice_cream_after", label: "Something sweet after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "park_time_after", label: "Park time after", timing: "after", primary: PARK_PRIMARY, any: [], exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
  ],
  family_evening: [
    { key: "dinner_before", label: "Dinner before", timing: "before", primary: FAMILY_LUNCH_PRIMARY, any: FAMILY_LUNCH_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 4, price: PRICE_CASUAL },
    { key: "ice_cream_after", label: "Something sweet after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 3 },
    { key: "dessert_cafe_after", label: "Dessert cafe after", timing: "after", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: ALCOHOL_EXCLUDE, maxMi: 1.0, quota: 2 },
    FAMILY_FUN_SLOT,
  ],
  generic_evening: [
    { key: "dinner_before", label: "Dinner before", timing: "before", primary: DINNER_PRIMARY, any: DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "drinks_before", label: "Drinks before", timing: "before", primary: PREGAME_BAR_PRIMARY, any: PREGAME_BAR_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    GOLDEN_HOUR_SLOT,
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 1 },
    SECOND_ACT_SLOT,
    { key: "nightcap", label: "Nightcap", timing: "after", primary: NIGHTCAP_PRIMARY, any: NIGHTCAP_ANY, exclude: [], maxMi: 0.8, quota: 2 },
  ],
  generic_day: [
    { key: "lunch_before", label: "Lunch before", timing: "before", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "coffee_before", label: "Coffee before", timing: "before", primary: COFFEE_PRIMARY, any: COFFEE_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    { key: "dinner_after", label: "Dinner after", timing: "after", primary: ["restaurant"], any: CASUAL_DINNER_ANY, exclude: [], maxMi: 1.0, quota: 3 },
    { key: "dessert_after", label: "Dessert after", timing: "after", primary: SWEET_PRIMARY, any: SWEET_ANY, exclude: [], maxMi: 0.8, quota: 2 },
    EXPLORE_SLOT,
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
// "No more than 3 of the same primaryType" was tuned for an 8 pick shelf.
// On twelve it starved real quality: live Jannus Live run 2026-09-30, Fortu
// (score 99, 0.2 mi) was cut because three plain "restaurant" rows came
// first. The cap now scales with the shelf (3 at 8, 4 at 12); the cuisine
// cap is what keeps those rows from being the same kind of meal.
const QUOTA_RELEASE = 2;
const typeCapFor = (max) => Math.max(3, Math.ceil(max / 3));
// Variety (2026-09-30): three sushi bars is a list, not a night out. At most
// two picks share a lead cuisine; a place with no cuisine data is uncapped.
const CUISINE_CAP = 2;
// A Wayfind write up (wf_inventory.editorial) is a place the team has vetted
// and can say something specific about; it earns a small, bounded lift, never
// enough to beat a clearly better or clearly closer place.
const EDITORIAL_BOOST = 0.04;
const PRICE_MISS_PENALTY = 0.08;
// Below this governed score (roughly a 3 star average) a place is not
// "worth it" on a page whose whole promise is worth it. Only the pass 4
// overflow can reach under it, and only when nothing better exists.
export const OUTING_MIN_SCORE = 60;
// Proof people photograph it (lib/photoWorthy.js). Bounded like the editorial
// lift: it breaks ties and small gaps, never a clearly better place.
export const PHOTO_BOOST = { creator: 0.05, curated: 0.03 };

function leadCuisine(c) {
  const list = Array.isArray(c.cuisines) ? c.cuisines : [];
  const first = list.find((x) => typeof x === "string" && x.trim());
  return first ? first.trim().toLowerCase() : null;
}

function priceFit(c, slot) {
  const band = slot.price;
  const p = c.priceLevel;
  if (!band || typeof p !== "number" || !Number.isFinite(p)) return 0;
  return p < band[0] || p > band[1] ? -PRICE_MISS_PENALTY : 0;
}

// primaryTypes that say "some kind of food/drink place" without naming which.
const GENERIC_PRIMARY = new Set(["restaurant", "food", "point_of_interest", "establishment", "store", "food_store"]);

function typesOf(c) {
  return Array.isArray(c.types) ? c.types : [];
}

/** 1 exact primaryType match, 0.6 a secondary/either-list match, 0 ineligible. */
function candidateFit(c, slot) {
  const primary = c.primaryType || "";
  // An operator type admitted only by its own name (GOLDEN_HOUR_SLOT): the
  // row's identity OR any of its types being one of those operator types
  // means the name must say it is the experience, not the counter.
  if (slot.nameRx && Array.isArray(slot.nameRxTypes)) {
    const gated = slot.nameRxTypes.includes(primary) || typesOf(c).some((t) => slot.nameRxTypes.includes(t));
    if (gated && !slot.nameRx.test(String(c.name || ""))) return 0;
  }
  if (slot.primary.includes(primary)) return 1;
  // A slot may name secondary types that ARE the reason to go, whatever the
  // row's primary identity (a "bar" typed live_music_venue is a music bar).
  // One that is also a slot primary is a full fit: the St. Pete Pier is
  // primary tourist_attraction but typed fishing_pier.
  if (Array.isArray(slot.secondaryOk)) {
    const hits = typesOf(c).filter((t) => slot.secondaryOk.includes(t));
    if (hits.length) return hits.some((t) => slot.primary.includes(t)) ? 1 : 0.6;
  }
  const pool = slot._pool || (slot._pool = new Set([...(slot.primary || []), ...(slot.any || [])]));
  if (pool.has(primary)) return 0.6;
  // A secondary Google type may only place a row whose OWN identity is
  // generic. Live run 2026-09-23: a coffee_shop carrying a "bar" type was
  // labeled "Wine before" and a cocktail_bar carrying "cafe" was labeled
  // "Brunch before". A specific primaryType is the place's identity; the
  // label on the card must match it.
  if (!primary || GENERIC_PRIMARY.has(primary)) {
    if (typesOf(c).some((t) => pool.has(t))) return 0.6;
  }
  return 0;
}

/** True when the AVOID set or (unless bypassed) the slot's own exclude list
 *  vetoes this candidate for this slot. `ignoreSlotExclude` exists ONLY for
 *  scripts/check-event-outing.mjs's red-proof — production never sets it. */
function candidateExcluded(c, slot, avoidSet, ignoreSlotExclude) {
  const primary = c.primaryType || "";
  const types = typesOf(c);
  // `allow` lifts the AVOID veto for exactly the listed types on exactly this
  // slot (EXPLORE_SLOT). Any OTHER avoided type on the row still vetoes it,
  // so a museum that also carries "bar" stays out of a family page.
  const allow = slot.allow || [];
  const blocked = (t) => avoidSet.has(t) && !allow.includes(t);
  if (blocked(primary) || types.some(blocked)) return true;
  if (ignoreSlotExclude) return false;
  const ex = slot.exclude || [];
  if (!ex.length) return false;
  return ex.includes(primary) || types.some((t) => ex.includes(t));
}

// Inside a five minute walk, distance is not a reason to pick one place over
// another (live Jannus Live run 2026-09-30: an 89 at 0.06 mi beat Fortu, a 99
// at 0.2 mi, on distance alone). Proximity only starts to cost past this.
export const OUTING_WALK_FLAT_MI = 0.25;

function scoreFor(c, fit, effMaxMi, slot) {
  const gov = Number(c.governed_score) || 0;
  const flat = Math.min(slot && slot.walkFlatMi != null ? slot.walkFlatMi : OUTING_WALK_FLAT_MI, effMaxMi / 2);
  const distScore = Math.pow(clamp01(1 - Math.max(0, c.distMi - flat) / (effMaxMi - flat)), 1.5);
  const editorial = typeof c.editorial === "string" && c.editorial.trim() ? EDITORIAL_BOOST : 0;
  const photo = c._photo ? PHOTO_BOOST[c._photo.level] || 0 : 0;
  return 0.55 * (gov / 100) + 0.30 * distScore + 0.15 * fit + editorial + photo + (slot ? priceFit(c, slot) : 0);
}

function eligibleForSlot(candidates, slot, avoidSet, effMaxMi, ignoreSlotExclude) {
  const out = [];
  for (const c of candidates) {
    if (!(Number.isFinite(c.distMi) && c.distMi <= effMaxMi)) continue;
    if (Number.isFinite(c.governed_score) && c.governed_score < OUTING_MIN_SCORE) continue;
    if (candidateExcluded(c, slot, avoidSet, ignoreSlotExclude)) continue;
    const fit = candidateFit(c, slot);
    if (fit <= 0) continue;
    out.push({ candidate: c, fit, score: scoreFor(c, fit, effMaxMi, slot) });
  }
  out.sort((a, b) => b.score - a.score || a.candidate.distMi - b.candidate.distMi || String(a.candidate.id).localeCompare(String(b.candidate.id)));
  return out;
}

// One full round: pass 1 (round robin, one best per slot) then pass 2 (fill
// to max by score, respecting each slot's quota and the global type cap).
// Called fresh at each mile multiplier — pass 3's "redo" is a clean rerun,
// not an incremental build on the narrower attempt.
function runFill(slots, candidates, avoidSet, miMultiplier, max, ignoreSlotExclude) {
  const TYPE_CAP = typeCapFor(max);
  const effSlots = slots.map((s) => ({ ...s, effMaxMi: Math.min(s.maxMi * miMultiplier, MAX_OVERALL_MI) }));
  const bySlot = new Map(effSlots.map((s) => [s.key, eligibleForSlot(candidates, s, avoidSet, s.effMaxMi, ignoreSlotExclude)]));
  const usedIds = new Set();
  const typeCounts = new Map();
  const cuisineCounts = new Map();
  const slotCounts = new Map();
  const picks = [];

  const canTake = (c) => {
    if (usedIds.has(c.id)) return false;
    if ((typeCounts.get(c.primaryType || "unknown") || 0) >= TYPE_CAP) return false;
    const cuisine = leadCuisine(c);
    return !cuisine || (cuisineCounts.get(cuisine) || 0) < CUISINE_CAP;
  };
  const take = (c, slot, score) => {
    usedIds.add(c.id);
    typeCounts.set(c.primaryType || "unknown", (typeCounts.get(c.primaryType || "unknown") || 0) + 1);
    const cuisine = leadCuisine(c);
    if (cuisine) cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) || 0) + 1);
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

  // Pass 2b — quota release. Quotas reserve room for the golden hour and
  // second act slots; where a venue has no such places nearby, that room
  // must not vanish (a food only block would drop from 12 picks to 8). Any
  // still eligible slot pick may now fill it, best score first, with the
  // type and cuisine caps still enforced and each slot stretched by at most
  // QUOTA_RELEASE (so a bar heavy block cannot become six "Drinks before").
  if (picks.length < max) {
    const rest = [];
    for (const slot of effSlots) {
      for (const item of bySlot.get(slot.key) || []) {
        if (!usedIds.has(item.candidate.id)) rest.push({ ...item, slot });
      }
    }
    rest.sort((a, b) => b.score - a.score || a.candidate.distMi - b.candidate.distMi || String(a.candidate.id).localeCompare(String(b.candidate.id)));
    for (const item of rest) {
      if (picks.length >= max) break;
      if (!canTake(item.candidate)) continue;
      if ((slotCounts.get(item.slot.key) || 0) >= (item.slot.quota || Infinity) + QUOTA_RELEASE) continue;
      take(item.candidate, item.slot, item.score);
    }
  }
  return picks;
}

const ALSO_NEARBY_SLOT = { key: "also_nearby", label: "Also nearby", timing: "after" };

function overflowFill(picks, candidates, avoidSet, max) {
  const TYPE_CAP = typeCapFor(max);
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
    const { _photo, ...candidate } = p.candidate;
    const base = `${p.slot.label} · ${Number(candidate.distMi).toFixed(1)} mi from the venue`;
    return {
      ...candidate,
      outing: { archetype, slotKey: p.slot.key, slotLabel: p.slot.label, timing, railTitle: copy.railTitle, railNote: copy.railNote },
      photoWorthy: _photo || null,
      rankingNote: _photo ? `${base} · ${_photo.copy}` : base,
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
  const overridden = !!opts.avoidSet;
  // A family event is kid safe in EVERY slot, whatever archetype it landed in
  // (Fable audit 2026-09-30: a family night game resolved to sports_night and
  // was handed a sunset sail, a tiki boat and a karaoke bar through the new
  // slots' `allow`). So for family, FAMILY_HARD is stripped from every slot's
  // `allow` and added to its `exclude`: no slot can lift it back.
  const familyHard = !overridden && ctx && ctx.family;
  const slots = (SLOT_TABLE[archetype] || SLOT_TABLE.generic_evening)
    .filter((s) => !s.adultOnly || (ctx && ctx.adult))
    .map((s) => (familyHard
      ? { ...s, allow: (s.allow || []).filter((t) => !FAMILY_HARD.includes(t)), exclude: [...new Set([...(s.exclude || []), ...FAMILY_HARD])] }
      : s));
  const baseAvoid = overridden
    ? (opts.avoidSet instanceof Set ? opts.avoidSet : new Set(opts.avoidSet))
    : (archetype === "family_day" ? FAMILY_DAY_AVOID_SET : AVOID_SET);
  // A family event never gets an alcohol stop, whatever archetype it landed
  // in (a family day game, a family food festival). Applied to every pass.
  const familyAvoid = !overridden && ctx && ctx.family ? new Set([...baseAvoid, ...ALCOHOL_EXCLUDE]) : baseAvoid;
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
    : new Set([...familyAvoid, ...slots.flatMap((s) => s.exclude || [])]);
  const max = opts.max || 8;
  const min = opts.min || 3;
  // photoWorthy is resolved once per candidate, on a shallow copy, so the
  // caller's rows are never mutated. `photoWorthy: false` in opts is the
  // guard's seam for an engine run with no photo signal at all.
  const photoFn = opts.photoWorthy === false ? null : (opts.photoWorthy || photoWorthy);
  const list = (Array.isArray(candidates) ? candidates.filter((c) => c && c.id && Number.isFinite(c.distMi)) : [])
    .map((c) => ({ ...c, _photo: photoFn ? photoFn(c, opts.locName || c.city || null) : null }));

  let picks = runFill(slots, list, familyAvoid, 1, max, ignoreSlotExclude);
  if (picks.length < min) picks = runFill(slots, list, familyAvoid, 2, max, ignoreSlotExclude); // pass 3: suburban widen, capped at MAX_OVERALL_MI
  if (picks.length < min) picks = overflowFill(picks, list, overflowAvoidSet, max); // pass 4: overflow

  return finalizePicks(picks, archetype);
}
