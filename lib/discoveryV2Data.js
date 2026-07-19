// lib/discoveryV2Data.js — the inventory→card adapter for Discovery v2.
//
// `/api/places/search` answers in the Google Places wire shape
// (`displayName.text`, `photos[].name`, `location.latitude`). Every card
// surface wants the app shape (`name`, `photo`, `wfScore`, `distMi`). home.js
// does this inline at its inventory fetch; this module is the same mapping in
// one testable place so the v2 surfaces cannot drift from it silently.
//
// PURE ON PURPOSE — no imports. `lib/google.js` owns the canonical
// `wayfindScore`/`distMeters`, but it is a "use client" module that constructs
// the Google Maps JS loader, so importing it here would drag the SDK into any
// server render. Instead the formulas are mirrored below and
// scripts/test-discovery-v2-data.mjs pins them to lib/google.js (constants and
// output table both), so drift fails the prebuild instead of shipping.

/** Bayesian (IMDB-style) mean — mirrors lib/google.js `wayfindScore`.
 *  Returns null for an absent rating: a null base score must STAY null so the
 *  UI shows "Score pending". Coercing to 0 renders a fake 0.1/10 red badge. */
export function bayesScore(rating, reviews) {
  if (!rating) return null;
  const m = 60;
  const C = 3.9;
  const v = reviews || 0;
  return Math.round((((v / (v + m)) * rating + (m / (v + m)) * C) / 5) * 100);
}

/** Great-circle metres — mirrors lib/google.js `distMeters`. */
export function haversineMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function photoHref(ref, w = 640) {
  return ref ? `/api/photo?ref=${encodeURIComponent(ref)}&w=${w}` : null;
}

/** One wire row -> one card-shaped place. Returns null for anything unusable
 *  (no name), so callers can `.filter(Boolean)` and never render a blank card —
 *  the same gate scripts/test-card-gate.mjs enforces elsewhere. */
export function invPlaceToCard(x, center) {
  if (!x) return null;
  // Already app-shaped (the API mixes cached app-shape rows into inventory
  // responses). Pass it through rather than re-deriving a worse version.
  if (x.name && !x.displayName) return x.name ? x : null;

  const lat = x.location && x.location.latitude;
  const lng = x.location && x.location.longitude;
  const ref = x.photos && x.photos[0] && x.photos[0].name;
  const rating = typeof x.rating === "number" ? x.rating : null;
  const name = (x.displayName && x.displayName.text) || x.name || "";
  if (!name) return null;

  return {
    id: x.id,
    name,
    lat: lat != null ? lat : null,
    lng: lng != null ? lng : null,
    distMi: lat != null && center ? haversineMeters(center, { lat, lng }) / 1609.34 : null,
    rating,
    reviews: x.userRatingCount || 0,
    wfScore: bayesScore(rating || 0, x.userRatingCount || 0),
    types: Array.isArray(x.types) ? x.types : [],
    photo: photoHref(ref),
    editorial: (x.editorialSummary && x.editorialSummary.text) || null,
    openNow: null,
    businessStatus: x.businessStatus || "OPERATIONAL",
    _wfInventory: true,
  };
}

export function invPlacesToCards(rows, center) {
  return (Array.isArray(rows) ? rows : [])
    .map((x) => invPlaceToCard(x, center))
    .filter(Boolean);
}

/** The read URL for a category. Kept here so the v2 surfaces issue exactly the
 *  request home.js does — `inv=1` is what keeps this on owned inventory and off
 *  the metered Google path (see lib/inventoryServe.js + the cost gate). */
export function categorySearchUrl({ cat, lat, lng, radiusM = 27359, n = 40 }) {
  const q = new URLSearchParams({
    q: "inventory",
    lat: Number(lat).toFixed(4),
    lng: Number(lng).toFixed(4),
    radius: String(Math.round(radiusM)),
    n: String(n),
    cat: String(cat || ""),
    inv: "1",
  });
  return `/api/places/search?${q.toString()}`;
}
