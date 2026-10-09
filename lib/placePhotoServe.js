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
//   1. A place with its own photo (Wayfind's own, a permitted or licensed
//      photo of it, or a live Google photo on a credited surface) must resolve
//      to THAT photo. Since 2026-10-08 no Google photo name, URL or credit is
//      stored or read from storage (see COMPLIANT PHOTOS at resolvePlacePhoto).
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

import { isFreeSourceHotlink } from "./imageHostPolicy.js";
import { canonicalPhotoWidth } from "./photoCacheRecovery.js";
import {
  PHOTO_URI_DEAD,
  isGoogleHostedPhotoUri,
  probePhotoUri,
} from "./photoUriLiveness.js";
import { refundToLedger } from "./spendGate.js";
import { breakerOpen, tripBreaker } from "./providerHealth.js";

export const PHOTO_REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
// A Google place id as cards carry it (ChIJ... and similar, 16+ url-safe chars).
const GOOGLE_PLACE_ID_RX = /^[A-Za-z0-9_-]{16,}$/;
export const FALLBACK_PATH = "/wf-photo-fallback.svg";
// A live Google photo redirect is never kept by a CDN or a browser cache.
export const GOOGLE_LIVE_CACHE_CONTROL = "private, no-store";
export const PHOTO_CACHE_PREFIX = "photo|";

const STOCK_RX = /(?:^|[\/.])(?:www\.)?(?:images\.)?pexels\.com\b|\/api\/market-photo(?:\?|$)|\/api\/stock-photo(?:\?|$)|\/wf-photo-fallback\.svg(?:\?|$)/i;
const OWNED_HOST_RX = /(?:^|\.)googleusercontent\.com$/i;

export function photoCacheKey(ref, w) {
  return PHOTO_CACHE_PREFIX + String(ref || "") + "|" + String(w || 640);
}

// NEGATIVE CACHE (2026-09-16). A ref whose Google fetch just proved it has no
// usable photo (heal found nothing, heal found the same expired name, an
// unowned/badjson/redirect answer) was re-spending a fresh ledger grant on
// EVERY subsequent request for the same ref, for as long as the card stayed
// on screen — a place that will never have a fetchable photo today paid for
// that "no" over and over. `photoneg|<ref>` is a short-lived (24h) marker:
// present means "do not even ask the ledger for this ref right now", absent
// (or past its 24h window) means try again normally. Never a substitute for
// a real photo — see resolvePlacePhoto's own read/write sites for exactly
// which upstream classes qualify.
export const PHOTO_NEGATIVE_CACHE_PREFIX = "photoneg|";
export function photoNegativeKey(ref) {
  return PHOTO_NEGATIVE_CACHE_PREFIX + String(ref || "");
}
// The upstream classes worth remembering as "this ref has no usable photo
// right now": every one of them is Google actually answering (not a quota/
// key/server rejection, not a network failure, not our own ledger saying no,
// not a transient/budget heal-denial) with a shape that means no photo is
// coming back on a retry a moment later. Never quota/key-denied/server/
// network/denied/stale-heal-denied — those are either transient (retry may
// succeed once the underlying condition clears) or already metered/refunded
// by the quota machinery above; caching them negatively would hide a
// recovery the NEXT request should get to attempt.
export const NEGATIVE_CACHEABLE_UPSTREAM = new Set([
  "stale-heal-nophoto",
  "stale-heal-same",
  "stale-heal-http",
  "stale-heal-failed:stale",
  "stale-heal-failed:client",
  "fresh-nophoto",
  "fresh-failed:stale",
  "fresh-failed:client",
  "fresh-failed:unowned",
  "fresh-failed:badjson",
  "unowned",
  "badjson",
  "redirect",
]);

// SINGLEFLIGHT (2026-09-16). Concurrent requests for the SAME photo ref at
// the SAME canonical width, in one warm lambda instance, used to each take
// their own ledger grant and their own outbound Google call — a card rail
// rendering the same venue twice in one response, or two readers hitting a
// cold ref in the same tick, paid twice (or more) for a result the first
// caller was already about to produce. Keyed on `${ref}|${canonicalWidth}`
// (not the raw requested width — two callers asking for 480 and 720 of the
// SAME ref now fetch the SAME canonical row, so they must also share the
// SAME in-flight paid attempt). A probe never enters this map: it returns
// before the paid section below is ever reached, so it can neither join nor
// create an in-flight entry.
const inflightPhotoFetches = new Map();

// The cache/negative-cache identity of a place-only discovery. It passes
// PHOTO_REF_RX so every existing cache path works unchanged, and its fixed
// photo segment can never collide with a real Google photo name.
export const PLACE_DISCOVERY_SEGMENT = "wfplacediscovery";
export function placeDiscoveryRef(placeId) {
  return "places/" + String(placeId || "") + "/photos/" + PLACE_DISCOVERY_SEGMENT;
}
export function isPlaceDiscoveryRef(ref) {
  return typeof ref === "string" && ref.endsWith("/photos/" + PLACE_DISCOVERY_SEGMENT);
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
  // An inventory-owned https photo keeps the 30-day contract it always had.
  // A Google-hosted URI is live Google Maps Content: never kept downstream.
  const fallback = isGoogleHostedPhotoUri(location)
    ? GOOGLE_LIVE_CACHE_CONTROL
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

async function defaultProbeUri(uri) {
  return probePhotoUri(uri);
}

function ownedFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const signals = row.signals && typeof row.signals === "object" ? row.signals : {};
  const candidates = [row.photo_url, row.photoUrl, signals.photo_url, signals.photoUrl, signals.photo];
  for (const c of candidates) {
    // A stored Commons URL is a hotlink, not an owned copy: skip it so the
    // free lane serves the vaulted rendition (lib/imageHostPolicy.js).
    if (isOwnedPhotoUrl(c) && !isFreeSourceHotlink(String(c))) return String(c);
  }
  return null;
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
      { headers, cache: "no-store" }
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
// The live credit for the FIRST photo of a Place Details (IDs Only, fields=
// photos) response: the author's display name and profile link, plus the
// photo's Google Maps link. Pure, never throws, never stored. Only an https
// link survives; anything else renders as plain text.
export function liveCreditFrom(j) {
  try {
    const ph = j && Array.isArray(j.photos) ? j.photos[0] : null;
    if (!ph) return null;
    const httpsOrNull = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
    const a = Array.isArray(ph.authorAttributions) ? ph.authorAttributions[0] : null;
    const name = a && typeof a.displayName === "string" ? a.displayName.trim().slice(0, 120) : "";
    const authors = (Array.isArray(ph.authorAttributions) ? ph.authorAttributions : []).map((author) => ({
      name: typeof author.displayName === "string" ? author.displayName.trim() : "",
      uri: httpsOrNull(author.uri), photoUri: httpsOrNull(author.photoUri),
    }));
    return { name, uri: httpsOrNull(a && a.uri), mapsUri: httpsOrNull(ph.googleMapsUri), authors };
  } catch {
    return null;
  }
}

export function normalizeFetchOwnedResult(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && ("uri" in raw || "upstream" in raw)) {
    const uri = raw.uri != null ? raw.uri : null;
    return {
      uri,
      upstream: typeof raw.upstream === "string" && raw.upstream ? raw.upstream : (uri ? "ok" : "legacy-miss"),
      retried: !!raw.retried,
      refunded: Number.isFinite(raw.refunded) ? raw.refunded : 0,
      // The exact photo name whose media call produced `uri` (may differ from
      // the requested ref after a fresh-first lookup or a stale-name heal).
      // Present only when known, so every existing result shape is unchanged.
      ...(typeof raw.name === "string" && PHOTO_REF_RX.test(raw.name) ? { name: raw.name } : {}),
      ...(raw.credit && typeof raw.credit === "object" ? { credit: raw.credit } : {}),
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
export async function defaultFetchOwnedUri(ref, w, key, authorize, fetchImpl = fetch, retryDelayMs = PHOTO_UPSTREAM_RETRY_DELAY_MS, refund = refundToLedger, opts = {}) {
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
    // A photos grant the resolver took for us but no media call ever used
    // (fresh-first found no photo, or never reached a media call) was never
    // billed: give it back like any other unbilled grant.
    if (firstCovered) { firstCovered = false; photosRefundable++; }
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
    // ONLY a different URL shape can recover: an unowned 2xx (Google
    // answered, just not with our photo — the follow's redirect target can
    // differ from the skip response's JSON body). SPEND EFFICIENCY
    // (2026-09-16): `stale` (404/NOT_FOUND) and a `client` that is exactly
    // HTTP 400 no longer follow — production proof was that Google's follow
    // URL for the SAME expired name answers the SAME 404/400 every time (it
    // is the same resource name, not a different lookup), so that second
    // media grant bought nothing but a repeat of the answer the skip call
    // already had. Both fall straight through to the caller's healEligible
    // check instead, which is the ONLY thing that can actually fix a stale
    // name (a fresh Place Details lookup). quota/key-denied/server/network
    // never reached here either, before or after this change — retrying via
    // a different URL shape cannot fix a rejection.
    const followEligible = skipCls === "unowned";
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

  // FRESH NAME FIRST (2026-09-17). Measured on the first five visible empty
  // cards filled after v8.56.20 shipped: all five stored photo names had
  // expired, so each card paid a billed dead-name media call (404/400), then
  // a Place Details lookup, then the real media call: two billed Place Details
  // Photos events per picture. Place Details with fields=photos bills as
  // "Place Details Essentials (IDs Only)", which Google lists with unlimited
  // free usage (pricing page, checked 2026-09-17), so asking for the current
  // name FIRST costs nothing and makes every picture exactly one billed media
  // call. Opt-in (opts.freshFirst) so every existing caller and hermetic guard
  // keeps the stored-name order; app/api/photo/route.js opts in for real
  // requests. A lookup that fails falls back to the stored name, and the
  // stored-name heal below then does not repeat the lookup.
  // ONE Place Details (IDs Only, fields=photos) endpoint for both the
  // fresh-first lookup and the stored-name heal below.
  const detailsPhotosUrl = (pid) => "https://places.googleapis.com/v1/places/" + pid + "?fields=photos&key=" + key;
  // PHOTO CREDITS (2026-10-01). The Details response above already carries
  // each photo's authorAttributions + googleMapsUri; dropping them left every
  // freshly fetched photo uncredited (only 2 of 13 Google callers kept them).
  // Hand the response we ALREADY received to the caller's credit keeper
  // (app/api/photo/route.js -> lib/photoCredits.keepPhotoCredits). No extra
  // Google call, no new SKU; extractPhotoCredits pins each credit to its own
  // photo name and refuses another place's photo. Best-effort, never throws.
  // COMPLIANT PHOTOS (2026-10-08). Credits are no longer stored anywhere
  // (wf_photo_credit is retired): Google's Place Photos (New) page says a photo
  // name cannot be cached and its authorAttributions must be shown wherever the
  // image is. The credit of the exact photo fetched is returned with the result
  // so the caller can show it next to that image, live, and nothing is kept.
  let liveCredit = null;
  const creditsFrom = (pid, j) => {
    liveCredit = liveCreditFrom(j);
  };
  let freshTried = false;
  if (opts && opts.freshFirst) {
    const placeId = placeIdFromRef(ref);
    if (placeId && (await grant("details_ids_only"))) {
      freshTried = true;
      let fresh = null, detailsOk = false;
      try {
        const d = await fetchImpl(
          detailsPhotosUrl(placeId),
          { cache: "no-store" }
        );
        if (d && d.ok) {
          const j = await d.json();
          detailsOk = true;
          creditsFrom(placeId, j);
          const name = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
          // Identity: only a photo of THIS place is ever fetched.
          if (name && PHOTO_REF_RX.test(name) && placeIdFromRef(name) === placeId) fresh = name;
        } else if (d) {
          noteRefundable("details_ids_only", await classifyNonOkCall({ r: d, threw: false, status: d.status }));
        }
      } catch { detailsOk = false; }
      if (detailsOk && !fresh) return flush({ uri: null, upstream: "fresh-nophoto", retried: false });
      if (fresh) {
        const f = await tryName(fresh);
        if (f.uri) return flush({ uri: f.uri, upstream: "ok", retried: f.retried, name: fresh, credit: liveCredit });
        return flush({ uri: null, upstream: f.upstream === "denied" ? "denied" : "fresh-failed:" + f.upstream, retried: f.retried });
      }
    }
  }
  // PLACE-ONLY DISCOVERY (2026-09-17). A card that only knows a place id
  // (`/api/photo?place=`) carries no stored photo name at all: the ref here
  // is a pseudo-ref (see placeDiscoveryRef) that must NEVER be sent to the
  // media endpoint. If the free lookup above did not produce a current name,
  // stop here; the resolver's photos grant is refunded by flush().
  if (opts && opts.placeOnly) {
    return flush({ uri: null, upstream: freshTried ? "place-lookup-failed" : "place-lookup-denied", retried: false });
  }
  const got = await tryName(ref);
  if (got.uri) return flush({ uri: got.uri, upstream: got.upstream, retried: got.retried, name: ref });
  if (got.upstream === "denied") return flush({ uri: null, upstream: "denied", retried: got.retried });
  // Google photo resource names expire. The placeId is inside the ref, so a
  // stale inventory photo_ref is recoverable: one Place Details photos
  // lookup, then fetch the current name. Same self-heal the pre-#956 route
  // already had — without it, every expired library ref 404s and the card
  // looks empty even though the place has a photo. HEAL-ELIGIBLE (2026-09-16):
  // ONLY `stale` (404/NOT_FOUND) or a `client` that is HTTP 400 exactly —
  // never quota/key-denied/server/network, which spend a details_ids_only
  // grant healing a rejection that no fresh photo_ref can fix.
  const healEligible = !freshTried && (got.upstream === "stale" || (got.upstream === "client" && got.status === 400));
  if (healEligible) {
    const placeId = placeIdFromRef(ref);
    if (placeId) {
      if (!(await grant("details_ids_only"))) return flush({ uri: null, upstream: "stale-heal-denied", retried: got.retried });
      let d, dThrew = false;
      try {
        d = await fetchImpl(
          detailsPhotosUrl(placeId),
          { cache: "no-store" }
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
      creditsFrom(placeId, j);
      const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
      if (!(fresh && PHOTO_REF_RX.test(fresh))) return flush({ uri: null, upstream: "stale-heal-nophoto", retried: got.retried });
      const isFreshName = fresh !== ref;
      if (!isFreshName) return flush({ uri: null, upstream: "stale-heal-same", retried: got.retried });
      const healed = await tryName(fresh);
      if (healed.uri) return flush({ uri: healed.uri, upstream: "ok", retried: got.retried || healed.retried, name: fresh, credit: liveCredit });
      return flush({ uri: null, upstream: "stale-heal-failed:" + healed.upstream, retried: got.retried || healed.retried });
    }
  }
  return flush({ uri: null, upstream: got.upstream, retried: got.retried });
}

// COMPLIANT PHOTOS (owner decision, 2026-10-08). Google Maps Platform Terms
// 3.2.3(a)(i) and (b) forbid pre-fetching, storing or caching Google Maps
// Content; the Maps Service Specific Terms (Places, 14.3) allow ONLY the place
// ID to be kept indefinitely; the Place Photos (New) page says "You cannot
// cache a photo name" and requires the photo's authorAttributions wherever the
// image is shown. So this resolver:
//   - never reads, uses or writes a stored Google photo name or photo URL
//     (no photo| rows, no photoneg| rows, no credit rows). A ref is used ONLY
//     for the place ID inside it; a stored Google-hosted photo_url is ignored;
//   - serves, in order: Wayfind's own photo (inventory, not Google-hosted),
//     then (in the route) a permitted or licensed photo of THIS place
//     (wf_place_photo), then a live Google photo ONLY on a surface that shows
//     the full credit (input.googleSurface: the place detail hero and its
//     viewer), then an honest miss the card renders as a clean placeholder;
//   - asks Google live for the place's current first photo (Place Details,
//     fields=photos: the "Essentials IDs Only" SKU, cache:"no-store") and buys
//     at most ONE media call per grant, returned with that photo's live credit
//     and `private, no-store` so nothing downstream keeps it.
// Spend protections are unchanged: probe/bot/nospend never ask the ledger;
// the quota breaker is read before any grant; one atomic `photos` grant per
// media call (fail-closed); same-place concurrent requests in a lambda share
// one in-flight attempt; refunds only for unbilled classes.
export async function resolvePlacePhoto(input, deps) {
  const d = deps || {};
  const ref = String((input && input.ref) || "");
  const place = String((input && input.place) || "");
  let w = parseInt((input && input.w) || 640, 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600;
  const gateShut = !!(input && input.gateShut);
  const serverKey = (input && input.serverKey) || "";
  const probe = !!(input && input.probe);
  const googleSurface = !!(input && input.googleSurface);
  const probeUri = d.probeUri || defaultProbeUri;
  const inventoryGet = d.inventoryGet || defaultInventoryGet;
  const fetchOwnedUri = d.fetchOwnedUri || defaultFetchOwnedUri;
  // HERMETIC BREAKER (2026-09-17): an injected Google (a test or harness) never
  // reads or trips production's breaker. Production never injects a fetcher.
  const fakeUpstream = typeof d.fetchOwnedUri === "function" || typeof d.fetchImpl === "function";
  const isBreakerOpen = typeof d.breakerOpen === "function" ? d.breakerOpen : (fakeUpstream ? async () => null : breakerOpen);
  const tripTheBreaker = typeof d.tripBreaker === "function" ? d.tripBreaker : (fakeUpstream ? async () => {} : tripBreaker);
  const now = Number.isFinite(d.now) ? d.now : Date.now();

  // Only the place ID is ever taken from a ref (Places 14.3: place IDs may be
  // kept indefinitely). The photo segment is never sent anywhere.
  const fromRef = PHOTO_REF_RX.test(ref) ? placeIdFromRef(ref) : "";
  const placeId = fromRef || (/^[A-Za-z0-9_-]{10,}$/.test(place) ? place : "");
  if (!placeId) return emptyPhotoResult("no-photo");

  // 1. Wayfind's own photo. A Google-hosted URL stored in inventory is Google
  //    Maps Content we may not keep, so it is never served from storage.
  let row = null;
  try { row = await inventoryGet(placeId); } catch { row = null; }
  const owned = ownedFromRow(row);
  if (owned && !isGoogleHostedPhotoUri(owned)) {
    // A non-Google https photo can still die; a free HEAD is the only check.
    let verdict = null;
    if (/^https:\/\//i.test(owned)) { try { verdict = await probeUri(owned); } catch { verdict = null; } }
    if (verdict !== PHOTO_URI_DEAD) return redirectPhotoResult(owned, "inventory");
  }

  // 2. Permitted and licensed photos are served by the route (wf_place_photo)
  //    before it ever reaches here with spend; see app/api/photo/route.js.
  // 3. Google, live, only where the full credit is shown.
  if (!googleSurface) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "not-google-surface", ref: "", upstream: null, retried: false, refunded: 0 };
  }
  if (!GOOGLE_PLACE_ID_RX.test(placeId)) return emptyPhotoResult("no-photo");
  const useRef = placeDiscoveryRef(placeId);
  if (gateShut) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "gate-shut", ref: useRef, upstream: null, retried: false, refunded: 0 };
  }
  if (!serverKey) {
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "unconfigured", ref: useRef, upstream: null, retried: false, refunded: 0 };
  }
  if (probe) {
    // A probe (monitor header, nospend=1, automated reader) never asks the
    // ledger, never reaches the breaker, never calls Google.
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: "probe-no-spend", ref: useRef, upstream: null, retried: false, refunded: 0 };
  }

  // SINGLEFLIGHT: concurrent requests for the same place at the same canonical
  // width in one lambda share ONE attempt (one grant, one Google call). The
  // result object (including its live credit) is shared, never stored.
  const canonW = canonicalPhotoWidth(w);
  const singleflightKey = useRef + "|" + canonW;
  const inflight = inflightPhotoFetches.get(singleflightKey);
  if (inflight) return inflight;

  const run = (async () => {
    try {
      let quotaOpen = null;
      try { quotaOpen = await isBreakerOpen(GOOGLE_PHOTOS_QUOTA_PROVIDER); } catch { quotaOpen = null; }
      if (quotaOpen) {
        return { type: "miss", location: null, cacheControl: "private, no-store", reason: "quota-open", ref: useRef, upstream: "quota-open", retried: false, refunded: 0 };
      }
      // A counter that throws (unreachable, timed out) is a refusal: fail closed.
      let spendAllowed = false;
      try {
        spendAllowed = typeof input.authorizeSpend === "function"
          ? !!(await input.authorizeSpend("photos"))
          : !!input.spendAllowed;
      } catch { spendAllowed = false; }
      if (!spendAllowed) {
        return { type: "miss", location: null, cacheControl: "private, no-store", reason: "spend-denied", ref: useRef, upstream: null, retried: false, refunded: 0 };
      }
      const authorizeMore = typeof input.authorizeSpend === "function" ? input.authorizeSpend : async () => false;
      const rawFetched = await fetchOwnedUri(useRef, canonW, serverKey, authorizeMore, d.fetchImpl, d.retryDelayMs, d.refund, { freshFirst: true, placeOnly: true });
      const fetched = normalizeFetchOwnedResult(rawFetched);
      if (isOwnedPhotoUrl(fetched.uri)) {
        const res = redirectPhotoResult(fetched.uri, "google", GOOGLE_LIVE_CACHE_CONTROL, { upstream: "ok", retried: fetched.retried, refunded: fetched.refunded });
        res.credit = fetched.credit || null;
        return res;
      }
      if (fetched.upstream === "quota" || fetched.upstream === "stale-heal-failed:quota" || fetched.upstream === "fresh-failed:quota") {
        try { await tripTheBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, "quota", "google photos daily quota exhausted", quotaBreakerCooldownMs(now)); } catch { /* best-effort */ }
      }
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: "owned-miss", ref: useRef, upstream: fetched.upstream, retried: fetched.retried, refunded: fetched.refunded };
    } finally {
      inflightPhotoFetches.delete(singleflightKey);
    }
  })();
  inflightPhotoFetches.set(singleflightKey, run);
  return run;
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
