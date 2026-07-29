// lib/nightlifeCensus.js — district-anchored retrieval for nightlife.
//
// THE DEFECT THIS FIXES
// rankedFor() retrieves with ONE searchText query, locationBias'd to a single
// city centre, capped at 20 results. Measured against the live Orlando nightlife
// page on 2026-07-29: 15 venues rendered, and NINE of Orlando's ten
// highest-volume nightlife venues absent — Twin Peaks (13,009), House of Blues
// (7,546), Ole Red (5,927), The Edison (5,271), Tin Roof (4,563), ICEBAR
// (2,918), Howl at the Moon (2,739), Wall Street Plaza (2,478), SAK Comedy Lab
// (1,746). Highest venue actually on the page: 1,697.
//
// That is a RETRIEVAL defect, not a ranking one. Every floor, predicate and
// score operates on a candidate set; if the set never contained House of Blues,
// no ordering can surface it. A 12-centre sweep found 74 eligible venues against
// the live page's 15.
//
// WHY DISTRICTS, NOT A UNIFORM GRID
// Orlando's highest-volume nightlife sits 15-20 miles from downtown, at Disney
// Springs, Universal CityWalk and I-Drive. A single downtown circle cannot see
// them, and a uniform grid spends calls on residential emptiness while still
// under-sampling the corridors. Anchor on the districts people actually go to.
//
// WHY includedTypes AND NOT includedPrimaryTypes
// Places Nearby Search (New) offers both. `includedPrimaryTypes` matches the
// primary type only; `includedTypes` matches the full types[] array. Sly Fox Pub
// is primaryType `bar_and_grill` and reaches nightlife ONLY through
// types[] containing `night_club`. Enumerating by primary type would reproduce
// at retrieval time exactly the gap the two-tier predicate closes at ranking
// time — and would do so invisibly.
//
// TABLE A PREFLIGHT
// One unsupported type 400s the ENTIRE request. Measured: `karaoke_bar` returned
// "Unsupported types: karaoke_bar" and failed all twelve centre-point calls at
// once. A sweep then returns nothing, and nothing is indistinguishable from a
// thin market. So the type list is validated against what Places accepts before
// any sweep runs, and an unusable type is dropped with a warning rather than
// silently zeroing the census.
//
// COST
// place_id is storable indefinitely under Google's terms; name/rating/review
// count/hours are place content and capped at 30 days. This module rides the
// SAME 30-day cache the rest of landing.js uses, under its own key prefix so it
// can never overwrite an existing row.

// Types Places accepts for nearby search AND that signal nightlife. Deliberately
// excludes `dive_bar` and `karaoke`, which lib/nightlifeRail.js uses to CLASSIFY
// retrieved data but which Places rejects as query parameters — a classification
// set is not a retrieval set.
export const CENSUS_TYPES = Object.freeze([
  "night_club", "bar", "pub", "wine_bar", "comedy_club", "dance_hall",
]);

// District anchors, not a grid. Each is somewhere a local would name.
export const ORLANDO_DISTRICTS = Object.freeze([
  { label: "Downtown / Church St", lat: 28.5400, lng: -81.3790, radius: 2200 },
  { label: "Thornton Park", lat: 28.5410, lng: -81.3670, radius: 1200 },
  { label: "Mills 50", lat: 28.5560, lng: -81.3630, radius: 1800 },
  { label: "Ivanhoe", lat: 28.5690, lng: -81.3760, radius: 1500 },
  { label: "Audubon Park", lat: 28.5720, lng: -81.3390, radius: 1800 },
  { label: "Milk District", lat: 28.5390, lng: -81.3550, radius: 1600 },
  { label: "Winter Park", lat: 28.5990, lng: -81.3510, radius: 2200 },
  { label: "Maitland", lat: 28.6270, lng: -81.3630, radius: 2000 },
  { label: "I-Drive / ICON", lat: 28.4430, lng: -81.4700, radius: 2000 },
  { label: "Pointe Orlando", lat: 28.4310, lng: -81.4690, radius: 1200 },
  { label: "Universal CityWalk", lat: 28.4720, lng: -81.4680, radius: 1500 },
  { label: "Disney Springs", lat: 28.3700, lng: -81.5190, radius: 1500 },
]);

export const DISTRICTS_BY_CITY = Object.freeze({ orlando: ORLANDO_DISTRICTS });

const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
const MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.formattedAddress", "places.types",
  "places.primaryType", "places.businessStatus", "places.priceLevel",
  "places.regularOpeningHours", "places.utcOffsetMinutes", "places.websiteUri",
].join(",");

/**
 * Drop types Places will reject, so one bad entry cannot 400 the whole sweep.
 * Returns { usable, rejected } — rejected is reported, never swallowed.
 */
export async function preflightTypes(types, key, fetchImpl) {
  const f = fetchImpl || fetch;
  const usable = [], rejected = [];
  for (const t of types) {
    try {
      const r = await f(NEARBY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
        body: JSON.stringify({
          includedTypes: [t], maxResultCount: 1,
          locationRestriction: { circle: { center: { latitude: 28.54, longitude: -81.379 }, radius: 1000 } },
        }),
      });
      if (r.ok) usable.push(t);
      else rejected.push({ type: t, status: r.status });
    } catch (e) { rejected.push({ type: t, status: "error" }); }
  }
  return { usable, rejected };
}

/**
 * Sweep the districts, union and dedupe by place_id.
 * Returns { places, stats } — stats carries the saturation curve so "we swept a
 * lot" can be checked rather than asserted.
 */
export async function sweepDistricts(districts, types, key, fetchImpl) {
  const f = fetchImpl || fetch;
  const byId = new Map();
  const curve = [];
  for (const d of districts) {
    const before = byId.size;
    let status = 0;
    try {
      const r = await f(NEARBY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": MASK },
        body: JSON.stringify({
          includedTypes: types, maxResultCount: 20,
          locationRestriction: { circle: { center: { latitude: d.lat, longitude: d.lng }, radius: d.radius } },
          rankPreference: "POPULARITY",
        }),
      });
      status = r.status;
      if (r.ok) {
        const j = await r.json();
        for (const p of (j.places || [])) if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
      }
    } catch (e) { status = "error"; }
    // A district contributing 0 NEW ids is the saturation signal. A district
    // returning a non-200 is a DIFFERENT thing and must not read as saturation.
    curve.push({ district: d.label, status, added: byId.size - before, total: byId.size });
  }
  return { places: [...byId.values()], stats: { curve, total: byId.size } };
}

// Same-brand, different-venue collisions. "Hard Rock Live Orlando" resolved to
// "Hard Rock Cafe" (4.5★, 14,817) — a concert hall and a restaurant sharing a
// brand. A name-similarity check passes it on the shared token, which is how it
// got through. These words distinguish the VENUE within a brand, so a match that
// shares the brand but disagrees on one of these is not confident.
export const VENUE_QUALIFIERS = Object.freeze([
  "live", "cafe", "arena", "theater", "theatre", "hall", "club", "lounge",
  "bar", "grill", "stadium", "amphitheater", "amphitheatre", "casino", "hotel",
]);

/**
 * True when `query` and `resolved` share a brand token but disagree on a venue
 * qualifier — i.e. probably a different venue of the same brand.
 */
export function isBrandCollision(query, resolved) {
  const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const q = words(query), r = words(resolved);
  if (!q.length || !r.length) return false;
  const qQual = q.filter((w) => VENUE_QUALIFIERS.includes(w));
  const rQual = r.filter((w) => VENUE_QUALIFIERS.includes(w));
  const brandShared = q.some((w) => !VENUE_QUALIFIERS.includes(w) && w.length > 2 && r.includes(w));
  if (!brandShared) return false;
  // Shares a brand token. Collision when each names a qualifier and they differ.
  if (!qQual.length || !rQual.length) return false;
  return !qQual.some((w) => rQual.includes(w));
}
