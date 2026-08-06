// lib/wayfindScore.js — THE Wayfind Score. One formula, one file.
//
// WHY THIS FILE EXISTS (2026-08-06). The same score was implemented three
// times, and only two of them agreed:
//
//   lib/google.js:357   export function wayfindScore   — canonical, 0–100
//   lib/beaches.js:12   an inlined copy                — byte-identical, and
//                       guarded: test-beaches-page.mjs compares the constants
//                       against google.js and fails the build on drift
//   lib/landing.js:77   const wfScore = (r, n) => ...  — A DIFFERENT FORMULA,
//                       carrying the comment "Same Bayesian blend the app
//                       ranks with"
//
// The third one was not the same blend. Measured:
//
//   case                     canonical    landing.js
//   excellent, proven (4.6/3000)    92          45.9
//   great, few reviews (5.0/4)      79          39.7
//   UNRATED                       null          39.0
//
// Two defects fell out of that, both live on the paid-ad landing pages:
//
//   1. WRONG SCALE. It returned bayes*10 (0–50) instead of round(bayes/5*100)
//      (0–100). The ranking it feeds subtracts a distance penalty capped at 30
//      and adds a curated bonus of 15 — constants tuned for 0–100. On a 0–50
//      scale a 20-mile drive cost 43% of the maximum instead of 21%, and the
//      curated bonus was worth double. Distance and curation quietly outweighed
//      quality by 2×, on the pages Google Ads spends money sending people to.
//
//   2. NO NULL. Canonical returns null for an unrated place. This returned
//      (60/60)*3.9*10 = 39.0 — a phantom score for a place nobody has rated,
//      within 7 points of an excellent proven one, and ABOVE a genuinely good
//      place with few reviews. Unrated inventory was ranking against rated
//      inventory on an invented number.
//
// Zero imports on purpose: every engine can take this without pulling the app
// in, which is the reason beaches.js inlined it in the first place. There is
// no longer a reason to inline it.

/**
 * A transparent 0–100 Wayfind Score.
 *
 * Bayesian (IMDB-style) average: places with few reviews are pulled toward a
 * baseline mean, so a 5.0 from a handful of reviews cannot outrank a proven
 * 4.6 with thousands. `m` is how many reviews it takes to trust the average.
 *
 * RETURNS null FOR AN UNRATED PLACE, and that is the contract, not an
 * oversight. "We do not know" and "we know it is mediocre" are different
 * facts, and a caller that ranks them as the same number is ranking on
 * fiction. Callers must branch on null — see lib/score.js isValidScore.
 *
 * @param {number|null|undefined} rating  0–5 stars
 * @param {number|null|undefined} reviews review count
 * @returns {number|null} 0–100, or null when there is no rating
 */
export function wayfindScore(rating, reviews) {
  if (!rating) return null;
  const m = 60;
  const C = 3.9;
  const v = reviews || 0;
  const bayes = (v / (v + m)) * rating + (m / (v + m)) * C;
  return Math.round((bayes / 5) * 100);
}

/** The constants, exported so guards can compare sources without parsing. */
export const WAYFIND_SCORE_M = 60;
export const WAYFIND_SCORE_C = 3.9;
