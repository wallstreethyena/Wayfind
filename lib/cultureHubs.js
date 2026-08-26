// lib/cultureHubs.js — SEO slugs for /florida/{town} hubs.
//
// Lives in its own file so the homepage client (app/home.js → lib/culture.js)
// does not ship destination-hub slugs. Those pages are server-rendered.
// Do not re-export this from lib/culture.js — `import * as Culture` would
// pull it back into the "/" JS ratchet.

export const TOWN_HUBS = {
  "parrish": "parrish",
  "bradenton": "bradenton",
  "palmetto": "palmetto",
  "ellenton": "ellenton",
  "lakewood ranch": "lakewood-ranch",
  "anna maria island": "anna-maria-island",
  "cortez": "cortez",
  "longboat key": "longboat-key",
  "siesta key": "siesta-key",
  "venice": "venice",
};
