// lib/detailHero.js — whether the place-detail sheet may paint a photo-led hero.
//
// Founder rule: a 250px photo hero exists ONLY when we have a real place photo
// (photos[] or a real photo / photoRef that is not the branded-pin fallback).
// Otherwise the sheet is compact: name, address, score, actions. Stock imagery
// is scene-setting, never a photo of that named business. This module is pure
// so scripts/test-detail-hero.mjs can import it without loading JSX.

import { hasPlacePhotoRef } from "./placePhoto.js";

const STOCK_RX = /(?:^|[\/.])(?:www\.)?(?:images\.)?pexels\.com\b|\/api\/market-photo(?:\?|$)/i;
const PHOTO_PROXY_RX = /\/api\/photo\?[^#]*\bref=([^&]+)/;

function decodeRef(raw) {
  try { return decodeURIComponent(String(raw || "")); } catch { return String(raw || ""); }
}

function isStockPhotoSrc(src) {
  return STOCK_RX.test(String(src || ""));
}

function isRealPhotoSrc(src) {
  if (src == null) return false;
  if (typeof src === "object") {
    if (hasPlacePhotoRef(src.name || src.photo_ref || src.photoRef)) return true;
    return isRealPhotoSrc(src.url || src.src || src.uri);
  }
  const s = String(src).trim();
  if (!s) return false;
  if (isStockPhotoSrc(s)) return false;
  if (hasPlacePhotoRef(s)) return true;
  if (s.includes("/api/photo")) {
    const proxy = s.match(PHOTO_PROXY_RX);
    return !!(proxy && hasPlacePhotoRef(decodeRef(proxy[1])));
  }
  if (/^https?:\/\//i.test(s)) return true;
  if (s.startsWith("/") && !s.startsWith("/api/photo")) return true;
  return false;
}

function proxyFromRef(ref) {
  return hasPlacePhotoRef(ref) ? ("/api/photo?ref=" + encodeURIComponent(ref) + "&w=640") : null;
}

function srcFromValue(src) {
  if (src == null) return null;
  if (typeof src === "object") {
    const ref = src.name || src.photo_ref || src.photoRef;
    if (hasPlacePhotoRef(ref)) return proxyFromRef(ref);
    return srcFromValue(src.url || src.src || src.uri);
  }
  const s = String(src).trim();
  if (!s || !isRealPhotoSrc(s)) return null;
  if (hasPlacePhotoRef(s)) return proxyFromRef(s);
  return s;
}

export function hasRealPlacePhoto(detail) {
  if (!detail || typeof detail !== "object") return false;
  const photos = detail.photos;
  if (Array.isArray(photos) && photos.some(isRealPhotoSrc)) return true;
  if (isRealPhotoSrc(detail.photo)) return true;
  if (hasPlacePhotoRef(detail.photoRef) || hasPlacePhotoRef(detail.photo_ref)) return true;
  return false;
}

// First real src the Detail hero may paint. photoRef-only rows become a
// /api/photo proxy URL — never a blank src that would fall through to the pin.
export function realPlacePhotoSrc(detail) {
  if (!detail) return null;
  if (Array.isArray(detail.photos)) {
    for (const p of detail.photos) {
      const src = srcFromValue(p);
      if (src) return src;
    }
  }
  const fromPhoto = srcFromValue(detail.photo);
  if (fromPhoto) return fromPhoto;
  return proxyFromRef(detail.photoRef || detail.photo_ref);
}

// Attach photos Places actually returned. Never invent a photo_ref. Fail-closed
// when the extra payload is a failure or has nothing real to donate.
export function mergeHealedPlacePhotos(current, extra) {
  if (!current || !extra || extra.ok === false) return current;
  const incomingPhotos = Array.isArray(extra.photos) ? extra.photos.filter(isRealPhotoSrc) : [];
  const incomingRef = hasPlacePhotoRef(extra.photoRef)
    ? extra.photoRef
    : (hasPlacePhotoRef(extra.photo_ref) ? extra.photo_ref : null);
  const incomingPhoto = isRealPhotoSrc(extra.photo) ? extra.photo : (incomingPhotos[0] || null);
  if (!incomingPhotos.length && !incomingPhoto && !incomingRef) return current;
  if (hasRealPlacePhoto(current)) {
    if (incomingRef && !current.photoRef && !current.photo_ref) {
      return { ...current, photoRef: incomingRef };
    }
    return current;
  }
  const next = { ...current };
  if (incomingPhotos.length) next.photos = incomingPhotos;
  if (incomingPhoto) next.photo = incomingPhoto;
  if (incomingRef) next.photoRef = incomingRef;
  return next;
}
