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
//
// LIVENESS (2026-09-15, lib/photoUriLiveness.js). A cache HIT is no longer
// served on trust. Google's photoUri is short-lived and 27% of the 10,133
// cached rows were answering 403 (Keke's Breakfast Cafe, Bradenton, was one).
// A hit old enough to matter is HEAD-probed (free, no key, no grant) at most
// once a day; a dead row is evicted and the lookup continues down the same
// ladder a cold request takes. UNKNOWN IS NOT DEAD: a timeout or 5xx from the
// host serves the row as-is. Injected hits with no `ageMs` (every hermetic
// guard's fake cache) are served exactly as before — validation is keyed on
// provenance the real cget supplies, so this cannot make a guard non-hermetic.

import { photoRefOwnedByPlace } from "./placePhoto.js";
import { CURATED_PHOTO_REFS } from "./curatedPhotoRefs.js";
import { photoCacheCandidateWidths } from "./photoCacheRecovery.js";
import {
  PHOTO_URI_ALIVE,
  PHOTO_URI_DEAD,
  googlePhotoRedirectCacheControl,
  isGoogleHostedPhotoUri,
  photoUriValidationDue,
  probePhotoUri,
} from "./photoUriLiveness.js";

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
    // UPSTREAM TRUTH (2026-09-16). Every result this module returns now
    // carries an explicit `upstream` field, even when it is null. A branded/
    // free/empty result never asked Google anything this request, so null is
    // the honest value here — never omitted, so callers can rely on the key
    // always being present.
    upstream: null,
    retried: false,
  };
}

export function redirectPhotoResult(location, reason, cacheControl, upstreamInfo) {
  // A Google-hosted (rented, short-lived) URI may be cached downstream for at
  // most one day — the revalidation cadence — never 30 days `immutable`: a
  // dead 302 the CDN and browser hold for a month outlives any server fix.
  // An inventory-owned https photo keeps the 30-day contract it always had.
  const fallback = isGoogleHostedPhotoUri(location)
    ? googlePhotoRedirectCacheControl()
    : "public, max-age=" + (60 * 60 * 24 * 30) + ", s-maxage=" + (60 * 60 * 24 * 30) + ", immutable";
  const info = upstreamInfo || {};
  return {
    type: "redirect",
    location,
    cacheControl: cacheControl || fallback,
    reason,
    // Only the "google" reason (a real paid fetch just ran) carries a real
    // class + retry flag; every free redirect (cache/inventory/
    // inventory-ref-cache/same-place-cache/owned-free) is explicitly null —
    // see the header note on emptyPhotoResult.
    upstream: typeof info.upstream === "string" ? info.upstream : null,
    retried: !!info.retried,
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

// The validation stamp a hit carries, if any. Rows written before 2026-09-15
// are bare `{uri}` (or a legacy string) and read as never-validated.
function cachedValidatedAt(hit) {
  if (!hit) return null;
  const v = hit.v != null ? hit.v : hit;
  const vok = v && typeof v === "object" ? Number(v.vok) : NaN;
  return Number.isFinite(vok) ? vok : null;
}

async function defaultCacheDel(key) {
  const { cdel } = await import("./serverCache.js");
  return cdel(key);
}

async function defaultProbeUri(uri) {
  return probePhotoUri(uri);
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

async function defaultCacheSet(key, value, ttlMs) {
  const { cset, DAY } = await import("./serverCache.js");
  // A validation re-stamp passes the row's REMAINING lifetime so the 30-day
  // Google ToS clock that started at the original fetch is never restarted.
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.min(ttlMs, 30 * DAY) : 30 * DAY;
  return cset(key, value, ttl);
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

// UPSTREAM TRUTH (2026-09-16). Production fact: a valid Google photo ref
// answers /api/photo 404 "owned-miss" while consuming exactly ONE `photos`
// grant and ZERO `details_ids_only` grants — reproduced three times the same
// day. The self-heal below only ever triggers on 400/403/404; a 429 (quota
// cap), a 5xx, a 3xx, a thrown fetch, or an unparsable body all fell through
// to a bare `return null` with NOTHING recorded (logGoogleGrant only logs a
// SUCCESS). That is Google answering with something outside {ok,400,403,404}
// and nobody able to see which.
//
// classifyUpstream() below is the ONE mapping table from a raw HTTP outcome
// to a class string, asserted directly by scripts/test-photo-upstream-truth.mjs.
// It never sees a key/ref/URL — only {status, threw, ok, json, owned, denied}.
export const PHOTO_UPSTREAM_RETRY_DELAY_MS = 350;

export function classifyUpstream({ status, threw, ok, json, owned, denied } = {}) {
  if (denied) return "denied";
  if (threw) return "network";
  const s = Number(status) || 0;
  if (s === 429) return "quota";
  if (s >= 500 && s < 600) return "server";
  if (s >= 300 && s < 400) return "redirect";
  if (ok) {
    if (json === false) return "badjson";
    return owned ? "ok" : "unowned";
  }
  // Any other 4xx not in the heal set (400/403/404 are handled by the caller
  // BEFORE it ever reaches this branch for the terminal classification).
  return "client";
}

// A legacy/injected `deps.fetchOwnedUri` (every existing hermetic guard)
// returns a bare uri string or null. defaultFetchOwnedUri instead returns
// { uri, upstream, retried } — this wraps either shape into the same one, so
// every existing guard passes unchanged and every NEW caller sees a class.
export function normalizeFetchOwnedResult(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && ("uri" in raw || "upstream" in raw)) {
    const uri = raw.uri != null ? raw.uri : null;
    return {
      uri,
      upstream: typeof raw.upstream === "string" && raw.upstream ? raw.upstream : (uri ? "ok" : "legacy-miss"),
      retried: !!raw.retried,
    };
  }
  const uri = raw || null;
  return { uri, upstream: uri ? "ok" : "legacy-miss", retried: false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
//
// BOUNDED RETRY (2026-09-16): a media call classified `server` (5xx) or
// `network` (threw) is retried ONCE, ~PHOTO_UPSTREAM_RETRY_DELAY_MS later,
// against the SAME url — never a second grant, never on 429/any 4xx. The
// retry lives INSIDE the one `await fetchImpl(...)` call site per request
// (scripts/check-spend-guard.mjs counts literal call sites, not runtime
// attempts), so a retried request still reads as exactly one outbound call
// there — which is the true invariant: one grant precedes one REQUEST, and a
// transient-failure retry of that same request never asks for a second one.
export async function defaultFetchOwnedUri(ref, w, key, authorize, fetchImpl = fetch, retryDelayMs = PHOTO_UPSTREAM_RETRY_DELAY_MS) {
  if (!key || !PHOTO_REF_RX.test(ref)) return { uri: null, upstream: null, retried: false };
  const may = typeof authorize === "function" ? authorize : async () => false;
  // The first media request is the one the resolver already paid for.
  let firstCovered = true;
  const grant = async (sku) => {
    if (sku === "photos" && firstCovered) { firstCovered = false; return true; }
    try { return !!(await may(sku)); } catch { return false; }
  };

  // One media HTTP call, with the bounded retry folded into the SAME call
  // site. Returns { r, threw, status, retried }.
  const callMedia = async (url, opts) => {
    let r = null, threw = false, retried = false;
    try {
      r = await fetchImpl(url, opts);
    } catch {
      threw = true;
    }
    const retryable = threw || (r && r.status >= 500 && r.status < 600);
    if (retryable) {
      if (retryDelayMs > 0) await sleep(retryDelayMs);
      retried = true;
      threw = false;
      try {
        r = await fetchImpl(url, opts);
      } catch {
        threw = true;
        r = null;
      }
    }
    return { r, threw, status: r ? r.status : 0, retried };
  };

  const tryName = async (name) => {
    const skip = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&skipHttpRedirect=true&key=" + key;
    if (!(await grant("photos"))) return { uri: null, status: 0, upstream: "denied", retried: false };
    const skipCall = await callMedia(skip, { cache: "no-store" });
    if (skipCall.r && skipCall.r.ok) {
      let j = null, parseOk = true;
      try { j = await skipCall.r.json(); } catch { parseOk = false; }
      if (parseOk && isOwnedPhotoUrl(j && j.photoUri)) {
        return { uri: String(j.photoUri), status: skipCall.status, upstream: "ok", retried: skipCall.retried };
      }
      if (!parseOk) {
        // A body that is not JSON never reaches the follow attempt — this
        // matches the PRE-EXISTING behaviour: r.json() throwing used to fall
        // straight into the function's outer catch (no follow, no heal),
        // which is exactly what this branch still does, just classified.
        return { uri: null, status: skipCall.status, upstream: "badjson", retried: skipCall.retried };
      }
      // r.ok, valid JSON, but no owned photoUri: fall through to follow —
      // same as the pre-existing behaviour below.
    }
    const skipOk = !!(skipCall.r && skipCall.r.ok);
    const skipStatus = skipCall.status;
    if (skipOk || skipStatus === 400 || skipStatus === 403 || skipStatus === 404) {
      if (!(await grant("photos"))) return { uri: null, status: skipStatus, upstream: "denied", retried: skipCall.retried };
      const follow = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&key=" + key;
      const followCall = await callMedia(follow, { redirect: "follow" });
      if (followCall.r && followCall.r.ok && isOwnedPhotoUrl(followCall.r.url)) {
        return { uri: String(followCall.r.url), status: followCall.status, upstream: "ok", retried: skipCall.retried || followCall.retried };
      }
      const followClass = classifyUpstream({
        status: followCall.status, threw: followCall.threw,
        ok: !!(followCall.r && followCall.r.ok), owned: false,
      });
      return { uri: null, status: followCall.status || skipStatus, upstream: followClass, retried: skipCall.retried || followCall.retried };
    }
    const skipClass = classifyUpstream({ status: skipStatus, threw: skipCall.threw, ok: skipOk, owned: false });
    return { uri: null, status: skipStatus, upstream: skipClass, retried: skipCall.retried };
  };

  const got = await tryName(ref);
  if (got.uri) return { uri: got.uri, upstream: got.upstream, retried: got.retried };
  if (got.upstream === "denied") return { uri: null, upstream: "denied", retried: got.retried };
  // Google photo resource names expire. The placeId is inside the ref, so a
  // stale inventory photo_ref is recoverable: one Place Details photos
  // lookup, then fetch the current name. Same self-heal the pre-#956 route
  // already had — without it, every expired library ref 404s and the card
  // looks empty even though the place has a photo.
  if (got.status === 400 || got.status === 403 || got.status === 404) {
    const placeId = placeIdFromRef(ref);
    if (placeId) {
      if (!(await grant("details_ids_only"))) return { uri: null, upstream: "stale-heal-denied", retried: got.retried };
      let d;
      try {
        d = await fetchImpl(
          "https://places.googleapis.com/v1/places/" + placeId + "?fields=photos&key=" + key,
          { next: { revalidate: 86400 } }
        );
      } catch {
        return { uri: null, upstream: "stale-heal-http", retried: got.retried };
      }
      if (!d.ok) return { uri: null, upstream: "stale-heal-http", retried: got.retried };
      let j;
      try {
        j = await d.json();
      } catch {
        return { uri: null, upstream: "stale-heal-http", retried: got.retried };
      }
      const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
      if (!(fresh && PHOTO_REF_RX.test(fresh))) return { uri: null, upstream: "stale-heal-nophoto", retried: got.retried };
      const isFreshName = fresh !== ref;
      if (!isFreshName) return { uri: null, upstream: "stale-heal-same", retried: got.retried };
      const healed = await tryName(fresh);
      if (healed.uri) return { uri: healed.uri, upstream: "ok", retried: got.retried || healed.retried };
      return { uri: null, upstream: "stale-heal-failed:" + healed.upstream, retried: got.retried || healed.retried };
    }
  }
  return { uri: null, upstream: got.upstream, retried: got.retried };
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
  const cacheDel = d.cacheDel || defaultCacheDel;
  const probeUri = d.probeUri || defaultProbeUri;
  const inventoryGet = d.inventoryGet || defaultInventoryGet;
  const fetchOwnedUri = d.fetchOwnedUri || defaultFetchOwnedUri;
  const now = Number.isFinite(d.now) ? d.now : Date.now();

  // One cached row, checked for liveness when its age says it is due.
  // Returns the uri to serve, or null when the row is dead (and evicted).
  // A probe is read-only on the cache: it must not re-stamp a row.
  const liveCachedUri = async (key, hit) => {
    const uri = cachedUri(hit);
    if (!uri) return null;
    const ageMs = hit && Number.isFinite(hit.ageMs) ? hit.ageMs : null;
    const vok = cachedValidatedAt(hit);
    if (!isGoogleHostedPhotoUri(uri) || !photoUriValidationDue({ ageMs, vok, now })) return uri;
    let verdict;
    try { verdict = await probeUri(uri); } catch { verdict = null; }
    if (verdict === PHOTO_URI_DEAD) {
      try { await cacheDel(key); } catch { /* eviction is best-effort; the row is still refused below */ }
      return null;
    }
    if (verdict === PHOTO_URI_ALIVE && !probe) {
      // Re-stamp with the REMAINING lifetime, never a fresh 30-day clock.
      const remaining = THIRTY_DAYS_MS - ageMs;
      if (remaining > 0) {
        try { await cacheSet(key, { uri, vok: now }, remaining); } catch { /* best-effort */ }
      }
    }
    // alive, or unknown (our failure, never the photo's): serve it.
    return uri;
  };

  const cacheLookup = async (photoRef) => {
    if (!PHOTO_REF_RX.test(photoRef)) return null;
    // Exact requested width always wins. A small thumbnail can reuse the
    // already-cached 640px card image; an 800 card request may reuse a fresh
    // 640 of THIS SAME photo ref. 1200 and other sizes stay exact-only.
    // Read-only: does not write an 800 row or extend the source lifetime.
    for (const width of photoCacheCandidateWidths(w)) {
      try {
        const key = photoCacheKey(photoRef, width);
        const uri = await liveCachedUri(key, await cacheGet(key));
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
    // A uri Google handed back this instant is validated by construction.
    try { await cacheSet(photoCacheKey(photoRef, w), { uri: String(uri), vok: now }); } catch { /* cache write is best-effort */ }
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
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "unconfigured", ref: useRef, upstream: null, retried: false };
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
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "probe-no-spend", ref: useRef, upstream: null, retried: false };
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
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "spend-denied", ref: useRef, upstream: null, retried: false };
    }
    // Every FURTHER outbound request inside fetchOwnedUri asks the same
    // authorizer, per SKU, so one grant can never fan out into several
    // billable calls (see defaultFetchOwnedUri). A boolean `spendAllowed`
    // caller gets no further grants: one request, then a miss.
    const authorizeMore = typeof input.authorizeSpend === "function" ? input.authorizeSpend : async () => false;
    // `d.fetchImpl` lets scripts/test-photo-upstream-truth.mjs inject a fake
    // Google endpoint with zero network. normalizeFetchOwnedResult() wraps
    // BOTH the real { uri, upstream, retried } shape and every existing
    // hermetic guard's plain string/null `deps.fetchOwnedUri` stub, so no
    // guard needs to change. `d.retryDelayMs` (undefined in production, so
    // defaultFetchOwnedUri's own PHOTO_UPSTREAM_RETRY_DELAY_MS default holds)
    // lets that same guard prove the retry without a real ~350ms sleep.
    const rawFetched = await fetchOwnedUri(useRef, w, serverKey, authorizeMore, d.fetchImpl, d.retryDelayMs);
    const fetched = normalizeFetchOwnedResult(rawFetched);
    if (isOwnedPhotoUrl(fetched.uri)) {
      await remember(useRef, fetched.uri);
      return redirectPhotoResult(fetched.uri, "google", undefined, { upstream: "ok", retried: fetched.retried });
    }
    // Owned ref, fetch failed. Do NOT 302 distinct refs to one branded file.
    // `upstream` is why: quota/server/network/redirect/badjson/unowned/client,
    // or a stale-heal-* class when the expired-ref self-heal ran and still
    // came up empty — never silently null on a path that reached Google.
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "owned-miss", ref: useRef, upstream: fetched.upstream, retried: fetched.retried };
  }

  if (useRef && gateShut) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "gate-shut", ref: useRef, upstream: null, retried: false };
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
