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
// THE 20-CAP, AND WHY "PAGING" IS NOT THE FIX
// Nearby Search (New) has NO pagination. Measured 2026-07-29:
//   maxResultCount: 50  ->  400 "must be between 1 and 20 inclusively"
//   pageSize            ->  400 "Unknown name \"pageSize\": Cannot find field"
//   response            ->  never carries nextPageToken
// Twenty is a hard ceiling PER REQUEST. searchText does page (3 pages / 60
// results, confirmed) — but it is a different, fuzzier retrieval mode.
//
// So more results come from making more requests that each see less. Two ways,
// both measured at ICON Park:
//
//   1. PER-TYPE FAN-OUT. The cap is per request, not per type, so one request
//      per type multiplies the ceiling. All-six-types-at-once returned 20 ids;
//      one type at a time returned 54. Across all 12 districts: 78 -> 162
//      eligible venues for 12 -> 72 calls.
//
//   2. SATURATION SUBDIVISION. A response holding exactly 20 results is not an
//      answer, it is a truncation — there is no way to know what was cut. So
//      treat n === 20 as SATURATED and re-query the same area as four smaller
//      overlapping circles.
//
// The second one is what recovers the ICON Park venues, and the reason is worth
// recording because it invalidated my first diagnosis. Tom's Watch Bar (6,738
// reviews), Ole Red (5,928) and Tin Roof (4,562) were missing from the #429
// census. I attributed it to the 20-cap and expected per-type fan-out to fix it.
// It did not — all three were still absent after fan-out. Measured instead:
//   - all three sit INSIDE the I-Drive circle (41m, 86m, 655m from the anchor,
//     radius 2000m) — so it was never geography;
//   - at radius 800m, includedTypes:["bar"] returns all three;
//   - at radius 2000m, includedTypes:["bar"] returns 20 OTHER places.
// `rankPreference: POPULARITY` does not mean "most reviewed". A 6,738-review
// venue loses to twenty places Google ranks higher by its own prominence signal.
// The only reliable lever is to shrink the circle until the cap stops binding.

// COST — AND THE DAILY QUOTA, WHICH IS THE REAL BOUND
// place_id is storable indefinitely under Google's terms; name/rating/review
// count/hours are place content and capped at 30 days. This module rides the
// SAME 30-day cache the rest of landing.js uses, under its own key prefix so it
// can never overwrite an existing row.
//
// Subdivision is not cheap. A full Orlando census cost 244 requests and
// EXHAUSTED THE DAILY SearchNearby QUOTA on this project:
//   429 "Quota exceeded ... limit 'SearchNearbyRequest per day'"
// Everything after that point returned zero. A district that returns zero
// because the quota died is indistinguishable, in the data, from a district
// with no nightlife in it — so the sweep now HALTS on the first 429 and reports
// stats.quotaExhausted rather than handing back a thin census that looks
// complete. Whatever consumes this must check that flag before writing.

// Places' hard per-request ceiling for Nearby Search (New). Not a tunable.
export const NEARBY_MAX_RESULTS = 20;
// How many times a saturated circle may be subdivided. 2000m -> 1000m -> 500m
// reached every ICON Park venue; deeper spends calls for almost nothing.
export const MAX_SUBDIVISION_DEPTH = 2;
// Hard ceiling on requests per census, so a pathologically dense metro cannot
// run up an unbounded bill. Exceeding it is REPORTED in stats, never silent.
export const MAX_SWEEP_CALLS = 600;

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
  // LANDMARK SEEDS. Tight circles on entertainment complexes dense enough that
  // the district circle containing them is permanently saturated. These are not
  // "extra districts" — they are the places subdivision would have to reach
  // anyway, seeded directly so recovery does not depend on it. ICON Park is the
  // measured case: three venues over 4,500 reviews each, all inside the I-Drive
  // circle, none retrievable at that radius.
  { label: "ICON Park", lat: 28.4432, lng: -81.4697, radius: 500, seed: true },
  { label: "Universal CityWalk core", lat: 28.4726, lng: -81.4668, radius: 400, seed: true },
  { label: "Disney Springs West Side", lat: 28.3690, lng: -81.5205, radius: 500, seed: true },
  { label: "Wall Street Plaza", lat: 28.5424, lng: -81.3781, radius: 250, seed: true },
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
 * Split a saturated circle into four overlapping children.
 *
 * Centres sit at (±r/2, ±r/2); each child gets radius 0.75r. That geometry
 * covers the parent with margin — the worst-uncovered point of a circle split
 * this way is the one on the parent edge midway between two child centres, at
 * distance sqrt(0.5)r ~= 0.707r from the nearest child centre, which 0.75r
 * clears. The children overlap by design; the caller dedupes by place_id, so
 * overlap costs requests but cannot double-count a venue.
 */
export function subdivideCircle(center, radius) {
  const half = radius / 2;
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((center.lat * Math.PI) / 180));
  const childRadius = Math.round(radius * 0.75);
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ({
    lat: center.lat + a * dLat,
    lng: center.lng + b * dLng,
    radius: childRadius,
  }));
}

async function nearbyOnce(circle, type, key, f) {
  try {
    const r = await f(NEARBY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": MASK },
      body: JSON.stringify({
        includedTypes: [type], maxResultCount: NEARBY_MAX_RESULTS,
        locationRestriction: {
          circle: { center: { latitude: circle.lat, longitude: circle.lng }, radius: circle.radius },
        },
        rankPreference: "POPULARITY",
      }),
    });
    if (!r.ok) return { status: r.status, places: [] };
    const j = await r.json();
    return { status: r.status, places: (j.places || []).filter((p) => p && p.id) };
  } catch (e) {
    return { status: "error", places: [] };
  }
}

/**
 * Sweep the districts, union and dedupe by place_id.
 *
 * One request per (circle, type) — the 20-cap is per request, so splitting the
 * type list raises the ceiling. Any request that comes back holding exactly
 * NEARBY_MAX_RESULTS is treated as TRUNCATED, not answered, and its circle is
 * subdivided and re-queried down to MAX_SUBDIVISION_DEPTH.
 *
 * Returns { places, stats }. stats.curve records every district; stats.calls,
 * stats.saturated, stats.recovered and stats.budgetExhausted make the cost and
 * the effect of subdivision checkable rather than asserted.
 */
export async function sweepDistricts(districts, types, key, fetchImpl) {
  const f = fetchImpl || fetch;
  const byId = new Map();
  const curve = [];
  let calls = 0, saturated = 0, recovered = 0, budgetExhausted = false;
  // A 429 means Places stopped answering. Every subsequent district would report
  // zero — which is indistinguishable from a district with no nightlife in it.
  // Measured 2026-07-29: a 244-call census exhausted the DAILY SearchNearby
  // quota, and the last seven districts (including all four landmark seeds)
  // returned 0 for that reason alone. Stop on the first 429 and say so; a
  // partial census that reports itself as complete is the worst outcome here.
  let quotaExhausted = false;

  const take = (places) => {
    let added = 0;
    for (const p of places) if (!byId.has(p.id)) { byId.set(p.id, p); added++; }
    return added;
  };

  for (const d of districts) {
    const before = byId.size;
    const statuses = [];
    for (const type of types) {
      if (quotaExhausted) break;
      // Breadth-first over circles; a saturated circle enqueues its children.
      let frontier = [{ lat: d.lat, lng: d.lng, radius: d.radius }];
      for (let depth = 0; depth <= MAX_SUBDIVISION_DEPTH && frontier.length; depth++) {
        const next = [];
        for (const circle of frontier) {
          if (calls >= MAX_SWEEP_CALLS) { budgetExhausted = true; break; }
          calls++;
          const { status, places } = await nearbyOnce(circle, type, key, f);
          statuses.push(status);
          if (status === 429) { quotaExhausted = true; break; }
          const added = take(places);
          if (depth > 0) recovered += added;
          // Exactly at the cap means Places truncated the answer and there is
          // no token to ask for the rest. Look at a smaller area instead.
          if (status === 200 && places.length >= NEARBY_MAX_RESULTS && depth < MAX_SUBDIVISION_DEPTH) {
            saturated++;
            next.push(...subdivideCircle(circle, circle.radius));
          }
        }
        if (budgetExhausted || quotaExhausted) break;
        frontier = next;
      }
      if (budgetExhausted || quotaExhausted) break;
    }
    // A district contributing 0 NEW ids is the saturation signal. A district
    // whose requests returned a non-200 is a DIFFERENT thing and must not read
    // as saturation — so the status recorded is the worst one seen, not the last.
    const bad = statuses.find((s) => s !== 200);
    curve.push({
      district: d.label,
      status: statuses.length === 0 ? 0 : (bad === undefined ? 200 : bad),
      added: byId.size - before,
      total: byId.size,
      seed: d.seed === true,
    });
    if (budgetExhausted || quotaExhausted) break;
  }
  return {
    places: [...byId.values()],
    stats: { curve, total: byId.size, calls, saturated, recovered, budgetExhausted, quotaExhausted },
  };
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
