import { validStayOrigin } from "./stayOrigin.js";

export const FALL_DESTINATION_NAME_DEDUPE_MI = 0.15;

const normalizedVenueName = (value) => String(value || "").toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function milesBetween(a, b) {
  const toRad = (n) => n * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

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
      const normalizedName = normalizedVenueName(name);
      // Some curated event rows predate their Google venue identity while the
      // matching place card already has it. Exact normalized venue name plus a
      // tight campus-scale point match proves that pair is one destination.
      // Neither signal alone is sufficient: same-name distant branches and
      // different attractions next door remain independent hotel anchors.
      if (normalizedName && destinations.some((destination) => destination.normalizedName === normalizedName
        && milesBetween(destination, { lat, lng }) <= FALL_DESTINATION_NAME_DEDUPE_MI)) continue;
      seen.add(key);
      destinations.push({ id: key, name, city: String(card?.city || card?.metro || "").trim(), lat, lng, normalizedName });
    }
  }
  return destinations.map(({ normalizedName: _, ...destination }) => destination);
}
