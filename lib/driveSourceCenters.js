// lib/driveSourceCenters.js — NON-INDEXED drive-source centres.
//
// WHAT THIS IS. A registry of centres whose OWNED inventory the Worth the
// Drive rail may read on behalf of a reader within DRIVE_REACH_MI of them.
// Nothing else. It exists because of one measured gap (poster audit,
// 2026-09-06): a Miami reader saw `pools.drive = 0`. buildDrivePool (lib/
// railsData.js) only reads the inventory of OTHER LANDING_CITIES within 27
// miles, and Miami has no other landing city inside 27 miles. Sarasota,
// Bradenton and Parrish work because they have neighbours; Miami had none.
//
// WHAT THIS IS NOT. It is NOT a landing city and NOT an SEO surface.
// LANDING_CITIES (lib/landing.js) is also the sitemap publication registry
// (app/sitemap.js enumerates `/${cat}/${city}` for every key). A
// drive-source centre and an indexable landing city are different concepts
// and must never share a registry by accident: adding a slug here emits ZERO
// sitemap URLs, ZERO landing routes, ZERO metro pools. When Fort Lauderdale
// or Homestead earn a public landing page, that is its own PR that clears
// content-quality and route checks on its own (handoff 2026-09-06, merge
// order step 6), and the slug is then simply dropped from here.
//
// COORDINATES ARE CANONICAL CIVIC CENTRES. Never move a centre to make a
// radius assertion pass. Homestead's civic centre is 26.96 mi from Miami's
// registered centre (25.7617, -80.1918) — inside DRIVE_REACH_MI (27) by a
// hair; that is the truth of the geography, and the regression test asserts
// it against the REAL registries so any drift of either centre is caught.
// Fort Lauderdale is 25.15 mi. Same row shape as a LANDING_CITIES entry so
// the centre-aware ranking path (rankedForCenter) treats both identically.
//
// Reads through here are owned-inventory only (`inventoryOnly: true`).
// This file must never grow a Google/Places call. It deliberately imports
// NOTHING from lib/landing.js (which drags JSX components in): the caller
// hands it the landing registry, so a plain-node guard can import this file
// directly and the dependency arrow only ever points from railsData here.

export const DRIVE_SOURCE_CENTERS = Object.freeze({
  "fort-lauderdale": Object.freeze({ name: "Fort Lauderdale", state: "FL", lat: 26.1224, lng: -80.1373 }),
  "homestead": Object.freeze({ name: "Homestead", state: "FL", lat: 25.4687, lng: -80.4776 }),
});

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function haversineMi(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

/**
 * The centres a reader at `origin` may borrow inventory from: the UNION of
 * other landing cities and drive-source centres whose centre lies within
 * `reachMi`, minus anything already pooled (`excludeSlugs`). A landing city
 * always wins a slug collision — a drive-only entry can never shadow an
 * indexed one. Pure; no I/O. Injectable registries keep the tests offline.
 *
 * @param {{ landingCities: object, driveCenters?: object }} registries —
 *   `landingCities` is REQUIRED (the caller owns that import); `driveCenters`
 *   defaults to DRIVE_SOURCE_CENTERS and may be `{}` to model the pre-Lane-B
 *   world (the red-test).
 * @returns {Array<{ slug: string, center: {name,state,lat,lng}, indexed: boolean }>}
 */
export function driveCentersWithin(origin, reachMi, excludeSlugs, registries) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const landing = registries && registries.landingCities;
  if (!landing || typeof landing !== "object") throw new Error("driveCentersWithin: registries.landingCities is required");
  const drive = registries.driveCenters || DRIVE_SOURCE_CENTERS;
  const skip = new Set(Array.isArray(excludeSlugs) ? excludeSlugs : []);
  const out = [];
  const taken = new Set();
  const consider = (slug, center, indexed) => {
    if (taken.has(slug)) return;
    // A landing slug owns its name even when it is already pooled (skipped):
    // a drive-only twin must never slip in behind it.
    taken.add(slug);
    if (skip.has(slug)) return;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    if (haversineMi(origin.lat, origin.lng, center.lat, center.lng) > reachMi) return;
    out.push({ slug, center, indexed });
  };
  for (const slug of Object.keys(landing)) consider(slug, landing[slug], true);
  for (const slug of Object.keys(drive)) consider(slug, drive[slug], false);
  return out;
}
