// lib/metaPixel.js — the Meta (Facebook / Instagram) side of Wayfind's
// measurement. Sibling of lib/analytics.js (Google) and built the same way:
//
//   - PostHog stays the source of truth. This is a ONE-WAY BRIDGE called from
//     home.js's logEvent right after forwardToGoogle; it never captures to
//     PostHog itself.
//   - No `window` / `fbq` access at module scope — imported by server and
//     client components alike, so it must be inert on the server.
//   - The pixel id is defaulted to the live dataset so a missing env var can
//     never silently detach the site from the ad account that already runs
//     campaigns against it (dataset "Wayfind Website", Meta business
//     681034706429651, ad account 5438739619543785). See docs/META_PIXEL.md.
//
// WHY: the first Meta campaign (2026-10-27, Halloween Reels -> /halloween-in-
// florida) ran with no pixel at all, so Meta could only count clicks on the
// ad, not what visitors did on the site, and could not optimize delivery
// toward people who actually open places or tap an affiliate button.

import {
  sanitizeParams,
  isAffiliateClick,
  SECONDARY_EVENTS,
  shouldFire,
} from "./analytics.js";

export const DEFAULT_META_PIXEL_ID = "1424559705968711";

// Next.js inlines NEXT_PUBLIC_* only for a STATIC member expression.
const RAW_PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

const _s = (v) => (typeof v === "string" ? v.trim() : "");

// A Meta pixel / dataset id is a plain number, 15 or 16 digits today. Reject
// anything else rather than init'ing a pixel that reports into nothing.
export function isValidMetaPixelId(v) {
  return /^\d{15,17}$/.test(_s(v));
}

export function metaPixelId() {
  const v = _s(RAW_PIXEL);
  if (!v) return DEFAULT_META_PIXEL_ID;
  // An explicit "off" switch for a preview or a privacy build.
  if (/^(0|off|none|false)$/i.test(v)) return null;
  return isValidMetaPixelId(v) ? v : DEFAULT_META_PIXEL_ID;
}

function fbqFn() {
  if (typeof window === "undefined") return null;
  const f = window.fbq;
  return typeof f === "function" ? f : null;
}

// Product event -> Meta standard event. Standard names are what Meta's ad
// delivery can optimize toward; everything else is an analytics-only custom
// event. Kept deliberately small and in step with lib/analytics.js tiers:
//   affiliate click  -> Lead            (the revenue intent)
//   signup_completed -> CompleteRegistration
//   save             -> AddToWishlist
//   detail_open      -> ViewContent
export function metaEventFor(event, params) {
  const e = _s(event);
  if (!e) return null;
  if (isAffiliateClick(e)) return { name: "Lead", standard: true };
  if (e === "signup_completed") return { name: "CompleteRegistration", standard: true };
  if (e === "save") return { name: "AddToWishlist", standard: true };
  if (e === "detail_open") return { name: "ViewContent", standard: true };
  if (SECONDARY_EVENTS.indexOf(e) >= 0) return { name: e, standard: false };
  return null; // analytics-only noise stays in PostHog
}

/**
 * Forward one already-captured product event to the Meta pixel. Safe to call
 * anywhere, including during SSR (no-op). Returns a small report for tests.
 */
export function forwardToMeta(event, params, opts) {
  const report = { event: _s(event), meta: false, name: null, skipped: null };
  if (!report.event) { report.skipped = "no_event"; return report; }
  const o = opts || {};
  const mapped = metaEventFor(report.event, params);
  if (!mapped) { report.skipped = "not_mapped"; return report; }
  report.name = mapped.name;

  const key = o.dedupeKey || ("meta|" + report.event + "|" + _s(String((params && params.place_id) || "")));
  if (o.dedupe !== false && !shouldFire(key, o.now, o.dedupeWindowMs)) {
    report.skipped = "duplicate";
    return report;
  }

  const f = o.fbq || fbqFn();
  if (!f) { report.skipped = "no_fbq"; return report; }
  if (!metaPixelId()) { report.skipped = "no_pixel_id"; return report; }

  const clean = sanitizeParams(params);
  try {
    f(mapped.standard ? "track" : "trackCustom", mapped.name, clean);
    report.meta = true;
  } catch (e) { report.skipped = "threw"; }
  return report;
}

/** PageView on client-side route changes. The initial one comes from the init snippet. */
export function trackMetaPageView(path) {
  if (typeof window === "undefined") return { meta: false, skipped: "ssr" };
  const f = fbqFn();
  if (!f) return { meta: false, skipped: "no_fbq" };
  if (!metaPixelId()) return { meta: false, skipped: "no_pixel_id" };
  const p = _s(path) || (typeof location !== "undefined" ? location.pathname : "");
  if (!shouldFire("meta_page_view|" + p)) return { meta: false, skipped: "duplicate" };
  try { f("track", "PageView"); return { meta: true, skipped: null }; }
  catch (e) { return { meta: false, skipped: "threw" }; }
}
