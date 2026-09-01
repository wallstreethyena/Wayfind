export const runtime = "nodejs";

// Location-aware Birthday inventory. This endpoint never performs a live
// Places search: it composes the seven rails from Wayfind's owned inventory,
// and every qualitative category is evidence-gated in lib/birthdayIntent.

import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { birthdayAttributesFor } from "../../../lib/birthdayAttributes.js";
import { distMeters, serveFromInventory, serveInventoryByPlaceIds } from "../../../lib/inventoryServe.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { BIRTHDAY_WIDEN_MI, composeBirthdayRails } from "../../../lib/birthdayIntent.js";
import { BIRTHDAY_REWARD_PLACE_IDS, birthdayRewardFor } from "../../../lib/birthdayRewards.js";

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
  const reward = birthdayRewardFor(id, new Date(), name);
  if (reward) place._birthdayReward = reward;
  const attributes = birthdayAttributesFor(id);
  if (attributes) place._birthdayAttributes = attributes;
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
  const retryRead = async (operation) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await operation(); } catch (error) { lastError = error; }
    }
    throw lastError || new Error("Birthday inventory read failed");
  };

  let pools;
  try {
    // Only the two identities that can honestly satisfy the five experience
    // rails are broad reads. Gifts are a tiny exact-ID lookup. This replaces
    // six 1,000-row reads and prevents hotels, shops, beaches and attractions
    // from being fetched only to be rejected after the fact.
    const broadRead = { failLoud: true, primaryOnly: true, deadlineMs: NET_DEADLINE_MS };
    const exactRead = { failLoud: true, deadlineMs: NET_DEADLINE_MS };
    pools = await Promise.all([
      retryRead(() => serveFromInventory("food", lat, lng, radiusM, n, undefined, broadRead)),
      retryRead(() => serveFromInventory("nightlife", lat, lng, radiusM, n, undefined, broadRead)),
      retryRead(() => serveInventoryByPlaceIds(BIRTHDAY_REWARD_PLACE_IDS, lat, lng, radiusM, exactRead)),
    ]);
  } catch (error) {
    console.error("[api/birthday] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Birthday inventory is temporarily unavailable" }, 503, "no-store");
  }

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
