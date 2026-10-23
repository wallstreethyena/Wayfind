// lib/livePhoto.js — client helper for the credited-surface photo.
//
// The detail sheet / event hero / lightbox ask lib/photoAnswers.js for the
// photo, which is the SAME per-page answer the cards use: if a card already
// bought this place's photo, the detail sheet reuses that exact photo and
// credit with no second request. Memory only (never localStorage).

import { getPlacePhoto, photoAnswerStatus, MAX_ATTEMPTS } from "./photoAnswers.js";

const PLACE_ID_RX = /^[A-Za-z0-9_-]{16,}$/;

export function isLivePlaceId(id) {
  return PLACE_ID_RX.test(String(id || ""));
}

export function fetchLivePhoto(placeId, fetchImpl) {
  const id = String(placeId || "");
  if (!isLivePlaceId(id)) return Promise.resolve(null);
  return getPlacePhoto(id, { surface: "detail", fetchImpl });
}

// Detail has to acquire an answer before it can mount an image. A transient
// JSON failure therefore cannot rely on CardPhoto's image-error recovery.
// Keep the initial shared request, then use only the shared, bounded free lane.
export function acquireDetailPhoto(placeId, onAnswer, { fetchImpl, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let cancelled = false, timer = null, freeAttempts = 0;
  const finish = (photo) => { if (!cancelled) onAnswer(photo); };
  const recover = () => {
    timer = null;
    if (cancelled) return;
    freeAttempts++;
    getPlacePhoto(placeId, { surface: "detail", nospend: true, fetchImpl, now }).then((photo) => {
      if (cancelled) return;
      if (photo) { finish(photo); return; }
      const status = photoAnswerStatus(placeId, { nospend: true, now });
      if (freeAttempts < MAX_ATTEMPTS && status.retryable) schedule(status.retryAfterMs);
      else finish(null);
    });
  };
  const schedule = (delay) => { timer = setTimer(recover, Math.max(1, delay)); };
  fetchLivePhoto(placeId, fetchImpl).then((photo) => {
    if (cancelled) return;
    if (photo) { finish(photo); return; }
    const status = photoAnswerStatus(placeId, { now });
    // Exhausting the spend-capable lane (for example in a card before this
    // sheet opens) still permits bounded free checks, never another purchase.
    if (status.transient) schedule(status.retryAfterMs);
    else finish(null);
  });
  // Shared requests may still serve another mounted surface. Cancel this
  // consumer's timer and updates without aborting another surface's answer.
  return () => { cancelled = true; if (timer !== null) clearTimer(timer); };
}

// Pure helpers over a detail object that carries `_live` (set by the Detail sheet).
function isOwnedSrc(s) {
  return typeof s === "string" && s.trim() !== "" && !s.startsWith("/api/photo");
}

// The photos the detail gallery/lightbox show: owned non-proxy URLs plus the
// live photo (first when there is no owned photo, otherwise appended).
export function detailGalleryPhotos(detail) {
  if (!detail || typeof detail !== "object") return [];
  const owned = [];
  const add = (s) => { if (isOwnedSrc(s) && owned.indexOf(s) === -1) owned.push(s); };
  if (Array.isArray(detail.photos)) detail.photos.forEach(add);
  if (!owned.length) add(detail.photo);
  const live = detail._live && detail._live.src ? detail._live.src : null;
  if (live && owned.indexOf(live) === -1) owned.push(live);
  return owned;
}

// Credit for the image currently shown, or null (Wayfind-owned / unknown).
export function liveCreditFor(detail, src) {
  const l = detail && detail._live;
  if (!l || !l.src || l.src !== src || !l.credit || l.source === "wayfind") return null;
  return { source: l.source, ...l.credit };
}
