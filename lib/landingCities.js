// lib/landingCities.js — the ~21-town coordinate table, and NOTHING else.
//
// WHY THIS IS ITS OWN FILE (2026-09-06, cold-rail-cache investigation). This
// data used to live only inside lib/landing.js, which is explicitly
// "Server-only by design" (its own header says so) — it imports React
// components (DiscoveryPaths, TourStrip, PremiumIntentHero, IntentPartnerPick)
// and server-only modules (spendGate, insiderServer) at module scope, so
// pulling it into a client bundle is not safe.
//
// app/components/DaypartRail.js ("use client") needs exactly this table, for
// exactly one reason: to resolve the reader's nearest covered city ON THE
// CLIENT, from their EXACT coordinates, before any coordinate gets snapped for
// the /api/rails request. See DaypartRail.js's "WHY THE CITY IS RESOLVED HERE"
// comment for the full measurement — the short version is that /api/rails
// route.js's own nearestCity() is a pure function of (LANDING_CITIES, point),
// and the client can compute the identical answer itself instead of trusting
// a coordinate that is about to be rounded for CDN-cache-key reasons.
//
// This file has ZERO imports and ZERO React, so it is safe in both a server
// module graph and a client bundle. lib/landing.js re-exports LANDING_CITIES
// from here unchanged — every existing import of LANDING_CITIES from
// "./landing.js" or "../../../lib/landing" keeps working exactly as before.
// scripts/check-rails-geo-grid.mjs asserts the re-export stays byte-identical,
// so this split can never quietly fork into two different town tables.

// Home markets first (launch prompt 5); v5.04 adds the Hawaii markets.
export const LANDING_CITIES = {
  "parrish": { name: "Parrish", state: "FL", lat: 27.5859, lng: -82.4254 },
  "ellenton": { name: "Ellenton", state: "FL", lat: 27.5217, lng: -82.5273 },
  "palmetto": { name: "Palmetto", state: "FL", lat: 27.5214, lng: -82.5723 },
  "bradenton": { name: "Bradenton", state: "FL", lat: 27.4989, lng: -82.5748 },
  "sarasota": { name: "Sarasota", state: "FL", lat: 27.3364, lng: -82.5307 },
  "lakewood-ranch": { name: "Lakewood Ranch", state: "FL", lat: 27.4438, lng: -82.3929 },
  "anna-maria-island": { name: "Anna Maria Island", state: "FL", lat: 27.5309, lng: -82.734 },
  "cortez": { name: "Cortez", state: "FL", lat: 27.4689, lng: -82.6867 },
  "longboat-key": { name: "Longboat Key", state: "FL", lat: 27.4125, lng: -82.659 },
  "siesta-key": { name: "Siesta Key", state: "FL", lat: 27.2665, lng: -82.546 },
  "venice": { name: "Venice", state: "FL", lat: 27.0998, lng: -82.4543 },
  "tampa": { name: "Tampa", state: "FL", lat: 27.9506, lng: -82.4572 },
  "orlando": { name: "Orlando", state: "FL", lat: 28.5384, lng: -81.3789 },
  "miami": { name: "Miami", state: "FL", lat: 25.7617, lng: -80.1918 },
  // Hawaii — one anchor town per visitor coast: Oahu ×2, Maui ×2, Big Island ×2, Kauai ×2.
  "honolulu": { name: "Honolulu", state: "HI", lat: 21.3069, lng: -157.8583 },
  "kailua": { name: "Kailua", state: "HI", lat: 21.4022, lng: -157.7394 },
  "lahaina": { name: "Lahaina", state: "HI", lat: 20.8783, lng: -156.6825 },
  "kihei": { name: "Kihei", state: "HI", lat: 20.7644, lng: -156.445 },
  "kailua-kona": { name: "Kailua-Kona", state: "HI", lat: 19.64, lng: -155.9969 },
  "hilo": { name: "Hilo", state: "HI", lat: 19.7071, lng: -155.0885 },
  "lihue": { name: "Lihue", state: "HI", lat: 21.9811, lng: -159.3711 },
  "kapaa": { name: "Kapaa", state: "HI", lat: 22.075, lng: -159.319 },
};

// ── COVERED MARKETS (search, location, homepage feed) ──────────────────────
// LANDING_CITIES above is the PUBLISHED set: every key mints indexable
// /things-to-do, /restaurants, /beaches, /nightlife, /events and /florida
// pages, and is in the sitemap. Publishing a page is gated on page quality
// (photos, in-town counts), which is decided per page elsewhere.
//
// MARKET_CITIES is the COVERED set on top of it: the major Florida markets
// whose places are already in wf_inventory, so the search box can offer the
// city, the Location box can resolve it without a provider call, and the
// homepage feed ranks that city's own pool from owned inventory only
// (inventoryOnly — zero Google spend). A market here mints NO page and NO
// sitemap URL: every page route keeps reading LANDING_CITIES, and railHref
// emits a city link only for a published slug.
//
// Measured 2026-10-01 against live /api/search (16 generic queries, distinct
// places within 25 km): every market below returned >= 19 owned places, most
// at or above Tampa's own 60. Key West (3) is held until its inventory is
// scouted. Coordinates are the city centre.
export const MARKET_CITIES = {
  "st-petersburg": { name: "St. Petersburg", state: "FL", lat: 27.7676, lng: -82.6403 },
  "clearwater": { name: "Clearwater", state: "FL", lat: 27.9659, lng: -82.8001 },
  "lakeland": { name: "Lakeland", state: "FL", lat: 28.0395, lng: -81.9498 },
  "kissimmee": { name: "Kissimmee", state: "FL", lat: 28.2920, lng: -81.4076 },
  "fort-myers": { name: "Fort Myers", state: "FL", lat: 26.6406, lng: -81.8723 },
  "cape-coral": { name: "Cape Coral", state: "FL", lat: 26.5629, lng: -81.9495 },
  "naples": { name: "Naples", state: "FL", lat: 26.1420, lng: -81.7948 },
  "miami-beach": { name: "Miami Beach", state: "FL", lat: 25.7907, lng: -80.1300 },
  "hollywood": { name: "Hollywood", state: "FL", lat: 26.0112, lng: -80.1495 },
  "fort-lauderdale": { name: "Fort Lauderdale", state: "FL", lat: 26.1224, lng: -80.1373 },
  "boca-raton": { name: "Boca Raton", state: "FL", lat: 26.3683, lng: -80.1289 },
  "west-palm-beach": { name: "West Palm Beach", state: "FL", lat: 26.7153, lng: -80.0534 },
  "port-st-lucie": { name: "Port St. Lucie", state: "FL", lat: 27.2730, lng: -80.3582 },
  "melbourne": { name: "Melbourne", state: "FL", lat: 28.0836, lng: -80.6081 },
  "daytona-beach": { name: "Daytona Beach", state: "FL", lat: 29.2108, lng: -81.0228 },
  "st-augustine": { name: "St. Augustine", state: "FL", lat: 29.8948, lng: -81.3145 },
  "jacksonville": { name: "Jacksonville", state: "FL", lat: 30.3322, lng: -81.6557 },
  "gainesville": { name: "Gainesville", state: "FL", lat: 29.6516, lng: -82.3248 },
  "ocala": { name: "Ocala", state: "FL", lat: 29.1872, lng: -82.1401 },
  "tallahassee": { name: "Tallahassee", state: "FL", lat: 30.4383, lng: -84.2807 },
  "panama-city-beach": { name: "Panama City Beach", state: "FL", lat: 30.1766, lng: -85.8055 },
  "destin": { name: "Destin", state: "FL", lat: 30.3935, lng: -86.4958 },
  "pensacola": { name: "Pensacola", state: "FL", lat: 30.4213, lng: -87.2169 },
};

/** Published + covered. The table search, geocode and the homepage feed read. */
export const COVERED_CITIES = { ...LANDING_CITIES, ...MARKET_CITIES };

// What people actually type. Lowercase, punctuation-free (matched against
// normalizeCityText output). An alias is a whole-name form, so it is matched
// exactly like a city name: prefix while typing, exact for a submitted city.
export const CITY_ALIASES = {
  "st-petersburg": ["st pete", "saint pete", "saint petersburg"],
  "fort-myers": ["ft myers"],
  "fort-lauderdale": ["ft lauderdale"],
  "port-st-lucie": ["port saint lucie", "psl"],
  "st-augustine": ["saint augustine"],
  "west-palm-beach": ["west palm", "wpb"],
  "daytona-beach": ["daytona"],
  "panama-city-beach": ["pcb"],
  "jacksonville": ["jax"],
  "miami-beach": ["south beach"],
};

/** Lowercase, drop periods/apostrophes, commas → spaces, collapse whitespace. */
export function normalizeCityText(value) {
  return String(value || "").toLowerCase().replace(/[.'’]/g, "").replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
}

/** Every whole-name form a covered city answers to: its name and its aliases. */
export function cityNameForms(slug) {
  const city = COVERED_CITIES[slug];
  if (!city) return [];
  return [normalizeCityText(city.name), ...(CITY_ALIASES[slug] || [])];
}
