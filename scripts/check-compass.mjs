// Executes lib/compass.js against fixtures so the Compass tier contract can
// never silently drift: True North stays scarce (2+ platforms, 500+ reviews,
// 9.3+), small samples stay humble, and the blend is real consensus.
import { compassScore, GOLD_MIN, GOLD_MIN_REVIEWS, GOLD_MIN_PLATFORMS } from "../lib/compass.js";

let failed = 0;
const fail = (msg) => { failed++; console.error("check-compass: FAIL — " + msg); };
const t = (cs, want, msg) => { if ((cs && cs.tier) !== want) fail(msg + " (got " + (cs && cs.tier) + ", score " + (cs && cs.s10) + ")"); };

// 1. A single-platform superstar can be Standout but NEVER True North —
//    certification requires a second platform agreeing.
t(compassScore({ rating: 4.9, reviews: 3000 }), "standout", "single-platform 4.9/3000 must cap at Standout");

// 2. Two platforms agreeing at the top with deep reviews = True North.
t(compassScore({ rating: 4.8, reviews: 8000, fsqRating: 4.7, fsqReviews: 900 }), "truenorth", "4.8 Google + 9.4 Foursquare with 8900 reviews must certify True North");

// 3. Tripadvisor as the second platform certifies too (detail-sheet path).
t(compassScore({ rating: 4.8, reviews: 5000 }, { rating: 4.8, reviews: 2000 }), "truenorth", "Google+Tripadvisor 4.8/4.8 deep must certify True North");

// 4. Consensus is real: a platform disagreeing pulls the blend down out of gold.
t(compassScore({ rating: 4.8, reviews: 5000 }, { rating: 4.0, reviews: 4000 }), "standout", "a 4.0 Tripadvisor must pull a 4.8 Google out of True North");

// 4b. "Agreeing" means agreeing at the top: a second platform reading merely
//     good (4.3) — or excellent but from a handful of raters — can't certify.
t(compassScore({ rating: 4.8, reviews: 10000 }, { rating: 4.3, reviews: 300 }), "standout", "a 4.3 second platform is disagreement — no True North");
t(compassScore({ rating: 4.8, reviews: 10000 }, { rating: 4.9, reviews: 10 }), "standout", "a 10-rater second platform can't certify True North");

// 5. Thin samples stay humble: a 5.0 from 8 people scores below a 4.6 from 2000.
const thin = compassScore({ rating: 5.0, reviews: 8 });
const proven = compassScore({ rating: 4.6, reviews: 2000 });
if (!(thin && proven && thin.s10 < proven.s10)) fail("5.0/8 must score below 4.6/2000 (got " + (thin && thin.s10) + " vs " + (proven && proven.s10) + ")");
if (thin && thin.tier === "truenorth") fail("a 5.0 from 8 people must never be True North");

// 6. The review floor holds even when two platforms agree at the top.
t(compassScore({ rating: 4.9, reviews: 200, fsqRating: 4.9, fsqReviews: 100 }), "standout", "4.9+4.9 with only 300 reviews must stay below True North (500 floor)");

// 7. Tier bands.
t(compassScore({ rating: 4.4, reviews: 1500 }), "standout", "4.4/1500 lands Standout");
t(compassScore({ rating: 4.0, reviews: 800 }), "solid", "4.0/800 lands Solid");
t(compassScore({ rating: 3.5, reviews: 400 }), null, "3.5/400 gets no tier");
if (compassScore({}) !== null) fail("unrated place must return null");

// 8. Calibration knobs stay honest.
if (GOLD_MIN < 9.3) fail("GOLD_MIN lowered below 9.3 — True North scarcity is the product");
if (GOLD_MIN_REVIEWS < 500) fail("GOLD_MIN_REVIEWS lowered below 500");
if (GOLD_MIN_PLATFORMS < 2) fail("GOLD_MIN_PLATFORMS lowered below 2");

if (failed) process.exit(1);
console.log("check-compass: OK — True North scarce (2+ platforms, 500+ reviews, 9.3+), consensus real, small samples humble");
