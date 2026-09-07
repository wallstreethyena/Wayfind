import { LANDING_CITIES } from './landingCities.js';

// Exact owned city identity before any external geocoder. Never match a business
// containing a city name, or silently replace an explicitly different state.
export function knownCityGeocode(query) {
  if (typeof query !== 'string') return null;
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const c of Object.values(LANDING_CITIES)) {
    const name = c.name.toLowerCase();
    const state = c.state.toLowerCase();
    const stateName = state === 'fl' ? 'florida' : state === 'hi' ? 'hawaii' : state;
    const forms = [name, `${name}, ${state}`, `${name} ${state}`, `${name}, ${stateName}`, `${name} ${stateName}`, `${name}, ${state}, usa`, `${name}, ${stateName}, usa`];
    if (forms.includes(normalized)) return { name: `${c.name}, ${c.state}, USA`, lat: c.lat, lng: c.lng, types: ['locality', 'political'], isArea: true };
  }
  return null;
}

export async function geocodeKnownCityFirst(query, externalGeocode) {
  const known = knownCityGeocode(query);
  if (known) return known;
  return externalGeocode(query);
}
