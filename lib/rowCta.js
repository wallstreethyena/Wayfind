// lib/rowCta.js — the one place that decides a shortlist row's primary action.
//
// PURE and in lib/ so scripts/check-cuisine-shortlist.mjs can CALL it. A ladder
// buried in JSX can only ever be grepped, and this ladder decides whether a row
// earns — which is exactly the kind of decision that must be tested by invoking
// it, not by reading it (CLAUDE.md: assert on the CALL, not the string).
//
// THE LADDER, in the owner's order:  deal > bookable > directions
// (delivery was the third rung until 2026-08-26 — removed with Uber Eats,
// owner directive; see lib/affiliates.js REMOVED note. It was the only branch
// that fired, and it fired UNTRACKED.)
// Directions is ALWAYS offered as the quiet secondary, so a row can never become
// a dead end when every monetized branch is dark.
//
// SHIPS DARK, DELIBERATELY. Verified 2026-07-30 against the live code:
//   deal      couponForPlaceName() is name-keyed and the registry currently holds
//             only MARKET-level offers ("Half-price dining certificates in
//             Sarasota"), so no row matches yet. Wired exactly as-is so that when
//             GWEN's per-merchant Clipp seeding lands, chips appear with ZERO
//             code change here. That is the design, not an oversight.
//   bookable  hasBookingCTA() returns false for every restaurant kind —
//             BOOKABLE_KINDS has no food kind and isTicketyPlace excludes
//             restaurants — and no reservation partner (OpenTable/Resy) exists in
//             the codebase. Wired and dark pending a business decision.
//   directions always available.
//
// MONETIZED IS NOT THE SAME AS WORKING, and the disclosure follows the money:
// `monetized` is computed from whether the link actually earns, and the FTC
// line renders off that flag — never off "this row has a CTA".

/** Verb-first labels (KIMI's spec). A label names the action, not the partner. */
export const CTA_LABELS = Object.freeze({
  deal: "Claim the deal",
  bookable: "Reserve a table",
  directions: "Directions",
});

/** Google Maps directions for a place — never monetized, always available. */
export function directionsUrl(place) {
  if (!place) return null;
  const q = place.id
    ? "place_id:" + place.id
    : [place.name, place.city].filter(Boolean).join(" ");
  return "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(place.name || "") + (place.id ? "&destination_place_id=" + encodeURIComponent(place.id) : "") +
    (q ? "" : "");
}

/**
 * Resolve the primary action for one row.
 *
 * Every branch is passed IN rather than looked up here, so this stays pure and a
 * guard can drive all four rungs deterministically.
 *
 * @param {object}  a
 * @param {object}  [a.deal]             live coupon for this place, or null
 * @param {string}  [a.bookingUrl]       resolved booking href, or null
 * @param {string}  [a.mapsUrl]          directions href
 * @returns {{type:string,label:string,href:string|null,monetized:boolean,provider:string|null,offerId:string|null}}
 */
export function resolveRowCta({ deal, bookingUrl, mapsUrl } = {}) {
  if (deal && (deal.url || deal.affiliateUrl)) {
    return {
      type: "deal", label: CTA_LABELS.deal,
      href: deal.url || deal.affiliateUrl, monetized: true,
      provider: deal.provider || null,
      offerId: deal.offerId || deal.id || null,
    };
  }
  if (bookingUrl) {
    return { type: "bookable", label: CTA_LABELS.bookable, href: bookingUrl, monetized: true, provider: null, offerId: null };
  }
  return { type: "directions", label: CTA_LABELS.directions, href: mapsUrl || null, monetized: false, provider: null, offerId: null };
}

/**
 * The quiet secondary. Directions is always present EXCEPT when it is already the
 * primary — two identical buttons stacked would read as a rendering bug.
 */
export function secondaryCta(primary, mapsUrl) {
  if (!primary || primary.type === "directions") return null;
  return { type: "directions", label: CTA_LABELS.directions, href: mapsUrl || null, monetized: false };
}

/**
 * Does this row show the FTC line? Only when the primary actually earns.
 * A disclosure under an unmonetized link is not "extra safe" — it is inaccurate,
 * and it teaches users the line is boilerplate rather than information.
 */
export function showsDisclosure(primary) {
  return !!(primary && primary.monetized);
}
