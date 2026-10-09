// lib/discoveryRef.js — tiny, dependency-free, client-safe copy of
// lib/placePhotoServe.placeDiscoveryRef (the original is SERVER-ONLY and heavy:
// importing it from shared/client code would pull the spend gate and cache in).
// Keep the segment identical to PLACE_DISCOVERY_SEGMENT there.
//
// COMPLIANCE (2026-10-08): Google Maps Platform Terms 3.2.3 + Place Photos
// ("You cannot cache a photo name") mean we store ONLY the place ID. This
// pseudo-ref passes the photo-ref regex, carries only the place ID, and
// /api/photo resolves it by place ID alone.
export const DISCOVERY_SEGMENT = "wfplacediscovery";
export function placeDiscoveryRef(placeId) {
  return "places/" + String(placeId || "") + "/photos/" + DISCOVERY_SEGMENT;
}

// Collapse ANY photo ref (real Google name or pseudo-ref) to the place-only
// pseudo-ref; null for anything that is not a places/<id>/photos/<x> name.
const REF_RX = /^places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+$/;
export function toDiscoveryRef(ref) {
  const m = REF_RX.exec(String(ref || ""));
  return m ? placeDiscoveryRef(m[1]) : null;
}

// LEGACY SCRUB (2026-10-09). Data written before the 2026-10-08 cleanup can
// still sit in a cache entry (a Next data cache entry that could not be
// replaced kept /florida-events serving real photo names for hours). Any value
// read from such a cache passes through this before it reaches a page:
//   - a real Google photo name inside a string (plain or URL-encoded) becomes
//     the place-only pseudo-ref;
//   - a string holding a saved Google-hosted image URL becomes "";
//   - an `authorAttributions` array (a persisted Google credit) becomes [].
// Everything else (licensed credits, Unsplash links, owned URLs) is untouched.
// Pure, recursive, returns new values, never throws on odd input.
const LEGACY_NAME_RX = /(places(?:\/|%2F)[A-Za-z0-9_-]+(?:\/|%2F)photos(?:\/|%2F))[A-Za-z0-9_-]{25,}/gi;
const GOOGLE_HOSTED_RX = /(?:^|[/.])(?:lh\d\.googleusercontent\.com|[a-z0-9-]*\.ggpht\.com|places\.googleapis\.com\/v1\/places\/[^/]+\/photos\/)/i;
export function scrubLegacyGooglePhotoData(value, depth = 0) {
  if (depth > 12) return value;
  if (typeof value === "string") {
    if (GOOGLE_HOSTED_RX.test(value)) return "";
    return value.replace(LEGACY_NAME_RX, "$1" + DISCOVERY_SEGMENT);
  }
  if (Array.isArray(value)) return value.map((v) => scrubLegacyGooglePhotoData(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = k === "authorAttributions" ? [] : scrubLegacyGooglePhotoData(value[k], depth + 1);
    }
    return out;
  }
  return value;
}
