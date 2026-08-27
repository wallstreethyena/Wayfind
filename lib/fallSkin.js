// lib/fallSkin.js — the CLIENT sliver of the fall pool: exactly what the
// browser bundle needs (the skin date law + the franchise dedupe key), split
// out so importing it does not drag lib/fallPool.js's server-side pool
// definitions (place whys, ticket-deal map) into the homepage chunk. The
// bundle ratchet is why this file exists; lib/fallPool.js re-exports these,
// so there is still exactly ONE definition of each law.

// THE ANNUAL WINDOW (owner, 2026-08-26, superseding his own same-day
// "gone after Halloween" call — dated note so nobody undoes the LATER
// directive): "make sure the fall place cards come back every year on
// 08/26 and they leave after Thanksgiving … i want them back and i want
// them gone when needed." So the season is COMPUTED, for every year:
// live from Aug 26 through Thanksgiving Day (4th Thursday of November),
// gone the morning after — never remembered, never lost, never worn out
// of season.
export const FALL_SEASON_START_MD = "08-26";
export function thanksgivingDayOfMonth(year) {
  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - nov1Dow + 7) % 7);
  return firstThursday + 21;
}
export function fallSeasonEnd(year) {
  return year + "-11-" + String(thanksgivingDayOfMonth(year)).padStart(2, "0");
}
export function fallSkinLive(todayStr) {
  if (typeof todayStr !== "string" || todayStr.length !== 10) return false;
  const y = Number(todayStr.slice(0, 4));
  if (!Number.isFinite(y)) return false;
  return todayStr >= y + "-" + FALL_SEASON_START_MD && todayStr <= fallSeasonEnd(y);
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
  // v8.83 (2026-08-27 sweep) — two more, both with a documented offering in
  // lib/fallPool.FALL_OFFERING_SOURCES. See that file for what the same sweep
  // REJECTED and why; the rejections are the more useful half.
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM", // Fear at the Pier Haunted Attraction, Panama City Beach
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY", // Red Coconut Club -> Dead Coconut Club, Universal CityWalk
]);
export function fallCardClass(placeId, todayStr) {
  return placeId && FALL_CARD_IDS.has(placeId) && fallSkinLive(todayStr) ? " wf-fall-card" : "";
}

// v8.82 — THE SHARE TEXT. The owner, 2026-08-27: "when we share them, they
// gotta have some sort of a fall theme through it as well … when we share it
// as a text message." The image and the preview line are handled server-side
// in app/p/[id]/page.js; this is the sentence the sharer's own messages app
// puts above them. A maple leaf, on the same two conditions as the skin
// itself — so the message a friend receives in December says nothing about
// fall, because by then it isn't.
//
// A PREFIX, NOT A REPLACEMENT: the call sites say different things on purpose
// ("Check out X" vs "Want to go together?"), and none of that intent should be
// flattened to make room for a season.
export function fallShareLine(text, placeId, todayStr) {
  const t = String(text == null ? "" : text);
  return fallCardClass(placeId, todayStr) ? "\uD83C\uDF41 " + t : t;
}

const FRANCHISE_NOISE = new Set(["orlando", "tampa", "bay", "florida", "seaworld", "busch", "gardens", "legoland", "sarasota", "bradenton", "st", "pete", "key", "west", "at", "the"]);
export function eventFranchiseKey(name) {
  const words = String(name || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter((w) => w && !FRANCHISE_NOISE.has(w));
  return words.slice(0, 3).join(" ");
}
