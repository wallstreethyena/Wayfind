// scripts/lib/synthetic/fixtures.mjs — stable, real fixtures shared across
// scenarios. No network, no process.env — just constants.

// Siesta Beach — the same stable, real place id tests/e2e/shell-route-contract.spec.js
// already anchors on (27,786 reviews, the most-reviewed row in the inventory).
export const STABLE_PLACE_ID = "ChIJh8tXh-FBw4gR9kFzfZN_g60";

// lib/landing.js LANDING_CITIES — Wayfind's home metro and a metro ~230mi away,
// used by the location-behavior scenario to prove lat/lng genuinely changes
// what gets served rather than a hardcoded pool.
export const SARASOTA = Object.freeze({ city: "Sarasota, FL", lat: 27.3364, lng: -82.5307 });
export const ORLANDO = Object.freeze({ city: "Orlando, FL", lat: 28.5384, lng: -81.3789 });
