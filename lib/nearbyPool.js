// lib/nearbyPool.js — THE CANDIDATES COME FROM WHERE THE READER IS.
//
// THE DEFECT, measured 2026-08-22 (owner, standing in Sarasota): "the results
// seem like it is the same [as Parrish] … why are we not finding the best
// places around me, this needs to be a local discovery place and it is not
// doing that."
//
// He was right, and it was never a ranking problem. Every rail's candidates
// came from lib/landing.js rankedFor(category, CITY) — a Google "best X" text
// search centred on a CITY CENTROID and capped at fifteen rows:
//
//     const top = pool.slice(0, 15);
//
// A metro reads four cities × four categories, so every rail on the homepage
// was choosing from at most ~150 places. Measured against owned inventory:
//
//     from Sarasota   432 places ≤3mi   691 ≤5mi   1,394 ≤10mi   2,319 ≤17mi
//     from Parrish     48 places ≤3mi   106 ≤5mi     404 ≤10mi   1,387 ≤17mi
//
// 960 food places sit within 17 miles of the Sarasota pin. The eat rail chose
// from about sixty, and those sixty were retrieved by searching "best
// restaurants Sarasota", not by asking what is near the pin.
//
// AND THAT IS WHY TWO TOWNS LOOKED IDENTICAL. rankedFor's second round drops
// the city name and searches a 30-mile radius, accepting results out to 39
// (`radiusM / 1609.34 * 1.3`). Sarasota and Parrish centroids are 18.5 miles
// apart and both metros include Bradenton, so those circles are effectively one
// circle. marketReviewFloor then removes places "far below their own market's
// attention level" — computed across that regional pool — which strips exactly
// the small local rooms and keeps the regional famous names. Both towns
// converge on the same answer BY CONSTRUCTION. Only 51–57% of Sarasota's
// 17-mile inventory is even within 17 miles of Parrish, and 0% of the beaches
// are: the data knew he had moved, the retrieval never asked it.
//
// Distance was only ever a FILTER APPLIED AFTER RETRIEVAL (17mi, widen 25). It
// re-sorted the same regional list; it could not change what was considered.
//
// THE CURE IS NOT NEW. This codebase has diagnosed the same disease five times
// — locals (v8.7), trending (v8.9), summer (v8.13), breakfast and the 30-minute
// break (v8.18), family and events (v8.19) — and cured it the same way every
// time: stop intersecting the anchor top-N, build the pool from owned inventory
// near the reader. buildIdentityPool in lib/railsData.js is that cure for one
// rail at a time. This module is that cure for the ANCHOR POOLS themselves, so
// `best`, `today`, `eat`, `gems`, `datenight` and `tonight` finally get it too.
//
// WHAT THIS DELIBERATELY DOES NOT CHANGE:
//   · the ONE stamp — governedScoreOf, which already carries a distance term,
//     so a nearer place of equal quality already outranks a further one. The
//     score never needed teaching; the retrieval did.
//   · the ONE comparator — byTopRated.
//   · every rail's identity predicate: they are pure functions over rows and
//     they judge these rows exactly as they judged the old ones.
//   · the city path. A landing page for a town still ranks that town, and a
//     reader whose area is genuinely thin still gets it (see the union in
//     lib/railsData.js loadPools).
import { placeAllowed } from "./placeFilter.js";
import { existingTypeSignals } from "./placeCategory.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { byTopRated } from "./ranking.js";
import { BEACH_NEAR_MI, isBeachPlace } from "./beaches.js";

/**
 * rail pool slug -> the wf_inventory `category` value, the discovery gate, and
 * an optional IDENTITY on top of it.
 *
 * Why beaches need the extra one: lib/placeFilter.js's beach gate admits on the
 * NAME, and inventory categorises by name too, so `category = 'beach'` within
 * 23 miles of Parrish holds tennis courts, three numbered beach accesses, a car
 * park, a lifeguard tower, a wedding venue, a fishing pier and an Asian massage
 * parlour — all measured. lib/beaches.js isBeachPlace() is the identity that
 * answers "is this a beach a reader can sit on", the same primary-type
 * discipline lib/breakfast.js got in v8.30.1.
 */
export const NEARBY_CATS = {
  restaurants: { column: "food", gate: "food" },
  "things-to-do": { column: "attractions", gate: "attractions" },
  nightlife: { column: "nightlife", gate: "nightlife" },
  beaches: { column: "beach", gate: "beach", identity: isBeachPlace },
};

/**
 * THE LADDER. Try the tightest ring first and widen only when it cannot fill.
 *
 * 6 miles is the first ring because that is what "around me" means to someone
 * standing downtown — 691 of Sarasota's places are inside five. It is also the
 * ring Parrish CANNOT fill (106 places, most of them retail), which is the
 * point: the ladder is what lets one rule serve a dense downtown and a rural
 * town honestly instead of splitting the difference at 17 and serving neither.
 *
 * Beaches keep their own law. BEACH_NEAR_MI is the owner's 23-mile rule
 * (2026-07-28) and it is imported, never restated, so there is still exactly
 * one of it.
 */
export const NEARBY_RINGS_MI = [6, 10, 17];
export const NEARBY_BEACH_RINGS_MI = [BEACH_NEAR_MI];

/** Enough candidates that every rail reading this pool has a real field to
 *  filter — not a target for how many CARDS ship, which is MAX_CARDS and is
 *  decided far downstream. A ring that reaches this stops the ladder. */
export const NEARBY_TARGET_ROWS = 45;

/** What one pool hands on. Well above MAX_CARDS on purpose: the rails filter
 *  this by identity and then by distance, and a cap that binds before those
 *  run is the fifteen-row cap this module exists to remove. */
export const NEARBY_POOL_CAP = 60;

/** Below this, the reader's area is genuinely thin and the city pools stay in
 *  full rather than being replaced by a handful of rows. Parrish holds 106
 *  places within five miles against Sarasota's 691; a rule that serves a
 *  downtown by starving a rural town is a preference, not a rule. Set above
 *  MAX_CARDS on purpose — every rail then filters this pool by its own
 *  identity, and a pool that only just fills one rail cannot fill fifteen. */
export const NEARBY_STANDALONE_MIN = 20;

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function nearbyMiBetween(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

/**
 * PURE. An inventory row in the shape every rail predicate and slimPlace
 * already read. Split out from the fetch so scripts/check-nearby-pool.mjs can
 * execute the gate and the shaping against real rows with no network.
 *
 * The rating/review floor is the same one buildIdentityPool applies: a place
 * with no rating cannot be scored, and the governed score would be null, which
 * sorts last by construction anyway. There is NO regional review floor here —
 * marketReviewFloor is the mechanism that was deleting the local rooms, and
 * re-applying it over a six-mile ring would delete them again.
 */
export function shapeNearbyRow(row, origin, gate, opts) {
  const identity = opts && opts.identity;
  if (!row || !row.place_id || !row.name) return null;
  if (!(Number.isFinite(row.lat) && Number.isFinite(row.lng))) return null;
  const rating = Number(row.signals && row.signals.rating);
  const reviews = Number(row.signals && row.signals.reviews);
  if (!(rating > 0 && reviews >= 15)) return null;
  const shaped = {
    id: row.place_id,
    name: row.name,
    rating,
    reviews,
    // primaryType rides along (v8.19's lesson, and v8.30.1's): the strong
    // identities judge what a place IS by its primary type, and a shape that
    // drops it reduces every one of them to name evidence.
    primaryType: row.primary_type || null,
    types: existingTypeSignals(row),
    status: row.status || "OPERATIONAL",
    lat: row.lat,
    lng: row.lng,
    priceLevel: row.signals && row.signals.priceNum != null ? row.signals.priceNum : null,
    photoRef: row.photo_ref || null,
    // The creator-video lookup keys on a city NAME (v8.6: called bare it
    // returns false for every place). The city path passes city.name; a shape
    // that hard-codes null is how buildIdentityPool's widened rows quietly
    // stopped earning the creator term. Threaded from the caller instead.
    city: (opts && opts.locName) || null,
    distMi: nearbyMiBetween(origin.lat, origin.lng, row.lat, row.lng),
    oh: null,
    utcOffset: null,
    trending: false,
    trend_reason: null,
  };
  // THE SAME DISCOVERY GATE THE CITY PATH APPLIES. rankedFor filters its Google
  // results through placeAllowed(cat.gateCat, …); inventory has to walk through
  // the same door or this pool becomes the one place in the app where a
  // tennis court can be a beach and a general contractor can be an attraction.
  if (!placeAllowed(gate, null, shaped)) return null;
  // …and the category's own identity where it has one. The gate answers "may
  // this appear in this section"; the identity answers "is this the thing".
  if (identity && !identity(shaped)) return null;
  return shaped;
}

/** The bbox a ring needs, padded so the exact haversine below never trims a
 *  row the box should have contained. */
export function nearbyBbox(origin, radiusMi) {
  const dLat = radiusMi / 69 + 0.02;
  const dLng = radiusMi / (69 * Math.cos(rad(origin.lat))) + 0.02;
  return {
    minLat: origin.lat - dLat, maxLat: origin.lat + dLat,
    minLng: origin.lng - dLng, maxLng: origin.lng + dLng,
  };
}

/**
 * The reader-first pool for one category.
 *
 * @param {{lat:number,lng:number}} origin the READER's point, never a centroid
 * @param {string} catSlug a NEARBY_CATS key
 * @param {{locName?:string, rings?:number[], fetchImpl?:Function}} [opts]
 *   locName is threaded through to governedScoreOf so the creator-video term
 *   still applies — the city path passes city.name for exactly that reason, and
 *   buildIdentityPool passing null is why widened rows quietly lost it.
 * @returns {Promise<object[]>} ranked rows, nearest ring that could fill
 */
export async function buildNearbyPool(origin, catSlug, opts) {
  const cfg = NEARBY_CATS[catSlug];
  if (!cfg) return [];
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return [];
  const doFetch = (opts && opts.fetchImpl) || fetch;
  const rings = (opts && opts.rings)
    || (catSlug === "beaches" ? NEARBY_BEACH_RINGS_MI : NEARBY_RINGS_MI);
  const locName = (opts && opts.locName) || null;

  let best = [];
  for (const radiusMi of rings) {
    const b = nearbyBbox(origin, radiusMi);
    const q = `lat=gte.${b.minLat.toFixed(4)}&lat=lte.${b.maxLat.toFixed(4)}`
      + `&lng=gte.${b.minLng.toFixed(4)}&lng=lte.${b.maxLng.toFixed(4)}`
      + `&category=eq.${encodeURIComponent(cfg.column)}`;
    let rows = [];
    try {
      // Ordered by review volume BEFORE the row cap, for the reason
      // buildIdentityPool documents: an unordered REST read over a box holding
      // more rows than the limit returns an arbitrary subset, and the cap must
      // trim the tail rather than the anchors.
      const r = await doFetch(
        `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,google_types,primary_type,signals,photo_ref,status,editorial`
        + `&status=eq.OPERATIONAL&${q}&order=signals->reviews.desc.nullslast&limit=400`,
        { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } },
      );
      if (!r || !r.ok) {
        // NEVER SILENT. The identity pools (v8.18/v8.19) read inventory through
        // the same credentials inside a bare `if (r.ok)`, so the day that key
        // is rotated or disabled every one of them returns [] and the rails
        // quietly revert to the anchor top-N — the exact disease, with nothing
        // in the logs. Measured 2026-08-22: this project's LEGACY anon JWT is
        // already disabled and answers 401; only the publishable key works.
        // A rail going quiet must say so.
        console.warn(`nearbyPool: wf_inventory read failed for ${catSlug} at ${radiusMi}mi — HTTP ${r ? r.status : "network"}. Rails fall back to the city pools.`);
        continue;
      }
      rows = await r.json();
    } catch (e) {
      console.warn(`nearbyPool: wf_inventory read threw for ${catSlug} at ${radiusMi}mi — ${e && e.message}`);
      continue;
    }
    const out = [];
    const seen = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const shaped = shapeNearbyRow(row, origin, cfg.gate, { locName, identity: cfg.identity });
      if (!shaped) continue;
      if (!(shaped.distMi <= radiusMi)) continue;      // the box is square; the ring is not
      if (seen.has(shaped.id)) continue;
      seen.add(shaped.id);
      const g = governedScoreOf(shaped, locName);
      if (!Number.isFinite(g)) continue;               // unscored sorts last anyway; drop it here
      shaped.governed_score = g;
      shaped._s = g;
      shaped._nearbyRingMi = radiusMi;
      out.push(shaped);
    }
    // Keep the widest attempt so a thin ring never LOSES rows a wider one found.
    if (out.length > best.length) best = out;
    if (out.length >= NEARBY_TARGET_ROWS) break;
  }
  best.sort(byTopRated);
  return best.slice(0, NEARBY_POOL_CAP);
}
