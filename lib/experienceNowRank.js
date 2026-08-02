// lib/experienceNowRank.js — pure, additive ordering hints for the mixed
// affiliate/bookable-experience rails (app/components/IntentPartnerPick.js,
// app/home.js's UnifiedBrowseCommerceRail).
//
// Owner: "we need to make sure they are displayed by rating and discount,
// point based on the activity — time of today. Making something great that
// is not the best time of the day should show lower in ranking."
//
// TWO SIGNALS, BOTH ORDER-ONLY, NEITHER READS COMMISSION OR PAYOUT:
//
//   1. discountDepthBonus — a deeper, already-DISPLAYED discount (the same
//      badge text a shopper sees on the card, e.g. "40% off") earns a small
//      bump. This is a value signal FOR THE VISITOR, computed from the same
//      free-text badge the card already renders — never from a commission
//      rate or payout figure. lib/commerce.js is not imported here and never
//      will be (AGENTS.md §8; scripts/check-commerce-events.mjs enforces the
//      "no ranking module imports commerce" rule this module was written to
//      stay compatible with even though it isn't in that guard's file list).
//
//   2. timeOfDayBonus — follows the exact honesty rule lib/guideNow.js
//      documents for the same class of problem: "SUPPRESSION REQUIRES AN
//      EDITORIAL FACT; a soft read is an ORDERING HINT ONLY, never a gate."
//      If a pick's own title/eyebrow text reads as night-oriented (a sunset
//      cruise, a bar crawl) and it is currently mid-morning, it loses a
//      little ground to picks that fit right now — and gains it back after
//      dark. A wrong keyword read costs a position, never a listing; nothing
//      here ever hides a card.
//
// Both bonuses are intentionally small relative to the rating term they sit
// beside in evidenceScore/score (which top out around 10-10.4), so rating
// stays the dominant signal. See scripts/test-experience-now-rank.mjs.
//
// This module deliberately does NOT touch lib/experiencesData.js's
// rankExperiences() — that shared primitive is locked by
// scripts/test-ranked-experience-rails.mjs, which explicitly proves
// "selling-fast and low price cannot buy the first position." Time-of-day and
// discount-depth are layered on top of the SECOND, final sort each rail
// already applies to its complete mixed-provider list (evidenceScore in
// IntentPartnerPick.js, score in UnifiedBrowseCommerceRail), the same way
// lib/ranking.js's rankForNow/bucketAdjust layer conditions on top of a
// place's base score rather than rewriting it.

const DISCOUNT_PCT_RE = /(\d{1,3})\s*%\s*off/i;
const HALF_PRICE_RE = /\bhalf[- ]price\b/i;

/** 0-100, or 0 if no honest discount percent can be read from the text. */
export function discountDepthPct(text) {
  const hay = String(text || "");
  if (!hay) return 0;
  const m = DISCOUNT_PCT_RE.exec(hay);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 0;
  }
  if (HALF_PRICE_RE.test(hay)) return 50;
  return 0;
}

/**
 * Small, capped bump for a deeper discount — max +0.5 at 100% off, +0.1 at a
 * typical 20%-off badge. Never enough on its own to out-rank a materially
 * higher-rated pick sitting a few points above it on the same scale.
 */
export function discountDepthBonus(text) {
  return Math.min(0.5, discountDepthPct(text) / 200);
}

// scripts/check-one-clock.mjs: "the hour is read in ONE place" — bucketForHour
// (lib/nowContext.js) is THE shared daypart bucketer every other surface in
// the app uses (home.js alone calls it 10+ times); this module reuses it
// instead of re-deriving its own morning/afternoon/night split, which is
// exactly the private-bucketing bug that guard exists to prevent. Its buckets
// are morning [6,11.5), afternoon [11.5,17.5), night [17.5,24)+[0,6) — so a
// "lunch" text cue maps to "afternoon", the bucket lunchtime actually falls
// in, rather than inventing a fourth bucket nothing else in the app has.
import { bucketForHour } from "./nowContext.js";

const NIGHT_RE = /\b(sunset|evening|night|dinner|bar crawl|pub crawl|nightlife|rooftop|cocktail|dine[- ]around)\b/i;
const MORNING_RE = /\b(breakfast|brunch|sunrise|morning)\b/i;
const LUNCH_RE = /\b(lunch|midday)\b/i;

/**
 * Best-effort, editorial-free lean read off a pick's own text. Returns
 * "night" | "morning" | "afternoon" | null. null (no read either way) is the
 * common case and is never penalized — same discipline as
 * lib/guideNow.js's pickLeanHint.
 */
export function textTimeLean(text) {
  const hay = String(text || "");
  if (NIGHT_RE.test(hay)) return "night";
  if (MORNING_RE.test(hay)) return "morning";
  if (LUNCH_RE.test(hay)) return "afternoon";
  return null;
}

/**
 * Small ordering-only bump/penalty: +0.3 when a pick's own lean matches the
 * current shared daypart bucket, -0.3 when it points the opposite way (a
 * night pick during the morning commute, or vice versa), 0 whenever there is
 * no explicit read on either side, or the two leans are merely adjacent
 * (morning vs. afternoon) rather than opposed. hourFloat is the site-local
 * float hour from lib/nowContext.js's siteHourFloat() — callers must get it
 * from there, never from a private getHours() read (check-one-clock.mjs).
 */
export function timeOfDayBonus(text, hourFloat) {
  const lean = textTimeLean(text);
  const now = Number.isFinite(Number(hourFloat)) ? bucketForHour(Number(hourFloat)) : null;
  if (!lean || !now) return 0;
  if (lean === now) return 0.3;
  const opposite = (lean === "night" && now === "morning") || (lean === "morning" && now === "night");
  return opposite ? -0.3 : 0;
}
