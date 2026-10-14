// lib/inventoryRefreshPatch.js — the ONE wf_inventory refresh patch. Pure.
//
// NEVER EXTEND GOOGLE CONTENT BY BUMPING A TIMESTAMP (2026-10-14). refreshed_at
// is the observation time of the row's Google Places content, and the map's
// source-aware coordinate rule (lib/coordProvenance.js) draws a Google
// coordinate only while refreshed_at is inside Google's 30-day cache window.
// The old inventory-refresh cron stamped refreshed_at = now after a
// cache-first details read that could serve a copy up to 30 days old, and it
// never wrote lat/lng — so a "fresh" row could carry a coordinate fetched
// months earlier. This patch is built only from content fetched from Google in
// this very call, dates the row by that fetch, and writes the fetched
// coordinate with it. Anything else returns null: the row is left alone and
// ages out honestly. Locked by scripts/test-coord-provenance.mjs.
import { placeDiscoveryRef } from "./discoveryRef.js";

function validLatLng(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

// dated: the result of lib/placeDetails.getPlaceDetailsDated(placeId).
export function inventoryRefreshPatch(placeId, dated, now = Date.now()) {
  if (!placeId || !dated || dated.live !== true) return null;
  const d = dated.details;
  if (!d || !d.id || d.id !== placeId) return null;
  const fetched = Date.parse(dated.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now) return null;
  if (!validLatLng(d.lat, d.lng)) return null;
  const at = new Date(fetched).toISOString();
  const patch = {
    lat: d.lat,
    lng: d.lng,
    google_types: Array.isArray(d.types) ? d.types : [],
    status: d.businessStatus || null,
    refreshed_at: at,
    last_verified_at: at,
  };
  // Only overwrite the photo when Google actually returned one — a missing
  // photo on one refresh must not blank a card that had one. Place-only
  // pseudo-ref (never a real Google photo name; 2026-10-08 compliance).
  if (d.photoRef) patch.photo_ref = placeDiscoveryRef(placeId);
  return patch;
}
