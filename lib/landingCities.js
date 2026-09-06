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
