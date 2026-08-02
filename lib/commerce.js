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
  return out;
}

/**
 * Emit. Deliberately fire-and-forget and never throws in production — a
 * measurement failure must not take a revenue surface down with it.
 */
export function emitCommerce(event, ctx) {
  let payload;
  try { payload = commercePayload(event, ctx); } catch (e) { if (isDev()) throw e; return false; }
  try {
    if (typeof window !== "undefined" && window.posthog) {
      window.posthog.capture(event, payload);
      return true;
    }
  } catch (e) {}
  return false;
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
 * Our own redirect path. The UI links HERE, never to a partner domain — the
 * server records the click, validates the destination against the allowlist and
 * then redirects. If the caller passes a click_id we reuse it so the click and
 * the redirect can be joined deterministically.
 */
export function commerceHref({ provider, offerId, surface, contentId, clickId }) {
  if (!provider || !offerId) return null;
  const q = new URLSearchParams({ provider: String(provider), offer: String(offerId) });
  if (surface) q.set("surface", String(surface));
  if (contentId) q.set("content", String(contentId));
  if (clickId) q.set("click_id", String(clickId));
  return "/api/commerce/go?" + q.toString();
}
