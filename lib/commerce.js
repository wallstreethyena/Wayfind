// lib/commerce.js — the commerce event layer (schema of 2026-07-16).
//
// WHY THIS EXISTS, IN ONE FACT
// Fourteen days of PostHog show ZERO non-owner clicks on any monetized link. The
// only click events in the codebase are the legacy `*_out` family (book_it_out,
// eats_out, tickets_out, tour_card_out, …), and every one of them fires on CLICK.
// So a zero tells us nothing: we cannot distinguish "nobody wants it" from
// "nobody ever saw it". There has never been an IMPRESSION event on a money link.
//
// commerce_impression is therefore the most important event here, not
// commerce_cta_clicked. It converts a flat zero into a measurable funnel:
// rendered → viewable → clicked → redirected → confirmed.
//
// TWO HARD RULES FROM THE SCHEMA, BOTH ENFORCED IN CODE BELOW
//
// 1. COMMERCE IS SEPARATE FROM THE RANKER. No commerce event or field may be read
//    by any score, sort or eligibility query. Nothing in this module is exported
//    in a shape a ranker could consume, and scripts/check-commerce-events.mjs
//    fails the build if a ranking module imports it. The reason is integrity: the
//    moment payout can influence rank, every ranking claim on the site becomes a
//    lie, and AGENTS.md §8 already forbids affinity feeding a displayed score.
//
// 2. THE UI NEVER CONSTRUCTS PARTNER URLS. Clicks resolve through a server-side
//    redirect that mints the click event and the opaque click_id. This module
//    emits events; it does not build affiliate links. `commerceHref` returns our
//    OWN redirect path, never a partner domain.
//
// PRIVACY IS A WHITELIST, NOT A BLACKLIST. Only the fields named in
// CONTEXT_FIELDS are ever sent. Anything else is dropped, and the forbidden
// shapes below (email, coordinates, account ids, free text) additionally throw in
// development so the mistake surfaces while it is cheap. Raw geolocation, emails,
// user ids, itinerary contents and free-text search strings are never sent —
// where sub-ID attribution is allowed, only the expiring click_id goes out.

// The ten events the schema defines. An event outside this set is a typo, and a
// typo is worse than a missing event: it produces a dashboard that reads as zero.
import { captureOrQueue } from "./browserAnalytics.js";

export const COMMERCE_EVENTS = Object.freeze([
  "commerce_impression",        // CTA rendered AND viewable — one per offer per view
  "commerce_cta_clicked",       // precedes the redirect
  "provider_redirect_started",  // server
  "provider_redirect_failed",   // server; carries failure_reason + the fallback taken
  "provider_postback_received", // server; idempotent on click_id
  "booking_confirmed",
  "booking_cancelled",
  "fallback_clicked",
  "disclosure_viewed",          // FTC evidence
  "offer_expired",
]);

// NON-COMMERCE CARD EVENTS. Deliberately a SEPARATE set from COMMERCE_EVENTS.
//
// WHY NOT JUST EMIT commerce_impression FOR EVERY CARD. Because a free local
// offer earns nothing, and folding it into the commerce funnel silently inflates
// the denominator of every revenue rate we compute — CTR, conversion and revenue
// per impression would all quietly fall as we add free inventory, which is the
// opposite of what adding it does. These events answer a DESIGN question ("does a
// card with a photograph get tapped more?") and must not contaminate the revenue
// question.
//
// They carry no provider, no offer_id and no click_id: nothing here is an
// attribution record, so nothing here belongs in a payout dispute.
export const CARD_EVENTS = Object.freeze([
  "card_impression", // card rendered AND viewable — one per card per view
  "card_clicked",    // the card's primary action was tapped
]);

// The only context fields permitted to leave the client.
export const CONTEXT_FIELDS = Object.freeze([
  "surface", "content_id", "city_id", "category", "canonical_place_id",
  "provider", "merchant", "offer_id", "rank_bucket", "party_size_bucket",
  "lead_time_bucket", "experiment_id", "variant", "click_id", "disclosure_version",
]);

// Extra fields the non-commerce card events may carry, on top of CONTEXT_FIELDS.
// Both are design facts, not money facts: which treatment rendered, and what kind
// of card it was. Kept out of CONTEXT_FIELDS so a commerce payload can never
// accidentally start describing a layout experiment.
export const CARD_FIELDS = Object.freeze(["has_art", "card_type"]);

// Value fields, booking events only.
export const VALUE_FIELDS = Object.freeze([
  "gross_booking_value", "currency", "commission_estimate",
  "commission_confirmed", "booking_status", "provider", "category",
]);

// Shapes that must never appear in a payload, whatever they are called. These are
// checked on VALUES, not just names, because the usual way personal data escapes
// is a correctly-named field carrying the wrong thing.
const FORBIDDEN_VALUE = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
  [/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/, "a coordinate pair"],
];

// RANK MUST BE COARSE. The schema forbids a raw rank tied to payout: a precise
// rank beside a commission figure is the evidence trail for pay-for-placement,
// which is the accusation the whole ranking method exists to be able to refute.
export function rankBucket(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n <= 3) return "top3";
  if (n <= 10) return "4-10";
  return "11+";
}

const isDev = () => {
  try { return process.env.NODE_ENV !== "production"; } catch { return false; }
};

/**
 * Build a schema-valid payload. Unknown keys are DROPPED (never sent), and
 * forbidden value shapes throw in development.
 */
export function commercePayload(event, ctx) {
  if (!COMMERCE_EVENTS.includes(event) && !CARD_EVENTS.includes(event)) {
    throw new Error(
      "commerce: unknown event '" + event + "'. A typo here renders as zero on the " +
      "dashboard, which is indistinguishable from nobody clicking. Add it to " +
      "COMMERCE_EVENTS deliberately or fix the spelling."
    );
  }
  const allowed = event === "booking_confirmed" || event === "booking_cancelled"
    ? CONTEXT_FIELDS.concat(VALUE_FIELDS)
    : CARD_EVENTS.includes(event)
      ? CONTEXT_FIELDS.concat(CARD_FIELDS)
      : CONTEXT_FIELDS;
  const out = {};
  for (const [k, v] of Object.entries(ctx || {})) {
    if (!allowed.includes(k)) continue; // dropped, silently by design: a whitelist
    if (v == null || v === "") continue;
    const s = String(v);
    // `continue` inside the pattern-match loop below only ever skipped to the
    // NEXT forbidden pattern, not past the `out[k] = v` assignment after the
    // loop — so a forbidden value fell straight through into the payload in
    // production (isDev() false) instead of being dropped. That defeated the
    // entire point of this check: PII escaped by value while every guard
    // assertion for it kept passing, because the guard itself was only ever
    // exercised outside NODE_ENV=production. Track the match explicitly and
    // skip the assignment for real.
    let forbidden = null;
    for (const [rx, what] of FORBIDDEN_VALUE) {
      if (rx.test(s)) { forbidden = what; break; }
    }
    if (forbidden) {
      if (isDev()) throw new Error(`commerce: field "${k}" carries ${forbidden} — the schema forbids personal data on commerce events`);
      continue; // in production, drop rather than break the page
    }
    out[k] = v;
  }
  if (event === "provider_redirect_failed" && !out.failure_reason && ctx && ctx.failure_reason) {
    out.failure_reason = String(ctx.failure_reason).slice(0, 120);
  }
  // resolver_path (2026-08-25): WHICH rung of the destination ladder the
  // redirect actually took — "store" | "search-fallback" | "product" |
  // "destination-fallback" | ... . Redirect events only, same carve-out shape
  // as failure_reason. This is what separates "handoff degraded to an
  // attributed search" (a soft outcome to improve) from "handoff failed"
  // (a hard error to page on) — before it, both counted as failures and the
  // failure-rate alert could never be tuned below the fallback rate.
  if ((event === "provider_redirect_started" || event === "provider_redirect_failed") && !out.resolver_path && ctx && ctx.resolver_path) {
    out.resolver_path = String(ctx.resolver_path).slice(0, 60);
  }
  return out;
}

/**
 * Emit. Deliberately fire-and-forget and never throws in production — a
 * measurement failure must not take a revenue surface down with it.
 */
export function emitCommerce(event, ctx) {
  let payload;
  try { payload = commercePayload(event, ctx); } catch (e) { if (isDev()) throw e; return false; }
  // Through the pre-ready queue, never the raw SDK global: an impression on an
  // above-the-fold card fires before the idle-booted SDK exists, and a raw
  // "is the SDK there yet" check silently dropped it. Owner/bot sessions are
  // refused inside captureOrQueue and never queued.
  if (typeof window === "undefined") return false;
  const captured = !!captureOrQueue(window, event, withAcquisition(event, payload));
  // Mirror booking-CTA clicks into the Supabase events table under the same
  // event name (lib/likeSignal.recordCommerceClick), so the funnel is
  // queryable next to detail_open/save/like instead of PostHog-only. Lazy
  // imports: this module is also loaded by server routes, and a measurement
  // mirror must never break or slow the click itself. Suppressed sessions and
  // WF_SUPPRESS_ANALYTICS="1" guard runs never import or initialize Supabase.
  const envSuppressed = typeof process !== "undefined" && process.env && process.env.WF_SUPPRESS_ANALYTICS === "1";
  if (event === "commerce_cta_clicked" && captured && !envSuppressed) {
    try {
      Promise.all([import("./supabase"), import("./likeSignal")]).then(([sbm, lsm]) => {
        try {
          const sb = sbm && sbm.supabase;
          if (!sb || lsm.likeEventSuppressed()) return;
          sb.auth.getSession().then(({ data }) => {
            const user = data && data.session && data.session.user ? data.session.user : null;
            lsm.recordCommerceClick({
              place_id: payload.canonical_place_id || payload.content_id || null,
              provider: payload.provider, merchant: payload.merchant,
              offer_id: payload.offer_id, surface: payload.surface, content_id: payload.content_id,
            }, { supabase: sb, user });
          }, () => { lsm.recordCommerceClick({ place_id: payload.canonical_place_id || payload.content_id || null, provider: payload.provider, merchant: payload.merchant, offer_id: payload.offer_id, surface: payload.surface, content_id: payload.content_id }, { supabase: sb, user: null }); });
        } catch (e) {}
      }, () => {});
    } catch (e) {}
  }
  return captured;
}

// ACQUISITION ON THE CLICK (2026-10-18). The partner URL carries only where
// on Wayfind the click happened (Viator campaign tag); WHERE THE VISITOR CAME
// FROM stays here, in PostHog, on the commerce_cta_clicked event: the stored
// first-touch utm_* (written by lib/attribution.js under "wf_attribution")
// plus a paid_click boolean (a gclid/gbraid/wbraid or cpc medium is present).
// The click-id VALUES stay session-level ($entry_gclid), the same rule
// lib/track.js follows. Never added to any other event, never to a URL.
// Read inline rather than importing lib/attribution.js: that module pulls the
// Capacitor bridge, and this file is also loaded by server routes.
const ACQ_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const ACQ_CLICK_IDS = ["gclid", "gbraid", "wbraid"];
function storedAttribution() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("wf_attribution") : null;
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === "object" ? o : {};
  } catch (e) { return {}; }
}
export function withAcquisition(event, payload, attr) {
  if (event !== "commerce_cta_clicked" || !payload) return payload;
  try {
    const a = attr || storedAttribution();
    const ok = (v) => typeof v === "string" && v.trim() && v.length <= 200 && v.indexOf("@") < 0;
    const out = { ...payload };
    for (const k of ACQ_UTM) if (ok(a[k])) out[k] = a[k].trim();
    const medium = ok(a.utm_medium) ? a.utm_medium.toLowerCase() : "";
    out.paid_click = ACQ_CLICK_IDS.some((k) => ok(a[k])) || medium === "cpc" || medium === "ppc" || medium === "paid";
    return out;
  } catch (e) { return payload; }
}

/**
 * A deterministic click identifier that survives the client → server handoff.
 * Generating it on the client lets `commerce_cta_clicked` and
 * `provider_redirect_started` share a single key, so a click can be tied back to
 * the card that produced it. Falls back to a timestamped random string if the
 * browser lacks crypto.randomUUID.
 */
export function mintClickId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return "wf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Accept the click_id shapes the client actually mints — a UUID or the
 * documented `wf-<base36>-<base36>` fallback — and refuse anything injectable.
 * /api/viator/go already used this; /api/commerce/go used UUID_LIKE and
 * silently reminted, so a same-tab Book hop could not join
 * provider_redirect_started to commerce_cta_clicked.
 */
export function sanitizeClientClickId(v) {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

/**
 * Hydrated Book href for a pinned place on /places/[id]. Fail-closed: an
 * unattributed Book URL (no client click_id) is the Trust smoke failure
 * on Shell Key 173028P1 and must not paint.
 */
export function placePageBookHref({ provider, offerId, contentId, clickId }) {
  if (!sanitizeClientClickId(clickId)) return null;
  return commerceHref({ provider, offerId, surface: "place_page", contentId, clickId });
}

/**
 * Our own redirect path. The UI links HERE, never to a partner domain — the
 * server records the click, validates the destination against the allowlist and
 * then redirects. If the caller passes a click_id we reuse it so the click and
 * the redirect can be joined deterministically.
 */
export function commerceHref({ provider, offerId, surface, contentId, clickId, page }) {
  if (!provider || !offerId) return null;
  const q = new URLSearchParams({ provider: String(provider), offer: String(offerId) });
  if (surface) q.set("surface", String(surface));
  if (contentId) q.set("content", String(contentId));
  if (clickId) q.set("click_id", String(clickId));
  // Optional page key (e.g. "g-<guide slug>") for the Viator campaign tag;
  // reduced to [a-z0-9-] so it can never carry a query or PII.
  const pageKey = String(page || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (pageKey) q.set("page", pageKey);
  return "/api/commerce/go?" + q.toString();
}

/**
 * Add the page key to one of OUR redirect hrefs (/api/commerce/go or
 * /api/viator/go), for the Viator campaign tag. Any other href is returned
 * untouched, so this can never decorate a partner URL or an external link.
 */
export function withPageParam(href, page) {
  const s = String(href || "");
  if (!/^\/api\/(commerce|viator)\/go\?/.test(s)) return href;
  const pageKey = String(page || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!pageKey) return href;
  const [path, query] = s.split("?");
  const q = new URLSearchParams(query);
  q.set("page", pageKey);
  return path + "?" + q.toString();
}
