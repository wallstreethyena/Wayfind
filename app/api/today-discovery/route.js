export const runtime = "nodejs";

// One owned-inventory answer for the combined Today / Best / Hidden Gems
// poster. There are no live Google calls here. The six bounded reads happen in
// parallel, then FastCache and Vercel's CDN make the result reusable by nearby
// readers.

import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { NET_DEADLINE_MS, fetchDeadline } from "../../../lib/fetchDeadline.js";
import { distMeters, invRowToPlace, serveFromInventory } from "../../../lib/inventoryServe.js";
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const city = String(searchParams.get("city") || "").trim().slice(0, 80);
  const full = searchParams.get("full") === "1";
  // WO11 paging contract — see app/api/night-out/route.js.
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");

  // Creator associations may use the resolved city as a strict secondary
  // identity check, so it belongs in the cache key alongside the geo cells.
  const cityKey = city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unknown";
  // v2 retires payloads composed before the venue-identity veto. FastCache is
  // shared beyond one deployment, so code fixes that change membership must
  // never inherit an earlier generation's answer.
  const key = `today-discovery:v3:${geoCell(lat)}:${geoCell(lng)}:${cityKey}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const radiusM = TODAY_NATURE_MI * 1609.34;
      const options = { failLoud: true, primaryOnly: true, deadlineMs: NET_DEADLINE_MS };
      const origin = { lat, lng };
      /**
       * v8.98 — THE NATURE RAILS ASK BEFORE THE COST BOUND.
       *
       * Springs, Water, Parks, Nature, Golf and Pickleball are narrow, evidence-
       * gated slices of `attractions` and `beach`, and they used to be asked
       * AFTER `serveFromInventory(category, …, BROWSE_INVENTORY_N)` had already
       * kept the top 400 of the whole category by Wayfind Score across a
       * SEVENTY-FIVE MILE box. Measured 2026-09-05: that box holds 2,611
       * attraction rows near Tampa, so more than eight in ten never reached the
       * question — a real golf course or a real spring simply did not compete.
       * Upstream of that, the shared reader's `limit=1000` carries no `order=`,
       * so which 1,000 arrived was Postgres heap order and changed with any
       * UPDATE. Same failure class as the cafés (v8.49) and Night Out (v8.97b).
       *
       * These two categories now come through the deterministic, exhaustive,
       * identity-first reader, with claimsTodayRail — which runs the REAL
       * composer over one row — as the predicate, so this route holds no second
       * opinion about what a spring is. 2,722 rows near Tampa is three round
       * trips, not a firehose.
       *
       * The other four categories are deliberately UNCHANGED. `food` reaches
       * only `isBestFood`, which is a SCORE FLOOR (>= 82) inside 17 miles — a
       * top-N-by-score read is aligned with a score-floor predicate rather than
       * starving it — and nightlife/hotels/shopping are vetoed out of every
       * activity rail by isTopActivity's own venue-identity check. Widening
       * those reads would cost five more page-throughs of the largest categories
       * in the library to recover rows the rails cannot use.
       */
      const IDENTITY_FIRST = ["attractions", "beach"];
      const broadCategories = ["food", "nightlife", "hotels", "shopping"];
      const [narrow, ...pools] = await Promise.all([
        fetchOwnedPool(lat, lng, {
          categories: IDENTITY_FIRST,
          radiusMi: TODAY_NATURE_MI,
          primaryOnly: true,
          deadlineMs: NET_DEADLINE_MS,
          toPlace: (row, o) => toPlace(invRowToPlace(row), o, row.category === "beach" ? "beach" : "attractions"),
          identity: (place) => claimsTodayRail(place, { city }),
        }),
        ...broadCategories.map((category) =>
          serveFromInventory(category, lat, lng, radiusM, BROWSE_INVENTORY_N, undefined, options)),
      ]);
      const byId = new Map();
      for (const place of narrow.places) {
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
      // A partial owned pool (one of attractions/beach failed to read) must not
      // be cached as this town's answer — see completeAnswersOnly below.
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
