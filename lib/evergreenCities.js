// lib/evergreenCities.js — landing-page-ONLY cities, published per category.
//
// WHY THIS IS NOT LANDING_CITIES (2026-09-30). LANDING_CITIES
// (lib/landingCities.js) is far more than a landing registry: /api/rails picks
// a reader's city from it, DaypartRail resolves coverage from it, the drive
// pool reads it, and — the expensive one — lib/photoSurfaces.js
// landingCityList() walks it for the photo-warm cron (lib/photoWarm.js), which
// BUYS missing Google photos several times an hour. Adding a town there adds
// it to every one of those, including a new paid photo walk.
//
// These five towns already clear the landing quality bar from OWNED inventory
// alone (>= 8 ranked places in the tight radius, lib/landingInventory.js) for
// the categories listed below, and nothing else. So they get evergreen
// landing pages and sitemap rows, and nothing more:
//
//   - pages rank from owned wf_inventory ONLY — no Places Text Search
//     fallback, no nightlife district census, no insider generation
//     (lib/landing.js landingRanked / LandingPage);
//   - card photos are requested with `nospend=1`, which /api/photo treats as
//     a probe: cache / inventory / same-place / free-licensed only, never a
//     ledger grant, never a Google fetch — otherwise the card's own monogram;
//   - NOT walked by photo-warm or any other cron, NOT in /api/rails, NOT in
//     /events/<city>/<window> (that route fans out to live, partly metered
//     event providers per new geo).
//
// A pair that does not clear the bar is WITHHELD: no generateStaticParams
// row (dynamicParams=false → 404), no sitemap row. Promote it by moving the
// category into `cats` once inventory is good enough — never by adding the
// town to LANDING_CITIES.
//
// scripts/check-evergreen-landing-zero-spend.mjs locks the exact membership,
// the zero-spend render (by CALL, with a positive control) and the fact that
// nothing but the landing layer imports this file.
//
// ZERO imports, like lib/landingCities.js, so it is safe anywhere.

const row = (name, lat, lng, cats) => Object.freeze({ name, state: "FL", lat, lng, cats: Object.freeze(cats) });

export const EVERGREEN_CITIES = Object.freeze({
  "st-petersburg": row("St. Petersburg", 27.7676, -82.6403, ["things-to-do", "restaurants", "beaches", "nightlife"]),
  "naples": row("Naples", 26.142, -81.7948, ["things-to-do", "restaurants", "nightlife"]),
  "fort-myers": row("Fort Myers", 26.6406, -81.8723, ["things-to-do", "restaurants"]),
  "jacksonville": row("Jacksonville", 30.3322, -81.6557, ["things-to-do", "restaurants", "nightlife"]),
  "st-augustine": row("St. Augustine", 29.8946, -81.3145, ["things-to-do", "restaurants", "nightlife"]),
});

// Measured below the bar — kept here so the guard can prove each one is
// absent everywhere, not merely unlisted.
export const EVERGREEN_WITHHELD = Object.freeze({
  "naples": Object.freeze(["beaches"]),
  "fort-myers": Object.freeze(["beaches", "nightlife"]),
  "jacksonville": Object.freeze(["beaches"]),
  "st-augustine": Object.freeze(["beaches"]),
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** The city row ({name,state,lat,lng}) when this cat × city is published, else null. */
export function evergreenCityFor(catSlug, citySlug) {
  if (!own(EVERGREEN_CITIES, citySlug)) return null;
  const c = EVERGREEN_CITIES[citySlug];
  if (!c.cats.includes(catSlug)) return null;
  return { name: c.name, state: c.state, lat: c.lat, lng: c.lng };
}

export function isEvergreenCity(citySlug) {
  return own(EVERGREEN_CITIES, citySlug);
}

/** Published evergreen city slugs for one category, in table order. */
export function evergreenSlugsFor(catSlug) {
  return Object.keys(EVERGREEN_CITIES).filter((s) => EVERGREEN_CITIES[s].cats.includes(catSlug));
}

/** Every published [catSlug, citySlug] pair. */
export function evergreenPairs() {
  return Object.keys(EVERGREEN_CITIES).flatMap((s) => EVERGREEN_CITIES[s].cats.map((c) => [c, s]));
}
