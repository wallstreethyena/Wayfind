// lib/rankPlaces.js — ONE arithmetic for ordering places.
//
// WHAT WAS FOUND (2026-08-06). app/home.js composed the ordering SIX times, in
// six expressions, none of which agreed with the others:
//
//   :613  _ps          (p.wfScore || 50) + affinity − distance + faveTier*4
//                      + featured + community + (curated?15:0) + creator
//   :3629 rankScore    (p.wfScore || 50) + holidayFit + holidayPin + featured + creator
//   :3707 boostBase    (p.wfScore != null ? p.wfScore : 50) + featured + community + creator
//   :5914 sortFit      (p.wfScore || 0)  + featured + (curated?15:0) + ctx + creator
//   :6355 sortFit      (p.wfScore || 0)  + featured + ctx + creator
//   :7668 rankByCond   (p.wfScore || 0)  + faveTier*4 + featured + community + creator
//
// THE DEFECT THAT MATTERS IS THE FALLBACK, AND IT IS NOT COSMETIC. An unrated
// place — wayfindScore() returns null for those, deliberately, because "we have
// never heard of it" is not a score — is worth **50** on three of those rows and
// **0** on the other three. So the same unknown place sits mid-pack on the
// personalised feed and dead last on the fit sorts, on the same screen, on the
// same visit. Neither number was ever earned; 50 in particular is a fiction
// large enough to outrank a real 4.4-star place with 200 reviews.
//
// This module does not fix that yet, ON PURPOSE. It is the behaviour-identical
// extraction the ranking spec asks for as step 2, so the six sites can be proven
// to be one thing before that one thing is changed. `unratedBase` is therefore
// an explicit, ugly parameter rather than a constant — the ugliness is the
// point, and it is what makes the next commit a one-line decision instead of an
// archaeology exercise.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not compute the terms. The
// predicates that produce them — faveTier, featuredBoost,
// curatedFor, inCuratedRegion — STAY in app/home.js, because
// scripts/check-geo-gated-boosts.mjs reads that file directly and pins them
// there. Moving them would trade one guard for another. This owns the
// arithmetic; home.js owns the geography.
//
// COMMISSION IS NOT A TERM, and cannot become one. Nothing here imports or
// reads an affiliate, commission, payout or partner-priority field, and
// check-ranking-integrity.mjs asserts it. Every user-facing surface and the App
// Store description say rankings are merit-based; this file is where that claim
// is either true or false.

/** A place with no Wayfind Score is worth this much on the personalised feed. */
export const UNRATED_MIDPACK = 50;
/** …and this much on the fit sorts. The disagreement IS the bug. See header. */
export const UNRATED_LAST = 0;

/** Saved/liked tier is worth 4 points a step, everywhere it is applied. */
export const FAVE_TIER_WEIGHT = 4;
/** A curated pick is worth this, everywhere it is applied. */
export const CURATED_BONUS = 15;

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/**
 * The ordering score for one place. Higher sorts first.
 *
 * Every caller passes only the terms that surface actually has; an omitted term
 * is zero, which is what "this row does not consider distance" should mean and
 * what six hand-written expressions could never say out loud.
 *
 * ORDER-ONLY. The Wayfind Score a reader SEES is never this number — it is
 * p.wfScore, untouched. Nothing here is displayed.
 *
 * @param {object} parts
 * @param {number|null} parts.quality          the place's own wfScore, 0–100, or null
 * @param {number} [parts.unratedBase]         what a null quality is worth here
 * @param {number} [parts.contextBoost]        affinity, holiday fit, or moment fit
 * @param {number} [parts.distancePenalty]     subtracted, already computed by the caller
 * @param {number} [parts.faveTier]            tier count, NOT points
 * @param {number} [parts.featured]            featuredBoost()
 * @param {number} [parts.community]           unused since 2026-08-06 (see app/home.js);
 *                                          owner curation is applied in lib/memberSignals.js
 * @param {boolean} [parts.curated]            whether curatedFor() matched
 * @param {number} [parts.evidence]            creatorBoostFor(), already bounded
 * @returns {number}
 */
export function placeScore(parts) {
  const p = parts || {};
  const base = num(p.unratedBase) != null ? p.unratedBase : UNRATED_MIDPACK;
  // THE SEVENTH DISAGREEMENT, found by running the extraction against the six
  // original expressions rather than reading them.
  //
  // Five sites wrote `p.wfScore || 50` (or `|| 0`), which is a FALSY check: a
  // place whose score genuinely computes to 0 is treated as unrated and handed
  // the fallback. One site — boostBase at :3707 — wrote `p.wfScore != null ?
  // p.wfScore : 50`, which is not. So a 0 is worth 50 on the personalised feed
  // and 0 on the merit sort, in the same file, in the same visit.
  //
  // `zeroIsUnrated` preserves BOTH exactly, because this commit is the
  // behaviour-identical extraction and a refactor that quietly changes results
  // is not a refactor. It is the wrong behaviour in both directions — a
  // computed 0 is a score, not an absence — and collapsing it is the next
  // commit's job, in the open, where it can be watched.
  const zeroIsUnrated = p.zeroIsUnrated !== false;
  const qn = num(p.quality);
  const q = qn == null || (qn === 0 && zeroIsUnrated) ? base : qn;
  return (
    q +
    (num(p.contextBoost) || 0) -
    (num(p.distancePenalty) || 0) +
    (num(p.faveTier) || 0) * FAVE_TIER_WEIGHT +
    (num(p.featured) || 0) +
    (num(p.community) || 0) +
    (p.curated ? CURATED_BONUS : 0) +
    (num(p.evidence) || 0)
  );
}

/**
 * A descending comparator from a parts-builder. Saves every call site writing
 * the same `(a, b) => score(b) - score(a)` twice over, which is where the
 * :5914 and :6355 sorts each duplicated their whole expression — once per
 * operand — and is exactly how two of them drifted apart in the first place.
 */
export function byPlaceScore(partsFor) {
  return (a, b) => placeScore(partsFor(b)) - placeScore(partsFor(a));
}
