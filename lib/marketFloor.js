// lib/marketFloor.js — a review floor that scales with the market.
// MARKET-RELATIVE REVIEW FLOOR
// ----------------------------
// The flat >=15 floor in floorOk() is right for a small town and far too low
// for a major market. Live Orlando put "Historic Angebilt Building" — 4.4 stars
// from 61 reviews — at #9, above Fun Spot America and the Orlando Eye. It is a
// building, not a destination; it only survived because 61 > 15.
//
// A fixed higher number would break Parrish, where 61 reviews is a genuinely
// popular spot. So the floor scales with the market's own attention: an entry
// must carry at least 1% of the MEDIAN review count of its own candidate pool.
//
//   Orlando  median ~17,000 -> floor ~170  (drops the 61-review building,
//                                           keeps CityArts at 287)
//   Parrish  median ~200    -> floor 15    (clamped; behaviour unchanged)
//
// Clamped hard at both ends: never below the existing 15, never above 250, so
// a single mega-venue cannot raise the bar out of reach for a real local spot.
export const REL_FLOOR_FRACTION = 0.01;
export const REL_FLOOR_MIN = 15;
export const REL_FLOOR_MAX = 250;

export function marketReviewFloor(pool) {
  const counts = (pool || []).map((p) => Number((p && p.reviews) || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length < 5) return REL_FLOOR_MIN; // too thin to infer a market bar
  const mid = Math.floor(counts.length / 2);
  const median = counts.length % 2 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2;
  return Math.max(REL_FLOOR_MIN, Math.min(REL_FLOOR_MAX, Math.round(median * REL_FLOOR_FRACTION)));
}

/**
 * Curated picks and genuinely unrated POIs are never dropped by the floor.
 * `isCurated` is passed in rather than looked up so this module stays pure and
 * free of the landing page's curated-name index.
 */
export function passesMarketFloor(p, floor, isCurated) {
  if (!p) return false;
  if (isCurated) return true;
  if (p.rating == null) return true;            // unrated POI — floorOk already judged it
  return Number(p.reviews || 0) >= floor;
}
