// lib/placeCity.js — the city of a place, as a PURE module with ZERO imports.
//
// WHY ITS OWN FILE. cityOf() used to live in lib/placeData.js, where
// scripts/check-hero-card.mjs had to extract its SOURCE TEXT with a regex and
// eval it (`new Function(...)`) to test it: placeData.js imports `react` and
// Next-only modules, so a plain-node guard cannot import it. The same wall
// blocked lib/placeSchema.js — which must stay importable under plain node for
// scripts/check-no-third-party-rating-schema.mjs — from reusing the city logic,
// and that is how the LocalBusiness address drifted (see placeSchema.js).
//
// Keeping this file import-free is the point: both guards now IMPORT AND CALL
// these functions instead of regex-extracting them. Do not add an import here.

// The CITY a formatted address names — never a street line, never a ZIP.
//
// THE BUG THIS FIXES. The old parser always took parts[length - 2]: for the
// common 4-segment US shape "123 Main St, Bradenton, FL 34205, USA" that is
// index 2 — "FL 34205" — so every title built from a full street address
// carried a ZIP code ("Name — FL 34205 | Wayfind") instead of a city.
//
// MIRRORS lib/locationHonesty.js's localityFromFormattedAddress() (same "US
// shape" scan: find the "ST[ ZIP]" segment, take the segment before it). Keep
// the two algorithms in sync by hand if either one changes.
export function cityOf(address) {
  if (!address) return null;
  const parts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (!m) continue;
    const city = parts[i - 1];
    if (city && !/\d/.test(city) && city.length <= 40) return city;
    break; // a matched-but-invalid "city" segment: fall through, don't keep scanning
  }
  // Non-US / unrecognized shape: fall back to the nearest comma-separated
  // segment that doesn't look like a street line or a ZIP (no digits), so a
  // ZIP/street can never win even when the "ST[ ZIP]" shape above found
  // nothing usable.
  // "street, city" (two segments, no state or country): the city is last.
  if (parts.length === 2 && !/\d/.test(parts[1]) && parts[1].length <= 40) return parts[1];
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] && !/\d/.test(parts[i]) && parts[i].length <= 40) return parts[i];
  }
  // A lone segment is only a city when it reads like one. Atlas-590 carries
  // street-only addresses ("6100 N LOCKWOOD RIDGE RD"); returning that put a
  // street in the <title>. No city beats a wrong one.
  const only = parts[0] || null;
  return only && !/\d/.test(only) && only.length <= 40 ? only : null;
}

// A STATE or a country is not a city. GUIDES regions are mostly real place
// names ("Bradenton", "Key West", "Tampa Bay"), but the statewide guides carry
// `region: "Florida"` and that rung reached the page AS a city: prod served
// "Disney Springs in Florida | Wayfind" and a LocalBusiness
// `addressLocality: "Florida"` — the state sitting in the city field.
// Measured 2026-10-30 against the live sitemap: 4 of a 223-page sample.
const NOT_A_CITY = new Set(["florida", "fl", "usa", "us", "united states", "u.s.", "u.s.a."]);

export function notAState(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s && !NOT_A_CITY.has(s.toLowerCase()) ? s : null;
}

/**
 * The city for a merged place — the <title>'s "in {city}", the OG hero's
 * `loc`, and the LocalBusiness `addressLocality`.
 *
 * Rungs, strongest first:
 *   1. cityOf(p.address)   — parsed from a real Google/Atlas address
 *   2. p.inventoryCity     — wf_inventory.locality, a municipality we hold
 *                            already (NOT wf_inventory.metro, which is a
 *                            routing bucket: "florida", "manatee-sarasota")
 *   3. p.guideCity         — the GUIDES pick's city, else its guide region
 *
 * Null when nothing truthful is held. No city beats a wrong one — the same
 * rule cityOf() already applies to a street-only address.
 */
export function placeCityLabel(p) {
  if (!p) return null;
  return cityOf(p.address) || notAState(p.inventoryCity) || notAState(p.guideCity) || null;
}
