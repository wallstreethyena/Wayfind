// lib/shareAttribution.js — share attribution schema v2 (cutover 2026-11-13).
//
// WHY THIS EXISTS. The v1 events could not answer "did one person's share
// bring in another real visitor?":
//   - share_open fired on ANY load carrying ?place=, ?rail=, a list or an
//     itinerary, including the app's own internal navigation. In the 30 days
//     before cutover ~8,557 of its place landings had www.gowayfind.com as the
//     referrer and only ~500 were direct. It counts deep-link landings, not
//     shares.
//   - share_return was a guess: "this device opened some shared card, and came
//     back 6h to 7d later". No sender, no link, no recipient.
// Both v1 events keep firing unchanged so history stays comparable with
// itself, and docs/SHARE_ATTRIBUTION.md marks them unsuitable for recipient
// attribution. Nothing below reads or reinterprets them.
//
// THE V2 CONTRACT (every event carries share_schema: 2):
//   share_opened      the sender deliberately opened sharing UI (intent sheet,
//                     or the chooser when no sheet preceded it). Once per flow.
//   share_attempted   the sender picked a method: sms | email | native | copy.
//   share_completed   the method handed off: clipboard_write (copy resolved),
//                     native_resolved (navigator.share resolved),
//                     native_bridge_shared (iOS shell reported "shared"),
//                     composer_handoff (sms:/mailto: composer opened). NONE of
//                     these prove a message was sent or delivered.
//   shared_link_visited          a browser opened a link carrying a valid
//                     share token it did not mint itself. First visit per token
//                     per browser only.
//   shared_recipient_converted   that browser then fired an existing
//                     conversion (CONVERSION_EVENTS) within ATTRIBUTION_WINDOW
//                     of its last attributed visit. Once per token per
//                     conversion type.
//
// PRIVACY. The token is 128 random bits, base64url, minted on the sender's
// device. It names nothing: no user id, email, name, account or auth token is
// put in the URL or derived from it. The sender's tokens are remembered on the
// sender's own device only, to exclude self-visits. Tokens are minted only
// when analytics would actually be recorded for this browser (not owner, QA,
// bot, opted out, or Global Privacy Control); otherwise the share works
// exactly as before with a plain URL.
//
// FAIL-OPEN. Every function here is wrapped: a storage error, a blocked
// analytics script or a missing crypto API can remove attribution, never the
// share itself.
import { captureOrQueue, analyticsSuppressionReason } from "./browserAnalytics.js";
import { isGroupPlanPath } from "./groupPlanPrivacy.js";

export const SHARE_SCHEMA = 2;
export const SHARE_SCHEMA_CUTOVER = "2026-11-13";
export const SHARE_TOKEN_PARAM = "wf_st";
export const ATTRIBUTION_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const CONVERSION_EVENTS = Object.freeze(["commerce_cta_clicked", "save"]);
export const SHARE_V2_EVENTS = Object.freeze({
  opened: "share_opened",
  attempted: "share_attempted",
  completed: "share_completed",
  visited: "shared_link_visited",
  converted: "shared_recipient_converted",
});
export const SHARE_METHODS = Object.freeze(["sms", "email", "native", "copy"]);
export const COMPLETION_TYPES = Object.freeze(["clipboard_write", "native_resolved", "native_bridge_shared", "composer_handoff"]);

const TOKEN_RX = /^[A-Za-z0-9_-]{22}$/;
const MINE_KEY = "wf_st_mine";    // tokens this browser minted (self-visit exclusion)
const SEEN_KEY = "wf_st_seen";    // tokens this browser already counted a visit for
const TOUCH_KEY = "wf_st_touch";  // last attributed visit { t, ts }
const CONV_KEY = "wf_st_conv";    // "<token>|<conversion>" already counted
const MAX_ENTRIES = 100;
const FLOW_TTL_MS = 10 * 60 * 1000;

// ── storage (never throws; falls back to in-memory for this page) ─────────
const memory = {};
function store(win) {
  try { const s = win && win.localStorage; if (s && typeof s.getItem === "function") return s; } catch (e) {}
  return null;
}
function readJson(win, key, fallback) {
  try {
    const s = store(win);
    const raw = s ? s.getItem(key) : memory[key];
    const v = raw ? JSON.parse(raw) : null;
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function writeJson(win, key, value) {
  const raw = JSON.stringify(value);
  try { const s = store(win); if (s) { s.setItem(key, raw); return; } } catch (e) {}
  memory[key] = raw;
}
function prune(map, now) {
  const entries = Object.entries(map || {}).filter(([, ts]) => Number.isFinite(ts) && now - ts < 30 * 86400000);
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

// ── consent / eligibility ─────────────────────────────────────────────────
// Attribution only where analytics would be recorded anyway. Declined means:
// suppressed session (owner, internal-marked browser, internal verifier, bot,
// webdriver, private group plan), PostHog opted out, or Global Privacy Control.
export function attributionAllowed(win) {
  try {
    if (!win) return false;
    if (win.__WF_ANALYTICS_SUPPRESSED) return false;
    const nav = win.navigator || {};
    if (nav.globalPrivacyControl === true) return false;
    try { if (win.posthog && typeof win.posthog.has_opted_out_capturing === "function" && win.posthog.has_opted_out_capturing()) return false; } catch (e) {}
    if (analyticsSuppressionReason({ storage: store(win), userAgent: nav.userAgent, webdriver: !!nav.webdriver })) return false;
    return true;
  } catch (e) { return false; }
}

export function isValidShareToken(t) { return typeof t === "string" && TOKEN_RX.test(t); }

export function mintShareToken(win) {
  try {
    const c = win && win.crypto;
    if (!c || typeof c.getRandomValues !== "function") return null; // no weak fallback
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    if (typeof win.btoa !== "function") return null;
    const b64 = win.btoa(bin);
    const t = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return isValidShareToken(t) ? t : null;
  } catch (e) { return null; }
}

// Add the token to a same-origin share URL; everything else in the URL
// (path, ?place, utm_*, click ids, hash) is preserved byte-for-byte except
// that an existing wf_st is replaced. Private group plan links never carry one.
export function withShareToken(url, token) {
  if (!url || !isValidShareToken(token)) return url;
  try {
    const u = new URL(url);
    if (isGroupPlanPath(u.pathname)) return url;
    u.searchParams.set(SHARE_TOKEN_PARAM, token);
    return u.toString();
  } catch (e) { return url; }
}

function capture(win, event, props) {
  try { return captureOrQueue(win, event, { ...(props || {}), share_schema: SHARE_SCHEMA }); } catch (e) { return false; }
}

// ── sender side ───────────────────────────────────────────────────────────
// One flow = one deliberate opening of sharing UI = one token. The intent
// sheet begins it; shareOut joins a fresh unjoined flow or begins its own.
let activeFlow = null;

export function beginShareFlow(win, { surface = "chooser", kind = "" } = {}) {
  const flow = { token: null, surface, kind: String(kind || "").slice(0, 40), at: Date.now(), joined: false };
  try {
    if (attributionAllowed(win)) {
      flow.token = mintShareToken(win);
      if (flow.token) {
        const mine = prune(readJson(win, MINE_KEY, {}), flow.at);
        mine[flow.token] = flow.at;
        writeJson(win, MINE_KEY, mine);
      }
    }
    capture(win, SHARE_V2_EVENTS.opened, { surface: flow.surface, kind: flow.kind || null, share_token: flow.token, tokenized: !!flow.token });
  } catch (e) {}
  activeFlow = flow;
  return flow;
}

// shareOut calls this. A flow begun by the intent sheet in the last few
// minutes and not yet joined is THIS share; anything else starts a new flow.
export function joinOrBeginShareFlow(win, opts = {}) {
  const now = Date.now();
  // A private group plan link is never the place/list the sheet opened for
  // (the sheet's Group Vote choice navigates away first), so it never joins.
  const fresh = !!(opts.url && isGroupPlanPath(opts.url));
  if (!fresh && activeFlow && !activeFlow.joined && now - activeFlow.at < FLOW_TTL_MS) {
    activeFlow.joined = true;
    return activeFlow;
  }
  const f = beginShareFlow(win, { surface: opts.surface || "chooser", kind: opts.kind || "" });
  f.joined = true;
  return f;
}

export function noteShareAttempted(win, flow, method) {
  if (!SHARE_METHODS.includes(method)) return;
  capture(win, SHARE_V2_EVENTS.attempted, { method, surface: flow && flow.surface, kind: (flow && flow.kind) || null, share_token: (flow && flow.token) || null });
}

export function noteShareCompleted(win, flow, method, completionType) {
  if (!SHARE_METHODS.includes(method) || !COMPLETION_TYPES.includes(completionType)) return;
  if (flow) {
    flow.completed = flow.completed || {};
    if (flow.completed[method + ":" + completionType]) return; // one per method per flow
    flow.completed[method + ":" + completionType] = true;
  }
  capture(win, SHARE_V2_EVENTS.completed, { method, completion_type: completionType, surface: flow && flow.surface, kind: (flow && flow.kind) || null, share_token: (flow && flow.token) || null });
}

// ── recipient side ────────────────────────────────────────────────────────
// Called once per full page load, before anything else reads the URL. Reads
// wf_st, removes it from the address bar (so refresh, back/forward and a
// recipient copying the address bar cannot recount or re-forward it), and
// records at most one visit per token per browser.
//
// Returns a reason string for tests: "visited" | "none" | "invalid" |
// "self" | "duplicate" | "declined" | "redirect_page".
export function captureSharedLinkVisit(win, { now = Date.now() } = {}) {
  try {
    if (!win || !win.location) return "none";
    const url = new URL(win.location.href);
    const raw = url.searchParams.get(SHARE_TOKEN_PARAM);
    if (raw == null) return "none";
    // /s/<code> is a 50ms client redirect page: leave the token for the
    // destination (lib/preserveRedirectParams carries it) and count there.
    if (/^\/s\//.test(url.pathname)) return "redirect_page";
    url.searchParams.delete(SHARE_TOKEN_PARAM);
    try { win.history.replaceState(win.history.state, "", url.pathname + (url.search || "") + (url.hash || "")); } catch (e) {}
    if (!isValidShareToken(raw)) return "invalid";
    if (!attributionAllowed(win)) return "declined";
    const mine = readJson(win, MINE_KEY, {});
    if (mine && mine[raw]) return "self";
    const seen = prune(readJson(win, SEEN_KEY, {}), now);
    if (seen[raw]) return "duplicate";
    seen[raw] = now;
    writeJson(win, SEEN_KEY, seen);
    writeJson(win, TOUCH_KEY, { t: raw, ts: now });
    capture(win, SHARE_V2_EVENTS.visited, { share_token: raw, landing_path: landingKind(url.pathname), dedupe_rule: "first_per_token_per_browser" });
    return "visited";
  } catch (e) { return "none"; }
}

function landingKind(pathname) {
  if (/^\/p\//.test(pathname)) return "place";
  if (/^\/l\//.test(pathname)) return "list";
  if (/^\/guides\//.test(pathname)) return "guide";
  if (/^\/florida-events\/|^\/events\//.test(pathname)) return "event";
  if (pathname === "/") return "home";
  return "page";
}

// Conversion hook, run by captureOrQueue after it accepted a real event.
// Last touch wins; the window is measured from that visit, not the first.
export function noteSharedConversion(win, event, { now = Date.now() } = {}) {
  try {
    if (!CONVERSION_EVENTS.includes(event)) return false;
    const touch = readJson(win, TOUCH_KEY, null);
    if (!touch || !isValidShareToken(touch.t) || !Number.isFinite(touch.ts)) return false;
    const age = now - touch.ts;
    if (age < 0 || age > ATTRIBUTION_WINDOW_MS) return false;
    const done = prune(readJson(win, CONV_KEY, {}), now);
    const k = touch.t + "|" + event;
    if (done[k]) return false;
    done[k] = now;
    writeJson(win, CONV_KEY, done);
    capture(win, SHARE_V2_EVENTS.converted, { share_token: touch.t, conversion: event, minutes_since_visit: Math.round(age / 60000), attribution: "last_touch", window_days: 7 });
    return true;
  } catch (e) { return false; }
}

export function installSharedConversionHook(win) {
  try { if (win) win.__WF_SHARE_CONVERSION_HOOK = (event) => noteSharedConversion(win, event); } catch (e) {}
}

// Test seam only.
export function __resetShareAttributionForTests() { activeFlow = null; for (const k of Object.keys(memory)) delete memory[k]; }
