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
// ledger. A Google media fetch happens ONLY after spendAllow("photos") grants
// the request. A denied or exhausted ledger serves cache/inventory if present,
// then refuses the catalogued ref; it never turns a budget denial into a paid
// "library fill". WAYFIND_GATE=shut likewise means zero Google calls.
//
// This module is importable from a bare-Node guard. Defaults do I/O; tests
// inject cache / inventory / Google.

import { photoRefOwnedByPlace } from "./placePhoto.js";
import { CURATED_PHOTO_REFS } from "./curatedPhotoRefs.js";
import { photoCacheCandidateWidths } from "./photoCacheRecovery.js";

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

export function emptyPhotoResult(reason = "no-photo") {
  return {
    type: "empty",
    location: FALLBACK_PATH,
    cacheControl: "private, no-store",
    reason,
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
  try {
    // Production has no wf_inventory.photo_url column. Owned URLs, when
    // present, live in signals; asking PostgREST for the missing column first
    // emitted one database error and one extra request for every cold photo.
    const r = await fetch(
      s.url + "/rest/v1/wf_inventory?place_id=eq." + encodeURIComponent(placeId) + "&select=photo_ref,signals&limit=1",
      { headers, next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

// ONE GRANT, ONE OUTBOUND REQUEST (2026-09-09). Before this, a single
// `photos` ledger grant authorised this whole function, which can make up to
// FOUR billable Place Photo media requests (skip-redirect, follow, healed
// skip, healed follow) plus one Place Details lookup. The ledger metered the
// decision, not the requests, so "2,000 photo events" on our side could be
// ~8,000 on Google's invoice. `authorize(sku)` is now consulted before EVERY
// additional outbound call: the caller's first grant covers the first media
// request; each further media request takes its own `photos` grant; the
// Details photos lookup takes a `details_ids_only` grant (Essentials, free
// tier, metered like every other cron path to Google). A refusal ends the
// attempt as a miss — never a retry without a grant.
async function defaultFetchOwnedUri(ref, w, key, authorize) {
  if (!key || !PHOTO_REF_RX.test(ref)) return null;
  const may = typeof authorize === "function" ? authorize : async () => false;
  // The first media request is the one the resolver already paid for.
  let firstCovered = true;
  const grant = async (sku) => {
    if (sku === "photos" && firstCovered) { firstCovered = false; return true; }
    try { return !!(await may(sku)); } catch { return false; }
  };
  const tryName = async (name) => {
    const skip = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&skipHttpRedirect=true&key=" + key;
    try {
      if (!(await grant("photos"))) return { uri: null, status: 0, denied: true };
      const r = await fetch(skip, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (isOwnedPhotoUrl(j && j.photoUri)) return { uri: String(j.photoUri), status: r.status };
      }
      if (r.ok || r.status === 400 || r.status === 403 || r.status === 404) {
        if (!(await grant("photos"))) return { uri: null, status: r.status, denied: true };
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
  if (got.denied) return null;
  // Google photo resource names expire. The placeId is inside the ref, so a
  // stale inventory photo_ref is recoverable: one Place Details photos
  // lookup, then fetch the current name. Same self-heal the pre-#956 route
  // already had — without it, every expired library ref 404s and the card
  // looks empty even though the place has a photo.
  if (got.status === 400 || got.status === 403 || got.status === 404) {
    const placeId = placeIdFromRef(ref);
    if (!placeId) return null;
    try {
      if (!(await grant("details_ids_only"))) return null;
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
  const serverKey = (input && input.serverKey) || "";
  // A probe (scripts/photo-monitor.mjs, via app/api/photo/route.js's
  // x-wayfind-photo-probe header) measures what a reader would see WITHOUT
  // ever taking a photos-ledger grant or writing the cache. Unauthenticated
  // on purpose: the header can only ever DENY spend, never grant it.
  const probe = !!(input && input.probe);
  const cacheGet = d.cacheGet || defaultCacheGet;
  const cacheSet = d.cacheSet || defaultCacheSet;
  const inventoryGet = d.inventoryGet || defaultInventoryGet;
  const fetchOwnedUri = d.fetchOwnedUri || defaultFetchOwnedUri;

  const cacheLookup = async (photoRef) => {
    if (!PHOTO_REF_RX.test(photoRef)) return null;
    // Exact requested width always wins. A small thumbnail can reuse the
    // already-cached 640px card image; an 800 card request may reuse a fresh
    // 640 of THIS SAME photo ref. 1200 and other sizes stay exact-only.
    // Read-only: does not write an 800 row or extend the source lifetime.
    for (const width of photoCacheCandidateWidths(w)) {
      try {
        const uri = cachedUri(await cacheGet(photoCacheKey(photoRef, width)));
        if (uri) return uri;
      } catch { /* another cached size may still be available */ }
    }
    return null;
  };
  const remember = async (photoRef, uri) => {
    // A probe must be read-only on the cache as well as on the ledger — it
    // proves what a reader would see without changing what the NEXT reader
    // sees.
    if (probe) return;
    if (!PHOTO_REF_RX.test(photoRef) || !isOwnedPhotoUrl(uri)) return;
    try { await cacheSet(photoCacheKey(photoRef, w), { uri: String(uri) }); } catch { /* cache write is best-effort */ }
  };

  let useRef = PHOTO_REF_RX.test(ref) ? ref : "";
  let checkedRef = "";
  const placeId = useRef ? placeIdFromRef(useRef) : (/^[A-Za-z0-9_-]{10,}$/.test(place) ? place : "");

  if (useRef) {
    const hit = await cacheLookup(useRef);
    if (hit) return redirectPhotoResult(hit, "cache");
    checkedRef = useRef;
  }

  if (placeId) {
    let row = null;
    try { row = await inventoryGet(placeId); } catch { row = null; }
    const owned = ownedFromRow(row);
    if (owned) {
      if (useRef) await remember(useRef, owned);
      return redirectPhotoResult(owned, "inventory");
    }
    // A card can carry an older photo resource name while inventory already
    // holds the current ref for the same place. Prefer the current ref after
    // checking the card's exact cache key: it may already be warm on another
    // surface, and a stale ref should not force a paid self-heal or a compass.
    const inventoryRef = row && photoRefOwnedByPlace(row.photo_ref, placeId)
      ? String(row.photo_ref)
      : "";
    if (inventoryRef && inventoryRef !== useRef) {
      const currentHit = await cacheLookup(inventoryRef);
      if (currentHit) return redirectPhotoResult(currentHit, "inventory-ref-cache");
      useRef = inventoryRef;
      checkedRef = inventoryRef;
    }
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

  if (useRef && useRef !== checkedRef) {
    const hit = await cacheLookup(useRef);
    if (hit) return redirectPhotoResult(hit, "cache");
  }

  // Catalogued ref: fetch the place's own photo only after an atomic ledger
  // grant. A denied budget is a cache/inventory-only response: never make a
  // paid Google call merely to fill the library.
  if (useRef && !gateShut) {
    if (!serverKey) {
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "unconfigured", ref: useRef };
    }
    if (probe) {
      // A probe must never take a grant — not even a same-tick "denied" ask.
      // The route's own authorizeSpend closure already refuses to grant a
      // probe, but this resolver does not rely on that: it never calls
      // authorizeSpend at all when probing, so a probe run can be proven, by
      // call count, to have asked for zero grants.
      //
      // REASON IS "probe-no-spend", NOT "spend-denied". A probe never ASKED
      // the ledger, so "spend-denied" would be a false claim in any month
      // with headroom — a real reader hitting this exact code path would get
      // a Google fetch, not a denial. "probe-no-spend" says only what is
      // actually true: this ref was uncached and this was a probe, nothing
      // about whether a real request would spend. Shaped as type:"miss" to
      // match #1182's convention (a card's own monogram, not a shared SVG).
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "probe-no-spend", ref: useRef };
    }
    // Authorization is deliberately lazy. Cache and inventory are free reads;
    // only a real Google media miss may consume a finite ledger grant.
    const spendAllowed = typeof input.authorizeSpend === "function"
      ? await input.authorizeSpend("photos")
      : !!input.spendAllowed;
    // A catalogued ref is not the same thing as a genuinely photoless place.
    // When the ledger denies a cold fetch, return an honest miss so the card's
    // existing <img> error path renders its title-specific monogram. Redirecting
    // every denied ref to one branded SVG makes unrelated cards look duplicated.
    if (!spendAllowed) {
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "spend-denied", ref: useRef };
    }
    // Every FURTHER outbound request inside fetchOwnedUri asks the same
    // authorizer, per SKU, so one grant can never fan out into several
    // billable calls (see defaultFetchOwnedUri). A boolean `spendAllowed`
    // caller gets no further grants: one request, then a miss.
    const authorizeMore = typeof input.authorizeSpend === "function" ? input.authorizeSpend : async () => false;
    const uri = await fetchOwnedUri(useRef, w, serverKey, authorizeMore);
    if (isOwnedPhotoUrl(uri)) {
      await remember(useRef, uri);
      return redirectPhotoResult(uri, "google");
    }
    // Owned ref, fetch failed. Do NOT 302 distinct refs to one branded file.
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "owned-miss", ref: useRef };
  }

  if (useRef && gateShut) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "gate-shut", ref: useRef };
  }
  return emptyPhotoResult("no-photo");
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
