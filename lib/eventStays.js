// Reuse the Stays inventory, centered on the event rather than the reader.
// No live discovery or new booking resolver: missing attribution stays closed.
import { serveFromInventory, distMeters } from "./inventoryServe.js";
import { isTrueLodging } from "./lodging.js";
import { wayfindScore } from "./wayfindScore.js";

export const EVENT_STAYS_RADIUS_MI = 12;
export function validStayOrigin(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 31.1 && lng >= -87.7 && lng <= -79.8;
}

export function selectEventStays(rows, origin, max = 6) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return [];
  const seen = new Set();
  return rows.filter((p) => {
    if (!p?.id || !p.name || !isTrueLodging(p) || !validStayOrigin(p.lat, p.lng)) return false;
    const key = p.googlePlaceId || p.id;
    if (seen.has(key) || distMeters(origin.lat, origin.lng, p.lat, p.lng) > EVENT_STAYS_RADIUS_MI * 1609.344) return false;
    seen.add(key);
    return true;
  }).map((p) => ({ ...p, category: "hotels", distMi: distMeters(origin.lat, origin.lng, p.lat, p.lng) / 1609.344,
    detailHref: p.googlePlaceId ? `/p/${encodeURIComponent(p.googlePlaceId)}`
      : p.id.startsWith("wfh-") ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`
      : `/p/${encodeURIComponent(p.id)}`,
    mapsOnly: p.id.startsWith("wfh-") && !p.googlePlaceId,
  }))
    .sort((a, b) => (b.wfScore ?? -1) - (a.wfScore ?? -1) || a.distMi - b.distMi)
    .slice(0, max);
}

const readStayInventory = async (options) => (await import("./hotels.js")).searchHotels(options);
export async function eventStays(origin, { readOwned = readStayInventory, readInventory = serveFromInventory } = {}) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return { places: [], unavailable: false };
  const [owned, inventory] = await Promise.allSettled([
    readOwned({ lat: origin.lat, lng: origin.lng, limit: 50 }),
    readInventory("hotels", origin.lat, origin.lng, EVENT_STAYS_RADIUS_MI * 1609.344, 50, "all", { failLoud: true, primaryOnly: true, deadlineMs: 2500 }),
  ]);
  const rows = inventory.status === "fulfilled" ? inventory.value.map((p) => ({
    id: p.id, name: p.displayName?.text, lat: p.location?.latitude, lng: p.location?.longitude,
    types: p.types || [], primaryType: p.primaryType, rating: p.rating, reviews: p.userRatingCount || 0,
    wfScore: wayfindScore(p.rating, p.userRatingCount || 0), address: p.formattedAddress || "",
    photo: p.photos?.[0]?._directUri || (p.photos?.[0]?.name ? "/api/photo?ref=" + encodeURIComponent(p.photos[0].name) + "&w=640" : null),
    blurb: p.editorialSummary?.text || null,
  })) : [];
  const places = selectEventStays([...(owned.status === "fulfilled" ? owned.value : []), ...rows], origin);
  return { places, unavailable: !places.length && (owned.status === "rejected" || inventory.status === "rejected") };
}
