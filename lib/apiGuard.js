// lib/apiGuard.js — same-origin gate + best-effort per-IP rate limit for the PAID
// API routes. This is the code half of the cost-leak fix (the $735 Google Places
// incident): every paid proxy (/api/places/search, /api/fsq/search, and the
// Anthropic routes) was a public, unauthenticated endpoint any scraper could
// iterate with novel params to bill real money. Two independent layers, each
// designed to NEVER block a legitimate user:
//
//   1) SAME-ORIGIN GATE (stateless, reliable). Modern browsers send
//      `Sec-Fetch-Site: same-origin` on every same-origin fetch and curl/scrapers
//      do not — so we allow same-origin/same-site and reject the rest, with a
//      Referer/Origin fallback for older clients that predate Sec-Fetch-Site. An
//      optional `x-wf-internal` secret lets our OWN server-to-server (SSR) calls
//      through.
//   2) BEST-EFFORT PER-IP RATE LIMIT (in-memory, per-lambda). A soft cap on burst
//      abuse from one IP — NOT a hard guarantee (serverless lambdas are many and
//      cold-start often). The real hard backstop remains the owner's Google/
//      Anthropic daily QUOTA CAPS in the provider consoles.
//
// Returns the Web-standard Response so it's runtime-agnostic and unit-testable
// (scripts/test-api-guard.mjs) without importing next/server.

const SITE = /^https?:\/\/(www\.)?gowayfind\.com(?:[:/]|$)/i;

const hget = (h, k) =>
  (h && typeof h.get === "function" ? h.get(k) : h ? h[k] : null) || "";

// True for a legitimate same-origin browser fetch; false for curl/scraper/cross-site.
export function isSameOrigin(headers) {
  const sfs = String(hget(headers, "sec-fetch-site")).toLowerCase();
  if (sfs) return sfs === "same-origin" || sfs === "same-site"; // modern browsers: reliable
  // Older clients omit Sec-Fetch-Site — a same-origin GET still sends Referer, a
  // same-origin POST sends Origin. Trust those; reject when there is no signal at all.
  const ref = hget(headers, "referer") || hget(headers, "origin");
  return ref ? SITE.test(ref) : false;
}

// ── best-effort per-IP sliding window ────────────────────────────────────────
const HITS = new Map();
export const RL_LIMIT = 120; // generous: a real browsing session fires far fewer
export const RL_WINDOW_MS = 60_000;
const RL_MAX_KEYS = 8000; // memory cap for the counter map

export function rateLimitHit(ip, now) {
  if (!ip) return false; // unknown IP → don't rate-limit (the origin gate still applies)
  const t = typeof now === "number" ? now : Date.now();
  const arr = (HITS.get(ip) || []).filter((x) => t - x < RL_WINDOW_MS);
  arr.push(t);
  HITS.set(ip, arr);
  if (HITS.size > RL_MAX_KEYS) HITS.clear(); // crude flush; correctness over precision
  return arr.length > RL_LIMIT;
}

function clientIp(headers) {
  const xff = hget(headers, "x-forwarded-for");
  return (xff.split(",")[0] || hget(headers, "x-real-ip") || "").trim();
}

/**
 * Guard a PAID API route. Returns a Response to short-circuit, or null to proceed.
 * @param {Request} req
 * @param {object} [opts]  { internalSecret?: string } — if set and it matches the
 *   `x-wf-internal` header, the request bypasses both layers (our own SSR calls).
 *   { rateLimitOnly?: boolean } — skip the same-origin BLOCK, keep the per-IP rate
 *   limit. For GET-302 navigations (/api/eats/go): a same-origin 403 would break a
 *   legitimate click-through in browsers that strip both Sec-Fetch-Site AND Referer,
 *   so we cap burst abuse without risking the user's redirect.
 */
export function guardPaidRoute(req, opts = {}) {
  const h = req && req.headers;
  const deny = (status, error) =>
    new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
  if (opts.internalSecret) {
    const tok = hget(h, "x-wf-internal");
    if (tok && tok === opts.internalSecret) return null; // trusted internal caller
  }
  if (!opts.rateLimitOnly && !isSameOrigin(h)) return deny(403, "forbidden");
  if (rateLimitHit(clientIp(h))) return deny(429, "rate limited");
  return null;
}
