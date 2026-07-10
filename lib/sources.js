"use client";
// v4.86 — Multi-source place aggregation. The app used to be Google-only for
// venue lists; this module is the single entry point that fans out to every
// available place source in parallel, normalizes to the app's common shape,
// dedupes across sources, and hands the merged pool to the EXISTING ranking
// engine unchanged (same _sortScore math + near-first rule as the Google
// path, so ranking behavior is identical — just with a bigger honest pool).
//
// Sources handled HERE (venue-shaped places):
//   • Google Places — primary (client SDK or server proxy, cached)
//   • Foursquare    — second source via /api/fsq/search (fail-soft)
//   • NPS + RIDB (Recreation.gov) + OpenStreetMap — outdoor/recreation places
//     via the server-only /api/outdoors route (keys never reach the browser);
//     scoped to Beach day, Things to do, and the outdoor vibes so they can't
//     pollute food or nightlife
// Sources that stay on their own purpose-built surfaces, by design:
//   • Curated picks — injected + boosted downstream in the vibe loader
//   • Viator        — bookable products (not venues) on the vibe/browse rails
//   • Ticketmaster/SeatGeek/PredictHQ/Eventbrite — events, on the Events tab
// Merging products/events into venue lists would fake venue semantics
// (address/hours they don't have) — they enrich views instead of the pool.
//
// Dedupe rule: same venue = normalized-name match (equal, or one contains the
// other at ≥5 chars) AND coordinates within 250 m. On a match the Google
// record stays canonical and Foursquare fills only the gaps (rating, review
// count, price, photo, open-now, extra categories) — never overwrites.
import { searchPlaces as searchGooglePlaces, queryFor, vibeFor, wayfindScore, distMeters, DEFAULT_RADIUS_M } from "./google";
import { CURATED } from "./curated";
import { placeAllowed } from "./placeFilter";

const _nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// v4.94 — the gate now lives in lib/placeFilter.js (ONE module, imported by
// every result path and executed directly by the check-gate build guardrail).
// This wrapper only adds the curated bypass: first-party picks always pass.
const CURATED_NAMES = new Set(CURATED.map((c) => _nn(c.name)));
export function junkGate(categoryId, p, subId) {
  if (p && p.name && CURATED_NAMES.has(_nn(p.name))) return true;
  return placeAllowed(categoryId, subId || null, p);
}

function sameVenue(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return false;
  const na = _nn(a.name), nb = _nn(b.name);
  if (!na || !nb) return false;
  const nameHit = na === nb || (na.length >= 5 && nb.includes(na)) || (nb.length >= 5 && na.includes(nb));
  if (!nameHit) return false;
  return distMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= 250;
}

async function outdoorsSearch(center, radiusMeters) {
  if (typeof window === "undefined" || !center) return [];
  try {
    const qs = new URLSearchParams({ lat: Number(center.lat).toFixed(4), lng: Number(center.lng).toFixed(4), radius: String(Math.round(radiusMeters)) });
    const r = await fetch("/api/outdoors?" + qs.toString());
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.places) ? d.places : [];
  } catch (e) { return []; }
}

async function fsqSearch(q, center, radiusMeters, limit = 30) {
  if (typeof window === "undefined" || !q || !center) return [];
  try {
    const qs = new URLSearchParams({ q, lat: Number(center.lat).toFixed(4), lng: Number(center.lng).toFixed(4), radius: String(Math.round(radiusMeters)), limit: String(limit) });
    const r = await fetch("/api/fsq/search?" + qs.toString());
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.places) ? d.places : [];
  } catch (e) { return []; }
}

const _distPenalty = (mi) => (mi <= 4 ? 0 : Math.min(30, (mi - 4) * 1.3));

// Drop-in replacement for google.searchPlaces — same signature, merged pool.
export async function searchPlaces(categoryId, subId, center, radiusMeters = DEFAULT_RADIUS_M, vibeId = "all", keyword = "") {
  let fq = queryFor(categoryId, subId);
  try { const vq = vibeFor ? vibeFor(categoryId, vibeId) : ""; if (vq) fq = vq + " " + fq; } catch (e) {}
  if (keyword) fq = keyword + " " + fq;
  const wantOutdoors = categoryId === "beach" || categoryId === "attractions"; // v4.90: NPS/RIDB/OSM only where they belong
  const [g, f0, o0] = await Promise.all([
    searchGooglePlaces(categoryId, subId, center, radiusMeters, vibeId, keyword).catch(() => []),
    fsqSearch(fq, center, radiusMeters).catch(() => []),
    wantOutdoors ? outdoorsSearch(center, radiusMeters).catch(() => []) : Promise.resolve([]),
  ]);
  const f = [...(f0 || []), ...(o0 || [])];
  const out = (g || []).slice();
  if (!f || !f.length) return _rank(out.filter((p) => junkGate(categoryId, p, subId)));
  const gate = radiusMeters * 1.15; // same hard distance gate as the Google path
  for (const fp of f) {
    if (fp.distMi == null && fp.lat != null) fp.distMi = distMeters(center, { lat: fp.lat, lng: fp.lng }) / 1609.34;
    const twin = out.find((gp) => sameVenue(gp, fp));
    if (twin) {
      if (twin.rating == null && fp.rating != null) { twin.rating = fp.rating; twin.wfScore = wayfindScore(fp.rating, fp.reviews || 0); }
      if ((!twin.reviews || twin.reviews === 0) && fp.reviews) twin.reviews = fp.reviews;
      if (twin.price == null && fp.price != null) { twin.price = fp.price; twin.priceNum = fp.priceNum; }
      if (!twin.photo && fp.photo) { twin.photo = fp.photo; twin.photos = fp.photos || []; twin.photoAttr = ""; }
      if (twin.openNow == null && fp.openNow != null) twin.openNow = fp.openNow;
      if (Array.isArray(fp.types) && fp.types.length) twin.types = Array.from(new Set([...(twin.types || []), ...fp.types]));
      twin.sources = Array.from(new Set([...(twin.sources || ["google"]), fp.src || "fsq"]));
      continue;
    }
    if (fp.distMi != null && fp.distMi * 1609.34 > gate) continue;
    // v4.96 ghost guard: a commercial place (food/nightlife/stays/shopping)
    // that exists ONLY in a secondary source with zero rating and zero
    // reviews is more likely stale or fake than real — drop it. Outdoor POIs
    // (parks, piers, beaches) legitimately lack ratings and stay.
    if (!wantOutdoors && fp.rating == null && !(fp.reviews > 0)) continue;
    fp.wfScore = wayfindScore(fp.rating, fp.reviews || 0);
    // v4.94: unknown quality must not outrank known quality — an unrated
    // secondary-source venue caps well below any decently rated place.
    if (fp.rating == null) fp.wfScore = Math.min(fp.wfScore || 0, 34);
    fp.sources = [fp.src || "fsq"];
    out.push(fp);
  }
  // v4.89: hard category gate on the whole merged pool (both sources) —
  // junk out BEFORE ranking, so service businesses can't outrank real spots.
  const gated = out.filter((p) => junkGate(categoryId, p, subId));
  return _rank(gated);
}

function _rank(out) {
  // Re-rank the merged pool exactly like lib/google.js does its own list:
  // distance-adjusted score, then the near-first rule.
  out.forEach((p) => { const mi = p.distMi || 0; p._sortScore = (p.wfScore || 0) - _distPenalty(mi); });
  out.sort((a, b) => (b._sortScore || 0) - (a._sortScore || 0));
  const near = out.filter((p) => p.distMi != null && p.distMi <= 12).length;
  if (near >= 5) return [...out.filter((p) => !(p.distMi != null && p.distMi > 20)), ...out.filter((p) => p.distMi != null && p.distMi > 20)];
  return out;
}
