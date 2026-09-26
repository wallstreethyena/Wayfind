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
// v8.86 (2026-09-23, WS4 second-pass re-verification, orchestrator-directed
// fail-closed removal — full evidence in lib/fallPool.js's removal log and
// docs/audits/fall-discovery/2026-09-23.{json,md}): FIVE ids REMOVED after a
// real-browser re-check found no current-season evidence and no live
// evergreen theme on their own official pages — Gasparilla Distillery
// (2024 event, never refreshed for 2026), Paradeco Coffee Roasters, Oxford
// Exchange and On Swann (current live menus carry zero fall vocabulary), and
// Ice Screamin (its own current site rebranded away from any horror theme).
// Not moved to FALL_REJECTED_IDS — that list is for name-only/duplicate
// picks, never for a real offering that lapsed. Their official sources stay
// in data/fall-discovery/official-sources.json so the weekly pipeline can
// re-propose any of them the moment fresh evidence exists.
// v8.88 (2026-09-23, independent-audit fix round, same day): a SIXTH id
// removed — ATRIA Cafe (ChIJA-QkamE7w4gRfdzcxEHyPls). The "verified
// 2026-09-23" date on its lib/fallPool.js row was never backed by a recorded
// second-pass fetch; re-fetching its live Toast menu this round found it
// completely overhauled to a sourdough-pizza program with zero coffee/
// breakfast items and zero fall vocabulary (docs/audits/fall-discovery/
// 2026-09-23.md). Fail-closed removal, not a rejection — its URL stays in
// data/fall-discovery/official-sources.json for future re-proposal.
export const FALL_CARD_IDS = new Set([
  "ChIJ7QVjUK_FwogRaTLY8uxOico", // SpookEasy Lounge
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk", // Dracula's Legacy Tampa
  "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI", // Joy Coffee, Bradenton
  "ChIJY5LPSxJAw4gRMhj-bOy9MKU", // Buddy Brew Coffee, Sarasota
  "ChIJ9ZpMS-7jwogRWChZqTQG66g", // Sōl St Pete
  // Astra 2026-09-25 — current verified Fall Drinks & Seasonal Bites.
  "ChIJ3xa3znR_54gRR3bePMYdOfg", // CFS Coffee Dr. Phillips
  // Astra 2026-09-26 — exact Orlando identities, current official fall menus.
  "ChIJC9pvtLN654gR6F0GZH-G-8I", // Gideon's Bakehouse, East End Market
  "ChIJEUd8H-Nj54gRq59RRWIA6mI", // Another Broken Egg Cafe, Orlando
  "ChIJ-ZFB15jtwogRpEcx2izoHr8", // Charlie Coffee, Palm Harbor
  "ChIJJWzJr9232YgR6jjHElv8mjc", // Pura Vida Miami
  "ChIJsRAN-H5Bw4gRl0sAl0587IY", // CROP Juice, Sarasota
  "ChIJYVbXKAC32YgRUVddTqA46Kg", // Crema Gourmet Coconut Grove
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0", // Ghost Party Haunted Tours
  "ChIJd6lmgVh_3YgREzqTBf28i6U", // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw", // Orlando Ghosts
  // v8.83 (2026-08-27 sweep) — two more, both with a documented offering in
  // lib/fallPool.FALL_OFFERING_SOURCES. See that file for what the same sweep
  // REJECTED and why; the rejections are the more useful half.
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM", // Fear at the Pier Haunted Attraction, Panama City Beach
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY", // Red Coconut Club -> Dead Coconut Club, Universal CityWalk
  // v8.84 (2026-09-22) — Pinto's Farm, Redland/Miami: "Fall at the Farm"
  // pumpkin patch, Sep 19-Nov 8 2026. See lib/fallPool.FALL_OFFERING_SOURCES
  // for the documented offering and source.
  "ChIJUczTK5XC2YgRRt4Jp6N3B70", // Pinto's Farm, Miami
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
