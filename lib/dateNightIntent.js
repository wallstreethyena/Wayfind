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
// (NEAR_RADIUS_MI = 17, then a Date Night-specific 27mi reach). The second
// rung is intentionally reconciled with the owner's evening reach: it is not
// a ranking boost, and it never admits an off-intent place.
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
import { byWayfindScore, railScoreOf } from "./railRank.js";
import { isDanceClub, isSpeakeasy } from "./birthdayIntent.js";

// THE DATENIGHT RAIL PAIR (lib/todaysBest.js NEAR_RADIUS_MI / WIDEN_RADIUS_MI).
// Restated as literals so this module stays client-safe and test-importable
// (todaysBest pulls supabase). scripts/test-date-night-intent.mjs asserts
// the near rung stays equal to the rail constant. Date Night's owner-approved
// reach is 27mi; Worth the Drive remains independently governed.
export const DATE_NIGHT_NEAR_MI = 17;
export const DATE_NIGHT_WIDEN_MI = 27;

// Same room-word list the datenight rail pick already uses (lib/railSelect.js).
// Duplicated here so this module stays client-safe — railSelect is server-only.
const ROOM_WORDS = ["waterfront", "rooftop", "romantic", "wine", "cellar", "chophouse",
  "steak", "bistro", "trattoria", "osteria", "supper", "candle", "sunset", "bayfront", "riverfront"];

// v8.93.1 (owner, 2026-08-30, comparing the Date Night drop to Exploding
// Trends): "on Exploding Trends you have an explanation of what the rail is …
// Date Night does not. I would like that explanation of the rail to be
// included everywhere going forward, so they understand … concise, to the
// point, witty and knowledgeable … everywhere multiple rails are showing."
//
// A `deck` is one line that says what the rail is FOR — the promise, not the
// contents. It has to earn its place above the cards, so the rules are strict:
// it names the bar this rail applies, it never repeats the title, it never
// states a count (RailNav already does, and a number the rail cannot keep is
// the "20 trends" mistake), and it fits on one line at 390px. Every one of
// these is a claim the composer actually enforces below — Dinner really does
// refuse counter service, Together really does refuse a kayak tour — so the
// deck is a description of the code, not marketing over the top of it.
export const DATE_NIGHT_RAIL_DEFS = [
  { id: "dinner", title: "Dinner", group: "dinner",
    deck: "Rooms that hold a conversation — no counter service, no queue for a tray." },
  { id: "dessert", title: "Dessert", group: "dessert",
    deck: "The second stop that turns dinner into an evening." },
  { id: "speakeasies", title: "Speakeasies", group: "nightlife",
    deck: "Low light, good ice, and a door you have to know about." },
  { id: "livemusic", title: "Live Music", group: "nightlife",
    deck: "Somewhere a band is actually playing tonight, not a playlist." },
  { id: "clubs", title: "Clubs", group: "nightlife",
    deck: "For when the night is the point and dinner was the warm-up." },
  { id: "together", title: "Things To Do Together", group: "together",
    deck: "Something you do side by side — not something you watch." },
  { id: "beach", title: "Beach", group: "outdoor",
    deck: "The weather says yes tonight, so the sand is on the table." },
  { id: "museums", title: "Museum", group: "outdoor",
    deck: "Indoors and worth the walk — the answer when the sky is not cooperating." },
  // v8.93 (owner, 2026-08-30, on the open drop): "we should replace it with
  // shopping and the events". Shopping is the browse either side of the table
  // — a bookshop, a boutique, a market — and it sits LAST because it is the
  // optional beat: nobody plans an evening around it, but a good one turns
  // dinner into a night. It is also the rail most likely to be empty in a
  // small town, and an empty rail is hidden rather than padded.
  { id: "shopping", title: "Shopping", group: "shopping",
    deck: "A browse before the table or after it. Never an errand." },
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

// 2026-09-02 — THE PRICE GAP. promote-index's Details mask moved to the
// Pro tier (#1056) and Pro does not carry priceLevel — DO NOT widen the mask
// back to fetch it; that is a separate owner spend decision, not this one.
// Every row promoted since is price-blind, so `priceNumOf(p) >= 2` can never
// be true for it and isSpecialDateDinner fell all the way to a literal
// substring match on the BUSINESS NAME (nameHasRoomWord) — almost no real
// restaurant is named "... Steak ... Bistro ...".
//
// MEASURED 2026-09-02 (wf_inventory, operational, not excluded): 9,908 food
// rows, 6,788 (68%) price-blind. Of those, 4,784 are otherwise well-rated
// (≥4.3★, ≥150 reviews) — real candidates this gate is turning away for a
// field that no longer exists on their row. Only 625 of the 4,784 carry one
// of the primary_type values below — real, ALREADY-FETCHED Google taxonomy
// evidence (not invented, not the mask) that a room is occasion-tier even
// without a price digit. That is a partial recovery (~13%), not a full fix:
// the remaining ~4,159 well-rated, price-blind, non-occasion-primary rows
// (ordinary casual/family rooms Google's own taxonomy does not distinguish)
// stay gated out and are a real follow-up, tracked with these numbers rather
// than silently accepted. lib/railSelect.js carries an independent, already-
// duplicated copy of this same price≥2-or-room-word gate (a pre-existing
// parallel-path, not introduced here) and is NOT touched by this PR.
const OCCASION_PRIMARY = new Set([
  "steak_house", "fine_dining_restaurant", "wine_bar", "seafood_restaurant", "italian_restaurant",
]);

function hasOccasionPrimaryType(p) {
  const primary = String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();
  return OCCASION_PRIMARY.has(primary);
}

/** Existing datenight-rail "special enough" signal — not a paid boost. */
export function isSpecialDateDinner(p) {
  return priceNumOf(p) >= 2 || nameHasRoomWord(p) || hasOccasionPrimaryType(p);
}

// Counter / value-food identities that are meals on paper and still not a date.
// hamburger_restaurant is the Shake Shack / Shake Station class. isDateRoom
// requiring this as a HARD gate is what emptied Parrish — prioritize rooms,
// do not require them.
const DINNER_VETO_PRIMARY = new Set([
  "hamburger_restaurant", "fast_food_restaurant", "ice_cream_shop",
  "frozen_yogurt_shop", "dessert_shop", "meal_takeaway", "food_truck",
  "sandwich_shop",
]);
const VALUE_FOOD_NAME = /\b(shakes?|burgers?|shake station)\b/i;

/**
 * Dinner is a sit-down meal that is special enough for a date.
 * Shake shops, burger counters, dessert, and TOP-FOOD-PICK value spots
 * are out. price ≥ 2 or a room word (waterfront / bistro / steak / …)
 * is the existing "special" signal — required here, not merely a rank
 * boost. Hide the Dinner rail when nothing qualifies; do not fill it.
 */
export function isDateDinner(p) {
  if (!p || !isMealPlace(p)) return false;
  if (isQuickService(p)) return false;
  const primary = String(p.primaryType || p.primary_type || "").toLowerCase();
  if (DAYTIME_ONLY_PRIMARY.has(primary)) return false;
  const types = [primary, ...(Array.isArray(p.types) ? p.types : [])].map((t) => String(t || "").toLowerCase());
  if (types.some((t) => DINNER_VETO_PRIMARY.has(t))) return false;
  if (placeAllowed("food", "dessert", p)) return false;
  if (VALUE_FOOD_NAME.test(String(p.name || ""))) return false;
  if (!isSpecialDateDinner(p)) return false;
  return true;
}

/** Date-room dinners lead the rail. Used for rank, never as the only admit. */
export function isDateRoomDinner(p) {
  return !!(p && isDateRoom(p) && isMealPlace(p) && isDateDinner(p));
}

export function isDateDessert(p) {
  if (!p || !placeAllowed("food", "dessert", p)) return false;
  const primary = String(p.primaryType || p.primary_type || "").toLowerCase();
  return !DAYTIME_ONLY_PRIMARY.has(primary);
}
export function isDateSpeakeasy(p) { return isSpeakeasy(p); }
// nightlife:music also matches night_club (a real chip overlap). Date Night
// keeps Clubs as its own last nightlife rail, so a dance club is not also
// Live Music. Concert halls / live_music_venue stay here.
export function isDateLiveMusic(p) {
  if (!placeAllowed("nightlife", "music", p) || placeAllowed("nightlife", "clubs", p)) return false;
  const primary = String(p.primaryType || p.primary_type || "").toLowerCase();
  return /^(live_music_venue|concert_hall|music_venue)$/.test(primary);
}
export function isDateClub(p) { return isDanceClub(p); }
export function isDateSpa(p) { return placeAllowed("attractions", "spa", p); }
// Couples tours — not generic outdoor rec. Shell Key clear-kayak / glow
// paddles are a day-trip product; they are not the Date Night answer.
const GENERIC_TOUR = /\b(kayak|canoe|paddle|jet.?ski|parasail|airboat|glow|clear[- ]?kayak|snorkel|scuba|fishing)\b/i;
const COUPLES_TOUR = /\b(sunset|wine|dinner|couples?|romantic|tasting|sail|cruise|cooking)\b/i;
export function isDateTour(p) {
  if (!placeAllowed("attractions", "tours", p)) return false;
  const name = String((p && p.name) || "");
  if (GENERIC_TOUR.test(name)) return false;
  return COUPLES_TOUR.test(name);
}
export function isDateTogether(p) { return isDateSpa(p) || isDateTour(p); }
export function isDateBeach(p) { return isBeachPlace(p) || placeAllowed("attractions", "beaches", p); }
const MUSEUM_PRIMARY_VETO = /^(amusement_park|theme_park|water_park|park|nature_preserve|wildlife_refuge|hiking_area)$/;
export function isDateMuseum(p) {
  if (!p || !placeAllowed("attractions", "museums", p)) return false;
  const primary = String(p.primaryType || p.primary_type || "").toLowerCase();
  return !MUSEUM_PRIMARY_VETO.test(primary);
}
// A browse for two, not an errand. placeAllowed carries the identity-protected
// service vetoes (lib/placeFilter), so a tyre shop or a phone-repair counter
// cannot file here just because it is "shopping" — the same guard that keeps
// `parking` out of `park`.
const DATE_SHOPPING_VETO = /\b(kayak|canoe|paddle|surf|jet.?ski|boat|bike|bicycle|rental|outfitters?|marine supply|bait|tackle)\b/i;
export function isDateShopping(p) {
  if (!p || !placeAllowed("shopping", null, p)) return false;
  const identity = [p.name, p.primaryType, p.primary_type, ...(Array.isArray(p.types) ? p.types : [])].filter(Boolean).join(" ");
  return !DATE_SHOPPING_VETO.test(identity);
}

const MEMBER = {
  dinner: isDateDinner,
  dessert: isDateDessert,
  speakeasies: isDateSpeakeasy,
  livemusic: isDateLiveMusic,
  clubs: isDateClub,
  together: isDateTogether,
  beach: isDateBeach,
  museums: isDateMuseum,
  shopping: isDateShopping,
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

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, then reviews DESC, then
// distance ASC, then place_id ASC. Dinner keeps its one extra signal —
// isDateRoomDinner — but only as a tie-break INSIDE an equal score, exactly
// where it sat before; it can never pre-empt the score the way the Night Out
// / Fall distance ring did.
function byDinnerRank(a, b) {
  const sa = railScoreOf(a);
  const sb = railScoreOf(b);
  if (sa == null && sb != null) return 1;
  if (sb == null && sa != null) return -1;
  if (sa != null && sb != null && sa !== sb) return sb - sa;
  const roomDelta = Number(isDateRoomDinner(b)) - Number(isDateRoomDinner(a));
  if (roomDelta) return roomDelta;
  return byWayfindScore(a, b);
}

const byScore = byWayfindScore;

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
    rails.push({ id: def.id, title: def.title, deck: def.deck || null, group: def.group, places: ranked });
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
