import { validStayOrigin } from "./stayOrigin.js";

function destinationIdentity(card) {
  const placeId = String(card?.place_id || (card?.kind === "place" ? card?.id : "") || "").trim();
  if (placeId) return `place:${placeId}`;
  const lat = Number(card?.lat);
  const lng = Number(card?.lng);
  return `point:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// This runs against the full composed answer before its wire windows are cut.
// A city is not an identity: two Orlando venues can be farther apart than the
// hotel radius and therefore remain separate choices.
export function fallStayDestinations(rails) {
  const seen = new Set();
  const destinations = [];
  for (const rail of Array.isArray(rails) ? rails : []) {
    for (const card of Array.isArray(rail?.cards) ? rail.cards : []) {
      const lat = Number(card?.lat);
      const lng = Number(card?.lng);
      if (!validStayOrigin(lat, lng)) continue;
      const key = destinationIdentity(card);
      if (seen.has(key)) continue;
      const name = String(card?.kind === "event" ? (card?.venue || card?.title || card?.name || "") : (card?.title || card?.name || "")).trim();
      if (!name) continue;
      seen.add(key);
      destinations.push({ id: key, name, city: String(card?.city || card?.metro || "").trim(), lat, lng });
    }
  }
  return destinations;
}
