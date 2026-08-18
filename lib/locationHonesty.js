// lib/locationHonesty.js — the visitor's city is never guessed.
//
// THE BUGS THIS EXISTS FOR (2026-08-18):
//   • SSR HomeProof said "Near Sarasota right now" on every URL, including
//     /?near=Orlando and /?q=Orlando, because the homepage is one prerendered
//     document and the proof block hardcoded the flagship.
//   • An unknown rail slug, or /api/rails returning covered:false / error,
//     fail-opened to LANDING_CITIES.sarasota — so a Tampa search kept
//     Sarasota places and Sarasota distances.
//   • DEFAULT_CENTER (Parrish) was a real React state value, so
//     setCenter((prev) => prev || geo) could never replace the seed, and
//     chrome said "near you" with no named city.
//
// A city is named or it is not. There is no third state that is allowed to
// print "you", "near you", "around you", or a flagship town.

export const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };

const NOT_A_CITY = new Set([
  "",
  "you",
  "your area",
  "this area",
  "this map area",
  "near you",
  "around you",
]);

/** The map seed is a pin, not a visitor. Same coords after geo/GPS/manual are resolved. */
export function isSeedCenter(c) {
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return true;
  return Math.abs(c.lat - DEFAULT_CENTER.lat) < 1e-5 && Math.abs(c.lng - DEFAULT_CENTER.lng) < 1e-5;
}

/** A label the product may print as the visitor's city. */
export function isNamedCity(locName) {
  if (locName == null) return false;
  const raw = String(locName).trim();
  if (!raw) return false;
  const head = raw.split(",")[0].trim();
  if (!head) return false;
  if (NOT_A_CITY.has(head.toLowerCase()) || NOT_A_CITY.has(raw.toLowerCase())) return false;
  if (/^(near|around)\s+you\b/i.test(head)) return false;
  return /[a-z]/i.test(head);
}

/** First token of a real city name, or "". Never "you". */
export function cityLabel(locName) {
  if (!isNamedCity(locName)) return "";
  return String(locName).split(",")[0].trim();
}

/**
 * " near Tampa" or "". The only legal way to attach a location claim to a
 * phrase. Callers that interpolated "near you" when locName was empty use this.
 */
export function nearPhrase(locName) {
  const city = cityLabel(locName);
  return city ? ` near ${city}` : "";
}

/**
 * An unknown / missing LANDING_CITIES slug is not Sarasota. The flagship is
 * a market we cover, not the visitor's city.
 */
export function resolveRailCity(slug, landingCities) {
  if (!slug || typeof slug !== "string") return null;
  if (!landingCities || typeof landingCities !== "object") return null;
  return landingCities[slug] ? slug : null;
}

export function emptyRailLive() {
  return {
    places: {},
    thin: [],
    region: null,
    citySlug: null,
    cityLabel: "",
    covered: false,
  };
}

/**
 * /api/rails payload → client live state. covered:false, errors, and missing
 * data become an honest empty. They do not keep a previous city's places.
 */
export function liveFromRailsResponse(j) {
  if (!j || j.covered !== true || !j.data) return emptyRailLive();
  const d = j.data;
  return {
    places: d.places && typeof d.places === "object" ? d.places : {},
    thin: Array.isArray(d.thin) ? d.thin : [],
    region: d.region || null,
    citySlug: d.citySlug || null,
    cityLabel: d.cityLabel ? String(d.cityLabel) : "",
    covered: true,
  };
}

/**
 * The shared ISR homepage must not name a city in its proof block. ?near= and
 * ?q= cannot city-swap that document safely, so the heading is city-neutral
 * for every request — including /?near=Orlando and /?q=Orlando.
 */
export function homeProofCopy(_searchParams) {
  return {
    kicker: "What Wayfind answers with",
    heading: "A short ranked answer — not fifty options",
    sub: "Ranked by rating weighted by review volume, distance, and what's genuinely worth the time — no ads, no paid placement. The in-app answer adapts to the location on the page, the weather, and the time of day.",
  };
}

export function homeProofNamesCity(searchParams) {
  const copy = homeProofCopy(searchParams);
  return /\b(Sarasota|Orlando|Tampa|Parrish|Bradenton)\b/i.test(
    `${copy.kicker} ${copy.heading} ${copy.sub}`
  );
}
