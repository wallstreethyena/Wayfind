export const runtime = "nodejs";

// One owned-inventory answer for the combined Today / Best / Hidden Gems
// poster. There are no live Google calls here. Owned reads happen in parallel,
// then FastCache and Vercel's CDN make the result reusable by nearby readers.

import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { allCreators } from "../../../lib/creatorVideos.js";
import { NET_DEADLINE_MS, fetchDeadline } from "../../../lib/fetchDeadline.js";
import { distMeters, invRowToPlace, serveFromInventory, serveInventoryByPlaceIds } from "../../../lib/inventoryServe.js";
import { fetchOwnedPool } from "../../../lib/ownedPool.js";
import { completeAnswersOnly, fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { nearestWater } from "../../../lib/waterStations.js";
import { claimsTodayRail, composeTodayDiscoveryRails, TODAY_NATURE_MI } from "../../../lib/todayDiscoveryRails.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";
import { pageOneRail } from "../../../lib/railPage.js";

function json(body, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

function priceNum(level) {
  const values = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];
  return typeof level === "number" ? level : Math.max(0, values.indexOf(level));
}

function toPlace(raw, origin, inventoryCategory) {
  const id = String(raw?.id || "");
  const name = String(raw?.displayName?.text || raw?.name || "").trim();
  const lat = Number(raw?.location?.latitude ?? raw?.lat);
  const lng = Number(raw?.location?.longitude ?? raw?.lng);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id, name, lat, lng,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviews: Number(raw.userRatingCount || raw.reviews || 0),
    types: Array.isArray(raw.types) ? raw.types : [],
    primaryType: raw.primaryType || raw.primary_type || null,
    cuisines: Array.isArray(raw.cuisines) ? raw.cuisines : [],
    priceLevel: raw.priceLevel ?? raw.priceNum ?? null,
    priceNum: priceNum(raw.priceLevel ?? raw.priceNum),
    editorial: raw?.editorialSummary?.text || raw?.editorial || null,
    photo: raw.photo_url || raw.photoUrl || null,
    photoRef: raw?.photo_ref || raw?.photos?.[0]?.name || null,
    distMi: Math.round((distMeters(origin.lat, origin.lng, lat, lng) / 1609.34) * 10) / 10,
    inventoryCategory,
    _wfInventory: true,
  };
}

async function attachWater(rows) {
  const isBeachInventory = (place) => place.inventoryCategory === "beach" || place.inventoryCategories?.includes("beach");
  const beaches = rows.filter((place) => isBeachInventory(place) && Number.isFinite(place.lat) && Number.isFinite(place.lng));
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!beaches.length || !url || !anon) return rows;
  const lats = beaches.map((place) => place.lat);
  const lngs = beaches.map((place) => place.lng);
  const pad = 0.03;
  const query = `lat=gte.${(Math.min(...lats) - pad).toFixed(4)}&lat=lte.${(Math.max(...lats) + pad).toFixed(4)}&lng=gte.${(Math.min(...lngs) - pad).toFixed(4)}&lng=lte.${(Math.max(...lngs) + pad).toFixed(4)}`;
  try {
    const response = await fetchDeadline(`${url}/rest/v1/wf_beach_water_geo?select=beach_place_id,result,advisory,sampled_at,lat,lng&${query}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      next: { revalidate: 3600 },
    }, 4000);
    if (!response.ok) return rows;
    const stations = await response.json();
    return rows.map((place) => {
      if (!isBeachInventory(place)) return place;
      const water = nearestWater(Array.isArray(stations) ? stations : [], place.lat, place.lng);
      return water ? { ...place, water: { result: water.result, advisory: !!water.advisory, sampled_at: water.sampled_at } } : place;
    });
  } catch {
    return rows;
  }
}

function instagramPlaceIds() {
  const ids = new Set();
  const library = allCreators();
  for (const creator of library.creators || []) {
    for (const spot of creator.spots || []) {
      if (spot?.placeId && String(spot.platform || spot.video?.platform || "").toLowerCase() === "instagram") {
        ids.add(String(spot.placeId));
      }
    }
  }
  for (const spot of library.unattributed || []) {
    if (spot?.placeId && String(spot.platform || spot.video?.platform || "").toLowerCase() === "instagram") {
      ids.add(String(spot.placeId));
    }
  }
  return [...ids];
}

async function exactInstagramInventory(lat, lng, radiusM) {
  const ids = instagramPlaceIds();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  if (!chunks.length) return [];
  const rows = await Promise.all(chunks.map((chunk) =>
    serveInventoryByPlaceIds(chunk, lat, lng, radiusM, { failLoud: true, deadlineMs: NET_DEADLINE_MS })));
  return rows.flat();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const city = String(searchParams.get("city") || "").trim().slice(0, 80);
  const full = searchParams.get("full") === "1";
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");

  const cityKey = city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unknown";
  // v4 adds exact creator-place admission. Never reuse a v3 cache assembled
  // from broad category shelves for the Instagram rail.
  const key = `today-discovery:v4:${geoCell(lat)}:${geoCell(lng)}:${cityKey}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const radiusM = TODAY_NATURE_MI * 1609.34;
      const options = { failLoud: true, primaryOnly: true, deadlineMs: NET_DEADLINE_MS };
      const origin = { lat, lng };
      /**
       * CANDIDATE INTEGRITY — ASK WHAT THE PLACE IS BEFORE RANKING IT.
       *
       * Attractions and beach use claimsTodayRail inside the exhaustive owned
       * reader. Food/nightlife/hotels/shopping stay broad only for score-aligned
       * rails. The Instagram rail is different: its identity is already known
       * by exact curated Place ID, so those IDs are read directly and can never
       * disappear because they ranked 401st inside a broad category.
       */
      const IDENTITY_FIRST = ["attractions", "beach"];
      const broadCategories = ["food", "nightlife", "hotels", "shopping"];
      const [narrow, creatorExact, ...pools] = await Promise.all([
        fetchOwnedPool(lat, lng, {
          categories: IDENTITY_FIRST,
          radiusMi: TODAY_NATURE_MI,
          primaryOnly: true,
          deadlineMs: NET_DEADLINE_MS,
          toPlace: (row, o) => toPlace(invRowToPlace(row), o, row.category === "beach" ? "beach" : "attractions"),
          identity: (place) => claimsTodayRail(place, { city }),
        }),
        exactInstagramInventory(lat, lng, radiusM),
        ...broadCategories.map((category) =>
          serveFromInventory(category, lat, lng, radiusM, BROWSE_INVENTORY_N, undefined, options)),
      ]);
      const byId = new Map();
      for (const place of narrow.places) {
        if (!place || (!place.photo && !place.photoRef)) continue;
        if (!byId.has(place.id)) byId.set(place.id, place);
      }
      // Exact curated IDs are admitted before the broad shelves. The composer
      // still owns the Instagram predicate and all other rail identity checks.
      for (const raw of creatorExact) {
        const place = toPlace(raw, origin, null);
        if (!place || (!place.photo && !place.photoRef)) continue;
        if (!byId.has(place.id)) byId.set(place.id, place);
      }
      pools.forEach((pool, index) => {
        for (const raw of pool) {
          const place = toPlace(raw, origin, broadCategories[index]);
          if (!place || (!place.photo && !place.photoRef)) continue;
          const prior = byId.get(place.id);
          if (!prior) byId.set(place.id, place);
          else if (prior.inventoryCategory !== place.inventoryCategory) prior.inventoryCategories = [...new Set([prior.inventoryCategory, ...(prior.inventoryCategories || []), place.inventoryCategory])];
        }
      });
      const places = await attachWater([...byId.values()]);
      return { ...composeTodayDiscoveryRails(places, { city }), degraded: !!narrow.stats.degraded, sourceStats: narrow.stats };
    }, {
      name: "today-discovery",
      usable: completeAnswersOnly((value) => value.rails?.some((rail) => rail.places?.length)),
    });
    const total = cached.value.rails.reduce((sum, rail) => sum + rail.places.length, 0);
    const headers = {
      "cache-control": total && !cached.value.degraded ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
      "x-wayfind-fast-cache": cached.state,
    };
    if (railId) {
      const paged = pageOneRail(cached.value.rails, railId, { page, size });
      if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
      return Response.json({ rail: railId, ...paged }, { headers });
    }
    return Response.json(windowRailAnswer(cached.value, full), { headers });
  } catch (error) {
    console.error("[api/today-discovery] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Today inventory is temporarily unavailable" }, 503, "no-store");
  }
}