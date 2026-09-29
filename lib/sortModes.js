// lib/sortModes.js — THE user-chosen sort, applied LAST.
//
// Owner, 2026-09-28: "the location should be ascending … there was one that
// was 0.7 miles and then another one that was like 15 miles and then another
// one that's 0.9 miles … everything gets sorted that way, for the rating, for
// the distance, whatever it may be."
//
// ROOT CAUSE. The browse feed (app/home.js) sorted the pool and THEN ran
// dedupePlaces(…, collapseBrand=true). Brand collapse keeps the slot of the
// FIRST branch it meets but swaps in the "better" branch (open-now, then more
// reviews) — so a chain's 0.7 mi branch held position 1 while its 15 mi
// flagship was written into that slot, giving 0.7 → 15 → 0.9 on screen. The
// same swap broke "Top rated" (an open 8.9 branch inherited a closed 9.6
// branch's slot). Any post-sort transform that replaces rows can do this, so
// the fix is structural: the explicit sort is the LAST ordering step, and
// "Closest first" collapses a brand to its NEAREST branch.
//
// Locked by scripts/test-sort-modes.mjs (runs the real functions).
import { byTopRated } from "./ranking.js";

export const SORT_MODES = ["near", "rated", "price"];

const openRank = (p) => (!p ? 4 : p.openNow === true ? 0 : p.openNow == null ? 1 : (p.nextOpen && p.nextOpen.today) ? 2 : 3);
const distKey = (p) => (p && typeof p.distMi === "number" && isFinite(p.distMi) ? p.distMi : Infinity);
const priceKey = (p) => {
  const v = p ? (p.price_level ?? p.priceLevel) : null;
  return typeof v === "number" && isFinite(v) ? v : 9;
};

// Primary key is the one the reader chose and can SEE on the card. Open-now
// and score only break exact ties — they never contradict the primary key.
export function byDistance(a, b) {
  const da = distKey(a), db = distKey(b);
  if (da !== db) return da < db ? -1 : 1;
  return (openRank(a) - openRank(b)) || byTopRated(a, b);
}

export function byPrice(a, b) {
  const pa = priceKey(a), pb = priceKey(b);
  if (pa !== pb) return pa - pb;
  return ((b && b.rating) || 0) - ((a && a.rating) || 0) || byTopRated(a, b);
}

export function comparatorFor(mode) {
  if (mode === "near") return byDistance;
  if (mode === "rated") return byTopRated;
  if (mode === "price") return byPrice;
  return null;
}

/** Returns a NEW array in the chosen order; unknown modes return a copy unchanged. */
export function sortPlacesBy(list, mode) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  const cmp = comparatorFor(mode);
  return cmp ? arr.sort(cmp) : arr;
}

/** True when `list` is monotonic under `mode` — used by guards and diagnostics. */
export function isSortedBy(list, mode) {
  const cmp = comparatorFor(mode);
  if (!cmp || !Array.isArray(list)) return true;
  for (let i = 1; i < list.length; i++) if (cmp(list[i - 1], list[i]) > 0) return false;
  return true;
}

/** Brand-collapse picker for "Closest first": the nearest branch wins. */
export function nearestBranch(a, b) {
  if (!a) return b; if (!b) return a;
  return byDistance(a, b) <= 0 ? a : b;
}
