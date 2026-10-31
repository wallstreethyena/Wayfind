// Photos for the detail sheet. Vaulted `{ _directUri }` / string URLs stay.
// A discovery ref still becomes the guarded proxy so a photoless row can heal.
// The proxy string matches photoProxyURL(ref, 640) in lib/google.js.
// This lives outside lib/placePhoto.js so browser harnesses that compile
// placePhoto.js (christmas card slot, image health, event hero) do not have
// to know discoveryRef.js.
import { hasPlacePhotoRef } from "./placePhoto.js";
import { placeDiscoveryRef } from "./discoveryRef.js";

// Photos normalize() puts on a place. Stored `_directUri` values stay, in
// order, with the first one as the cover. A Google photo name collapses to
// the one place proxy (no extra media fetch). Duplicates are dropped.
export function normalizedPhotoList(photos, placeId) {
  const list = Array.isArray(photos) ? photos : [];
  const proxy = placeId
    ? "/api/photo?ref=" + encodeURIComponent(placeDiscoveryRef(placeId)) + "&g=2&w=640"
    : "";
  const seen = new Set();
  const out = [];
  const attrs = [];
  for (const ph of list) {
    let src = "";
    if (ph && ph.name) src = proxy;
    else if (ph && typeof ph.getURI === "function") {
      try { src = ph.getURI({ maxWidth: 640 }) || ""; } catch { src = ""; }
    } else if (ph && typeof ph._directUri === "string") src = ph._directUri;
    src = typeof src === "string" ? src.trim() : "";
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    let attr = "";
    try {
      const a = ph && ph.authorAttributions && ph.authorAttributions[0];
      attr = (a && (a.displayName || a.display_name)) || "";
    } catch { attr = ""; }
    attrs.push(attr);
  }
  return { photos: out, photoAttrs: attrs, photo: out[0] || null };
}

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
