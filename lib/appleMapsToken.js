// lib/appleMapsToken.js — WHAT WE KNOW ABOUT THE APPLE MAPS TOKEN, WITHOUT
// TRUSTING IT.
//
// 2026-09-08 (owner: "switch to Apple Maps permanently, not temporarily").
// The event map went live on 2026-09-07 (#1144) on a MapKit JS token minted
// from the Apple developer portal's short-lived form: `iat` 2026-09-07,
// `exp` 2026-09-15, no `origin` claim. Nothing in the repo knew that. On the
// morning of the 15th every event map would have flipped to the "map preview
// is unavailable" fallback after a 12-second wait, with a green guard suite,
// a green canary, and no alarm — the atlas-build shape all over again: a
// silent failure on a clock instead of on a commit.
//
// This module is the one place that reads the token's SHAPE. It never
// verifies the signature (that is Apple's job, and the browser's) and it
// never needs a secret: a MapKit JS token is public by design — it ships in
// the client bundle. It answers three questions the rest of the app needs:
//
//   1. Is anything configured at all?               -> `configured`
//   2. Is it a JWT we can read a lifetime from?      -> `format`, `expiresAt`
//   3. Is it dead, or dying soon?                    -> `expired`, `daysLeft`
//
// Consumers:
//   - app/api/health/apple-maps/route.js   the production health surface the
//                                          synthetic monitor asserts on every
//                                          30 minutes, so an expiring token is
//                                          a RED run a week early, not a
//                                          reader-visible outage on the day.
//   - app/components/EventVenueMap.js      fails closed immediately on a token
//                                          that is already expired instead of
//                                          loading MapKit, collecting a 401 and
//                                          waiting out the 12s watchdog.
//   - lib/appleMapsRuntime.js              same short-circuit before the
//                                          script tag is ever appended.
//
// Pure. No process.env, no Date.now() unless the caller omits `now`, no I/O,
// no throw. Safe to import from a bare-Node guard and from a "use client"
// component alike.

/** Days of runway below which the health surface reports `warning: true`. */
export const APPLE_MAPS_TOKEN_WARN_DAYS = 14;

/**
 * Placeholder values the env template ships with; never a real token. Same
 * whole-value shape as lib/envAudit.js PLACEHOLDER_RX, plus the substring
 * form lib/appleMapsRuntime.js has always refused (`/placeholder/i`). Whole
 * value only for the short words: "xxx" or "none" INSIDE a base64url signature
 * is entropy, not a placeholder.
 */
const PLACEHOLDER_RX = /^(\[[^\]]*\]|<[^>]*>|your[-_ ].*|change[-_ ]?me|replace[-_ ]?me|.*placeholder.*|todo|tbd|x{3,}|example|sample|dummy|null|undefined|none)$/i;

function decodeSegment(seg) {
  if (typeof seg !== "string" || !seg) return null;
  try {
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    let text;
    if (typeof atob === "function") {
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      text = new TextDecoder().decode(bytes);
    } else {
      // eslint-disable-next-line no-undef
      text = Buffer.from(padded, "base64").toString("utf8");
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Describe a MapKit JS token without verifying it.
 *
 * @param {unknown} token   whatever NEXT_PUBLIC_APPLE_MAPS_TOKEN holds
 * @param {number} [now]    ms since epoch; injectable so tests are deterministic
 * @returns {{
 *   configured: boolean,          // a non-empty, non-placeholder value exists
 *   format: "missing"|"placeholder"|"jwt"|"opaque",
 *   scope: string|null,           // JWT `scope` claim when present ("mapkit_js")
 *   issuedAt: string|null,        // ISO, from `iat`
 *   expiresAt: string|null,       // ISO, from `exp`; null = no expiry claim
 *   nonExpiring: boolean,         // configured and carries no `exp`
 *   expired: boolean,             // `exp` is in the past (never true for opaque)
 *   daysLeft: number|null,        // whole days until `exp`, may be negative
 *   originRestricted: boolean,    // JWT carries an `origin` claim
 *   origins: string[],            // parsed `origin` claim (comma-separated), [] when none
 * }}
 */
export function describeAppleMapsToken(token, now = Date.now()) {
  const value = typeof token === "string" ? token.trim() : "";
  const base = {
    configured: false,
    format: "missing",
    scope: null,
    issuedAt: null,
    expiresAt: null,
    nonExpiring: false,
    expired: false,
    daysLeft: null,
    originRestricted: false,
    origins: [],
  };
  if (!value) return base;
  if (PLACEHOLDER_RX.test(value)) return { ...base, format: "placeholder" };

  const parts = value.split(".");
  const header = parts.length === 3 ? decodeSegment(parts[0]) : null;
  const payload = parts.length === 3 ? decodeSegment(parts[1]) : null;
  if (!header || !payload || typeof header.alg !== "string") {
    // A value we cannot read is still a configured value: the portal's
    // non-expiring token format is Apple's to change. We report it as opaque
    // and let the RENDER assertion in the synthetic monitor be the judge.
    return { ...base, configured: true, format: "opaque" };
  }

  const exp = Number.isFinite(payload.exp) ? Number(payload.exp) : null;
  const iat = Number.isFinite(payload.iat) ? Number(payload.iat) : null;
  const nowSec = Math.floor(Number(now) / 1000);
  const originRaw = typeof payload.origin === "string" ? payload.origin : "";
  const origins = originRaw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    configured: true,
    format: "jwt",
    scope: typeof payload.scope === "string" ? payload.scope : null,
    issuedAt: iat != null ? new Date(iat * 1000).toISOString() : null,
    expiresAt: exp != null ? new Date(exp * 1000).toISOString() : null,
    nonExpiring: exp == null,
    expired: exp != null && exp <= nowSec,
    daysLeft: exp != null ? Math.floor((exp - nowSec) / 86400) : null,
    originRestricted: origins.length > 0,
    origins,
  };
}

/**
 * The one verdict the map surface needs before it spends a script load:
 * "is there any point trying?" True for a configured token that is not
 * known to be expired. An opaque token is usable until Apple says otherwise.
 */
export function appleMapsTokenUsable(token, now = Date.now()) {
  const d = describeAppleMapsToken(token, now);
  return d.configured && !d.expired;
}

/**
 * Health verdict for the production surface. `ok` is the hard line (the map
 * can render today); `warning` is the early alarm (it will stop within
 * APPLE_MAPS_TOKEN_WARN_DAYS). The synthetic monitor fails on either, on a
 * clock, so a token minted from the portal's 7-day form can never again reach
 * its expiry unnoticed.
 */
export function appleMapsTokenHealth(token, now = Date.now()) {
  const d = describeAppleMapsToken(token, now);
  const ok = d.configured && !d.expired;
  const warning = ok && d.daysLeft != null && d.daysLeft < APPLE_MAPS_TOKEN_WARN_DAYS;
  let reason = null;
  if (!d.configured) reason = d.format === "placeholder" ? "placeholder token" : "not configured";
  else if (d.expired) reason = "token expired";
  else if (warning) reason = `token expires in ${d.daysLeft} day(s); install a non-expiring, domain-restricted token`;
  return { ok, warning, reason, ...d };
}
