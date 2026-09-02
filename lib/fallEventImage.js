// A collection poster identifies the Fall in Florida rail. It is not a photo
// of Haraz House, a pottery studio, a farm, or any other named destination.
// Legacy seeded rows may still carry this value, so the serve-time boundary
// must reject it even after the source registry is corrected.
import { cardImageSrc } from "./placePhoto.js";

export const FALL_COLLECTION_POSTER = "/cards-v8/augtober-760.webp";

export function fallEventCardImageSrc(event, w = 640) {
  const hero = String(event?.hero_image || "").trim();
  if (hero && hero !== FALL_COLLECTION_POSTER) return hero;
  return cardImageSrc({ place_id: event?.place_id }, w);
}
