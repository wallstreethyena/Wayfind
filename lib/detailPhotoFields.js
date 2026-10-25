// Photos for the detail sheet. Vaulted `{ _directUri }` / string URLs stay.
// A discovery ref still becomes the guarded proxy so a photoless row can heal.
// The proxy string matches photoProxyURL(ref, 640) in lib/google.js.
// This lives outside lib/placePhoto.js so browser harnesses that compile
// placePhoto.js (christmas card slot, image health, event hero) do not have
// to know discoveryRef.js.
import { hasPlacePhotoRef } from "./placePhoto.js";
import { placeDiscoveryRef } from "./discoveryRef.js";

export function detailPhotoFields(place, placeId) {
  const photosIn = Array.isArray(place?.photos) ? place.photos : [];
  if (!photosIn.length) return { photos: [], photo: null, photoRef: null };
  const direct = [];
  const seen = new Set();
  for (const item of photosIn) {
    const src = typeof item === "string" ? item : (item && (item._directUri || item.url)) || "";
    const value = String(src || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    direct.push(value);
  }
  const dRef = placeDiscoveryRef(placeId);
  const proxy = dRef ? "/api/photo?ref=" + encodeURIComponent(dRef) + "&g=2&w=640" : null;
  const photos = direct.slice();
  if (proxy && !seen.has(proxy)) photos.push(proxy);
  const named = photosIn.find((item) => item && hasPlacePhotoRef(item.name));
  return { photos, photo: photos[0] || null, photoRef: named ? dRef : null };
}
