// lib/christmasMap.js: the pins behind the Christmas "Map" view. PURE.
// Owner rules: Apple Maps, free pins, every VERIFIED place in the current
// result set. An approximate location is never pinned and a coordinate is
// never guessed: a listing with approxLocation (a city centre stand in,
// lib/christmasPool.js), coord_kind "city_approx", a row on the approximate
// event list (lib/eventLocation.js) or a missing / invalid / non Florida
// coordinate has NO pin (it stays in the list, where it shows "~ miles").
import { filterChristmasBrowse, sortChristmasBrowse, collapseBrowseBrands } from "./christmasBrowse.js";
import { eventMapPoint } from "./eventLocation.js";

const hasValue = (v) => v !== null && v !== undefined && v !== "";

export function isVerifiedChristmasPoint(card) {
  if (!card || typeof card !== "object") return false;
  if (card.approxLocation || card.coord_approx === true || card.coord_kind === "city_approx") return false;
  if (!hasValue(card.lat) || !hasValue(card.lng)) return false;
  const point = eventMapPoint(card); // finite, not 0,0, not on the approximate event list
  if (!point) return false;
  // Florida only: a stray value must never pin in another state or the ocean.
  return point.lat > 24 && point.lat < 31.2 && point.lng > -88 && point.lng < -79.5;
}

function pinHref(card) {
  if (card.detailHref && String(card.detailHref).startsWith("/")) return card.detailHref;
  const url = card.url || card.sourceUrl || "";
  return /^https:\/\//.test(url) ? url : null;
}

// {id,title,lat,lng,city,href} for every verified listing in the result set
// (all of it, never one page).
export function christmasBrowsePins(listings, query, today) {
  const filtered = filterChristmasBrowse(listings || [], query || {}, today);
  const located = (query || {}).sort !== "tickets" && query && query.lat != null && query.lng != null;
  const ranked = collapseBrowseBrands(sortChristmasBrowse(filtered, query || {}, today), !!located);
  const seen = new Set();
  const pins = [];
  for (const card of ranked) {
    if (!isVerifiedChristmasPoint(card) || seen.has(card.id)) continue;
    seen.add(card.id);
    pins.push({ id: card.id, title: card.title || card.name || "", lat: Number(card.lat), lng: Number(card.lng), city: card.city || "", href: pinHref(card) });
  }
  return pins;
}
