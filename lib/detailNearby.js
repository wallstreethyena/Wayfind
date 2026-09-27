import { milesBetween } from "./locationHonesty.js";

// The detail sheet's existing "Where to go next" radius. All loaded-pool
// recommendations on this sheet describe the selected place, not the visitor.
export const DETAIL_NEARBY_RADIUS_MI = 8;

function hasPoint(place) {
  return !!place && typeof place.lat === "number" && typeof place.lng === "number"
    && Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180;
}

export function detailDistanceMi(place, candidate) {
  return hasPoint(place) && hasPoint(candidate) ? milesBetween(place, candidate) : null;
}

// Keep the original objects, order, visitor distances, and scores. This is a
// geographic admission gate only; the existing category/similarity rules rank.
export function detailNearbyPool(place, pool) {
  if (!hasPoint(place)) return [];
  return (Array.isArray(pool) ? pool : []).filter((candidate) => {
    if (!candidate || !candidate.id || candidate.id === place.id) return false;
    const distance = detailDistanceMi(place, candidate);
    return distance != null && distance <= DETAIL_NEARBY_RADIUS_MI;
  });
}
