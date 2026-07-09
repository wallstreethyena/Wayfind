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

const _nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// v4.89 — HARD CATEGORY GATE (the junk fix). Broad text search matches
// service businesses by keyword: "cooling and heating" in Things to do,
// eyeglass stores on Beach day. These have high review counts so they even
// ranked well. The gate runs on the MERGED pool (Google + Foursquare + any
// future source) before ranking, for every category and every vibe:
//   1. Service/professional businesses NEVER appear in discovery, anywhere.
//   2. Beach day only surfaces beach/waterfront/parks/piers/marinas.
//   3. Things to do only surfaces attractions/entertainment/recreation.
//   4. Curated first-party picks always pass.
// Deliberately AGGRESSIVE by product direction: killing junk beats keeping a
// rare oddly-named legit spot (the adaptive radius refills the list).
const CURATED_NAMES = new Set(CURATED.map((c) => _nn(c.name)));
const SERVICE_RX = /\b(moving|storage|heating|cooling|hvac|air condition|plumb|roof|septic|pest control|exterminat|insurance|realty|real estate|law firm|law office|attorney|paralegal|notary|bank|credit union|eyeglass|optical|optometr|vision center|lasik|dentist|dental|orthodont|urgent care|clinic|hospital|dialysis|chiropract|physical therapy|veterinar|animal hospital|auto repair|auto body|collision|car wash|oil change|tire shop|transmission|towing|locksmith|tax service|accounting|payroll|staffing|funeral|cremat|dry clean|laundromat|self storage|u ?haul|pawn|phone repair|mattress|carpet|flooring|granite|cabinet|window tint|solar|landscap|lawn care|tree service|pressure wash|gutter|fence|garage door|pool service|pool cleaning|water treatment|propane|title loan|check cashing|bail bond)\b/i;
const SERVICE_TYPES_RX = /moving_company|storage|electrician|plumber|roofing|general_contractor|painter\b|locksmith|car_repair|car_wash|car_dealer|gas_station|insurance|lawyer|real_estate|\bbank\b|\batm\b|accounting|dentist|dental|doctor|physiotherapist|veterinary|hospital|pharmacy|drugstore|funeral|laundry|courthouse|local_government|post_office|police|fire_station|primary_school|secondary_school|cemetery|medical_lab|optician|optometrist/;
const BEACH_ALLOW_RX = /beach|park|pier|marina|waterfront|boardwalk|\bbay\b|coast|shore|island|preserve|cove|lagoon|kayak|paddle|boat|sail|surf|snorkel|dive|tiki|dock|inlet|\bkey\b|sandbar/i;
const TODO_ALLOW_RX = /tourist_attraction|amusement|theme_park|water_park|aquarium|zoo|museum|art_gallery|gallery|park|garden|trail|preserve|beach|marina|pier|boardwalk|landmark|histor|monument|stadium|arena|theater|theatre|cinema|movie|bowling|arcade|escape|mini.?golf|golf|go.?kart|\bkart|skat|climb|trampoline|paintball|axe|laser tag|casino|winery|brewery|distillery|\bfarm\b|orchard|ranch|\bspa\b|tour\b|cruise|airboat|kayak|paddle|charter|playground|splash|observat|planetarium|science|cultural|performing|music venue|festival|fairground|attraction|recreation|entertainment|night_club|event_venue|point_of_interest_landmark/i;
export function junkGate(categoryId, p) {
  if (!p || !p.name) return false;
  if (CURATED_NAMES.has(_nn(p.name))) return true;
  const hay = ((p.types || []).join(" ") + " " + p.name).toLowerCase();
  if (SERVICE_TYPES_RX.test(hay) || SERVICE_RX.test(hay)) return false;
  if (categoryId === "beach") return BEACH_ALLOW_RX.test(hay);
  if (categoryId === "attractions") return TODO_ALLOW_RX.test(hay);
  return true;
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
  if (!f || !f.length) return _rank(out.filter((p) => junkGate(categoryId, p)));
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
    fp.wfScore = wayfindScore(fp.rating, fp.reviews || 0);
    fp.sources = [fp.src || "fsq"];
    out.push(fp);
  }
  // v4.89: hard category gate on the whole merged pool (both sources) —
  // junk out BEFORE ranking, so service businesses can't outrank real spots.
  const gated = out.filter((p) => junkGate(categoryId, p));
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
