// lib/campaignAttribution.js — first-party campaign attribution, the test-traffic
// marker, and the Meta "OutboundTicketClick" custom signal (2026-10-29).
//
// ROOT CAUSE THIS FIXES (see the PR): PostHog is booted at idle (up to 4 s) after
// an async Supabase getSession(), and it reads the landing URL's campaign params
// at that moment. Nothing captured fbclid / ttclid / utm_* at landing time
// (lib/attribution.js only knew gclid/gbraid/wbraid + utm and is wired to the
// Google tags), and PostHog's own copy of them is dropped for anonymous
// visitors ("identified_only" => no $set_once / $initial_* props). So the
// moment a client navigation or a slow boot changed the URL, the campaign was
// gone for good. We now capture synchronously on the first client effect, store
// it first-party, and register it on every event.
//
// WHAT IS STORED: the eight allow-listed campaign params (short, token-ish, never
// email-shaped), the landing PATH (no query), and the referrer HOST. Nothing
// else from the URL. Never copied onto an external seller URL: this module
// builds no hrefs at all.
//
// NO imports except browserAnalytics (pure, dependency free) so every function
// below is callable from a plain-Node test with injected storage.
import { safePagePath, safeReferrerDomain } from "./browserAnalytics.js";

export const CAMPAIGN_KEYS = Object.freeze([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "ttclid",
]);
export const CLICK_ID_KEYS = Object.freeze(["fbclid", "gclid", "ttclid"]);
export const FIRST_TOUCH_KEY = "wf_ft_v1";       // localStorage, 90 days
export const SESSION_KEY = "wf_sess_attr_v1";    // sessionStorage
export const TEST_KEY = "wf_test_v1";            // sessionStorage
export const META_TEST_KEY = "wf_meta_test_v1";  // sessionStorage
export const FIRST_TOUCH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const META_OUTBOUND_EVENT = "OutboundTicketClick";
export const DOUBLE_ACTIVATION_MS = 1000;
// Sellers whose outbound click is a TICKET (event, attraction, tour, pass).
// Coupons (clipp), stays (stay22, vrbo, booking), food delivery, transfers,
// storage and deals are outbound clicks but not tickets: no OutboundTicketClick.
export const TICKET_PROVIDERS = Object.freeze([
  "tiqets", "viator", "undercover_tourist", "klook", "ticketnetwork", "ticketmaster",
  "ticketsmarter", "awin_usghostadventures", "organizer", "citypass", "getyourguide", "seatgeek",
]);
export function isTicketClick(payload) {
  return !!payload && TICKET_PROVIDERS.includes(String(payload.provider || ""));
}

const MAX_LEN = 200;
function cleanValue(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > MAX_LEN || s.indexOf("@") >= 0 || /[\r\n\t<>"]/.test(s)) return null;
  return s;
}
const TEST_LABEL_RX = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
const META_CODE_RX = /^[A-Za-z0-9_-]{3,40}$/;
const OFF_RX = /^(off|0|false|none|clear)$/i;

const jget = (s, k) => { try { const r = s && s.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const jset = (s, k, v) => { try { if (s) s.setItem(k, JSON.stringify(v)); } catch (e) {} };
const sget = (s, k) => { try { return (s && s.getItem(k)) || null; } catch (e) { return null; } };
const sset = (s, k, v) => { try { if (s) s.setItem(k, v); } catch (e) {} };
const sdel = (s, k) => { try { if (s) s.removeItem(k); } catch (e) {} };

/** Pure: the allow-listed params from a query string. */
export function parseCampaign(search) {
  const out = {};
  const raw = typeof search === "string" ? search : "";
  if (!raw) return out;
  let q;
  try { q = new URLSearchParams(raw.charAt(0) === "?" ? raw.slice(1) : raw); } catch (e) { return out; }
  for (const k of CAMPAIGN_KEYS) { const v = cleanValue(q.get(k)); if (v) out[k] = v; }
  return out;
}

function cleanParams(p) {
  const out = {};
  if (p && typeof p === "object") for (const k of CAMPAIGN_KEYS) { const v = cleanValue(p[k]); if (v) out[k] = v; }
  return out;
}
const has = (p) => !!p && CAMPAIGN_KEYS.some((k) => !!p[k]);

function readRecord(raw, now, ttl) {
  if (!raw || typeof raw !== "object") return null;
  if (ttl && (!Number.isFinite(raw.exp) || now > raw.exp)) return null;
  const ct = typeof raw.ct === "string" && CLICK_ID_KEYS.includes(raw.ct) ? raw.ct : (CLICK_ID_KEYS.find((k) => raw.p && raw.p[k]) || "");
  return { p: cleanParams(raw.p), ct, lp: typeof raw.lp === "string" ? raw.lp.slice(0, 200) : "", rd: typeof raw.rd === "string" ? raw.rd.slice(0, 120) : "", at: typeof raw.at === "string" ? raw.at : "" };
}

/** Read everything. `local` / `session` are Storage-like; both optional. */
export function readState({ local, session, now = Date.now() } = {}) {
  const test = sget(session, TEST_KEY);
  const meta = sget(session, META_TEST_KEY);
  return {
    ft: readRecord(jget(local, FIRST_TOUCH_KEY), now, true),
    sess: readRecord(jget(session, SESSION_KEY), now, false),
    test: test && TEST_LABEL_RX.test(test) ? test : null,
    metaTest: meta && META_CODE_RX.test(meta) ? meta : null,
  };
}

/**
 * Capture on landing. Call once, synchronously, from the first client effect.
 *  - first touch: stored once per 90 days. A visit with NO campaign never blocks
 *    the first CAMPAIGN touch (it is upgraded once); after that it is immutable.
 *  - session: per tab session; a new landing carrying campaign params overwrites.
 *  - wf_test=<label> / wf_meta_test=<code> are stored for the session
 *    (`off` clears).
 */
export function captureLanding({ search, pathname, referrer, local, session, now = Date.now() } = {}) {
  let q = null;
  try { q = new URLSearchParams((search || "").charAt(0) === "?" ? search.slice(1) : search || ""); } catch (e) {}
  if (q) {
    const t = q.get("wf_test");
    if (t != null) { if (OFF_RX.test(t.trim())) sdel(session, TEST_KEY); else if (TEST_LABEL_RX.test(t.trim())) sset(session, TEST_KEY, t.trim()); }
    const m = q.get("wf_meta_test");
    if (m != null) { if (OFF_RX.test(m.trim())) sdel(session, META_TEST_KEY); else if (META_CODE_RX.test(m.trim())) sset(session, META_TEST_KEY, m.trim()); }
  }
  const params = parseCampaign(search);
  const lp = safePagePath(pathname || "/");
  const rd = safeReferrerDomain(referrer) || "";
  const at = new Date(now).toISOString();
  const cur = readState({ local, session, now });

  if (!cur.ft || (!has(cur.ft.p) && has(params))) {
    // Click-id VALUES (fbclid/gclid/ttclid) are per-click identifiers: the 90-day
    // first-touch record keeps only WHICH kind there was (ct), never the value.
    // The session record below may hold them for this tab session only.
    const ftParams = { ...params }; for (const k of CLICK_ID_KEYS) delete ftParams[k];
    jset(local, FIRST_TOUCH_KEY, { v: 1, at, exp: now + FIRST_TOUCH_TTL_MS, p: ftParams, ct: CLICK_ID_KEYS.find((k) => params[k]) || "", lp, rd });
  }
  if (!cur.sess || has(params)) {
    jset(session, SESSION_KEY, { v: 1, at, p: params, lp, rd });
  }
  return readState({ local, session, now });
}

// ── Landing cookie for the SERVER redirect event (2026-10-29) ───────────────
// Every ticket button on the Halloween page and the guides is a SAME-TAB link to
// our /api/*/go route. PostHog boots at idle (up to 4 s); a tap in that window
// sits in the in-memory pre-ready queue and dies with the page as it navigates,
// so the client commerce_cta_clicked never arrives (PostHog, Oct 27-29: 448
// human provider_redirect_started, 49 commerce_cta_clicked, none from
// halloween_haunts). The redirect event the go route emits ALWAYS fires, so it
// carries the landing context itself, read from this first-party session cookie
// that rides the same-origin navigation. Session cookie, Path=/, SameSite=Lax.
// Allow-listed, length-capped values only. Read by OUR routes; never appended to
// any seller URL (no route copies it into a destination).
export const ATTR_COOKIE = "wf_attr";
const COOKIE_FIELDS = Object.freeze([
  ["c", "landing_campaign"], ["s", "landing_source"], ["m", "landing_medium"],
  ["k", "landing_click_type"], ["p", "landing_path"], ["f", "first_touch_campaign"], ["g", "first_touch_source"], ["t", "wf_test"],
]);
const COOKIE_VALUE_RX = /^[A-Za-z0-9 _.:\/+|()-]{1,80}$/;

/** Pure: the cookie string for the current state, or "" when nothing to store. */
export function landingCookieValue(state) {
  const lp = landingProps(state);
  if (state && state.test) lp.wf_test = state.test;
  const parts = [];
  for (const [short, long] of COOKIE_FIELDS) {
    const v = lp[long];
    if (typeof v === "string" && COOKIE_VALUE_RX.test(v)) parts.push(short + "~" + encodeURIComponent(v));
  }
  return parts.join("|");
}

/** Write (or clear) the session cookie. `doc` is document-like; never throws. */
export function writeLandingCookie(doc, state, secure = true) {
  try {
    if (!doc) return "";
    const v = landingCookieValue(state);
    doc.cookie = ATTR_COOKIE + "=" + v + "; Path=/; SameSite=Lax" + (secure ? "; Secure" : "") + (v ? "" : "; Max-Age=0");
    return v;
  } catch (e) { return ""; }
}

/** Pure, server side: landing props from a Cookie header. Unknown/invalid parts dropped. */
export function landingFromCookieHeader(header) {
  const out = {};
  let raw = null;
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === ATTR_COOKIE) { raw = part.slice(i + 1).trim(); break; }
  }
  if (!raw || raw.length > 900) return out;
  const map = Object.fromEntries(COOKIE_FIELDS);
  for (const seg of raw.split("|")) {
    const j = seg.indexOf("~");
    if (j < 1) continue;
    const long = map[seg.slice(0, j)];
    if (!long) continue;
    let v = null;
    try { v = decodeURIComponent(seg.slice(j + 1)); } catch (e) { continue; }
    if (!COOKIE_VALUE_RX.test(v) || v.indexOf("@") >= 0) continue;
    if (long === "wf_test") { if (TEST_LABEL_RX.test(v)) { out.wf_test = v; out.is_test = true; } continue; }
    if (long === "landing_path" && v.charAt(0) !== "/") continue;
    out[long] = v;
  }
  return out;
}

/** Flat super-properties: wf_ft_* (first touch) and wf_sess_* (this session). */
export function attributionProps(state, which) {
  const out = {};
  const add = (prefix, rec) => {
    if (!rec) return;
    for (const k of CAMPAIGN_KEYS) if (rec.p[k] && !(prefix === "wf_ft_" && CLICK_ID_KEYS.includes(k))) out[prefix + k] = rec.p[k];
    if (rec.ct) out[prefix + "click_type"] = rec.ct;
    if (rec.lp) out[prefix + "landing_path"] = rec.lp;
    if (rec.rd) out[prefix + "referrer_domain"] = rec.rd;
    if (rec.at) out[prefix + "at"] = rec.at;
  };
  if (which !== "sess") add("wf_ft_", state && state.ft);
  if (which !== "ft") add("wf_sess_", state && state.sess);
  return out;
}

/** Tags for EVERY event in a test session (applied in sanitize_properties). */
export function testProps(state) {
  return state && state.test ? { is_test: true, wf_test: state.test, $internal_or_test_user: true } : {};
}

/** What a commerce_cta_clicked carries about where the visitor came from. */
export function landingProps(state) {
  const out = {};
  const s = state && state.sess; const f = state && state.ft;
  // landing_* describe THIS session's landing only. A returning direct visitor
  // has an empty session record, so landing_* stay empty and first touch shows
  // up only as first_touch_* (never relabelled as the current landing).
  const pick = (k) => (s && s.p[k]) || null;
  const c = pick("utm_campaign"); if (c) out.landing_campaign = c;
  const src = pick("utm_source"); if (src) out.landing_source = src;
  const med = pick("utm_medium"); if (med) out.landing_medium = med;
  const ct = (s && s.ct) || CLICK_ID_KEYS.find((k) => pick(k)); if (ct) out.landing_click_type = ct;
  const lp = s && s.lp; if (lp) out.landing_path = lp;
  if (f && f.p.utm_campaign) out.first_touch_campaign = f.p.utm_campaign;
  if (f && f.p.utm_source) out.first_touch_source = f.p.utm_source;
  return out;
}

/**
 * 1-based placement of the control that was just activated: data-rank on the
 * link or an ancestor, else its index among the sibling cards. Read from the
 * event being dispatched (window.event), so no emitter needs to pass it.
 * Returns null when it cannot be known.
 */
export function placementFromEvent(win) {
  try {
    const ev = win && win.event;
    const t = ev && ev.target;
    const a = t && t.closest ? t.closest("a[href],button") : null;
    if (!a) return null;
    const r = a.closest("[data-rank]");
    const rank = r ? Number(r.getAttribute("data-rank")) : NaN;
    if (Number.isFinite(rank) && rank >= 1 && rank <= 99) return Math.floor(rank);
    const card = a.closest("li,article");
    if (card && card.parentElement) {
      const i = Array.prototype.indexOf.call(card.parentElement.children, card);
      if (i >= 0 && i < 99) return i + 1;
    }
  } catch (e) {}
  return null;
}

const idOf = (p) => String(p.content_id || p.offer_id || p.canonical_place_id || "").slice(0, 120);
const safeId = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

/** Stable id shared by the browser pixel and the CAPI relay (Meta dedupes on name + id). */
export function metaEventId(clickId) {
  return "wf_otc_" + (safeId(clickId) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
}

export function metaCustomData(payload) {
  const id = idOf(payload);
  const out = { content_type: "event", surface: payload.surface || null, seller: payload.merchant || payload.provider || null };
  if (id) out.content_ids = [id];
  return out;
}

const fired = new Map();
/**
 * Fire the Meta custom event for ONE already-accepted commerce_cta_clicked.
 * Custom event only: never Purchase / Lead, no value, no currency.
 */
export function fireOutboundTicketClick({ win, payload, state, relay }) {
  const r = { fired: false, skipped: null, eventID: null };
  try {
    if (!win || !payload) { r.skipped = "no_input"; return r; }
    if (!isTicketClick(payload)) { r.skipped = "not_ticket"; return r; }
    if (state && state.test && !state.metaTest) { r.skipped = "test_traffic"; return r; }
    const f = typeof win.fbq === "function" ? win.fbq : null;
    if (!f) { r.skipped = "no_fbq"; return r; }
    // One id per ACTIVATION. emitCommerce already drops double-taps, so a repeat
    // of the same click_id here is a genuine later click on the same anchor:
    // suffix it so Meta (and CAPI) count it, instead of deduping it away.
    const base = metaEventId(payload.click_id);
    const n = fired.get(base) || 0;
    fired.set(base, n + 1);
    const eventID = n ? base + "_" + n : base;
    r.eventID = eventID;
    const data = metaCustomData(payload);
    f("trackCustom", META_OUTBOUND_EVENT, data, { eventID });
    r.fired = true;
    if (typeof relay === "function") {
      try { relay({ event_name: META_OUTBOUND_EVENT, event_id: eventID, ...data, test_event_code: state && state.metaTest ? state.metaTest : undefined }); } catch (e) {}
    }
  } catch (e) { r.skipped = "threw"; }
  return r;
}

/** Browser bridge installed by PostHogProvider; lib/commerce.js reads window.__WF_ATTR. */
export function installBridge(win, { relayEnabled = false } = {}) {
  const store = (name) => { try { return win[name]; } catch (e) { return null; } };
  const state = () => readState({ local: store("localStorage"), session: store("sessionStorage") });
  const relay = relayEnabled ? (body) => {
    try {
      const json = JSON.stringify({ ...body, source_path: safePagePath(win.location && win.location.pathname) });
      if (win.fetch) win.fetch("/api/meta/capi", { method: "POST", headers: { "content-type": "application/json" }, body: json, keepalive: true }).catch(() => {});
    } catch (e) {}
  } : null;
  const last = new Map();
  const bridge = {
    state,
    // True when this click repeats the same offer within DOUBLE_ACTIVATION_MS.
    repeat(payload) {
      const p = payload || {};
      const key = [p.surface, p.provider, p.merchant, p.offer_id, p.content_id].map((v) => (v == null ? "" : String(v))).join("|");
      const now = Date.now();
      const t = last.get(key);
      if (t !== undefined && now - t < DOUBLE_ACTIVATION_MS) return true;
      if (last.size > 200) last.clear();
      last.set(key, now);
      return false;
    },
    enrich(event, payload) {
      if (event !== "commerce_cta_clicked" || !payload) return payload;
      const s = state();
      // Re-stamp the cookie from THIS tab's session right before the same-tab
      // navigation, so a campaign landed in another tab never labels this click's
      // server redirect event (the cookie is origin-wide, the session is per tab).
      try { writeLandingCookie(win.document, s, !!(win.location && win.location.protocol === "https:")); } catch (e) {}
      const out = { ...payload, ...landingProps(s) };
      const pos = placementFromEvent(win);
      if (pos) out.position = pos;
      if (s.test) { out.is_test = true; out.wf_test = s.test; }
      return out;
    },
    afterClick(event, payload) {
      if (event !== "commerce_cta_clicked") return null;
      return fireOutboundTicketClick({ win, payload, state: state(), relay });
    },
  };
  try { win.__WF_ATTR = bridge; } catch (e) {}
  return bridge;
}
