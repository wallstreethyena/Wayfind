// lib/landingInventory.js — landing lists read OWNED inventory first.
//
// Home chips after #955 are library-first. Landings were not: rankedFor()
// called Google Places searchText during SSR/SSG. That is (1) spend the owner
// forbade, (2) why Siesta /things-to-do ranked watersports and "Public Beach
// Access 5" instead of Ringling/Selby, (3) why 1200+ static pages hung on
// Vercel preview until SIGTERM.
//
// Identity-before-rank. If inventory returns rows, rankedFor must not call
// searchText. During `next build` / SSG, Places is never called — missing
// inventory env renders the editorial shell with an empty list.
//
// Ranking is never for sale. No affiliate, payout, or partner field here.
// This module is server-only. Do not import it from app/home.js.

import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { isPlaceOwnedPhotoUrl, photoRefOwnedByPlace } from "./placePhoto.js";

export const LANDING_INV_SPEC = {
  "things-to-do": { cat: "attractions", sub: "all" },
  restaurants: { cat: "food", sub: "all" },
  beaches: { cat: "beach", sub: "beaches" },
  nightlife: { cat: "nightlife", sub: "all" },
};

/** True only while `next build` is prerendering. ISR / runtime is false. */
export function isSsgBuild() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export function landingInvSpec(catSlug) {
  return LANDING_INV_SPEC[catSlug] || null;
}

/**
 * Places searchText / Place Details / photos are forbidden when inventory
 * already answered, or when we are prerendering. EXECUTE this — do not grep
 * rankedFor for the URL.
 */
export function placesCallsForbidden({ inventoryCount, build } = {}) {
  if (build === true || isSsgBuild()) return true;
  return Number(inventoryCount) > 0;
}

function landingName(p) {
  if (!p) return "";
  if (typeof p.name === "string") return p.name;
  if (p.displayName && typeof p.displayName.text === "string") return p.displayName.text;
  return "";
}

/** Google-shaped inventory row → the shape rankedFor already ranks. */
export function invPlaceToLanding(p) {
  if (!p) return null;
  const name = landingName(p);
  const id = p.id || p.place_id || null;
  if (!id || !name) return null;
  const lat = (p.location && p.location.latitude) != null ? p.location.latitude : p.lat;
  const lng = (p.location && p.location.longitude) != null ? p.location.longitude : p.lng;
  const rawRef = p.photoRef || p.photo_ref
    || (Array.isArray(p.photos) && p.photos[0] && (p.photos[0].name || p.photos[0].ref))
    || null;
  const photoRef = photoRefOwnedByPlace(rawRef, id) ? rawRef : null;
  const rawUrl = p.photo_url || p.photoUrl || null;
  const photo_url = isPlaceOwnedPhotoUrl(rawUrl) ? String(rawUrl) : null;
  return {
    id,
    name,
    rating: p.rating != null ? p.rating : null,
    reviews: p.userRatingCount != null ? p.userRatingCount : (p.reviews || 0),
    address: p.formattedAddress || p.address || "",
    types: Array.isArray(p.types) ? p.types : (p.google_types || []),
    status: p.businessStatus || p.status || null,
    lat,
    lng,
    priceLevel: p.priceLevel || null,
    // Owned library photo only. Never request Places photos to "enrich"
    // an inventory row. A neighbor's photo_ref / a Pexels URL is stripped.
    photoRef,
    photo_url,
    primaryType: p.primaryType || p.primary_type || null,
    category: p.category || null,
    _wfInventory: true,
  };
}

/**
 * Category identity for a landing list. Beaches are sit-on-sand.
 * A watersports operator is not a beach. Things-to-do is attractions.
 */
export function landingIdentityOk(catSlug, p, identityFn) {
  if (!p || !identityFn) return false;
  const shaped = {
    name: landingName(p),
    types: p.types || p.google_types || [],
    primaryType: p.primaryType || p.primary_type || null,
    primary_type: p.primary_type || p.primaryType || null,
    category: p.category || null,
  };
  if (catSlug === "beaches") return !!identityFn("beach", "beaches", shaped);
  if (catSlug === "things-to-do") return !!identityFn("attractions", "all", shaped);
  if (catSlug === "restaurants") return !!identityFn("food", "all", shaped);
  if (catSlug === "nightlife") return !!identityFn("nightlife", "all", shaped);
  return false;
}

/**
 * Fetch owned inventory for one landing city+category.
 * Returns [] when unconfigured, on error, or when the override supplies none.
 * Never calls places.googleapis.
 */
export async function fetchLandingInventory(catSlug, city, opts) {
  if (opts && Array.isArray(opts.inventoryRows)) {
    return opts.inventoryRows.map(invPlaceToLanding).filter(Boolean);
  }
  const spec = landingInvSpec(catSlug);
  if (!spec || !city || !isFinite(city.lat) || !isFinite(city.lng)) return [];
  const serve = (opts && typeof opts.serveFromInventory === "function")
    ? opts.serveFromInventory
    : (await import("./inventoryServe.js")).serveFromInventory;
  const n = Math.max(24, Number(opts && opts.limit) || 80);
  const tryAt = async (radiusM) => {
    try {
      const rows = await serve(spec.cat, city.lat, city.lng, radiusM, n, spec.sub);
      return Array.isArray(rows) ? rows.map(invPlaceToLanding).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const tight = await tryAt(27359);
  if (tight.length >= 8) return tight;
  const wide = await tryAt(48280);
  if (!wide.length) return tight;
  const seen = new Set(tight.map((p) => p.id));
  return [...tight, ...wide.filter((p) => !seen.has(p.id))];
}

/**
 * Shared fetch wrapper for guide SSG lookups. A hang is not an exception —
 * fetchDeadline turns it into one the caller already catches.
 */
export function guideFetch(input, init, ms) {
  return fetchDeadline(input, init, ms == null ? DB_DEADLINE_MS : ms);
}
