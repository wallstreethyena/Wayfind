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
// THAT IS HISTORY. The permanent token was installed on 2026-09-08 and is
// what production ships today. Verified 2026-09-10 by decoding the token out
// of the chunk a reader's browser actually downloads
// (/_next/static/chunks/797.*.js on a real /florida-events/... page), not
// merely out of the health endpoint:
//
//     scope "mapkit_js" · iat 2026-09-08T20:15:04Z · NO exp · origin
//     "www.gowayfind.com"
//
// The apex 308-redirects to www (`curl -I https://gowayfind.com/...` ->
// `location: https://www.gowayfind.com/...`), so a www-only origin claim
// covers every reader, and the Capacitor WebView loads the same www origin.
//
// Read the paragraph above before reporting that this key is expiring. The
// stale version of this comment is exactly what produced one such false
// report on 2026-09-10.
//
// This module is the one place that reads the token's SHAPE. It never
// verifies the signature (that is Apple's job, and the browser's) and it
// never needs a secret: a MapKit JS token is public by design — it ships in
// the client bundle. It answers three questions the rest of the app needs:
//
//   1. Is anything configured at all?               -> `configured`
//   2. Is it a JWT we can read a lifetime from?      -> `format`, `expiresAt`
//   3. Is it dead, dying, or merely temporary?       -> `expired`, `daysLeft`,
//                                                       `temporary`
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

/**
 * Days of runway below which an expiring token's warning reads as URGENT.
 * It is NOT the line between warning and no warning: any expiry at all is a
 * warning (see `appleMapsTokenHealth`). This only escalates the reason text.
 */
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
 *   temporary: boolean,           // a READABLE token that carries an `exp` at
 *                                 // all. Never true for `opaque`: a format we
 *                                 // cannot read is not evidence of an expiry.
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
    temporary: false,
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
    temporary: exp != null,
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
 * can render today); `warning` is the alarm that something will stop working
 * on a clock. The synthetic monitor fails on either, every 30 minutes.
 *
 * 2026-09-10. `warning` fires on ANY expiry, not only inside
 * APPLE_MAPS_TOKEN_WARN_DAYS. The owner's rule is on the record twice —
 * "switch to Apple Maps permanently, not temporarily" — and the 14-day window
 * alone cannot enforce it: a one-year testing token would sit green for 351
 * days and then page, which is the same silent-failure-on-a-clock shape this
 * module exists to end, just slower. A temporary token is therefore a defect
 * the half hour it is installed, and the WARN_DAYS threshold now only decides
 * how urgent the reason text reads.
 *
 * An `opaque` token never warns: Apple's token format is Apple's to change,
 * and a value we cannot parse is not evidence of an expiry. The monitor's
 * RENDER assertion is the judge there.
 */
export function appleMapsTokenHealth(token, now = Date.now()) {
  const d = describeAppleMapsToken(token, now);
  const ok = d.configured && !d.expired;
  const warning = ok && d.temporary;
  const urgent = warning && d.daysLeft != null && d.daysLeft < APPLE_MAPS_TOKEN_WARN_DAYS;
  let reason = null;
  if (!d.configured) reason = d.format === "placeholder" ? "placeholder token" : "not configured";
  else if (d.expired) reason = "token expired";
  else if (urgent) reason = `token expires in ${d.daysLeft} day(s); install a non-expiring, domain-restricted token`;
  else if (warning) reason = `token is temporary (expires ${d.expiresAt}, ${d.daysLeft} day(s) left); production must hold a non-expiring, domain-restricted token`;
  return { ok, warning, urgent, reason, ...d };
}

/**
 * THE PRODUCTION CONTRACT for the Apple Maps token, as a list of checked
 * invariants rather than prose.
 *
 * 2026-09-10. This exists so the synthetic monitor and the guard suite judge
 * the token by the SAME code path instead of two hand-written copies that can
 * drift — CLAUDE.md's "assert on the CALL, not the string". The monitor feeds
 * it the live /api/health/apple-maps body and turns each entry into one
 * assertion; scripts/check-event-where.mjs feeds it fixture tokens and can
 * therefore red-prove every entry without a browser or a network.
 *
 * `health` is an `appleMapsTokenHealth()` verdict, or the JSON body of
 * /api/health/apple-maps, which carries the same fields.
 *
 * @param {Record<string, unknown>} health
 * @returns {{ id: string, label: string, pass: boolean, expected: string, actual: string }[]}
 */
export function appleMapsTokenContract(health) {
  const h = health && typeof health === "object" ? health : {};
  const origins = Array.isArray(h.origins) ? h.origins : [];
  return [
    {
      id: "configured",
      label: "a MapKit token is configured on production",
      pass: h.configured === true,
      expected: "configured",
      actual: `configured=${h.configured} format=${h.format}`,
    },
    {
      id: "not-expired",
      label: "the token is not expired",
      pass: h.expired === false,
      expected: "not expired",
      actual: `expired=${h.expired} expiresAt=${h.expiresAt || "none"}`,
    },
    {
      id: "no-warning",
      label: "the token carries no warning (install a non-expiring, domain-restricted token)",
      pass: h.ok === true && h.warning !== true,
      expected: "ok, no warning",
      actual: `ok=${h.ok} warning=${h.warning} reason=${h.reason || "none"}`,
    },
    {
      // `temporary`, not `!nonExpiring`: an `opaque` token whose format Apple
      // changed under us reports neither, and must not fail here. The render
      // assertions are the judge in that case.
      id: "permanent",
      label: 'the token is PERMANENT, not a testing token on a clock (owner: "permanently, not temporarily")',
      pass: h.temporary !== true,
      expected: "no expiry claim",
      actual: h.temporary === true ? `expires ${h.expiresAt} (${h.daysLeft} day(s) left)` : `nonExpiring=${h.nonExpiring} format=${h.format}`,
    },
    {
      // An unrestricted token is lift-and-reuse: it ships in a public bundle,
      // so any third party can point their own site at Wayfind's Apple quota.
      id: "domain-locked",
      label: "the token is locked to Wayfind's own domains",
      pass: h.format !== "jwt" || h.originRestricted === true,
      expected: "an origin claim",
      actual: `format=${h.format} origins=${JSON.stringify(origins)}`,
    },
  ];
}

/** Contract entries that are currently violated. Empty array = healthy. */
export function appleMapsTokenContractViolations(health) {
  return appleMapsTokenContract(health).filter((c) => !c.pass);
}
