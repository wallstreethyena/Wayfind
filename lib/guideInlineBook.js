// lib/guideInlineBook.js — the first guide conversion test ("guide-inline-book-v1").
//
// THE EVIDENCE (US readers, PostHog, Sep 2026). /guides/things-to-do-orlando-
// not-theme-parks takes ~119 real US visits a week and 76% leave without one
// tap after ~33 s at ~49% depth. Mapped at 390x844 (16.6 screens):
//   screen 2   a 28-card "Bookable highlights" carousel, BEFORE any editorial
//              pick (seen by ~470 guide sessions / 30 d, ~1.5% tapped)
//   screen 3   pick 1 "Airboat the Everglades headwaters" — its own tip says
//              "Reserve ahead", yet the pick offers only "Open place" and
//              "Explore this place". No price, duration, rating or "best for".
//   ~85%       the end-of-guide block, which on this guide carries no
//              monetized CTA at all.
// So the reader meets the booking option out of context (above the pick) and
// meets the pick with no way to act on it.
//
// THE CHANGE, and nothing else: in the TREATMENT arm, picks 1–3 gain a one-line
// "Best for" decision cue, and pick 1 gains ONE booking option for the thing it
// recommends (an airboat ride near Orlando), with price, duration and rating.
// The server-rendered HTML is identical for both arms (the treatment mounts
// after hydration), so what Google indexes does not change.
//
// Honesty rules the copy follows: every cue restates the pick's own blurb/tip;
// the offer is labelled "near Orlando", never as the named venue (Boggy Creek
// is not the product), and it comes from the same link-checked inventory and
// /api/commerce/go route the carousel already uses.
//
// Versioned key: any change to the treatment or its measurement bumps -v1.

import { variantForId } from "./experiment.js";
import { qualifyPartnerInventory } from "./intentPartnerPicks.js";

export const GUIDE_INLINE_BOOK_KEY = "guide-inline-book-v1";
export const GUIDE_INLINE_BOOK_FEATURE_PROP = "$feature/" + GUIDE_INLINE_BOOK_KEY;
export const GUIDE_INLINE_BOOK_TREATMENT_PCT = 50;

// Minimum quality for the one offer we put next to a recommendation.
export const INLINE_OFFER_MIN_RATING = 4.5;
export const INLINE_OFFER_MIN_REVIEWS = 100;

export const GUIDE_INLINE_BOOK = Object.freeze({
  "things-to-do-orlando-not-theme-parks": Object.freeze({
    city: "Orlando",
    picks: Object.freeze({
      0: Object.freeze({
        bestFor: "a fast, genuinely wild hour on open marsh — not a staged park course",
        book: Object.freeze({ match: "airboat", heading: "Book an airboat ride near Orlando" }),
      }),
      1: Object.freeze({ bestFor: "a slow hour on the water, then lunch on Park Avenue — bring cash for the dock" }),
      2: Object.freeze({ bestFor: "confident paddlers with a free morning (launch window 8am–noon)" }),
    }),
  }),
});

export function inlineBookConfig(slug, pickIndex) {
  const guide = GUIDE_INLINE_BOOK[slug];
  if (!guide) return null;
  const pick = guide.picks[pickIndex];
  return pick ? { city: guide.city, ...pick } : null;
}

/** Pure: which arm this persistent id belongs to for this test. */
export function inlineBookVariant(id) {
  return id ? variantForId(id, GUIDE_INLINE_BOOK_KEY, GUIDE_INLINE_BOOK_TREATMENT_PCT) : null;
}

/**
 * Pure: the single best offer for a pick, or null. Only link-checked inventory
 * (qualifyPartnerInventory), only titles that name the activity as a word,
 * only offers with a real price and enough reviews to stand behind. Ties go to
 * the most-reviewed product. Null means the pick shows its cue and no offer —
 * never a search, never a loosened match.
 */
export function chooseInlineOffer(rows, match) {
  if (!match) return null;
  const word = new RegExp(`\\b${String(match).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const best = qualifyPartnerInventory(rows)
    .filter((row) => word.test(String(row.title || "")))
    .filter((row) => Number(row.rating) >= INLINE_OFFER_MIN_RATING && Number(row.reviews) >= INLINE_OFFER_MIN_REVIEWS)
    .filter((row) => Number.isFinite(Number(row.fromPrice)) && Number(row.fromPrice) > 0)
    .sort((a, b) => Number(b.reviews) - Number(a.reviews))[0];
  if (!best) return null;
  return {
    provider: String(best.provider || "viator"),
    offerId: String(best.code || best.product_code),
    title: String(best.title),
    rating: Number(best.rating),
    reviews: Number(best.reviews),
    fromPrice: Math.round(Number(best.fromPrice)),
    duration: best.duration ? String(best.duration) : null,
  };
}
