// lib/nearMeQuery.js — ONE eligibility/ranking query for home, map, and list.
//
// THE BUG (WF-004, 2026-08-18): Shopping → All on the homepage produced no
// organic results in the same session that map Shopping → All showed 15
// ranked places. Home's nav tab opened the submenu but did not start the
// near-me search (map's onCat does). Stays → All on home was empty except a
// national car-rental affiliate — empty organic papered over with an
// unrelated offer.
//
// Home browse, the map, and the explore list already share `cat`/`sub`/
// `center`/`places`/`view`. This object is that shared query, so a future
// surface cannot invent a second radius, a Sarasota fill, or a different
// category key. Null means fail-closed: no center, no search.
//
// Radius default is the same 17-mile number as lib/google.js DEFAULT_RADIUS_M
// (27359). This file does not import google.js — that module is client-only
// and pulls extensionless paths a node guard cannot resolve.

export const NEAR_ME_DEFAULT_RADIUS_M = 27359;

export function hasSearchCenter(center) {
  return !!(center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng)));
}

/**
 * Shared near-me query. Returns null when there is no real center — never a
 * flagship/seed fill (Parrish 27.5689 / Sarasota).
 */
export function nearMeQuery({ cat, sub, vibe, center, radiusM } = {}) {
  if (!hasSearchCenter(center)) return null;
  if (!cat) return null;
  const r = Number(radiusM);
  return Object.freeze({
    cat: String(cat),
    sub: sub && String(sub) !== "all" ? String(sub) : "all",
    vibe: vibe && String(vibe) !== "all" ? String(vibe) : "all",
    lat: Number(center.lat),
    lng: Number(center.lng),
    radiusM: Number.isFinite(r) && r > 0 ? r : NEAR_ME_DEFAULT_RADIUS_M,
  });
}

export function queryKey(q) {
  if (!q) return "";
  return [q.cat, q.sub, q.vibe, q.lat.toFixed(4), q.lng.toFixed(4), String(q.radiusM)].join("|");
}

/**
 * Home "All" (browseCat === null) is the mixed discovery feed, not a
 * seventh category. The map has no All tile — it always searches a category.
 * That difference is intentional and tested; do not invent an All query
 * that would silently become food or Sarasota.
 */
export const HOME_ALL_IS_DISCOVERY = true;
