// v5.74 prebuild gate — the home-tile live sublines. The whole point of this
// feature is that a subline is TRUE or it isn't shown, so this locks the
// honesty contract: every dynamic subline is built only from digest fields,
// unmet conditions fall back to null (caller renders the static line), and the
// copy never says "minutes" (we only have straight-line miles) or "N-star"
// hotel class (we only have a review average).
import {
  buildDigest, computeTileSubline, STATIC_FALLBACK, TILE_KINDS,
  haversineMiles, bayesScore, formatClosingTime, closesPastMidnightTonight,
} from "../lib/homeTiles.js";

let failures = 0;
const fail = (m) => { console.error("test-home-tiles: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const text = (segs) => (segs || []).map((s) => s.text).join("");

// ── the six kinds + fallbacks exist ──
ok(TILE_KINDS.length === 6, "six tile kinds");
for (const k of TILE_KINDS) ok(typeof STATIC_FALLBACK[k] === "string" && STATIC_FALLBACK[k], `static fallback for ${k}`);

// ── empty/failed digest -> null (caller uses the static fallback), never a guess ──
for (const k of TILE_KINDS) {
  ok(computeTileSubline(k, {}) === null, `${k}: empty digest -> null`);
  ok(computeTileSubline(k, null) === null, `${k}: null digest -> null`);
  ok(computeTileSubline(k, { count: 5 }) !== undefined, `${k}: partial digest never throws`);
}

// ── each template fires only when its data supports it, and reads honestly ──
{
  const food = computeTileSubline("food", { count: 8, rating: 4.9, closingTime: "9pm" });
  ok(/4\.9 stars and closes at 9pm/.test(text(food)), "food T1 uses rating + absolute closing time");
  const foodT2 = computeTileSubline("food", { count: 8, rating: 4.6, openCount: 5, closingTime: null });
  ok(/5 open right now/.test(text(foodT2)), "food T2 falls to open-count when no closing time");

  const night = computeTileSubline("nightlife", { count: 6, lateCount: 4, rating: 4.5 });
  ok(/4 still open past midnight/.test(text(night)), "nightlife T1 uses lateCount");
  const nightT2 = computeTileSubline("nightlife", { count: 6, lateCount: 0, rating: 4.5, distMi: 2.3 });
  ok(/4\.5 stars, 2\.3 miles out/.test(text(nightT2)), "nightlife T2 says miles, not minutes");

  const shopMall = computeTileSubline("shopping", { count: 6, rating: 4.4, isMall: true, openCount: 3 });
  ok(!/not the mall/.test(text(shopMall)), "shopping T1 skipped when the top result IS a mall");
  const shopNot = computeTileSubline("shopping", { count: 6, rating: 4.4, isMall: false });
  ok(/not the mall/.test(text(shopNot)), "shopping T1 fires only when top result is not a mall");

  const stays = computeTileSubline("stays", { count: 9, rating: 4.7, distMi: 3.1 });
  ok(/4\.7 stars, 3\.1 miles out/.test(text(stays)), "stays uses stars (review avg) + miles");

  const best = computeTileSubline("bestof", { count: 10, reviews: 1400 });
  ok(/1,400 reviews/.test(text(best)) && !/stars? (hotel|resort)/.test(text(best)), "bestof names review count, not the place");
}

// ── NO subline anywhere says "minute(s)" or "N-star <class>" ──
{
  const bad = /minute|\d-star|\d star hotel/i;
  const digest = { count: 10, rating: 4.8, reviews: 1400, distMi: 2.5, openCount: 6, lateCount: 3, closingTime: "10pm", isMall: false, over1000Count: 4, radiusMi: 25 };
  for (const k of TILE_KINDS) {
    const s = text(computeTileSubline(k, digest));
    ok(!bad.test(s), `${k} subline must never say minutes or a star-class: "${s}"`);
  }
}

// ── digest math: radius filter, top pick by kind rank, honest counts ──
{
  const origin = { lat: 27.5, lng: -82.5 };
  const near = (dLat) => ({ id: "p" + dLat, displayName: "Place " + dLat, location: { latitude: 27.5 + dLat, longitude: -82.5 }, rating: 4.5, userRatingCount: 200, types: ["restaurant"] });
  // one just inside ~25mi (0.3deg ~ 20mi), one far outside (2deg ~ 138mi)
  const d = buildDigest("food", [near(0.29), near(2.0)], origin);
  ok(d.count === 1, "buildDigest filters results outside the search radius before counting");
  ok(d.rating === 4.5, "buildDigest surfaces the in-radius top pick's rating");

  const stays = buildDigest("stays", [
    { id: "a", displayName: "A", location: { latitude: 27.5, longitude: -82.5 }, rating: 4.9, userRatingCount: 50, types: ["lodging"] },
    { id: "b", displayName: "B", location: { latitude: 27.5, longitude: -82.5 }, rating: 4.2, userRatingCount: 5000, types: ["lodging"] },
  ], origin);
  ok(stays.rating === 4.9, "stays ranks by rating (4.9 beats a 4.2 with far more reviews)");

  const bestof = buildDigest("bestof", [
    { id: "a", displayName: "A", location: { latitude: 27.5, longitude: -82.5 }, rating: 4.9, userRatingCount: 30, types: ["restaurant"] },
    { id: "b", displayName: "B", location: { latitude: 27.5, longitude: -82.5 }, rating: 4.6, userRatingCount: 4000, types: ["restaurant"] },
  ], origin);
  ok(bestof.rating === 4.6, "bestof ranks by rating x review volume (the 4000-review institution wins)");
  ok(buildDigest("food", [], origin).count === undefined || Object.keys(buildDigest("food", [], origin)).length === 0, "no places -> empty digest (tile shows fallback)");
}

// ── pure helpers ──
ok(Math.round(haversineMiles(27.5, -82.5, 27.5, -82.5)) === 0, "haversine of a point to itself is 0");
ok(bayesScore(0, 0) === null, "bayesScore of no rating is null");
ok(closesPastMidnightTonight(null, 0) === false, "no periods -> not past-midnight");

if (failures) { console.error(`test-home-tiles: ${failures} failure(s)`); process.exit(1); }
console.log("test-home-tiles: OK — sublines fire only when data supports them, never say minutes/star-class, and the digest filters to the searched radius");
