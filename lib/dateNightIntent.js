// lib/dateNightIntent.js — Date Night as a QUALIFIED INTENT, not a category.
//
// The homepage Date Night poster is the entry. Tapping it must not open one
// generic list. This module orchestrates EXISTING Wayfind category filters
// into one evening journey, then hides any rail that has no honest inventory.
//
// PURE. No fetch, no clock, no DOM. The API loads owned inventory; this file
// only assigns and orders. Ranking is the Wayfind Score plus the date-room
// signals the datenight rail already uses (price tier / room words). Ranking
// is never for sale.
//
// RADIUS: the datenight RAIL uses the visitor-origin pair from lib/todaysBest.js
// (NEAR_RADIUS_MI = 17, then WIDEN_RADIUS_MI = 25). Worth the Drive stays
// alone at DRIVE_REACH_MI = 27 — this file never imports or restates that.
//
// WEATHER: Beach only when we KNOW conditions are good. nowContext.outdoorOK
// fails OPEN on unknown weather (a failed fetch must not suppress every
// outdoor place elsewhere). Date Night is the opposite: a beach rec on a
// night we cannot vouch for is a bad date. Fail closed — Museums, hide Beach
// — when weather is unknown, outdoorOK is false, or /api/beach/conditions
// does not return show:true (that route already fails closed).

import { placeAllowed } from "./placeFilter.js";
import { isDateRoom, DAYTIME_ONLY_PRIMARY } from "./dateRoom.js";
import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";
import { isBeachPlace } from "./beaches.js";
import { wayfindScore } from "./wayfindScore.js";

// THE DATENIGHT RAIL PAIR (lib/todaysBest.js NEAR_RADIUS_MI / WIDEN_RADIUS_MI).
// Restated as literals so this module stays client-safe and test-importable
// (todaysBest pulls supabase). scripts/test-date-night-intent.mjs asserts
// these stay equal to the rail constants. Worth the Drive is 27 and is not here.
export const DATE_NIGHT_NEAR_MI = 17;
export const DATE_NIGHT_WIDEN_MI = 25;

// Same room-word list the datenight rail pick already uses (lib/railSelect.js).
// Duplicated here so this module stays client-safe — railSelect is server-only.
const ROOM_WORDS = ["waterfront", "rooftop", "romantic", "wine", "cellar", "chophouse",
  "steak", "bistro", "trattoria", "osteria", "supper", "candle", "sunset", "bayfront", "riverfront"];

export const DATE_NIGHT_RAIL_DEFS = [
  { id: "dinner", title: "Dinner", group: "dinner" },
  { id: "dessert", title: "Dessert", group: "dessert" },
  { id: "speakeasies", title: "Speakeasies", group: "nightlife" },
  { id: "livemusic", title: "Live Music", group: "nightlife" },
  { id: "clubs", title: "Clubs", group: "nightlife" },
  { id: "together", title: "Things To Do Together", group: "together" },
  { id: "beach", title: "Beach", group: "outdoor" },
  { id: "museums", title: "Museum", group: "outdoor" },
];

export const DATE_NIGHT_RAIL_ORDER = DATE_NIGHT_RAIL_DEFS.map((r) => r.id);

const PRICE_ENUM = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function priceNumOf(p) {
  if (typeof p.priceNum === "number") return p.priceNum;
  if (typeof p.priceLevel === "number") return p.priceLevel;
  if (typeof p.priceLevel === "string" && PRICE_ENUM[p.priceLevel] != null) return PRICE_ENUM[p.priceLevel];
  return 0;
}

function nameHasRoomWord(p) {
  const name = String((p && p.name) || "").toLowerCase();
  return ROOM_WORDS.some((w) => name.includes(w));
}

/** Existing datenight-rail "special enough" signal — not a paid boost. */
export function isSpecialDateDinner(p) {
  return priceNumOf(p) >= 2 || nameHasRoomWord(p);
}

// Counter / value-food identities that are meals on paper and still not a date.
// hamburger_restaurant is the Shake Shack / Shake Station class. isDateRoom
// requiring this as a HARD gate is what emptied Parrish — prioritize rooms,
// do not require them.
const DINNER_VETO_PRIMARY = new Set([
  "hamburger_restaurant", "fast_food_restaurant", "ice_cream_shop",
  "frozen_yogurt_shop", "dessert_shop", "meal_takeaway", "food_truck",
]);
const SHAKE_NAME = /\bshakes?\b/i;

/**
 * Dinner is a sit-down meal. Date-room / special signals RANK it; they must
 * not be the only way a restaurant can appear, or the whole intent goes empty
 * in a town that has dinners. Shake shops, counters and dessert are out.
 */
export function isDateDinner(p) {
  if (!p || !isMealPlace(p)) return false;
  if (isQuickService(p)) return false;
  const primary = String(p.primaryType || p.primary_type || "").toLowerCase();
  if (DAYTIME_ONLY_PRIMARY.has(primary)) return false;
  if (DINNER_VETO_PRIMARY.has(primary)) return false;
  if (placeAllowed("food", "dessert", p)) return false;
  if (SHAKE_NAME.test(String(p.name || ""))) return false;
  return true;
}

/** Date-room dinners lead the rail. Used for rank, never as the only admit. */
export function isDateRoomDinner(p) {
  return !!(p && isDateRoom(p) && isMealPlace(p) && isDateDinner(p));
}

export function isDateDessert(p) { return placeAllowed("food", "dessert", p); }
export function isDateSpeakeasy(p) { return placeAllowed("nightlife", "speakeasy", p); }
// nightlife:music also matches night_club (a real chip overlap). Date Night
// keeps Clubs as its own last nightlife rail, so a dance club is not also
// Live Music. Concert halls / live_music_venue stay here.
export function isDateLiveMusic(p) {
  return placeAllowed("nightlife", "music", p) && !placeAllowed("nightlife", "clubs", p);
}
export function isDateClub(p) { return placeAllowed("nightlife", "clubs", p); }
export function isDateSpa(p) { return placeAllowed("attractions", "spa", p); }
export function isDateTour(p) { return placeAllowed("attractions", "tours", p); }
export function isDateTogether(p) { return isDateSpa(p) || isDateTour(p); }
export function isDateBeach(p) { return isBeachPlace(p) || placeAllowed("attractions", "beaches", p); }
export function isDateMuseum(p) { return placeAllowed("attractions", "museums", p); }

const MEMBER = {
  dinner: isDateDinner,
  dessert: isDateDessert,
  speakeasies: isDateSpeakeasy,
  livemusic: isDateLiveMusic,
  clubs: isDateClub,
  together: isDateTogether,
  beach: isDateBeach,
  museums: isDateMuseum,
};

export function railMembership(id, p) {
  const fn = MEMBER[id];
  return typeof fn === "function" ? !!fn(p) : false;
}

/**
 * Beach is shown only when every existing signal we hold says the evening
 * is actually good for sand. Any unknown → Museums.
 *
 * @param {{ weatherKnown?: boolean, outdoorOK?: boolean, beachShow?: boolean }} signals
 */
export function dateNightBeachOk(signals) {
  const s = signals || {};
  if (s.weatherKnown !== true) return false;
  if (s.outdoorOK !== true) return false;
  if (s.beachShow !== true) return false;
  return true;
}

function scoreOf(p) {
  const n = wayfindScore(p && p.rating, p && p.reviews);
  return n == null ? -1 : n;
}

function dinnerTier(p) {
  if (isDateRoomDinner(p) && isSpecialDateDinner(p)) return 3;
  if (isDateRoomDinner(p)) return 2;
  if (isSpecialDateDinner(p)) return 1;
  return 0;
}

function byDinnerRank(a, b) {
  const ta = dinnerTier(a);
  const tb = dinnerTier(b);
  if (tb !== ta) return tb - ta;
  const da = scoreOf(a);
  const db = scoreOf(b);
  if (db !== da) return db - da;
  return (a.distMi ?? 99) - (b.distMi ?? 99);
}

function byScore(a, b) {
  const da = scoreOf(a);
  const db = scoreOf(b);
  if (db !== da) return db - da;
  return (a.distMi ?? 99) - (b.distMi ?? 99);
}

export function withinDateNightRadius(p, nearMi = DATE_NIGHT_NEAR_MI, widenMi = DATE_NIGHT_WIDEN_MI) {
  const d = p && p.distMi;
  if (!Number.isFinite(d)) return false;
  if (d <= nearMi) return true;
  return Number.isFinite(widenMi) && d <= widenMi;
}

/**
 * Assign places to the journey rails. Exclusive by hierarchy so one place
 * does not answer two beats of the same evening. Empty rails are omitted
 * (never filled with off-intent places). Beach XOR Museums.
 *
 * @returns {{ rails: {id:string,title:string,places:object[]}[], beachOk: boolean, hidden: string[] }}
 */
export function composeDateNightRails(places, signals, opts) {
  const nearMi = opts && Number.isFinite(opts.nearMi) ? opts.nearMi : DATE_NIGHT_NEAR_MI;
  const widenMi = opts && Number.isFinite(opts.widenMi) ? opts.widenMi : DATE_NIGHT_WIDEN_MI;
  const pool = (Array.isArray(places) ? places : []).filter((p) => p && p.id && p.name && withinDateNightRadius(p, nearMi, widenMi));
  const beachOk = dateNightBeachOk(signals);
  const used = new Set();
  const hidden = [];
  const rails = [];

  for (const def of DATE_NIGHT_RAIL_DEFS) {
    if (def.id === "beach" && !beachOk) { hidden.push(def.id); continue; }
    if (def.id === "museums" && beachOk) { hidden.push(def.id); continue; }
    const keep = pool.filter((p) => !used.has(p.id) && railMembership(def.id, p));
    const ranked = keep.slice().sort(def.id === "dinner" ? byDinnerRank : byScore);
    if (!ranked.length) { hidden.push(def.id); continue; }
    for (const p of ranked) used.add(p.id);
    rails.push({ id: def.id, title: def.title, group: def.group, places: ranked });
  }

  return { rails, beachOk, hidden };
}

const PRICE_BACK = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];

/**
 * Inventory / Google-shaped row → the place card row. Does not invent a hook.
 */
export function toDateNightPlace(p, origin) {
  if (!p) return null;
  const name = (p.displayName && p.displayName.text) || p.name;
  const id = p.id || p.place_id;
  const rating = Number(p.rating);
  if (!name || !id || !(rating > 0)) return null;
  const reviews = Number(p.userRatingCount != null ? p.userRatingCount : p.reviews) || 0;
  const lat = p.location && p.location.latitude != null ? Number(p.location.latitude) : (p.lat != null ? Number(p.lat) : null);
  const lng = p.location && p.location.longitude != null ? Number(p.location.longitude) : (p.lng != null ? Number(p.lng) : null);
  let distMi = Number.isFinite(p.distMi) ? p.distMi : null;
  if (distMi == null && origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && Number.isFinite(lat) && Number.isFinite(lng)) {
    distMi = haversineMi(origin.lat, origin.lng, lat, lng);
  }
  const photoRef = p.photoRef || (p.photos && p.photos[0] && p.photos[0].name) || p.photo_ref || null;
  const editorial = (typeof p.editorial === "string" && p.editorial) || (p.editorialSummary && p.editorialSummary.text) || null;
  const primaryType = p.primaryType || p.primary_type || null;
  const pn = priceNumOf(p);
  return {
    id,
    name,
    rating,
    reviews,
    lat,
    lng,
    distMi: Number.isFinite(distMi) ? Math.round(distMi * 10) / 10 : null,
    types: Array.isArray(p.types) ? p.types : (Array.isArray(p.google_types) ? p.google_types : []),
    primaryType,
    primary_type: primaryType,
    priceNum: pn,
    priceLevel: typeof p.priceLevel === "string" ? p.priceLevel : (PRICE_BACK[pn] || null),
    photoRef: photoRef && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoRef) ? photoRef : null,
    // IconicPlaceCard reads `photo` (owned URL) or `photoRef` (proxy). Map the
    // inventory URL onto `photo` so we never invent art and never call Places.
    photo: p.photo || p.photo_url || p.photoUrl || null,
    photo_url: p.photo_url || p.photoUrl || null,
    editorial: editorial || null,
    status: p.businessStatus || p.status || null,
  };
}

function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
