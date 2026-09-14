import { wayfindScore } from "./wayfindScore.js";
import { toDisplayScore } from "./score.js";

// lib/ownerBump.js — THE GOD BUMP, ON THE NUMBER.
//
// Size is banded from the PRE-BUMP shown score (owner, 2026-09-14):
//   ≤ 8.0  → +1.5 on the badge (15 internal)
//   8.1–9.0 → +0.6 on the badge (6 internal)
//   > 9.0  → +0.2 on the badge (2 internal)
// The old rule was a flat +0.7 (7 internal) for every ownerPick. The
// mechanism is unchanged: server-only owner identity, ownerPick from
// /api/signals/likes, stampOwnerPick / withOwnerBump / _wfScoreRaw so
// like/unlike is idempotent, Curator's pick locked to the bump.
//
// WHAT ALREADY EXISTED, so this extends one mechanism instead of adding a
// second. The owner's like has counted as `weight` (default 50) inside the
// community like nudge since lib/memberSignals.js was written, and
// `_members.ownerPick` already drives the gold "Curator's pick" treatment on
// the card. What did NOT exist is any effect on the SCORE ITSELF —
// memberSignals says so in its own header: the flag "feeds the display-only
// Curator's pick chip and has NO extra score effect beyond the like weight".
// That sentence is what this release changes.
//
// ── THE SIZE, AND WHY IT IS STATED IN INTERNAL POINTS ───────────────────────
// Wayfind stores the score 0-100 and displays it /10 (lib/score.js
// toDisplayScore). "+1.5 on the badge" is therefore FIFTEEN internal points,
// and writing it as 15 here rather than 1.5 is deliberate: a 1.5 added on the
// internal scale would be a 0.15 on the badge — nearly invisible — and that
// mistake is exactly the class lib/landing.js made when it mixed the two
// scales (see the header of lib/wayfindScore.js for what that cost).
//
// The band is chosen from the PRE-BUMP shown number (`_wfScoreRaw` /
// ownerBumpScoreRaw), never the already-bumped wfScore, so a second like
// cannot stack and a 9.5 that used to be an 8.0 does not shrink into the
// mid band on the next stamp.
//
// ── THE CEILING IS REAL ─────────────────────────────────────────────────────
// 10.0 is the top of the scale the badge draws and the top of what
// isValidScore accepts. A 9.9 bumped to 10.1 would render "10.1/10", which is
// not a number this product can mean. Clamped at 100.
//
// ── AND THE PART THAT IS NOT NEGOTIABLE: IT IS DISCLOSED ────────────────────
// The Wayfind Score is sold to the reader as unbought — the top-10 sheet's own
// copy says "No ads, no paid placement, just what consistently earns it", and
// the sponsored card's rule is "money buys the position, never the number". A
// bump nobody can see would make both of those false.
//
// It does not have to be invisible, because the card ALREADY has the surface:
// `_members.ownerPick` is what paints the gold Curator's pick treatment, and it
// is the same flag that gates this bump. So the two are locked together —
// scripts/check-owner-bump.mjs fails the build if a card can carry the bumped
// number without carrying the mark that explains it. The owner's taste may
// move the number; it may not move it silently.
//
// ownerPick is SERVER-derived. The likes route matches WF_OWNER_USER_ID and,
// as a second door, the signed-in / auth-user email (lib/ownerIdentity.js).
// The client never hardcodes that email or UUID — it only renders ownerPick
// and applies the bump when the server said so.

/** Internal points when the pre-bump shown score is 8.0 or below. */
export const OWNER_BUMP_LEQ_80 = 15;

/** Internal points when the pre-bump shown score is 8.1 through 9.0 inclusive. */
export const OWNER_BUMP_81_TO_90 = 6;

/** Internal points when the pre-bump shown score is above 9.0. */
export const OWNER_BUMP_ABOVE_90 = 2;

/** The top of the scale. A bumped score may reach it and may not pass it. */
export const SCORE_CEILING = 100;

/**
 * Internal points to add for a pre-bump 0–100 score.
 *
 * Uses the shown ( /10, one decimal ) number so the bands match the badge
 * the owner is looking at. Unrated / garbage → 0 (withOwnerBump will still
 * refuse to mint a number from null).
 */
export function ownerBumpPoints(score) {
  const shown = toDisplayScore(score);
  if (shown == null) return 0;
  if (shown <= 8.0) return OWNER_BUMP_LEQ_80;
  if (shown <= 9.0) return OWNER_BUMP_81_TO_90;
  return OWNER_BUMP_ABOVE_90;
}

/**
 * Is this place carrying the owner's like?
 *
 * Reads the aggregate the server produced. Deliberately NOT `place.ownerPick`
 * or any top-level flag: the only writer of `_members` is withMemberSignal
 * applying /api/signals/likes, so there is one door and a place object built
 * anywhere else cannot mint itself a bump.
 */
export function isOwnerPick(place) {
  return !!(place && place._members && place._members.ownerPick === true);
}

/**
 * The 0–100 number the card would show before the god bump.
 *
 * Prefers a remembered pre-bump raw so like/unlike cannot double-apply.
 * Falls back to the stored wfScore, then to the same rating/review formula
 * PlaceCard uses when wfScore is still null — that is a REAL score the card
 * already paints, not a phantom 0. Unrated stays null (Score pending).
 */
export function ownerBumpScoreRaw(place) {
  if (!place || typeof place !== "object") return null;
  const remembered = place._wfScoreRaw;
  if (remembered != null && typeof remembered === "number" && isFinite(remembered)) return remembered;
  if (place.wfScore != null && typeof place.wfScore === "number" && isFinite(place.wfScore)) return place.wfScore;
  const rating = Number(place.rating);
  if (rating > 0) {
    return wayfindScore(rating, Number(place.reviews != null ? place.reviews : place.userRatingCount) || 0);
  }
  return null;
}

/**
 * Stamp or clear the owner's pick on a place and apply/remove the bump.
 *
 * Idempotent: liking twice does not stack. A null/unrated base stays null
 * (no fake bump). `_members.ownerPick` is set so the Curator's pick mark and
 * the number stay locked together.
 */
export function stampOwnerPick(place, owned) {
  if (!place || typeof place !== "object") return place;
  const want = owned === true;
  const remembered = place._wfScoreRaw;
  let raw = null;
  if (remembered != null && typeof remembered === "number" && isFinite(remembered)) raw = remembered;
  else if (place.wfScore != null && typeof place.wfScore === "number" && isFinite(place.wfScore)) raw = place.wfScore;
  else if (want) raw = ownerBumpScoreRaw(place);
  return {
    ...place,
    ...(raw != null ? { _wfScoreRaw: raw } : {}),
    wfScore: withOwnerBump(raw != null ? raw : place.wfScore, want),
    _members: { ...(place._members || { authors: 0, warnAuthors: 0 }), ownerPick: want },
  };
}

/**
 * Apply the bump to an internal 0-100 score.
 *
 * Total over garbage, because this runs inside every list map: a null base
 * stays NULL. That is the B14 rule this file inherits — an unrated place shows
 * "Score pending", and coercing null to 0 here would turn the owner's like into
 * a fake badge on a place nobody has rated, which is the exact defect
 * lib/score.js's header exists for.
 *
 * The size is chosen from this pre-bump `score`, never from an already-bumped
 * number. Callers that have `_wfScoreRaw` must pass that.
 *
 * @param {number|null} score internal 0-100
 * @param {boolean} owned     is this the owner's pick
 * @returns {number|null}
 */
export function withOwnerBump(score, owned) {
  if (!owned) return score;
  if (score == null || typeof score !== "number" || !isFinite(score)) return score;
  return Math.min(SCORE_CEILING, score + ownerBumpPoints(score));
}
