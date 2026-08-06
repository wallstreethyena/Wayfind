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
import { creatorVideosFor } from "./creatorVideos.js";

/** A place must clear BOTH of these before a video can move it up the list. */
export const CREATOR_MIN_RATING = 4.2;
export const CREATOR_MIN_REVIEWS = 30;

/** Boost bounds, on the same 0–100 scale as wayfindScore. */
export const CREATOR_BOOST_MIN = 12;   // a real lift even for a small creator
export const CREATOR_BOOST_MAX = 45;   // unchanged from the old flat value

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
 * The boost, in wayfindScore points (0–100 scale). 0 means "do not move this
 * place" — either it has no video, or it does not clear the floor.
 */
export function creatorBoostFor(place, locName) {
  let videos;
  try { videos = creatorVideosFor(place, locName); } catch (e) { return 0; }
  if (!videos || !videos.length) return 0;
  if (!meetsCreatorFloor(place)) return 0;
  const span = CREATOR_BOOST_MAX - CREATOR_BOOST_MIN;
  return Math.round(CREATOR_BOOST_MIN + span * reachWeight(reachOf(videos)));
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
