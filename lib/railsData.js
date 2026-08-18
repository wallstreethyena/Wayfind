// lib/railsData.js — SERVER ONLY. Turns the 15 rail definitions into 15 rails
// of real, ranked places.
//
// It imports lib/landing.js, which imports React components at module scope,
// so this module must never be pulled into a client bundle. app/v8/page.js is a
// server component; it stays that way.
//
// THE ONE IDEA HERE: 15 rails, but only FOUR ranked pools. A rail is a LENS on
// a pool, not its own query. Ranking each rail separately would mean 15 Google
// searches per city per regeneration to answer questions the same four pools
// already answer — and, worse, it would let two rails disagree about the same
// place's rank on the same screen.
//
// The lens itself is lib/railSelect.js. That split matters: WHICH pools a rail
// reads and WHAT it keeps from them is product judgement that needs the
// seasons, creator-video and price modules; this file is the plumbing that
// fetches, merges, re-origins distances and enforces the fill rules.
//
// COST: rankedFor() is Supabase-cached for 30 days and every route that calls
// this sets `revalidate`, so a cold metro costs (cities x 4 cats x <=2 searches)
// ONCE per month, at regeneration, never per request. Nothing here runs in the
// browser and nothing here is on the critical path of a visit.
import { rankedFor, LANDING_CITIES } from "./landing.js";
import { regionFor, partForHour } from "./dayparts.js";
import { siteHourFloat, tzForPoint } from "./nowContext.js";
import { GUIDES } from "./guides.js";
import { readMinutes } from "./localEdit.js";
import { RAILS } from "./rails.js";
import { RAIL_SELECT, fillRails, MIN_CARDS, MAX_CARDS } from "./railSelect.js";
import { spotsByCity } from "./creatorVideos.js";
import { sameVenueName, CREATOR_FINDS_RADIUS_MI } from "./creatorFinds.js";
import { getPlaceDetails } from "./placeDetails.js";
import { governedScoreOf } from "./lawfulOrder.js";

// A rail's axis is a PROMISE. "Places you'd never find" that shows a place with
// 40,000 reviews is a lie, and the fix is never to relax the filter — it is to
// ship the rail with no cards and an honest line. lib/railSelect.js MIN_CARDS
// is where that threshold lives, next to the selectors it governs.

// Neighbour towns folded into a metro's pool. Distance-, obscurity- and
// time-budget rails need a long tail that one town-centre search does not have:
// a 15-row Sarasota pool is all high-volume anchors, so "Worth the drive"
// (>=12mi) and "Places you'd never find" (<=600 reviews) would both come back
// empty from it. Keys and values are LANDING_CITIES slugs; the first entry is
// always the primary, and every distance is recomputed from ITS centre so the
// union cannot carry three different meanings of "2.4 mi".
export const RAIL_METRO_POOLS = {
  sarasota: ["sarasota", "bradenton", "siesta-key", "venice"],
  bradenton: ["bradenton", "parrish", "anna-maria-island", "sarasota"],
  parrish: ["parrish", "ellenton", "palmetto", "bradenton"],
  tampa: ["tampa"],
  orlando: ["orlando"],
  honolulu: ["honolulu", "kailua"],
  lahaina: ["lahaina", "kihei"],
  "kailua-kona": ["kailua-kona", "hilo"],
  lihue: ["lihue", "kapaa"],
};

export function poolCitiesFor(citySlug) {
  return RAIL_METRO_POOLS[citySlug] || [citySlug];
}

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function haversineMi(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

// Everything IconicPlaceCard reads, and nothing else. rankedFor() rows carry
// address strings, raw Google type arrays and an internal `_s` — shipping those
// through the RSC payload for 15 rails x 8 cards is kilobytes of nothing.
// `types` stays because experienceTags() and coarseCat() both read it.
export function slimPlace(p) {
  if (!p || !p.id || !p.name) return null;
  return {
    id: p.id,
    name: p.name,
    rating: p.rating != null ? p.rating : null,
    reviews: p.reviews || 0,
    types: Array.isArray(p.types) ? p.types.slice(0, 8) : [],
    status: p.status || null,
    lat: p.lat != null ? p.lat : null,
    lng: p.lng != null ? p.lng : null,
    priceLevel: p.priceLevel || null,
    photoRef: p.photoRef || null,
    // v8.6 — carried so the CLIENT can still match creator videos. Not for
    // display: creatorVideosFor(place, locName) keys on city, and without it
    // hasCreatorVideoAt returns false for every place. Proven by call:
    // Marie Selby / Quiero Coffee / Perspire Sauna are all false with no city
    // and true with one.
    city: p.city || null,
    distMi: Number.isFinite(p.distMi) ? Math.round(p.distMi * 10) / 10 : null,
    // Structured hours, never a frozen openNow boolean — these pages are
    // prerendered and the row behind them can be 30 days old. businessStatus()
    // computes state in the browser against the viewer's clock.
    oh: p.oh || null,
    utcOffset: p.utcOffset != null ? p.utcOffset : null,
    trending: !!p.trending,
    trend_reason: p.trend_reason || null,
    // Shown == sorted: the badge renders the number this row was ranked BY.
    governed_score: Number.isFinite(p.governed_score) ? p.governed_score : null,
    wfScore: Number.isFinite(p.wfScore) ? p.wfScore : null,
  };
}

/**
 * Rank every source category ONCE for a metro and return the merged pools.
 * @returns {Promise<Record<string, object[]>>} catSlug -> ranked, deduped rows
 */
export async function loadPools(citySlug, opts) {
  const cities = poolCitiesFor(citySlug);
  // "creators" is not a rankedFor category — it is built from the creator
  // registry by buildCreatorsPool() after the ranked pools exist.
  const cats = [...new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools))]
    .filter((c) => c !== "creators");
  const withPhotos = !(opts && opts.withPhotos === false);

  const jobs = [];
  for (const cat of cats) for (const city of cities) jobs.push({ cat, city });
  const results = await Promise.all(jobs.map(({ cat, city }) =>
    // Fail-soft per query: one town's outage must not empty the whole metro.
    rankedFor(cat, city, { withPhotos }).then((r) => r || []).catch(() => [])));

  const pools = {};
  cats.forEach((cat) => { pools[cat] = []; });
  const seenByCat = {};
  cats.forEach((cat) => { seenByCat[cat] = new Set(); });

  jobs.forEach(({ cat, city }, i) => {
    const isPrimary = city === cities[0];
    for (const row of results[i]) {
      if (!row || !row.id || seenByCat[cat].has(row.id)) continue;
      seenByCat[cat].add(row.id);
      pools[cat].push(isPrimary ? row : { ...row, _neighbour: city });
    }
  });
  return { pools, cities, primaryCity: cities[0] };
}

/**
 * v8.7 — THE CREATORS POOL. Locals Know sources from the creator LIBRARY,
 * not from the top of the ranked pools (owner, 2026-08-18, on a "Nothing near
 * Sarasota clears this bar" screenshot). The registry's spots are small
 * counters and cafés that rarely crack a top-15 anchor pool, so filtering the
 * pools found nothing — Tampa: 42 curated spots in inventory, 0 shown.
 *
 * Three sources, in trust order, per spot:
 *   1. A ranked-pool row for the same venue (by placeId, then by
 *      sameVenueName within the same city) — it has a measured distance and
 *      the score the rest of the page ranked by.
 *   2. A cached Place Details hydration by the spot's own placeId — real
 *      rating, real coordinates, scored by governedScoreOf, the ONE stamp
 *      every surface uses (shown == sorted holds).
 *   3. Nothing. A spot with no placeId and no pool match is SKIPPED, never
 *      guessed into a card — same fail-closed rule as mergeCreatorInventory.
 *
 * Radius is CREATOR_FINDS_RADIUS_MI (25) from the same origin every distance
 * on the page is measured from, and a registry group with no distance is
 * skipped, never guessed.
 */
async function buildCreatorsPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const groups = spotsByCity(origin);
  const byId = new Map();
  const allRows = [];
  for (const cat of Object.keys(pools)) {
    for (const p of pools[cat]) {
      if (!p || !p.id) continue;
      if (!byId.has(p.id)) { byId.set(p.id, p); allRows.push(p); }
    }
  }
  const jobs = [];
  for (const g of groups) {
    if (typeof g.distMi !== "number" || !isFinite(g.distMi) || g.distMi > CREATOR_FINDS_RADIUS_MI) continue;
    for (const spot of g.spots) {
      if (!spot || !spot.name) continue;
      jobs.push((async () => {
        let row = (spot.placeId && byId.get(spot.placeId)) || null;
        if (!row) row = allRows.find((p) => sameVenueName(p.name, spot.name) && (!spot.city || !p.city || p.city === spot.city)) || null;
        if (!row && spot.placeId) {
          const d = await getPlaceDetails(spot.placeId).catch(() => null);
          if (d && d.id && d.lat != null && d.lng != null) {
            row = {
              id: d.id, name: d.name,
              rating: d.rating != null ? d.rating : null,
              reviews: d.reviews || 0,
              types: Array.isArray(d.types) ? d.types : [],
              status: d.businessStatus || null,
              lat: d.lat, lng: d.lng,
              priceLevel: null,
              photoRef: d.photoRef || null,
              city: spot.city || null,
              distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng),
              oh: null, utcOffset: null,
              trending: false, trend_reason: null,
            };
            // The ONE stamp (lib/lawfulOrder.js): shown == sorted. The city
            // is the spot's own registry city so the creator +0.2 applies.
            const g2 = governedScoreOf(row, spot.city || null);
            if (Number.isFinite(g2)) { row.governed_score = g2; row._s = g2; }
          }
        }
        return row;
      })());
    }
  }
  const rows = (await Promise.all(jobs)).filter(Boolean);
  const seen = new Set();
  // v8.9 — every row in this pool is creator-posted BY CONSTRUCTION (it came
  // from the registry). The marker lets a selector admit them without a second
  // name-match round trip, which can miss when Google's displayName drifts
  // from the registry's match root ("Ryan's Coffee House" vs root "Ryan").
  // Deliberately NOT `creator_video` — that key is a scoring input in
  // lib/lawfulOrder.js, and pool-reused rows here already carry a stamped
  // score this marker must not perturb.
  for (const r of rows) { if (r) r._creatorSourced = true; }
  return rows.filter((r) => {
    if (!r || !r.id || seen.has(r.id)) return false;
    // The registry group gate above is the CITY centroid; the venue itself can
    // sit farther out (a Tampa venue 34mi from a Parrish reader while Tampa's
    // centroid is 24mi — measured on the preview, 2026-08-18). "Locals Know"
    // promises NEAR, so the venue's own measured distance takes the same gate.
    if (Number.isFinite(r.distMi) && r.distMi > CREATOR_FINDS_RADIUS_MI) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * The whole thing: pools -> 15 rails of ranked, axis-true places.
 *
 * @param {string} citySlug a LANDING_CITIES key
 * @param {{origin?: {lat:number,lng:number}}} [opts] — v8.7: when the caller
 *   knows the reader's REAL point (geolocation or a searched pin), distances
 *   and distance-gated rails are measured from it, not from the city centre.
 *   Owner, 2026-08-18: "i want the main page to leverage the exact user
 *   location … show everything that is the best near the user." Same rule the
 *   audit demands: compute distance from the same coordinates shown to the
 *   user. The pool RANK (score) is unchanged — quality is not a function of
 *   the reader — but every mile on a card and every ≤/≥-miles gate is theirs.
 * @returns {Promise<{ places: Record<string, object[]>, thin: string[], citySlug: string }>}
 */
export async function loadRailPlaces(citySlug, opts) {
  const { pools, primaryCity } = await loadPools(citySlug, opts);

  // Re-origin every distance. Default is the primary town's centre (neighbour
  // rows were measured from THEIR own centre by rankedFor(), which is correct
  // for their own landing page and wrong the moment they share a rail with
  // Sarasota's). When the caller passes the reader's real point, THAT is the
  // origin — near means near the reader, not near the city hall.
  const userOrigin = opts && opts.origin
    && Number.isFinite(opts.origin.lat) && Number.isFinite(opts.origin.lng)
    ? opts.origin : null;
  const origin = userOrigin || LANDING_CITIES[primaryCity];
  if (origin) {
    for (const cat of Object.keys(pools)) {
      for (const p of pools[cat]) {
        if (p.lat != null && p.lng != null) p.distMi = haversineMi(origin.lat, origin.lng, p.lat, p.lng);
      }
    }
  }
  // One merged ordering per pool so a rail never re-sorts against its source.
  for (const cat of Object.keys(pools)) {
    pools[cat].sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  }

  // The creators pool rides the same origin as every other distance on the page.
  pools.creators = await buildCreatorsPool(pools, origin).catch(() => []);

  const cityLabel = (LANDING_CITIES[primaryCity] || {}).name || null;
  const { places, thin } = fillRails(pools, slimPlace, { cityLabel });
  return { places, thin, citySlug: primaryCity };
}

export const RAIL_DATA_LIMITS = { MIN_CARDS, MAX_CARDS };

/**
 * Everything <DaypartRail> needs, in one server call. ONE builder, used by both
 * `/` and `/v8`, so the staging route and the real homepage cannot drift into
 * showing different things and only one of them being verified.
 *
 * @param {string} citySlug a LANDING_CITIES key
 */
export async function railMenuData(citySlug, opts) {
  const city = LANDING_CITIES[citySlug];
  if (!city) {
    // Unknown slug must not silently become Sarasota. Callers that already
    // validated (homepage RAIL_CITY, /api/rails nearestCity) never hit this.
    return {
      places: {},
      thin: RAILS.filter((r) => r.list).map((r) => r.id),
      citySlug: citySlug || null,
      cityLabel: null,
      region: "other",
      lat: null,
      lng: null,
      covered: false,
      daypart: "afternoon",
      guides: Object.entries(GUIDES)
        .map(([slug2, g]) => ({
          slug: slug2, title: g.title, teaser: g.teaser || g.description || "",
          region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g),
        }))
        .sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
    };
  }
  const slug = citySlug;
  const data = await loadRailPlaces(slug, { origin: opts && opts.origin }).catch(() => null);
  return {
    // Fail-soft: with no ranked data the rails still render, each one linking
    // to its own page. A homepage that loses its lists must not lose its
    // navigation too.
    places: (data && data.places) || {},
    thin: (data && data.thin) || RAILS.filter((r) => r.list).map((r) => r.id),
    citySlug: (data && data.citySlug) || slug,
    cityLabel: city.name,
    covered: true,
    region: regionFor(city.lat, city.lng),
    lat: city.lat,
    lng: city.lng,
    // The band the CITY is in at regeneration — a deterministic first paint the
    // browser then corrects to the visitor's own clock. Through
    // lib/nowContext.js, the one clock: the server runs in UTC and the city
    // does not.
    daypart: partForHour(siteHourFloat(new Date(), tzForPoint(city.lat, city.lng))),
    // EVERY guide, newest first. The Local Guides rail is wired to all of them,
    // not the three nearest: localEditIndex() drops any guide whose region has
    // no coordinates, which is right for a proximity rail and wrong for a
    // library.
    guides: Object.entries(GUIDES)
      .map(([slug2, g]) => ({
        slug: slug2, title: g.title, teaser: g.teaser || g.description || "",
        region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g),
      }))
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
  };
}
