// lib/placePhotoServable.js: SERVER ONLY. Can the card's `/api/photo?place=<id>`
// URL actually answer with an image? Asked BEFORE the page emits the <img>, so a
// place with no photo paints the designed tile instead of a request that 404s.
//
// THE BUG (2026-11-03): /christmas-in-florida requested
// /api/photo?place=ChIJn2JUR3Bf7IgRDoeGio3YFuE&g=2&w=640 (Goodwood Museum and
// Gardens) and got 404. That inventory row holds only the placeholder ref
// ".../photos/wfplacediscovery" and its wf_place_photo row is "rejected", so
// there is nothing to serve. The card did fall back to its tile client side, but
// only after a wasted 404 per view.
//
// WHY THIS IS A FREE, EXACT ANSWER: a card URL carries no `s=` credited surface
// param, so the route never reaches Google for it (resolvePlacePhoto returns
// not-google-surface). The ONLY things that can serve it are the inventory's own
// non-Google photo URL and the free permanent lane (wf_place_photo). This module
// asks exactly those two, through the same code the route runs (resolvePlacePhoto
// in probe mode never calls the spend ledger; findFreePhoto is read only).
// Never pays, never guesses.
import { resolvePlacePhoto } from "./placePhotoServe.js";
import { findFreePhoto } from "./freePhoto.js";

const YES_MS = 10 * 60 * 1000;
const NO_MS = 2 * 60 * 1000; // short: a transient read failure must not hide a photo for long
const MEMO = new Map();

/** The place id when `src` is an uncredited card URL `/api/photo?place=<id>` (no ref, no s=), else "". */
export function uncreditedPlacePhotoId(src) {
  if (typeof src !== "string" || !src.startsWith("/api/photo?")) return "";
  let q;
  try { q = new URLSearchParams(src.slice("/api/photo?".length)); } catch { return ""; }
  if (q.get("ref") || q.get("s")) return "";
  const id = q.get("place") || "";
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : "";
}

/**
 * true when the route would redirect to an image, false when it would 404.
 * deps (test seam): resolve, findFree, now, noMemo.
 */
export async function placePhotoServable(placeId, deps = {}) {
  const now = Number.isFinite(deps.now) ? deps.now : Date.now();
  const hit = deps.noMemo ? null : MEMO.get(placeId);
  if (hit && now - hit.at < (hit.ok ? YES_MS : NO_MS)) return hit.ok;
  // Not configured (local scripts, previews without the service key): the inventory
  // cannot be asked, so there is no proof of a 404. Keep the image.
  if (!deps.resolve && !(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL))) return true;
  const resolve = deps.resolve || resolvePlacePhoto;
  const findFree = deps.findFree || findFreePhoto;
  let ok = false;
  try {
    const r = await resolve({ place: placeId, w: 640, probe: true, googleSurface: false });
    ok = !!(r && r.type === "redirect" && r.location);
    if (!ok) ok = !!(await findFree({ placeId, width: 640 }));
  } catch {
    return true; // could not ask: keep the image, the client fallback still covers a failed load
  }
  if (!deps.noMemo) MEMO.set(placeId, { at: now, ok });
  return ok;
}

/**
 * Remove photos whose src is a known-404 `/api/photo?place=` URL. Items are any
 * objects with `photos: [{src}]`; returns new items, never mutates.
 */
export async function withoutUnservablePlacePhotos(photos, deps = {}) {
  const list = Array.isArray(photos) ? photos : [];
  const keep = await Promise.all(list.map(async (p) => {
    const id = uncreditedPlacePhotoId(p && p.src);
    return id ? await placePhotoServable(id, deps) : true;
  }));
  return list.filter((_, i) => keep[i]);
}
