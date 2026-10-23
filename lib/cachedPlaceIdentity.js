// SERVER-ONLY: reuse a dated, still-fresh pd1 identity without enrichment or
// refreshing its lifetime. Photo resources and volatile fields never escape.
import { cget } from "./serverCache.js";
import { placeDiscoveryRef } from "./discoveryRef.js";

const MAX_AGE_MS = 25 * 86400000;
const ID_RX = /^[A-Za-z0-9_-]+$/;
const TYPE_RX = /^[a-z][a-z0-9_]{0,99}$/;

export function selectCachedPlaceIdentity(placeId, hit) {
  if (typeof placeId !== "string" || !ID_RX.test(placeId) ||
      hit?.wroteKnown !== true || hit.stale !== false || hit.due !== false ||
      !Number.isFinite(hit.ageMs) || hit.ageMs < 0 || hit.ageMs >= MAX_AGE_MS) return null;
  const v = hit.v;
  if (!v || typeof v !== "object" || Array.isArray(v) || v.id !== placeId ||
      typeof v.name !== "string" || !v.name.trim() || v.name.length > 500 ||
      !Number.isFinite(v.lat) || v.lat < -90 || v.lat > 90 ||
      !Number.isFinite(v.lng) || v.lng < -180 || v.lng > 180 ||
      v.businessStatus !== "OPERATIONAL") return null;
  const types = Array.isArray(v.types)
    ? v.types.filter(t => typeof t === "string" && TYPE_RX.test(t)).slice(0, 50)
    : [];
  // Fixed allowlist, never spread a legacy payload (it can contain photo
  // names, live URIs, attributions, opening hours or descriptive enrichment).
  return {
    id: placeId,
    displayName: { text: v.name.trim() },
    location: { latitude: v.lat, longitude: v.lng },
    formattedAddress: typeof v.address === "string" ? v.address.slice(0, 1000) : null,
    types,
    primaryType: types[0] || null,
    businessStatus: "OPERATIONAL",
    photos: [{ name: placeDiscoveryRef(placeId) }],
  };
}

export async function getCachedPlaceIdentity(placeId) {
  try {
    return selectCachedPlaceIdentity(placeId, await cget("pd1|" + placeId));
  } catch {
    return null;
  }
}
