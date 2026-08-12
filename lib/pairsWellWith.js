// lib/pairsWellWith.js — the DISCOVERY LOOP on the detail sheet.
//
// OWNER (voice note, 2026-08-11): "when you click on the detail card for the
// location, let's make the recommendation as far as other things that would
// go well with it, that will pair well with it, especially if it's around…
// We always want to connect the user to other locations and make it like a
// discovery loop… one place leads to another and leads to another."
//
// This is DIFFERENT from "More like this" (same kind, similar vibe) and
// "Worth comparing" (same kind, stronger option). A pairing is a COMPLEMENT:
// dinner leads to dessert or a nightcap, a beach afternoon leads to a beach
// bar, a museum leads to a good cafe. Same kind is exactly what a pairing is
// NOT — a second steakhouse does not pair with a steakhouse.
//
// LAWS:
//  · POOL-ONLY. Candidates come from places the screen already loaded and
//    ranked (the same suggested/places pool the other detail rails read).
//    Zero new fetches — the loop costs nothing.
//  · AROUND THE PLACE, NOT THE READER. Distance is measured from the DETAIL
//    place: a pairing is the next stop on the same outing, so the walk/short
//    hop is from where you will be standing.
//  · ONE CLOCK. The daypart comes from nowContext's bucketForHour — dessert
//    and a nightcap after dinner at night; coffee and a museum in the
//    morning. Never a private clock (check-one-clock).
//  · ORDER-ONLY, MERIT-ONLY. Role fit, then distance, then the place's own
//    score. Commission, affiliate status and offers are not inputs and this
//    module never reads them.
//  · ROLES COME FROM TYPES. Types are truth, names lie (lib/placeFilter law).
import { bucketForHour, siteHourFloat } from "./nowContext.js";

export const PAIR_RADIUS_MI = 5;
export const PAIR_MAX = 4;

// Google types -> pairing role. First hit wins; order matters (a dessert shop
// often also carries "cafe", so dessert is tested before coffee; a wine bar
// carries "bar" and "restaurant", so drinks is tested before dinner).
const ROLE_TYPES = [
  ["dessert", ["dessert_shop", "ice_cream_shop", "chocolate_shop", "candy_store", "donut_shop", "bakery", "dessert_restaurant"]],
  ["drinks", ["bar", "wine_bar", "night_club", "pub", "cocktail_bar", "brewery", "bar_and_grill"]],
  ["coffee", ["cafe", "coffee_shop", "tea_house", "acai_shop", "juice_shop"]],
  ["dinner", ["restaurant", "steak_house", "seafood_restaurant", "sushi_restaurant", "italian_restaurant", "mexican_restaurant", "american_restaurant", "japanese_restaurant", "fine_dining_restaurant", "hamburger_restaurant", "pizza_restaurant", "thai_restaurant", "korean_restaurant", "ramen_restaurant", "food_court"]],
  ["beach", ["beach"]],
  ["culture", ["museum", "art_gallery", "aquarium", "performing_arts_theater", "concert_hall", "historical_landmark", "botanical_garden"]],
  ["outing", ["tourist_attraction", "amusement_park", "zoo", "park", "national_park", "state_park", "nature_preserve", "marina", "amusement_center", "bowling_alley", "movie_theater", "shopping_mall", "market"]],
];

export function pairRole(place) {
  if (!place) return null;
  const types = (Array.isArray(place.types) ? place.types : []).map((t) => String(t || "").toLowerCase());
  for (const [role, list] of ROLE_TYPES) {
    if (types.some((t) => list.includes(t))) return role;
  }
  const cat = String(place.category || place.type || "").toLowerCase();
  if (cat === "beach") return "beach";
  if (cat === "food") return "dinner";
  if (cat === "nightlife") return "drinks";
  if (cat === "attractions") return "outing";
  return null;
}

// What pairs with what, per daypart. Each list is PRIORITY ORDER — the first
// role fills first. Same-role is never a pairing (enforced in code, not here).
// The pairings mirror the owner's daypart research: night is dinner-dessert-
// drinks-music territory, morning is coffee-and-go territory.
export const PAIRINGS = {
  dinner: {
    morning: ["coffee", "culture", "outing"],
    afternoon: ["dessert", "coffee", "culture", "outing"],
    night: ["dessert", "drinks"],
  },
  dessert: {
    morning: ["coffee", "outing", "culture"],
    afternoon: ["outing", "culture", "coffee"],
    night: ["drinks", "dinner"],
  },
  drinks: {
    morning: ["dinner", "outing"],
    afternoon: ["dinner", "outing", "dessert"],
    night: ["dinner", "dessert"],
  },
  coffee: {
    morning: ["outing", "culture", "beach"],
    afternoon: ["culture", "outing", "dessert"],
    night: ["dessert", "dinner"],
  },
  beach: {
    morning: ["coffee", "dinner"],
    afternoon: ["dinner", "dessert", "drinks"],
    night: ["dinner", "drinks"],
  },
  culture: {
    morning: ["coffee", "dinner"],
    afternoon: ["coffee", "dessert", "dinner"],
    night: ["dinner", "drinks"],
  },
  outing: {
    morning: ["coffee", "dinner"],
    afternoon: ["dinner", "dessert", "coffee"],
    night: ["dinner", "drinks"],
  },
};

// The stated reason. Role + daypart, nothing invented — every phrase is
// traceable to the two facts that selected the card (editorial law).
const REASONS = {
  dessert: { morning: "Something sweet after", afternoon: "Dessert after this", night: "Dessert after dinner" },
  drinks: { morning: "Drinks for later", afternoon: "Drinks after this", night: "A nightcap close by" },
  coffee: { morning: "Coffee first", afternoon: "A coffee stop after", night: "Coffee before or after" },
  dinner: { morning: "Food nearby after", afternoon: "A meal to build around it", night: "Dinner to go with it" },
  culture: { morning: "Worth adding while you're there", afternoon: "Worth adding while you're there", night: "Make a night of it" },
  outing: { morning: "Pairs into a morning out", afternoon: "Pairs into the same outing", night: "Keeps the night going" },
  beach: { morning: "The beach is right there", afternoon: "The beach is right there", night: "An evening beach walk" },
};

const R_MI = 3958.8;
function distMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const score = (p) => {
  const s = Number(p && (p.wfScore != null ? p.wfScore : p.governed_score));
  return Number.isFinite(s) ? s : 0;
};

/**
 * The loop. Complements of `place` from the already-loaded `pool`, near the
 * PLACE, for the current daypart.
 *
 * Returns [{ p, reason, pairDistMi }] — at most `max`, at most two per role so
 * one role never crowds out the plan (dinner + four dessert shops is a list,
 * dinner + dessert + a nightcap is a plan).
 */
export function pairsWellWith(place, pool, { bucket, max = PAIR_MAX, radiusMi = PAIR_RADIUS_MI } = {}) {
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) return [];
  const role = pairRole(place);
  if (!role || !PAIRINGS[role]) return [];
  const b = ["morning", "afternoon", "night"].includes(bucket) ? bucket : bucketForHour(siteHourFloat());
  const wanted = PAIRINGS[role][b] || [];
  if (!wanted.length) return [];
  const pri = new Map(wanted.map((r, i) => [r, i]));

  const seen = new Set([place.id]);
  const perRole = new Map();
  const out = [];
  const candidates = [];
  for (const p of Array.isArray(pool) ? pool : []) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) continue;
    const r = pairRole(p);
    if (!r || r === role || !pri.has(r)) continue; // complement, never the same kind
    const d = distMi(Number(place.lat), Number(place.lng), Number(p.lat), Number(p.lng));
    if (!(d > 0) || d > radiusMi) continue; // around THIS place, not the reader
    candidates.push({ p, role: r, pairDistMi: d });
  }
  candidates.sort((a, z) => (pri.get(a.role) - pri.get(z.role)) || (a.pairDistMi - z.pairDistMi) || (score(z.p) - score(a.p)));
  for (const c of candidates) {
    const n = perRole.get(c.role) || 0;
    if (n >= 2) continue;
    perRole.set(c.role, n + 1);
    out.push({ p: c.p, reason: (REASONS[c.role] && REASONS[c.role][b]) || "Pairs well with this", pairDistMi: Math.round(c.pairDistMi * 10) / 10 });
    if (out.length >= max) break;
  }
  return out;
}
