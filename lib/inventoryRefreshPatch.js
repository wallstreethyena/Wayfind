// lib/inventoryRefreshPatch.js — the ONE wf_inventory refresh patch. Pure.
//
// NEVER EXTEND GOOGLE CONTENT BY BUMPING A TIMESTAMP (2026-10-14). refreshed_at
// is the observation time of the row's Google Places content, and the map's
// source-aware coordinate rule (lib/coordProvenance.js) draws a Google
// coordinate only while refreshed_at is inside Google's 30-day cache window.
// The old inventory-refresh cron stamped refreshed_at = now after a
// cache-first details read that could serve a copy up to 30 days old, and it
// never wrote lat/lng — so a "fresh" row could carry a coordinate fetched
// months earlier. This patch dates the row by WHEN GOOGLE RETURNED the content
// (`fetchedAt` from getPlaceDetailsDated: a live fetch = now; a cached copy =
// its recorded write time), and writes that same content's coordinate with
// it. Undated content (legacy cache rows) returns null: the row is left alone
// and ages out honestly. Never dated "now" unless fetched now. Locked by
// scripts/test-coord-provenance.mjs.
import { placeDiscoveryRef } from "./discoveryRef.js";

function validLatLng(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

// dated: the result of lib/placeDetails.getPlaceDetailsDated(placeId):
// { details, live, fetchedAt } where fetchedAt is when Google returned it.
// currentRefreshedAt: the row's stored refreshed_at. Content no newer than
// what the row already holds is not a refresh (it would only move the date
// sideways or backwards), so it returns null.
export function inventoryRefreshPatch(placeId, dated, now = Date.now(), currentRefreshedAt = null) {
  if (!placeId || !dated) return null;
  const d = dated.details;
  if (!d || !d.id || d.id !== placeId) return null;
  const fetched = Date.parse(dated.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now) return null;
  const current = currentRefreshedAt == null ? NaN : Date.parse(currentRefreshedAt);
  if (Number.isFinite(current) && fetched <= current) return null;
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

// QUEUE WEDGE (2026-10-14 review). The cron reads stalest-first. A row whose
// refresh cannot produce newer dated content (Google refuses, the gate is
// shut, only an older cached copy exists) keeps its old refreshed_at and would
// sit at the head of the queue forever, starving everything behind it. No
// column records "attempted", and refreshed_at must never be bumped to rotate
// it. So the cron reads a WINDOW of the stalest rows (REFRESH_WINDOW_SLOTS x
// limit) and each hour takes a different limit-sized slice of it: a stuck
// head row is retried every REFRESH_WINDOW_SLOTS hours instead of every hour,
// and the other slices keep moving. Pure; locked by test-coord-provenance.
export const REFRESH_WINDOW_SLOTS = 4;
export function refreshSlice(windowRows, limit, slot) {
  const rows = Array.isArray(windowRows) ? windowRows : [];
  const n = Math.max(1, Math.floor(limit) || 1);
  if (rows.length <= n) return rows.slice();
  const slices = Math.ceil(rows.length / n);
  const start = ((Math.floor(slot) % slices) + slices) % slices * n;
  return rows.slice(start, start + n);
}
