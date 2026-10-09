// lib/photoCredits.js — keep the photographer credit Google already sends.
//
// Google Places policy (developers.google.com/maps/documentation/places/web-service/policies):
// "You must always credit the author when displaying photos", using the
// author's name and profile link, and readers must be able to open the photo
// on Google Maps (googleMapsUri). Every Places (New) photo object carries
// `authorAttributions` + `googleMapsUri`; before 2026-09-23 Wayfind dropped
// them (normalizeDetails kept only photos[0].name; the photo cache keeps only
// the image URL), and Google photo names are not stable across responses, so
// a dropped credit can never be looked up again for free.
//
// THIS FILE NEVER CALLS GOOGLE. It only copies credits out of a response the
// caller ALREADY received and paid for (app/api/places/search, lib/placeDetails)
// into public.wf_photo_credit (migration 20260924120000_wf_photo_credit.sql).
//
// FAIL-SOFT, ALWAYS: bounded to 800 ms, never throws, never changes the
// caller's response. A missing table (migration not yet applied), missing
// credentials or a Supabase error all resolve to `false`.
//
// BOUNDED: at most MAX_PLACES places x MAX_PHOTOS_PER_PLACE photos per call,
// one PostgREST request.

export const MAX_PLACES = 20;
export const MAX_PHOTOS_PER_PLACE = 3;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 800;
const NAME_RX = /^places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+$/;

function httpsUrl(v, max) {
  if (typeof v !== "string" || !v || v.length > max) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// Pure: Places (New) place objects -> wf_photo_credit rows. Exported for the
// guard (scripts/test-photo-credits.mjs). `ttlMs` is the lifetime of the
// response the credits came from, capped at 30 days.
export function extractPhotoCredits(places, ttlMs, now = Date.now()) {
  const ttl = Math.min(Math.max(Number(ttlMs) || 0, 0), THIRTY_DAYS_MS);
  if (!ttl || !Array.isArray(places)) return [];
  const capturedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttl).toISOString();
  const rows = [];
  const seen = new Set();
  for (const place of places.slice(0, MAX_PLACES)) {
    const photos = Array.isArray(place?.photos) ? place.photos.slice(0, MAX_PHOTOS_PER_PLACE) : [];
    for (const ph of photos) {
      const name = typeof ph?.name === "string" ? ph.name : "";
      const m = NAME_RX.exec(name);
      if (!m || seen.has(name)) continue;
      if (place?.id && place.id !== m[1]) continue; // never credit a photo to another place
      const a = Array.isArray(ph.authorAttributions) ? ph.authorAttributions[0] : null;
      const author = a && typeof a.displayName === "string" ? a.displayName.trim().slice(0, 200) : "";
      if (!author) continue; // no credit to keep; nothing stored
      seen.add(name);
      rows.push({
        photo_name: name,
        place_id: m[1],
        author_name: author,
        author_uri: httpsUrl(a.uri, 500),
        author_photo_uri: httpsUrl(a.photoUri, 500),
        maps_uri: httpsUrl(ph.googleMapsUri, 1000),
        width_px: Number.isInteger(ph.widthPx) && ph.widthPx > 0 ? ph.widthPx : null,
        height_px: Number.isInteger(ph.heightPx) && ph.heightPx > 0 ? ph.heightPx : null,
        expires_at: expiresAt,
        captured_at: capturedAt,
      });
    }
  }
  return rows;
}

// COMPLIANCE (2026-10-08). Google Maps Platform Terms 3.2.3 forbid storing
// Google Maps Content (author names/links included); only the place ID may be
// stored. These writers are therefore NO-OPS that write nothing anywhere.
// Exports and signatures are kept so existing imports do not break.
export function keepPhotoCredits(_places, _ttlMs) {
  return undefined;
}

export async function recordPhotoCredits(_places, _ttlMs, _deps = {}) {
  return false;
}

// Pure: keep, per place, up to PER_PLACE credits whose exact photo name has a
// live cache row. Used by app/api/photo-credits; tested by scripts/test-photo-credits.mjs.
export function pickCachedCredits(credits, liveNames, perPlace = 3, now = Date.now()) {
  const per = new Map();
  const out = [];
  for (const c of Array.isArray(credits) ? credits : []) {
    if (!c || typeof c.photo_name !== "string" || !liveNames.has(c.photo_name)) continue;
    if (c.photo_name.split("/")[1] !== c.place_id) continue;
    // Readers re-check this at render time, so a credit is never shown past
    // its own expiry even while an answer sits in a CDN or data cache.
    if (!(Date.parse(c.expires_at) > now)) continue;
    const n = per.get(c.place_id) || 0;
    if (n >= perPlace) continue;
    per.set(c.place_id, n + 1);
    out.push({ photo_name: c.photo_name, place_id: c.place_id, author_name: c.author_name, author_uri: c.author_uri || null, maps_uri: c.maps_uri || null, expires_at: c.expires_at });
  }
  return out;
}
