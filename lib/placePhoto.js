// Pure identity gate for filling a missing place-card image from the existing
// cached Google text-search route. A text-search result may only donate a photo
// when it is the same Place ID, or when both the exact normalized name and a
// tight geographic check agree. A prettier card is never worth a wrong venue.

const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const finite = (n) => typeof n === "number" && Number.isFinite(n);

function rowId(row) { return row && (row.id || row.place_id) ? String(row.id || row.place_id) : ""; }
function rowName(row) { return row && (row.name || (row.displayName && row.displayName.text)) || ""; }
function rowPoint(row) {
  const loc = row && row.location || {};
  const lat = row && finite(row.lat) ? row.lat : loc.latitude;
  const lng = row && finite(row.lng) ? row.lng : loc.longitude;
  return finite(lat) && finite(lng) ? { lat, lng } : null;
}
function photoRef(row) {
  const ref = row && (row.photo_ref || (Array.isArray(row.photos) && row.photos[0] && row.photos[0].name));
  return REF_RX.test(String(ref || "")) ? String(ref) : null;
}
function distanceMi(a, b) {
  if (!a || !b) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function selectPlacePhotoRef(rows, target, maxNameFallbackMi = 2) {
  const list = Array.isArray(rows) ? rows.filter((r) => photoRef(r)) : [];
  const id = rowId(target);
  if (id) {
    const exact = list.find((r) => rowId(r) === id);
    if (exact) return photoRef(exact);
  }
  const name = norm(target && (target.name || target.title));
  const point = rowPoint(target);
  if (!name || !point) return null;
  const byName = list
    .filter((r) => norm(rowName(r)) === name)
    .map((r) => ({ row: r, distance: distanceMi(point, rowPoint(r)) }))
    .filter((x) => x.distance <= maxNameFallbackMi)
    .sort((a, b) => a.distance - b.distance)[0];
  return byName ? photoRef(byName.row) : null;
}

export function hasPlacePhotoRef(value) { return REF_RX.test(String(value || "")); }

export function placeIdFromPhotoRef(ref) {
  if (!REF_RX.test(String(ref || ""))) return "";
  return String(ref).split("/")[1] || "";
}

/** True only when the Google photo resource name is THIS place's. */
export function photoRefOwnedByPlace(ref, placeId) {
  const id = String(placeId || "");
  const from = placeIdFromPhotoRef(ref);
  return !!id && !!from && from === id;
}

const STOCK_PHOTO_RX = /(?:^|[\/.])(?:www\.)?(?:images\.)?pexels\.com\b|\/api\/market-photo(?:\?|$)|\/api\/stock-photo(?:\?|$)|\/wf-photo-fallback\.svg(?:\?|$)/i;

/** Stored Atlas / inventory / owned-upload URL. Never a shared pool. */
export function isPlaceOwnedPhotoUrl(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (STOCK_PHOTO_RX.test(s)) return false;
  if (s.startsWith("/api/photo")) return false;
  if (s.startsWith("/") && !s.startsWith("//")) return true;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (STOCK_PHOTO_RX.test(u.href) || STOCK_PHOTO_RX.test(u.hostname)) return false;
  if (/(?:^|\.)googleapis\.com$/i.test(u.hostname)) return false;
  return true;
}

function ownedRefOf(place) {
  if (!place) return "";
  const id = place.id || place.place_id || "";
  const candidates = [
    place.photoRef,
    place.photo_ref,
    Array.isArray(place.photos) && place.photos[0] && (place.photos[0].name || place.photos[0].ref),
  ];
  for (const c of candidates) {
    if (photoRefOwnedByPlace(c, id)) return String(c);
  }
  return "";
}

function ownedUrlOf(place) {
  if (!place) return "";
  const candidates = [place.photo_url, place.photoUrl];
  for (const c of candidates) {
    if (isPlaceOwnedPhotoUrl(c)) return String(c);
  }
  return "";
}

/**
 * Landing list card <img src>. A card may only show a photo that belongs to
 * THAT place (inventory / Atlas / owned upload / owned Google photo_ref).
 * Empty string = placeholder. Never another venue, never a category pool.
 */
export function landingCardPhotoSrc(place) {
  if (!place) return "";
  const url = ownedUrlOf(place);
  if (url) return url;
  const ref = ownedRefOf(place);
  if (ref) return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=1200";
  return "";
}

/** Guard: an <img src> is legal for this card's place id (empty is legal). */
export function isLandingCardImageAllowed(src, placeId) {
  const s = String(src || "").trim();
  if (!s) return true;
  if (STOCK_PHOTO_RX.test(s)) return s.includes("wf-photo-fallback.svg");
  const m = /[?&]ref=([^&]+)/.exec(s);
  if (m && /\/api\/photo(?:\?|$)/.test(s)) {
    let ref = m[1];
    try { ref = decodeURIComponent(ref); } catch { /* keep raw */ }
    return photoRefOwnedByPlace(ref, placeId);
  }
  return isPlaceOwnedPhotoUrl(s);
}
