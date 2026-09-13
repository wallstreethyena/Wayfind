// One breakfast answer, two identities. These are intentionally exclusive:
// a café may serve breakfast, but it belongs in the café rail so the first
// rail remains a ranking of meal-first breakfast rooms.
import { rankRailPlaces } from "./railRank.js";
import { isMorningCandidate, morningDisplayIdentity } from "./morningIdentity.js";

export function isCafePlace(place) {
  return morningDisplayIdentity(place) === "cafe";
}

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, reviews DESC, distance
// ASC, place_id ASC. This composer previously did not rank at all — it split
// into the two identities and returned each bucket in whatever order the
// caller's array happened to be in, while BreakfastRails.js renders an
// explicit 1/2/3 `rank` from that array position. Caught by
// scripts/check-rail-rank-law.mjs enumerating this file from the filesystem
// (lib/*Rails*.js) rather than from a hand-written composer list — exactly
// the class of unguarded rail this guard exists to end.
export function splitBreakfastRails(places) {
  const breakfast = [];
  const cafes = [];
  for (const place of Array.isArray(places) ? places : []) {
    // The caller may hand us a broad Food pool.  A dinner restaurant is not a
    // breakfast result merely because it is not a café.
    if (!isMorningCandidate(place)) continue;
    const identity = morningDisplayIdentity(place);
    if (identity === "cafe") cafes.push(place);
    else if (identity === "breakfast") breakfast.push(place);
  }
  return [
    { id: "breakfast-restaurants", title: "Best Breakfast", deck: "The strongest spots for a real breakfast.", places: rankRailPlaces(breakfast) },
    { id: "breakfast-cafes", title: "Best Cafés", deck: "Great coffee, pastries, and easy mornings.", places: rankRailPlaces(cafes) },
  ];
}
