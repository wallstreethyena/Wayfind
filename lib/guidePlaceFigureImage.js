import { isPlaceOwnedPhotoUrl } from "./placePhoto.js";
import { isGooglePhotoSrc } from "./googlePhotoSrc.js";

// Independently viewed 2026-10-15: these inherited free-lane files depict a
// logo, an unrelated holiday house, and an office tower respectively. Their
// place ids and successful HTTP responses do not make them venue photographs.
const REJECTED_EDITORIAL_FILES = new Set([
  "d43e73b66c2aefcb993dc6db.svg",
  "bc1a154b52a063a33a4dfed6.jpg",
  "1289c38f2c9c4ad717c674aa.jpg",
]);
export function isRejectedGuidePhotoUrl(value) {
  if (typeof value !== "string") return false;
  try { return REJECTED_EDITORIAL_FILES.has(decodeURIComponent(new URL(value, "https://www.gowayfind.com").pathname).split("/").at(-1)); }
  catch { return false; }
}

// Server-resolved editorial media. No photo endpoint or Google media request:
// a cache miss is honest typography, never spend or a different venue.
export async function guidePlaceFigureImage(place, { findFreePhoto } = {}) {
  if (!place) return null;
  const base = { alt: place.name || "", width: 1600, height: 900 };
  // An editorial photo is Wayfind's own or licensed art. A Google-hosted URL
  // is never one, whatever credit text rides along (2026-09-30): Google
  // photos only render through the credited branches below.
  if (isPlaceOwnedPhotoUrl(place.photo) && !isGooglePhotoSrc(place.photo) && !isRejectedGuidePhotoUrl(place.photo) && place.photoAttr) {
    return { ...base, src: place.photo, credit: place.photoAttr, creditHref: place.photoAttrHref || null };
  }
  const placeId = place.place_id || place.id;
  if (!placeId) return null;
  try {
    const free = await findFreePhoto?.({ placeId, width: 1200 });
    if (free?.url && !isRejectedGuidePhotoUrl(free.url) && free.attributionText && free.attributionUrl) {
      return { ...base, src: free.url, credit: free.attributionText, creditHref: free.attributionUrl, license: free.license || null, licenseUrl: free.licenseUrl || free.licenseURL || null };
    }
  } catch {}
  // COMPLIANCE (2026-10-08): the Google lane is removed. It put cached
  // googleusercontent URLs from stored credits (wf_photo_credit) and cached
  // photo| rows into HTML, which Google Maps Platform Terms 3.2.3 forbid. Guide
  // figures are Wayfind-owned or licensed photos only; otherwise the placeholder.
  return null;
}

// The only /api/photo form this module may emit. `nospend=1` is the contract
// that makes it incapable of spending; scripts/test-guide-editorial-photos.mjs
// asserts it on every output.
export function noSpendCachedPhotoSrc(ref) {
  return `/api/photo?ref=${encodeURIComponent(ref)}&g=2&w=1200&nospend=1`;
}

// Retired 2026-10-08 (Google Maps Platform Terms 3.2.3): no stored Google credit
// or cached Google photo is read any more. Exports kept so imports still bind.
export async function findEditorialPhotoCredit() { return null; }
export async function findCreditedEditorialCache() { return null; }
