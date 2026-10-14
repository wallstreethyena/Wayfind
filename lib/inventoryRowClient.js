// lib/inventoryRowClient.js — the ONE client mapper from an inventory-served row
// (lib/inventoryServe.js invRowToPlace, Google-resource shape) to the app's card shape.
//
// 2026-09-23 — pulled out of the inv=1 fetch's inline `.map()` so the "Wayfind 5 more
// spots" continuation maps a later server page IDENTICALLY to the first one.
// 2026-10-06 — richer cards: this used to DROP priceLevel, cuisines, tags and
// editorialSummary.text, all of which the server already sends, so Food browse cards
// looked empty (no price, no cuisine, no why line). Moved out of app/home.js so a lock
// test can CALL it (scripts/test-inventory-row-card-fields.mjs).
// Pure; a row already in the app's own shape (has `name`, no `displayName`) passes
// through unchanged.
import { distMeters, wayfindScore } from "./google";
import { priceNumFrom } from "./price";

export function mapInventoryRow(x, center) {
  if (!x) return null;
  if (x.name && !x.displayName) return x; // already app-shaped
  const _la = x.location && x.location.latitude, _ln = x.location && x.location.longitude;
  const _ph = x.photos && x.photos[0] && x.photos[0].name;
  const _own = x.photo_url || x.photoUrl || null;
  // ONE price truth: lib/price.js priceLevelOf (Google enum or 1..4 -> 1..4 | null).
  const _pn = priceNumFrom(x.priceLevel); // 0 = real free, 1..4, null = unknown
  const _ed = x.editorialSummary && typeof x.editorialSummary.text === "string" ? x.editorialSummary.text.trim() : "";
  return {
    id: x.id,
    name: (x.displayName && x.displayName.text) || x.name || "",
    lat: _la, lng: _ln,
    distMi: _la != null ? distMeters(center, { lat: _la, lng: _ln }) / 1609.34 : null,
    rating: typeof x.rating === "number" ? x.rating : null,
    reviews: x.userRatingCount || 0,
    wfScore: wayfindScore(typeof x.rating === "number" ? x.rating : 0, x.userRatingCount || 0),
    types: Array.isArray(x.types) ? x.types : [],
    primaryType: x.primaryType || x.primary_type || null,
    priceNum: _pn,
    cuisines: Array.isArray(x.cuisines) ? x.cuisines.filter((c) => typeof c === "string" && c) : [],
    tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === "string" && t) : [],
    _invEditorial: _ed || null,
    photo: _own || (_ph ? "/api/photo?ref=" + encodeURIComponent(_ph) + "&g=2&w=640" : null),
    openNow: null,
    businessStatus: x.businessStatus || "OPERATIONAL",
    _wfInventory: true,
  };
}
