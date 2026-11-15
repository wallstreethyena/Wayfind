// Where Santa looks for a table (owner 2026-11-14). One answer, from the strongest signal the visitor gave:
//   1. a city typed in this message ("in St. Pete", "Orlando")            -> that city, always
//   2. the place the visitor selected (seed place with coordinates)        -> around that place
//   3. the stored, consented location (wf_center), when fresh and it does not contradict the page city
//   4. the city of the page they are on (or the trip/context city)         -> that city
//   5. nothing reliable                                                     -> ask for the city; never "nearby"
// The server enforces the same constraint (lib/reserveFind.js: no area -> needsArea, radius filter on coordinates),
// so a missing or wrong label can never turn into a whole-state list.
import { parsePlannerCity } from "./plannerParse.js";
import { COVERED_CITIES } from "./landingCities.js";

export const AREA_STALE_MS = 7 * 24 * 60 * 60 * 1000; // an older stored location is not "where you are"
export const AREA_CONFLICT_MILES = 75; // same as nearestMetro's reach

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const point = (lat, lng) => (finite(lat) && finite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null);

export function milesBetween(a, b) {
  if (!a || !b) return Infinity;
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

function cityPoint(c) {
  if (!c) return null;
  const direct = point(Number(c.lat), Number(c.lng));
  if (direct) return direct;
  const known = c.slug && COVERED_CITIES[c.slug];
  return known ? point(Number(known.lat), Number(known.lng)) : null;
}

/**
 * @param {object} o
 * @param {string} [o.text]          the visitor's message
 * @param {{id?:string,name?:string,lat?:number,lng?:number}} [o.selectedPlace]
 * @param {{lat:number,lng:number,loc?:string,ts?:number}} [o.storedPoint]  wf_center as stored
 * @param {{slug?:string,name?:string,lat?:number,lng?:number}} [o.pageCity]  city of the page or trip
 * @param {number} o.nowMs
 * @returns {{lat:number,lng:number,label:string,source:string}|{source:"unknown",label:null,reason:string}}
 */
export function resolveSearchArea({ text = "", selectedPlace = null, storedPoint = null, pageCity = null, nowMs } = {}) {
  const typed = parsePlannerCity(text);
  const typedPt = cityPoint(typed);
  if (typed && typedPt) return { ...typedPt, label: typed.neighborhood || typed.name, source: "message_city" };

  const placePt = selectedPlace ? point(Number(selectedPlace.lat), Number(selectedPlace.lng)) : null;
  if (placePt) return { ...placePt, label: selectedPlace.name ? "near " + selectedPlace.name : "near this place", source: "selected_place" };

  const pagePt = cityPoint(pageCity);
  const stored = storedPoint ? point(Number(storedPoint.lat), Number(storedPoint.lng)) : null;
  const ts = storedPoint && finite(Number(storedPoint.ts)) ? Number(storedPoint.ts) : null;
  const fresh = stored && ts !== null && finite(nowMs) && nowMs - ts >= 0 && nowMs - ts <= AREA_STALE_MS;
  if (fresh && !(pagePt && milesBetween(stored, pagePt) > AREA_CONFLICT_MILES)) {
    const loc = typeof storedPoint.loc === "string" && storedPoint.loc.trim() ? storedPoint.loc.trim().slice(0, 60) : null;
    return { ...stored, label: loc || "near you", source: "stored_location" };
  }
  if (pagePt) return { ...pagePt, label: pageCity.name || "this city", source: "page_city" };
  return { source: "unknown", label: null, reason: stored ? (fresh ? "conflict" : "stale_location") : "no_location" };
}
