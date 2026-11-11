// Photo-path circuit breaker. A single Places 429 used to latch every photo
// until Pacific midnight (Nov 1). This opens only after repeated rate limits
// in a short window, or immediately on a confirmed daily-quota signal, then
// holds for a short exponential backoff and lets one half-open probe through.
// It does not change wf_spend_ledger caps.

export const PHOTO_RATE_WINDOW_MS = 60 * 1000;
export const PHOTO_RATE_TRIP_COUNT = 5;
export const PHOTO_BACKOFF_BASE_MS = 15 * 1000;
export const PHOTO_BACKOFF_MAX_MS = 5 * 60 * 1000;
export const PHOTO_PROBE_LEASE_MS = 8 * 1000;

const rates = [];
let strikes = 0;
let probeLeaseUntil = 0;

export function resetPlacesPhotoBreaker() {
  rates.length = 0;
  strikes = 0;
  probeLeaseUntil = 0;
}

export function photoBackoffMs(strikeIndex) {
  const n = Math.max(0, Number(strikeIndex) || 0);
  return Math.min(PHOTO_BACKOFF_MAX_MS, PHOTO_BACKOFF_BASE_MS * (2 ** n));
}

export function isConfirmedDailyQuota(googleStatus, bodyText) {
  if (googleStatus === "RESOURCE_EXHAUSTED") return true;
  return /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|OVER_DAILY|per\s*day|daily limit exceeded/i.test(String(bodyText || ""));
}

function noteRate(now) {
  const cut = now - PHOTO_RATE_WINDOW_MS;
  while (rates.length && rates[0] < cut) rates.shift();
  rates.push(now);
  return rates.length;
}

export function placesPhotoTrip({ upstream, daily, status, now = Date.now() } = {}) {
  const up = String(upstream || "");
  const quota = up === "quota" || up.endsWith(":quota");
  if (!quota) return null;
  const sku = up.startsWith("place-lookup-failed") ? "details_ids_only" : "photos";
  const httpStatus = Number(status) || (daily ? 429 : 429);
  if (daily) {
    const cooldownMs = photoBackoffMs(strikes);
    const count = Math.max(rates.length, 1);
    strikes += 1;
    rates.length = 0;
    return { trip: true, reason: "places quota exhausted", cooldownMs, count, signal: "daily", sku, status: httpStatus };
  }
  const count = noteRate(now);
  if (count < PHOTO_RATE_TRIP_COUNT) {
    return { trip: false, count, signal: "rate", sku, status: httpStatus };
  }
  const cooldownMs = photoBackoffMs(strikes);
  strikes += 1;
  rates.length = 0;
  return { trip: true, reason: "places rate limit", cooldownMs, count, signal: "rate", sku, status: httpStatus };
}

export function photoBreakerHolding(row, now) {
  if (!row || !row.kind) return false;
  const exp = Date.parse(row.expiresAt);
  if (Number.isFinite(exp) && exp <= now) return false;
  return true;
}

export function claimHalfOpenProbe(now) {
  if (now < probeLeaseUntil) return false;
  probeLeaseUntil = now + PHOTO_PROBE_LEASE_MS;
  return true;
}

export function placesPhotoRecovered() {
  rates.length = 0;
  strikes = 0;
  probeLeaseUntil = 0;
}

export function reportPlacesPhotoError(row) {
  const payload = {
    event: "places_photo_error",
    status: row.status,
    sku: row.sku,
    route: row.route || "api/photo",
    count: row.count,
    signal: row.signal,
  };
  try { console.log(JSON.stringify(payload)); } catch { /* logging never blocks a photo */ }
  if (!row.trip) return;
  import("@sentry/nextjs").then((Sentry) => {
    try {
      if (Sentry && typeof Sentry.captureMessage === "function") {
        Sentry.captureMessage("places_photo_error_spike", {
          level: "warning",
          tags: { sku: String(row.sku || ""), route: String(payload.route), signal: String(row.signal || "") },
          extra: { status: row.status, count: row.count },
        });
      }
    } catch { /* telemetry only */ }
  }).catch(() => {});
}
