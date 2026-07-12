// lib/homeTiles.js — the "Explore near you" home-menu consolidation (six
// tiles, one action model: openCurated(kind)). This module is the PURE data
// layer behind it: the query each tile digests, the honest subline templates
// (rendered only when the live data actually supports the claim — otherwise
// the static fallback), and the math the server route needs to build that
// digest from a raw Places Text Search response.
//
// Deliberately dependency-free except lib/placeFilter (also dependency-free
// by its own contract), so this can run in the nodejs API route AND be
// unit-tested with plain Node — no React, no fetch, no window.
//
// HONESTY CONTRACT (do not weaken): every dynamic subline is built ONLY from
// fields present on the digest. distMi is straight-line ("as the crow
// flies"), never a drive-time estimate — so copy says "miles", never
// "minutes". rating is Google's review average, never a hotel/venue class —
// so copy says "stars", never "star hotel". closingTime is a pre-formatted
// absolute clock string computed from the place's OWN utcOffsetMinutes,
// never a client-side countdown. The #1 place is never named, only its
// stats. If a template's condition isn't met, computeTileSubline returns
// null and the caller renders STATIC_FALLBACK instead — never a guess.
import { placeAllowed } from "./placeFilter.js";

export const TILE_KINDS = ["food", "nightlife", "experiences", "shopping", "stays", "bestof"];

// One representative query per kind for the lightweight digest fetch. This is
// intentionally a SINGLE search (not the multi-slot pulls openCurated makes
// when a tile is actually opened) — it only has to be honest about what it
// finds, not exhaustive.
export const TILE_QUERY = {
  food: "best restaurants",
  nightlife: "best bars and lounges",
  experiences: "top attractions tours and experiences",
  shopping: "best shopping malls outlets and boutiques",
  stays: "best hotels resorts lodging",
  bestof: "top rated restaurants attractions and shops",
};

export const STATIC_FALLBACK = {
  food: "The best places to eat near you, ranked.",
  nightlife: "Bars, live music, and late night.",
  experiences: "Attractions, tours, and shows.",
  shopping: "Malls, outlets, and the boutiques that rate best.",
  stays: "Places to stay, from resorts to easy overnights.",
  bestof: "The local institutions people swear by.",
};

// The search radius the digest fetch runs at, and the SAME number used in
// any subline that claims "N places within X miles" — the claim must use the
// radius that was actually searched, not the distance to any one place.
export const RADIUS_MI = 25;

// ─── Small pure math (unit-testable in isolation) ───────────────────────────

export function haversineMiles(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 3958.7613; // Earth radius, miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Bayesian (IMDB-style) quality score — mirrors lib/google.js's wayfindScore
// so the digest's "top pick" agrees with what the opened list would show.
// Duplicated on purpose: lib/google.js is a "use client" browser module (it
// imports the Google Maps JS loader), unsafe to import from a nodejs route.
export function bayesScore(rating, reviews) {
  if (!rating) return null;
  const m = 60, C = 3.9, v = reviews || 0;
  const bayes = (v / (v + m)) * rating + (m / (v + m)) * C;
  return Math.round((bayes / 5) * 100);
}
function bestOfScore(p) { return (p.rating || 0) * Math.log((p.reviews || 0) + Math.E); }

function rankComparator(kind) {
  if (kind === "stays") return (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0);
  if (kind === "bestof") return (a, b) => bestOfScore(b) - bestOfScore(a);
  return (a, b) => (bayesScore(b.rating, b.reviews) || 0) - (bayesScore(a.rating, a.reviews) || 0);
}

// Open-now + "what closes when" from Google's structured weekly periods,
// evaluated in the PLACE's own local time (never the visitor's clock) via
// utcOffsetMinutes. Faithful port of lib/google.js's openNowFrom — same
// "use client" constraint as bayesScore above.
export function openNowFromPeriods(periods, utcOffsetMinutes) {
  try {
    if (!periods || !periods.length || utcOffsetMinutes == null) return null;
    const d = new Date(Date.now() + utcOffsetMinutes * 60000);
    const cur = d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
    for (const per of periods) {
      const o = per.open; if (!o) continue;
      const c = per.close;
      if (!c) return true; // open with no close = 24 hours
      const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
      const cMin = c.day * 1440 + (c.hour || 0) * 60 + (c.minute || 0);
      if (oMin === cMin) return true; // 24/7
      if (oMin < cMin) { if (cur >= oMin && cur < cMin) return true; }
      else { if (cur >= oMin || cur < cMin) return true; } // wraps the week boundary
    }
    return false;
  } catch (e) { return null; }
}

// The single period covering "right now" in the place's local time, or null.
function activePeriod(periods, utcOffsetMinutes) {
  if (!periods || !periods.length || utcOffsetMinutes == null) return null;
  const d = new Date(Date.now() + utcOffsetMinutes * 60000);
  const cur = d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
  for (const per of periods) {
    const o = per.open; if (!o) continue;
    const c = per.close;
    if (!c) return per;
    const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
    const cMin = c.day * 1440 + (c.hour || 0) * 60 + (c.minute || 0);
    if (oMin === cMin) return per;
    if (oMin < cMin) { if (cur >= oMin && cur < cMin) return per; }
    else { if (cur >= oMin || cur < cMin) return per; }
  }
  return null;
}

function fmtClock(hour, minute) {
  const h = ((hour % 24) + 24) % 24;
  const ampm = h < 12 ? "am" : "pm";
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return minute ? `${h12}:${String(minute).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
}

// A stable, pre-formatted absolute time string ("9pm", "11:30pm") for the
// period covering right now — or null if the place isn't confirmed open, or
// is open 24 hours (no discrete close to name). Computed server-side, once,
// per request: never a client countdown.
export function formatClosingTime(periods, utcOffsetMinutes) {
  const per = activePeriod(periods, utcOffsetMinutes);
  if (!per || !per.close) return null;
  return fmtClock(per.close.hour || 0, per.close.minute || 0);
}

// True only when the place is open RIGHT NOW and its current stretch runs
// past midnight (open.day and close.day differ, or the close clock wraps
// under the open clock) — i.e. "still open past midnight tonight" is a claim
// this specific place can actually support this specific evening.
export function closesPastMidnightTonight(periods, utcOffsetMinutes) {
  const per = activePeriod(periods, utcOffsetMinutes);
  if (!per) return false;
  if (!per.close) return true; // 24 hours
  const o = per.open, c = per.close;
  if (o.day !== c.day) return true;
  const oMin = (o.hour || 0) * 60 + (o.minute || 0);
  const cMin = (c.hour || 0) * 60 + (c.minute || 0);
  return cMin <= oMin;
}

const PRICE_NUM = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Adapts one raw Places API v1 result (the shape app/api/places/search
// already returns) to the minimal fields the digest math needs.
function liteNormalize(rp) {
  if (!rp || !rp.location) return null;
  const name = typeof rp.displayName === "string" ? rp.displayName : (rp.displayName && rp.displayName.text) || "";
  if (!rp.id || !name) return null;
  return {
    id: rp.id,
    name,
    rating: rp.rating || null,
    reviews: rp.userRatingCount || 0,
    priceLevel: rp.priceLevel || null,
    types: rp.types || [],
    businessStatus: rp.businessStatus || null,
    lat: rp.location.latitude,
    lng: rp.location.longitude,
    periods: (rp.regularOpeningHours && rp.regularOpeningHours.periods) || null,
    utcOffsetMinutes: rp.utcOffsetMinutes != null ? rp.utcOffsetMinutes : null,
  };
}

// The one entry point the API route calls per kind. Pure: no fetch, no
// randomness, no wall-clock capture beyond what openNowFromPeriods/
// formatClosingTime need (both take an explicit "now" implicitly via
// Date.now(), fine for a server request-time computation — this is never
// called during SSR/first client render, only from the client's post-mount
// effect, so it can never desync hydration).
// origin: { lat, lng } — the user's search center.
export function buildDigest(kind, rawPlaces, origin) {
  try {
    if (!origin || origin.lat == null || origin.lng == null) return {};
    const lite = (rawPlaces || []).map(liteNormalize).filter(Boolean);
    const withDist = lite.map((p) => ({ ...p, distMi: haversineMiles(origin.lat, origin.lng, p.lat, p.lng) }));
    // Google's locationBias is a bias, not a hard filter — the raw response
    // can include results outside RADIUS_MI. Filter to the radius BEFORE any
    // count/top computation so "N within X miles" is never inflated.
    const inRadius = withDist.filter((p) => p.distMi != null && p.distMi <= RADIUS_MI);
    const seen = new Set();
    const clean = [];
    for (const p of inRadius) {
      if (!p.id || seen.has(p.id)) continue;
      if (p.businessStatus === "CLOSED_PERMANENTLY") continue;
      if (!placeAllowed(null, null, p)) continue; // same junk gate every discovery path uses
      seen.add(p.id);
      clean.push(p);
    }
    if (!clean.length) return {};

    const ranked = clean.slice().sort(rankComparator(kind));
    const top = ranked[0];
    const topOpenNow = openNowFromPeriods(top.periods, top.utcOffsetMinutes);
    const closingTime = topOpenNow === true ? formatClosingTime(top.periods, top.utcOffsetMinutes) : null;
    const isMall = /shopping_mall|department_store/.test((top.types || []).join(" "));
    const openCount = clean.filter((p) => openNowFromPeriods(p.periods, p.utcOffsetMinutes) === true).length;
    const lateCount = clean.filter((p) => closesPastMidnightTonight(p.periods, p.utcOffsetMinutes)).length;
    const over1000Count = clean.filter((p) => (p.reviews || 0) >= 1000).length;

    return {
      rating: top.rating || null,
      reviews: top.reviews || 0,
      distMi: top.distMi != null ? Math.round(top.distMi * 10) / 10 : null,
      openNow: topOpenNow,
      closingTime,
      priceNum: top.priceLevel && PRICE_NUM[top.priceLevel] != null ? PRICE_NUM[top.priceLevel] : null,
      isMall,
      openCount,
      lateCount,
      count: clean.length,
      over1000Count,
      radiusMi: RADIUS_MI,
    };
  } catch (e) {
    return {}; // fail-soft: the tile just shows its static fallback
  }
}

// ─── Subline rendering (pure — no React) ────────────────────────────────────
// Returns null (caller must use STATIC_FALLBACK) or an ordered array of
// segments: { text, accent }. accent segments are the only place live
// numbers/ratings/times appear, and the caller renders them in C.accent —
// the only orange in the list.
const seg = (text, accent) => ({ text, accent: !!accent });

export function computeTileSubline(kind, digest) {
  if (!digest || !digest.count) return null; // empty/failed digest — caller uses the static fallback
  const r = digest.rating;
  const rev = digest.reviews || 0;
  const mi = digest.distMi;
  switch (kind) {
    case "food":
      if (r != null && digest.closingTime) {
        return [seg("The top spot right now is "), seg(r.toFixed(1) + " stars", true), seg(" and closes at "), seg(digest.closingTime, true), seg(".")];
      }
      if (digest.openCount > 0 && r != null) {
        return [seg(String(digest.openCount), true), seg(" open right now. The best rated is "), seg(r.toFixed(1) + " stars", true), seg(".")];
      }
      return null;
    case "nightlife":
      if (digest.lateCount > 0) {
        return [seg(String(digest.lateCount), true), seg(" still open past midnight tonight.")];
      }
      if (r != null && mi != null) {
        return [seg("The top pick is "), seg(r.toFixed(1) + " stars", true), seg(", "), seg(mi.toFixed(1) + " miles", true), seg(" out.")];
      }
      return null;
    case "experiences":
      if (rev > 0 && r != null) {
        return [seg("The highest rated has "), seg(rev.toLocaleString() + " reviews", true), seg(" and "), seg(r.toFixed(1) + " stars", true), seg(".")];
      }
      if (digest.count > 0 && digest.radiusMi != null) {
        return [seg(String(digest.count), true), seg(" bookable within "), seg(digest.radiusMi + " miles", true), seg(".")];
      }
      return null;
    case "shopping":
      if (r != null && digest.isMall === false) {
        return [seg("The best rated one is not the mall.")];
      }
      if (digest.openCount > 0 && r != null) {
        return [seg(String(digest.openCount), true), seg(" open now. Top rated is "), seg(r.toFixed(1) + " stars", true), seg(".")];
      }
      return null;
    case "stays":
      if (r != null && mi != null) {
        return [seg("The top rated tonight is "), seg(r.toFixed(1) + " stars", true), seg(", "), seg(mi.toFixed(1) + " miles", true), seg(" out.")];
      }
      if (digest.count > 0 && digest.radiusMi != null) {
        return [seg(String(digest.count), true), seg(" within "), seg(digest.radiusMi + " miles", true), seg(".")];
      }
      return null;
    case "bestof":
      if (rev > 0) {
        return [seg("The one people name first has "), seg(rev.toLocaleString() + " reviews", true), seg(".")];
      }
      if (digest.over1000Count > 0) {
        return [seg(String(digest.over1000Count), true), seg(" places here have over 1,000 reviews.")];
      }
      return null;
    default:
      return null;
  }
}
