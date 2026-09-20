import { LANDING_CITIES } from "./landingCities.js";

const MAX_QUERY_TEXT = 80;
let attemptSequence = 0;

// Search text is useful for product analysis, but contact information and
// street addresses do not belong in any of the analytics destinations.
export function searchQueryMeta(query) {
  const raw = typeof query === "string" ? query : "";
  const text = raw.trim().replace(/\s+/g, " ");
  const contact = /@|\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:[a-z]{2,})(?:\b|\/)/i.test(text)
    || (text.match(/\+?\d[\d\s().-]{5,}\d/g) || []).some((value) => value.replace(/\D/g, "").length >= 7);
  const address = /^\d+[a-z]?(?:[-/]\d+)?\s+\S+/i.test(text)
    || /\b\d+[a-z]?\s+[^,]{1,60}\s(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|place|pl|terrace|ter|parkway|pkwy)\b/i.test(text)
    || /\bp\.?\s*o\.?\s+box\s+\d+/i.test(text);
  const query_kind = contact ? "contact" : address ? "address" : "text";
  return {
    q: contact ? "[private query]" : address ? "[address]" : text.slice(0, MAX_QUERY_TEXT),
    query_kind,
    query_redacted: contact || address,
    query_length: raw.length,
  };
}

// Only match a city-name token prefix or a known city/state form. In
// particular, an explicit different state must never be dropped to find a hit.
export function localCitySuggestions(query) {
  if (typeof query !== "string") return [];
  const q = query.trim().toLowerCase().replace(/\s*,\s*/g, " ").replace(/\s+/g, " ");
  if (!q) return [];
  return Object.entries(LANDING_CITIES).filter(([, city]) => {
    const name = city.name.toLowerCase();
    const state = city.state.toLowerCase();
    const stateName = state === "fl" ? "florida" : state === "hi" ? "hawaii" : state;
    const forms = [name, `${name} ${state}`, `${name} ${stateName}`, `${name} ${state} usa`, `${name} ${stateName} usa`];
    const tokens = name.split(" ");
    return forms.some((form) => form.startsWith(q))
      || tokens.some((_, index) => tokens.slice(index).join(" ").startsWith(q));
  }).slice(0, 5).map(([key, city]) => ({
    kind: "area",
    placeId: `city:${key}`,
    text: `${city.name}, ${city.state}`,
    city: { name: `${city.name}, ${city.state}, USA`, lat: city.lat, lng: city.lng, isArea: true },
  }));
}

function safeExtras(extra) {
  const result = {};
  if (!extra || typeof extra !== "object") return result;
  for (const [key, value] of Object.entries(extra)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (typeof value === "string") result[key] = searchQueryMeta(value).q;
    else if (typeof value === "boolean" || value === null || (typeof value === "number" && Number.isFinite(value))) result[key] = value;
  }
  return result;
}

export function createSearchAttempt(log, query, { source = "search_box", now = Date.now, id } = {}) {
  const started = now();
  const searchId = id || (typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `search-${started.toString(36)}-${(++attemptSequence).toString(36)}`);
  const meta = { ...searchQueryMeta(query), source: searchQueryMeta(source).q, search_id: searchId };
  const emit = (event, payload) => { try { log(event, null, payload); } catch {} };
  emit("search", { ...meta });
  let finished = false;
  return {
    id: searchId,
    meta: { ...meta },
    finish(outcome, extra = {}) {
      if (finished) return false;
      finished = true;
      emit("search_outcome", {
        ...safeExtras(extra),
        ...meta,
        outcome: searchQueryMeta(outcome).q,
        duration_ms: Math.max(0, now() - started),
      });
      return true;
    },
  };
}
