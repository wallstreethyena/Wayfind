// lib/creatorPlaceCover.js — client-safe, pure. Kept apart from lib/creatorCovers.js
// (which reads Supabase on the server) so the browser bundle never pulls that in.
import { isGooglePlaceId } from "./placePhoto.js";

/**
 * The fallback cover request for a creator video tile with no owned cover: THIS
 * place's photo through /api/photo. app/components/CreatorPlaceCover.js sends it
 * down the linked-card lane (nospend, stored copy only, credited). Null for
 * anything that is not a Google place id.
 */
export function creatorPlaceCoverSrc(placeId) {
  const id = String(placeId || "").trim();
  return isGooglePlaceId(id) ? "/api/photo?place=" + encodeURIComponent(id) : null;
}
