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
import { refundToLedger } from "./spendGate.js";
import { breakerOpen, tripBreaker } from "./providerHealth.js";

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
    // QUOTA TRUTH (2026-09-16). Every result also carries `refunded` — how
    // many ledger grants this exact call gave back because Google's own
    // answer proved the attempt was never billed. 0, never omitted, on any
    // path that took no grant at all.
    refunded: 0,
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
    refunded: Number.isFinite(info.refunded) ? info.refunded : 0,
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
// It never sees a key/ref/URL — only {status, threw, ok, json, owned, denied,
// googleStatus}.
export const PHOTO_UPSTREAM_RETRY_DELAY_MS = 350;

// QUOTA TRUTH (2026-09-16, root-caused against the Google Cloud console).
// `GetPhotoMediaRequest per day` carries a MANUAL OVERRIDE of 32 (Google's own
// default is 175,000); the day this was found, usage already read 34/32.
// classifyUpstream's original table (above) could not tell a genuine quota
// exhaustion from an ordinary 4xx: BOTH a 403 key restriction AND a 403 quota
// rejection (Google's own Place Photos doc: "quota exceeded returns HTTP 403;
// 429 for too many requests") classified as the same bare "client", and a 404
// classified as "client" too, so the self-heal below spent a details_ids_only
// grant healing a REJECTION, not a stale reference. Google's JSON error body
// (`{"error":{"status":"RESOURCE_EXHAUSTED"|...}}`) is now read — bounded,
// never logged, never returned as message text, only its `status` enum — and
// folds into the SAME classification the caller already trusted:
//   denied(ledger) > network(threw) > quota(429 / RESOURCE_EXHAUSTED) >
//   key-denied(403 with PERMISSION_DENIED or no parsable status) >
//   server(5xx / UNAVAILABLE / INTERNAL) > redirect(3xx) > badjson(2xx) >
//   ok/unowned(2xx) > stale(404 / NOT_FOUND) > client(400 / INVALID_ARGUMENT,
//   or any other unmatched 4xx).
// The self-heal (Place Details lookup) below now runs ONLY for `stale` and a
// `client` that is specifically HTTP 400 — never quota/key-denied/server/
// network, which used to waste a details_ids_only grant healing a rejection
// that heals nothing (see the guard's negative controls).
const GOOGLE_ERROR_BODY_MAX_BYTES = 4096;
// Exported so scripts/test-photo-quota-truth.mjs's red-proofs assert against
// the REAL set, never a hand-typed copy that could silently drift from it.
export const REFUNDABLE_UPSTREAM_CLASSES = new Set(["quota", "key-denied", "server"]);

// Read at most ~4KB of a non-2xx response body. Works against a real fetch
// Response (via its ReadableStream, so a large body is never buffered whole),
// and degrades to r.text()/r.json() for anything simpler — every hermetic
// guard's stub response included, none of which need to grow a `.body`
// stream just to be classified.
async function readBoundedErrorBody(r) {
  if (!r) return "";
  try {
    if (r.body && typeof r.body.getReader === "function") {
      const reader = r.body.getReader();
      let total = 0;
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); total += value.length; }
        if (total >= GOOGLE_ERROR_BODY_MAX_BYTES) break;
      }
      try { await reader.cancel(); } catch { /* best-effort */ }
      let buf;
      try { buf = Buffer.concat(chunks.map((c) => Buffer.from(c))); } catch { buf = Buffer.alloc(0); }
      return buf.slice(0, GOOGLE_ERROR_BODY_MAX_BYTES).toString("utf8");
    }
  } catch { /* fall through to text/json below */ }
  try {
    if (typeof r.text === "function") {
      const t = await r.text();
      return String(t == null ? "" : t).slice(0, GOOGLE_ERROR_BODY_MAX_BYTES);
    }
  } catch { /* fall through */ }
  try {
    if (typeof r.json === "function") {
      const j = await r.json();
      return JSON.stringify(j == null ? {} : j).slice(0, GOOGLE_ERROR_BODY_MAX_BYTES);
    }
  } catch { /* give up: no googleStatus, classification still works on status alone */ }
  return "";
}

// ONLY the enum `error.status` is ever extracted — never `error.message`
// (which can carry a project id, a key hint, or other operator-specific
// text). A body that fails to parse, or carries no matching field, yields
// null: classification still works from the raw HTTP status alone.
function parseGoogleErrorStatus(bodyText) {
  if (!bodyText) return null;
  let j;
  try { j = JSON.parse(bodyText); } catch { return null; }
  const s = j && j.error && j.error.status;
  return typeof s === "string" && /^[A-Z][A-Z_]{0,39}$/.test(s) ? s : null;
}

// Classify a non-2xx (or thrown) response: read its bounded body, extract
// ONLY the googleStatus enum, and hand off to classifyUpstream.
async function classifyNonOkCall(call) {
  if (call.threw) return classifyUpstream({ threw: true });
  const googleStatus = await readBoundedErrorBody(call.r);
  return classifyUpstream({ status: call.status, ok: false, googleStatus: parseGoogleErrorStatus(googleStatus) });
}

export function classifyUpstream({ status, threw, ok, json, owned, denied, googleStatus } = {}) {
  if (denied) return "denied";
  if (threw) return "network";
  const s = Number(status) || 0;
  const gs = typeof googleStatus === "string" && googleStatus ? googleStatus : null;
  if (gs === "RESOURCE_EXHAUSTED" || s === 429) return "quota";
  if (s === 403 && (gs === "PERMISSION_DENIED" || !gs)) return "key-denied";
  if ((s >= 500 && s < 600) || gs === "UNAVAILABLE" || gs === "INTERNAL") return "server";
  if (s >= 300 && s < 400) return "redirect";
  if (ok) {
    if (json === false) return "badjson";
    return owned ? "ok" : "unowned";
  }
  if (s === 404 || gs === "NOT_FOUND") return "stale";
  // 400/INVALID_ARGUMENT, or any other unmatched 4xx: both read as "client".
  // The CALLER (defaultFetchOwnedUri), not this pure table, decides whether a
  // "client" is heal-eligible — only when the raw HTTP status is exactly 400.
  return "client";
}

// GOOGLE DAILY QUOTA BREAKER (2026-09-16). Google's per-project photo media
// quota resets at Pacific midnight (America/Los_Angeles) — its own console
// says so, and it is the one clock Google actually uses; venue-local
// (lib/siteTime.js, America/New_York) is a DIFFERENT clock and is never used
// for this. Once a `quota` outcome is seen, retrying more places the SAME
// day only re-spends grants (refunded, but still a wasted round trip and a
// wasted retry-delay sleep) against a quota that cannot possibly reopen
// before the reset. lib/providerHealth.js's breaker (built for the exact
// same shape of problem — a deterministic refusal, not a transient blip) is
// reused here under its own provider key.
export const GOOGLE_PHOTOS_QUOTA_PROVIDER = "google-photos-quota";
const PACIFIC_TZ = "America/Los_Angeles";
const MIN_QUOTA_BREAKER_COOLDOWN_MS = 60 * 1000;
const MAX_QUOTA_BREAKER_COOLDOWN_MS = 25 * 60 * 60 * 1000;

// The Pacific UTC offset (minutes) in effect AT `ms` — negative west of UTC
// (e.g. -480 for PST, -420 for PDT). DST-aware via Intl; a runtime without tz
// data falls back to PST (-480) rather than throw.
function pacificOffsetMinutesAt(ms) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TZ, timeZoneName: "shortOffset" }).formatToParts(new Date(ms));
    const tz = parts.find((p) => p.type === "timeZoneName");
    const m = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec((tz && tz.value) || "");
    if (!m) return -480;
    const h = Number(m[1]);
    const mm = Number(m[2] || 0);
    return h * 60 + (h < 0 ? -mm : mm);
  } catch {
    return -480;
  }
}

// Pure. Milliseconds from `nowMs` until the NEXT Pacific-local midnight —
// the instant Google resets this project's daily photo quota. DST-safe: the
// offset is read twice (once for a same-UTC-day guess, once for the actual
// candidate instant it produces) so a "spring forward"/"fall back" day,
// which is 23h or 25h long in Pacific-local time, still lands on the correct
// wall-clock midnight rather than a naive +24h from now.
export function msUntilNextPacificMidnight(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  const y = g("year"), mo = g("month"), d = g("day");
  // Tomorrow's calendar date — plain Gregorian increment (JS normalizes an
  // out-of-range day, e.g. day 32 rolls into next month), not a timezone
  // conversion.
  const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1, 0, 0, 0));
  const ty = tomorrow.getUTCFullYear(), tmo = tomorrow.getUTCMonth() + 1, td = tomorrow.getUTCDate();
  // Candidate: tomorrow's Y-M-D at 00:00, MISLABELED as UTC. Corrected below
  // by the real Pacific UTC offset in effect near that instant.
  const candidateMs = Date.UTC(ty, tmo - 1, td, 0, 0, 0);
  let offsetMin = pacificOffsetMinutesAt(candidateMs);
  let targetMs = candidateMs - offsetMin * 60000;
  // Refine once against the actual target instant: on a DST-transition day,
  // the offset that applies to midnight can differ from the one read at the
  // (up to 8h-off) candidate guess.
  const offsetMin2 = pacificOffsetMinutesAt(targetMs);
  if (offsetMin2 !== offsetMin) targetMs = candidateMs - offsetMin2 * 60000;
  return Math.max(0, targetMs - nowMs);
}

// The breaker's cooldown: until Pacific midnight, plus a 60s buffer (clock
// skew between this instance and Google's), floored at 60s and capped at 25h
// (never longer than one calendar day plus slack, even if the above ever
// mis-measures).
export function quotaBreakerCooldownMs(nowMs = Date.now()) {
  const raw = msUntilNextPacificMidnight(nowMs) + MIN_QUOTA_BREAKER_COOLDOWN_MS;
  return Math.min(Math.max(raw, MIN_QUOTA_BREAKER_COOLDOWN_MS), MAX_QUOTA_BREAKER_COOLDOWN_MS);
}

// A legacy/injected `deps.fetchOwnedUri` (every existing hermetic guard)
// returns a bare uri string or null. defaultFetchOwnedUri instead returns
// { uri, upstream, retried, refunded } — this wraps either shape into the
// same one, so every existing guard passes unchanged and every NEW caller
// sees a class.
export function normalizeFetchOwnedResult(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && ("uri" in raw || "upstream" in raw)) {
    const uri = raw.uri != null ? raw.uri : null;
    return {
      uri,
      upstream: typeof raw.upstream === "string" && raw.upstream ? raw.upstream : (uri ? "ok" : "legacy-miss"),
      retried: !!raw.retried,
      refunded: Number.isFinite(raw.refunded) ? raw.refunded : 0,
    };
  }
  const uri = raw || null;
  return { uri, upstream: uri ? "ok" : "legacy-miss", retried: false, refunded: 0 };
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
//
// REFUND (2026-09-16): a grant is not the same fact as a Google BILL. Per
// Google's own billing table, OK/NOT_FOUND/INVALID_REQUEST("invalid
// parameter") are billed; RESOURCE_EXHAUSTED/PERMISSION_DENIED/UNAVAILABLE/
// INTERNAL are NOT. Every media (or Details) call whose FINAL classification
// (after any retry) lands in {quota, key-denied, server} is refunded through
// the injectable `refund(sku, n)` — default lib/spendGate.js refundToLedger —
// once per grant that call actually took, including the resolver's own
// pre-paid first grant (it paid for the attempt; if the attempt turns out
// unbilled, it is refunded exactly like any other). `network` (a thrown
// fetch) is NEVER refunded — Google may have processed the request before the
// connection broke, so the ledger may overcount but must never undercount. A
// `stale` (404/NOT_FOUND) is billed and is NEVER refunded either.
export async function defaultFetchOwnedUri(ref, w, key, authorize, fetchImpl = fetch, retryDelayMs = PHOTO_UPSTREAM_RETRY_DELAY_MS, refund = refundToLedger) {
  if (!key || !PHOTO_REF_RX.test(ref)) return { uri: null, upstream: null, retried: false, refunded: 0 };
  const may = typeof authorize === "function" ? authorize : async () => false;
  const doRefund = typeof refund === "function" ? refund : async () => false;
  // The first media request is the one the resolver already paid for.
  let firstCovered = true;
  const grant = async (sku) => {
    if (sku === "photos" && firstCovered) { firstCovered = false; return true; }
    try { return !!(await may(sku)); } catch { return false; }
  };

  // Refundable grants accrue here as classification learns they were never
  // billed, and are only ever GIVEN BACK once, at the very end (flush()) —
  // never mid-flight, so a function that returns early never forgets a grant
  // a LATER branch would have refunded.
  let photosRefundable = 0;
  let detailsRefundable = 0;
  const noteRefundable = (sku, cls) => {
    if (!REFUNDABLE_UPSTREAM_CLASSES.has(cls)) return;
    if (sku === "photos") photosRefundable++;
    else if (sku === "details_ids_only") detailsRefundable++;
  };
  const flush = async (partial) => {
    if (photosRefundable > 0) { try { await doRefund("photos", photosRefundable); } catch { /* best-effort */ } }
    if (detailsRefundable > 0) { try { await doRefund("details_ids_only", detailsRefundable); } catch { /* best-effort */ } }
    return { ...partial, refunded: photosRefundable + detailsRefundable };
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
    let skipCls;
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
      skipCls = "unowned";
    } else {
      skipCls = await classifyNonOkCall(skipCall);
    }
    noteRefundable("photos", skipCls);

    // Follow (the second, non-skip-redirect media request for the SAME
    // name) is only worth another grant when the skip attempt left something
    // recoverable: an unowned 2xx (Google answered, just not with our photo),
    // a stale reference (404/NOT_FOUND), or an ordinary bad request (exactly
    // HTTP 400). quota/key-denied/server/network NEVER reach here — retrying
    // via a different URL shape cannot fix a rejection, and would only waste
    // a second grant on the same answer (the 2026-09-16 finding: a 403 quota
    // rejection used to buy a follow AND a details grant for nothing).
    const followEligible = skipCls === "unowned" || skipCls === "stale" || (skipCls === "client" && skipCall.status === 400);
    if (!followEligible) {
      return { uri: null, status: skipCall.status, upstream: skipCls, retried: skipCall.retried };
    }

    if (!(await grant("photos"))) return { uri: null, status: skipCall.status, upstream: "denied", retried: skipCall.retried };
    const follow = "https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=" + w + "&key=" + key;
    const followCall = await callMedia(follow, { redirect: "follow" });
    if (followCall.r && followCall.r.ok && isOwnedPhotoUrl(followCall.r.url)) {
      return { uri: String(followCall.r.url), status: followCall.status, upstream: "ok", retried: skipCall.retried || followCall.retried };
    }
    const followCls = (followCall.r && followCall.r.ok) ? "unowned" : await classifyNonOkCall(followCall);
    noteRefundable("photos", followCls);
    return { uri: null, status: followCall.status || skipCall.status, upstream: followCls, retried: skipCall.retried || followCall.retried };
  };

  const got = await tryName(ref);
  if (got.uri) return flush({ uri: got.uri, upstream: got.upstream, retried: got.retried });
  if (got.upstream === "denied") return flush({ uri: null, upstream: "denied", retried: got.retried });
  // Google photo resource names expire. The placeId is inside the ref, so a
  // stale inventory photo_ref is recoverable: one Place Details photos
  // lookup, then fetch the current name. Same self-heal the pre-#956 route
  // already had — without it, every expired library ref 404s and the card
  // looks empty even though the place has a photo. HEAL-ELIGIBLE (2026-09-16):
  // ONLY `stale` (404/NOT_FOUND) or a `client` that is HTTP 400 exactly —
  // never quota/key-denied/server/network, which spend a details_ids_only
  // grant healing a rejection that no fresh photo_ref can fix.
  const healEligible = got.upstream === "stale" || (got.upstream === "client" && got.status === 400);
  if (healEligible) {
    const placeId = placeIdFromRef(ref);
    if (placeId) {
      if (!(await grant("details_ids_only"))) return flush({ uri: null, upstream: "stale-heal-denied", retried: got.retried });
      let d, dThrew = false;
      try {
        d = await fetchImpl(
          "https://places.googleapis.com/v1/places/" + placeId + "?fields=photos&key=" + key,
          { next: { revalidate: 86400 } }
        );
      } catch {
        dThrew = true;
      }
      if (dThrew || !d.ok) {
        if (!dThrew) noteRefundable("details_ids_only", await classifyNonOkCall({ r: d, threw: false, status: d.status }));
        return flush({ uri: null, upstream: "stale-heal-http", retried: got.retried });
      }
      let j;
      try {
        j = await d.json();
      } catch {
        return flush({ uri: null, upstream: "stale-heal-http", retried: got.retried });
      }
      const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
      if (!(fresh && PHOTO_REF_RX.test(fresh))) return flush({ uri: null, upstream: "stale-heal-nophoto", retried: got.retried });
      const isFreshName = fresh !== ref;
      if (!isFreshName) return flush({ uri: null, upstream: "stale-heal-same", retried: got.retried });
      const healed = await tryName(fresh);
      if (healed.uri) return flush({ uri: healed.uri, upstream: "ok", retried: got.retried || healed.retried });
      return flush({ uri: null, upstream: "stale-heal-failed:" + healed.upstream, retried: got.retried || healed.retried });
    }
  }
  return flush({ uri: null, upstream: got.upstream, retried: got.retried });
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
  const isBreakerOpen = typeof d.breakerOpen === "function" ? d.breakerOpen : breakerOpen;
  const tripTheBreaker = typeof d.tripBreaker === "function" ? d.tripBreaker : tripBreaker;
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
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "unconfigured", ref: useRef, upstream: null, retried: false, refunded: 0 };
    }
    if (probe) {
      // A probe must never take a grant — not even a same-tick "denied" ask.
      // The route's own authorizeSpend closure already refuses to grant a
      // probe, but this resolver does not rely on that: it never calls
      // authorizeSpend at all when probing, so a probe run can be proven, by
      // call count, to have asked for zero grants. For the SAME reason a
      // probe never reaches the breaker check below (it returns here first),
      // so a probe can never TRIP the breaker either — stated again at the
      // breaker check itself, defence-in-depth style.
      //
      // REASON IS "probe-no-spend", NOT "spend-denied". A probe never ASKED
      // the ledger, so "spend-denied" would be a false claim in any month
      // with headroom — a real reader hitting this exact code path would get
      // a Google fetch, not a denial. "probe-no-spend" says only what is
      // actually true: this ref was uncached and this was a probe, nothing
      // about whether a real request would spend. Shaped as type:"miss" to
      // match #1182's convention (a card's own monogram, not a shared SVG).
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "probe-no-spend", ref: useRef, upstream: null, retried: false, refunded: 0 };
    }
    // QUOTA BREAKER (2026-09-16): checked BEFORE any ledger grant is asked
    // for and BEFORE any Google call, so a tripped breaker costs the ledger
    // and Google both ZERO for the rest of the day. `!probe` is redundant
    // with the early return above (a probe never reaches here) but stated
    // explicitly anyway — the same defence-in-depth posture the rest of this
    // function already uses. A breaker read failure is treated as CLOSED
    // (fail toward doing work — lib/providerHealth.js's own contract); the
    // ledger still caps real spend either way.
    let quotaOpen = null;
    try { quotaOpen = !probe && (await isBreakerOpen(GOOGLE_PHOTOS_QUOTA_PROVIDER)); } catch { quotaOpen = null; }
    if (quotaOpen) {
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "quota-open", ref: useRef, upstream: "quota-open", retried: false, refunded: 0 };
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
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "spend-denied", ref: useRef, upstream: null, retried: false, refunded: 0 };
    }
    // Every FURTHER outbound request inside fetchOwnedUri asks the same
    // authorizer, per SKU, so one grant can never fan out into several
    // billable calls (see defaultFetchOwnedUri). A boolean `spendAllowed`
    // caller gets no further grants: one request, then a miss.
    const authorizeMore = typeof input.authorizeSpend === "function" ? input.authorizeSpend : async () => false;
    // `d.fetchImpl` lets scripts/test-photo-upstream-truth.mjs inject a fake
    // Google endpoint with zero network. normalizeFetchOwnedResult() wraps
    // BOTH the real { uri, upstream, retried, refunded } shape and every
    // existing hermetic guard's plain string/null `deps.fetchOwnedUri` stub,
    // so no guard needs to change. `d.retryDelayMs` (undefined in
    // production, so defaultFetchOwnedUri's own PHOTO_UPSTREAM_RETRY_DELAY_MS
    // default holds) lets that same guard prove the retry without a real
    // ~350ms sleep. `d.refund` (undefined in production, so
    // defaultFetchOwnedUri's own refundToLedger default holds) lets a guard
    // record refunds without a network call.
    const rawFetched = await fetchOwnedUri(useRef, w, serverKey, authorizeMore, d.fetchImpl, d.retryDelayMs, d.refund);
    const fetched = normalizeFetchOwnedResult(rawFetched);
    if (isOwnedPhotoUrl(fetched.uri)) {
      await remember(useRef, fetched.uri);
      return redirectPhotoResult(fetched.uri, "google", undefined, { upstream: "ok", retried: fetched.retried, refunded: fetched.refunded });
    }
    // QUOTA BREAKER, tripped (2026-09-16): a `quota` outcome (429, or 403
    // RESOURCE_EXHAUSTED — either way, or a healed name's own media call
    // ending the same way) means Google's daily photo quota is exhausted for
    // the rest of its Pacific-midnight day. Trip it so every OTHER request
    // this hour skips straight to a free miss instead of re-spending (and
    // re-refunding) a grant on a call that cannot succeed today.
    if (fetched.upstream === "quota" || fetched.upstream === "stale-heal-failed:quota") {
      try { await tripTheBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, "quota", "google photos daily quota exhausted", quotaBreakerCooldownMs(now)); } catch { /* best-effort */ }
    }
    // Owned ref, fetch failed. Do NOT 302 distinct refs to one branded file.
    // `upstream` is why: quota/key-denied/server/network/redirect/badjson/
    // unowned/client/stale, or a stale-heal-* class when the expired-ref
    // self-heal ran and still came up empty — never silently null on a path
    // that reached Google.
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "owned-miss", ref: useRef, upstream: fetched.upstream, retried: fetched.retried, refunded: fetched.refunded };
  }

  if (useRef && gateShut) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "gate-shut", ref: useRef, upstream: null, retried: false, refunded: 0 };
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
