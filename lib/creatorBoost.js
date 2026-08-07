// lib/creatorBoost.js — how much a creator's video is allowed to move a place.
//
// v6.96. This replaces a flat `hasCreatorVideo(p) ? 45 : 0`. Two things were
// wrong with the flat number, both found by measuring real curated data rather
// than reasoning about it:
//
//   1. NO QUALITY FLOOR. @secretsoftampabay's 20 Tampa picks include a 3.7★/56
//      brasserie and a 3.9★/88 hotel terrace. A flat +45 on a 0–100 scale put
//      both of those above a 4.8★ restaurant, because 45 dwarfs the entire
//      spread of wayfindScore. The site's own promise, printed on the page, is
//      "Rankings are merit-based." A 3.7 at #1 breaks that promise for a reader
//      who drives there.
//   2. NO SENSE OF REACH. A reel with 11,900 likes and one with 650 moved a
//      place by exactly the same amount.
//
// Owner decision (2026-08-06): floor at 4.2★ / 30 reviews, and reach scales the
// boost between those bounds.
//
// WHAT THE FLOOR DOES NOT DO: it does not hide the creator. A place below the
// floor still shows her video on its place card, still appears in her creator
// directory, still credits and links out to her. The floor governs RANK ONLY —
// the one thing a reader is trusting us to get right.
//
// Client-safe, zero deps, pure. Every constant here is exercised by
// scripts/check-creator-video-boost.mjs.
// v6.97 (owner, 2026-08-06) — THE BOOST IS NOW RELATIVE, NOT ABSOLUTE.
//
// The floor below fixed WHICH places a video may move. It did not fix HOW FAR.
// Measured against the real curve, with the absolute 12–45 band:
//
//   key = wayfindScore/10 − driveDeduction + boost/10        (lib/todaysBest.js)
//
//   12.50   wfScore 80, big reel,  1mi
//   10.10   wfScore 80, big reel, 25mi     ← a floor-quality place, 25 minutes
//    9.80   wfScore 98, no reel,   1mi     ← beat an excellent one, 1 mile away
//
// A boost of 45 on a 0–100 scale is larger than the entire distance model
// (max 30) and larger than the spread between a good place and a great one. So
// "ranked by merit, distance included" was not what the list actually did once
// a creator had filmed there — the exact claim the app prints on itself.
//
// The fix is NOT a hard clamp at the cap. 15% of a real place's quality (80–98)
// is 12–14.7, and the old floor was already 12 — a clamp would flatten every
// boosted place to the same number and destroy the reach scale below, which
// exists precisely because 650 likes and 11,900 likes are not the same signal.
//
// Instead the reach band is RESCALED into the bounded envelope: the cap is a
// share of the place's OWN quality, and reach spreads the boost across it. A
// weak place therefore gets a small share of a small number, and evidence can
// re-order the qualified set without ever inverting it.
import { creatorVideosFor } from "./creatorVideos.js";
import { wayfindScore } from "./wayfindScore.js";

/** A place must clear BOTH of these before a video can move it up the list. */
export const CREATOR_MIN_RATING = 4.2;
export const CREATOR_MIN_REVIEWS = 30;

/**
 * The ceiling, as a SHARE OF THE PLACE'S OWN QUALITY — never an absolute number
 * of points. This is what makes the boost incapable of lifting a mediocre place
 * over an excellent one: 15% of 80 is 12, 15% of 98 is 14.7, so the better place
 * both starts higher and has more room to gain.
 */
export const EVIDENCE_CAP_FRAC = 0.15;

/**
 * The share of the cap a video earns with NO recorded reach. Never zero — a
 * curated entry from before we logged likes still counts as evidence — and
 * never the whole cap, or reach would buy nothing.
 */
export const EVIDENCE_MIN_FRAC = 0.35;

// The reach band, in LIKES. Instagram does not expose play counts anywhere we
// can read them — not on the post page, not in any embed — so `reach` is likes,
// and it is named for what it is. Do NOT relabel it "views": a number that
// claims to be something it is not will eventually be quoted back to a creator
// in a partnership conversation.
//
// The band is normalised between these two, not from zero. Measured against the
// real corpus: the curated reels run from 650 to 11,900 likes, and normalising
// from 1 crushed that entire range into 35–45 — ten points of differentiation
// across an eighteen-fold difference in reach, which is not differentiation.
// Between REACH_MIN and REACH_FULL the boost now spans 25–45.
export const REACH_MIN = 100;
export const REACH_FULL = 12000;

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/** The rating/review pair for a place, tolerating the app's two field shapes. */
function qualityOf(place) {
  if (!place) return { rating: null, reviews: 0 };
  const rating = num(place.rating) != null ? num(place.rating) : num(place.wfRating);
  const reviews = num(place.reviews) != null ? num(place.reviews) : num(place.userRatingCount) || 0;
  return { rating, reviews: reviews || 0 };
}

/**
 * Does this place clear the bar to be MOVED by a creator video?
 *
 * Fails CLOSED on unknown quality. A place with no rating is not "probably
 * fine" — it is unmeasured, and the whole point of the floor is that we only
 * promote what we can stand behind.
 */
export function meetsCreatorFloor(place) {
  const { rating, reviews } = qualityOf(place);
  if (rating == null) return false;
  return rating >= CREATOR_MIN_RATING && reviews >= CREATOR_MIN_REVIEWS;
}

/**
 * The strongest reach across a place's curated videos (likes). Three videos
 * from three creators do not add up — a place is featured, or it is not, and
 * the loudest single post is the honest measure of how much attention it has.
 */
export function reachOf(videos) {
  let best = 0;
  for (const v of videos || []) {
    const r = num(v && v.reach);
    if (r != null && r > best) best = r;
  }
  return best;
}

/**
 * Reach → a 0..1 weight. LOG, not linear: the gap between 200 and 2,000 likes
 * says far more about a post than the gap between 20,000 and 200,000, and a
 * linear scale would hand every slot to whichever creator has the largest
 * following rather than to the best local recommendation.
 *
 * Unknown reach (a curated entry from before we recorded it) returns 0, which
 * still earns CREATOR_BOOST_MIN — never nothing.
 */
export function reachWeight(reach) {
  const r = num(reach);
  if (r == null || r <= REACH_MIN) return 0;
  const w = (Math.log(r) - Math.log(REACH_MIN)) / (Math.log(REACH_FULL) - Math.log(REACH_MIN));
  return Math.max(0, Math.min(1, w));
}

/**
 * The bounded evidence term, in wayfindScore points (0–100 scale).
 *
 * PURE, and separated from creatorBoostFor() on purpose: the curated library is
 * data that changes weekly, so a guard that had to construct a real curated
 * place to test the CURVE would be testing the library instead. This takes the
 * two numbers the curve actually depends on and returns the answer, so
 * scripts/check-creator-video-boost.mjs can assert on returned values.
 *
 * @param {number|null} quality  the place's own wayfindScore, 0–100
 * @param {number|null} reach    strongest reel reach, in likes
 */
export function evidenceBoost(quality, reach) {
  const q = num(quality);
  if (q == null || q <= 0) return 0;
  const cap = EVIDENCE_CAP_FRAC * q;
  const w = reachWeight(reach);
  return Math.round(cap * (EVIDENCE_MIN_FRAC + (1 - EVIDENCE_MIN_FRAC) * w));
}

/**
 * The boost, in wayfindScore points (0–100 scale). 0 means "do not move this
 * place" — it has no video, it does not clear the floor, or it is unrated.
 *
 * Quality comes from wayfindScore(), the one canonical formula, NOT from raw
 * stars: a 4.9 over 31 reviews and a 4.9 over 3,000 are different facts, and
 * the second one has earned more room to be moved.
 */
export function creatorBoostFor(place, locName) {
  let videos;
  try { videos = creatorVideosFor(place, locName); } catch (e) { return 0; }
  if (!videos || !videos.length) return 0;
  if (!meetsCreatorFloor(place)) return 0;
  const { rating, reviews } = qualityOf(place);
  return evidenceBoost(wayfindScore(rating, reviews), reachOf(videos));
}

/**
 * THE NUMBER A READER SEES, 0–100. Owner, 2026-08-07: "whenever we have a place
 * card with an influencer video I want the Wayfind Score to go higher — I was
 * expecting this but I don't see it."
 *
 * They were right to expect it and right that it was not happening. Until now
 * every one of the nine call sites of creatorBoostFor() fed a SORT KEY, and
 * lib/rankPlaces.js said so outright: "the Wayfind Score a reader SEES is never
 * this number." lib/todaysBest.js even parked the value on the row as
 * `creator_boost` with the comment "carried so the card can say why" — and
 * nothing ever read it. The evidence moved the list and stayed invisible.
 *
 * THE CLAMP IS LOAD-BEARING, NOT DEFENSIVE. toDisplayScore() returns null for
 * anything above 100 (lib/score.js, locked by scripts/test-score-band.mjs), and
 * a great place is exactly the one this boost pushes over: 98 + 15% = 113 → null
 * → the badge DISAPPEARS from the best creator-backed places on the site. Naive
 * addition does not raise the number, it deletes it. Measured, not guessed.
 *
 * Everything that governs the boost is inherited rather than restated: the
 * 4.2★/30-review floor and the 15%-of-own-quality cap both live in
 * creatorBoostFor() above, so the displayed number can never invert two places
 * the base score already ordered, and a place below the floor is untouched.
 * lib/wayfindScore.js remains the single definition of base quality — this adds
 * a term to what is DISPLAYED, it does not fork the formula.
 *
 * Returns null for an unrated place, preserving the "Score pending" contract.
 */
export function displayedWfScore(place, locName) {
  const q = num(place && place.wfScore);
  if (q == null) return null;
  return Math.min(100, q + creatorBoostFor(place, locName));
}

/** Does this place carry a renderable creator video at all, floor or not? */
export function hasCreatorVideoAt(place, locName) {
  try { return creatorVideosFor(place, locName).length > 0; } catch (e) { return false; }
}

/** Owner decision (2026-08-06): at most 3 boosted places in the top 5. */
export const CREATOR_HEAD = 5;
export const CREATOR_HEAD_MAX = 3;

/**
 * Cap how much of the head of an ALREADY-SORTED list one set of creator picks
 * can take. Same shape and same reason as diversifyHead() in lib/todaysBest.js,
 * which stops the top 3 all being the same cuisine.
 *
 * Without this the feature eats the product: in a metro with 17 curated places,
 * a boost large enough to be worth having is large enough that EVERY boosted
 * place outranks EVERY unboosted one, and the ranked list silently becomes one
 * person's account. Measured, not assumed — Miami's top 17 were all one creator
 * before this cap existed.
 *
 * Demotes the WEAKEST offenders (they arrive sorted, so the surplus is at the
 * back of the head) and never drops anything: a demoted place moves to the
 * first slot after the head, and relative order is otherwise preserved.
 */
export function capCreatorHead(rows, isBoosted, head = CREATOR_HEAD, max = CREATOR_HEAD_MAX) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (list.length <= max || head <= max) return list;
  const flag = typeof isBoosted === "function" ? isBoosted : (r) => creatorBoostFor(r) > 0;
  const out = [];
  const bench = [];
  let used = 0;
  for (const r of list) {
    if (out.length < head && flag(r)) {
      if (used >= max) { bench.push(r); continue; }
      used += 1;
    }
    out.push(r);
    // Once the head is full, everything else keeps its order — splice the
    // benched picks back in immediately after it rather than at the very end,
    // so a demoted creator pick lands at #6, not #40.
    if (out.length === head && bench.length) { out.push(...bench); bench.length = 0; }
  }
  if (bench.length) out.push(...bench);
  return out;
}
