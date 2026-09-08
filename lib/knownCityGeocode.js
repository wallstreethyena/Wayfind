import { LANDING_CITIES } from "./landingCities.js";

// Exact owned city identity without a provider call. Never match a business
// containing a city name or silently replace an explicitly different state.
export function knownCityGeocode(query) {
  if (typeof query !== "string") return null;
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  for (const city of Object.values(LANDING_CITIES)) {
    const name = city.name.toLowerCase();
    const state = city.state.toLowerCase();
    const stateName = state === "fl" ? "florida" : state === "hi" ? "hawaii" : state;
    const forms = [
      name,
      `${name}, ${state}`,
      `${name} ${state}`,
      `${name}, ${stateName}`,
      `${name} ${stateName}`,
      `${name}, ${state}, usa`,
      `${name}, ${stateName}, usa`,
    ];
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
