export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 8;

import { supabase } from "../../../../lib/supabase.js";
import { SUMMER_UNIVERSE, SUMMER_DAYTRIP_RADIUS_MI } from "../../../../lib/summerUniverse.js";
import { SUMMER_PLACE_IDS } from "../../../../lib/summerPlaceIds.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cardImageSrc } from "../../../../lib/placePhoto.js";
import { fastCachedRail, geoCell } from "../../../../lib/railFastCache.js";
import { distMeters } from "../../../../lib/inventoryServe.js";

const DB_DEADLINE_MS = 3500;
const STATEWIDE_MAX_MI = 400;

function permanentEntries() {
  return SUMMER_UNIVERSE.filter((entry) => !entry.window).map((entry) => ({
    ...entry,
    venue: { ...entry.venue, placeId: entry.venue.placeId || SUMMER_PLACE_IDS[entry.key] || null },
  })).filter((entry) => entry.venue.placeId);
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const lat = Number.parseFloat(sp.get("lat") || "");
  const lng = Number.parseFloat(sp.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required", places: [] }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const cacheKey = `summer-places:v1:${geoCell(lat)}:${geoCell(lng)}`;
    const cached = await fastCachedRail(cacheKey, async () => {
      if (!supabase) throw new Error("Summer inventory configuration is unavailable");
      const entries = permanentEntries();
      const ids = entries.map((entry) => entry.venue.placeId);
      const { data, error } = await supabase.from("wf_inventory")
        .select("place_id,name,lat,lng,metro,category,primary_type,google_types,cuisines,signals,editorial,photo_ref,status,excluded")
        .in("place_id", ids)
        .abortSignal(AbortSignal.timeout(DB_DEADLINE_MS));
      if (error) throw error;
      const byId = new Map((data || []).map((row) => [row.place_id, row]));
      const places = [];
      for (const entry of entries) {
        const row = byId.get(entry.venue.placeId);
        if (!row || row.excluded === true || (row.status && row.status !== "OPERATIONAL") || !row.photo_ref) continue;
        const miles = distMeters(lat, lng, row.lat, row.lng) / 1609.34;
        if (miles > (entry.icon ? STATEWIDE_MAX_MI : SUMMER_DAYTRIP_RADIUS_MI)) continue;
        const signals = row.signals || {};
        if (!(typeof signals.rating === "number" && signals.rating > 0)) continue;
        places.push({
          id: row.place_id, name: row.name, city: entry.venue.city || row.metro || null,
          lat: row.lat, lng: row.lng, category: row.category || null,
          primaryType: row.primary_type || null, types: row.google_types || [], cuisines: row.cuisines || [],
          rating: signals.rating, reviews: Number(signals.reviews) || 0,
          priceNum: typeof signals.priceNum === "number" ? signals.priceNum : null,
          wfScore: wayfindScore(signals.rating, Number(signals.reviews) || 0),
          editorial: row.editorial || null, photoRef: row.photo_ref,
          photo: cardImageSrc({ place_id: row.place_id, photo_ref: row.photo_ref }, 640),
          distMi: Math.round(miles * 10) / 10,
          _summerKey: entry.key, _summerWhy: entry.why, _sourceRails: entry.rails || [],
        });
      }
      return places;
    }, { name: "summer-places", usable: (value) => Array.isArray(value) && value.length > 0 });
    return Response.json({ places: cached.value || [] }, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-wayfind-fast-cache": cached.state },
    });
  } catch (error) {
    console.error("[api/summer/places] inventory unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Summer inventory is temporarily unavailable", places: [] }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
