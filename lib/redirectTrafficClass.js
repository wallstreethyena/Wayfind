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
 * @returns {Promise<{klass: "human"|"synthetic"|"prefetch"|"qa", reason: string}>}
 */
export async function classifyRedirectRequest(req, ctx = {}) {
  try {
    const headers = req && req.headers;
    const ua = hget(headers, "user-agent");
    // (a) crawler UAs: routes keep their own earlier isCrawler() gate; here for completeness.
    if (isCrawler(ua)) return { klass: "synthetic", reason: "crawler-ua" };
    // Our synthetic monitor must keep a REAL partner redirect (its scenario asserts the Location).
    if (isSyntheticMonitor(ua)) return { klass: "human", reason: "synthetic-monitor-exempt" };
    // (b) prefetch / preview / non-navigation fetch
    const pf = prefetchReason(headers);
    if (pf) return { klass: "prefetch", reason: pf };
    // (c) QA opt-in
    const qa = qaReason(headers);
    if (qa) return { klass: "qa", reason: qa };
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
    return { ...t, response: new Response(null, { status: 204, headers: { "Cache-Control": "no-store, max-age=0" } }) };
  }
  if (t.klass === "qa" || t.klass === "synthetic") {
    try { if (emitRefused) emitRefused({ refusal_class: t.klass, refusal_reason: t.reason }); } catch {}
    return {
      ...t,
      response: new Response(null, {
        status: 302,
        headers: { Location: siteLocation, "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
      }),
    };
  }
  return { ...t, response: null };
}
