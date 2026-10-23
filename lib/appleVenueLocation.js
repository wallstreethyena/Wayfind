// lib/appleVenueLocation.js — AN APPLE-VERIFIED POINT FOR A PROVIDER VENUE.
//
// WHY (2026-10-22, owner: "parking still not working"). The Tropicana Field
// event page drew the venue at 27.7373,-82.6461 — the 33705 ZIP centroid,
// 3.5 km south of the stadium — because that is the coordinate Ticketmaster's
// venue record carries. The Parking category then searched a residential
// mile around that point and honestly found nothing, while Apple returns 19
// lots around the real stadium. Measured on the 146 Ticketmaster venues in
// the live Florida feeds: 51 are more than 150 m off and 16 more than 1.5 km
// (Amerant Bank Arena 10 km, Athens Theatre 13 km). A provider point is a
// hint, not a fact.
//
// WHAT. Before the shared Apple map is built for a venue whose point came
// from a provider (locationTrust "provider": today only Ticketmaster rows,
// app/events/[city]/[slug]/page.js eventLocationTrust; staples and curated
// rows carry owner-set points and are "verified"),
// ask Apple — on the same free MapKit JS session the map already uses — for
// that venue, and move the pin, the parking search and the walk/drive links
// to Apple's point when the provider's is wrong. Two rungs, both refuse when
// unsure (lib/applePlaceMatch.js: "wrong pins are worse than none"):
//   1. PLACE: a name Search inside a ~30 km box around the provider point.
//      Accepted only when Apple's name agrees by the shared matcher's rules
//      (token Dice >= NAME_MIN, or a branch-suffix prefix with city and
//      category agreeing; >= NAME_STRICT when Apple gives no category), the
//      category is not plainly a non-venue (a store, a bank, a parking lot),
//      the city agrees when both are known, and exactly ONE distinct Apple
//      place survives. Within VENUE_CONFIRM_METERS the provider was right.
//   2. ADDRESS: when the name is refused but the venue has a numbered street
//      address, geocode "street, city, state". Accepted only when Apple
//      echoes the same house number and street name and the same city, so an
//      unrelated or centroid answer can never pass as the venue.
// Owned and editorially verified points (locationTrust "verified": place
// pages, curated wf_events) are never checked and never move.
//
// COMPLIANCE. Apple's name, address and coordinate are Map Data used at
// render time on an Apple map and kept only for this browser session (DPLA
// Attachment 6 §2.4/§2.5); nothing here is persisted or sent to a server.
// No Google call, ever. One Search (plus at most one geocode) per venue per
// session, inside the same free MapKit JS allowance the map already spends.
import { nameScore, prefixRelation, normalizeApplePlace, sameLocality, isGenericName, isKnownChain,
  NAME_MIN, NAME_STRICT, PREFIX_SCORE, SAME_PLACE_METERS } from "./applePlaceMatch.js";
import { mapFailureReason, reportMapServiceIssue } from "./mapDiagnostics.js";

// Apple place within this of the provider point: the provider was right.
export const VENUE_CONFIRM_METERS = 150;
// A geocoded address is noisier than a place; move only beyond this.
export const VENUE_ADDRESS_MOVE_METERS = 250;
// Beyond this Apple found a different place or a different town: refuse.
export const VENUE_MAX_CORRECTION_METERS = 30000;
// ~30 km box around the provider point for the name search.
export const VENUE_SEARCH_SPAN_DEGREES = 0.27;
export const VENUE_RESOLVE_TIMEOUT_MS = 4000;
const CACHE_MAX = 64;

// Apple categories that are never a ticketed venue, whatever the name says.
const NON_VENUE_CATEGORY = new Set(["ATM", "Bank", "CarRental", "EVCharger", "FireStation", "FitnessCenter", "GasStation",
  "Hospital", "Laundry", "Parking", "Pharmacy", "Police", "PostOffice", "PublicTransport", "Restroom", "Store"]);

const NUMBER_WORDS = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
// Street tokens that identify a direction or a kind of road, not the road.
// They are kept apart from the road name: "400 1st St S" and "400 1st St N"
// are different blocks on St. Pete's grid, "500 Park Ave" is not "500 Park
// Blvd" (reviewer counterexamples, 2026-10-22).
const DIRECTIONAL = { n: "n", s: "s", e: "e", w: "w", ne: "ne", nw: "nw", se: "se", sw: "sw", north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
const ROAD_KIND = { st: "st", street: "st", ave: "ave", avenue: "ave", rd: "rd", road: "rd", dr: "dr", drive: "dr", blvd: "blvd", boulevard: "blvd",
  ln: "ln", lane: "ln", ct: "ct", court: "ct", hwy: "hwy", highway: "hwy", pkwy: "pkwy", parkway: "pkwy", pl: "pl", place: "pl", way: "way",
  cir: "cir", circle: "cir", ter: "ter", terrace: "ter", trl: "trl", trail: "trl", sq: "sq", square: "sq", plz: "plz", plaza: "plz" };

const num = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" ? Number(value) : NaN;

function point(venue) {
  if (!venue || typeof venue !== "object") return null;
  const lat = num(venue.lat), lng = num(venue.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export function metersBetween(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// "Ft Lauderdale" / "Fort Lauderdale" / "St. Petersburg" / "Saint Petersburg".
function cityForm(city) {
  return String(city || "").toLowerCase().replace(/\bft\.?\b/g, "fort").replace(/\bmt\.?\b/g, "mount");
}
export function cityAgrees(ours, theirs) {
  if (!String(ours || "").trim() || !String(theirs || "").trim()) return null; // unknown on one side: neutral
  return sameLocality(cityForm(ours), cityForm(theirs));
}

// Only a venue whose point is a provider's hint is checked.
export function needsAppleVenueCheck(venue) {
  return !!venue && venue.locationTrust === "provider" && typeof venue.name === "string" && venue.name.trim() !== "" && point(venue) !== null;
}

// PURE. Decide whether one of Apple's name-search results IS this venue.
// -> { ok:true, lat, lng, appleId, nameScore, category, driftMeters }
//    { ok:false, reason, considered }
export function matchAppleVenue(venue, results) {
  const origin = point(venue);
  if (!venue || typeof venue.name !== "string" || !venue.name.trim()) return { ok: false, reason: "no-venue-name", considered: 0 };
  if (!origin) return { ok: false, reason: "no-venue-point", considered: 0 };
  const raw = (Array.isArray(results) ? results : []).map(normalizeApplePlace).filter(Boolean);
  const survivors = [];
  const why = {};
  const note = (reason) => { why[reason] = (why[reason] || 0) + 1; };
  for (const a of raw) {
    if (!a.id || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) { note("no-apple-identity"); continue; }
    let score = nameScore(venue.name, a.name);
    let prefixOnly = false;
    if (score < NAME_MIN) {
      const rel = prefixRelation(venue.name, a.name, [venue.city || "", a.locality || ""]);
      if (rel.kind !== "branch") { note(rel.kind === "other" ? "name-extended" : "name-mismatch"); continue; }
      score = PREFIX_SCORE; prefixOnly = true;
    }
    if (a.category && NON_VENUE_CATEGORY.has(String(a.category))) { note("non-venue-category"); continue; }
    if (!a.category && score < NAME_STRICT) { note("name-not-strict-without-category"); continue; }
    const drift = metersBetween(origin, a);
    if (drift > VENUE_MAX_CORRECTION_METERS) { note("too-far"); continue; }
    const agrees = cityAgrees(venue.city, a.locality);
    // A same-named place in another city may CONFIRM a provider point it sits
    // on top of, never MOVE one ("Heritage Park", Plant City vs Lakeland:
    // reviewer counterexample, 2026-10-22). Nothing here backs the parent
    // matcher's metro box, so a differing city is only tolerated in place.
    if (agrees === false && drift > VENUE_CONFIRM_METERS) { note("locality-mismatch"); continue; }
    if (prefixOnly && !(agrees === true && a.category)) { note("prefix-needs-locality"); continue; }
    survivors.push({ ...a, score, drift, agrees });
  }
  const distinct = [];
  for (const s of survivors.sort((x, y) => y.score - x.score || x.drift - y.drift)) {
    const dup = distinct.find((d) => d.id === s.id || d.alternateIds.includes(s.id) || s.alternateIds.includes(d.id) || metersBetween(d, s) <= SAME_PLACE_METERS);
    if (!dup) distinct.push(s);
  }
  if (!distinct.length) {
    const top = Object.entries(why).sort((a, b) => b[1] - a[1])[0];
    return { ok: false, reason: raw.length ? (top ? top[0] : "no-candidate") : "no-results", considered: raw.length };
  }
  if (distinct.length > 1) return { ok: false, reason: "ambiguous", considered: raw.length };
  const best = distinct[0];
  if ((isKnownChain(venue.name) || isGenericName(venue.name)) && best.agrees !== true) return { ok: false, reason: "generic-name-needs-locality", considered: raw.length };
  return { ok: true, lat: best.lat, lng: best.lng, appleId: best.id, nameScore: Math.round(best.score * 100) / 100, category: best.category || null, driftMeters: Math.round(best.drift) };
}

// "One Tropicana Dr." -> { number: "1", tokens: ["tropicana"], dirs: [], kinds: ["dr"] };
// null without a leading house number.
export function streetParts(street) {
  const text = String(street || "").split(",")[0].normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const number = /^\d{1,6}[a-z]?$/.test(words[0]) ? words[0] : NUMBER_WORDS[words[0]];
  if (!number) return null;
  const rest = words.slice(1);
  const dirs = [...new Set(rest.filter((w) => DIRECTIONAL[w]).map((w) => DIRECTIONAL[w]))];
  const kinds = [...new Set(rest.filter((w) => ROAD_KIND[w]).map((w) => ROAD_KIND[w]))];
  const tokens = rest.filter((w) => !DIRECTIONAL[w] && !ROAD_KIND[w] && w.length >= 3 && !/^\d+$/.test(w));
  return { number, tokens, dirs, kinds };
}

// Two spellings of one street share at least one directional and one road
// kind when both sides state them; "1st St S" / "1st St N" share none.
function streetQualifiersAgree(a, b) {
  const disjoint = (x, y) => x.length && y.length && !x.some((t) => y.includes(t));
  return !disjoint(a.dirs, b.dirs) && !disjoint(a.kinds, b.kinds);
}

// PURE. Decide whether a geocoder result IS this venue's street address.
// -> { ok:true, lat, lng, driftMeters } | { ok:false, reason, considered }
export function matchVenueAddress(venue, results) {
  const origin = point(venue);
  if (!origin) return { ok: false, reason: "no-venue-point", considered: 0 };
  const ours = streetParts(venue && venue.street);
  if (!ours || !ours.tokens.length) return { ok: false, reason: "no-numbered-street", considered: 0 };
  const list = Array.isArray(results) ? results : [];
  let reason = list.length ? "address-mismatch" : "no-results";
  for (const r of list) {
    const c = r && (r.coordinate || r.center) || {};
    const lat = num(c.latitude), lng = num(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { reason = "no-coordinate"; continue; }
    const theirs = streetParts([r.subThoroughfare, r.thoroughfare].filter(Boolean).join(" ") || r.name || "");
    if (!theirs || theirs.number !== ours.number) { reason = "house-number-mismatch"; continue; }
    if (!theirs.tokens.some((t) => ours.tokens.includes(t)) || !streetQualifiersAgree(ours, theirs)) { reason = "street-mismatch"; continue; }
    if (cityAgrees(venue.city, r.locality) === false) { reason = "locality-mismatch"; continue; }
    const drift = metersBetween(origin, { lat, lng });
    if (drift > VENUE_MAX_CORRECTION_METERS) { reason = "too-far"; continue; }
    return { ok: true, lat, lng, driftMeters: Math.round(drift) };
  }
  return { ok: false, reason, considered: list.length };
}

// PURE. The venue the map should draw, given a resolution.
export function applyVenueResolution(venue, resolution) {
  if (!venue || !resolution || !point(resolution.point)) return venue;
  return { ...venue, lat: resolution.point.lat, lng: resolution.point.lng, locationSource: resolution.source };
}

const kept = (venue, reason) => ({ status: "kept", point: point(venue) || { lat: num(venue && venue.lat), lng: num(venue && venue.lng) }, source: "provider", driftMeters: 0, reason });

function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { code: "VENUE_TIMEOUT" })), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function searchByName(mapkit, venue, origin, deadlineMs) {
  const center = new mapkit.Coordinate(origin.lat, origin.lng);
  const region = new mapkit.CoordinateRegion(center, new mapkit.CoordinateSpan(VENUE_SEARCH_SPAN_DEGREES, VENUE_SEARCH_SPAN_DEGREES / Math.max(0.2, Math.cos(origin.lat * Math.PI / 180))));
  const service = new mapkit.Search({ region });
  const request = service.search(venue.name.trim(), {
    region, regionPriority: (mapkit.RegionPriority && mapkit.RegionPriority.Required) || "required",
    includeAddresses: false, includeQueries: false, includePointsOfInterest: true,
  });
  if (!request || typeof request.then !== "function") return Promise.reject(Object.assign(new Error("Apple search promise API unavailable"), { code: "VENUE_UNSUPPORTED" }));
  return withDeadline(request, deadlineMs, "Apple venue search").then((data) => (data && Array.isArray(data.places) ? data.places : []));
}

function geocodeAddress(mapkit, venue, origin, deadlineMs) {
  const query = [String(venue.street || "").trim(), String(venue.city || "").trim(), String(venue.state || "").trim()].filter(Boolean).join(", ");
  const geocoder = new mapkit.Geocoder({ language: "en-US" });
  const lookup = new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, data) => { if (settled) return; settled = true; if (error) reject(error); else resolve(data); };
    let request;
    try { request = geocoder.lookup(query, done, { coordinate: new mapkit.Coordinate(origin.lat, origin.lng) }); } catch (error) { done(error); return; }
    if (request && typeof request.then === "function") request.then((data) => done(null, data), done);
  });
  return withDeadline(lookup, deadlineMs, "Apple address lookup").then((data) => (data && Array.isArray(data.results) ? data.results : []));
}

const cache = new Map();
export function clearAppleVenueLocationCacheForTests() { cache.clear(); }
const cacheKey = (venue, origin) => JSON.stringify([venue.name.trim().toLowerCase(), origin.lat.toFixed(5), origin.lng.toFixed(5), String(venue.street || ""), String(venue.city || ""), String(venue.state || "")]);

async function resolveUncached({ mapkit, venue, timeoutMs }) {
  const origin = point(venue);
  if (!mapkit || typeof mapkit.Coordinate !== "function") return kept(venue, "unsupported");
  const started = Date.now();
  const remaining = () => Math.max(50, timeoutMs - (Date.now() - started));
  let placeReason = "unsupported";
  if (typeof mapkit.Search === "function" && typeof mapkit.CoordinateRegion === "function" && typeof mapkit.CoordinateSpan === "function") {
    try {
      const match = matchAppleVenue(venue, await searchByName(mapkit, venue, origin, remaining()));
      if (match.ok) {
        if (match.driftMeters <= VENUE_CONFIRM_METERS) return { status: "confirmed", point: origin, source: "provider", driftMeters: match.driftMeters };
        return { status: "corrected", point: { lat: match.lat, lng: match.lng }, source: "apple-place", driftMeters: match.driftMeters };
      }
      placeReason = match.reason;
    } catch (error) {
      placeReason = error && error.code === "VENUE_TIMEOUT" ? "timeout" : mapFailureReason(error);
      reportMapServiceIssue("venue-location", placeReason);
      if (placeReason === "timeout") return kept(venue, placeReason);
    }
  }
  if (typeof mapkit.Geocoder === "function" && streetParts(venue.street) && streetParts(venue.street).tokens.length) {
    try {
      const match = matchVenueAddress(venue, await geocodeAddress(mapkit, venue, origin, remaining()));
      if (match.ok) {
        if (match.driftMeters <= VENUE_ADDRESS_MOVE_METERS) return { status: "confirmed", point: origin, source: "provider", driftMeters: match.driftMeters };
        return { status: "corrected", point: { lat: match.lat, lng: match.lng }, source: "apple-address", driftMeters: match.driftMeters };
      }
      return kept(venue, `${placeReason}/${match.reason}`);
    } catch (error) {
      const reason = error && error.code === "VENUE_TIMEOUT" ? "timeout" : mapFailureReason(error);
      reportMapServiceIssue("venue-address", reason);
      return kept(venue, `${placeReason}/${reason}`);
    }
  }
  return kept(venue, placeReason);
}

// Never rejects. Always returns a drawable point: Apple's when it is sure the
// provider's is wrong, the provider's otherwise. One lookup per venue per
// browser session; concurrent callers share the in-flight promise.
export function resolveAppleVenueLocation({ mapkit, venue, timeoutMs = VENUE_RESOLVE_TIMEOUT_MS } = {}) {
  if (!needsAppleVenueCheck(venue)) return Promise.resolve(kept(venue, venue && venue.locationTrust === "provider" ? "no-venue" : "trusted"));
  const origin = point(venue);
  const key = cacheKey(venue, origin);
  if (cache.has(key)) return cache.get(key);
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : VENUE_RESOLVE_TIMEOUT_MS;
  const pending = resolveUncached({ mapkit, venue, timeoutMs: ms }).catch((error) => {
    reportMapServiceIssue("venue-location", mapFailureReason(error));
    return kept(venue, "provider");
  }).then((resolution) => {
    // A transient refusal (timeout, rate limit, network) is not an answer:
    // forget it so a remount or "Try again" may ask Apple once more.
    if (resolution.status === "kept" && /timeout|rate-limit|network|^provider$/.test(String(resolution.reason || ""))) cache.delete(key);
    return Object.freeze({ ...resolution, point: Object.freeze({ ...resolution.point }) });
  });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, pending);
  return pending;
}
