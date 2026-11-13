// lib/plannerLocalInventory.js — SERVER-ONLY local first-party inventory
// reader for Wayfind Planner (`app/api/planner/route.js`).
//
// Ensures `/api/planner` always has grounded, verified Wayfind places and
// seasonal events even when Supabase `wf_events` or `wf_inventory` is
// temporarily unreachable or unconfigured (e.g. offline CI / degraded mode),
// without ever inventing venues, dates, or prices.
//
// Never import this module from any `"use client"` component.

import { readFileSync } from "node:fs";
import { CHRISTMAS_PUBLISHED_RESEARCH } from "./christmasResearch.js";
import { parseCityState } from "./trips.js";

const ATLAS_URL = new URL("../data/atlas/editorial-cards.json", import.meta.url);

const KNOWN_FL_CITIES = [
  "North Redington Beach",
  "Warm Mineral Springs",
  "Lake Buena Vista",
  "Altamonte Springs",
  "Fort Lauderdale",
  "West Palm Beach",
  "Bradenton Beach",
  "University Park",
  "Waterside Place",
  "Lakewood Ranch",
  "St. Petersburg",
  "St Petersburg",
  "St. Pete Beach",
  "St Pete Beach",
  "St. Augustine",
  "Wesley Chapel",
  "Holmes Beach",
  "Longboat Key",
  "Jacksonville",
  "Coral Gables",
  "Winter Park",
  "Miami Beach",
  "Myakka City",
  "Celebration",
  "Siesta Key",
  "Fort Myers",
  "North Port",
  "Anna Maria",
  "Clearwater",
  "Mount Dora",
  "Kissimmee",
  "Bradenton",
  "Sarasota",
  "Key West",
  "Palmetto",
  "Ellenton",
  "Orlando",
  "Parrish",
  "Nokomis",
  "Sanford",
  "Dunedin",
  "Brandon",
  "Venice",
  "Naples",
  "Osprey",
  "Cortez",
  "Duette",
  "Tampa",
  "Miami",
  "Largo",
];

export function inferFloridaCityFromAddress(address = "") {
  const addr = String(address || "").trim();
  if (!addr) return null;
  const parsed = parseCityState({ address: addr });
  if (parsed && parsed.city) return parsed.city;

  for (const city of KNOWN_FL_CITIES) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`(?:^|[,\\s.])${escaped}(?=\\s*,\\s*(?:FL|Florida)\\b|\\s*$)`, "i");
    if (rx.test(addr)) return city;
  }

  const generic = /,\s*([A-Za-z .'-]{2,32})\s*,\s*(?:FL|Florida)\b/i.exec(addr);
  if (generic) return generic[1].trim();
  return null;
}

let cachedAtlasRows = null;

function loadAtlasPlaces() {
  if (cachedAtlasRows) return cachedAtlasRows;
  try {
    const raw = JSON.parse(readFileSync(ATLAS_URL, "utf8"));
    if (!Array.isArray(raw)) {
      cachedAtlasRows = [];
      return cachedAtlasRows;
    }
    cachedAtlasRows = raw
      .filter((row) => row && row.placeId && row.name)
      .map((row) => {
        const address = String(row.address || "").trim();
        const parsed = parseCityState({ address });
        const city = row.city || inferFloridaCityFromAddress(address);
        const cat = String(row.category || "Place");
        return {
          id: String(row.placeId),
          placeId: String(row.placeId),
          name: String(row.name),
          address,
          city: city || null,
          state: parsed.state || "FL",
          category: cat === "food" ? "Restaurant" : cat,
          type: cat === "food" ? "Restaurant" : cat,
          tags: [cat, row.knownFor, row.foodMove ? "food" : null].filter(Boolean),
          url: row.officialWebsite || null,
          why_go: row.whyGo || row.vibeCheck || null,
          weekdayDescriptions:
            row.hours && Array.isArray(row.hours.weekdayDescriptions)
              ? row.hours.weekdayDescriptions
              : null,
        };
      });
    return cachedAtlasRows;
  } catch {
    cachedAtlasRows = [];
    return cachedAtlasRows;
  }
}

export function getPublishedChristmasResearchRows() {
  return Array.isArray(CHRISTMAS_PUBLISHED_RESEARCH) ? CHRISTMAS_PUBLISHED_RESEARCH : [];
}

export function getFirstPartyAtlasPlaces() {
  return loadAtlasPlaces();
}
