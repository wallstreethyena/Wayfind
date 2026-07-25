// lib/geoAreaTypes.js — is a geocoder result a PLACE-ON-THE-MAP (a city,
// neighborhood, zip) or a THING (a restaurant, an airport, a store)?
//
// Deliberately dependency-free so it is unit-testable in plain Node
// (scripts/test-city-search.mjs imports it directly). lib/google.js pulls the
// Maps JS loader and cannot be imported outside a browser, which is how the
// first version of this guard ended up asserting nothing at all.
//
// Why it matters: submitSearch (app/home.js) uses this to decide whether a
// query should RECENTER the whole app. Get it wrong and typing a city silently
// runs a business search instead, leaving the feed on the previous city.
export const GEO_AREA_TYPES = [
  "locality", "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "administrative_area_level_4",
  "postal_code", "country", "colloquial_area", "neighborhood",
  "sublocality", "sublocality_level_1", "political",
];

export function isAreaResult(types) {
  return Array.isArray(types) && types.some((t) => GEO_AREA_TYPES.includes(t));
}
