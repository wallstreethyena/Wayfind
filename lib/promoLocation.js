// lib/promoLocation.js — ONE LAW, for every surface that puts a place name or
// "near you" into promotional copy.
//
//   Location-specific promotional copy may render only when the destination
//   surface has qualifying inventory for THAT SAME location.
//
// THE BUG THIS EXISTS FOR (owner session, 2026-09-04). The homepage centre was
// Hoffman, NJ — a real place, and a place Wayfind has zero inventory for. Every
// rail correctly rendered its honest empty state. The holiday card rendered
// anyway:
//
//     🎉 HOLIDAY SPECIAL · LABOR DAY
//     The best of Labor Day weekend in Hoffman, NJ
//     Top picks for the holiday, near you
//     See the picks ›
//
// There were no picks. There was no Labor Day anything. The card was gated on
// `Hol.activeHoliday(new Date())` — PURE DATE MATH, true for every visitor on
// earth for 28 days before every federal holiday — and on a generic hero photo
// pool that is not an inventory signal at all.
//
// The codebase already knew how to tell the truth here: openHoliday() runs the
// real query and bails with "Nothing found for {holiday} nearby yet". It just
// ran that check ONE STEP TOO LATE — after the card had already made the
// promise and the reader had already spent a tap on it. This module moves the
// check in front of the paint, and makes it one definition instead of one per
// card.
//
// NOT a Labor Day special case, deliberately: the same law binds the World Cup
// card and anything added later, which is why the holiday key is not a
// parameter here.
//
// Pure and framework-free on purpose: scripts/check-promo-location-honesty.mjs
// EXECUTES it against a location WITH inventory and a location with ZERO,
// rather than grepping for the shape.

// Coverage as DaypartRail reports it (app/components/DaypartRail.js onCoverage):
// "covered" | "uncovered" | "slow" | "error" | null(unknown, still in flight).
// Only ONE of those is a licence to promise something about this town.
export const PROMO_OK_COVERAGE = "covered";

/**
 * How many of `pool` actually qualify for this promo.
 * `exclude` is the promo's OWN filter — the same content.exclude that
 * openHoliday applies — so the count answers the question the card's copy asks,
 * not a looser one.
 */
export function qualifyingCount(pool, exclude) {
  if (!Array.isArray(pool)) return 0;
  const skip = typeof exclude === "function" ? exclude : null;
  let n = 0;
  for (const p of pool) {
    if (!p) continue;
    if (skip) { try { if (skip(p)) continue; } catch (e) { continue; } }
    n += 1;
  }
  return n;
}

/**
 * The gate. FAILS CLOSED on anything that is not a confirmed "covered".
 *
 * Unknown coverage (null, still loading) is deliberately NOT a pass. A promo
 * that renders while we are still finding out is a promise made before the
 * facts are in, and on a slow connection that is exactly when it is on screen
 * longest. An honest card appears a beat later; a false one is never honest.
 *
 * @param {object}   o
 * @param {string?}  o.coverage  DaypartRail's coverage verdict for THIS centre
 * @param {Array?}   o.pool      candidate places for this location, if in hand
 * @param {Function?} o.exclude  the promo's own disqualifier
 * @param {number}   o.min       how many qualifying places the copy implies
 */
export function locationPromoAllowed(o) {
  const opts = o || {};
  if (opts.coverage !== PROMO_OK_COVERAGE) return false;
  // Covered, and no pool was supplied: coverage is the strongest signal the
  // paint has, and it is a real one — the rails found ranked inventory here.
  if (opts.pool == null) return true;
  const min = Number.isFinite(opts.min) ? opts.min : 1;
  return qualifyingCount(opts.pool, opts.exclude) >= min;
}
