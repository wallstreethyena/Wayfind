export const runtime = "nodejs";

// Lunch Break reads Wayfind's owned food inventory only: zero Google calls,
// one bounded Supabase read, then FastCache + CDN reuse for nearby readers.
import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { distMeters, serveFromInventory } from "../../../lib/inventoryServe.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";

const LUNCH_RADIUS_MI = 8;

function json(body, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

function priceNum(level) {
  const values = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];
  return typeof level === "number" ? level : Math.max(0, values.indexOf(level));
}

function toLunchPlace(raw, origin) {
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
    _wfInventory: true,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");

  const key = `lunch-break:${geoCell(lat)}:${geoCell(lng)}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const raw = await serveFromInventory("food", lat, lng, LUNCH_RADIUS_MI * 1609.34, BROWSE_INVENTORY_N, undefined, {
        failLoud: true, primaryOnly: true, deadlineMs: NET_DEADLINE_MS,
      });
      const origin = { lat, lng };
      const seen = new Set();
      const places = [];
      for (const row of raw) {
        const place = toLunchPlace(row, origin);
        if (!place || seen.has(place.id) || (!place.photo && !place.photoRef)) continue;
        seen.add(place.id);
        places.push(place);
      }
      return { places };
    }, { name: "lunch-break", usable: (value) => !!value?.places?.length });
    return Response.json(cached.value, {
      headers: {
        "cache-control": cached.value.places.length ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
        "x-wayfind-fast-cache": cached.state,
      },
    });
  } catch (error) {
    console.error("[api/lunch-break] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Lunch inventory is temporarily unavailable" }, 503, "no-store");
  }
}
