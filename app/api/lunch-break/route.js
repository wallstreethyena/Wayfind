export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lunch Break reads Wayfind's owned food inventory only: zero Google calls, a
// bounded, deterministic, identity-first Supabase read (lib/ownedPool.js), then
// FastCache + CDN reuse for nearby readers.
import { DB_DEADLINE_MS, NET_DEADLINE_MS, fetchDeadline } from "../../../lib/fetchDeadline.js";
import { distMeters, invRowToPlace } from "../../../lib/inventoryServe.js";
import { fetchOwnedPool } from "../../../lib/ownedPool.js";
import { lunchRailMembership } from "../../../lib/lunchBreakRails.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import atlasCards from "../../../data/atlas/editorial-cards.json";
import { atlasCardFor, atlasCardForName, indexAtlasCards } from "../../../lib/atlasCards.js";
import { createHash } from "node:crypto";
import { siteTodayStr } from "../../../lib/siteTime.js";
import { cardImageSrc } from "../../../lib/placePhoto.js";

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
  // Research notes and source caveats are not menu recommendations. This
  // catches the Oar & Iron failure where an internal evidence memo was painted
  // verbatim after “Must try”. Keep the postcard to one orderable choice.
  if (move.length > 180 || /\b(official menu|menu html|this pass|does not (?:type|name|list)|allowed observer|sponsored|treat those|standing official|source page|could not verify|not independently verified)\b/i.test(move)) return null;
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
    const response = await fetchDeadline(`${s.url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` }, cache: "no-store" }, DB_DEADLINE_MS);
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
  const response = await fetchDeadline(`${s.url}/rest/v1/rpc/wf_consume_lunch_reveal`, {
    method: "POST", headers, cache: "no-store",
    body: JSON.stringify({
      p_device_key: subjectKey("device", deviceId),
      p_user_key: userId ? subjectKey("user", userId) : null,
      p_site_day: siteTodayStr(),
    }),
  }, DB_DEADLINE_MS);
  if (!response.ok) throw new Error(`allowance RPC returned ${response.status}`);
  return response.json();
}

async function dishImagesFor(s, placeIds) {
  if (!placeIds.length) return new Map();
  try {
    const list = placeIds.map(encodeURIComponent).join(",");
    const response = await fetchDeadline(`${s.url}/rest/v1/wf_lunch_dish_images?select=place_id,image_url&image_url=not.is.null&place_id=in.(${list})`, {
      headers: { apikey: s.key, authorization: `Bearer ${s.key}` }, cache: "no-store",
    }, 2500);
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
    photo: cardImageSrc(raw, 800) || null,
    photoRef: raw?.photo_ref || raw?.photos?.[0]?.name || null,
    distMi: Math.round((distMeters(origin.lat, origin.lng, lat, lng) / 1609.34) * 10) / 10,
    _wfInventory: true,
  };
}

/**
 * v8.98 — THE SEVEN CUISINE RAILS ASK BEFORE THE COST BOUND, NOT AFTER IT.
 *
 * This read used to be `serveFromInventory("food", …, BROWSE_INVENTORY_N)`: the
 * top 400 of ALL food by Wayfind Score, with the seven narrow rails —
 * Cuban & Caribbean, Chicken, Mexican, Pizza, Burgers, Healthy, Deli — asking
 * their question afterwards, on the client. Every cuisine competed against every
 * other cuisine (and against every ordinary restaurant) for those 400 slots, so
 * a genuinely excellent Cuban sandwich counter ranked #430 among all food was
 * invisible to Cuban & Caribbean however perfectly it qualified.
 *
 * It is the café bug (v8.49) and the Night Out bug (v8.97b) in a third costume,
 * and lib/browseInventory.js named the shape years of fixes ago:
 * "identity ∩ anchor top-N is thin BY CONSTRUCTION".
 *
 * Now the reader is handed lunchRailMembership — the SAME function the composer
 * uses, imported rather than restated — so the only rows read are rows a rail
 * actually wants, and the pool is read deterministically (order=place_id.asc)
 * and to exhaustion instead of as an arbitrary unordered thousand.
 *
 * Unchanged on purpose: the 8-mile radius, `primaryOnly` (secondary-category
 * food rows stay out of Lunch, as before — this change is about DEPTH, not about
 * widening what counts), the photo requirement, and the composer's ranking.
 */
async function loadLunchPlaces(lat, lng) {
  const key = `lunch-break:v4:${geoCell(lat)}:${geoCell(lng)}`;
  const cached = await fastCachedRail(key, async () => {
      const origin = { lat, lng };
      // The pool's mapper is the route's OWN mapper, fed the exact shape the
      // previous read produced (invRowToPlace), so a card is built from the same
      // fields it always was and the only thing that changed is which rows reach
      // it. The identity below then runs on a real Lunch place, not on a
      // second, drifting projection of one.
      const pool = await fetchOwnedPool(lat, lng, {
        categories: ["food"],
        radiusMi: LUNCH_RADIUS_MI,
        primaryOnly: true,
        deadlineMs: NET_DEADLINE_MS,
        toPlace: (row, o) => toLunchPlace(invRowToPlace(row), o),
        identity: lunchRailMembership,
      });
      const seen = new Set();
      const places = [];
      for (const place of pool.places) {
        // Presentation, not identity: a card with no image is not a card. It
        // stays AFTER admission so the funnel below reports honest candidate
        // counts rather than photo counts.
        if (!place || seen.has(place.id) || (!place.photo && !place.photoRef)) continue;
        seen.add(place.id);
        places.push(place);
      }
      return { places, sourceStats: pool.stats };
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
    const restaurantPhoto = place.photo || (place.photoRef ? "/api/photo?ref=" + encodeURIComponent(place.photoRef) + "&w=800" : null);
    if (dishImageUrl) {
      place = { ...place, photo: dishImageUrl, restaurantPhoto, imageKind: "must_try" };
    } else {
      place = { ...place, photo: restaurantPhoto, restaurantPhoto, imageKind: "restaurant" };
    }
    return json({ place, allowance }, 200, "no-store");
  } catch (error) {
    console.error("[api/lunch-break] reveal unavailable", { message: String(error?.message || error) });
    return json({ error: "Lunch reveals are temporarily unavailable" }, 503, "no-store");
  }
}
