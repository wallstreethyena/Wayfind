// lib/landingPhotoReady.js — which places can show a REAL, rights-cleared
// photo on an evergreen landing card right now.
//
// WHY (2026-11-28, owner: "make sure everything is premium and nothing is
// missing, it needs to look professionally designed every time"). An evergreen
// town (lib/evergreenCities.js) renders its cards with `nospend=1`, so a card
// can only show a photo Wayfind already holds: an owned photo on the inventory
// row, a licensed photo in wf_place_photo (Wikimedia, owner, creator,
// Openverse), or a stored copy in wf_google_photo_store. Anything else falls
// back to the monogram tile. A town flagged `photoOnly` ranks ONLY places that
// clear this check, so every card on its pages carries a real photo of that
// exact place. The page's own publication floor (8 rendered places) still
// applies to what is left, so a thin result 404s honestly instead of padding.
//
// Read-only, two PostgREST GETs per ranking (one per table), ids batched.
// Never calls Google. Fails LOUD (throws) on a configured read that errors, the
// same contract as the evergreen inventory read: an ISR regen that throws keeps
// the last good page, while a silent [] would publish an empty market.
// Unconfigured (no Supabase env, e.g. a guard rig) answers an empty set.

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;

/** True when the inventory row itself carries an owned photo (no DB read needed). */
export function rowHasOwnedPhoto(p) {
  if (!p) return false;
  if (Array.isArray(p.photos) && p.photos.length) return true;
  return typeof p.photo_url === "string" && p.photo_url.length > 0;
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/**
 * Set of place ids (from `ids`) that hold a licensed or stored photo.
 * opts.env {url,key} and opts.fetchImpl are for guards; production resolves
 * both lazily (serverCache.sbEnv, global fetch with a deadline).
 */
export async function storedPhotoIds(ids, opts = {}) {
  const clean = [...new Set((ids || []).filter((id) => typeof id === "string" && PLACE_ID_RX.test(id)))];
  if (!clean.length) return new Set();
  let env = opts.env || null;
  if (!env) {
    const { sbEnv } = await import("./serverCache.js");
    env = sbEnv();
  }
  if (!env || !env.url || !env.key) return new Set();
  const doFetch = opts.fetchImpl || (async (url, init) => {
    const { fetchDeadline, DB_DEADLINE_MS } = await import("./fetchDeadline.js");
    return fetchDeadline(url, init, DB_DEADLINE_MS);
  });
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}`, Accept: "application/json" };
  const ready = new Set();
  const read = async (path) => {
    const res = await doFetch(`${env.url}/rest/v1/${path}`, { headers, cache: "no-store" });
    if (!res || !res.ok) throw new Error(`Photo readiness read failed (${res ? res.status : "no response"})`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("Photo readiness read returned a malformed body");
    return rows;
  };
  for (const part of chunk(clean, 80)) {
    const list = part.map(encodeURIComponent).join(",");
    const [licensed, stored] = await Promise.all([
      read(`wf_place_photo?place_id=in.(${list})&status=eq.active&select=place_id,license,attribution_text,image_url`),
      read(`wf_google_photo_store?place_id=in.(${list})&state=eq.ready&storage_path=not.is.null&select=place_id`),
    ]);
    // A licensed row Wayfind cannot credit is not servable (lib/freePhoto.js
    // fails closed on missing license or attribution), so it does not count.
    for (const r of licensed) if (r && r.place_id && r.license && r.attribution_text && r.image_url) ready.add(r.place_id);
    for (const r of stored) if (r && r.place_id) ready.add(r.place_id);
  }
  return ready;
}

/**
 * Keep only the places that will render a real photo. `opts.photoReadyIds`
 * (async ids -> Set) replaces the database read in guards.
 */
export async function keepPhotoReady(rows, opts = {}) {
  const pool = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!pool.length) return [];
  const need = pool.filter((p) => !rowHasOwnedPhoto(p)).map((p) => p.id);
  const ready = typeof opts.photoReadyIds === "function"
    ? await opts.photoReadyIds(need)
    : await storedPhotoIds(need, opts);
  return pool.filter((p) => rowHasOwnedPhoto(p) || (ready && ready.has(p.id)));
}
