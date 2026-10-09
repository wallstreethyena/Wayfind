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
