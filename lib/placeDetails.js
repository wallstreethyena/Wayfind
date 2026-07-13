// lib/placeDetails.js — SERVER-ONLY. Fetches Google Place Details (New) by id for
// the durable /places/[id] pages, cache-first through the shared Supabase cache
// (key "pd1|{id}", fresh 14d, ToS-capped stale 30d, stale-serve on a 429/error).
//
// Callers MUST allowlist-check via lib/placeIndex.getSkeleton FIRST — this function
// assumes the id is a real, indexed place and will call Google on a cache miss.
import { cget, cset, DAY } from "./serverCache";

const FRESH_MS = 14 * DAY;      // refresh within 14 days (accuracy)
const STALE_MAX_MS = 30 * DAY;  // ToS: never serve place content older than 30 days
const FIELDS = "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,regularOpeningHours,types,businessStatus,editorialSummary,googleMapsUri";
const PRICE = { PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };

// OUR derived coarse category from Google's noisy types. category may be null.
export function catFromTypes(types) {
  const t = ((types || []).join(" ") || "").toLowerCase();
  if (/lodging|hotel|motel|resort|guest_house|bed_and_breakfast/.test(t)) return "Hotels";
  if (/restaurant|cafe|coffee|bakery|meal_|food|ice_cream|deli/.test(t)) return "Food";
  if (/night_club|\bbar\b|pub|brewery|liquor/.test(t)) return "Nightlife";
  if (/store|shopping|mall|market|shop|boutique/.test(t)) return "Shopping";
  if (/tourist|museum|park|art_gallery|amusement|aquarium|zoo|stadium|landmark|historical|beach|marina|natural_feature/.test(t)) return "Activities";
  return null;
}

// Normalize a Place Details (New) response into the page's content shape, or null
// if it lacks the minimum (id + name).
export function normalizeDetails(p) {
  if (!p || !p.id) return null;
  const name = typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || null;
  if (!name) return null;
  const loc = p.location || {};
  return {
    id: p.id,
    name,
    address: p.formattedAddress || null,
    lat: typeof loc.latitude === "number" ? loc.latitude : null,
    lng: typeof loc.longitude === "number" ? loc.longitude : null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
    price: PRICE[p.priceLevel] || null,
    category: catFromTypes(p.types),
    hours: p.regularOpeningHours && Array.isArray(p.regularOpeningHours.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions : [],
    description: (p.editorialSummary && p.editorialSummary.text) || null,
    mapsUri: p.googleMapsUri || null,
    types: Array.isArray(p.types) ? p.types : [],
    businessStatus: p.businessStatus || null,
  };
}

// Cache-first Place Details. Returns the normalized object or null (never throws).
export async function getPlaceDetails(id) {
  if (!id) return null;
  const k = "pd1|" + id;
  const fresh = await cget(k);
  if (fresh) return fresh.v;
  const serveStale = async () => { const st = await cget(k, { staleMs: STALE_MAX_MS }); return st ? st.v : null; };
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return await serveStale();
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    });
    if (!r.ok) return await serveStale(); // 429/404/error -> last cached content, if any
    const norm = normalizeDetails(await r.json());
    if (norm) { await cset(k, norm, FRESH_MS); return norm; }
    return await serveStale();
  } catch { return await serveStale(); }
}
