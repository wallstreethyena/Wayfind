// lib/analytics.js — the Google side of Wayfind's measurement.
//
// WHY THIS EXISTS
// ---------------
// The Google Ads tag (AW-18342267447) shipped as `gtag('config', ...)` and
// nothing else: it loaded, reported a page view, and could never report a
// conversion because no `gtag('event', ...)` call existed anywhere in the app.
// Google Ads therefore showed "0 conversions" regardless of what users did,
// and Performance Max had no signal to optimize against.
//
// PostHog is, and stays, the source of truth for product analytics. This module
// is a ONE-WAY BRIDGE: events already captured by PostHog get forwarded to GA4
// and (when they are genuinely valuable) to Google Ads. It never captures to
// PostHog itself — that would double-count every action in the existing history.
// The single choke point is `forwardToGoogle()`, called from home.js's logEvent
// immediately after its own posthog.capture.
//
// SSR SAFETY
// ----------
// No `window`, `document`, or `gtag` access at module scope. Every entry point
// re-checks `typeof window`. This module is imported by both server and client
// components and must stay inert on the server.
//
// LABELS ARE NEVER INVENTED
// -------------------------
// A Google Ads conversion label is minted in the Ads UI when you create a
// conversion action. There is no way to derive one. A wrong label silently
// reports into the wrong action — worse than not reporting. So labels come from
// env only, are shape-validated, and a missing/invalid label means the Ads
// conversion is skipped (GA4 still receives the event).

/* ── configuration ─────────────────────────────────────────────────────── */

// Next.js inlines NEXT_PUBLIC_* only for STATIC member expressions, so each one
// must be spelled out literally — no dynamic process.env[name] lookups.
const RAW = {
  ga4: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
  signup: process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP,
  affiliate: process.env.NEXT_PUBLIC_ADS_LABEL_AFFILIATE,
  save: process.env.NEXT_PUBLIC_ADS_LABEL_SAVE,
  detail: process.env.NEXT_PUBLIC_ADS_LABEL_DETAIL,
};

// The account the campaign already runs against. Overridable, but defaulted so
// a missing env var can't silently detach the tag from the live account.
export const DEFAULT_ADS_ID = "AW-18342267447";

const _s = (v) => (typeof v === "string" ? v.trim() : "");

// GA4 measurement IDs are G-XXXXXXXXXX. Reject anything else rather than
// configuring a garbage stream that silently collects nothing.
export function isValidGa4Id(v) {
  return /^G-[A-Z0-9]{6,15}$/.test(_s(v));
}

// Google Ads account IDs are AW-<digits>.
export function isValidAdsId(v) {
  return /^AW-\d{6,15}$/.test(_s(v));
}

// A conversion label is an opaque token from the Ads UI, e.g. "AbC-D_efGh12345678".
// We can't verify it's the RIGHT label, but we can reject the things that are
// definitely not labels: empty, placeholder text, or a full send_to string
// pasted in by mistake (which would produce "AW-x/AW-x/label").
const PLACEHOLDER = /^(x+|todo|tbd|none|null|undefined|your[-_]?label|replace[-_]?me|changeme)$/i;
export function isValidConversionLabel(v) {
  const s = _s(v);
  if (!s || s.length < 6 || s.length > 40) return false;
  if (s.indexOf("/") >= 0 || s.indexOf(" ") >= 0) return false; // a send_to, not a label
  if (/^AW-/i.test(s)) return false;
  if (PLACEHOLDER.test(s)) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

export function ga4Id() { return isValidGa4Id(RAW.ga4) ? _s(RAW.ga4) : null; }
export function adsId() {
  const v = _s(RAW.adsId);
  if (v) return isValidAdsId(v) ? v : null;
  return DEFAULT_ADS_ID;
}

// Only labels that pass validation are exposed. Everything else reads as null,
// and a null label means "skip the Ads conversion", never "guess one".
export function conversionLabels() {
  return {
    signup: isValidConversionLabel(RAW.signup) ? _s(RAW.signup) : null,
    affiliate: isValidConversionLabel(RAW.affiliate) ? _s(RAW.affiliate) : null,
    save: isValidConversionLabel(RAW.save) ? _s(RAW.save) : null,
    detail: isValidConversionLabel(RAW.detail) ? _s(RAW.detail) : null,
  };
}

/* ── event classification ──────────────────────────────────────────────── */

// The seven outbound-affiliate events. Each is a deliberate click that sends a
// user to a monetized partner — the closest thing Wayfind has to a purchase
// intent signal, and the reason the campaign exists.
export const AFFILIATE_EVENTS = [
  "tickets_out", "coupon_out", "hotel_out", "eats_out", "ta_out", "tour_card_out", "vrbo_out",
];

// PRIMARY  — real business value. These are what Google Ads should bid toward.
// SECONDARY— genuine engagement, useful as a secondary signal, NOT a goal.
// ANALYTICS— forwarded to GA4 for funnel analysis; never an Ads conversion.
//
// A page view, a result impression, or a card merely being on screen is NEVER
// primary. That is exactly the mistake the current "About Us page load"
// conversion action makes, and why the account reports meaningless numbers.
export const PRIMARY_EVENTS = ["signup_completed", ...AFFILIATE_EVENTS];
export const SECONDARY_EVENTS = ["save", "detail_open"];
export const ANALYTICS_ONLY_EVENTS = [
  "search", "result_count_shown", "$pageview", "page_view", "signup_started",
  "login_completed", "hero_impression", "screen_view",
];

export function classify(event) {
  const e = _s(event);
  if (PRIMARY_EVENTS.indexOf(e) >= 0) return "primary";
  if (SECONDARY_EVENTS.indexOf(e) >= 0) return "secondary";
  return "analytics";
}

// Which label bucket an event converts into. Affiliate events consolidate onto
// ONE Ads conversion action (`affiliate_click`) so the account doesn't need
// seven separate labels — the specific partner/event survives in the event
// params and in PostHog, where the granularity is actually useful.
export function labelKeyFor(event) {
  const e = _s(event);
  if (e === "signup_completed") return "signup";
  if (AFFILIATE_EVENTS.indexOf(e) >= 0) return "affiliate";
  if (e === "save") return "save";
  if (e === "detail_open") return "detail";
  return null;
}

// The GA4 event name. Affiliate events keep their specific identity in GA4;
// only the Ads conversion is consolidated.
export function ga4NameFor(event) {
  const e = _s(event);
  return AFFILIATE_EVENTS.indexOf(e) >= 0 ? e : e;
}

/* ── duplicate suppression ─────────────────────────────────────────────── */

// React Strict Mode double-invokes effects in development, App Router
// navigations can re-run client components, and users double-tap outbound
// links. Any of those would report two conversions for one action. Keyed
// suppression inside a short window is the cheapest correct guard.
const DEDUPE_WINDOW_MS = 1500;
const _recent = new Map();

export function _resetDedupe() { _recent.clear(); } // test seam

export function shouldFire(key, now, windowMs) {
  const w = typeof windowMs === "number" ? windowMs : DEDUPE_WINDOW_MS;
  const t = typeof now === "number" ? now : Date.now();
  const prev = _recent.get(key);
  if (prev != null && t - prev < w) return false;
  _recent.set(key, t);
  // Bound the map so a long session can't grow it without limit.
  if (_recent.size > 200) {
    for (const [k, ts] of _recent) { if (t - ts > w) _recent.delete(k); }
  }
  return true;
}

function dedupeKey(event, params) {
  const p = params || {};
  const id = p.place_id || p.id || p.provider || "";
  return _s(event) + "|" + _s(String(id));
}

/* ── the bridge ────────────────────────────────────────────────────────── */

function gtagFn() {
  if (typeof window === "undefined") return null;
  const g = window.gtag;
  return typeof g === "function" ? g : null;
}

// Strip anything that could carry personal data. Google receives categorical
// facts about the action, never free text a user typed and never an email.
const ALLOWED_PARAM_KEYS = [
  "place_id", "place_name", "category", "provider", "partner", "kind",
  "city", "surface", "value", "currency", "position", "source",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
];

export function sanitizeParams(params) {
  const out = {};
  if (!params || typeof params !== "object") return out;
  for (const k of ALLOWED_PARAM_KEYS) {
    const v = params[k];
    if (v == null) continue;
    if (typeof v === "number") { if (Number.isFinite(v)) out[k] = v; continue; }
    const s = _s(String(v));
    if (!s) continue;
    if (s.indexOf("@") >= 0) continue; // never forward anything email-shaped
    out[k] = s.slice(0, 100);
  }
  return out;
}

/**
 * Forward one already-captured product event to GA4 and, when it qualifies,
 * to Google Ads. Safe to call from anywhere, including during SSR (no-op).
 *
 * Returns a small report so tests can assert exactly what fired.
 */
export function forwardToGoogle(event, params, opts) {
  const report = { event: _s(event), ga4: false, ads: false, tier: "analytics", skipped: null };
  if (!report.event) { report.skipped = "no_event"; return report; }

  const o = opts || {};
  const key = o.dedupeKey || dedupeKey(event, params);
  if (o.dedupe !== false && !shouldFire(key, o.now, o.dedupeWindowMs)) {
    report.skipped = "duplicate";
    return report;
  }

  report.tier = classify(report.event);

  const g = o.gtag || gtagFn();
  if (!g) { report.skipped = "no_gtag"; return report; }

  const clean = sanitizeParams(params);

  // 1) GA4 — every event, including analytics-only ones. This is the funnel.
  if (ga4Id()) {
    try { g("event", ga4NameFor(report.event), { ...clean, send_to: ga4Id() }); report.ga4 = true; }
    catch (e) {}
  }

  // 2) Google Ads — primary and secondary only, and only with a real label.
  if (report.tier !== "analytics") {
    const lk = labelKeyFor(report.event);
    const label = lk ? conversionLabels()[lk] : null;
    const acct = adsId();
    if (!label) { report.skipped = report.skipped || "no_label:" + (lk || "none"); }
    else if (!acct) { report.skipped = report.skipped || "no_ads_id"; }
    else {
      const name = lk === "affiliate" ? "affiliate_click" : report.event;
      try {
        g("event", "conversion", {
          send_to: acct + "/" + label,
          // Keep the specific partner/event visible on the conversion itself.
          event_label: name,
          ...clean,
        });
        report.ads = true;
      } catch (e) {}
    }
  }

  return report;
}

/** Explicit page_view for GA4 on client-side route changes. Never an Ads conversion. */
export function trackPageView(path, extra) {
  if (typeof window === "undefined") return { ga4: false, skipped: "ssr" };
  const g = gtagFn();
  const id = ga4Id();
  if (!g || !id) return { ga4: false, skipped: !g ? "no_gtag" : "no_ga4_id" };
  const p = _s(path) || (typeof location !== "undefined" ? location.pathname : "");
  if (!shouldFire("page_view|" + p)) return { ga4: false, skipped: "duplicate" };
  try {
    g("event", "page_view", { page_path: p, ...sanitizeParams(extra), send_to: id });
    return { ga4: true, skipped: null };
  } catch (e) { return { ga4: false, skipped: "threw" }; }
}
