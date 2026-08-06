"use client";
import { Loader } from "@googlemaps/js-api-loader";
import { openNowFromHours, nextOpenFromHours } from "./businessStatus";

// One shared loader for the whole app.
let loader;
// v4.83 — THE app-wide default starting search radius. Every list, category,
// sub-filter, and experience opens at 17 miles; users widen from there with
// the existing radius controls. Purpose-built wide surfaces (the "Worth the
// drive" / bucket-list class and explicit radius overrides) opt out on purpose.
export const DEFAULT_RADIUS_MI = 17;
export const DEFAULT_RADIUS_M = 27359; // 17 mi in meters

export function getLoader() {
  if (!loader) {
    let language = "en";
    try {
      if (typeof navigator !== "undefined") language = navigator.language || (navigator.languages && navigator.languages[0]) || "en";
    } catch (e) {}
    loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
      version: "weekly",
      language,
    });
  }
  return loader;
}

// Top-level categories. Each has a plain-language query Google understands.
// Session query cache (v3.18). Google bills every Text Search; results for the
// same query near the same spot rarely change within hours, and React state
// dies on reload, so without this every app open re-billed the full volley.
// TTL is 8 days: Google's terms allow caching place content up to 30 days, and
// name/rating/location barely move day to day; "open now" is recomputed live
// from cached hours so it stays accurate. Cuts repeat search billing hard
// without warehousing. Size stays at 80 to avoid overflowing phone storage.
// In-flight dedupe means simultaneous identical queries share one request.
const QCACHE_KEY = "wfq_v1";
const QCACHE_TTL_MS = 8 * 24 * 3600 * 1000;
const QCACHE_MAX = 80;
const _inflight = new Map();
function qkey(kind, query, center, extra) {
  const g = center ? Math.round(center.lat * 50) / 50 + "," + Math.round(center.lng * 50) / 50 : "x";
  return kind + "|" + String(query || "").toLowerCase().trim() + "|" + g + "|" + (extra || "");
}
function qread(key) {
  try {
    const all = JSON.parse(localStorage.getItem(QCACHE_KEY) || "{}");
    const hit = all[key];
    if (hit && Date.now() - hit.t < QCACHE_TTL_MS) return hit.v;
  } catch (e) {}
  return null;
}
function qwrite(key, v) {
  try {
    const all = JSON.parse(localStorage.getItem(QCACHE_KEY) || "{}");
    all[key] = { t: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > QCACHE_MAX) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - QCACHE_MAX).forEach((k) => delete all[k]);
    localStorage.setItem(QCACHE_KEY, JSON.stringify(all));
  } catch (e) {}
}
function cached(key, fn) {
  const hit = qread(key);
  if (hit) return Promise.resolve(hit);
  if (_inflight.has(key)) return _inflight.get(key);
  const pr = fn().then((v) => { _inflight.delete(key); const keep = Array.isArray(v) ? v.length > 0 : !!v; if (keep) qwrite(key, v); return v; }).catch((e) => { _inflight.delete(key); throw e; });
  _inflight.set(key, pr);
  return pr;
}

export const CATEGORIES = [
  { id: "food", label: "🍽️ Food", query: "best restaurants" },
  { id: "nightlife", label: "🍸 Night Out", query: "best bars and nightlife" },
  { id: "attractions", label: "🎯 Things To Do", query: "top tourist attractions" },
  { id: "beach", label: "🏖️ Beach Day", query: "best beaches" }, // kept for back-compat/deep links; beaches surface under attractions:outdoors
  { id: "family", label: "👨‍👩‍👧 Family", query: "best family friendly things to do" },
  { id: "hotels", label: "🏨 Stay", query: "best hotels" },
  { id: "shopping", label: "🛍️ Shopping", query: "best shopping" },
];

// Sub-filters per category. Each runs a real, targeted Google text search.
export const SUBFILTERS = {
  food: [
    { id: "all", label: "All", query: "best restaurants" },
    { id: "breakfast", label: "Breakfast", query: "best breakfast and brunch" },
    // v6.34 — owner ask: EXCLUSIVELY cafés (coffee-forward identities), not
    // breakfast diners, not restaurants. The food:cafes SUB_ALLOW contract in
    // lib/placeFilter.js is what keeps the query's brunch spots out.
    { id: "cafes", label: "Cafés", query: "best cafes and coffee shops" },
    { id: "lunch", label: "Lunch", query: "best lunch spots" },
    { id: "dinner", label: "Dinner", query: "best dinner restaurants" },
    { id: "quickbites", label: "Quick bites", query: "quick casual eats and fast food" },
    { id: "delivery", label: "Delivery", query: "best food delivery and takeout restaurants" }, // v6.39: Order In lives in the main menu — real cards, real Score
    { id: "dessert", label: "Desserts", query: "best desserts bakeries and ice cream" },
  ],
  nightlife: [
    { id: "all", label: "All", query: "best bars and nightlife" },
    { id: "bars", label: "Bars", query: "best bars and pubs" },
    { id: "clubs", label: "Clubs", query: "nightclubs" },
    { id: "speakeasy", label: "Speakeasy", query: "speakeasy bars and hidden lounges" },
    { id: "karaoke", label: "Karaoke", query: "karaoke bars" },
    { id: "sports", label: "Sports Bars", query: "sports bars" },
    { id: "music", label: "Live Music", query: "live music bars and venues" },
  ],
  attractions: [
    { id: "all", label: "All", query: "top tourist attractions" },
    { id: "outdoors", label: "Outdoors", query: "parks, beaches and outdoor attractions" }, // v6.28: beaches live here now
    // v6.34 — owner ask: beaches get their own sub back (dedicated chip, not
    // just mixed into Outdoors). Same beaches-only contract as the old Beach
    // day tab (attractions:beaches in placeFilter — marinas stay out, v6.16).
    { id: "beaches", label: "Beaches", query: "best beaches" },
    { id: "museums", label: "Museums", query: "museums and galleries" },
    { id: "family", label: "Family", query: "family friendly attractions" },
    { id: "tours", label: "Tours", query: "guided tours boat tours and sightseeing excursions" }, // v6.37: ask for OPERATORS (guided/boat tours), not generic sightseeing
    { id: "spa", label: "Spa & wellness", query: "best spas and wellness experiences" },
    { id: "landmarks", label: "Landmarks", query: "famous landmarks and monuments" },
    { id: "arts", label: "Arts", query: "art galleries and theaters" },
    // v6.16: marinas moved here from `beach`. A marina is not a beach — the old
    // taxonomy mapped Google's `marina` type straight to the beach category, so
    // 79 of the 100 stored "beach" rows were marinas, yacht clubs and even a boat
    // DEALERSHIP. Beaches now contains beaches; on-the-water gets its own chip.
    { id: "marinas", label: "On the water", query: "jet ski rentals paddleboard kayak tours sunset cruises and boat rentals" }, // v6.37: the fun first — jet skis, paddles, sunset cruises; docks second
  ],
  beach: [
    { id: "all", label: "All", query: "best beaches" },
    { id: "beaches", label: "Beaches", query: "best public beaches" },
    // v4.97: "Parking" and "Gift shops" removed — inherently junk-generating
    // text queries (per the results-quality audit); parking lives on each
    // beach's detail, and gift shops belong to Shopping.
    // v6.16: "Marinas" moved to attractions ("On the water") — see above.
  ],
  // v6.28 — FAMILY: the main-menu tab (replaced "Beach day"). Age-targeted subs
  // so a parent gets safe, appropriate options for exactly who they have with
  // them. Every result is gated in lib/placeFilter (family:* contracts) so
  // nothing inappropriate or off-theme appears.
  family: [
    { id: "all", label: "All", query: "best family friendly things to do" },
    { id: "toddlers", label: "Toddlers", query: "toddler friendly playground children's museum splash pad petting zoo" },
    { id: "kids", label: "Kids", query: "fun for kids arcade trampoline park mini golf candy store" },
    { id: "adults", label: "Grown-ups too", query: "family friendly restaurants good for kids and adults" },
    { id: "rainy", label: "Rainy day", query: "indoor family activities museum arcade play" },
  ],
  hotels: [
    { id: "all", label: "All", query: "best hotels" },
    { id: "luxury", label: "Luxury", query: "luxury hotels" },
    { id: "budget", label: "Budget", query: "affordable hotels" },
    { id: "beach", label: "Beach", query: "beach resorts and hotels" },
    { id: "boutique", label: "Boutique", query: "boutique hotels" },
  ],
  shopping: [
    { id: "all", label: "All", query: "best shopping" },
    { id: "malls", label: "Malls", query: "shopping malls" },
    { id: "boutiques", label: "Boutiques", query: "boutique shops" },
    { id: "markets", label: "Markets", query: "markets and outlets" },
    { id: "outlets", label: "Outlets", query: "outlet malls" },
    // v6.64 — Gift shops return, under Shopping, where the v4.97 note that
    // removed them from `beach` said they belonged. That removal called them an
    // "inherently junk-generating text query" and the diagnosis was right:
    // "gift shops" as free text pulls in every store with the word in its name.
    // What is different here is the GATE, not the query. shopping:giftshops in
    // lib/placeFilter.js admits on Google's structured `gift_shop` /
    // `souvenir_store` types, so the query only has to fetch a candidate pool
    // and the types decide who stays. 15 Orlando rows already carry `gift_shop`
    // in google_types, so the tab has real inventory the day it ships.
    { id: "giftshops", label: "Gift Shops", query: "gift shops and souvenir stores" },
  ],
};

// Resolve the right search text for a category + sub-filter combo.
export function queryFor(catId, subId) {
  const subs = SUBFILTERS[catId];
  if (subs) {
    const s = subs.find((x) => x.id === subId);
    if (s) return s.query;
  }
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.query : "best places";
}

// Third-tier vibe / occasion modifiers. Each prepends a real keyword to the
// search so results actually match. These are searches, not invented labels.
export const VIBES = {
  food: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "romantic", label: "Romantic", q: "romantic" },
    { id: "quick", label: "Quick bite", q: "quick casual" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "outdoor", label: "Outdoor", q: "outdoor patio" },
    { id: "upscale", label: "Upscale", q: "upscale fine dining" },
    { id: "cheap", label: "Cheap eats", q: "cheap" },
  ],
  nightlife: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "date", label: "Date night", q: "romantic date" },
    { id: "rooftop", label: "Rooftop", q: "rooftop" },
    { id: "dance", label: "Dancing", q: "dance" },
    { id: "chill", label: "Chill", q: "low key chill" },
    { id: "dive", label: "Dive", q: "dive" },
  ],
  attractions: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "outdoor", label: "Outdoor", q: "outdoor" },
    { id: "indoor", label: "Indoor", q: "indoor" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "free", label: "Free", q: "free" },
    { id: "date", label: "Date", q: "romantic date" },
  ],
  hotels: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "pool", label: "Pool", q: "with pool" },
    { id: "romantic", label: "Romantic", q: "romantic" },
    { id: "family", label: "Family", q: "family friendly" },
    { id: "pet", label: "Pet friendly", q: "pet friendly" },
  ],
  shopping: [
    { id: "all", label: "Any vibe", q: "" },
    { id: "boutique", label: "Boutique", q: "boutique" },
    { id: "outlet", label: "Outlet", q: "outlet" },
    { id: "vintage", label: "Vintage", q: "vintage thrift" },
    { id: "local", label: "Local", q: "local independent" },
  ],
};

export function vibeFor(catId, vibeId) {
  const v = (VIBES[catId] || []).find((x) => x.id === vibeId);
  return v ? v.q : "";
}

const PRICE = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

// Turn a city name typed by the user into coordinates.
// v6.60: `types` / `isArea` are part of the contract. Callers need to tell a
// CITY ("Sarasota") from a street address or a business, because a city must
// RECENTER the whole app while a business must not. submitSearch (app/home.js)
// depends on this to fix the "searched a city, the cards never moved" bug;
// scripts/test-city-search.mjs locks it. The predicate itself lives in
// lib/geoAreaTypes so it can be unit-tested without the browser-only loader.
export { isAreaResult, GEO_AREA_TYPES } from "./geoAreaTypes";
import { isAreaResult } from "./geoAreaTypes";

export async function geocodeCity(query) {
  const { Geocoder } = await getLoader().importLibrary("geocoding");
  const geocoder = new Geocoder();
  const res = await geocoder.geocode({ address: query });
  const results = res?.results || [];
  if (!results.length) return null;
  // Prefer a genuine AREA hit over Google's first result: geocoding "Sarasota"
  // while biased near Parrish can rank a street address or an establishment
  // first, which is exactly how a city search used to get mistaken for a
  // business search and silently fail to move the map.
  const r = results.find((x) => isAreaResult(x.types)) || results[0];
  const types = r.types || [];
  return {
    name: r.formatted_address,
    lat: r.geometry.location.lat(),
    lng: r.geometry.location.lng(),
    types,
    isArea: isAreaResult(types),
  };
}

// Reverse a lat/lng (from device GPS) into a readable place name.
export async function reverseGeocode(lat, lng) {
  // v6.41 — THE GEOCODING BILL FIX: one paid reverse-geocode per visitor per
  // visit added up. City names are stable, so cache by ~1.1km cell (2-decimal
  // rounding) in localStorage for 30 days: repeat visitors and same-session
  // re-locates are free. scripts/test-map-cost.mjs locks this contract.
  const _ck = "wf_revgeo|" + Number(lat).toFixed(2) + "|" + Number(lng).toFixed(2);
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(_ck) : null;
    if (raw) {
      const hit = JSON.parse(raw);
      if (hit && hit.v && Date.now() - (hit.t || 0) < 30 * 86400000) return hit.v;
    }
  } catch (e) {}
  const v = await _reverseGeocodeUncached(lat, lng);
  try { if (v && typeof localStorage !== "undefined") localStorage.setItem(_ck, JSON.stringify({ v, t: Date.now() })); } catch (e) {}
  return v;
}
async function _reverseGeocodeUncached(lat, lng) {
  try {
    const { Geocoder } = await getLoader().importLibrary("geocoding");
    const geocoder = new Geocoder();
    const res = await geocoder.geocode({ location: { lat, lng } });
    const results = res?.results || [];
    // Walk every result looking for city + state. Never return a street address.
    for (const r of results) {
      const comps = r.address_components || [];
      const city = comps.find((c) => c.types.includes("locality"))?.long_name;
      const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name;
      if (city && state) return `${city}, ${state}`;
      if (city) return city;
    }
    // Last resort: township or county
    const area = results.find((r) =>
      r.types.some((t) => ["administrative_area_level_3", "administrative_area_level_2", "neighborhood", "sublocality"].includes(t))
    );
    if (area) {
      const comps = area.address_components || [];
      const name = comps.find((c) =>
        c.types.some((t) => ["administrative_area_level_3", "locality", "neighborhood"].includes(t))
      )?.long_name;
      if (name) return name;
    }
    return "";
  } catch {
    return "";
  }
}

// Turn Google's attribute booleans into short, honest labels.
function attrLabels(p) {
  const A = [];
  const add = (c, l) => { if (c) A.push(l); };
  add(p.outdoorSeating, "Outdoor seating");
  add(p.liveMusic, "Live music");
  add(p.servesCocktails, "Cocktails");
  add(p.servesBeer, "Beer");
  add(p.servesWine, "Wine");
  add(p.servesCoffee, "Coffee");
  add(p.servesBreakfast, "Breakfast");
  add(p.servesBrunch, "Brunch");
  add(p.servesVegetarianFood, "Vegetarian options");
  add(p.servesDessert, "Dessert");
  add(p.reservable, "Takes reservations");
  add(p.goodForGroups, "Good for groups");
  add(p.goodForWatchingSports, "Good for sports");
  add(p.goodForChildren, "Kid friendly");
  add(p.menuForChildren, "Kids menu");
  add(p.allowsDogs, "Dog friendly");
  add(p.takeout, "Takeout");
  add(p.delivery, "Delivery");
  add(p.dineIn, "Dine-in");
  add(p.curbsidePickup, "Curbside");
  add(p.restroom, "Restroom");
  if (p.parkingOptions) {
    const po = p.parkingOptions;
    if (po.freeParkingLot || po.freeStreetParking) A.push("Free parking");
    else if (po.paidParkingLot || po.paidStreetParking || po.valetParking) A.push("Paid parking");
  }
  if (p.accessibilityOptions) {
    const ao = p.accessibilityOptions;
    if (ao.wheelchairAccessibleEntrance || ao.wheelchairAccessibleSeating || ao.wheelchairAccessibleRestroom) A.push("Wheelchair accessible");
  }
  return A;
}

// A transparent 0 to 100 Wayfind score. The formula moved to lib/wayfindScore.js
// (2026-08-06) because it had been written three times and one of the three was
// a different formula — see that file for what it cost. Re-exported here so
// every existing importer of `wayfindScore` from lib/google keeps working.
// IMPORTED, then re-exported. `export { x } from "./y"` alone would NOT create
// a local binding, and prominenceScore() below CALLS wayfindScore — that is a
// ReferenceError the moment the function runs, which is exactly the failure
// check-lib-call-imports exists for. It caught this one before it shipped.
import { wayfindScore } from "./wayfindScore.js";
export { wayfindScore };

// PROMINENCE — a separate 0 to 100 signal, for ordering "top of <city>" lists.
//
// wayfindScore answers "is this good?". It must not be asked "is this one of the
// biggest things here?", and the gap is not cosmetic. A Bayesian prior only ever
// pulls LOW-volume places DOWN toward the mean, so it can never lift a 4.6 above
// a 5.0 no matter how many people rated the 4.6. Ordering Orlando by wayfindScore
// alone puts four escape rooms and a day spa above Magic Kingdom (251,175
// reviews) and Walt Disney World (270,237) — measured, not hypothetical. No
// value of m fixes it: the ordering only flips around m=20000, which flattens
// every ordinary place's score to mush.
//
// So prominence blends quality with how many people actually showed up. log10
// keeps it humane (100k reviews is not 100x more prominent than 1k), and quality
// still leads at 0.6 so a big mediocre place cannot buy the top slot.
// Locked by scripts/test-prominence.mjs.
export function prominenceScore(rating, reviews) {
  if (!rating) return null;
  const quality = wayfindScore(rating, reviews) / 100;             // 0..1
  const volume = Math.min(1, Math.log10(1 + (reviews || 0)) / 6);  // 1M reviews ~= 1
  return Math.round(100 * (0.6 * quality + 0.4 * volume));
}

const PRICE_NUM = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Compute whether a place is open right now from its regular hours and the
// place's UTC offset. The new Places API no longer exposes a simple openNow
// boolean, so we derive it. Returns true, false, or null if unknown.
// v6.31: both of these now delegate to lib/businessStatus.js — the ONE
// implementation of open/closed math shared by every surface. Keeping them as
// thin wrappers preserves the existing call sites (they store the fetch-time
// snapshot onto each place) while guaranteeing the logic can never drift from
// what the display surfaces compute live.
function openNowFrom(oh, utcOffsetMinutes) {
  return openNowFromHours(oh, utcOffsetMinutes);
}

function nextOpenInfo(oh, utcOffsetMinutes) {
  return nextOpenFromHours(oh, utcOffsetMinutes);
}

function priceRangeFrom(pr) {
  try {
    if (!pr) return null;
    const num = (m) => (m && m.units != null ? Number(m.units) : (m && m.amount != null ? Number(m.amount) : null));
    const s = num(pr.startPrice), e = num(pr.endPrice);
    if ((s == null || Number.isNaN(s)) && (e == null || Number.isNaN(e))) return null;
    return { startUsd: Number.isNaN(s) ? null : s, endUsd: Number.isNaN(e) ? null : e };
  } catch { return null; }
}
// v4.09 - variety guard. Google stores a complex (Disney Springs), its
// districts (Town Center, Marketplace), and its anchor stores (World of
// Disney) as separate places, so one destination can flood a list with
// near-identical cards. Collapse children into the highest-ranked parent.
// Conservative by design: requires close proximity AND a containment signal,
// and the same-street rule only fires when the kept place is a container
// type, so two distinct restaurants sharing a plaza address never merge.
const CONTAINER_TYPES = ["shopping_mall", "market", "amusement_park", "tourist_attraction", "department_store"];
const STORE_TYPES = ["store", "shopping_mall", "market", "department_store", "clothing_store", "shoe_store", "jewelry_store", "toy_store", "gift_shop", "book_store", "electronics_store", "home_goods_store", "sporting_goods_store"];
function _normName(x) { return String(x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function _isNestedPlace(kept, cand) {
  try {
    const d = distMeters({ lat: kept.lat, lng: kept.lng }, { lat: cand.lat, lng: cand.lng });
    if (d > 350) return false;
    const kn = _normName(kept.name), cn = _normName(cand.name);
    const ka = _normName(kept.address), ca = _normName(cand.address);
    // Name containment either way: "Town Center Disney Springs" vs "Disney Springs".
    if (kn.length >= 5 && cn.length >= 5 && (kn.includes(cn) || cn.includes(kn))) return true;
    // One's name inside the other's address: "Disney Springs" in "... Disney Springs, Orlando".
    if (kn.length >= 5 && ca.includes(kn)) return true;
    if (cn.length >= 5 && ka.includes(cn)) return true;
    // Same street line at very close range, only when the kept place is a
    // mall/complex-style container AND the candidate is store-like. This folds
    // anchor stores in while a restaurant, theater, or museum that happens to
    // share the mall's address keeps its own slot: those are destinations in
    // their own right, a store inside a mall usually is not.
    const isContainer = (kept.types || []).some((t) => CONTAINER_TYPES.includes(t));
    const candIsStore = (cand.types || []).some((t) => STORE_TYPES.includes(t));
    if (isContainer && candIsStore && d <= 250) {
      const s1 = ka.split(",")[0].trim(), s2 = ca.split(",")[0].trim();
      if (s1 && s1 === s2) return true;
    }
    return false;
  } catch { return false; }
}
function varietyGuard(list) {
  const out = [];
  for (const p of list) {
    const parent = out.find((w) => _isNestedPlace(w, p));
    if (parent) { (parent.alsoInside = parent.alsoInside || []).push(p.name); continue; }
    out.push(p);
  }
  return out;
}

// v4.08 - shared server cache. One visitor's search serves everyone for the TTL.
// Falls back silently to the direct SDK path when the route reports 501
// (server key not configured), so nothing breaks before the key exists.
let _proxyDown = false;
async function proxySearch(q, center, radius, n, cat) {
  if (_proxyDown || typeof window === "undefined" || !center || !q) return null;
  try {
    const qs = new URLSearchParams({ q, lat: Number(center.lat).toFixed(2), lng: Number(center.lng).toFixed(2), radius: String(Math.round(radius)), n: String(n) });
    if (cat) qs.set("cat", cat); // v6.10: lets the server serve wf_inventory for this category if Google 429s
    const r = await fetch("/api/places/search?" + qs.toString());
    if (r.status === 501) { _proxyDown = true; return null; }
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !Array.isArray(data.places) || !data.places.length) return null;
    return data.places.map(restToPlace);
  } catch { return null; }
}
// Adapts a REST place JSON to the SDK Place surface that normalize() reads:
// location as functions, photos with getURI. Field enums already match.
function restToPlace(p) {
  return {
    ...p,
    location: p.location ? { lat: () => p.location.latitude, lng: () => p.location.longitude } : null,
    photos: (p.photos || []).map((ph) => ({
      authorAttributions: ph.authorAttributions,
      // v6.18: route through our own 30-day cached proxy (/api/photo) instead of
      // hitting places.googleapis.com with the referrer-restricted public key —
      // that direct load kept failing, and it exposed a key in every <img>.
      getURI: (opt) => photoProxyURL(ph.name, (opt && opt.maxWidth) || 640),
    })),
  };
}

// Build the same-origin cached-proxy URL for a Google photo resource name.
export function photoProxyURL(name, w) {
  if (!name) return null;
  return "/api/photo?ref=" + encodeURIComponent(name) + "&w=" + (w || 640);
}

function normalize(p) {
  if (!p.location) return null;
  let photo = null;
  let photos = [];
  let photoAttrs = [];
  try {
    if (p.photos && p.photos.length) {
      // v6.18: prefer the 30-day cached proxy whenever a Google photo resource
      // name is present (both the server/REST path and the native SDK path
      // expose ph.name). Only fall back to the SDK's own getURI when there is
      // no resource name to proxy.
      const uri = (ph, w) => (ph && ph.name ? photoProxyURL(ph.name, w) : (ph && ph.getURI ? ph.getURI({ maxWidth: w }) : null));
      photos = p.photos.slice(0, 6).map((ph) => uri(ph, 640)).filter(Boolean);
      photoAttrs = p.photos.slice(0, 6).map((ph) => { try { const a = ph.authorAttributions && ph.authorAttributions[0]; return (a && (a.displayName || a.display_name)) || ""; } catch (e) { return ""; } });
      photo = uri(p.photos[0], 640);
    }
  } catch {}
  return {
    id: p.id,
    name: typeof p.displayName === "string" ? p.displayName : p.displayName?.text || "Unnamed",
    rating: p.rating || null,
    reviews: p.userRatingCount || 0,
    wfScore: wayfindScore(p.rating, p.userRatingCount || 0),
    // Ordering-only signal — never displayed. See prominenceScore().
    wfProm: prominenceScore(p.rating, p.userRatingCount || 0),
    price: PRICE[p.priceLevel] || null,
    priceNum: p.priceLevel in PRICE_NUM ? PRICE_NUM[p.priceLevel] : null,
    priceRange: priceRangeFrom(p.priceRange),
    address: p.formattedAddress || "",
    lat: p.location.lat(),
    lng: p.location.lng(),
    openNow: openNowFrom(p.regularOpeningHours, p.utcOffsetMinutes),
    nextOpen: nextOpenInfo(p.regularOpeningHours, p.utcOffsetMinutes),
    oh: p.regularOpeningHours && p.regularOpeningHours.periods ? { periods: p.regularOpeningHours.periods, weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions || null } : null,
    utcOffset: p.utcOffsetMinutes != null ? p.utcOffsetMinutes : null,
    hoursAsOf: (p.regularOpeningHours && p.regularOpeningHours.periods) ? Date.now() : null, // v6.31: freshness stamp for staleness checks

    type: (p.types && p.types[0] ? p.types[0] : "").replace(/_/g, " "),
    types: p.types || [],
    // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | null when unknown.
    // Grounding checks (e.g. culture-card named businesses) rely on this.
    status: p.businessStatus || null,
    photo,
    photos,
    photoAttrs,
    photoAttr: photoAttrs[0] || "",
    labels: attrLabels(p),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      p.displayName?.text || p.displayName || ""
    )}&query_place_id=${p.id}`,
  };
}

// Fetch a single place fully by its Google id and normalize it to the same
// shape the list uses, so a shared deep link can open it. Fails soft.
export async function fetchPlaceById(id) {
  try {
    const { Place } = await getLoader().importLibrary("places");
    const place = new Place({ id });
    const baseFields = [
      "id", "displayName", "location", "rating", "userRatingCount",
      "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos",
    ];
    const attrFields = [
      "outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine",
      "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood",
      "servesDessert", "reservable", "goodForGroups", "goodForChildren",
      "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout",
      "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions",
    ];
    try {
      await place.fetchFields({ fields: [...baseFields, ...attrFields, "priceRange"] });
    } catch {
      try { await place.fetchFields({ fields: [...baseFields, ...attrFields] }); }
      catch { await place.fetchFields({ fields: baseFields }); }
    }
    return normalize(place);
  } catch (e) {
    return null;
  }
}

// Straight-line distance in meters between two lat/lng points.
export function distMeters(a, b) {
  const R = 6371000;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Live search: real places from Google, ranked by quality, near the location.
// Find a single place by free text (e.g. an event venue name), biased to a
// location. Returns the same normalized shape the list uses, so it can open in
// the standard detail sheet with real reviews, hours, and grounded AI tips.
// Search for any named place or brand within a radius, sorted closest first.
// This is what powers "McDonald's near me" type searches — handles chains,
// specific restaurants, bars, any business name the user types.
export function searchNearbyPlaces(query, center, radiusMiles = DEFAULT_RADIUS_MI) {
  if (!query || !center) return Promise.resolve([]);
  return cached(qkey("near", query, center, radiusMiles), () => _searchNearbyPlaces(query, center, radiusMiles));
}
async function _searchNearbyPlaces(query, center, radiusMiles = DEFAULT_RADIUS_MI) {
  if (!query || !center) return [];
  try {
    const { Place } = await getLoader().importLibrary("places");
    // Two DIFFERENT radii, and conflating them is why widening the range
    // returned the same list (owner: "when I expand it it does not fetch new
    // places", 2026-08-05).
    //
    // requestMeters is clamped to 50,000 because that is the Places API ceiling
    // for locationBias — that clamp is correct and must stay.
    // filterMeters is what the user actually asked for. The post-filter below
    // used to inherit the CLAMPED value, so every radius above 31.1 miles
    // (50,000 m) behaved exactly like 31.1: same request, same results, same
    // cut. Widening past that point could not change a single row.
    const requestMeters = Math.min(radiusMiles * 1609.34, 50000);
    const filterMeters = radiusMiles * 1609.34;
    const radiusMeters = requestMeters;
    const baseFields = ["id", "displayName", "location", "rating", "userRatingCount", "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos", "businessStatus"];
    const attrFields = ["outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine", "servesCoffee", "servesBreakfast", "servesBrunch", "goodForGroups", "goodForChildren", "allowsDogs", "takeout", "delivery", "dineIn"];
    let places = await proxySearch(query, center, radiusMeters, 10);
    if (!places) {
      try {
        ({ places } = await Place.searchByText({ textQuery: query, maxResultCount: 10, locationBias: { center, radius: radiusMeters }, fields: baseFields }));
      } catch {
        ({ places } = await Place.searchByText({ textQuery: query, maxResultCount: 10, locationBias: { center, radius: radiusMeters }, fields: baseFields }));
      }
    }
    let list = (places || []).map(normalize).filter(Boolean);
    // Hard cap at the requested radius — bias alone doesn't guarantee proximity
    list = list.filter((p) => distMeters(center, { lat: p.lat, lng: p.lng }) <= filterMeters);
    list.forEach((p) => { p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34; });
    // Sort closest first — this is the primary ranking for a direct name search
    list.sort((a, b) => (a.distMi || 0) - (b.distMi || 0));
    list = varietyGuard(list);
    return list;
  } catch { return []; }
}

export function findPlace(query, center) {
  if (!query) return Promise.resolve(null);
  return cached(qkey("find", query, center, ""), () => _findPlace(query, center));
}
async function _findPlace(query, center) {
  if (!query) return null;
  try {
    const { Place } = await getLoader().importLibrary("places");
    const baseFields = ["id", "displayName", "location", "rating", "userRatingCount", "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos", "businessStatus"];
    const attrFields = ["outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine", "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood", "servesDessert", "reservable", "goodForGroups", "goodForChildren", "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout", "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions"];
    const common = { textQuery: query, maxResultCount: 1 };
    if (center) common.locationBias = { center, radius: 16000 };
    let places = await proxySearch(query, center || null, 16000, 1);
    if (!places) {
      try { ({ places } = await Place.searchByText({ ...common, fields: baseFields })); }
      catch { ({ places } = await Place.searchByText({ ...common, fields: baseFields })); }
    }
    const p = (places || []).map(normalize).filter(Boolean)[0];
    if (p && center) p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34;
    return p || null;
  } catch { return null; }
}

export function searchPlaces(categoryId, subId, center, radiusMeters = DEFAULT_RADIUS_M, vibeId = "all", keyword = "") {
  let tq = queryFor(categoryId, subId);
  const vq0 = vibeFor(categoryId, vibeId);
  if (vq0) tq = vq0 + " " + tq;
  if (keyword) tq = keyword + " " + tq;
  return cached(qkey("cat", tq, center, radiusMeters), () => _searchPlaces(categoryId, subId, center, radiusMeters, vibeId, keyword));
}
async function _searchPlaces(categoryId, subId, center, radiusMeters = DEFAULT_RADIUS_M, vibeId = "all", keyword = "") {
  let textQuery = queryFor(categoryId, subId);
  const vq = vibeFor(categoryId, vibeId);
  if (vq) textQuery = vq + " " + textQuery;
  if (keyword) textQuery = keyword + " " + textQuery;
  const { Place } = await getLoader().importLibrary("places");
  const baseFields = [
    "id", "displayName", "location", "rating", "userRatingCount",
    "priceLevel", "formattedAddress", "regularOpeningHours", "utcOffsetMinutes", "types", "photos", "businessStatus",
  ];
  const attrFields = [
    "outdoorSeating", "liveMusic", "servesCocktails", "servesBeer", "servesWine",
    "servesCoffee", "servesBreakfast", "servesBrunch", "servesVegetarianFood",
    "servesDessert", "reservable", "goodForGroups", "goodForChildren",
    "goodForWatchingSports", "menuForChildren", "allowsDogs", "takeout",
    "delivery", "dineIn", "curbsidePickup", "restroom", "parkingOptions", "accessibilityOptions",
  ];
  const common = { textQuery, locationBias: { center, radius: radiusMeters }, maxResultCount: 20 };
  let places = await proxySearch(textQuery, center, radiusMeters, 20, categoryId);
  if (!places) {
    try {
      ({ places } = await Place.searchByText({ ...common, fields: [...baseFields, "priceRange"] }));
    } catch (e) {
      // Defensive fallback so the list still loads if a field is unsupported.
      ({ places } = await Place.searchByText({ ...common, fields: baseFields }));
    }
  }
  let list = (places || []).map(normalize).filter(Boolean);
  // Hard distance gate: keep only places genuinely near the location, so a
  // thin category (e.g. shopping in a small town) can't bleed in far-off or
  // out-of-state results. Bias affects ranking; this enforces the boundary.
  const gate = radiusMeters * 1.15; // respect the search radius site-wide, small buffer for rounding
  list = list.filter((p) => distMeters(center, { lat: p.lat, lng: p.lng }) <= gate);
  // Distance (miles) from the area center, shown on each card.
  list.forEach((p) => { p.distMi = distMeters(center, { lat: p.lat, lng: p.lng }) / 1609.34; });

  // Sort by a distance-adjusted Wayfind Score.
  // wfScore (displayed on cards) reflects pure quality and doesn't change.
  // _sortScore adds a proximity bonus so a 4.7★ place at 2 miles outranks
  // the same rating at 22 miles. Penalty: 1 point per 3 miles of distance,
  // capped at 15 points so a truly outstanding place (9.8) can still surface
  // even from a distance.
  list.forEach((p) => {
    // v4.24: proximity dominates. 0-4 mi free, then ~1.3 pts/mile capped at 30.
    const _d = p.distMi || 0;
    const distPenalty = _d <= 4 ? 0 : Math.min(30, (_d - 4) * 1.3);
    p._sortScore = (p.wfScore || 0) - distPenalty;
  });
  list.sort((a, b) => (b._sortScore || 0) - (a._sortScore || 0));
  // v4.24 near-first rule: when 5+ places sit within 12 miles, nothing beyond
  // 20 miles may rank above them. Sparse areas keep score order untouched.
  const nearCount = list.filter((p) => p.distMi != null && p.distMi <= 12).length;
  if (nearCount >= 5) {
    const near = list.filter((p) => !(p.distMi != null && p.distMi > 20));
    const far = list.filter((p) => p.distMi != null && p.distMi > 20);
    list = [...near, ...far];
  }

  // v4.09: collapse nested duplicates (mall + its districts + anchor stores)
  // AFTER sorting so the strongest representative keeps the slot.
  list = varietyGuard(list);

  // v4.15: "Things to do" quality filter. Generic neighborhood parks and
  // walking trails are weak recommendations for a visitor asking what to DO,
  // and they crowded out bookable attractions and tours. Landmark-scale parks
  // survive on evidence (big review counts at high ratings); the Outdoors
  // subfilter still surfaces parks on purpose because its query asks for them.
  if (/tourist attractions|family friendly attractions|tours and sightseeing|things to do/i.test(textQuery)) {
    const PARKY = /\b(park|hiking_area|playground|dog_park|natural_feature|campground|garden|botanical_garden|rv_park)\b/;
    list = list.filter((pl) => {
      const t = (pl.types || []).join(" ").toLowerCase();
      if (!PARKY.test(t)) return true;
      return (pl.reviews || 0) >= 3000 && (pl.rating || 0) >= 4.4;
    });
  }

  // Transparent score + position within this nearby set.
  // Score is global (set in normalize). Rank and total are relative to THIS set.
  list.forEach((p, i) => {
    p.rank = i + 1;
    p.total = list.length;
  });
  return list;
}

// On-demand deep data for a single opened place. This uses Google's pricier
// "atmosphere" fields, so it only runs when a user opens a place, never for
// the whole list.
//
// Returns { ok: true, ... } on success and { ok: false, error, ... } on
// failure. It used to return `null` for every failure, which the caller then
// replaced with an all-empty object — making "this fetch broke" byte-identical
// to "this place genuinely has no reviews and no hours". That is why the bug
// below survived: there was no state in which anything could notice it.
export async function fetchPlaceDetail(placeId) {
  try {
    const { Place } = await getLoader().importLibrary("places");
    const place = new Place({ id: placeId });
    await place.fetchFields({
      // websiteURI, NOT websiteUri. The Maps JS SDK validates this whole array
      // up front and throws InvalidValueError ("Unknown fields requested:
      // websiteUri") before it issues any request — so ONE misspelling meant
      // editorialSummary, reviews, regularOpeningHours and nationalPhoneNumber
      // were never fetched for ANY place, ever. Deterministic and total, not a
      // quota or referrer problem: the call never reached the network.
      // The SDK was asked directly which spellings it accepts; only this one
      // gets past validation.
      fields: ["editorialSummary", "reviews", "regularOpeningHours", "nationalPhoneNumber", "websiteURI"],
    });

    const ed = place.editorialSummary;
    const editorial = (ed && (ed.text || ed)) ? (ed.text || ed).toString() : null;

    const reviews = (place.reviews || [])
      .slice(0, 5)
      .map((r) => {
        const t = r && r.text ? (r.text.text || r.text) : "";
        const author = r && r.authorAttribution ? (r.authorAttribution.displayName || "") : "";
        const when = r ? (r.relativePublishTimeDescription || "") : "";
        return { text: (t || "").toString().slice(0, 700), rating: r ? r.rating || null : null, author, when };
      })
      .filter((r) => r.text);

    const hours = (place.regularOpeningHours && place.regularOpeningHours.weekdayDescriptions) || null;

    const phone = place.nationalPhoneNumber || null;
    const website = place.websiteURI || null;
    return { ok: true, editorial, reviews, hours, phone, website };
  } catch (e) {
    // Say what broke. This catch used to swallow every failure identically, so
    // a bad field name, a referrer-rejected key and a quota wall all arrived as
    // the same silent `null` — the reason a total, deterministic outage looked
    // like ordinary missing data for as long as it did.
    //
    // The two failures worth recognising in the console:
    //   InvalidValueError  — our field list is wrong; nothing was requested.
    //   MapsRequestError   — the request went out and Google refused it
    //                        (key not valid / referrer / quota).
    try {
      console.error("[wf] fetchPlaceDetail FAILED", {
        placeId,
        name: e && e.name,
        message: e && e.message,
        code: (e && (e.code || e.status || e.statusCode)) || null,
      });
    } catch (e2) {}
    // Shaped like a success so callers never crash on it, but flagged so they
    // can tell a broken fetch from an empty place — and so nobody caches it.
    return { ok: false, error: { name: (e && e.name) || "Error", message: (e && e.message) || "" }, editorial: null, reviews: [], hours: null, phone: null, website: null, _resolved: true };
  }
}
