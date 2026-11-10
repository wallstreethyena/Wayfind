// The sentence a visitor can read without a hover. Title attributes are not
// a disclosure on a phone. Do not add "at no extra cost" — that price claim
// is not something this file can verify.
export const AFFILIATE_DISCLOSURE_TEXT = "Some links on this page are affiliate links. We may earn a commission if you book through them.";

// The short line under a guide's own affiliate button (pick offer and the
// bottom "Your next step" card). Same words in both places. Not the page-level
// sentence above: that one is for a whole page, this one sits on one link.
export const GUIDE_OFFER_COMMISSION_LINE = "Wayfind may earn a commission, which never changes our picks or their order.";

// The commission half of the place detail credit line (owner, 2026-11-10). It
// sits directly under the detail photos, joined to the photo credit, so the
// reader meets it before the booking button. It names the partner the button
// on THIS sheet goes to; an unknown provider gets the generic wording, never a
// guessed name. FareHarbor is listed so its links read correctly the day the
// provider is wired; no FareHarbor link exists until then.
const DETAIL_CREDIT_PARTNER_NAMES = Object.freeze({
  fareharbor: "FareHarbor",
  viator: "Viator",
  tiqets: "Tiqets",
  klook: "Klook",
  gocity: "Go City",
  citypass: "CityPASS",
  fandango: "Fandango",
  ticketnetwork: "TicketNetwork",
  ticketsmarter: "TicketSmarter",
  undercover_tourist: "Undercover Tourist",
});

export function detailCreditCommissionLine(provider) {
  const key = String(provider || "").trim().toLowerCase();
  const name = Object.prototype.hasOwnProperty.call(DETAIL_CREDIT_PARTNER_NAMES, key) ? DETAIL_CREDIT_PARTNER_NAMES[key] : "a partner link";
  return "Wayfind may earn a commission when you book through " + name + ", and that never changes our rankings.";
}
