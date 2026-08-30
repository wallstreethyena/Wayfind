// lib/placePhotoServe.js — SERVER-ONLY. Where /api/photo decides the FINAL url.
//
// THE LIVE BUG (2026-08-26, after #956): every /api/photo?ref= 302'd to
// /wf-photo-fallback.svg. Cards carried distinct Google refs (the library
// already had them) and still painted one teal compass. #956 correctly deleted
// the category+metro Pexels pool that had painted one manatee on three Family
// cards. It then fail-closed EVERY gated miss to one branded file, which is
// the same uniqueness failure in a different costume.
//
// Law:
//   1. A place with its own photo (cached uri / inventory photo_url /
//      catalogued Google photo_ref) must resolve to THAT photo.
//   2. The branded SVG is only for a placeId that has no photo.
//   3. Never a shared stock pool (Pexels or otherwise). Distinct refs that
//      all 302 to one file is a FAIL.
//
// Spend: cache and inventory hits are free and do not touch the photos
// ledger. A Google media fetch still goes through spendAllow("photos") when
// the ledger has budget. When the ledger is exhausted, a catalogued ref may
// fill our 30-day cache ONCE so the owned library still renders — that is
// display, not discovery. WAYFIND_GATE=shut still means zero Google calls.
//
// This module is importable from a bare-Node guard. Defaults do I/O; tests
// inject cache / inventory / Google.

import { hasPlacePhotoRef, photoRefOwnedByPlace } from "./placePhoto.js";
import { CURATED_PHOTO_REFS } from "./curatedPhotoRefs.js";

export const PHOTO_REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const FALLBACK_PATH = "/wf-photo-fallback.svg";
export const PHOTO_CACHE_PREFIX = "photo|";

const STOCK_RX = /(?:^|[\/.])(?:www\.)?(?:images\.)?pexels\.com\b|\/api\/market-photo(?:\?|$)|\/api\/stock-photo(?:\?|$)|\/wf-photo-fallback\.svg(?:\?|$)/i;
const OWNED_HOST_RX = /(?:^|\.)googleusercontent\.com$/i;
const THIRTY_DAYS_MS = 60 * 60 * 24 * 30 * 1000;

export function photoCacheKey(ref, w) {
  return PHOTO_CACHE_PREFIX + String(ref || "") + "|" + String(w || 640);
}

export function placeIdFromRef(ref) {
  if (!PHOTO_REF_RX.test(String(ref || ""))) return "";
  return String(ref).split("/")[1] || "";
}

export function isOwnedPhotoUrl(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (STOCK_RX.test(s)) return false;
  if (s.startsWith("/api/photo")) return false;
  if (s.startsWith("/") && !s.startsWith("//")) return s !== FALLBACK_PATH && !s.startsWith(FALLBACK_PATH + "?");
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (STOCK_RX.test(u.href) || STOCK_RX.test(u.hostname)) return false;
  // A keyed places.googleapis.com /media URL is the original referrer-drop
  // leak. Never treat it as a place-owned FINAL url.
  if (/(?:^|\.)googleapis\.com$/i.test(u.hostname)) return false;
  if (OWNED_HOST_RX.test(u.hostname)) return true;
  // Inventory-stored place-owned https is allowed only when it is not stock.
  return true;
}

export function emptyPhotoResult() {
  return {
    type: "empty",
    location: FALLBACK_PATH,
    cacheControl: "private, no-store",
    reason: "no-photo",
  };
}

export function redirectPhotoResult(location, reason, cacheControl) {
  return {
    type: "redirect",
    location,
    cacheControl: cacheControl || "public, max-age=" + (60 * 60 * 24 * 30) + ", s-maxage=" + (60 * 60 * 24 * 30) + ", immutable",
    reason,
  };
}

export function finalPhotoUrl(result, reqUrl) {
  const base = reqUrl || "https://www.gowayfind.com/api/photo";
  if (result && result.type === "redirect" && result.location) return new URL(result.location, base).href;
  if (result && (result.type === "bytes" || result.type === "miss")) return String(base);
  return new URL(FALLBACK_PATH, base).href;
}

function cachedUri(hit) {
  if (!hit) return null;
  const v = hit.v != null ? hit.v : hit;
  const uri = typeof v === "string" ? v : (v && (v.uri || v.photo_url || v.url));
  return isOwnedPhotoUrl(uri) ? String(uri) : null;
}

function ownedFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const signals = row.signals && typeof row.signals === "object" ? row.signals : {};
  const candidates = [row.photo_url, row.photoUrl, signals.photo_url, signals.photoUrl, signals.photo];
  for (const c of candidates) {
    if (isOwnedPhotoUrl(c)) return String(c);
  }
  return null;
}

async function defaultCacheGet(key) {
  const { cget } = await import("./serverCache.js");
  return cget(key, { staleMs: THIRTY_DAYS_MS });
}

async function defaultCacheSet(key, value) {
  const { cset, DAY } = await import("./serverCache.js");
  return cset(key, value, 30 * DAY);
}

function invCfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

async function defaultInventoryGet(placeId) {
  const s = invCfg();
  if (!s || !placeId) return null;
  const headers = { apikey: s.key, Authorization: "Bearer " + s.key };
  const trySelect = async (select) => {
    const r = await fetch(
      s.url + "/rest/v1/wf_inventory?place_id=eq." + encodeURIComponent(placeId) + "&select=" + select + "&limit=1",
      { headers, next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  };
  try {
    return (await trySelect("photo_url,photo_ref,signals")) || (await trySelect("photo_ref,signals"));
  } catch {
    return null;
  }
}

async function defaultFetchOwnedUri(ref, w, key) {
  if (!key || !PHOTO_REF_RX.test(ref)) return null;
  const tryName = async (name) => {
    const skip = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&skipHttpRedirect=true&key=" + key;
    try {
      const r = await fetch(skip, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (isOwnedPhotoUrl(j && j.photoUri)) return { uri: String(j.photoUri), status: r.status };
      }
      if (r.ok || r.status === 400 || r.status === 403 || r.status === 404) {
        const follow = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&key=" + key;
        const f = await fetch(follow, { redirect: "follow" });
        if (f.ok && isOwnedPhotoUrl(f.url)) return { uri: String(f.url), status: f.status };
        return { uri: null, status: f.status || r.status };
      }
      return { uri: null, status: r.status };
    } catch {
      return { uri: null, status: 0 };
    }
  };
  let got = await tryName(ref);
  if (got.uri) return got.uri;
  // Google photo resource names expire. The placeId is inside the ref, so a
  // stale inventory photo_ref is recoverable: one Place Details photos
  // lookup, then fetch the current name. Same self-heal the pre-#956 route
  // already had — without it, every expired library ref 404s and the card
  // looks empty even though the place has a photo.
  if (got.status === 400 || got.status === 403 || got.status === 404) {
    const placeId = placeIdFromRef(ref);
    if (!placeId) return null;
    try {
      const d = await fetch(
        "https://places.googleapis.com/v1/places/" + placeId + "?fields=photos&key=" + key,
        { next: { revalidate: 86400 } }
      );
      if (!d.ok) return null;
      const j = await d.json();
      const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
      if (fresh && PHOTO_REF_RX.test(fresh) && fresh !== ref) {
        const healed = await tryName(fresh);
        if (healed.uri) return healed.uri;
      }
    } catch { /* leave as miss */ }
  }
  return null;
}

// Resolve the FINAL destination for one /api/photo request.
// `hasPhoto` is true when the library already catalogued a photo for this
// place (valid Google ref, or an inventory-owned image). Empty/branded is
// allowed only when hasPhoto is false.
export async function resolvePlacePhoto(input, deps) {
  const d = deps || {};
  const ref = String((input && input.ref) || "");
  const place = String((input && input.place) || "");
  let w = parseInt((input && input.w) || 640, 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600;
  const gateShut = !!(input && input.gateShut);
  const spendAllowed = !!(input && input.spendAllowed);
  const serverKey = (input && input.serverKey) || "";
  const cacheGet = d.cacheGet || defaultCacheGet;
  const cacheSet = d.cacheSet || defaultCacheSet;
  const inventoryGet = d.inventoryGet || defaultInventoryGet;
  const fetchOwnedUri = d.fetchOwnedUri || defaultFetchOwnedUri;

  const cacheLookup = async (photoRef) => {
    if (!PHOTO_REF_RX.test(photoRef)) return null;
    try { return cachedUri(await cacheGet(photoCacheKey(photoRef, w))); } catch { return null; }
  };
  const remember = async (photoRef, uri) => {
    if (!PHOTO_REF_RX.test(photoRef) || !isOwnedPhotoUrl(uri)) return;
    try { await cacheSet(photoCacheKey(photoRef, w), { uri: String(uri) }); } catch { /* cache write is best-effort */ }
  };

  let useRef = PHOTO_REF_RX.test(ref) ? ref : "";
  const placeId = useRef ? placeIdFromRef(useRef) : (/^[A-Za-z0-9_-]{10,}$/.test(place) ? place : "");

  if (useRef) {
    const hit = await cacheLookup(useRef);
    if (hit) return redirectPhotoResult(hit, "cache");
  }

  if (placeId) {
    let row = null;
    try { row = await inventoryGet(placeId); } catch { row = null; }
    const owned = ownedFromRow(row);
    if (owned) {
      if (useRef) await remember(useRef, owned);
      return redirectPhotoResult(owned, "inventory");
    }
    if (!useRef && row && hasPlacePhotoRef(row.photo_ref)) useRef = String(row.photo_ref);
    // v8.95 — CURATED PLACES THAT ARE NOT INVENTORY. A chef's seven picks are
    // testimony, not coverage: they sit in five metros the owned library does
    // not cover, so the lookup above returns nothing and all seven cards
    // rendered with no picture at all (owner, 2026-08-30).
    //
    // This sits in resolve(), NOT inside defaultInventoryGet, and the
    // difference is not cosmetic: inventoryGet is an injectable dep, so a
    // fallback hidden in the default implementation silently disappears for
    // every caller that stubs it — which is exactly how the first version of
    // this fix passed its guard and still resolved to nothing under test.
    //
    // Inventory always wins; this only fills a hole, and lib/placePhoto
    // photoRefOwnedByPlace still decides what the ref is allowed to be.
    if (!useRef) {
      const curated = CURATED_PHOTO_REFS[placeId];
      if (photoRefOwnedByPlace(curated, placeId)) useRef = String(curated);
    }
  }

  if (useRef) {
    const hit = await cacheLookup(useRef);
    if (hit) return redirectPhotoResult(hit, "cache");
  }

  // Catalogued ref: fetch the place's own photo. spendAllowed is the ledger
  // path. Exhausted ledger still fills the 30-day cache once so Family cards
  // cannot collapse to one SVG. shut = no Google call.
  if (useRef && !gateShut) {
    const uri = await fetchOwnedUri(useRef, w, serverKey);
    if (isOwnedPhotoUrl(uri)) {
      await remember(useRef, uri);
      return redirectPhotoResult(uri, spendAllowed ? "google" : "library-fill");
    }
    // Owned ref, fetch failed. Do NOT 302 distinct refs to one branded file.
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "owned-miss", ref: useRef };
  }

  return emptyPhotoResult();
}

export function familyRailFinals(results, reqUrls) {
  return (results || []).map((r, i) => finalPhotoUrl(r, reqUrls && reqUrls[i]));
}

export function sameFinalUrl(urls) {
  const list = (urls || []).map((u) => {
    try { return new URL(u, "https://www.gowayfind.com").href; } catch { return String(u || ""); }
  }).filter(Boolean);
  if (list.length < 2) return false;
  return list.every((u) => u === list[0]);
}
