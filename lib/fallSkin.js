// lib/fallSkin.js — the CLIENT sliver of the fall pool: exactly what the
// browser bundle needs (the skin date law + the franchise dedupe key), split
// out so importing it does not drag lib/fallPool.js's server-side pool
// definitions (place whys, ticket-deal map) into the homepage chunk. The
// bundle ratchet is why this file exists; lib/fallPool.js re-exports these,
// so there is still exactly ONE definition of each law.

export const FALL_SKIN_END = "2026-11-01";
export function fallSkinLive(todayStr) {
  return typeof todayStr === "string" && todayStr.length === 10 && todayStr <= FALL_SKIN_END;
}

// The FALL CARD follows the PLACE, everywhere it renders (owner, 2026-08-26:
// "leverage this style place card for all of the place cards that are
// featured for fall … only those places that are fall known and make it go
// away when fall is over"). Bare ids only — the whys live server-side in
// lib/fallPool.FALL_PLACE_IDS, and the guard asserts the two sets are
// IDENTICAL so membership has one source of truth. A card renderer calls
// fallCardClass(place.id, siteTodayStr()) and appends the result to its root
// className; outside the season, or off the list, it appends "".
export const FALL_CARD_IDS = new Set([
  "ChIJ7QVjUK_FwogRaTLY8uxOico", // SpookEasy Lounge
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk", // Dracula's Legacy Tampa
  "ChIJVQB8l1PEwogRfNZtGI6suIc", // Gasparilla Distillery
  "ChIJTzoiienhwogRbPa3GpuvBQU", // Paradeco Coffee Roasters
  "ChIJ11hsiYXEwogRjDBv39F04J8", // Oxford Exchange
  "ChIJ5crCip3EwogRQnhkbw_Ir6U", // On Swann
  "ChIJB2B8mYzHwogRkZIDCDARWww", // Ice Screamin Tampa
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0", // Ghost Party Haunted Tours
  "ChIJd6lmgVh_3YgREzqTBf28i6U", // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw", // Orlando Ghosts
]);
export function fallCardClass(placeId, todayStr) {
  return placeId && FALL_CARD_IDS.has(placeId) && fallSkinLive(todayStr) ? " wf-fall-card" : "";
}

const FRANCHISE_NOISE = new Set(["orlando", "tampa", "bay", "florida", "seaworld", "busch", "gardens", "legoland", "sarasota", "bradenton", "st", "pete", "key", "west", "at", "the"]);
export function eventFranchiseKey(name) {
  const words = String(name || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter((w) => w && !FRANCHISE_NOISE.has(w));
  return words.slice(0, 3).join(" ");
}
