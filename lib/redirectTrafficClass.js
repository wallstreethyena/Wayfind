// lib/redirectTrafficClass.js — who is following an affiliate redirect?
//
// Shared by every go route under app/api (commerce, viator, hotels, ticketmaster).
// /api/eats/go has no route module in app/ today; if it returns it must call
// gateRedirectTraffic() too (scripts/check-redirect-traffic-class.mjs discovers
// go routes on disk and fails on one that does not).
//
// WHY (verified in PostHog by the lead, provider_redirect_started):
//  - 2026-10-21 12:08Z: five AWS Ashburn IPs (140.248.50.86/.96/.97/.108,
//    54.164.169.207) each fired 8-10 redirects across 8-10 DIFFERENT offers in
//    ~12 s, UA "Chrome/129.0" (no patch digits, a headless fingerprint).
//  - 2026-10-20: one Windows-Chrome actor swept every summer_picks_* rail.
//  - 2026-10-22 21:24-21:26Z: 52 redirects / 34 offers in 2 min from the
//    owner's own Claude-in-Chrome QA session.
//  - All $process_person_profile=false (no PostHog cookie). 10-21 had 466 US
//    redirects and 0 commerce_cta_clicked.
// Real browser UAs, so lib/crawler.js isCrawler() cannot see them. They are
// separable by OPT-IN (our own QA says so) and by BEHAVIOUR (burst).
//
// CLASSES
//   human     unchanged: real partner redirect, event traffic_class "human".
//   prefetch  204 + no-store. Must not count, must not reach a partner.
//   qa        302 to our own site, provider_redirect_refused, partner never resolved.
//   synthetic same as qa (burst detector, or a crawler UA if a caller asks).
//
// FAIL OPEN. Anything unreadable, missing or erroring classifies "human". A
// refused real customer costs more than a leaked bot click.
import { createHash } from "node:crypto";
import { isCrawler, isSyntheticMonitor } from "./crawler.js";
import { distinctIdFromCookies } from "./serverEvents.js";
import { sbEnv } from "./serverCache.js";

// BURST THRESHOLD. Evidence: each Ashburn IP touched 8-10 distinct offers in
// ~12 s; the owner's QA burst touched 34 in 2 min; a person browsing taps one
// or two partner links a minute. The 7th distinct offer inside the window from
// one IP+UA (no PostHog cookie) is refused, so the first 6 still pass.
export const BURST_DISTINCT_OFFERS = 6;
export const BURST_WINDOW_S = 60;
// Hot-path budget for the shared-state lookup; on timeout we fail open.
export const BURST_STATE_TIMEOUT_MS = 350;

const hget = (h, k) => {
  try { return h && typeof h.get === "function" ? String(h.get(k) || "").trim() : ""; } catch { return ""; }
};

function cookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// Sec-Fetch-Mode values a browser sends for anything that is NOT a top-level
// navigation (MDN Sec-Fetch-Mode). A link click or window.open is "navigate"
// (with Sec-Fetch-Dest "document"; iframe navigations are navigate/iframe and
// stay human). Missing header (Safari < 16.4, Node, curl) is NOT refused.
const NON_NAVIGATE_MODES = new Set(["cors", "no-cors", "same-origin", "websocket"]);

const NAVIGATION_DESTS = new Set(["document", "iframe", "frame", "fencedframe", "embed", "object"]);

export function prefetchReason(headers) {
  const purpose = (hget(headers, "sec-purpose") + " " + hget(headers, "purpose")).toLowerCase();
  if (/\b(prefetch|prerender)\b/.test(purpose)) return "purpose-prefetch";
  // Next.js router / middleware prefetches (2026-10-28).
  if (hget(headers, "next-router-prefetch") || hget(headers, "x-middleware-prefetch")) return "next-prefetch";
  // NODE'S fetch() (undici: our watchdog, canary, synthetic scripts) sends
  // "sec-fetch-mode: cors" with NO Sec-Fetch-Dest and NO Sec-Fetch-Site
  // (measured on node 22). A real browser sub-resource request always carries
  // Dest too (fetch()/XHR/prefetch = "empty"). So the mode rule needs BOTH, and
  // a lone mode header fails open to human.
  const mode = hget(headers, "sec-fetch-mode").toLowerCase();
  const dest = hget(headers, "sec-fetch-dest").toLowerCase();
  if (NON_NAVIGATE_MODES.has(mode) && dest && !NAVIGATION_DESTS.has(dest)) return "fetch-mode-" + mode;
  return null;
}

// ── 2026-10-28 additions (suspect / head / automation UA) ──────────────────
// The 10-21 Ashburn sweep's UA claimed desktop Chrome 129; the burst gate that
// would catch it by behaviour ships OFF. A real Chrome (>= 80) / Firefox (>= 90)
// sends Sec-Fetch-Site AND Sec-Fetch-Dest on every https navigation; Node's
// fetch sends only "sec-fetch-mode: cors" (measured, see prefetchReason), curl /
// python send none. So a modern-Chrome/Firefox CLAIM with neither Site nor Dest
// is a likely spoofed client, BUT ONLY when it also carries no first-party
// signal (same-site Referer or a cookie we set; see firstPartySignal). It gets
// a noindex Continue page, never a partner 302 and never a dead end; a person
// taps once (wf_confirm=1) and proceeds as human.
// NEVER suspect: in-app browsers (Instagram / Facebook / Pinterest / Android
// "; wv)" WebViews / Line / Snapchat / TikTok — real people, WebView header
// behaviour not ours to bet on), any iOS UA (Fetch Metadata only from 16.4),
// Safari, old versions, no UA at all.
const IN_APP_UA = /\bInstagram\b|\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\[Pinterest\/|; wv\)|\bLine\/|\bSnapchat\b|\bmusical_ly|\bBytedanceWebview|\bTikTok\b/i;
export function spoofedBrowserReason(headers, req) {
  const ua = hget(headers, "user-agent");
  if (!ua || IN_APP_UA.test(ua)) return null;
  if (/\b(?:iPhone|iPad|iPod)\b|CriOS\/|FxiOS\//.test(ua)) return null;
  const chrome = ua.match(/\b(?:Chrome|Edg|OPR)\/(\d+)/);
  const firefox = ua.match(/\bFirefox\/(\d+)/);
  if (!((chrome && Number(chrome[1]) >= 90) || (firefox && Number(firefox[1]) >= 95))) return null;
  if (hget(headers, "sec-fetch-site") || hget(headers, "sec-fetch-dest")) return null;
  // OWNER RULE (2026-10-29): missing Fetch Metadata ALONE never makes a visitor
  // a bot. Privacy extensions, corporate proxies and some embedded Chromiums
  // strip it. Suspect additionally requires NO first-party signal: no
  // same-site Referer and no cookie this site sets. The 10-21 sweep had
  // neither (cookieless, refererless; $process_person_profile=false).
  if (firstPartySignal(headers, req)) return null;
  return "no-fetch-metadata";
}

// Hosts whose Referer proves the click started on one of our own pages.
export const FIRST_PARTY_HOSTS = new Set(["gowayfind.com", "www.gowayfind.com"]);
// Cookies the site itself sets, so only a browser that already loaded a
// Wayfind page carries them:
//   ph_<projectKey>_posthog  posthog-js default persistence (localStorage+cookie,
//                            app/components/PostHogProvider.js init).
//   wf_*                     first-party cookies: wf_device (lib/deviceId.js),
//                            wf_rails_collapsed (lib/railCollapse.js),
//                            wf_lunch_reveal_v1 (lib/lunchReveal.js), wf_qa.
const FIRST_PARTY_COOKIE = /^(?:ph_[A-Za-z0-9_-]+_posthog|wf_[A-Za-z0-9_]+)$/;

/**
 * "first-party-referer" | "first-party-cookie" | null. A same-site Referer is
 * gowayfind.com / www.gowayfind.com, or the request's own host (preview
 * deployments, localhost) when the request URL is known.
 */
export function firstPartySignal(headers, req) {
  const ref = hget(headers, "referer");
  if (ref) {
    try {
      const host = new URL(ref).hostname.toLowerCase();
      let own = "";
      try { own = req && req.url ? new URL(req.url).hostname.toLowerCase() : ""; } catch {}
      if (FIRST_PARTY_HOSTS.has(host) || (own && host === own)) return "first-party-referer";
    } catch { /* unparseable Referer is not a signal */ }
  }
  for (const part of hget(headers, "cookie").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && FIRST_PARTY_COOKIE.test(part.slice(0, eq).trim()) && part.slice(eq + 1).trim()) return "first-party-cookie";
  }
  return null;
}

// Automated fetchers lib/crawler.js BOT_UA does not name: Meta's ads-review /
// external agents (appended to an otherwise in-app UA, "…[FBAN/FBIOS;…]
// meta-externalads/1.1", seen 2026-10-23) and the Vercel MCP fetch tool an
// agent session used on a live /go link (2026-10-22).
const AUTOMATION_UA = /meta-external(?:ads|agent|fetcher)|facebookcatalog|\bmcp fetch\b|vercel mcp/i;
export function automationUaReason(headers) {
  return AUTOMATION_UA.test(hget(headers, "user-agent")) ? "automation-ua" : null;
}

// ── partner-redirect cache policy (2026-10-29) ─────────────────────────────
// EVERY response from a /go route is per-request: private, no-store, and no
// CDN copy. A CDN-cached 302 (Viator used s-maxage=3600) is replayed by the
// edge to the next requester WITHOUT running this classifier, so a later bot,
// prefetch or HEAD-turned-GET would skip classification, emit nothing, and
// still reach the partner. CDN-Cache-Control / Vercel-CDN-Cache-Control are
// set too so no intermediate layer is allowed a copy either.
export const PARTNER_NO_STORE = "private, no-store, max-age=0";
export function noStoreHeaders(extra = {}) {
  return { "Cache-Control": PARTNER_NO_STORE, "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", ...extra };
}
/** Response.redirect() with the partner no-store policy (Response.redirect sets no Cache-Control). */
export function noStoreRedirect(location, status = 302, extra = {}) {
  return new Response(null, { status, headers: noStoreHeaders({ Location: String(location), ...extra }) });
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/**
 * Suspect interstitial: 200, noindex, no-store, NO partner URL in it — a GET
 * form back to this same route with the original params plus wf_confirm=1. A
 * crawler following hrefs never submits it; a person taps once.
 */
export function confirmInterstitial(req) {
  let action = "/";
  const fields = [];
  try {
    const u = new URL(req.url);
    action = u.pathname;
    for (const [k, v] of u.searchParams) if (k !== "wf_confirm") fields.push(`<input type="hidden" name="${escHtml(k)}" value="${escHtml(v)}">`);
  } catch {}
  fields.push('<input type="hidden" name="wf_confirm" value="1">');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Continue — Wayfind</title><style>body{margin:0;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#faf8f5;color:#1c1c1c;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{max-width:420px;text-align:center}button{font:inherit;font-weight:600;padding:12px 22px;border:0;border-radius:999px;background:#1c1c1c;color:#fff;cursor:pointer}a{color:inherit}</style></head><body><main><p>You're leaving Wayfind for our booking partner.</p><form method="get" action="${escHtml(action)}">${fields.join("")}<button type="submit">Continue</button></form><p><a href="/">Back to Wayfind</a></p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...noStoreHeaders(), "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
}

/** HEAD is never a click (link checkers, unfurlers): 204, no event. */
export function headResponse() {
  return new Response(null, { status: 204, headers: { ...noStoreHeaders(), "X-Robots-Tag": "noindex, nofollow" } });
}

export function qaReason(headers) {
  if (cookieValue(headers && headers.get && headers.get("cookie"), "wf_qa") === "1") return "qa-cookie";
  if (hget(headers, "x-wayfind-qa") === "1") return "qa-header";
  if (/WayfindQA\//i.test(hget(headers, "user-agent"))) return "qa-user-agent";
  return null;
}

export function clientIp(headers) {
  const xff = hget(headers, "x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : "") || hget(headers, "x-real-ip");
}

const sha = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 32);

// ── burst state ──────────────────────────────────────────────────────────
const MEM = new Map(); // keyHash -> Map(offerHash -> lastSeenMs)
const MEM_MAX_KEYS = 5000;
export function memoryBurstStore() {
  return {
    async record(keyHash, offerHash, nowMs, windowS) {
      const cutoff = nowMs - windowS * 1000;
      let offers = MEM.get(keyHash);
      if (!offers) {
        if (MEM.size >= MEM_MAX_KEYS) MEM.clear();
        offers = new Map();
        MEM.set(keyHash, offers);
      }
      offers.set(offerHash, nowMs);
      for (const [o, t] of offers) if (t < cutoff) offers.delete(o);
      return offers.size;
    },
  };
}
export function __resetMemoryBurstStore() { MEM.clear(); }

// Supabase RPC wf_redirect_burst_record (migration 20261027120000, NOT applied
// until the owner approves). Returns distinct offers in the window, or throws.
export function supabaseBurstStore() {
  return {
    async record(keyHash, offerHash, _nowMs, windowS) {
      const s = sbEnv();
      if (!s || !s.url || !s.key) throw new Error("no-supabase-env");
      const r = await fetch(`${s.url}/rest/v1/rpc/wf_redirect_burst_record`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(BURST_STATE_TIMEOUT_MS),
        headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" },
        body: JSON.stringify({ p_key: keyHash, p_offer: offerHash, p_window_s: windowS }),
      });
      if (!r.ok) throw new Error("rpc-" + r.status);
      const n = Number(await r.json());
      if (!Number.isFinite(n)) throw new Error("rpc-bad-body");
      return n;
    },
  };
}

async function burstCount(keyHash, offerHash, ctx) {
  const now = ctx.now ? ctx.now() : Date.now();
  const stores = ctx.burstStore ? [ctx.burstStore] : [supabaseBurstStore(), memoryBurstStore()];
  for (const st of stores) {
    try { return await st.record(keyHash, offerHash, now, BURST_WINDOW_S); } catch { /* next store, else fail open */ }
  }
  return null;
}

/**
 * @param {Request} req
 * @param {{offerKey?: string, env?: object, burstStore?: object, now?: ()=>number}} ctx
 * @returns {Promise<{klass: "human"|"synthetic"|"prefetch"|"qa"|"head"|"suspect", reason: string}>}
 */
export async function classifyRedirectRequest(req, ctx = {}) {
  try {
    const headers = req && req.headers;
    const ua = hget(headers, "user-agent");
    // (a) crawler UAs: routes keep their own earlier isCrawler() gate; here for completeness.
    if (isCrawler(ua)) return { klass: "synthetic", reason: "crawler-ua" };
    // Our synthetic monitor must keep a REAL partner redirect (its scenario asserts the Location).
    if (isSyntheticMonitor(ua)) return { klass: "human", reason: "synthetic-monitor-exempt" };
    // HEAD is never a click.
    if (String((req && req.method) || "GET").toUpperCase() === "HEAD") return { klass: "head", reason: "head-request" };
    // (b) prefetch / preview / non-navigation fetch
    const pf = prefetchReason(headers);
    if (pf) return { klass: "prefetch", reason: pf };
    const auto = automationUaReason(headers);
    if (auto) return { klass: "synthetic", reason: auto };
    // (c) QA opt-in
    const qa = qaReason(headers);
    if (qa) return { klass: "qa", reason: qa };
    // (c2) spoofed modern-browser claim (the 10-21 shape) unless the person tapped Continue
    const spoof = spoofedBrowserReason(headers, req);
    if (spoof) {
      let confirmed = false;
      try { confirmed = new URL(req.url).searchParams.get("wf_confirm") === "1"; } catch {}
      if (!confirmed) return { klass: "suspect", reason: spoof };
    }
    // (d) burst, flag-gated, cookie-less visitors only
    const env = ctx.env || process.env;
    if (String(env.REDIRECT_BURST_GATE || "").trim() === "1" && ctx.offerKey) {
      if (distinctIdFromCookies(hget(headers, "cookie"))) return { klass: "human", reason: "posthog-cookie" };
      const ip = clientIp(headers);
      if (ip) {
        const n = await burstCount(sha(ip + "|" + ua), sha(ctx.offerKey), ctx);
        if (n != null && n > BURST_DISTINCT_OFFERS) return { klass: "synthetic", reason: "burst-" + n + "-offers-" + BURST_WINDOW_S + "s" };
      }
    }
    return { klass: "human", reason: "default" };
  } catch {
    return { klass: "human", reason: "classifier-error-fail-open" };
  }
}

/**
 * One call per route. Returns { klass, reason, response }; response is non-null
 * when the caller must return it instead of redirecting to a partner.
 * emitRefused(extra) is invoked for qa/synthetic only.
 */
export async function gateRedirectTraffic(req, { offerKey, siteLocation, emitRefused, burstStore, env, now } = {}) {
  const t = await classifyRedirectRequest(req, { offerKey, burstStore, env, now });
  if (t.klass === "prefetch") {
    return { ...t, response: new Response(null, { status: 204, headers: { ...noStoreHeaders() } }) };
  }
  if (t.klass === "head") return { ...t, response: headResponse() };
  if (t.klass === "suspect") {
    try { if (emitRefused) emitRefused({ refusal_class: t.klass, refusal_reason: t.reason }); } catch {}
    return { ...t, response: confirmInterstitial(req) };
  }
  if (t.klass === "qa" || t.klass === "synthetic") {
    try { if (emitRefused) emitRefused({ refusal_class: t.klass, refusal_reason: t.reason }); } catch {}
    return {
      ...t,
      response: new Response(null, {
        status: 302,
        headers: { Location: siteLocation, ...noStoreHeaders(), "Referrer-Policy": "no-referrer" },
      }),
    };
  }
  return { ...t, response: null };
}
