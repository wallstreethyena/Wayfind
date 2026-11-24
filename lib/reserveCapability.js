// lib/reserveCapability.js — ONE capability to CTA contract for "reserve a table" (pure, no imports, no network).
// Cards and the detail sheet both read this, so they cannot disagree about what a restaurant offers.
//
//   lane "instant"  Wayfind partner, books on the spot      -> "Reserve a table"
//   lane "request"  Wayfind partner, asks the restaurant    -> "Request a table"
//   lane "handoff"  verified OpenTable link, finish there   -> "Reserve on OpenTable"
//   lane "browser"  verified online platform in live view   -> "Reserve a table"
//   none            no online reservation route             -> no reservation button
//
// Every label opens the in-app concierge with the restaurant already selected. Places without an online
// reservation route do not show a reservation button.
export const RESERVE_LANES = ["instant", "request", "handoff", "browser"];
export const RESERVE_LABELS = { instant: "Reserve a table", request: "Request a table", handoff: "Reserve on OpenTable", browser: "Reserve a table", ask: "Ask about a table" };

export const reserveLabel = (lane) => RESERVE_LABELS[lane] || null;
export const isReserveLane = (lane) => RESERVE_LANES.indexOf(lane) >= 0;

// The place id the same way reserveClient always read it.
export const reservePlaceId = (place) => (place && (place.id || place.place_id) ? String(place.id || place.place_id) : "");

const typesOf = (p) => [...((p && p.types) || []), p && p.primaryType, p && p.primary_type].filter(Boolean).map((t) => String(t).toLowerCase());
const SIT_DOWN = /restaurant|steak_house|steakhouse|bar_and_grill|gastropub|bistro|diner|(^|_)bar($|_)|(^|_)pub($|_)|wine_bar|cocktail_bar|brewery|brewpub|lounge/;
const WALK_IN = /cafe|coffee|bakery|ice_cream|tea_house|juice|donut|dessert|fast_food|food_truck|food_court|meal_takeaway|meal_delivery|sandwich_shop|bagel|candy|snack/;
const NOT_FOOD = /lodging|hotel|motel|resort|campground/;

/** Sit down restaurant or bar classification (kept for diagnostics and detail CTA gap checks). */
export function isSitDownPlace(place) {
  if (!place) return false;
  const all = typesOf(place);
  if (!all.length || all.some((t) => NOT_FOOD.test(t))) return false;
  const primary = [place.primaryType, place.primary_type].filter(Boolean).map((t) => String(t).toLowerCase());
  if (primary.some((t) => WALK_IN.test(t))) return false; // a cafe that also lists "restaurant" is still a cafe
  if (!all.some((t) => SIT_DOWN.test(t))) return false;
  if (!primary.length && all.some((t) => WALK_IN.test(t)) && !all.some((t) => /restaurant|(^|_)bar($|_)|pub/.test(t))) return false;
  return true;
}

/**
 * The lane for a place. caps = { state: "loading" | "ok" | "failed", lanes: {placeId: lane}, ids: Set }.
 * loading -> null (nothing new is drawn while support is unknown, and the server HTML never carries it).
 * ok      -> the verified online booking lane ("instant" | "request" | "handoff" | "browser"), else null.
 * failed  -> null (never show a reservation button when we cannot verify online booking).
 */
export function reserveLaneFor(place, caps) {
  const id = reservePlaceId(place);
  if (!id || !caps || caps.state !== "ok") return null;
  const lane = caps.lanes && caps.lanes[id];
  return isReserveLane(lane) ? lane : null;
}
