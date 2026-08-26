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

export function refPlaceId(ref) {
  const s = String(ref || "");
  return REF_RX.test(s) ? s.split("/")[1] : null;
}

function extractRef(value) {
  if (hasPlacePhotoRef(value)) return String(value);
  const m = String(value || "").match(/[?&]ref=([^&]+)/);
  if (!m) return null;
  try {
    const dec = decodeURIComponent(m[1]);
    return hasPlacePhotoRef(dec) ? dec : null;
  } catch (e) { return null; }
}

// THE CARD PHOTO LAW (2026-08-25, Family → Toddlers at Parrish):
// River Walk, Nathan Benderson Park and Bishop Museum all painted the SAME
// manatee. Kids Empire and Intense Escape had already shared one beach
// sunset. A house card may show THIS place's own Google photo, or the
// branded monogram. It may never show another place's photo, a
// category+city stock scene, or a cache keyed on the chip.
//
// Google photo resource names are `places/{placeId}/photos/{photoId}`.
// If the card's placeId and the ref's placeId disagree, the photo is
// someone else's — drop it. Empty is honest; a stolen manatee is not.
function proxyWidth(width) {
  return Math.min(1600, Math.max(64, Math.round(width) || 640));
}

export function houseCardPhotoSrc(place, width = 640) {
  if (!place) return null;
  const id = rowId(place);
  const raw = place.photoRef || place.photo_ref;
  const ref = hasPlacePhotoRef(raw) ? String(raw) : extractRef(place.photo);
  if (ref) {
    const owner = refPlaceId(ref);
    // No card id → cannot prove ownership. Empty is honest.
    if (!id || !owner || owner !== id) return null;
    return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=" + proxyWidth(width);
  }
  if (typeof place.photo === "string" && /[?&]place=/.test(place.photo)) {
    const m = place.photo.match(/[?&]place=([^&]+)/);
    if (!m) return null;
    try {
      const pid = decodeURIComponent(m[1]);
      if (!id || pid !== id) return null;
      return "/api/photo?place=" + encodeURIComponent(id) + "&w=" + proxyWidth(width);
    } catch (e) { return null; }
  }
  // A raw Pexels / market-photo / googleusercontent URL has no placeId.
  // Passing it through is how one manatee (or one beach sunset) reused
  // across every photoless card in the chip. Branded empty instead.
  return null;
}

export function houseCardPhotoList(place, width = 640) {
  const out = [];
  const seen = new Set();
  const add = (url) => { if (url && !seen.has(url)) { seen.add(url); out.push(url); } };
  add(houseCardPhotoSrc(place, width));
  const photos = Array.isArray(place && place.photos) ? place.photos : [];
  const id = rowId(place);
  for (const ph of photos) {
    const name = typeof ph === "string" ? ph : (ph && (ph.name || ph.photo_ref || ph.photoRef));
    const ref = extractRef(name) || (hasPlacePhotoRef(name) ? String(name) : null);
    if (!ref) continue;
    const owner = refPlaceId(ref);
    if (id && owner && owner !== id) continue;
    add(houseCardPhotoSrc({ id, photoRef: ref }, width));
  }
  return out;
}
