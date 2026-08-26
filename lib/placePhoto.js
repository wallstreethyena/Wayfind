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
