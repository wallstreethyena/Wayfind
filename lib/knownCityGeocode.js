import { COVERED_CITIES, cityNameForms, normalizeCityText } from "./landingCities.js";

// Exact owned city identity without a provider call. Never match a business
// containing a city name or silently replace an explicitly different state.
// Covered markets resolve by name or alias ("st pete, fl" → St. Petersburg).
export function knownCityGeocode(query) {
  if (typeof query !== "string") return null;
  const normalized = normalizeCityText(query);
  if (!normalized) return null;
  for (const [slug, city] of Object.entries(COVERED_CITIES)) {
    const state = city.state.toLowerCase();
    const stateName = state === "fl" ? "florida" : state === "hi" ? "hawaii" : state;
    const forms = cityNameForms(slug).flatMap((name) => [
      name,
      `${name} ${state}`,
      `${name} ${stateName}`,
      `${name} ${state} usa`,
      `${name} ${stateName} usa`,
    ]);
    if (forms.includes(normalized)) {
      return {
        name: `${city.name}, ${city.state}, USA`,
        lat: city.lat,
        lng: city.lng,
        types: ["locality", "political"],
        isArea: true,
      };
    }
  }
  return null;
}
