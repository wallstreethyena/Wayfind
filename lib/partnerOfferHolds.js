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
  // "THIS DEAL IS SOLD OUT" with Add to Cart and Buy Now removed.
  "clipp-m-pizza-kitchen",
]);

const QUARANTINED = new Set(QUARANTINED_PARTNER_OFFERS);

export const isQuarantinedPartnerOffer = (offerId) =>
  QUARANTINED.has(String(offerId == null ? "" : offerId).trim());

export const isBlockedPartnerOffer = (offerId) =>
  isHeldPartnerOffer(offerId) || isQuarantinedPartnerOffer(offerId);

