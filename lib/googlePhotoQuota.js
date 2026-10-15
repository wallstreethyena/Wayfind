// lib/googlePhotoQuota.js — Google's per-day photo quota as a number we can pace
// against (2026-10-15). PURE: no network, no env, no clock reads (callers pass `now`).
//
// 2026-10-14: Google's own quota (Places API (New) "GetPhotoMediaRequest per day")
// ran out at 6:02 PM ET and photos stayed dark until Pacific midnight. The breaker
// alert (photos_quota_exhausted) only fires AFTER that. These helpers drive the
// early-warning alerts (photos_quota_pacing / photos_purchase_spike) and the
// googleQuota block in /api/health/photos.
import { zonedDayStart } from "./commandCenter/time.js";

// Mirror of the Google Cloud console value, set 2026-10-14 (was 300, raised to
// 1000). Change BOTH together. Deliberately a literal, NEVER read from env, and
// nothing in this codebase raises the Cloud quota: that needs the owner.
export const GOOGLE_PHOTOS_DAILY_QUOTA = 1000;

// Pacing bands, as a share of the daily quota.
export const PACING_BANDS = Object.freeze([
  Object.freeze({ band: 1, minPct: 70, severity: "warn" }),
  Object.freeze({ band: 2, minPct: 85, severity: "warn" }),
  Object.freeze({ band: 3, minPct: 95, severity: "critical" }),
]);

// photos_purchase_spike: granted (billed) Google photo calls in the last hour.
export const PHOTO_PURCHASE_SPIKE_MIN = 150;

export const GOOGLE_QUOTA_TZ = "America/Los_Angeles";

/** UTC instant of the most recent Pacific midnight (start of Google's quota day). DST-aware. */
export function googleQuotaDayStart(now = new Date()) {
  return zonedDayStart(new Date(now), GOOGLE_QUOTA_TZ);
}

/** UTC instant of the NEXT Pacific midnight (Google's reset). 30h after a day start is always inside the next PT day (days are 23-25h). */
export function googleQuotaNextReset(now = new Date()) {
  return zonedDayStart(new Date(googleQuotaDayStart(now).getTime() + 30 * 3600000), GOOGLE_QUOTA_TZ);
}

/** Pacific calendar day "YYYY-MM-DD" of `now`. */
export function googleQuotaDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: GOOGLE_QUOTA_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** Highest band reached for a used count, or null below 70%. */
export function pacingBand(used, limit = GOOGLE_PHOTOS_DAILY_QUOTA) {
  const u = Number(used), l = Number(limit);
  if (!isFinite(u) || !isFinite(l) || l <= 0) return null;
  const pct = (u / l) * 100;
  let hit = null;
  for (const b of PACING_BANDS) if (pct >= b.minPct) hit = b;
  return hit;
}

export const etClock = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/**
 * Projected exhaustion instant at the last-hour rate.
 * @returns {{ms:number|null, beforeReset:boolean|null}} ms null when there is no rate.
 */
export function projectExhaustion({ used, limit = GOOGLE_PHOTOS_DAILY_QUOTA, lastHour, now = new Date() }) {
  const nowMs = new Date(now).getTime();
  const remaining = Number(limit) - Number(used);
  if (!isFinite(remaining)) return { ms: null, beforeReset: null };
  if (remaining <= 0) return { ms: nowMs, beforeReset: true };
  const rate = Number(lastHour);
  if (!isFinite(rate) || rate <= 0) return { ms: null, beforeReset: null };
  const ms = nowMs + (remaining / rate) * 3600000;
  return { ms, beforeReset: ms < googleQuotaNextReset(now).getTime() };
}

/** The googleQuota block for the health JSON. `d` = photoGoogleQuota().data. */
export function buildGoogleQuota(d, now = new Date()) {
  if (!d || !isFinite(Number(d.used))) return null;
  const limit = GOOGLE_PHOTOS_DAILY_QUOTA;
  const p = projectExhaustion({ used: d.used, limit, lastHour: d.lastHour, now });
  return {
    dayStartPT: googleQuotaDayStart(now).toISOString(),
    used: Number(d.used),
    limit,
    pct: Math.round((Number(d.used) / limit) * 1000) / 10,
    lastHour: isFinite(Number(d.lastHour)) ? Number(d.lastHour) : null,
    projectedExhaustET: p.ms != null && p.beforeReset ? etClock(p.ms) : null,
  };
}
