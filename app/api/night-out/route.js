export const runtime = "nodejs";
export const maxDuration = 20;

// Night Out owns its complete candidate universe. Dinner, shows and after
// dark activities are not all stored under the nightlife category, so the
// endpoint reads the three relevant owned categories in parallel.
import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { distMeters, serveFromInventory } from "../../../lib/inventoryServe.js";
import { composeNightOutRails, NIGHT_OUT_MAX_MI } from "../../../lib/nightOutIntent.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";

function toPlace(raw, origin) {
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
    priceLevel: raw.priceLevel ?? raw.priceNum ?? null,
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
  const full = searchParams.get("full") === "1";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const key = `night-out:v3:${geoCell(lat)}:${geoCell(lng)}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const options = { failLoud: true, primaryOnly: true, deadlineMs: NET_DEADLINE_MS };
      const pools = await Promise.all(["food", "nightlife", "attractions"].map((category) =>
        serveFromInventory(category, lat, lng, NIGHT_OUT_MAX_MI * 1609.34, BROWSE_INVENTORY_N, undefined, options),
      ));
      const origin = { lat, lng };
      const seen = new Set();
      const places = pools.flat().map((row) => toPlace(row, origin)).filter((place) => {
        if (!place || seen.has(place.id)) return false;
        seen.add(place.id);
        return true;
      });
      return composeNightOutRails([], places, origin);
    }, {
      name: "night-out-rails",
      usable: (value) => !!value?.rails?.some((rail) => rail.places?.length),
    });
    const total = cached.value.rails.reduce((sum, rail) => sum + rail.places.length, 0);
    return Response.json(windowRailAnswer(cached.value, full), { headers: {
      "cache-control": total ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
      "x-wayfind-fast-cache": cached.state,
    } });
  } catch (error) {
    console.error("[api/night-out] inventory unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Night Out inventory is temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
