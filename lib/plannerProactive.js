// lib/plannerProactive.js — Context-aware, non-spammy proactive offer selector
// for Wayfind Planner.
//
// Offers help in high-signal moments:
//   - On a place page / open detail: "Want me to build a day around this?"
//   - On a city page: "How long are you here? I can build the trip."
//   - On Christmas (/christmas-in-florida): "Tell me your dates and I'll build your Christmas plan."
//   - On an itinerary: "Want me to optimize this trip?"
//   - With 3+ unassigned saves/stops: "I can organize these into days and reduce the driving."
//
// Anti-spam protections:
//   - Session cap (`MAX_PROACTIVE_OFFERS_PER_SESSION = 2`)
//   - Per-kind suppression once shown or dismissed in the session
//   - Never shown on reserved paths (/api, /go, /oauth, /embed, /share, /group-plans)

import { LANDING_CITIES, COVERED_CITIES } from "./landingCities.js";

export const PROACTIVE_STORAGE_KEY = "wf_planner_proactive_v1";
export const MAX_PROACTIVE_OFFERS_PER_SESSION = 2;

const RESERVED_PREFIXES = ["/api", "/go", "/oauth", "/embed", "/share", "/group-plans", "/partners"];

function cleanPath(pathname) {
  const s = String(pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "");
  return s || "/";
}

function isReservedPath(pathname) {
  const p = cleanPath(pathname);
  return RESERVED_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

export function extractCityFromPath(pathname) {
  const p = cleanPath(pathname);
  const parts = p.split("/").filter(Boolean);
  for (const seg of parts) {
    const slug = seg.toLowerCase();
    if (COVERED_CITIES[slug] || LANDING_CITIES[slug]) {
      const entry = COVERED_CITIES[slug] || LANDING_CITIES[slug];
      return { slug, name: entry.name, state: entry.state };
    }
  }
  return null;
}

export function readProactiveState(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { count: 0, shown: {}, dismissedAll: false };
  }
  try {
    const parsed = JSON.parse(storage.getItem(PROACTIVE_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return { count: 0, shown: {}, dismissedAll: false };
    return {
      count: Number(parsed.count) || 0,
      shown: parsed.shown && typeof parsed.shown === "object" ? parsed.shown : {},
      dismissedAll: parsed.dismissedAll === true,
    };
  } catch {
    return { count: 0, shown: {}, dismissedAll: false };
  }
}

export function recordProactiveShown(storage, kind) {
  if (!storage || typeof storage.setItem !== "function" || !kind) return;
  const cur = readProactiveState(storage);
  const next = {
    count: cur.count + 1,
    shown: { ...cur.shown, [kind]: 1 },
    dismissedAll: cur.dismissedAll,
  };
  try {
    storage.setItem(PROACTIVE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export function dismissProactiveOffers(storage, kind = null) {
  if (!storage || typeof storage.setItem !== "function") return;
  const cur = readProactiveState(storage);
  // Explicit user dismissal suppresses further unsolicited nudges for this session
  const next = {
    count: cur.count,
    shown: kind ? { ...cur.shown, [kind]: 1 } : cur.shown,
    dismissedAll: true,
  };
  try {
    storage.setItem(PROACTIVE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Pure selector returning a contextual offer `{ kind, message, ctaLabel, seedPrompt, city }`
 * or `null` when suppressed or when no high-signal context applies.
 */
export function selectProactivePlannerOffer({
  pathname = "/",
  screen = "",
  activePlace = null,
  activeTrip = null,
  unassignedSaveCount = 0,
  storage = null,
} = {}) {
  if (isReservedPath(pathname)) return null;
  const state = readProactiveState(storage);
  if (state.dismissedAll || state.count >= MAX_PROACTIVE_OFFERS_PER_SESSION) return null;

  const p = cleanPath(pathname);

  // 1. Place context (/p/<id>, /places/<id>, or open detail sheet)
  const isPlaceRoute = p.startsWith("/p/") || p.startsWith("/places/") || Boolean(activePlace && activePlace.name);
  if (isPlaceRoute && !state.shown.place) {
    const placeName = activePlace && activePlace.name ? activePlace.name : "";
    const cityName = activePlace && activePlace.city ? activePlace.city : "";
    return {
      kind: "place",
      message: "Want me to build a day around this?",
      ctaLabel: "Build a day around this",
      seedPrompt: placeName
        ? `Build a day around ${placeName}${cityName ? ` in ${cityName}` : ""} with great food nearby and minimal driving.`
        : "Build a full day around this spot with food nearby and minimal driving.",
      city: cityName || null,
    };
  }

  // 2. Unassigned saves / undated trip stops (3+)
  if (Number(unassignedSaveCount) >= 3 && !state.shown.unassigned_saves) {
    const cityHint = activeTrip && activeTrip.city ? activeTrip.city : "";
    return {
      kind: "unassigned_saves",
      message: "I can organize these into days and reduce the driving.",
      ctaLabel: "Organize these into days",
      seedPrompt: cityHint
        ? `Organize my saved ${cityHint} stops into days and reduce the driving.`
        : "Organize my saved stops into logical days and reduce the driving.",
      city: cityHint || null,
    };
  }

  // 3. Open itinerary screen
  if ((p === "/itinerary" || screen === "itinerary") && activeTrip && Array.isArray(activeTrip.items) && activeTrip.items.length >= 2 && !state.shown.itinerary) {
    return {
      kind: "itinerary",
      message: "Want me to optimize this trip?",
      ctaLabel: "Optimize this trip",
      seedPrompt: `Optimize my ${activeTrip.title || activeTrip.city || "current"} trip to cut driving and balance each day.`,
      city: activeTrip.city || null,
      activeTripKey: activeTrip.key || null,
    };
  }

  // 4. Christmas hub (/christmas-in-florida)
  if ((p === "/christmas-in-florida" || p.startsWith("/christmas-in-florida/")) && !state.shown.christmas) {
    const subCity = extractCityFromPath(p);
    return {
      kind: "christmas",
      message: "Tell me your dates and I'll build your Christmas plan.",
      ctaLabel: "Build Christmas plan",
      seedPrompt: subCity
        ? `Build a Christmas weekend itinerary in ${subCity.name} with the best lights and food.`
        : "I want to plan a Florida Christmas trip. Help me pick dates and build the itinerary.",
      city: subCity ? subCity.name : null,
    };
  }

  // 5. City browse pages (/things-to-do/orlando, /restaurants/sarasota, /florida/tampa, etc.)
  const city = extractCityFromPath(p);
  if (city && !state.shown.city) {
    return {
      kind: "city",
      message: "How long are you here? I can build the trip.",
      ctaLabel: `Plan ${city.name}`,
      seedPrompt: `We are visiting ${city.name} for a weekend. Build a great day by day itinerary with minimal driving.`,
      city: city.name,
    };
  }

  return null;
}


// A visitor who just tapped a Facebook or Instagram ad lands on a row of picks
// whose buttons are the reason they came (live 2026-11-13: on a 375x553 phone
// the offer, fixed 82px above the bottom, sat over the first card's button
// 3.2 s after landing). While that row is on screen, an unsolicited offer
// waits; it may show once the visitor has scrolled the row away. Pure: give it
// the document (or a stub with documentElement and querySelector).
export const PROACTIVE_CLEAR_SELECTOR = "[data-top-picks]";
export function proactiveWaitsForAdPicks(doc, viewportHeight) {
  try {
    if (!doc || !doc.documentElement || typeof doc.documentElement.hasAttribute !== "function") return false;
    if (!doc.documentElement.hasAttribute("data-wf-social")) return false;
    const row = typeof doc.querySelector === "function" ? doc.querySelector(PROACTIVE_CLEAR_SELECTOR) : null;
    if (!row || typeof row.getBoundingClientRect !== "function") return false;
    const r = row.getBoundingClientRect();
    if (!r || !(r.height > 0)) return false;
    const vh = Number(viewportHeight) > 0 ? Number(viewportHeight) : 0;
    return r.bottom > 0 && (!vh || r.top < vh);
  } catch {
    return false;
  }
}
