// lib/funnel.js — the money funnel, declared once so it can be READ.
//
// THE FUNNEL (owner, 2026-07-30):
//   cuisine_chip -> cuisine_place_open -> detail_open -> commerce_impression
//                                                     -> commerce_cta_clicked
//
// WHY A DECLARATION AND NOT A DASHBOARD NOTE. Five events, emitted by three
// different mechanisms (lib/track for standalone pages, home.js's own logEvent
// in-app, emitCommerce for the commerce schema), across four surfaces. Nothing
// forced them to agree on property names, and a funnel breakdown is only as good
// as the weakest joint: if `cuisine` is `cuisine` on one step and `category` on
// the next, the breakdown silently returns nothing rather than erroring.
//
// THE MEASUREMENT TRAP THIS EXISTS TO PREVENT
// A person-ordered funnel over these five events looks readable today and is NOT.
// Steps 4 and 5 fire on the shortlist rows and the tour rail — surfaces that
// BYPASS the detail sheet — while the detail sheet's own four money CTAs
// (book_it_out, tickets_out, eats_out, tour_card_out) emit legacy click-only
// events and NO commerce_* events at all. So the funnel shows a cliff at
// detail_open, and that cliff reads as "users don't convert" when the truth is
// "we never instrumented that path". A zero you cannot distinguish from an
// absence is the same failure the commerce_impression event was created to fix.
//
// UNINSTRUMENTED_MONEY_SURFACES below names that gap explicitly, and
// scripts/check-money-funnel.mjs RATCHETS it: the list may shrink, never grow.

/** The ordered steps. `key` is the PostHog event name. */
export const FUNNEL_STEPS = Object.freeze([
  { step: 1, key: "cuisine_chip", surface: "cuisine_sheet", what: "picked a kind of food" },
  { step: 2, key: "cuisine_place_open", surface: "cuisine_shortlist", what: "opened a place from the shortlist" },
  { step: 3, key: "detail_open", surface: "detail", what: "saw the place detail" },
  { step: 4, key: "commerce_impression", surface: "*", what: "a money link became viewable" },
  { step: 5, key: "commerce_cta_clicked", surface: "*", what: "clicked the money link" },
]);

/**
 * Properties every step must carry for a breakdown to work.
 *
 * `metro` vs `city_id` is the real hazard: lib/track surfaces send `metro`, the
 * commerce schema's whitelist (lib/commerce CONTEXT_FIELDS) has no `metro` and
 * would DROP it — it accepts `city_id`. So the join key differs by emitter, and
 * that is recorded here rather than discovered during an audit.
 */
export const JOIN_KEYS = Object.freeze({
  track: { metro: "metro", cuisine: "cuisine", place: "place_id" },
  commerce: { metro: "city_id", cuisine: "category", place: "canonical_place_id" },
});

/** Which emitter each step goes through — they are NOT interchangeable. */
export const STEP_EMITTER = Object.freeze({
  cuisine_chip: "track",
  cuisine_place_open: "track",
  detail_open: "logEvent",
  commerce_impression: "commerce",
  commerce_cta_clicked: "commerce",
});

/**
 * Money surfaces that render an earning CTA but emit NO commerce_* event.
 * Each entry is a real gap in tonight's funnel read, named so the audit sees a
 * documented break instead of an ambiguous zero.
 *
 * RATCHET: scripts/check-money-funnel.mjs fails if this list grows. Removing an
 * entry requires the surface to actually emit commerce_impression AND
 * commerce_cta_clicked — the guard checks, it does not take the list's word.
 */
export const UNINSTRUMENTED_MONEY_SURFACES = Object.freeze([
  { file: "app/components/BookItLink.js", legacy: "book_it_out",
    why: "the Detail sheet's PRIMARY money CTA — live in prod since NEXT_PUBLIC_BOOK_IT was set, and the single biggest hole in the funnel" },
  { file: "app/components/BookingCTA.js", legacy: "tickets_out",
    why: "Viator tickets/tours CTA on the detail sheet; booking-integrity lane, coordinate before instrumenting" },
  { file: "app/components/BookingCTA.js", legacy: "tour_card_out",
    why: "the 'Viator options nearby' card list, same component and lane" },
  { file: "app/home.js", legacy: "tickets_out",
    why: "three in-app Viator rails (home_bookable, exp_rail, ttd_rail) fire tickets_out on click with no impression — the in-app equivalent of the same blind spot, and another lane's file, so it is NAMED here rather than edited" },
]);

/** Step lookup by event name. */
export function stepFor(eventName) {
  return FUNNEL_STEPS.find((s) => s.key === eventName) || null;
}

/**
 * The property names a given step must carry, resolved for ITS emitter.
 * Callers use this instead of hardcoding a key, so a step can never be shipped
 * with the wrong dialect of the join key.
 */
export function joinKeysFor(eventName) {
  const emitter = STEP_EMITTER[eventName];
  if (!emitter) return null;
  return emitter === "commerce" ? JOIN_KEYS.commerce : JOIN_KEYS.track;
}

/**
 * Build the join payload for a step in the right dialect.
 * Returns only the keys with values — an empty string would land in PostHog as a
 * real value and split a breakdown into a phantom bucket.
 */
export function funnelProps(eventName, { metro, cuisine, placeId } = {}) {
  const keys = joinKeysFor(eventName);
  if (!keys) return {};
  const out = {};
  if (metro) out[keys.metro] = metro;
  if (cuisine) out[keys.cuisine] = cuisine;
  if (placeId) out[keys.place] = placeId;
  return out;
}

/** How complete is the funnel, as a number the audit can quote. */
export function funnelCoverage() {
  return {
    steps: FUNNEL_STEPS.length,
    uninstrumentedMoneySurfaces: UNINSTRUMENTED_MONEY_SURFACES.length,
    // The detail path cannot be read end-to-end while any of the above are open.
    detailPathReadable: UNINSTRUMENTED_MONEY_SURFACES.length === 0,
  };
}
