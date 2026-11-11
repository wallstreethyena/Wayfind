// Exact Orlando Tiqets products for /guides/things-to-do-orlando-not-theme-parks.
// Every id is already in lib/partnerOfferRegistry.js. Theme parks, water parks,
// and combo passes stay off this list: the guide is the non park list.
// Order is the editorial list below. Commission never sorts it.
import { PARTNER_OFFER_REGISTRY } from "./partnerOfferRegistry.js";

export const ORLANDO_EXACT_TIQETS = Object.freeze([
  ["orlando-hook-boggy-creek", "Boggy Creek Airboat Adventures"],
  ["orlando-hook-orlando-eye", "The Wheel at ICON Park"],
  ["orlando-hook-icon-park", "ICON Park"],
  ["orlando-hook-wonderworks", "WonderWorks Orlando"],
  ["orlando-tonight-sealife", "SEA LIFE Orlando"],
  ["orlando-hook-madame-tussauds", "Madame Tussauds Orlando"],
  ["orlando-hook-crayola", "Crayola Experience Orlando"],
  ["orlando-hook-andretti", "Andretti Indoor Karting and Games"],
  ["orlando-hidden-chocolate-kingdom", "Chocolate Kingdom"],
  ["orlando-hook-ripleys", "Ripley's Believe It or Not Orlando"],
]);

export function orlandoExactTiqetsEntry() {
  const offers = [];
  for (const [offerId, title] of ORLANDO_EXACT_TIQETS) {
    const row = PARTNER_OFFER_REGISTRY[offerId];
    if (!row || row.provider !== "tiqets") continue;
    offers.push(Object.freeze({
      offerId,
      provider: "tiqets",
      role: "primary",
      title,
      whoFor: "Visitors who want a ticket for " + title + ".",
      detail: "This is the exact Tiqets product already in the Wayfind catalog for this place.",
      restriction: "Check the date and what the ticket includes on Tiqets before you pay.",
      opensOn: "Tiqets",
      buttonLabel: "Tiqets",
      place: "Orlando",
      city: "Orlando",
      kicker: "Tickets",
    }));
  }
  return Object.freeze({ pickId: "orlando-exact-tiqets", offers: Object.freeze(offers) });
}
