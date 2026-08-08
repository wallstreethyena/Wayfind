// lib/lawfulOrder.js — ONE lawful comparator for every ranked place list.
//
// WHY THIS FILE EXISTS (2026-08-08, owner: "i have a 10 score but they are not
// listed as number 1 … i need that to be fixed globally on the entire website
// so that when a place is ranked higher it will always be displayed on the top
// not below").
//
// THE REPORTED CASE. On a Parrish café list: American Honey Creamery showed a
// chip reading 9.3 at rank 1, and Ryan's Coffee House showed 10.0 at rank 2.
// Both numbers were correct. The ORDER was not. rankRows (lib/intentPages.js)
// sorted by `bayes(rating,reviews)/5*10 − distanceDeduction + trending`, which
// contains no creator-video term at all — so the +0.7 that put Ryan's at 10.0
// was invisible to the sort, and the retired per-mile drive decay pushed it
// further down for being farther away.
//
// THE AUDIT THAT FOLLOWED found the same class of defect on roughly forty
// surfaces, all sharing one root cause: the app had TWO numbers per place — a
// "display score" (governed: base +0.7 video −0.2 far +0.6 trending) and a
// separate, richer "rank score" (weather fit, daypart, open-now, per-mile
// decay, curated bonuses, faveTier, commercial tier). lib/rankPlaces.js said
// so in its own header — "ORDER-ONLY. The Wayfind Score a reader SEES is never
// this number." That contract is the bug. A reader compares the two numbers
// printed on two cards; if the list is ordered by anything else, the list is
// wrong on its face, no matter how good the hidden model is.
//
// THE RULE THIS MODULE IMPLEMENTS:
//
//   1. The governed Wayfind Score is the PRIMARY sort key. Always. Everywhere.
//   2. Context (weather, daypart, open-now, distance, tier, affinity) may only
//      break ties BETWEEN ROWS SHOWING THE SAME NUMBER.
//   3. Filters are unaffected. Removing a row is not reordering it — the
//      outdoor weather gate (rule 3, owner 2026-07-xx: "suppressed, not merely
//      demoted") keeps its full force, because suppression happens before this.
//
// WHY TIE-BREAKING IS NOT A CONSOLATION PRIZE. The displayed scale has one
// decimal over 0–10, i.e. ~100 buckets, and real result sets cluster hard in
// the 8.8–9.6 range. Equal-score ties are the common case, not the edge case,
// so weather/daypart/open-now still decide a great deal of the order — they
// just can never contradict the number a reader is looking at. This is the
// same shape as lib/diversify.js's ties-only head diversity, which has held
// since 2026-08-07.
//
// WHY THE KEY IS displayedWfScore() AND NOT A REIMPLEMENTATION. The chip
// (app/components/kit.js PlaceScoreChip → displayedWfScore, and
// IconicPlaceCard → governed_score) and this sort call the SAME function on
// the SAME object. Shown == sorted is therefore true by construction rather
// than by two implementations agreeing — which is exactly how the previous
// two attempts rotted.
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { displayedWfScore, hasCreatorVideoAt } from "./creatorBoost.js";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/**
 * The ONE number: what the card shows and what orders the card, on the 0–100
 * internal scale. Total function over untrusted rows; never throws.
 *
 * Handles all three row shapes the app carries:
 *   • already stamped   → governed_score (byVisibleScore / rankRows output)
 *   • app-shaped place  → wfScore + distMi  (delegates to displayedWfScore,
 *                          which is literally the chip's own function)
 *   • raw RPC/DB row    → rating + reviews + distance_mi
 *
 * @returns {number|null} 0–100, or null for an unrated place ("Score pending").
 */
export function governedScoreOf(p, locName) {
  if (!p) return null;
  // Already stamped by an upstream lawful sort — never recompute, or a second
  // derivation can drift from the first (the 2026-08-07 chip/sort split).
  if (Number.isFinite(p.governed_score)) return p.governed_score;
  if (p.wfScore != null) return displayedWfScore(p, locName);
  const base = wayfindScore(p.rating, p.reviews);
  if (base == null) return null;
  const dist = num(p.distMi) != null ? num(p.distMi) : num(p.distance_mi);
  let video = false;
  try { video = p.creator_video === true || hasCreatorVideoAt(p, locName); } catch (e) { video = false; }
  return governedWayfindScore(base, { hasCreatorVideo: video, distanceMi: dist, trending: !!p.trending });
}

/**
 * Stamp `governed_score` on every row, once, and return the same array.
 *
 * MUTATES IN PLACE ON PURPOSE: the stamp has to survive onto whatever the
 * caller renders, because the card reads `governed_score` back off the row to
 * draw the chip. A copy would hand the card an unstamped object and reopen the
 * exact shown!=sorted gap this module closes.
 *
 * Called once per row rather than inside the comparator — governedScoreOf()
 * reaches creatorVideosFor(), and an O(n log n) registry walk in a hot sort is
 * how a 12-row list turns into a jank frame.
 */
export function stampGoverned(rows, locName) {
  const list = Array.isArray(rows) ? rows : [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    if (Number.isFinite(r.governed_score)) continue;
    const g = governedScoreOf(r, locName);
    if (g != null) r.governed_score = g;
  }
  return list;
}

/**
 * THE LAWFUL SORT. Governed score first; the caller's context only breaks ties
 * between rows showing the same number.
 *
 * @param {Array}    rows
 * @param {Function} [contextKey]  row -> number, higher is better. Weather fit,
 *                                 daypart, open-now, tier, affinity — anything
 *                                 the surface legitimately cares about. It can
 *                                 never move a row past a differently-scored
 *                                 one, so it needs no scale discipline.
 * @param {string}   [locName]     passed through to the creator-video lookup
 * @returns {Array} a NEW array, sorted. Rows are stamped with governed_score.
 */
export function lawfulSort(rows, contextKey, locName) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  stampGoverned(list, locName);
  return list.slice().sort(lawfulComparator(contextKey, locName));
}

/**
 * The same law as a bare comparator, for call sites that are mid-chain and
 * cannot swap in an array-returning helper (`.filter(...).sort(...)...`).
 *
 * Stamps lazily and memoises on the row, so it is safe to hand straight to
 * Array#sort without a separate stamping pass.
 */
export function lawfulComparator(contextKey, locName) {
  const ctx = typeof contextKey === "function" ? contextKey : null;
  const g = (r) => {
    if (!r || typeof r !== "object") return -Infinity;
    if (!Number.isFinite(r.governed_score)) {
      const v = governedScoreOf(r, locName);
      if (v != null) r.governed_score = v;
    }
    return Number.isFinite(r.governed_score) ? r.governed_score : -Infinity;
  };
  return (a, b) => {
    // 1. THE NUMBER ON THE CARD. Nothing outranks this.
    //
    // Compared by SIGN, not by subtraction: an unrated row keys as -Infinity,
    // and -Infinity − -Infinity is NaN (two unrated rows would compare as
    // "unordered" and Array#sort's behaviour on NaN is unspecified), while
    // finite − -Infinity is -Infinity (a comparator is required to return a
    // finite number). Both cases are real — an unrated place is a first-class
    // row here, since wayfindScore() returns null by contract rather than
    // inventing a number.
    const ga = g(a), gb = g(b);
    if (ga !== gb) return gb > ga ? 1 : -1;
    // 2. Context, among rows a reader sees as equal.
    if (ctx) {
      const ca = Number(ctx(a)), cb = Number(ctx(b));
      const cd = (isFinite(cb) ? cb : 0) - (isFinite(ca) ? ca : 0);
      if (cd) return cd;
    }
    // 3. Evidence volume, so equal scores are not left to array order.
    return (Number(b && b.reviews) || 0) - (Number(a && a.reviews) || 0);
  };
}

/**
 * A bare comparator for callers that already hold a sorted-in-place array and
 * only want the law applied (e.g. an existing `.sort(byTopRated)` call site).
 * Rows MUST be stamped first — use lawfulSort() unless you have a reason.
 */
export const byGovernedScore = (a, b) => {
  const ga = a && Number.isFinite(a.governed_score) ? a.governed_score : -Infinity;
  const gb = b && Number.isFinite(b.governed_score) ? b.governed_score : -Infinity;
  if (ga !== gb) return gb > ga ? 1 : -1; // sign, not subtraction — see lawfulComparator
  return (Number(b && b.reviews) || 0) - (Number(a && a.reviews) || 0);
};

/**
 * PERFECT SCORE. A governed score of 100 renders as a 10.0 — the top of the
 * scale, and rare enough to be worth calling out (owner, 2026-08-08: "when
 * something is a 10 make sure to add the fire emoji on it").
 *
 * Takes EITHER scale so no caller has to remember which one it holds: values
 * over 10 are treated as the internal 0–100 scale, values at or under 10 as
 * the displayed scale. 100 and 10.0 are the only inputs that qualify.
 */
export function isPerfectScore(v) {
  const n = num(v);
  if (n == null) return false;
  return n > 10 ? Math.round(n) >= 100 : Math.round(n * 10) >= 100;
}
