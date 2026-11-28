// lib/reengageClient.js — the browser half of re-engagement. Pure, SSR safe,
// no React. Every browser touch is guarded and `win` is injectable so
// scripts/test-reengage-client.mjs can run it against a fake window.
//
// What this module holds, and what it never holds:
//   - a first-party anonymous id cookie (wf_anon_id), only when the visitor has
//     not opted out;
//   - a tiny local ring buffer (wf_reengage): the last few places looked at, the
//     city, the last built plan's reference, and visit times;
//   - two booleans (wf_reengage_flags).
// An email address is NEVER stored here, in a cookie, in an event or in a URL.
// It lives only in the drawer's React state until the server has it.
//
// Opt-out: Global Privacy Control, or the same analytics suppression every other
// browser analytics path honors (owner, bot, internal verifier). When opted out
// this module sets no cookie, writes no storage and never shows the banner.
import { analyticsSuppressionReason, captureOrQueue } from "./browserAnalytics.js";

export const ANON_COOKIE = "wf_anon_id";
export const ANON_MAX_AGE = 2592000; // 30 days, seconds
export const ANON_ID_RX = /^[0-9a-f-]{36}$/;
export const STATE_KEY = "wf_reengage";
export const FLAGS_KEY = "wf_reengage_flags";
export const FLAG_KEYS = Object.freeze(["hasSavedEmail", "hasPushOptIn"]);
export const PLAN_REF_RX = /^[a-f0-9]{32}$/;
export const RECENT_MAX = 5;
export const AWAY_MS = 30 * 60 * 1000; // a returning visit is 30+ minutes after the last
export const DISMISS_MS = 7 * 86400000;
export const PUSH_ASK_COOLDOWN_MS = 21 * 86400000; // one push ask in 21 days, whatever the answer
export const HUB_VIEWS_MAX = 100000;
export const HOOK_ITINERARY_CALLBACK = "__WF_REENGAGE_ITINERARY_CB";
export const DRAFT_TTL_MS = 7 * 86400000; // the server keeps a plan snapshot 7 days
export const CONSENT_TEXT = "Email me this plan, plus up to 3 follow ups for this trip with directions and backup picks. Unsubscribe anytime.";
export const BANNER_HIDDEN_PATH_RX = /^\/(?:plan-my-day|unsubscribe)(?:\/|$)/;

const REFRESHED_FLAG = "__WF_ANON_REFRESHED";
const ID_RX = /^[A-Za-z0-9_.:-]{1,128}$/;
const SLUG_RX = /^[a-z0-9-]{1,60}$/;

function defaultWin() {
  return typeof window !== "undefined" ? window : null;
}

/** The UI is dark unless this build was cut with NEXT_PUBLIC_WF_REENGAGE=1. */
export function reengageEnabled() {
  try { return process.env.NEXT_PUBLIC_WF_REENGAGE === "1"; } catch (e) { return false; }
}

function storageOf(win) {
  try { return (win && win.localStorage) || null; } catch (e) { return null; }
}

/**
 * True when this visitor must not be tracked: Global Privacy Control, or the
 * shared analytics suppression (owner, bot, internal browser). The suppression
 * rule itself lives in lib/browserAnalytics.js and is reused, not copied.
 */
export function optedOut(win = defaultWin()) {
  if (!win) return true;
  try {
    const nav = win.navigator || {};
    if (nav.globalPrivacyControl === true) return true;
    if (win.__WF_ANALYTICS_SUPPRESSED) return true;
    return !!analyticsSuppressionReason({ storage: storageOf(win), userAgent: nav.userAgent, webdriver: !!nav.webdriver });
  } catch (e) { return true; } // cannot tell: fail closed, track nothing
}

function newUuid(win) {
  try {
    const c = win && win.crypto;
    if (c && typeof c.randomUUID === "function") return String(c.randomUUID()).toLowerCase();
    if (c && typeof c.getRandomValues === "function") {
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  } catch (e) { /* fall through */ }
  return null;
}

function readCookieId(win) {
  try {
    const m = String((win.document && win.document.cookie) || "").match(/(?:^|;\s*)wf_anon_id=([^;]*)/);
    return m && ANON_ID_RX.test(m[1]) ? m[1] : null;
  } catch (e) { return null; }
}

/**
 * The anonymous id cookie. Reads it, mints one if missing, and slides the 30 day
 * expiry at most once per page load. Returns null when opted out (and then
 * writes nothing at all).
 */
export function ensureAnonId(win = defaultWin()) {
  if (!win || optedOut(win)) return null;
  const existing = readCookieId(win);
  if (existing && win[REFRESHED_FLAG]) return existing;
  const id = existing || newUuid(win);
  if (!id) return null;
  try {
    const secure = win.location && win.location.protocol === "https:" ? "; Secure" : "";
    win.document.cookie = `${ANON_COOKIE}=${id}; Path=/; Max-Age=${ANON_MAX_AGE}; SameSite=Lax${secure}`;
    win[REFRESHED_FLAG] = true;
  } catch (e) { /* cookies blocked: the id still works for this page load */ }
  return id;
}

// Free text may only ever be a short plain label. Anything with an "@" is
// dropped outright so an address can never ride in on a place or city name.
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const t = value.replace(/\s+/g, " ").trim();
  return !t || t.length > max || t.includes("@") ? "" : t;
}

function emptyState() {
  return { v: 1, recent: [], city: null, draft: null, visits: 0, lastVisitAt: null, prevVisitAt: null, dismissedAt: null, hubViews: 0, pushAskedAt: null };
}

const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

function normalizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object" || raw.v !== 1) return s;
  if (Array.isArray(raw.recent)) {
    for (const r of raw.recent) {
      if (!r || typeof r.id !== "string" || !ID_RX.test(r.id) || s.recent.some((x) => x.id === r.id)) continue;
      s.recent.push({ id: r.id, name: cleanText(r.name, 80) });
      if (s.recent.length >= RECENT_MAX) break;
    }
  }
  if (raw.city && typeof raw.city.slug === "string" && SLUG_RX.test(raw.city.slug)) {
    s.city = { slug: raw.city.slug, name: cleanText(raw.city.name, 60) };
  }
  const d = raw.draft;
  if (d && typeof d.planRef === "string" && PLAN_REF_RX.test(d.planRef) && finite(d.at) !== null) {
    s.draft = { planRef: d.planRef, area: typeof d.area === "string" && SLUG_RX.test(d.area) ? d.area : "", areaName: cleanText(d.areaName, 60), at: d.at };
  }
  s.visits = Math.max(0, Math.min(100000, finite(raw.visits) || 0));
  s.lastVisitAt = finite(raw.lastVisitAt);
  s.prevVisitAt = finite(raw.prevVisitAt);
  s.dismissedAt = finite(raw.dismissedAt);
  s.hubViews = Math.max(0, Math.min(HUB_VIEWS_MAX, Math.floor(finite(raw.hubViews) || 0)));
  s.pushAskedAt = finite(raw.pushAskedAt);
  return s;
}

/** The stored state, always a full valid object. Reads never need an opt-out check. */
export function readState(win = defaultWin()) {
  try {
    const st = storageOf(win);
    const raw = st && st.getItem(STATE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch (e) { return emptyState(); }
}

// Every write goes through here: opted out means nothing is stored.
function mutateState(win, fn) {
  if (!win || optedOut(win)) return null;
  try {
    const st = storageOf(win);
    if (!st) return null;
    const next = readState(win);
    fn(next);
    st.setItem(STATE_KEY, JSON.stringify(normalizeState(next)));
    return next;
  } catch (e) { return null; }
}

/** One page load of this browser. Rolls last visit into previous visit. */
export function noteVisit(win = defaultWin(), now = Date.now()) {
  return mutateState(win, (s) => {
    s.prevVisitAt = s.lastVisitAt;
    s.lastVisitAt = now;
    s.visits += 1;
  });
}

/** A place was opened. Newest first, deduped, at most five. Only id and name are kept. */
export function notePlace(place, win = defaultWin()) {
  const id = place && (place.slug || place.id);
  if (typeof id !== "string" || !ID_RX.test(id)) return null;
  const name = cleanText(place.name, 80);
  return mutateState(win, (s) => {
    s.recent = [{ id, name }, ...s.recent.filter((r) => r.id !== id)].slice(0, RECENT_MAX);
  });
}

export function noteCity(slug, name, win = defaultWin()) {
  if (typeof slug !== "string" || !SLUG_RX.test(slug)) return null;
  return mutateState(win, (s) => { s.city = { slug, name: cleanText(name, 60) }; });
}

/** The plan a visitor just built. Needs the server's reference or it is not kept. */
export function noteDraft(planRef, area, areaName, win = defaultWin(), now = Date.now()) {
  if (typeof planRef !== "string" || !PLAN_REF_RX.test(planRef)) return null;
  return mutateState(win, (s) => {
    s.draft = { planRef, area: typeof area === "string" && SLUG_RX.test(area) ? area : "", areaName: cleanText(areaName, 60), at: now };
  });
}

export function markDismissed(win = defaultWin(), now = Date.now()) {
  return mutateState(win, (s) => { s.dismissedAt = now; });
}

/** A hub page (Christmas in Florida, a guide) was opened. Counts page loads, stores nothing else. */
export function noteHubView(path, win = defaultWin()) {
  if (typeof path !== "string" || !/^\/[A-Za-z0-9/_-]{0,119}$/.test(path)) return null;
  return mutateState(win, (s) => { s.hubViews += 1; });
}

/** The push prompt (or the iOS helper) was shown or answered: no new ask for 21 days. */
export function markPushAsked(win = defaultWin(), now = Date.now()) {
  return mutateState(win, (s) => { s.pushAskedAt = now; });
}

/** Booleans only. Anything else in storage is ignored. */
export function readFlags(win = defaultWin()) {
  const out = { hasSavedEmail: false, hasPushOptIn: false };
  try {
    const st = storageOf(win);
    const raw = st && st.getItem(FLAGS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") for (const k of FLAG_KEYS) out[k] = v[k] === true;
  } catch (e) { /* defaults */ }
  return out;
}

/** Store one boolean flag. Unknown keys are rejected; the value is coerced to a boolean. */
export function setFlag(key, value, win = defaultWin()) {
  if (!FLAG_KEYS.includes(key)) return false;
  if (!win || optedOut(win)) return false;
  try {
    const st = storageOf(win);
    if (!st) return false;
    const next = readFlags(win);
    next[key] = !!value;
    st.setItem(FLAGS_KEY, JSON.stringify({ hasSavedEmail: !!next.hasSavedEmail, hasPushOptIn: !!next.hasPushOptIn }));
    return true;
  } catch (e) { return false; }
}

/** A plan draft still worth offering back (the server snapshot lasts 7 days). */
export function freshDraft(state, now) {
  const d = state && state.draft;
  return d && PLAN_REF_RX.test(d.planRef) && finite(d.at) !== null && now - d.at >= 0 && now - d.at < DRAFT_TTL_MS ? d : null;
}

/** "draft" when there is a plan to resume, "places" when only places were seen, else null. */
export function bannerKind(state, now) {
  if (freshDraft(state, now)) return "draft";
  return state && Array.isArray(state.recent) && state.recent.length ? "places" : null;
}

/**
 * Should the return banner show right now? Pure: the caller passes the state it
 * just read (after noteVisit), the flags, the clock and the pathname.
 * The only call to action it ever shows is a link back (the plan or the newest
 * place), so a saved email does not hide it; the drawer button inside it hides.
 */
export function shouldShowBanner(state, flags, now, path) {
  if (!state || typeof now !== "number" || !Number.isFinite(now)) return false;
  if (typeof path === "string" && BANNER_HIDDEN_PATH_RX.test(path)) return false;
  if (finite(state.prevVisitAt) === null || now - state.prevVisitAt < AWAY_MS) return false;
  if (!bannerKind(state, now)) return false;
  if (finite(state.dismissedAt) !== null && now - state.dismissedAt < DISMISS_MS) return false;
  return true;
}

function titleCase(slug) {
  return String(slug || "").split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** A readable place for copy, from the stored city. Empty when unknown. */
export function cityLabel(state) {
  const c = state && state.city;
  return c ? c.name || titleCase(c.slug) : "";
}

/**
 * PostHog only (never Google or Meta). Properties are whitelisted here, so an
 * email or any other free text cannot be passed in by accident.
 */
export function reengageEvent(win, name, props) {
  if (!win || optedOut(win)) return false;
  const out = {};
  const p = props || {};
  for (const k of ["kind", "surface", "code"]) if (typeof p[k] === "string" && /^[a-z0-9_-]{1,40}$/i.test(p[k])) out[k] = p[k];
  return captureOrQueue(win, name, out);
}

/**
 * Feed the ring buffer from events the app already emits, through the one
 * additive hook in captureOrQueue. Two real events are read: detail_open (props
 * place_id, place_name, app/home.js logEvent) and coverage_city_jump (prop city,
 * a slug). Every other event is ignored, and no other prop is ever read.
 * One more event, itinerary_generated, reads NO prop: it only calls the callback
 * the lazy boot registered when the push flag is on (nothing registers it
 * otherwise, so it does nothing).
 */
export function installReengageHook(win = defaultWin()) {
  if (!win || optedOut(win)) return false;
  win.__WF_REENGAGE_HOOK = (event, props) => {
    try {
      if (optedOut(win) || !props || typeof props !== "object") return;
      if (event === "detail_open") notePlace({ id: props.place_id, name: props.place_name }, win);
      else if (event === "coverage_city_jump") noteCity(props.city, "", win);
      else if (event === "itinerary_generated") {
        // noteDraft runs right after track(), so the callback waits one tick to see the new draft.
        const cb = win[HOOK_ITINERARY_CALLBACK];
        if (typeof cb === "function") setTimeout(() => { try { cb(); } catch (e) { /* best effort */ } }, 0);
      }
    } catch (e) { /* never break analytics */ }
  };
  return true;
}
