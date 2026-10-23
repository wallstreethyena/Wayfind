// lib/eventNearbyPlaces.js — ONE ADMISSION BOUNDARY FOR AN EVENT'S NEARBY PICKS.
//
// Moved out of app/components/EventWhere.js (a server component that imports the
// server-only EventStays) so the browser re-anchor can run the very same rule on
// the picks it fetches after Apple moves the venue point. EventWhere re-exports
// it, so every existing import keeps working.
import { orderPlaceRecommendations } from "./placeRecommendationOrder.js";

// One admission boundary feeds both children. If a row cannot produce a real
// scored place card or a truthful map pin, it belongs in neither. Keeping this
// as one ordered array makes card rank N and map pin N the same place by
// construction, including after malformed provider rows are removed.
export function eventNearbyPlaces(picks, hasPoint) {
  if (!hasPoint || !Array.isArray(picks)) return [];
  return orderPlaceRecommendations(picks.filter((place) => place
    && place.id
    && place.name
    && typeof place.href === "string"
    && place.href.length > 0
    && Number.isFinite(place.lat)
    && Number.isFinite(place.lng)
    && Number.isFinite(place.distMi)
    && place.distMi >= 0
    && Number.isFinite(place.wfScore)
    && place.wfScore > 0
    && place.wfScore <= 100));
}
