// lib/redirectGuard.js — the ONE request gate every partner /go route runs
// before it can hand a visitor to a partner.
//
// WHY A SHARED GATE (2026-10-22 diagnosis, PostHog project 507756, Oct 13→22,
// owner excluded). provider_redirect_started read 2,402 while
// commerce_cta_clicked read 56. Only 19 redirects (0.8%) carried a click_id
// that any on-site click had minted. 1,438 of them (60%) came from three /16
// prefixes: 43.173/16 + 43.172/16 (SG, 728 distinct IPs, rotating old
// Windows Chrome versions 103–135) and 140.248/16 (US, 125 IPs, a single
// "Chrome/129 Macintosh" UA, Oct 18 onward). 99% arrived without a PostHog
// cookie. Repeats of the same ip+offer within 60 s: 5 of 2,402 — this is not
// prefetch or retry, it is a distributed crawler walking each SSR href once.
// lib/crawler.js's BOT_UA (self-identified bots only, a deliberate product
// decision) cannot see any of it, because every UA claims to be a browser.
//
// WHAT THIS MODULE DOES. It classifies one request from headers the server
// already has, and returns either "pass" (the route continues exactly as
// before) or "refuse" (the route answers with a non-partner response built
// here — never a Location to a partner). Every route stamps the
// classification on its own redirect events, so the next diagnosis can be
// made from data instead of inference: today's events carry UA and IP only,
// which is why most classes below start in OBSERVE.
//
// CLASSES (exact; also stamped as `classification` on every redirect event):
//   self_identified_bot  lib/crawler.isCrawler(UA)           REFUSED ALWAYS
//   head_request         method HEAD (not a navigation)      REFUSED ALWAYS
//   prefetch             Purpose / Sec-Purpose / X-Purpose / X-Moz: prefetch
//                        (speculative, not a click)          REFUSED ALWAYS
//   suspect              >=1 STRONG signal below             OBSERVE by default;
//                                                            REFUSED only when
//                                                            WF_REDIRECT_GUARD_MODE=refuse
//   likely_human         no strong signal                    never refused
//   synthetic_monitor    our own CI monitor (lib/crawler.isSyntheticMonitor)
//                        exempt from soft signals: its node fetch sends
//                        Sec-Fetch-Mode: cors and its book-links scenario
//                        needs a REAL partner Location.     never refused
//
// STRONG signals (each alone makes a request `suspect`):
//   fetch_mode_not_navigate  Sec-Fetch-Mode present and not "navigate" — a
//                            link click is always a navigation; cors/no-cors
//                            is a fetch()/XHR/subresource load.
//   fetch_dest_not_document  Sec-Fetch-Dest present and not document/iframe.
//   chrome_ua_no_sec_fetch   UA claims desktop/Android Chrome >= 80 but sends no
//                            Sec-Fetch-* at all. Real Chrome has sent them on
//                            every request since M80; a script that borrowed a
//                            Chrome UA does not.
//   no_accept_language       every real browser navigation sends it.
//   ip_burst                 per-IP token bucket exhausted (see below).
// WEAK signals (recorded in suspect_reason, never refuse on their own —
// legitimate humans produce each of them):
//   no_referer (links carry rel=noreferrer), offsite_referer (shared links,
//   Instagram), fetch_site_none (typed/pasted/bookmark), fetch_site_cross_site,
//   no_fetch_user (Chrome navigation without user activation — page.goto()),
//   no_click_id (the page's click beacon did not run), no_sec_fetch (non-
//   Chrome UA without Sec-Fetch-*).
//
// WHY NOT A SIGNED CLICK TOKEN (evaluated, not enforced). The click_id is
// minted in the browser at click time (lib/commerce.mintClickId via
// CommerceClickBeacon / the owning component), so a server-signed token would
// need a round trip before navigation, and every SSR, no-JS, shared, emailed,
// bookmarked or Instagram link would fail it — that breaks share/SEO links,
// which the brief rules out. The absence of a client click_id is recorded as
// the weak signal no_click_id instead; it is the best "came from a rendered
// CTA" evidence available without a token.
//
// THE TOKEN BUCKET IS PER-INSTANCE, BEST EFFORT. It lives in this module's
// memory: each serverless instance has its own, a cold start empties it, and a
// crawler that rotates IPs (the measured one does: ~1 request per IP) never
// trips it. It exists for the cheap case — one IP hammering one instance — and
// is bounded (BUCKET_MAX_KEYS, oldest evicted) so it can never grow without
// limit. Real rate limiting belongs at the edge (middleware.js apiGuard, or a
// Vercel Firewall rule — an owner decision).
//
// NO COUNTRY BLOCKING. Geography is never an input here.
import { isCrawler, isSyntheticMonitor } from "./crawler.js";

export const GUARD_MODE_ENV = "WF_REDIRECT_GUARD_MODE";
export const GUARD_MODES = Object.freeze(["observe", "refuse"]);

// Classes refused regardless of mode, and the class refused only in "refuse".
export const ALWAYS_REFUSED = Object.freeze(["self_identified_bot", "head_request", "prefetch"]);
export const MODE_REFUSED = Object.freeze(["suspect"]);

export const STRONG_SIGNALS = Object.freeze([
  "fetch_mode_not_navigate", "fetch_dest_not_document", "chrome_ua_no_sec_fetch",
  "no_accept_language", "ip_burst",
]);

// Every redirect response — refused or not — tells indexers to stay out.
export const ROBOTS_HEADER = Object.freeze({ "X-Robots-Tag": "noindex, nofollow" });

let warnedInvalidMode = null;

/**
 * The configured mode, read at CALL time (bracket access: Next would inline a
 * dot-access read at build). Absent → "observe", the documented default, and
 * stamped on every event as guard_mode so the running mode is always visible
 * in data. A value that is SET but not recognised is an operator error: it is
 * logged loudly and reported as "observe-invalid", never silently treated as a
 * valid choice.
 */
export function guardMode() {
  const raw = String(process.env[GUARD_MODE_ENV] ?? "").trim().toLowerCase();
  if (!raw) return "observe";
  if (GUARD_MODES.includes(raw)) return raw;
  if (warnedInvalidMode !== raw) {
    warnedInvalidMode = raw;
    try { console.error(JSON.stringify({ tag: "redirect_guard_invalid_mode", env: GUARD_MODE_ENV, value: raw.slice(0, 40), acting_as: "observe" })); } catch {}
  }
  return "observe-invalid";
}

/* ── per-IP token bucket (per instance, best effort — see header) ─────────── */
export const BUCKET_CAPACITY = 12;          // burst a human never reaches on /go
export const BUCKET_REFILL_PER_SEC = 0.2;   // 12/min sustained
export const BUCKET_MAX_KEYS = 5000;
const buckets = new Map();

/** Take one token for `key`. Returns false when the bucket is empty. */
export function takeToken(key, nowMs = Date.now()) {
  if (!key) return true;
  let b = buckets.get(key);
  if (b) {
    buckets.delete(key); // re-insert below: Map order doubles as LRU order
    const refill = ((nowMs - b.t) / 1000) * BUCKET_REFILL_PER_SEC;
    b = { tokens: Math.min(BUCKET_CAPACITY, b.tokens + Math.max(0, refill)), t: nowMs };
  } else {
    b = { tokens: BUCKET_CAPACITY, t: nowMs };
  }
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  while (buckets.size > BUCKET_MAX_KEYS) buckets.delete(buckets.keys().next().value);
  return allowed;
}
export function _resetBuckets() { buckets.clear(); }
export function _bucketSize() { return buckets.size; }

/* ── header helpers ───────────────────────────────────────────────────────── */
function h(req, name) {
  try {
    const v = req && req.headers && typeof req.headers.get === "function" ? req.headers.get(name) : null;
    return v == null ? "" : String(v).trim();
  } catch { return ""; }
}

export function clientIp(req) {
  const real = h(req, "x-real-ip");
  if (real) return real.slice(0, 64);
  const xff = h(req, "x-forwarded-for");
  return xff ? xff.split(",")[0].trim().slice(0, 64) : "";
}

const OWN_HOSTS = new Set(["gowayfind.com", "www.gowayfind.com"]);
function isOwnHost(host, req) {
  const hh = String(host || "").toLowerCase();
  if (OWN_HOSTS.has(hh)) return true;
  try { return hh === new URL(req.url).hostname.toLowerCase(); } catch { return false; }
}

const PREFETCH_RE = /\bprefetch\b|\bprerender\b/i;
function isPrefetch(req) {
  return PREFETCH_RE.test(h(req, "sec-purpose")) || PREFETCH_RE.test(h(req, "purpose"))
    || PREFETCH_RE.test(h(req, "x-purpose")) || /^prefetch$/i.test(h(req, "x-moz"))
    || /^preview$/i.test(h(req, "x-purpose"));
}

// Desktop / Android Chrome-family (Chrome, Edge, Opera, Brave all carry
// "Chrome/N"), never iOS (CriOS / EdgiOS run on WebKit and follow Safari).
function chromeMajor(ua) {
  if (/\b(CriOS|EdgiOS|FxiOS)\//.test(ua) || /\b(iPhone|iPad|iPod)\b/.test(ua)) return 0;
  const m = ua.match(/\bChrome\/(\d+)\./);
  return m ? Number(m[1]) : 0;
}

/**
 * Classify one /go request. Pure apart from the token bucket (pass
 * `{ consumeToken: false }` to classify without spending one).
 *
 * @returns {{ classification: string, refuse: boolean, refuseReason: string|null,
 *            signals: string[], strong: string[], mode: string,
 *            eventProps: { classification: string, suspect_reason?: string, guard_mode: string } }}
 */
export function assessRedirectRequest(req, { clickId = null, nowMs = Date.now(), consumeToken = true } = {}) {
  const mode = guardMode();
  const ua = h(req, "user-agent");
  const method = String((req && req.method) || "GET").toUpperCase();
  const done = (classification, refuse, refuseReason, signals = [], strong = []) => {
    const eventProps = { classification, guard_mode: mode };
    if (signals.length) eventProps.suspect_reason = signals.join(",").slice(0, 120);
    return { classification, refuse, refuseReason, signals, strong, mode, eventProps };
  };

  // Order matters: a self-identified bot is a bot even when it sends HEAD.
  if (isCrawler(ua)) return done("self_identified_bot", true, "crawler-refused", ["bot_ua"]);
  if (method === "HEAD") return done("head_request", true, "head-request", ["head"]);
  if (isPrefetch(req)) return done("prefetch", true, "prefetch", ["prefetch"]);
  if (isSyntheticMonitor(ua)) return done("synthetic_monitor", false, null);

  const signals = [];
  const mode_ = h(req, "sec-fetch-mode").toLowerCase();
  const dest = h(req, "sec-fetch-dest").toLowerCase();
  const site = h(req, "sec-fetch-site").toLowerCase();
  const user = h(req, "sec-fetch-user");
  const anySecFetch = !!(mode_ || dest || site);
  const chrome = chromeMajor(ua);

  if (mode_ && mode_ !== "navigate") signals.push("fetch_mode_not_navigate");
  if (dest && dest !== "document" && dest !== "iframe") signals.push("fetch_dest_not_document");
  if (!anySecFetch && chrome >= 80) signals.push("chrome_ua_no_sec_fetch");
  if (!h(req, "accept-language")) signals.push("no_accept_language");
  if (consumeToken && !takeToken(clientIp(req), nowMs)) signals.push("ip_burst");

  // weak
  const ref = h(req, "referer");
  if (!ref) signals.push("no_referer");
  else {
    let host = "";
    try { host = new URL(ref).hostname; } catch {}
    if (!isOwnHost(host, req)) signals.push("offsite_referer");
  }
  if (site === "none") signals.push("fetch_site_none");
  else if (site === "cross-site") signals.push("fetch_site_cross_site");
  if (chrome >= 80 && mode_ === "navigate" && user !== "?1") signals.push("no_fetch_user");
  if (!anySecFetch && chrome < 80) signals.push("no_sec_fetch");
  if (!clickId) signals.push("no_click_id");

  const strong = signals.filter((s) => STRONG_SIGNALS.includes(s));
  if (strong.length) {
    const refuse = mode === "refuse";
    return done("suspect", refuse, refuse ? "suspect-refused" : null, signals, strong);
  }
  return done("likely_human", false, null, signals, strong);
}

/**
 * The response for a refused request. NEVER carries a partner Location:
 * `fallbackPath` is resolved against the request's own origin and, if it would
 * leave that origin, replaced by "/". Never cached (a cached refusal would be
 * served to the next human; a cached pass would be served to the next bot).
 *   HEAD     → 204, no Location
 *   prefetch → 503, no Location (Chrome discards a non-2xx prefetch, so the
 *              user's real click is fetched fresh and is not refused)
 *   else     → 302 to our own fallback page
 */
export function refusedResponse(req, assessment, fallbackPath = "/") {
  const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", ...ROBOTS_HEADER };
  if (assessment && assessment.classification === "head_request") return new Response(null, { status: 204, headers });
  if (assessment && assessment.classification === "prefetch") return new Response(null, { status: 503, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: sameOriginUrl(req, fallbackPath) } });
}

export function sameOriginUrl(req, path) {
  let base;
  try { base = new URL(req.url); } catch { base = new URL("https://www.gowayfind.com/"); }
  try {
    const u = new URL(String(path || "/"), base);
    if (u.origin === base.origin) return u.toString();
  } catch {}
  return new URL("/", base).toString();
}
