// lib/photoUriLiveness.js — IS THE GOOGLE PHOTO WE CACHED STILL THERE?
//
// THE LIVE BUG (2026-09-15, Keke's Breakfast Cafe, Bradenton — and 27% of
// the whole photo cache). /api/photo caches the FINAL lh3.googleusercontent
// URI that Google's Place Photo media endpoint hands back, and serves it as a
// 30-day `immutable` 302. Google documents that `photoUri` as SHORT-LIVED.
// Measured against production on 2026-09-15: of 10,133 cached photo rows a
// stratified sample of 162 answered 403 for 44 of them (27%), including rows
// only seven days old. Every one of those was a card whose <img> loaded a
// 403, errored, and fell back to a branded panel — while the same route's
// same-place recovery and free-photo rungs, which would have painted a real
// picture, never ran, because a cache HIT returns before them.
//
// Nothing in the chain could see it: the cache row was "fresh" by its own
// expiry, the CDN replayed the 302 for 30 days, the browser cached it too,
// and the only symptom was a reader-side image error. Three PRs (#1280,
// #1233, #1319) chased that error at the client layer.
//
// THE RULE. A cached Google-hosted URI is a CLAIM, not a fact. Before a
// reader is sent to it, and no more than once a day per row, ask the host
// itself with a HEAD — free, non-billable (lh3 is a CDN, not a Places API
// endpoint), no key, no ledger grant. 200 keeps the row and stamps it
// validated. 403/404/410 evicts the row so the existing ladder (inventory →
// same-place recovery → free permanent photo → one ledger-granted Google
// fetch → honest miss) runs for the next reader. Anything else — timeout,
// 5xx, 429, network — is OUR failure, never the photo's, and the row is
// served as-is: UNKNOWN IS NOT DEAD (the same law lib/experienceLinkHealth.js
// applies to Viator products).
//
// Pure decision logic lives here so scripts/check-photo-cache-liveness.mjs
// can assert on the CALL against the real functions with injected fetch.

export const PHOTO_URI_ALIVE = "alive";
export const PHOTO_URI_DEAD = "dead";
export const PHOTO_URI_UNKNOWN = "unknown";

// A row written less than this long ago was JUST fetched from Google — the
// media redirect that produced it was live seconds ago. Do not spend a HEAD
// on it; the first revalidation happens once it is old enough to matter.
// v8.56.34: 6h -> 1h and 24h -> 3h. Production found links that died within
// 7 hours of a successful validation (55 of 1,993 served links dead on
// 2026-09-17); lib/photoLivenessSweep.js now also checks them in bulk.
export const PHOTO_URI_VALIDATE_GRACE_MS = 1 * 60 * 60 * 1000;
// Once validated, trust the verdict for this long before asking again.
export const PHOTO_URI_REVALIDATE_MS = 3 * 60 * 60 * 1000;
// The longest ANY Google-hosted photo redirect may be cached downstream
// (Vercel CDN + browser). It used to be 30 days `immutable`; a dead redirect
// cached that long outlives every server-side fix. One day matches the
// revalidation cadence, so a row we evict stops being replayed within that
// window (v8.56.34: three hours, matching PHOTO_URI_REVALIDATE_MS).
export const PHOTO_REDIRECT_TTL_SECONDS = 60 * 60 * 3;
export const PHOTO_URI_PROBE_TIMEOUT_MS = 2500;

const GOOGLE_USER_CONTENT_RX = /(?:^|\.)googleusercontent\.com$/i;

/** Only Google-hosted (rented, short-lived) URIs are ever probed. */
export function isGoogleHostedPhotoUri(uri) {
  try {
    const u = new URL(String(uri || ""));
    return u.protocol === "https:" && GOOGLE_USER_CONTENT_RX.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Classify one HEAD/GET status from the photo host.
 * 200 → alive. 403/404/410 → dead (Google's explicit "not here"). Everything
 * else (0, 429, 5xx, 3xx, network) → unknown — never treated as dead.
 */
export function classifyPhotoUriProbe(httpStatus) {
  const s = Number(httpStatus);
  if (s === 200) return PHOTO_URI_ALIVE;
  if (s === 403 || s === 404 || s === 410) return PHOTO_URI_DEAD;
  return PHOTO_URI_UNKNOWN;
}

/**
 * Should this cached row be probed before it is served?
 * @param {{ageMs?:number|null, vok?:number|null, now?:number}} row
 *   ageMs — how long ago the row was written (null/undefined = unknown age:
 *   an injected/legacy hit with no provenance is served as-is, exactly as
 *   before this module existed, so hermetic guards stay hermetic).
 *   vok — epoch ms of the last successful validation, if any.
 */
export function photoUriValidationDue({ ageMs, vok, now = Date.now() } = {}) {
  if (!Number.isFinite(ageMs)) return false;
  if (ageMs < PHOTO_URI_VALIDATE_GRACE_MS) return false;
  if (Number.isFinite(vok) && now - vok < PHOTO_URI_REVALIDATE_MS) return false;
  return true;
}

/**
 * Ask the photo host whether the URI still serves. Never throws; never takes
 * a ledger grant; never calls a googleapis.com endpoint. Non-Google URIs are
 * reported alive without a request (an inventory-owned https photo is not a
 * rented Google URI and has no known expiry class).
 */
export async function probePhotoUri(uri, { fetchImpl = fetch, timeoutMs = PHOTO_URI_PROBE_TIMEOUT_MS } = {}) {
  if (!isGoogleHostedPhotoUri(uri)) return PHOTO_URI_ALIVE;
  const controller = new AbortController();
  let timer = null;
  // The deadline is enforced HERE, not only via the abort signal: a fetch that
  // ignores its signal (or a host that never answers) must still resolve to
  // unknown on time — a photo request may never hang on a liveness check.
  const deadline = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(PHOTO_URI_UNKNOWN); }, timeoutMs); });
  try {
    const attempt = Promise.resolve()
      .then(() => fetchImpl(uri, { method: "HEAD", redirect: "manual", cache: "no-store", signal: controller.signal }))
      .then((r) => classifyPhotoUriProbe(r && r.status), () => PHOTO_URI_UNKNOWN);
    return await Promise.race([attempt, deadline]);
  } catch {
    return PHOTO_URI_UNKNOWN;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Cache-Control for a Google-hosted redirect: bounded by the daily revalidation, never `immutable`. */
export function googlePhotoRedirectCacheControl(ttlSeconds = PHOTO_REDIRECT_TTL_SECONDS) {
  const t = Math.max(60, Math.min(PHOTO_REDIRECT_TTL_SECONDS, Math.floor(Number(ttlSeconds) || PHOTO_REDIRECT_TTL_SECONDS)));
  return "public, max-age=" + t + ", s-maxage=" + t;
}
