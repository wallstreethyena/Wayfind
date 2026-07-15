// lib/destinations.js — Wayfind market → affiliate destination map (v6.28).
//
// Affiliate catalogs are organized by DESTINATION, not lat/lng. To surface
// bookable inventory (rails + Book-it wraps) in a city, we need each network's
// destination id for it. This is the addressing layer that lets the whole
// monetization stack target Orlando / Tampa / St. Pete, not just Sarasota.
//
// Additive/config only — no UI, no ranking. Feeds the affiliate link builders
// (withViatorTracking, tpDeepLink) and the future Experiences-rail queries.
//
// IDs VERIFIED live 2026-07-15:
//   Viator  Sarasota d25738 · Tampa d666 · St. Petersburg d5403 · Orlando d663
//   Tiqets  Tampa c79946 · Orlando c79889   (Sarasota/St-Pete fold into Tampa Bay)
//   Klook   Tampa c365387 · Orlando c700841 (St-Pete has no separate Klook city)
// Where a network has no city id, `null` + a search fallback keeps links working.

const V = (city, id) => `https://www.viator.com/${city}/${id}-ttd`;
const TIQETS = (id) => (id ? `https://www.tiqets.com/en/attractions-${id}/` : null);
const KLOOK = (id, slug) => (id ? `https://www.klook.com/en-US/destination/${id}-${slug}/` : null);
const viatorSearch = (q) => `https://www.viator.com/searchResults/all?text=${encodeURIComponent(q)}`;
const tiqetsSearch = (q) => `https://www.tiqets.com/en/search/?q=${encodeURIComponent(q)}`;

// Each market: display label, approx center (to snap a user's location to the
// nearest market), and per-network { id, url }. url is the destination landing
// page the affiliate link wraps; when id is null we fall back to a search URL.
export const MARKETS = {
  sarasota: {
    label: "Sarasota", lat: 27.336, lng: -82.531,
    viator: { id: "d25738", url: V("Sarasota", "d25738") },
    tiqets: { id: null, url: tiqetsSearch("Sarasota") },
    klook: { id: null, url: null },
  },
  bradenton: {
    label: "Bradenton", lat: 27.498, lng: -82.575,
    // Bradenton/Anna Maria fold into Viator's Sarasota metro.
    viator: { id: "d25738", url: V("Sarasota", "d25738") },
    tiqets: { id: null, url: tiqetsSearch("Bradenton") },
    klook: { id: null, url: null },
  },
  tampa: {
    label: "Tampa", lat: 27.947, lng: -82.459,
    viator: { id: "d666", url: V("Tampa", "d666") },
    tiqets: { id: "c79946", url: "https://www.tiqets.com/en/tampa-attractions-c79946/" },
    klook: { id: "c365387", url: KLOOK("c365387", "tampa") },
  },
  stpete: {
    label: "St. Petersburg", lat: 27.767, lng: -82.640,
    viator: { id: "d5403", url: V("St-Petersburg", "d5403") },
    tiqets: { id: null, url: tiqetsSearch("St Petersburg Florida") }, // Dalí etc. exist; no city id
    klook: { id: null, url: null }, // folds into Tampa Bay
  },
  clearwater: {
    label: "Clearwater", lat: 27.978, lng: -82.800,
    viator: { id: "d5403", url: V("St-Petersburg", "d5403") }, // St-Pete/Clearwater share d5403
    tiqets: { id: null, url: tiqetsSearch("Clearwater Florida") },
    klook: { id: null, url: null },
  },
  orlando: {
    label: "Orlando", lat: 28.538, lng: -81.379,
    viator: { id: "d663", url: V("Orlando", "d663") },
    tiqets: { id: "c79889", url: "https://www.tiqets.com/en/orlando-attractions-c79889/" },
    klook: { id: "c700841", url: KLOOK("c700841", "orlando") },
  },

  // ── National expansion markets (top US tourism states/cities) ─────────────
  // Covers the top tourism states — FL (above), CA, NY, NV, HI, IL, LA, DC,
  // TN, TX — so organic growth is monetizable on day one. Viator ids marked
  // VERIFIED were confirmed against live viator.com URLs (2026-07-15); the
  // rest ship with id:null → the tracked SEARCH fallback (needs no id, still
  // pays via cookie attribution). Fill ids as they're verified — the weekly
  // audit lists them. Tiqets/Klook city ids for these markets: search fallback
  // until verified.
  miami: {
    label: "Miami", lat: 25.762, lng: -80.192,
    viator: { id: "d662", url: V("Miami", "d662") }, // VERIFIED
    tiqets: { id: null, url: tiqetsSearch("Miami") },
    klook: { id: null, url: null },
  },
  nyc: {
    label: "New York City", lat: 40.713, lng: -74.006,
    viator: { id: "d687", url: V("New-York-City", "d687") }, // VERIFIED
    tiqets: { id: null, url: tiqetsSearch("New York") },
    klook: { id: null, url: null },
  },
  lasvegas: {
    label: "Las Vegas", lat: 36.170, lng: -115.140,
    viator: { id: "d684", url: V("Las-Vegas", "d684") }, // VERIFIED
    tiqets: { id: null, url: tiqetsSearch("Las Vegas") },
    klook: { id: null, url: null },
  },
  neworleans: {
    label: "New Orleans", lat: 29.951, lng: -90.072,
    viator: { id: "d675", url: V("New-Orleans", "d675") }, // VERIFIED
    tiqets: { id: null, url: tiqetsSearch("New Orleans") },
    klook: { id: null, url: null },
  },
  oahu: {
    label: "Oahu / Honolulu", lat: 21.307, lng: -157.858,
    viator: { id: "d672", url: V("Oahu", "d672") }, // VERIFIED (Honolulu proper: d59070)
    tiqets: { id: null, url: tiqetsSearch("Oahu Honolulu") },
    klook: { id: null, url: null },
  },
  losangeles: {
    label: "Los Angeles", lat: 34.052, lng: -118.244,
    viator: { id: null, url: viatorSearch("Los Angeles tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("Los Angeles") },
    klook: { id: null, url: null },
  },
  sanfrancisco: {
    label: "San Francisco", lat: 37.775, lng: -122.419,
    viator: { id: null, url: viatorSearch("San Francisco tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("San Francisco") },
    klook: { id: null, url: null },
  },
  sandiego: {
    label: "San Diego", lat: 32.716, lng: -117.161,
    viator: { id: null, url: viatorSearch("San Diego tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("San Diego") },
    klook: { id: null, url: null },
  },
  chicago: {
    label: "Chicago", lat: 41.878, lng: -87.630,
    viator: { id: null, url: viatorSearch("Chicago tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("Chicago") },
    klook: { id: null, url: null },
  },
  washingtondc: {
    label: "Washington, DC", lat: 38.907, lng: -77.037,
    viator: { id: null, url: viatorSearch("Washington DC tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("Washington DC") },
    klook: { id: null, url: null },
  },
  nashville: {
    label: "Nashville", lat: 36.163, lng: -86.781,
    viator: { id: null, url: viatorSearch("Nashville tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("Nashville") },
    klook: { id: null, url: null },
  },
  sanantonio: {
    label: "San Antonio", lat: 29.425, lng: -98.494,
    viator: { id: null, url: viatorSearch("San Antonio tours") }, // id TBV
    tiqets: { id: null, url: tiqetsSearch("San Antonio") },
    klook: { id: null, url: null },
  },
};

export const MARKET_KEYS = Object.keys(MARKETS);

// Haversine miles between two coords.
function _miles(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Snap a user's location to the nearest supported market (within maxMi), or null. */
export function marketForLocation(lat, lng, maxMi = 90) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  let best = null;
  for (const key of MARKET_KEYS) {
    const m = MARKETS[key];
    const mi = _miles(lat, lng, m.lat, m.lng);
    if (mi <= maxMi && (!best || mi < best.mi)) best = { key, mi: Math.round(mi * 10) / 10 };
  }
  return best;
}

/** The affiliate destination landing URL for (network, market), or a search
 *  fallback, or null. This is what the tracked link (Viator/tp) wraps. */
export function destinationUrl(network, marketKey) {
  const m = MARKETS[marketKey];
  if (!m || !m[network]) return null;
  return m[network].url || null;
}

/** True when a network has a real (non-search) destination id for a market. */
export function hasNativeDestination(network, marketKey) {
  const m = MARKETS[marketKey];
  return !!(m && m[network] && m[network].id);
}

/** All markets a network can target natively — coverage snapshot for owners. */
export function coverage(network) {
  return MARKET_KEYS.filter((k) => hasNativeDestination(network, k));
}
