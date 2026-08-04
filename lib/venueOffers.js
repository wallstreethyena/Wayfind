// lib/venueOffers.js — the EXPLICIT place→partner-offer map for Book-it.
//
// Audit finding F4. bookItTarget() returned null for every attraction and every
// tour, so the "guaranteed wrap" layer was dark on exactly the inventory it
// exists for. Measured:
//
//   The Ringling            cat=attractions  bestEV=tiqets    -> NULL
//   Mote Marine Aquarium    cat=attractions  bestEV=tiqets    -> NULL
//   Sarasota Bay Kayak Tour cat=tours        bestEV=wegotrip  -> NULL
//   Van Wezel               cat=events       bestEV=ticketnetwork -> ok
//
// THE MECHANISM, which is not what it looks like. bestAffiliate() picks the
// HIGHEST-EV provider, then wrapCard() looks for SEARCH_URL[that provider],
// finds none, and gives up — it never falls through to a provider it *can*
// build a link for. But adding a fall-through fixes nothing either: the only
// remaining search builder is ticketnetwork, which serves events. The tiqets /
// klook / wegotrip search paths were REMOVED on purpose in July, after a
// browser check found "/en/search?q=Ringling" returning eight results that were
// all in VIENNA. That purge was correct and is not being undone.
//
// So the fix is not a better search. It is an EXACT product, and the only
// honest source of one is a hand-verified venue list.
//
// ── TWO RULES THIS FILE HOLDS, BOTH LEARNED THE HARD WAY ──────────────────
//
// 1. NAMES ARE AN ALLOWLIST, NEVER A SUBSTRING GUESS. wf_place_products matched
//    products to places with `e.title ILIKE '%'||i.name||'%'` and sent Orlando
//    visitors to a Manhattan tour of Central Park and Sarasota visitors to a
//    tour of the New York subway. Every name below is written out.
//
// 2. GEO IS MANDATORY, NOT OPTIONAL. Every row names its market and a match
//    REQUIRES it. "The Florida Aquarium" exists in Tampa; a same-named place
//    anywhere else must not inherit its ticket. This is the constraint whose
//    absence caused 16% of live booking buttons to point at the wrong city.
//
// ── WHAT THE CLIENT RECEIVES ──────────────────────────────────────────────
// Offer IDS ONLY. No destination URL appears here, so this module is safe in
// the browser bundle and the resolved destination stays behind
// /api/commerce/go (the same split lib/intentPartnerPicks.js keeps from
// lib/partnerOfferRegistry.js). Every id below must exist in that registry —
// scripts/test-book-it-venues.mjs fails the build if one does not.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * One row per VENUE, not per offer. Where the registry holds several offers for
 * the same venue (the Dalí Museum appears under three city keys, the Florida
 * Aquarium under two providers) the row names the one to sell, so the choice is
 * made here once rather than by whichever lookup happens to run first.
 *
 * `market` is matched against the caller's city, loosely enough to survive
 * "St. Petersburg" vs "Saint Petersburg" and strictly enough that a different
 * metro never matches.
 */
export const VENUE_OFFERS = Object.freeze([
  // ── Tampa Bay ───────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "tampa-deal-florida-aquarium", market: ["tampa"], names: ["the florida aquarium", "florida aquarium"] },
  { provider: "tiqets", offerId: "tampa-hidden-plant-museum", market: ["tampa"], names: ["henry b plant museum", "plant museum"] },
  { provider: "tiqets", offerId: "tampa-deal-adventure-island", market: ["tampa"], names: ["adventure island", "adventure island tampa bay"] },
  { provider: "tiqets", offerId: "tampa-drive-clearwater-aquarium", market: ["clearwater"], names: ["clearwater marine aquarium"] },
  { provider: "tiqets", offerId: "tampa-date-dali-museum", market: ["st petersburg", "saint petersburg", "st pete"], names: ["the dali museum", "dali museum", "the salvador dali museum", "salvador dali museum"] },

  // ── Orlando ─────────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "orlando-tonight-sealife", market: ["orlando"], names: ["sea life orlando aquarium", "sea life orlando"] },
  { provider: "tiqets", offerId: "orlando-hidden-chocolate-kingdom", market: ["orlando", "kissimmee"], names: ["chocolate kingdom", "chocolate kingdom factory of chocolate dreams"] },
  { provider: "tiqets", offerId: "orlando-drive-kennedy-explore", market: ["orlando", "merritt island", "cape canaveral", "titusville"], names: ["kennedy space center", "kennedy space center visitor complex"] },

  // ── New York ────────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "nyc-family-amnh", market: ["new york", "new york city", "manhattan", "nyc"], names: ["american museum of natural history"] },
  { provider: "tiqets", offerId: "nyc-drive-bronx-zoo", market: ["new york", "new york city", "bronx", "nyc"], names: ["bronx zoo"] },
  { provider: "tiqets", offerId: "nyc-budget-911-memorial", market: ["new york", "new york city", "manhattan", "nyc"], names: ["9 11 memorial museum", "national september 11 memorial museum", "9 11 memorial"] },
  { provider: "tiqets", offerId: "nyc-hook-empire-state", market: ["new york", "new york city", "manhattan", "nyc"], names: ["empire state building"] },
  { provider: "tiqets", offerId: "nyc-hook-one-world-observatory", market: ["new york", "new york city", "manhattan", "nyc"], names: ["one world observatory"] },
  { provider: "tiqets", offerId: "nyc-hook-vessel-hudson-yards", market: ["new york", "new york city", "manhattan", "nyc"], names: ["vessel", "the vessel", "vessel at hudson yards"] },
  { provider: "tiqets", offerId: "nyc-hook-summit-vanderbilt", market: ["new york", "new york city", "manhattan", "nyc"], names: ["summit one vanderbilt", "summit one vanderbilt observatory"] },
  { provider: "tiqets", offerId: "nyc-hidden-artechouse", market: ["new york", "new york city", "manhattan", "nyc"], names: ["artechouse", "artechouse nyc"] },
]);

/**
 * The exact partner offer for a place, or null.
 *
 * BOTH the name AND the market must match. A name hit in the wrong city returns
 * null — that is the whole point of the row carrying a market.
 *
 * @param {string} placeName  the venue's own name
 * @param {string} city       the caller's resolved city
 * @returns {{provider:string, offerId:string}|null}  never a destination URL
 */
export function venueOfferFor(placeName, city) {
  const n = norm(placeName);
  const c = norm(String(city || "").split(",")[0]);
  if (!n || !c) return null;
  for (const row of VENUE_OFFERS) {
    if (!row.names.some((name) => norm(name) === n)) continue;
    if (!row.market.some((m) => norm(m) === c)) continue;
    return { provider: row.provider, offerId: row.offerId };
  }
  return null;
}
