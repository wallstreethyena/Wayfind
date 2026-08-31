export const runtime = "nodejs";

// Location-aware Birthday inventory. This endpoint never performs a live
// Places search: it composes the seven rails from Wayfind's owned inventory,
// and every qualitative category is evidence-gated in lib/birthdayIntent.

import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { distMeters, serveFromInventory } from "../../../lib/inventoryServe.js";
import { BIRTHDAY_WIDEN_MI, composeBirthdayRails } from "../../../lib/birthdayIntent.js";
import { birthdayRewardFor } from "../../../lib/birthdayRewards.js";

function json(body, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

function priceNum(level) {
  const values = [
    "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE",
    "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE",
  ];
  return typeof level === "number" ? level : Math.max(0, values.indexOf(level));
}

function toBirthdayPlace(raw, origin) {
  const id = String(raw?.id || "");
  const name = String(raw?.displayName?.text || raw?.name || "").trim();
  const lat = Number(raw?.location?.latitude ?? raw?.lat);
  const lng = Number(raw?.location?.longitude ?? raw?.lng);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const photoRef = raw?.photo_ref || raw?.photos?.[0]?.name || null;
  const place = {
    id, name, lat, lng,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviews: Number(raw.userRatingCount || raw.reviews || 0),
    types: Array.isArray(raw.types) ? raw.types : [],
    primaryType: raw.primaryType || raw.primary_type || null,
    priceLevel: raw.priceLevel ?? raw.priceNum ?? null,
    priceNum: priceNum(raw.priceLevel ?? raw.priceNum),
    editorial: raw?.editorialSummary?.text || raw?.editorial || null,
    photo: raw.photo_url || raw.photoUrl || null,
    photoRef,
    distMi: Math.round((distMeters(origin.lat, origin.lng, lat, lng) / 1609.34) * 10) / 10,
    _wfInventory: true,
  };
  const reward = birthdayRewardFor(id);
  if (reward) place._birthdayReward = reward;
  return place;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: "lat and lng are required" }, 400, "no-store");
  }

  const radiusM = BIRTHDAY_WIDEN_MI * 1609.34;
  const n = BROWSE_INVENTORY_N;
  const origin = { lat, lng };
  const pools = await Promise.all([
    serveFromInventory("food", lat, lng, radiusM, n),
    serveFromInventory("nightlife", lat, lng, radiusM, n),
    serveFromInventory("attractions", lat, lng, radiusM, n),
    serveFromInventory("beach", lat, lng, radiusM, n),
    serveFromInventory("hotels", lat, lng, radiusM, n),
    serveFromInventory("shopping", lat, lng, radiusM, n),
  ]);

  const seen = new Set();
  const places = [];
  for (const raw of pools.flat()) {
    const place = toBirthdayPlace(raw, origin);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    // Birthday is a visual, premium surface. A missing owned photo is an
    // enrichment task, not permission to paint an unrelated stock venue.
    if (!place.photo && !place.photoRef) continue;
    places.push(place);
  }

  const result = composeBirthdayRails(places);
  const total = result.rails.reduce((sum, rail) => sum + rail.places.length, 0);
  return json(result, 200, total ? undefined : "no-store");
}
