// lib/railsData.js — SERVER ONLY. Turns the 15 rail definitions into 15 rails
// of real, ranked places.
//
// It imports lib/landing.js, which imports React components at module scope,
// so this module must never be pulled into a client bundle. app/v8/page.js is a
// server component; it stays that way.
import { rankedFor, rankedForCenter, LANDING_CITIES } from "./landing.js";
import { driveCentersWithin } from "./driveSourceCenters.js";
import { resolveRailCity } from "./locationHonesty.js";
import { regionFor, partForHour, DAYPART_IDS } from "./dayparts.js";
import { siteHourFloat, tzForPoint } from "./nowContext.js";
import { GUIDES } from "./guides.js";
import { readMinutes } from "./localEdit.js";
import { RAILS } from "./rails.js";
import { RAIL_SELECT, fillRails, MIN_CARDS, DRIVE_MIN_MI, DRIVE_REACH_MI } from "./railSelect.js";
import { NEAR_RADIUS_MI, WIDEN_RADIUS_MI } from "./todaysBest.js";
import { allCreators, spotsByCity } from "./creatorVideos.js";
import { sameVenueName, CREATOR_FINDS_RADIUS_MI } from "./creatorFinds.js";
import { getPlaceDetails } from "./placeDetails.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { summerEntriesNow, SUMMER_DAYTRIP_RADIUS_MI } from "./summerUniverse.js";
import { existingTypeSignals } from "./placeCategory.js";
import { isBreakfastPlace, BREAKFAST_NEAR_MI } from "./breakfast.js";
import { isQuickService, isStrongQuickService } from "./quickService.js";
import { isFamilyPlace, isStrongFamilyPlace, FAMILY_NEAR_MI, FAMILY_TYPES } from "./familyPlace.js";
import { isStrongTicketedVenue, EVENTS_NEAR_MI, TICKETED_TYPES } from "./eventVenue.js";
import { birthdayEntries } from "./birthdayUniverse.js";
import { isBirthdayPlace, isStrongBirthdayPlace, BIRTHDAY_NEAR_MI, BIRTHDAY_TYPES } from "./birthdayPlace.js";
import { localPickEntriesNear, LOCAL_PICK_REACH_MI, BAND_TO_PICK_DAYPART } from "./localPicks.js";
import { buildNearbyPool, NEARBY_CATS, NEARBY_STANDALONE_MIN } from "./nearbyPool.js";
import { fetchDeadline } from "./fetchDeadline.js";
import { fetchOwnedPool } from "./ownedPool.js";
import { settleLoad } from "./loadState.js";
import { nearestWater } from "./waterStations.js";
import { beachDecisionReason } from "./beachDecision.js";
import { makeReadCache } from "./inventoryReadCache.js";
import { primeConsolidatedInventoryReads } from "./inventoryBoxBatch.js";

export const RAILS_SERVER_DEADLINE_MS = 9000;

export const RAIL_METRO_POOLS = {
  sarasota: ["sarasota", "bradenton", "siesta-key", "venice"],
  bradenton: ["bradenton", "parrish", "anna-maria-island", "sarasota"],
  parrish: ["parrish", "ellenton", "palmetto", "bradenton"],
  tampa: ["tampa"],
  orlando: ["orlando"],
  miami: ["miami"],
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

export function slimPlace(p) {
  if (!p || !p.id || !p.name) return null;
  const creatorSources = Array.isArray(p._creatorSources)
    ? p._creatorSources.filter((source) => source && source.handle).map((source) => ({
      handle: source.handle, platform: source.platform || null, url: source.url || null,
    })) : [];
  return {
    id: p.id, name: p.name,
    rating: p.rating != null ? p.rating : null,
    reviews: p.reviews || 0,
    types: Array.isArray(p.types) ? p.types.slice(0, 8) : [],
    cuisines: Array.isArray(p.cuisines) ? p.cuisines.filter(Boolean) : [],
    primaryType: p.primaryType || p.primary_type || null,
    status: p.status || null,
    lat: p.lat != null ? p.lat : null,
    lng: p.lng != null ? p.lng : null,
    priceLevel: p.priceLevel || null,
    photoRef: p.photoRef || null,
    city: p.city || null,
    distMi: Number.isFinite(p.distMi) ? Math.round(p.distMi * 10) / 10 : null,
    oh: p.oh || null,
    utcOffset: p.utcOffset != null ? p.utcOffset : null,
    editorial: p.editorial || null,
    trending: !!p.trending,
    trend_reason: p.trend_reason || null,
    governed_score: Number.isFinite(p.governed_score) ? p.governed_score : null,
    wfScore: Number.isFinite(p.wfScore) ? p.wfScore : null,
    ...(p._summerWhy ? { summerWhy: p._summerWhy } : {}),
    ...(p._birthdayWhy ? { birthdayWhy: p._birthdayWhy } : {}),
    ...(p._ownerPickWhy ? { pickWhy: p._ownerPickWhy } : {}),
    ...(creatorSources.length ? { creatorHandles: creatorSources.map((source) => source.handle), creatorSources } : {}),
    ...(p.water ? { water: p.water, beachReason: beachDecisionReason(p.water) } : {}),
  };
}

async function attachBeachWater(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!list.length || !url || !anon) return rows || [];
  const lats = list.map((p) => p.lat), lngs = list.map((p) => p.lng);
  const pad = 0.03;
  const q = `lat=gte.${(Math.min(...lats) - pad).toFixed(4)}&lat=lte.${(Math.max(...lats) + pad).toFixed(4)}&lng=gte.${(Math.min(...lngs) - pad).toFixed(4)}&lng=lte.${(Math.max(...lngs) + pad).toFixed(4)}`;
  try {
    const response = await fetchDeadline(`${url}/rest/v1/wf_beach_water_geo?select=beach_place_id,result,advisory,sampled_at,lat,lng&${q}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` }, next: { revalidate: 3600 },
    }, 4000);
    if (!response.ok) return rows || [];
    const stations = await response.json();
    return (rows || []).map((p) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return p;
      const water = nearestWater(Array.isArray(stations) ? stations : [], p.lat, p.lng);
      return water ? { ...p, water: { result: water.result, advisory: !!water.advisory, sampled_at: water.sampled_at } } : p;
    });
  } catch { return rows || []; }
}

export async function loadPools(citySlug, opts) {
  const cities = poolCitiesFor(citySlug);
  const SYNTHETIC = new Set(["creators", "summer", "birthday", "breakfast", "quickeats", "family", "events", "localpicks"]);
  const cats = [...new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools))].filter((c) => !SYNTHETIC.has(c));
  const withPhotos = !(opts && opts.withPhotos === false);
  const readCache = opts && opts.readCache;
  const jobs = [];
  for (const cat of cats) for (const city of cities) jobs.push({ cat, city });
  if (readCache) {
    await primeConsolidatedInventoryReads(jobs.map(({ cat, city }) => ({ catSlug: cat, city: LANDING_CITIES[city] })), readCache).catch(() => {});
  }
  opts?.onStage?.("ranked");
  const results = await Promise.all(jobs.map(({ cat, city }) =>
    rankedFor(cat, city, { withPhotos, skipEditorial: true, readCache, inventoryOnly: true }).then((r) => r || []).catch(() => [])));
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
  const readerOrigin = opts && opts.origin && Number.isFinite(opts.origin.lat) && Number.isFinite(opts.origin.lng) ? opts.origin : null;
  if (readerOrigin) {
    const locName = (LANDING_CITIES[cities[0]] || {}).name || null;
    const nearbyCats = cats.filter((c) => NEARBY_CATS[c]);
    opts?.onStage?.("nearby");
    const built = await Promise.all(nearbyCats.map((c) => buildNearbyPool(readerOrigin, c, { locName, skipEditorial: true, readCache }).catch(() => [])));
    nearbyCats.forEach((cat, i) => {
      const near = built[i] || [];
      if (near.length < NEARBY_STANDALONE_MIN) return;
      const ids = new Set(near.map((r) => r.id));
      const trendingTail = (pools[cat] || []).filter((r) => r && r.trending === true && !ids.has(r.id));
      pools[cat] = [...near, ...trendingTail];
      seenByCat[cat] = new Set(pools[cat].map((r) => r.id));
    });
  }
  return { pools, cities, primaryCity: cities[0] };
}

// Type-targeted widening remains the cheap path for identities that have real
// Google type evidence. The type filter is applied in the database query BEFORE
// the 300-row cost bound, so unrelated businesses never compete for those slots.
async function buildIdentityPool(pools, origin, predicate, radiusMi, sourceCats, widenPredicate, opts) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const out = [];
  const seen = new Set();
  for (const cat of sourceCats) {
    for (const p of pools[cat] || []) {
      if (!p || !p.id || seen.has(p.id)) continue;
      if (!predicate(p)) continue;
      if (!(Number.isFinite(p.distMi) && p.distMi <= radiusMi)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  try {
    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    const typeOv = opts && Array.isArray(opts.typeOv) ? opts.typeOv : [];
    // A broad top-300 is forbidden. This helper may widen only when identity
    // evidence is already pushed into the query before the bound.
    if (url && anon && typeOv.length) {
      const dLat = radiusMi / 69 + 0.02;
      const dLng = radiusMi / (69 * Math.cos((origin.lat * Math.PI) / 180)) + 0.02;
      const q = `lat=gte.${(origin.lat - dLat).toFixed(4)}&lat=lte.${(origin.lat + dLat).toFixed(4)}` +
        `&lng=gte.${(origin.lng - dLng).toFixed(4)}&lng=lte.${(origin.lng + dLng).toFixed(4)}` +
        `&google_types=ov.%7B${typeOv.map(encodeURIComponent).join(",")}%7D`;
      const reqUrl = `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,google_types,primary_type,cuisines,signals,photo_ref&status=eq.OPERATIONAL&${q}&order=signals->reviews.desc.nullslast&limit=300`;
      const doRead = async () => {
        const resp = await fetchDeadline(reqUrl, { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } });
        if (!resp.ok) return { ok: false };
        return { ok: true, rows: await resp.json() };
      };
      const cacheKey = `idp:${origin.lat.toFixed(4)}:${origin.lng.toFixed(4)}:${radiusMi}:${typeOv.join(",")}`;
      const r = opts && opts.readCache && typeof opts.readCache.get === "function" ? await opts.readCache.get(cacheKey, doRead) : await doRead();
      if (r.ok) {
        for (const row of Array.isArray(r.rows) ? r.rows : []) {
          if (!row || !row.place_id || seen.has(row.place_id)) continue;
          const rating = Number(row.signals && row.signals.rating);
          const reviews = Number(row.signals && row.signals.reviews);
          if (!(rating > 0 && reviews >= 15)) continue;
          const shaped = {
            id: row.place_id, name: row.name, rating, reviews,
            primaryType: row.primary_type || null,
            cuisines: Array.isArray(row.cuisines) ? row.cuisines.filter(Boolean) : [],
            types: existingTypeSignals(row), status: row.status || "OPERATIONAL",
            lat: row.lat, lng: row.lng,
            priceLevel: row.signals && row.signals.priceNum != null ? row.signals.priceNum : null,
            photoRef: row.photo_ref || null, city: null,
            distMi: haversineMi(origin.lat, origin.lng, row.lat, row.lng),
            oh: null, utcOffset: null, trending: false, trend_reason: null,
          };
          if (!(widenPredicate || predicate)(shaped)) continue;
          if (!(shaped.distMi <= radiusMi)) continue;
          const g2 = governedScoreOf(shaped, null);
          if (Number.isFinite(g2)) { shaped.governed_score = g2; shaped._s = g2; }
          seen.add(shaped.id);
          out.push(shaped);
        }
      }
    }
  } catch {}
  out.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return out;
}

// Breakfast and Quick Eats do NOT have a safe type prefilter. Their old broad
// top-300 shelf was candidate starvation. Read food ONCE to the wider morning
// radius, identify both questions inside the complete owned pool, then rank.
async function buildMorningIdentityPools(pools, origin) {
  const breakfast = [];
  const quickeats = [];
  const seenBreakfast = new Set();
  const seenQuick = new Set();
  const addSource = (rows) => {
    for (const p of rows || []) {
      if (!p || !p.id) continue;
      if (!seenBreakfast.has(p.id) && Number.isFinite(p.distMi) && p.distMi <= BREAKFAST_NEAR_MI && isBreakfastPlace(p)) {
        seenBreakfast.add(p.id); breakfast.push(p);
      }
      if (!seenQuick.has(p.id) && Number.isFinite(p.distMi) && p.distMi <= 8 && isQuickService(p)) {
        seenQuick.add(p.id); quickeats.push(p);
      }
    }
  };
  addSource(pools.restaurants);
  addSource(pools.creators);
  {
    const radiusMi = Math.max(BREAKFAST_NEAR_MI, 8);
    const owned = await fetchOwnedPool(origin.lat, origin.lng, {
      categories: ["food"], radiusMi,
      identity: (place) => {
        if (Number(place?.reviews || 0) < 15) return null;
        const breakfastHit = Number(place.distMi) <= BREAKFAST_NEAR_MI && isBreakfastPlace(place);
        const quickHit = Number(place.distMi) <= 8 && isStrongQuickService(place);
        return breakfastHit || quickHit;
      },
    });
    if (owned.stats?.degraded) throw new Error("Morning inventory is incomplete");
    for (const p of owned.places || []) {
      if (!seenBreakfast.has(p.id) && Number(p.distMi) <= BREAKFAST_NEAR_MI && isBreakfastPlace(p)) {
        const g = governedScoreOf(p, null); if (Number.isFinite(g)) { p.governed_score = g; p._s = g; }
        seenBreakfast.add(p.id); breakfast.push(p);
      }
      if (!seenQuick.has(p.id) && Number(p.distMi) <= 8 && isStrongQuickService(p)) {
        const g = governedScoreOf(p, null); if (Number.isFinite(g)) { p.governed_score = g; p._s = g; }
        seenQuick.add(p.id); quickeats.push(p);
      }
    }
  }
  const sort = (a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0));
  breakfast.sort(sort); quickeats.sort(sort);
  return { breakfast, quickeats };
}

async function buildCreatorsPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const groups = spotsByCity(origin);
  const byId = new Map();
  const allRows = [];
  for (const cat of Object.keys(pools)) for (const p of pools[cat]) if (p && p.id && !byId.has(p.id)) { byId.set(p.id, p); allRows.push(p); }
  const jobs = [];
  const sourcesByPlaceId = new Map();
  const addSource = (placeId, video) => {
    const id = String(placeId || ""); const handle = String(video && video.creator || "").replace(/^@+/, "").trim();
    if (!id || !handle) return;
    const source = { handle, platform: video.platform || null, url: video.url || null };
    const list = sourcesByPlaceId.get(id) || []; const key = handle.toLowerCase();
    if (!list.some((item) => item.handle.toLowerCase() === key)) list.push(source);
    sourcesByPlaceId.set(id, list);
  };
  const creatorRegistry = allCreators();
  for (const creator of creatorRegistry.creators || []) for (const spot of creator.spots || []) addSource(spot.placeId, spot.video);
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
            row = { id: d.id, name: d.name, rating: d.rating != null ? d.rating : null, reviews: d.reviews || 0,
              types: Array.isArray(d.types) ? d.types : [], status: d.businessStatus || null, lat: d.lat, lng: d.lng,
              priceLevel: null, photoRef: d.photoRef || null, city: spot.city || null,
              distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng), oh: null, utcOffset: null, trending: false, trend_reason: null };
            const g2 = governedScoreOf(row, spot.city || null); if (Number.isFinite(g2)) { row.governed_score = g2; row._s = g2; }
          }
        }
        if (!row) return null;
        const directHandle = String(spot.video && spot.video.creator || "").replace(/^@+/, "").trim();
        const direct = directHandle ? [{ handle: directHandle, platform: spot.video.platform || null, url: spot.video.url || null }] : [];
        const exact = spot.placeId ? (sourcesByPlaceId.get(String(spot.placeId)) || []) : [];
        return { row, sources: exact.length ? exact : direct };
      })());
    }
  }
  const resolved = (await Promise.all(jobs)).filter(Boolean);
  const rowsById = new Map();
  for (const result of resolved) {
    const row = result.row; if (!row || !row.id) continue;
    let merged = rowsById.get(row.id);
    if (!merged) { merged = { ...row, _creatorSources: [] }; rowsById.set(row.id, merged); }
    for (const source of result.sources || []) {
      if (!source || !source.handle) continue;
      const key = source.handle.toLowerCase();
      if (!merged._creatorSources.some((item) => item.handle.toLowerCase() === key)) merged._creatorSources.push({ ...source });
    }
  }
  const rows = [...rowsById.values()];
  for (const r of rows) if (r) r._creatorSourced = true;
  return rows.filter((r) => r && r.id && r._creatorSources.length && !(Number.isFinite(r.distMi) && r.distMi > CREATOR_FINDS_RADIUS_MI));
}

async function buildSummerPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const entries = summerEntriesNow(); if (!entries.length) return [];
  const byId = new Map(); const allRows = [];
  for (const cat of Object.keys(pools)) for (const p of pools[cat]) if (p && p.id && !byId.has(p.id)) { byId.set(p.id, p); allRows.push(p); }
  const jobs = entries.map((e) => (async () => {
    const distToVenue = haversineMi(origin.lat, origin.lng, e.venue.lat, e.venue.lng);
    if (!e.icon && distToVenue > SUMMER_DAYTRIP_RADIUS_MI) return null;
    let row = (e.venue.placeId && byId.get(e.venue.placeId)) || null;
    if (!row && !e.venue.placeId) row = allRows.find((p) => sameVenueName(p.name, e.venue.name) && p.city && p.city === e.venue.city) || null;
    if (!row && e.venue.placeId) {
      const d = await getPlaceDetails(e.venue.placeId).catch(() => null);
      if (d && d.id && d.lat != null && d.lng != null) {
        row = { id: d.id, name: d.name, rating: d.rating != null ? d.rating : null, reviews: d.reviews || 0,
          types: Array.isArray(d.types) ? d.types : [], status: d.businessStatus || null, lat: d.lat, lng: d.lng,
          priceLevel: null, photoRef: d.photoRef || null, city: e.venue.city || null,
          distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng), oh: null, utcOffset: null, trending: false, trend_reason: null };
        const g = governedScoreOf(row, e.venue.city || null); if (Number.isFinite(g)) { row.governed_score = g; row._s = g; }
      }
    }
    if (!row) return null;
    row = { ...row };
    row._summerSourced = true;
    if (e.why) row._summerWhy = e.why; if (Array.isArray(e.rails) && e.rails.length) row._summerRails = e.rails;
    return row;
  })());
  const rows = (await Promise.all(jobs)).filter(Boolean); const seen = new Set();
  return rows.filter((r) => r && r.id && !seen.has(r.id) && (seen.add(r.id), true));
}

async function buildLocalPicksPool(pools, origin, band) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || !band || !BAND_TO_PICK_DAYPART[band]) return [];
  const entries = localPickEntriesNear(origin, band); if (!entries.length) return [];
  const byId = new Map();
  for (const cat of Object.keys(pools)) for (const p of pools[cat]) if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
  const jobs = entries.map((e) => (async () => {
    let row = byId.get(e.venue.placeId) || null;
    if (!row) {
      const d = await getPlaceDetails(e.venue.placeId).catch(() => null);
      if (d && d.businessStatus === "CLOSED_PERMANENTLY") return null;
      if (d && d.id && d.lat != null && d.lng != null) {
        row = { id: d.id, name: d.name, rating: d.rating != null ? d.rating : null, reviews: d.reviews || 0,
          types: Array.isArray(d.types) ? d.types : [], status: d.businessStatus || null, lat: d.lat, lng: d.lng,
          priceLevel: null, photoRef: d.photoRef || null, city: e.venue.city || null,
          distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng), oh: null, utcOffset: null, trending: false, trend_reason: null };
        const g = governedScoreOf(row, e.venue.city || null); if (Number.isFinite(g)) { row.governed_score = g; row._s = g; }
      }
    }
    if (!row || !Number.isFinite(row.distMi) || row.distMi > LOCAL_PICK_REACH_MI) return null;
    const clone = { ...row, _ownerPicked: true, _ownerMarket: e.market, _ownerDaypart: e.daypart, _ownerRank: e.rank };
    if (e.why) clone._ownerPickWhy = e.why; return clone;
  })());
  const rows = (await Promise.all(jobs)).filter(Boolean); const seen = new Set();
  return rows.filter((r) => r && r.id && !seen.has(r.id) && (seen.add(r.id), true));
}

async function buildBirthdayPool(pools, origin, readCache) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const identity = await buildIdentityPool(pools, origin, isBirthdayPlace, BIRTHDAY_NEAR_MI,
    ["restaurants", "nightlife", "things-to-do"], isStrongBirthdayPlace, { typeOv: BIRTHDAY_TYPES, readCache });
  const whyById = new Map(); const seedById = new Map();
  for (const e of birthdayEntries()) {
    const id = e && e.venue && e.venue.placeId; if (!id) continue;
    seedById.set(id, e); if (e.why) whyById.set(id, e.why);
  }
  const seen = new Set(); const out = [];
  for (const row of identity) {
    if (!row || !row.id || seen.has(row.id)) continue;
    const clone = { ...row };
    if (whyById.has(clone.id)) { clone._birthdaySourced = true; clone._birthdayWhy = whyById.get(clone.id); }
    seen.add(clone.id); out.push(clone);
  }
  const byId = new Map();
  for (const cat of Object.keys(pools)) for (const p of pools[cat] || []) if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
  for (const [id, e] of seedById) {
    if (seen.has(id)) continue; const row = byId.get(id); if (!row) continue;
    const d = Number.isFinite(row.distMi) ? row.distMi : (row.lat != null && row.lng != null ? haversineMi(origin.lat, origin.lng, row.lat, row.lng) : NaN);
    if (!(Number.isFinite(d) && d <= BIRTHDAY_NEAR_MI)) continue;
    const clone = { ...row, distMi: d, _birthdaySourced: true };
    if (e.why) clone._birthdayWhy = e.why;
    const g = Number.isFinite(clone.governed_score) ? clone.governed_score : governedScoreOf(clone, e.venue.city || null);
    if (Number.isFinite(g)) { clone.governed_score = g; if (!Number.isFinite(clone._s)) clone._s = g; }
    seen.add(id); out.push(clone);
  }
  out.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return out;
}

async function buildDrivePool(pools, origin, pooledCities, readCache, deps) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const rank = (deps && deps.rank) || rankedForCenter;
  const centers = driveCentersWithin(origin, DRIVE_REACH_MI, pooledCities, { landingCities: LANDING_CITIES, ...((deps && deps.registries) || {}) });
  if (!centers.length) return [];
  const cats = ["things-to-do", "beaches"]; const jobs = [];
  for (const cat of cats) for (const { slug, center, indexed } of centers) jobs.push({ cat, city: slug, center, indexed });
  // WO8b — prime overlapping drive boxes once; authoritative rankedForCenter
  // calls below remain the source of truth if the accelerator is unavailable.
  if (readCache) await primeConsolidatedInventoryReads(jobs.map(({ cat, center }) => ({ catSlug: cat, city: center })), readCache).catch(() => {});
  const results = await Promise.all(jobs.map(({ cat, city, center, indexed }) =>
    rank(cat, center, { withPhotos: true, skipEditorial: true, readCache, inventoryOnly: true }, indexed ? city : undefined).then((r) => r || []).catch(() => [])));
  const seen = new Set(); for (const cat of cats) for (const p of pools[cat] || []) if (p && p.id) seen.add(p.id);
  const rows = [];
  jobs.forEach(({ city }, i) => {
    for (const row of results[i]) {
      if (!row || !row.id || seen.has(row.id)) continue; seen.add(row.id);
      if (!(row.lat != null && row.lng != null)) continue;
      const d = haversineMi(origin.lat, origin.lng, row.lat, row.lng);
      if (!(Number.isFinite(d) && d >= DRIVE_MIN_MI && d <= DRIVE_REACH_MI)) continue;
      rows.push({ ...row, _neighbour: city, distMi: d });
    }
  });
  rows.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return rows;
}

export async function loadRailPlaces(citySlug, opts) {
  const stage = opts?.onStage || (() => {}); stage("anchor-pools");
  const readCache = makeReadCache();
  const { pools, cities, primaryCity } = await loadPools(citySlug, { ...opts, readCache });
  const band = opts && BAND_TO_PICK_DAYPART[opts.band] ? opts.band : null;
  const userOrigin = opts && opts.origin && Number.isFinite(opts.origin.lat) && Number.isFinite(opts.origin.lng) ? opts.origin : null;
  if (opts && opts.requireOrigin && !userOrigin) return { places: {}, thin: RAILS.filter((r) => r.list).map((r) => r.id), citySlug: primaryCity };
  const origin = userOrigin || LANDING_CITIES[primaryCity];
  if (origin) for (const cat of Object.keys(pools)) for (const p of pools[cat]) if (p.lat != null && p.lng != null) p.distMi = haversineMi(origin.lat, origin.lng, p.lat, p.lng);
  const beachWater = attachBeachWater(pools.beaches);
  for (const cat of Object.keys(pools)) pools[cat].sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));

  stage("parallel-pools");
  const [creators, summer, birthday, localpicks, family, events, drive] = await Promise.all([
    buildCreatorsPool(pools, origin).catch(() => []), buildSummerPool(pools, origin).catch(() => []),
    buildBirthdayPool(pools, origin, readCache).catch(() => []), buildLocalPicksPool(pools, userOrigin, band).catch(() => []),
    buildIdentityPool(pools, origin, isFamilyPlace, FAMILY_NEAR_MI, ["things-to-do"], isStrongFamilyPlace, { typeOv: FAMILY_TYPES, readCache }).catch(() => []),
    buildIdentityPool(pools, origin, isStrongTicketedVenue, EVENTS_NEAR_MI, ["things-to-do", "nightlife"], null, { typeOv: TICKETED_TYPES, readCache }).catch(() => []),
    buildDrivePool(pools, origin, cities, readCache).catch(() => []),
  ]);
  pools.creators = creators; pools.summer = summer; pools.birthday = birthday; pools.localpicks = localpicks;
  pools.family = family; pools.events = events; pools.drive = drive;

  stage("morning-pools");
  const morning = await buildMorningIdentityPools(pools, origin);
  pools.breakfast = morning.breakfast; pools.quickeats = morning.quickeats;

  stage("beach-water"); pools.beaches = await beachWater; stage("selection");
  const cityLabel = (LANDING_CITIES[primaryCity] || {}).name || null;
  const { places, thin } = fillRails(pools, slimPlace, { cityLabel, ownerBoard: pools.localpicks.length > 0,
    ...(userOrigin ? { nearMi: NEAR_RADIUS_MI, widenMi: WIDEN_RADIUS_MI } : {}) });
  stage("editorial");
  const shippedIds = new Set(); for (const id of Object.keys(places)) for (const row of places[id] || []) if (row && row.id) shippedIds.add(row.id);
  if (shippedIds.size) {
    const { hydrateEditorialFor } = await import("./inventoryServe.js");
    const editorialById = await hydrateEditorialFor([...shippedIds]).catch(() => new Map());
    if (editorialById.size) for (const id of Object.keys(places)) for (const row of places[id] || []) {
      if (row && row.editorial == null && editorialById.has(row.id)) { const ed = editorialById.get(row.id); if (ed) row.editorial = ed; }
    }
  }
  stage("complete"); return { places, thin, citySlug: primaryCity };
}

export const RAIL_DATA_LIMITS = { MIN_CARDS };

export async function railMenuData(citySlug, opts) {
  const slug = resolveRailCity(citySlug, LANDING_CITIES); const city = slug ? LANDING_CITIES[slug] : null;
  if (!city) return { places: {}, thin: RAILS.filter((r) => r.list).map((r) => r.id), citySlug: null, cityLabel: null,
    region: "other", lat: null, lng: null, covered: false, daypart: "afternoon",
    guides: Object.entries(GUIDES).map(([slug2, g]) => ({ slug: slug2, title: g.title, teaser: g.teaser || g.description || "", region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g) })).sort((a, b) => String(b.updated).localeCompare(String(a.updated))) };
  const serverBand = partForHour(siteHourFloat(new Date(), tzForPoint(city.lat, city.lng)));
  const band = opts && DAYPART_IDS.includes(opts.band) ? opts.band : serverBand;
  const started = Date.now(); const stages = {}; let activeStage = "start", stageStarted = started;
  const onStage = (next) => { const now = Date.now(); stages[activeStage] = now - stageStarted; activeStage = next; stageStarted = now; };
  const res = await settleLoad(() => loadRailPlaces(slug, { origin: opts && opts.origin, requireOrigin: opts && opts.requireOrigin, band, onStage }), { timeoutMs: RAILS_SERVER_DEADLINE_MS });
  const failed = !res.ok;
  if (failed || Date.now() - started >= 3000) console.warn("[rails-compute]", JSON.stringify({ city: slug, band, elapsedMs: Date.now() - started, failed, reason: res.reason || null, activeStage, stages: { ...stages, [activeStage]: Date.now() - stageStarted } }));
  const data = res.ok ? res.data : null;
  return { places: (data && data.places) || {}, thin: (data && data.thin) || RAILS.filter((r) => r.list).map((r) => r.id),
    citySlug: (data && data.citySlug) || slug, cityLabel: city.name, covered: !failed, failed,
    region: regionFor(city.lat, city.lng), lat: city.lat, lng: city.lng, daypart: band,
    guides: Object.entries(GUIDES).map(([slug2, g]) => ({ slug: slug2, title: g.title, teaser: g.teaser || g.description || "", region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g) })).sort((a, b) => String(b.updated).localeCompare(String(a.updated))) };
}

export { buildDrivePool, buildMorningIdentityPools };