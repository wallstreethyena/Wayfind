// lib/birthdayPlace.js — THE birthday-occasion identity, for the
// "Birthday Plans, Solved" rail.
//
// THE DEFECT (live gowayfind.com, Parrish): the rail ranked ONLY
// lib/birthdayUniverse.js, a 34-row statewide shortlist, at
// BIRTHDAY_NEAR_RADIUS_MI = 45. From a Parrish pin that made Bulla
// Gastrobar Tampa (~24 mi) a legal #1 while Bradenton / Lakewood Ranch /
// Ellenton inventory never got a vote. "Near you" on the tile was a lie
// about a Tampa-Bay flagship list, not a nearby occasion.
//
// THE CURE is the same identity-pool shape breakfast/family/events already
// use (lib/railsData.js buildIdentityPool):
//   1. Rank owned nearby inventory (and the existing ranked pools) for a
//      birthday-appropriate OCCASION.
//   2. The owner's curated entries are a SEED / editorial boost — they
//      admit a matching nearby row and carry its why line. They are not
//      the universe, and they never hydrate via Place Details.
//   3. Distance is BIRTHDAY_NEAR_MI from the visitor. No 45-mile near
//      tier, no 120-mile destination stretch. Empty stays empty.
//
// Evidence the row actually carries — Google types first, whole-word name
// second, curated placeId third. Nothing infers a "wow moment" from a vibe,
// and a missing editorial line stays missing.
import { birthdayEntries } from "./birthdayUniverse.js";
import { isQuickService } from "./quickService.js";
import { NATIONAL_QUICK_RX } from "./breakfast.js";

// A birthday night is local. Acceptance (owner, 2026-08-19): at a
// Parrish/Bradenton point, #1 is a real nearby place — within ~10 miles
// when local inventory exists — not a Tampa flagship by default.
export const BIRTHDAY_NEAR_MI = 10;

// Types that prove celebratory dining, group energy, or entertainment —
// the occasion axis, not "any restaurant" (eat) and not "the room" (date
// night). italian_restaurant / american_restaurant stay off this list on
// purpose: they are the eat rail, and a pizza counter must not inherit a
// birthday card from a cuisine token.
export const BIRTHDAY_TYPES = [
  "steak_house", "fine_dining_restaurant", "seafood_restaurant",
  "wine_bar", "cocktail_bar", "brunch_restaurant",
  "spanish_restaurant", "tapas_restaurant",
  "night_club", "comedy_club", "banquet_hall",
  "karaoke",
];
const BIRTHDAY_SET = new Set(BIRTHDAY_TYPES);

// Whole-word name evidence for venues Google types miss (a "Gastrobar",
// a dinner cruise, a private-karaoke room). Same boundary law as
// breakfast / quickService — "cruise" is a word, so "Yacht StarShip
// Cruises" qualifies and "Cruise Control Auto" would have to actually
// carry the word as a token.
const NAME_BIRTHDAY = /\b(karaoke|rooftop|waterfront|gastrobar|steak ?house|chop ?house|bistro|trattoria|osteria|supper|piano|lounge|cruises?|yacht|speakeasy|cabaret|tapas|sangria|wine bar|biergarten|food hall|brunch)\b/i;

const typeList = (p) => {
  const out = [];
  if (p && Array.isArray(p.types)) for (const t of p.types) out.push(String(t || "").toLowerCase());
  if (p && p.primaryType) out.push(String(p.primaryType).toLowerCase());
  if (p && p.primary_type) out.push(String(p.primary_type).toLowerCase());
  return out;
};

let _seedIds = null;
/** Place IDs the owner already anchored. Membership seed only — never a
 *  score, never a fabricated row. */
export function birthdaySeedIds() {
  if (!_seedIds) {
    _seedIds = new Set(birthdayEntries().map((e) => e.venue && e.venue.placeId).filter(Boolean));
  }
  return _seedIds;
}

export function isBirthdaySeed(p) {
  const id = p && (p.id || p.placeId || p.place_id);
  return !!(id && birthdaySeedIds().has(id));
}

// A beach, a grocery, a hotel restaurant, a national burger counter — none
// of these are a birthday PLAN, whatever secondary types they carry.
const VETO_PRIMARY_RX = /(fast_food|hamburger_restaurant|pizza_restaurant|^cafe$|^coffee_shop$|^bakery$|grocery_store|supermarket|convenience_store|gas_station|_hotel$|^hotel$|^motel$|^beach$|^park$|city_park|state_park|rv_park|campground)/;

/** PURE. The plain identity, for pre-targeted ranked-pool rows and the
 *  rail's pick. A curated seed always qualifies (the owner already chose
 *  it); everyone else needs type or name evidence and must survive the
 *  quick-service / chain veto. */
export function isBirthdayPlace(p) {
  if (!p) return false;
  if (isBirthdaySeed(p)) return true;
  if (NATIONAL_QUICK_RX.test(String(p.name || ""))) return false;
  const types = typeList(p);
  if (types.some((t) => t === "beach" || t === "natural_feature")) return false;
  // A birthday TYPE admits before the quick-service veto: brunch rooms
  // almost always also carry `cafe`, and veto-first would throw out the
  // exact garden-brunch shape the owner's list named.
  if (types.some((t) => BIRTHDAY_SET.has(t))) return true;
  if (isQuickService(p)) return false;
  return NAME_BIRTHDAY.test(String(p.name || ""));
}

/** PURE. The strong form, for raw inventory widening: the plain identity
 *  AND a primary type that does not name a counter, grocery, hotel, or
 *  beach. Seeds skip the veto — they are already venue-anchored. */
export function isStrongBirthdayPlace(p) {
  if (isBirthdaySeed(p)) return true;
  if (!isBirthdayPlace(p)) return false;
  const pt = String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();
  if (pt && VETO_PRIMARY_RX.test(pt)) return false;
  return true;
}
