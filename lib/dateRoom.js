// lib/dateRoom.js — THE DATE-NIGHT IDENTITY, and there is now exactly one
// ROOM rule (`isDateRoom`) plus the Date Night SHORTLIST that the poster
// actually advertises.
//
// v8.82 (owner, 2026-08-28, screenshot of the Date Night sheet leading with
// the SUNSHINE SKYWAY BRIDGE, wearing a "🌹 Date Night" chip): "a bridge for
// date night is ridiculous."
//
// He is right, and the bridge got there honestly — because nothing on that
// surface ever asked what a date night IS. Three surfaces make the date-night
// claim and until now only one of them had a rule:
//
//   1. the `datenight` RAIL (lib/railSelect.js) — had `isDateRoom`, correct;
//   2. the `datenight` EXPERIENCE sheet (app/home.js EXPERIENCES) — its whole
//      membership test was `rating >= 4.3 && !fast_food`. That is a QUALITY
//      bar, not an identity, and it is the exact failure lib/railSelect.js's
//      own header describes: "wherever an identity is missing the score
//      quietly answers a different question". The Skyway Bridge is 4.8 over
//      2,336 reviews, so it sailed through — and one of that sheet's evening
//      queries literally searches `attractions` for "scenic sunset spot",
//      which is the best possible description of that bridge;
//   3. the place-card CHIP (app/components/IconicPlaceCard.js) — has its own
//      correctly-gated rule and was never the leak.
//
// The rule lived as a `const` inside railSelect.js, which is SERVER ONLY (it
// pulls in seasons, creatorBoost and ranking). app/home.js is a client
// component and could not import it without dragging all of that into the
// bundle — so the sheet had no way to reuse the right answer even in
// principle. That is why this is its own module: the same cure lib/breakfast,
// lib/quickService, lib/mealPlace and lib/familyPlace already are, for exactly
// the same reason.
//
// THE ROOM RULE, unchanged, plus the one thing the rail never needed. Four
// conditions:
//   1. a MEAL (lib/mealPlace.js) — a dessert counter is not dinner;
//   2. not COUNTER SERVICE (lib/quickService.js) — a room you sit in is the
//      whole difference between this and `eat`;
//   3. not a DAYTIME-only room — a brunch spot is a real meal in a real room
//      and is shut before date night starts. Primary type is the claim
//      (v8.30.1): a dinner house that also serves brunch carries
//      `brunch_restaurant` as a secondary token and survives;
//   4. …OR it is one of the sit-down DRINKS rooms the sheet's own copy
//      promises. Its lead says "candlelit dinners, WINE BARS, sunset views and
//      after-dark charm", and a wine bar is not a meal place, so the rail's
//      three-part rule alone would have deleted the thing the tile advertises.
//      A sports bar is not on this list and is not supposed to be.
//
// THE SHORTLIST (owner poster, 2026-08-29): the tile now names SPEAKEASIES /
// FANCY RESTAURANTS / CLUBS / ROOFTOPS and promises a 27-mile night. The room
// rule still answers "is this a table for two". `isDateNightShortlist` is the
// union of existing classifiers that the poster and the brief actually ask
// for — rooms, clubs, show venues, rooftop bars, and street-event / pop-up
// places already in inventory. A tag never exempts a bridge. Empty is honest.
import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";
import { isShowVenue, SHOW_PRIMARY } from "./showVenue.js";

const DAYTIME_ONLY_PRIMARY = new Set([
  "breakfast_restaurant", "brunch_restaurant", "bagel_shop", "cafe", "coffee_shop",
]);

// Rooms you sit in and talk in. Deliberately NOT `bar`, `sports_bar`,
// `pub`, `irish_pub` or `night_club` — those are Tonight's Move, and the two
// rails exist precisely because they are different evenings. Clubs join the
// SHORTLIST (the poster names them), not the room.
const DRINKS_ROOM_PRIMARY = new Set([
  "wine_bar", "cocktail_bar", "lounge_bar", "piano_bar", "speakeasy",
]);

const CLUB_PRIMARY = new Set(["night_club", "dance_hall"]);
const ROOFTOP_TYPE = "rooftop_bar";
const ROOFTOP_NAME = /\brooftop\b/i;
const ROOFTOP_NOT = /\b(parking|garage)\b/i;
const EVENT_NAME = /\b(pop-?ups?|street fair|street festival|night market|block party)\b/i;
const EVENT_TYPES = new Set(["festival", "community_festival"]);

const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();
const typesOf = (p) => ((p && (p.types || p.google_types)) || []).map((t) => String(t).toLowerCase());
const tagsOf = (p) => ((p && (p.tags || p._tags)) || []).map((t) => String(t).toLowerCase());

/** Owner poster: "we'll take you up to 27 miles." Hard radius. No widen. */
export const DATENIGHT_NEAR_MI = 27;

/** Inventory overlap filter for the identity pool — types the shortlist can prove. */
export const DATENIGHT_TYPES = [
  "restaurant", "fine_dining_restaurant", "steak_house", "seafood_restaurant",
  "italian_restaurant", "french_restaurant", "japanese_restaurant",
  "wine_bar", "cocktail_bar", "lounge_bar", "piano_bar", "speakeasy",
  "rooftop_bar", "night_club", "dance_hall",
  "comedy_club", "live_music_venue", "concert_hall", "performing_arts_theater",
  "opera_house", "amphitheatre", "amphitheater", "jazz_club", "cabaret",
  "festival",
];

/** Is this a room you would take someone to for the evening? */
export function isDateRoom(p) {
  if (!p) return false;
  const primary = primaryOf(p);
  if (DRINKS_ROOM_PRIMARY.has(primary)) return true;
  return isMealPlace(p) && !isQuickService(p) && !DAYTIME_ONLY_PRIMARY.has(primary);
}

/** Poster: CLUBS. Primary (or primary-null first type). A sports bar is not this. */
export function isDateNightClub(p) {
  if (!p) return false;
  const primary = primaryOf(p);
  if (CLUB_PRIMARY.has(primary)) return true;
  if (primary) return false;
  return CLUB_PRIMARY.has(typesOf(p)[0] || "");
}

/** Shows / concerts — lib/showVenue.js, plus primary-null first-type rows. */
export function isDateNightShow(p) {
  if (isShowVenue(p)) return true;
  if (!p || primaryOf(p)) return false;
  return SHOW_PRIMARY.has(typesOf(p)[0] || "");
}

/** Rooftop bars: typed rooftop_bar, or a rooftop-named bar/restaurant. */
export function isRooftopDatePlace(p) {
  if (!p) return false;
  if (primaryOf(p) === ROOFTOP_TYPE) return true;
  const types = typesOf(p);
  if (types.includes(ROOFTOP_TYPE)) return true;
  const name = String(p.name || "");
  if (!ROOFTOP_NAME.test(name) || ROOFTOP_NOT.test(name)) return false;
  return types.some((t) => /(?:^|_)bar$|restaurant|lounge|night_club/.test(t)) || isDateRoom(p);
}

/** Street events / pop-ups that already exist as inventory PLACES. Dated frontEvents stay events. */
export function isDateNightEventPlace(p) {
  if (!p) return false;
  if (EVENT_NAME.test(String(p.name || ""))) return true;
  const primary = primaryOf(p);
  if (EVENT_TYPES.has(primary)) return true;
  if (primary) return false;
  return EVENT_TYPES.has(typesOf(p)[0] || "");
}

/** Curated romantic / datenight tags — never an exemption from what the evening is. */
export function isRomanticTagged(p) {
  const tags = tagsOf(p);
  if (!tags.includes("romantic") && !tags.includes("datenight")) return false;
  return isDateRoom(p) || isDateNightClub(p) || isRooftopDatePlace(p) || isDateNightShow(p);
}

/**
 * THE Date Night shortlist. Existing classifiers only. A park, a bridge, a
 * taco counter and a breakfast room stay out — the room rule still holds for
 * restaurants, and the added slices have their own type evidence.
 */
export function isDateNightShortlist(p) {
  if (!p) return false;
  return isDateRoom(p)
    || isDateNightClub(p)
    || isDateNightShow(p)
    || isRooftopDatePlace(p)
    || isDateNightEventPlace(p)
    || isRomanticTagged(p);
}

export { DAYTIME_ONLY_PRIMARY, DRINKS_ROOM_PRIMARY, CLUB_PRIMARY };
