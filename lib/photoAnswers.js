// lib/photoAnswers.js — ONE per-page-session answer for "the photo of place X".
//
// Why this exists (2026-10-13 reconcile). A card, the larger viewer and the
// detail sheet each used to ask /api/photo on their own. The card only deduped
// requests that were IN FLIGHT, so a remount (scroll away and back, rail
// re-render, opening the detail sheet) asked again, and every uncached ask can
// BUY a Google Place Photo. This module is the single front door:
//
//   success          kept for the page session. Card, viewer and detail all reuse
//                    the SAME { src, source, credit } object, so the photo and its
//                    credit can never be paired with a different place's answer.
//   definitive miss  (200 with no photo / 404 / 4xx) kept; never retried.
//   transient error  (network throw, 5xx, 429) retried at most MAX_ATTEMPTS-1
//                    more times, never before RETRY_DELAY_MS has passed, never in
//                    a loop (a retry happens only when a caller asks, after the
//                    delay). After that the miss is final for the session.
//
// Memory only: never localStorage / cookies. Google photo names and URLs are
// not stored anywhere durable, matching docs/GOOGLE_POLICY.md.

import { isGooglePlaceId } from "./placePhoto.js";

export const MAX_ATTEMPTS = 2;          // first request + ONE delayed retry
export const RETRY_DELAY_MS = 20000;
// Google place ids only (the repo's one definition). Slugs, event ids and guide ids never reach the network.
const PLACE_ID_RX = { test: (id) => isGooglePlaceId(id) };

const state = new Map();                // key -> { photo } | { miss: true, attempts, last, final }
const inflight = new Map();             // key -> Promise

export function resetPhotoAnswers() { state.clear(); inflight.clear(); }
export function photoAnswerStats() {
  let ok = 0, final = 0, pending = 0;
  for (const v of state.values()) { if (v.photo) ok++; else if (v.final) final++; else pending++; }
  return { ok, final, retryable: pending, inflight: inflight.size };
}

/** Google Maps link for a place id — the fallback when the API omitted googleMapsUri. */
export function mapsLinkForPlace(id) {
  return PLACE_ID_RX.test(String(id || ""))
    ? "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=" + encodeURIComponent(id)
    : null;
}

/**
 * Validate and normalise one /api/photo JSON answer for `placeId`.
 * Returns { photo } | { definitiveMiss: true }.
 * A Google photo is kept even when the API sent no author names (nothing to
 * attribute), but it is ALWAYS paired with an https Google Maps link: the one
 * the API sent, else the documented place-id URL for THIS place.
 */
export function normalizePhotoAnswer(placeId, j) {
  if (!j || typeof j.src !== "string" || j.source === "none"
      || !/^(https:\/\/|\/(?!\/))/.test(j.src)) return { definitiveMiss: true };
  if (j.source !== "google") {
    return { photo: { src: j.src, source: String(j.source || ""), credit: j.credit || null, placeId } };
  }
  const c = j.credit && typeof j.credit === "object" ? j.credit : {};
  const mapsUri = /^https:\/\//.test(c.mapsUri || "") ? c.mapsUri : mapsLinkForPlace(placeId);
  if (!mapsUri) return { definitiveMiss: true };
  const authors = Array.isArray(c.authors) ? c.authors.filter((a) => a && typeof a === "object") : [];
  return { photo: { src: j.src, source: "google", placeId, credit: { ...c, mapsUri, authors } } };
}

async function ask(url, fetchImpl) {
  let r;
  try { r = await fetchImpl(url, { cache: "no-store" }); } catch { return { transient: true }; }
  if (!r) return { transient: true };
  if (!r.ok) return r.status >= 500 || r.status === 429 || r.status === 408 ? { transient: true } : { definitiveMiss: true };
  let j;
  try { j = await r.json(); } catch { return { transient: true }; }
  // A "no photo" JSON is final only when the server says the place truly has
  // none. A budget/quota/gate refusal looks the same in the body (src:null) but
  // is temporary, so it gets the bounded retry instead of a permanent miss.
  if (!j || typeof j.src !== "string") {
    const why = (r.headers && typeof r.headers.get === "function" ? r.headers.get("x-wayfind-photo-result") : "") || "";
    return FINAL_MISS_REASONS.has(why) ? { definitiveMiss: true } : { transient: true };
  }
  return j;
}
const FINAL_MISS_REASONS = new Set(["no-photo", "owned-miss", "unconfigured", "negative-cached"]);

/**
 * The photo for `placeId`, asking the server at most once per success.
 * `surface` is "card" | "detail"; both return the same JSON shape.
 */
export function getPlacePhoto(placeId, { surface = "detail", nospend = false, fetchImpl, now = Date.now } = {}) {
  const id = String(placeId || "");
  if (!PLACE_ID_RX.test(id)) return Promise.resolve(null);
  const key = nospend ? id + "|nospend" : id;
  const known = state.get(key);
  if (known?.photo) return Promise.resolve(known.photo);
  if (known && (known.final || now() - known.last < RETRY_DELAY_MS)) return Promise.resolve(null);
  if (inflight.has(key)) return inflight.get(key);
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return Promise.resolve(null);
  const q = new URLSearchParams({ place: id, s: surface === "card" ? "card" : "detail", fmt: "json", w: "1200" });
  if (nospend) q.set("nospend", "1");
  const p = (async () => {
    try {
      const out = await ask("/api/photo?" + q, f);
      if (out.transient) {
        const attempts = (known?.attempts || 0) + 1;
        state.set(key, { miss: true, attempts, last: now(), final: attempts >= MAX_ATTEMPTS });
        return null;
      }
      const n = out.definitiveMiss ? out : normalizePhotoAnswer(id, out);
      if (n.photo) { state.set(key, { photo: n.photo }); return n.photo; }
      state.set(key, { miss: true, attempts: (known?.attempts || 0) + 1, last: now(), final: true });
      return null;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
