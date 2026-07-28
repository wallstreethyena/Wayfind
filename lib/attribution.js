// lib/attribution.js — first-party capture of campaign attribution.
//
// WHY
// ---
// A paid visitor lands on /go/orlando with ?gclid=... and UTM params, then taps
// "Explore Orlando" into the app. Without help, the params die at that first
// navigation: the app has no idea the session came from a paid Orlando click,
// and neither does any event fired later in the session. PostHog happens to
// capture $entry_gclid at the SESSION level automatically, but that value is
// not readable from application code and cannot be attached to an event.
//
// So we capture once on landing, store first-party, and attach the non-sensitive
// subset to events afterwards.
//
// WHAT IS AND IS NOT STORED
// -------------------------
// Only the eight campaign identifiers below. These are Google-minted campaign
// metadata, not personal data — no email, no name, no free text the user typed,
// no full URL (which could contain a search query). Nothing here is forwarded
// anywhere except back to Google, which issued the click ID in the first place.
//
// FIRST TOUCH WINS
// ----------------
// If a session already carries attribution, a later organic pageview must not
// erase it — otherwise a paid visitor who navigates to an internal page stops
// looking paid halfway through the funnel. Capture only overwrites when the new
// URL actually carries parameters.

export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"];
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
export const ATTRIBUTION_KEYS = [...CLICK_ID_KEYS, ...UTM_KEYS];

export const STORAGE_KEY = "wf_attribution";

// A click ID or UTM value is short and token-ish. Anything longer is not one of
// ours and is dropped rather than stored.
const MAX_LEN = 200;

function clean(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > MAX_LEN) return null;
  if (s.indexOf("@") >= 0) return null; // never store anything email-shaped
  return s;
}

/**
 * Pull the attribution params out of a query string. Pure — no window access,
 * so it is unit-testable and safe to call on the server.
 * @param {string} search e.g. "?gclid=abc&utm_source=google"
 */
export function parseAttribution(search) {
  const out = {};
  const raw = typeof search === "string" ? search : "";
  if (!raw) return out;
  let params;
  try { params = new URLSearchParams(raw.charAt(0) === "?" ? raw.slice(1) : raw); }
  catch (e) { return out; }
  for (const k of ATTRIBUTION_KEYS) {
    const v = clean(params.get(k));
    if (v) out[k] = v;
  }
  return out;
}

export function hasAttribution(obj) {
  return !!obj && ATTRIBUTION_KEYS.some((k) => !!obj[k]);
}

/** True when the attribution looks like a paid click (a click ID, or medium=cpc). */
export function isPaid(obj) {
  if (!obj) return false;
  if (CLICK_ID_KEYS.some((k) => !!obj[k])) return true;
  const m = (obj.utm_medium || "").toLowerCase();
  return m === "cpc" || m === "ppc" || m === "paid";
}

/* ── storage (browser only; every entry point guards) ──────────────────── */

function store() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch (e) { return null; }
}

export function readAttribution() {
  const s = store();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    const out = {};
    for (const k of ATTRIBUTION_KEYS) { const v = clean(o[k]); if (v) out[k] = v; }
    if (o.landed_at) out.landed_at = o.landed_at;
    return out;
  } catch (e) { return {}; }
}

/**
 * Capture from a URL search string. First touch wins: an incoming URL with no
 * params leaves any stored attribution untouched.
 * @returns the attribution now in effect
 */
export function captureAttribution(search, opts) {
  const fresh = parseAttribution(search);
  const s = store();
  if (!hasAttribution(fresh)) return readAttribution();
  const existing = readAttribution();
  // A new paid click legitimately replaces an older one; a param-less
  // navigation does not (guarded above).
  const merged = { ...existing, ...fresh, landed_at: (opts && opts.now) || new Date().toISOString() };
  if (s) { try { s.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (e) {} }
  return merged;
}

export function clearAttribution() {
  const s = store();
  if (s) { try { s.removeItem(STORAGE_KEY); } catch (e) {} }
}

/**
 * The subset safe to attach to analytics events. Click IDs are deliberately
 * EXCLUDED — they are per-click identifiers, and PostHog already records them
 * at session level. Events carry only the campaign shape.
 */
export function attributionParams(attr) {
  const a = attr || readAttribution();
  const out = {};
  for (const k of UTM_KEYS) { if (a[k]) out[k] = a[k]; }
  return out;
}

/**
 * Preserve attribution across an internal navigation. Appends any stored
 * params that the target href does not already carry, so a paid visitor who
 * taps "Explore Orlando" arrives in the app still attributable.
 * External/protocol-relative URLs are returned untouched.
 */
export function decorateHref(href, attr) {
  const h = typeof href === "string" ? href : "";
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.slice(0, 2) === "//") return h;
  const a = attr || readAttribution();
  if (!hasAttribution(a)) return h;
  const [base, hash] = h.split("#");
  const qi = base.indexOf("?");
  const path = qi >= 0 ? base.slice(0, qi) : base;
  let params;
  try { params = new URLSearchParams(qi >= 0 ? base.slice(qi + 1) : ""); }
  catch (e) { return h; }
  for (const k of ATTRIBUTION_KEYS) {
    if (a[k] && !params.has(k)) params.set(k, a[k]);
  }
  const qs = params.toString();
  return path + (qs ? "?" + qs : "") + (hash ? "#" + hash : "");
}
