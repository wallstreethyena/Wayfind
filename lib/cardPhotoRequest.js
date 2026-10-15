// Only live, mounted card images use this request. No disk or browser storage.
// The answer itself is shared with the viewer and the detail sheet through
// lib/photoAnswers.js, so one place is bought at most once per page session.
import { getPlacePhoto } from "./photoAnswers.js";
import { isGooglePlaceId } from "./placePhoto.js";

/** True for any Wayfind photo-proxy URL, whether or not it names a usable place. */
export function isApiPhotoSrc(src) {
  return typeof src === "string" && (src === "/api/photo" || src.startsWith("/api/photo?"));
}

/** The Google place id a /api/photo URL names (via ?ref=places/<id>/photos/.. or ?place=), else null. */
export function photoPlaceIdFromSrc(src) {
  if (typeof src !== "string" || !src.startsWith("/api/photo?")) return null;
  const u = new URL(src, "https://www.gowayfind.com");
  const ref = u.searchParams.get("ref") || "";
  const id = /^places\/([A-Za-z0-9_-]+)\/photos\//.exec(ref)?.[1] || u.searchParams.get("place");
  return isGooglePlaceId(id) ? id : null;
}

export function cardPhotoRequest(src) {
  const id = photoPlaceIdFromSrc(src);
  if (!id) return null;
  const u = new URL(src, "https://www.gowayfind.com");
  const q = new URLSearchParams({ place: id, s: "card", fmt: "json", w: "1200" });
  if (u.searchParams.get("nospend") === "1") q.set("nospend", "1");
  return "/api/photo?" + q;
}

/** Resolve a request built by cardPhotoRequest(); the answer carries its own placeId and credit. */
export function fetchCardPhoto(url, fetchImpl) {
  if (typeof url !== "string") return Promise.resolve(null);
  const q = new URL(url, "https://www.gowayfind.com").searchParams;
  return getPlacePhoto(q.get("place"), { surface: "card", nospend: q.get("nospend") === "1", fetchImpl });
}

/**
 * Photo source for a compact rail row ("More like", "Worth comparing nearby",
 * "Where to go next"). Wayfind-owned / licensed photo first. A place with no
 * stored photo still has its own place id, so it asks the credited card lane for
 * THAT place's photo (shared, memoized, spend-gated). Never another venue's photo.
 */
export function railPhotoSrc(place) {
  if (!place || typeof place !== "object") return null;
  if (typeof place.photo === "string" && place.photo.trim()) return place.photo;
  const id = typeof place.id === "string" ? place.id : "";
  return isGooglePlaceId(id) ? "/api/photo?place=" + encodeURIComponent(id) : null;
}
