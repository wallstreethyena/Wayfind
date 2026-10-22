// Client-safe constants for the 2026 World Series Game 3 TicketNetwork offer.
// The destination URL stays in lib/partnerOfferRegistry.js. This module must
// not import that registry: place cards and guide pick offers are client code.

export const WS_GAME3_OFFER_ID = "stpete-event-ws-game-3-2026";
export const TROP_VENUE_OFFER_ID = "stpete-venue-tropicana-field";
// Inclusive last live ET calendar day. The game is 8 PM ET; the offer stays
// up through the end of that Eastern day and is gone on the next one.
export const WS_GAME3_EXPIRES = "2026-10-26";
export const WS_GAME3_FALLBACK_START = "2026-10-27";
export const WS_GAME3_REEL_SID = "reel-ws-g3";
export const WS_GAME3_CTA = "Check dates and price";
export const WS_GAME3_GUIDE_SLUG = "trending-in-florida-this-week-oct-19-2026";
export const WS_GAME3_PICK_ID = "rays-world-series-trop";

const EXPIRES_BY_ID = Object.freeze({
  [WS_GAME3_OFFER_ID]: WS_GAME3_EXPIRES,
});

export function offerExpiresOn(offerId) {
  return EXPIRES_BY_ID[String(offerId || "")] || null;
}

// True when `expires` is empty, or when the ET day is still on or before it.
// A dated offer with a missing or malformed day fails closed.
export function calendarDayStillLive(expires, today) {
  if (expires == null || expires === "") return true;
  const exp = String(expires);
  const day = String(today || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return exp >= day;
}

export function dropExpiredOffers(offers, today) {
  return (offers || []).filter((row) => calendarDayStillLive(offerExpiresOn(row && row.offerId), today));
}

// What a person taps. The commerce route turns `surface` into the CJ sid.
export const WS_GAME3_REEL_PATH =
  "/api/commerce/go?provider=ticketnetwork&offer=" + WS_GAME3_OFFER_ID + "&surface=" + WS_GAME3_REEL_SID;
export const WS_GAME3_REEL_URL = "https://www.gowayfind.com" + WS_GAME3_REEL_PATH;
