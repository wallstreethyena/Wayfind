// lib/partnerOfferHolds.js — partner offers whose own page cannot sell a ticket
// right now. NO IMPORTS, on purpose: lib/placePartnerPicks.js rides in the
// homepage chunk and reads this list, so it must stay a few hundred bytes.
//
// WHY THIS EXISTS (2026-11-11). Viator pins have a HOLD list, a retired ledger
// and a live quarantine. Tiqets / Klook rows had nothing: a hand-entered
// destination in lib/partnerOfferRegistry.js was trusted forever, and every
// check we own reads the status code — these pages all answer 200. So a button
// kept sending people to a page with nothing to buy.
//
// WHAT A HOLD DOES. The button is not painted (placePartnerPicks.pinServeability,
// venueOffers.venueOfferFor, menuPartnerOffers.MENU_PARTNER_OFFERS) and the
// redirect refuses the id (commerceProviders.resolveOffer), so a stale cached
// page cannot send anyone there either. Nothing is deleted: the registry row,
// the pick row and the menu row all stay, and taking the id off this list
// brings the button back everywhere at once.
//
// WHAT A HOLD IS NOT. It is never a "sold out" or "closed" label — we do not
// know why the partner stopped selling, only that their page cannot take an
// order. And UNKNOWN IS NOT DEAD: a page we could not read (bot wall, timeout)
// does not go on this list. Every id below was read on the partner's own page,
// body not status, on the date shown; scripts/check-partner-offer-holds.mjs
// locks the behaviour and docs/audits/2026-11-11-tiqets-buttons/ has the notes.
//
// TO LIFT ONE: open the partner page in a browser, confirm a date can be picked
// and the checkout button is live, then delete the line here.
export const HELD_PARTNER_OFFERS = Object.freeze([
  // 2026-11-11 Tiqets l189862: every ticket option "Temporarily unavailable",
  // checkout button disabled. Seasonal park (Gurnee, IL) — look again spring 2027.
  "gurnee-hook-six-flags",
  // 2026-11-11 Tiqets l248283: same page state as above, same operator. Water
  // park — look again late spring 2027.
  "gurnee-hook-hurricane-harbor",
  // 2026-11-11 Tiqets l161122: every ticket option unavailable, checkout
  // disabled. Water park (Kissimmee) — look again spring 2027.
  "kissimmee-hook-island-h2o",
  // 2026-11-11 Tiqets l242578: the product URL now lands on the Tampa category
  // page. The product is gone, not paused; needs a new verified URL, not a wait.
  "tampa-hook-selfie-wrld",
  // 2026-11-11: the registry URL lands on "Tampa Evening Cruises", a category
  // page. Already unplaced on every surface (menuPartnerOffers
  // DELIBERATELY_UNPLACED); held here so the redirect refuses it too.
  "clearwater-hook-calypso-queen",
]);

const HELD = new Set(HELD_PARTNER_OFFERS);

export const isHeldPartnerOffer = (offerId) => HELD.has(String(offerId == null ? "" : offerId).trim());

// Quarantined offers across non-PARTNER_OFFER_REGISTRY lanes (e.g. Clipp deals
// confirmed SOLD_OUT on live partner inspection) so every surface and redirect
// fails closed immediately even on cached clients.
export const QUARANTINED_PARTNER_OFFERS = Object.freeze([
  // 2026-11-12 Clipp deal 12875835 (Pizza Kitchen, Tampa): live page renders
  // "THIS DEAL IS SOLD OUT" with Add to Cart and Buy Now removed. Re-confirmed
  // "Sold Out for Now" on 2026-11-18 manual Chrome check.
  "clipp-m-pizza-kitchen",
  // 2026-11-18 Clipp deal 12853657 (Marco's Pizza - Riverview): live page renders
  // "Sold Out for Now" with Add to Cart and Buy Now removed (was "Almost Gone" on 2026-11-12).
  "clipp-m-marcos-riverview",
  // 2026-11-20 Clipp deal 12869854 (4th Street Pizza, St. Petersburg): live page renders
  // "Sold Out for Now" with Add to Cart and Buy Now removed (was "Almost Gone" on 2026-11-18).
  "clipp-m-4th-street-pizza",
]);

const QUARANTINED = new Set(QUARANTINED_PARTNER_OFFERS);
const _RUNTIME_QUARANTINED = new Set();
const _RUNTIME_RELEASED = new Set();
export const _CLIPP_OVERLAYS = new Map();
let _hydrateHook = null;

export function _setClippHydrateHook(fn) {
  _hydrateHook = typeof fn === "function" ? fn : null;
}

export const isQuarantinedPartnerOffer = (offerId) => {
  if (_hydrateHook) {
    try { _hydrateHook(); } catch {}
  }
  const id = String(offerId == null ? "" : offerId).trim();
  return (_RUNTIME_QUARANTINED.has(id) || QUARANTINED.has(id)) && !_RUNTIME_RELEASED.has(id);
};

export const isBlockedPartnerOffer = (offerId) =>
  isHeldPartnerOffer(offerId) || isQuarantinedPartnerOffer(offerId);

export function applyRuntimePartnerQuarantine(
  offerId,
  { status, evidence, httpStatus, release = false } = {}
) {
  const id = String(offerId == null ? "" : offerId).trim();
  if (!id) return { mutated: false, reason: "empty_offer_id" };
  if (
    evidence === "inconclusive" ||
    httpStatus === 401 ||
    httpStatus === 403 ||
    httpStatus === 429 ||
    httpStatus >= 500 ||
    httpStatus === 0
  ) {
    return { mutated: false, reason: "inconclusive_or_waf_blocked" };
  }
  const wantRelease =
    release || status === "ACTIVE" || status === "ALMOST_GONE" || status === "PRICE_CHANGED";
  if (wantRelease) {
    if (HELD.has(id)) return { mutated: false, reason: "static_hold_immutable" };
    if (evidence !== "strong" || (httpStatus !== undefined && httpStatus !== 200)) {
      return { mutated: false, reason: "weak_evidence_cannot_release" };
    }
    _RUNTIME_QUARANTINED.delete(id);
    if (QUARANTINED.has(id)) _RUNTIME_RELEASED.add(id);
    return { mutated: true, quarantined: false, offerId: id };
  }
  _RUNTIME_RELEASED.delete(id);
  _RUNTIME_QUARANTINED.add(id);
  return { mutated: true, quarantined: true, offerId: id, status: status || "QUARANTINED" };
}

export function resetRuntimePartnerQuarantine() {
  _RUNTIME_QUARANTINED.clear();
  _RUNTIME_RELEASED.clear();
  _CLIPP_OVERLAYS.clear();
}


