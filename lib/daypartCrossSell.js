// lib/daypartCrossSell.js — the ONE central daypart -> offer-kind policy for
// cross-sell/partner-offer surfaces.
//
// WHY THIS EXISTS (Lane D, 2026-09-22). lib/pairsWellWith.js (the detail-page
// discovery loop) and lib/experienceNowRank.js's timeOfDayBonus (Viator
// experiences + UT deals in UnifiedBrowseCommerceRail, and every rail
// IntentPartnerPick.js renders) already lean an offer's ORDER toward the
// current daypart. MENU_PARTNER_OFFERS — the newest lane (2026-09-16),
// Klook/Tiqets/TicketNetwork/GoCity/CityPASS/Awin rows keyed by browse chip —
// never went through either mechanism: its rows always rendered with
// rankBonus: 0, so a theme-park all-day ticket, a sunset cruise or a
// nightclub sat at the exact same rank at 9am as at 9pm. This module closes
// that gap with the SAME shape and the SAME small, capped, order-only bonus
// lib/experienceNowRank.js already uses, so the two mechanisms stay
// consistent rather than drifting into two private opinions about "night".
//
// LAWS (same as lib/experienceNowRank.js and lib/pairsWellWith.js):
//  · ORDER-ONLY. Nothing here ever removes a card — see lib/dayparts.js's own
//    header: "an off-peak card is parked on the right, one swipe away, never
//    removed." A daypart-inappropriate offer loses a little ground; it is
//    never hidden. scripts/check-daypart-crosssell.mjs enforces this by
//    reading source, not by trusting a comment.
//  · MERIT/COMMISSION-FREE. This module never imports lib/commerce.js and
//    never reads a provider, price, commission or payout field off a row —
//    only the browse chip (`cat`/`sub`), a title/offerId string, and the
//    hour. Ordering never uses commission (CLAUDE.md).
//  · ONE CLOCK. The hour comes from lib/dayparts.js's partForHour(), which is
//    itself derived from lib/nowContext.js's siteHourFloat() — never a
//    private getHours() read (see scripts/check-one-clock.mjs).
//  · THE FOUR BANDS ARE lib/dayparts.js's DAYPART_IDS (morning, lunch,
//    afternoon, night) — the same bands the homepage rail order already
//    uses, not a fifth private bucketing.
import { partForHour, DAYPART_IDS } from "./dayparts.js";

/**
 * The offer kinds this policy knows about. Every MENU_PARTNER_OFFERS `fits`
 * chip (`cat:sub`) resolves to exactly one of these — see crossSellKindFor().
 */
export const CROSSSELL_KINDS = Object.freeze([
  "nightlife",       // clubs, music venues, bars — TicketNetwork/Tiqets rows under nightlife:*
  "sports-event",    // ballparks/stadiums/arenas — day games exist, so this stays neutral
  "day-ticket",       // theme-park / water-park admission — a same-day sell stops making sense once the gates have closed for the night
  "sunset-cruise",    // title/offerId names "sunset" — the golden window has passed by night
  "tour",             // guided/self-guided tours, trolleys, airboats — daytime activities
  "day-attraction",   // museums, landmarks, arts, indoor attractions, general family/attractions — most close by night
  "outdoor-activity",  // boat rentals, marinas without a sunset framing — no strong lean either way
  "general",          // anything this policy has no opinion on
]);

const SUNSET_RE = /\bsunset\b/i;

/**
 * Classify one offer into a CROSSSELL_KINDS entry from its browse chip
 * (`cat`, `sub` — the same `cat:sub` shape as MENU_PARTNER_OFFERS' `fits` and
 * the menu-offers route's `subcategory`) plus its own display text. Title is
 * checked BEFORE the chip lookup for the sunset case — Tiqets' sunset cruise
 * rows live under attractions:beaches / attractions:marinas alongside the
 * (all-hours-fine) dolphin cruise, and only the row's own name tells the two
 * apart; the same discipline lib/pairsWellWith.js's pairRole() and
 * lib/experienceNowRank.js's textTimeLean() already use — read the row's own
 * facts, never guess from the chip alone.
 */
export function crossSellKindFor({ cat, sub, title, offerId } = {}) {
  const c = String(cat || "").toLowerCase();
  const s = String(sub || "").toLowerCase();
  const text = `${title || ""} ${offerId || ""}`;
  if (SUNSET_RE.test(text)) return "sunset-cruise";
  if (c === "nightlife") return s === "sports" ? "sports-event" : "nightlife";
  if (c === "family") return "day-attraction";
  if (c === "attractions") {
    if (s === "themeparks") return "day-ticket";
    if (s === "tours") return "tour";
    if (s === "outdoors" || s === "marinas") return "outdoor-activity";
    return "day-attraction"; // museums, arts, landmarks, family, beaches, "all"
  }
  return "general";
}

/**
 * Daypart bands (lib/dayparts.js DAYPART_IDS) each kind should be pushed
 * AWAY from ("no daypart-inappropriate kinds" leading the rail) or PULLED
 * TOWARD ("each daypart yields >=1 sensible pick"). A kind absent from both
 * maps is neutral in every band — scripts/check-daypart-crosssell.mjs proves
 * every DAYPART_ID has at least one PREFER'd kind with real inventory behind
 * it, and that every AVOID pairing actually scores negative.
 */
const AVOID = Object.freeze({
  // Nightlife venues pitched at breakfast/lunch — the exact "dinner/nightlife
  // offers at 8am" bug this lane exists to fix.
  nightlife: new Set(["morning", "lunch"]),
  // A same-day, full-day park ticket pitched after the gates have closed.
  "day-ticket": new Set(["night"]),
  // Museums/landmarks/family attractions are, overwhelmingly, closed by night.
  "day-attraction": new Set(["night"]),
  // Guided tours run in daylight.
  tour: new Set(["night"]),
  // The window a "sunset cruise" sells has passed by the time night's band
  // (17:30-06:00) is underway.
  "sunset-cruise": new Set(["night"]),
});

const PREFER = Object.freeze({
  nightlife: new Set(["afternoon", "night"]),
  "day-ticket": new Set(["morning", "lunch", "afternoon"]),
  "day-attraction": new Set(["morning", "lunch", "afternoon"]),
  tour: new Set(["morning", "lunch", "afternoon"]),
  "sunset-cruise": new Set(["afternoon"]),
});

// Same magnitude as lib/experienceNowRank.js's timeOfDayBonus — small enough
// that a materially higher-rated pick a few points up the 0-10.4 scale is
// never out-ranked by daypart fit alone.
export const CROSSSELL_BONUS = 0.3;

/**
 * The bonus/penalty, order-only, for one offer kind at one float hour.
 * +CROSSSELL_BONUS when the daypart prefers this kind, -CROSSSELL_BONUS when
 * the daypart actively avoids it, 0 (no opinion) otherwise — including for
 * every kind absent from both maps, e.g. sports-event, outdoor-activity,
 * general.
 */
export function daypartCrossSellBonus(kind, hourFloat) {
  const part = partForHour(Number(hourFloat));
  if (AVOID[kind]?.has(part)) return -CROSSSELL_BONUS;
  if (PREFER[kind]?.has(part)) return CROSSSELL_BONUS;
  return 0;
}

/** Convenience: classify then score in one call. */
export function daypartCrossSellBonusFor(offer, hourFloat) {
  return daypartCrossSellBonus(crossSellKindFor(offer), hourFloat);
}

export { DAYPART_IDS };
