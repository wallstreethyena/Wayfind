export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lunch Break reads Wayfind's owned food inventory only: zero Google calls,
// one bounded Supabase read, then FastCache + CDN reuse for nearby readers.
import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { distMeters, serveFromInventory } from "../../../lib/inventoryServe.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import atlasCards from "../../../data/atlas/editorial-cards.json";
import { atlasCardFor, atlasCardForName, indexAtlasCards } from "../../../lib/atlasCards.js";
import { createHash } from "node:crypto";
import { siteTodayStr } from "../../../lib/siteTime.js";

const LUNCH_RADIUS_MI = 8;
const ATLAS_BY_ID = indexAtlasCards(atlasCards);

// A Lunch in My City card must name a real menu choice. Atlas foodMove copy is
// owner-reviewed and sourced; missing copy fails closed instead of inventing an
// order from a venue name or sending generic restaurant prose to the card.
function mustTryFor(place) {
  const card = atlasCardFor(ATLAS_BY_ID, place?.id) || atlasCardForName(atlasCards, place?.name);
  const move = String(card?.foodMove || "").trim();
  if (!move) return null;
  // These are useful visit notes, but not a specific thing a user can order.
  if (/\b(no concession|pack your own|eat a full meal before|food cannot|restaurants? (?:are|is) nearby)\b/i.test(move)) return null;
  return move;
}

function json(body, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

async function sessionUserId(s, request) {
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!token || token.length < 20 || !anon) return null;
  try {
    const response = await fetch(`${s.url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) return null;
    const account = await response.json();
    return account?.id ? String(account.id) : null;
  } catch {
    return null;
  }
}

function subjectKey(kind, value) {
  return createHash("sha256").update(`wayfind:lunch:v1:${kind}:${value}`).digest("hex");
}

async function consumeReveal(s, deviceId, userId) {
  const headers = { apikey: s.key, authorization: `Bearer ${s.key}`, "content-type": "application/json" };
  const response = await fetch(`${s.url}/rest/v1/rpc/wf_consume_lunch_reveal`, {
    method: "POST", headers, cache: "no-store",
    body: JSON.stringify({
      p_device_key: subjectKey("device", deviceId),
      p_user_key: userId ? subjectKey("user", userId) : null,
      p_site_day: siteTodayStr(),
    }),
  });
  if (!response.ok) throw new Error(`allowance RPC returned ${response.status}`);
  return response.json();
}

async function dishImagesFor(s, placeIds) {
  if (!placeIds.length) return new Map();
  try {
    const list = placeIds.map(encodeURIComponent).join(",");
    const response = await fetch(`${s.url}/rest/v1/wf_lunch_dish_images?select=place_id,image_url&image_url=not.is.null&place_id=in.(${list})`, {
      headers: { apikey: s.key, authorization: `Bearer ${s.key}` }, cache: "no-store", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return new Map();
    return new Map((await response.json()).map((row) => [row.place_id, row.image_url]));
  } catch {
    return new Map();
  }
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

async function loadLunchPlaces(lat, lng) {
  const key = `lunch-break:v3:${geoCell(lat)}:${geoCell(lng)}`;
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
  return cached;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");
  try {
    const cached = await loadLunchPlaces(lat, lng);
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

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request" }, 400, "no-store"); }
  const lat = Number(body?.lat), lng = Number(body?.lng);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const excluded = new Set(Array.isArray(body?.excludeIds) ? body.excludeIds.map(String).slice(0, 2) : []);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");
  if (!/^[A-Za-z0-9_-]{12,96}$/.test(deviceId)) return json({ error: "A valid device identifier is required" }, 400, "no-store");

  const s = sb();
  if (!s) return json({ error: "Lunch reveals are temporarily unavailable" }, 503, "no-store");
  try {
    const [cached, userId] = await Promise.all([loadLunchPlaces(lat, lng), sessionUserId(s, request)]);
    const candidates = (cached.value?.places || [])
      .map((place) => ({ ...place, mustTry: mustTryFor(place) }))
      .filter((place) => place.mustTry)
      .slice(0, 5);
    const available = candidates.filter((place) => !excluded.has(place.id));
    if (!available.length) return json({ error: candidates.length ? "No different lunch pick is available yet" : "No verified lunch pick is available nearby" }, 404, "no-store");

    const [allowance, dishImages] = await Promise.all([
      consumeReveal(s, deviceId, userId),
      dishImagesFor(s, available.map((place) => place.id)),
    ]);
    if (!allowance?.allowed) return json({ error: "limit", allowance }, 429, "no-store");
    let place = available[Math.floor(Math.random() * available.length)];
    const dishImageUrl = dishImages.get(place.id) || null;
    if (dishImageUrl) {
      place = { ...place, photo: dishImageUrl, imageKind: "must_try" };
    } else {
      place = { ...place, imageKind: "restaurant" };
    }
    return json({ place, allowance }, 200, "no-store");
  } catch (error) {
    console.error("[api/lunch-break] reveal unavailable", { message: String(error?.message || error) });
    return json({ error: "Lunch reveals are temporarily unavailable" }, 503, "no-store");
  }
}
