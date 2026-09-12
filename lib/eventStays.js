// Reuse the Stays inventory, centered on the event rather than the reader.
// No live discovery or new booking resolver: missing attribution stays closed.
import { serveFromInventory, distMeters } from "./inventoryServe.js";
import { isTrueLodging } from "./lodging.js";
import { isPlaceOwnedPhotoUrl } from "./placePhoto.js";
import { wayfindScore } from "./wayfindScore.js";
import { validStayOrigin } from "./stayOrigin.js";

export { validStayOrigin } from "./stayOrigin.js";

export const EVENT_STAYS_RADIUS_MI = 12;

export function selectEventStays(rows, origin, max = 6) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return [];
  const seen = new Set();
  return rows.filter((p) => {
    if (!p?.id || !p.name || !isTrueLodging(p) || !validStayOrigin(p.lat, p.lng)) return false;
    const key = String(p.googlePlaceId || p.id).trim();
    if (!key) return false;
    if (seen.has(key) || distMeters(origin.lat, origin.lng, p.lat, p.lng) > EVENT_STAYS_RADIUS_MI * 1609.344) return false;
    seen.add(key);
    return true;
  }).map((p) => {
    const sourceId = String(p.id).trim();
    const googlePlaceId = String(p.googlePlaceId || "").trim();
    const id = googlePlaceId || sourceId;
    const mapsOnly = sourceId.startsWith("wfh-") && !googlePlaceId;
    return { ...p, ...(id !== sourceId ? { sourceId } : {}), id, category: "hotels", distMi: distMeters(origin.lat, origin.lng, p.lat, p.lng) / 1609.344,
      detailHref: mapsOnly
        ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`
        : `/p/${encodeURIComponent(id)}`,
      mapsOnly,
    };
  })
    .sort((a, b) => (b.wfScore ?? -1) - (a.wfScore ?? -1) || a.distMi - b.distMi)
    .slice(0, max);
}

const readStayInventory = async (options) => (await import("./hotels.js")).searchHotels(options);
function eventStayPhoto(p) {
  const inventoryUrl = p?.photo_url || p?.photoUrl || null;
  if (isPlaceOwnedPhotoUrl(inventoryUrl)) return String(inventoryUrl);
  return p?.photos?.[0]?._directUri
    || (p?.photos?.[0]?.name ? "/api/photo?ref=" + encodeURIComponent(p.photos[0].name) + "&w=640" : null);
}
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
    // Keep a stored inventory URL only when it passes the shared non-stock URL
    // validator. Otherwise retain the exact place-bound Google ref path.
    photo: eventStayPhoto(p),
    blurb: p.editorialSummary?.text || null,
  })) : [];
  const places = selectEventStays([...(owned.status === "fulfilled" ? owned.value : []), ...rows], origin);
  return { places, unavailable: !places.length && (owned.status === "rejected" || inventory.status === "rejected") };
}

const readAllOwnedHotels = async (origin) => (await import("./hotels.js")).searchHotels({ ...origin, exhaustive: true });

export function completePoolPlace(row) {
  const signals = row?.signals || {};
  const photoUrl = row?.photo_url || signals.photo_url || signals.photoUrl || null;
  return {
    id: row?.place_id, name: row?.name, lat: Number(row?.lat), lng: Number(row?.lng),
    types: row?.google_types || [], primaryType: row?.primary_type,
    rating: signals.rating, reviews: signals.reviews || 0,
    wfScore: wayfindScore(signals.rating, signals.reviews || 0),
    address: signals.formattedAddress || signals.address || "",
    photo: isPlaceOwnedPhotoUrl(photoUrl) ? photoUrl
      : (row?.photo_ref ? "/api/photo?ref=" + encodeURIComponent(row.photo_ref) + "&w=640" : null),
    blurb: row?.editorial || null,
  };
}

export const readCompleteStayPool = async (origin, options = {}) => {
  const { fetchOwnedPool } = await import("./ownedPool.js");
  const result = await fetchOwnedPool(origin.lat, origin.lng, {
    radiusMi: EVENT_STAYS_RADIUS_MI,
    categories: ["hotels"],
    primaryOnly: true,
    identity: isTrueLodging,
    toPlace: completePoolPlace,
    deadlineMs: 2500,
    deadlineAt: Date.now() + 6500,
    photoDeadlineMs: 2500,
    ...options,
  });
  if (result.stats?.degraded) throw new Error("Hotel inventory is incomplete");
  return result.places;
};

// The poster claims a complete scored order. Unlike the event-page helper,
// this reads every owned hotel in the exact box and fails the whole answer if
// either source is unavailable or the exhaustive reader hits its loud cap.
export async function completeEventStays(origin, { readOwned = readAllOwnedHotels, readInventory = readCompleteStayPool } = {}) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return { places: [], unavailable: false };
  const [owned, inventory] = await Promise.allSettled([readOwned(origin), readInventory(origin)]);
  if (owned.status === "rejected" || inventory.status === "rejected") return { places: [], unavailable: true };
  return { places: selectEventStays([...(owned.value || []), ...(inventory.value || [])], origin), unavailable: false };
}
