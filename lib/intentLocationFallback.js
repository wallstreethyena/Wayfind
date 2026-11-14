// lib/intentLocationFallback.js — where an intent page ranks from when the URL
// names no place.
//
// THE BUG THIS EXISTS FOR (2026-11-11): /date-night, /family and /tonight rank
// from ?lat/?lng or the visitor's saved homepage location (localStorage
// wf_center). A shared link, a search result or a first visit has neither, so
// the page printed "Choose a location to build your date night." (or "This page
// needs a location before it can rank nearby family picks.") and offered NO way
// to choose one. PostHog, 7 days to 2026-11-11: /date-night and /family landings
// bounced 90% of the time.
//
// The order is the homepage's own order, minus GPS (an intent page never asks
// for a permission on load):
//   1. ?lat/?lng/?city in the URL  (the page's resolver handles this)
//   2. the saved homepage location  (readStoredCenter)
//   3. the free coarse IP location  (fetchIpCenter, /api/geo; Florida only)
//   4. a one-tap city chooser       (INTENT_CHOOSER_CITIES, IntentLocationChooser)
//
// Nothing here writes wf_center: a choice made on an intent page lives in the
// URL, so it is shareable and never silently re-seeds the homepage.

import { COVERED_CITIES } from "./landingCities.js";

/** The saved homepage location, or null. Never throws (blocked storage, bad JSON). */
export function readStoredCenter(storage) {
  try {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return null;
    const value = JSON.parse(store.getItem("wf_center") || "null");
    if (!value) return null;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, loc: typeof value.loc === "string" ? value.loc : "" };
  } catch (error) {
    return null;
  }
}

/**
 * The visitor's coarse IP location from /api/geo, as a stored-center shape, or
 * null. /api/geo already refuses points outside Florida (ok:false), so a
 * datacenter in Ohio never becomes the ranking origin. A name is kept only when
 * it is a Florida city ("Riverview, FL"), otherwise the page keeps its honest
 * "your town" wording with real coordinates.
 */
export async function fetchIpCenter({ fetchImpl, signal, timeoutMs = 4000 } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return null;
  let timer = null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  if (controller && signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch("/api/geo", { cache: "no-store", signal: controller ? controller.signal : undefined });
    if (!response || !response.ok) return null;
    const geo = await response.json();
    if (!geo || geo.ok !== true) return null;
    const lat = Number(geo.lat);
    const lng = Number(geo.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const name = typeof geo.name === "string" && /,\s*FL$/i.test(geo.name.trim()) ? geo.name.trim() : "";
    return { lat, lng, loc: name, source: "ip" };
  } catch (error) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The chooser's cities: the Florida markets visitors actually come from (the
// homepage's covered set), biggest first. Every key must exist in
// COVERED_CITIES, so the coordinates are the same ones search and the feed use.
export const INTENT_CHOOSER_SLUGS = Object.freeze([
  "tampa", "orlando", "sarasota", "st-petersburg", "bradenton", "miami",
  "fort-lauderdale", "fort-myers", "naples", "clearwater", "jacksonville", "kissimmee",
]);

export const INTENT_CHOOSER_CITIES = Object.freeze(INTENT_CHOOSER_SLUGS
  .map((slug) => {
    const city = COVERED_CITIES[slug];
    return city ? Object.freeze({ slug, name: city.name, lat: city.lat, lng: city.lng }) : null;
  })
  .filter(Boolean));

/**
 * The href that opens `pathname` ranked from `city`. Keeps every other query
 * parameter (hour, radiusMi, utm_*) and replaces only lat, lng and city.
 */
export function chooserHref(pathname, currentSearch, city) {
  const params = new URLSearchParams(currentSearch || "");
  params.set("lat", String(city.lat));
  params.set("lng", String(city.lng));
  params.set("city", city.name);
  return `${pathname || "/"}?${params.toString()}`;
}
