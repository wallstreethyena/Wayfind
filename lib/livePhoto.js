// lib/livePhoto.js — client helper for the credited-surface photo.
//
// GET /api/photo?place=<id>&s=detail&fmt=json&w=1200 may buy a live Google
// photo (server-side spend cap), so: at most ONE call per place id per page
// session, memoized in module memory only (never localStorage), called only
// from the detail sheet / event hero — never from cards, rails or lists.

const PLACE_ID_RX = /^[A-Za-z0-9_-]{16,}$/;
const memo = new Map(); // placeId -> Promise<{src,source,credit}|null>

export function isLivePlaceId(id) {
  return PLACE_ID_RX.test(String(id || ""));
}

export function fetchLivePhoto(placeId, fetchImpl) {
  const id = String(placeId || "");
  if (!isLivePlaceId(id)) return Promise.resolve(null);
  if (memo.has(id)) return memo.get(id);
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return Promise.resolve(null);
  const p = (async () => {
    try {
      const r = await f("/api/photo?place=" + encodeURIComponent(id) + "&s=detail&fmt=json&w=1200");
      if (!r || !r.ok) return null;
      const j = await r.json();
      if (!j || !j.src || j.source === "none") return null;
      return { src: String(j.src), source: String(j.source || ""), credit: j.credit || null };
    } catch (e) { return null; }
  })();
  memo.set(id, p);
  return p;
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
