// lib/railPlacement.js — WHICH partner intent a static page should sell under.
//
// Audit findings F2/F3 (2026-08-02). Measured over 30 days of PostHog, top 25
// pages, 685 visitors: monetization density was INVERSELY correlated with
// traffic. The curated partner rail (34 hand-verified offers) and the deals
// rail (Disney, Universal, SeaWorld, LEGOLAND, Busch Gardens, Kennedy) mounted
// ONLY on /date-night, /family and their siblings — pages taking single-digit
// visitors each. Meanwhile:
//
//   /guides/*              ~276 visitors (40% of the top 25) — no rail
//   /things-to-do/[city]     31 visitors — no commerce AT ALL; lib/landing.js
//                            contained zero calls to any commerce helper
//
// /guides/things-to-do-orlando-not-theme-parks alone took 63 visitors, the
// second-most-visited page on the site, while Wayfind held 193 link-checked
// Orlando Viator products and 10 Orlando theme-park deals it never showed.
//
// THE RULE THIS FILE HOLDS, and it is the same one lib/browseCommerceMap.js
// holds for browse chips: a surface's inventory is DECLARED, never inherited.
// Every page type states which partner intent it sells under and why. Mounting
// a rail is cheap; mounting the WRONG rail spends trust — a theme-park deal
// under a restaurant guide is the "spa & wellness shows kayak tours" complaint
// in a new costume, so a restaurant guide sells date-night experiences (the
// registry's food/wine evening tours) and never attractions.

/**
 * The partner intent for a landing page category (lib/landing.js LANDING_CATS).
 *
 * `null` means SELL NOTHING HERE, and it is a real answer, not a gap:
 * `nightlife` has no bookable partner inventory in any of our programs — bars
 * are not ticketed — so a rail there could only be filled by something
 * irrelevant.
 */
export const LANDING_RAIL_INTENT = Object.freeze({
  "things-to-do": { intent: "best-of", why: "The page's whole promise is 'what should I do here', which is exactly what the best-of pick answers: a bookable local standout beside the durable place ranking." },
  restaurants: { intent: "date-night", why: "The registry's date-night copy queries food/wine evening tours, the only partner inventory that belongs beside a restaurant ranking. Attractions would not." },
  beaches: { intent: "family", why: "Beach-page intent skews to a group plan for the day; family inventory is water/parasailing-adjacent rather than indoor attractions." },
  nightlife: { intent: null, why: "No partner program sells bar or club inventory. A rail here could only be filled with something that does not belong, so it stays empty." },
});

/**
 * The partner intent for a guide, derived from what the guide IS.
 * Mirrors guideIntent() in lib/guideCta.js, which already classifies guides for
 * the primary CTA — this maps that classification to a partner intent so the
 * two cannot disagree about what a guide is about.
 *
 * `null` means sell nothing: a hotel guide's monetization is Stay22 on the
 * lodging links themselves, and stacking an attractions rail on top would
 * compete with the page's own converting path.
 */
export const GUIDE_RAIL_INTENT = Object.freeze({
  restaurant: { intent: "date-night", why: "Food/wine evening tours are the partner inventory that belongs beside a restaurant guide; a theme-park deal here is the spa-shows-kayak-tours mistake in a new costume." },
  tour: { intent: "best-of", why: "A tour guide's readers are already in booking intent; the best-of pick is the strongest bookable standout for the market." },
  hotel: { intent: null, why: "Lodging guides already monetize through Stay22 on their own links. A second, unrelated rail would compete with the page's converting path." },
  none: { intent: "best-of", why: "A general-interest guide gets the market's strongest bookable standout rather than nothing — it is the least assumptive pick." },
});

/** Partner intent for a landing category, or null to sell nothing. */
export function landingRailIntent(catSlug) {
  const row = LANDING_RAIL_INTENT[String(catSlug || "")];
  return row ? row.intent : null;
}

/** Partner intent for a guide, given guideIntent()'s classification. */
export function guideRailIntent(kind) {
  const row = GUIDE_RAIL_INTENT[String(kind || "none")];
  return row ? row.intent : null;
}
