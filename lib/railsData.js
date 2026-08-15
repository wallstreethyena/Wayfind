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
import { RAILS } from "./rails.js";
import { RAIL_SELECT, fillRails, MIN_CARDS, MAX_CARDS } from "./railSelect.js";

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
  const cats = [...new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools))];
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
 * The whole thing: pools -> 15 rails of ranked, axis-true places.
 *
 * @param {string} citySlug a LANDING_CITIES key
 * @returns {Promise<{ places: Record<string, object[]>, thin: string[], citySlug: string }>}
 */
export async function loadRailPlaces(citySlug, opts) {
  const { pools, primaryCity } = await loadPools(citySlug, opts);

  // Re-origin every distance on the primary town's centre. Neighbour rows were
  // measured from THEIR own centre by rankedFor(), which is correct for their
  // own landing page and wrong the moment they share a rail with Sarasota's.
  const origin = LANDING_CITIES[primaryCity];
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

  const { places, thin } = fillRails(pools, slimPlace);
  return { places, thin, citySlug: primaryCity };
}

export const RAIL_DATA_LIMITS = { MIN_CARDS, MAX_CARDS };
