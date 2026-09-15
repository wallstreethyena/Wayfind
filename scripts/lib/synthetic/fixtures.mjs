// scripts/lib/synthetic/fixtures.mjs — stable, real fixtures shared across
// scenarios. No network, no process.env — just constants.

// Siesta Beach — the same stable, real place id tests/e2e/shell-route-contract.spec.js
// already anchors on (27,786 reviews, the most-reviewed row in the inventory).
export const STABLE_PLACE_ID = "ChIJh8tXh-FBw4gR9kFzfZN_g60";

// lib/landing.js LANDING_CITIES — Wayfind's home metro and a metro ~230mi away,
// used by the location-behavior scenario to prove lat/lng genuinely changes
// what gets served rather than a hardcoded pool.
export const SARASOTA = Object.freeze({ city: "Sarasota, FL", citySlug: "sarasota", lat: 27.3364, lng: -82.5307 });
export const ORLANDO = Object.freeze({ city: "Orlando, FL", citySlug: "orlando", lat: 28.5384, lng: -81.3789 });

// DEFAULT_CENTER in lib/locationHonesty.js — the homepage first-paint rails
// origin. menu-poster-integrity must grant THIS point (not Sarasota) or the
// first captured /api/rails is Parrish and the rendered cards are Sarasota.
export const PARRISH = Object.freeze({ city: "Parrish, FL", citySlug: "parrish", lat: 27.5689, lng: -82.4393 });

// Locked identity: Parrish coffee_shop on the breakfast poster's café rail
// and Food → Coffee, never lunch. 2026-09-14 founder report + synthetic
// missingIds on run 34835432197.
export const RYANS_COFFEE_HOUSE = Object.freeze({
  placeId: "ChIJo_IdHf0lw4gRHDbQNKBRE84",
  name: "Ryan's Coffee House",
  city: "Parrish",
  primaryType: "coffee_shop",
});

/** Same 0.01° snap DaypartRail uses on /api/rails lat/lng. */
export function snapRailCoord(value) {
  return Math.round(Number(value) * 100) / 100;
}
