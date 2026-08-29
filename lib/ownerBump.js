// lib/ownerBump.js — THE GOD BUMP, ON THE NUMBER.
//
// v8.90 (owner, 2026-08-29): "make sure that every like button pressed by the
// account gabrielpereira@me.com receive the god bump which should be 0.7 bump
// in the score so a 8.0 would now be a 8.7 globally everywhere. Make sure the
// god bump works everywhere and there is a guard for that so every new place
// card has that feature in the future and they have it now."
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
// toDisplayScore). "0.7 on the badge" is therefore SEVEN internal points, and
// writing it as 7 here rather than 0.7 is deliberate: a 0.7 added on the
// internal scale would be a 0.07 on the badge — invisible — and that mistake
// is exactly the class lib/landing.js made when it mixed the two scales (see
// the header of lib/wayfindScore.js for what that cost).
//
// ── THE CEILING IS REAL ─────────────────────────────────────────────────────
// 10.0 is the top of the scale the badge draws and the top of what
// isValidScore accepts. An 9.6 bumped to 10.3 would render "10.3/10", which is
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
// ownerPick itself is SERVER-DERIVED and never client-decided: ownerId lives in
// server env, aggregateLikeSignals stamps the flag, and the client renders what
// it is given (app/home.js refreshOwnerPick). Nothing here changes that, and
// nothing here lets a device claim the bump for itself.

/** The bump, in INTERNAL points (0-100). 7 internal = 0.7 on the badge. */
export const OWNER_BUMP = 7;

/** The top of the scale. A bumped score may reach it and may not pass it. */
export const SCORE_CEILING = 100;

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
 * Apply the bump to an internal 0-100 score.
 *
 * Total over garbage, because this runs inside every list map: a null base
 * stays NULL. That is the B14 rule this file inherits — an unrated place shows
 * "Score pending", and coercing null to 0 here would turn the owner's like into
 * a fake 0.7/10 badge on a place nobody has rated, which is the exact defect
 * lib/score.js's header exists for.
 *
 * @param {number|null} score internal 0-100
 * @param {boolean} owned     is this the owner's pick
 * @returns {number|null}
 */
export function withOwnerBump(score, owned) {
  if (!owned) return score;
  if (score == null || typeof score !== "number" || !isFinite(score)) return score;
  return Math.min(SCORE_CEILING, score + OWNER_BUMP);
}

/** The bump as it reads on the badge, for copy and for tests. */
export const OWNER_BUMP_DISPLAY = OWNER_BUMP / 10;
