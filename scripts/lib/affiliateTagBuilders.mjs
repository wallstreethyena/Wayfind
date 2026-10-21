// Invoke the real link builders and print the URLs they emit.
// Spawned with affiliate env overrides removed so a shell cannot swap the
// Impact SID or Travelpayouts marker out from under the literals in source.
import { withViatorTracking, viatorDirectUrl, viatorProductGoUrl, ticketsUrl, experienceSearchUrl, tmImpactLink, ticketOutUrl, hotelUrl } from "../../lib/affiliates.js";
import { awinDeepLink, liveAwinKeys, awinProgramme } from "../../lib/awin.js";
import { tpDeepLink, TP_PROGRAMS } from "../../lib/travelpayouts.js";
import { clippDeepLink, rawPathDeepLink, tnRawPathDeepLink } from "../../lib/deals.js";
import { cityPassTrackedUrl, CITYPASS_MARKETS } from "../../lib/cityPassOffers.js";
import { CLIPP_MARKETS } from "../../lib/clippOffers.js";
import { cjPartnerDeepLink, CJ_PARTNER_OFFERS } from "../../lib/cjPartners.js";
import { stay22HotelRedirectUrl, bookingHotelSearchUrl } from "../../lib/hotelRedirect.js";
import { bookingTargets } from "../../lib/bookingResolve.js";
import { eventTicketHref } from "../../lib/eventTicketDeals.js";
import { commerceHref } from "../../lib/commerce.js";
import { destinationUrl, MARKET_KEYS } from "../../lib/destinations.js";
import { bookItTarget } from "../../lib/monetize.js";

const BARE = "https://www.viator.com/tours/Orlando/Example-Tour/d663-1";
const out = [];
function push(name, url) {
  out.push({ name, url: url == null ? null : String(url) });
}

push("withViatorTracking", withViatorTracking(BARE));
push("viatorDirectUrl", viatorDirectUrl(BARE));
push("viatorProductGoUrl", viatorProductGoUrl(BARE, "Orlando", "guide", "guide"));
push("ticketsUrl", ticketsUrl({
  name: "Gatorland",
  types: ["zoo", "tourist_attraction"],
  address: "14501 S Orange Blossom Trl, Orlando, FL 32837, USA",
}));
push("experienceSearchUrl", experienceSearchUrl("kayak tour", "Tampa"));
push("tmImpactLink", tmImpactLink("https://www.ticketmaster.com/event/guard-example", "guard"));
push("ticketOutUrl", ticketOutUrl("https://www.livenation.com/event/guard-example", "guard"));
push("stay22", stay22HotelRedirectUrl({
  name: "The Vinoy",
  address: "501 5th Ave NE, St. Petersburg, FL 33701",
  lat: 27.77,
  lng: -82.63,
}, "guardcheck"));
push("bookingHotelSearchUrl", bookingHotelSearchUrl({
  name: "The Vinoy",
  address: "501 5th Ave NE, St. Petersburg, FL 33701",
}));
push("hotelUrl", hotelUrl({
  name: "The Vinoy",
  types: ["lodging", "hotel"],
  address: "501 5th Ave NE, St. Petersburg, FL 33701, USA",
}));

for (const key of liveAwinKeys()) {
  const prog = awinProgramme(key);
  push("awin:" + key, awinDeepLink(key, "https://www." + String(prog.host).replace(/^www\./, "") + "/", "guard"));
}
for (const [key, prog] of Object.entries(TP_PROGRAMS)) {
  if (!prog.promoId || !prog.campaignId) continue;
  push("tp:" + key, tpDeepLink(key, prog.home));
}

push("clippDeepLink", clippDeepLink(CLIPP_MARKETS[0].dest, "guardcheck"));
push("cityPassTrackedUrl", cityPassTrackedUrl(CITYPASS_MARKETS[0].offerId, "guard"));
push("rawPathDeepLink", rawPathDeepLink("https://www.undercovertourist.com/orlando/example/", "guard"));
push("tnRawPathDeepLink", tnRawPathDeepLink("https://www.ticketnetwork.com/e/venues/example-tickets", "guard"));
for (const [id, row] of Object.entries(CJ_PARTNER_OFFERS)) {
  push("cj:" + id, cjPartnerDeepLink(row.provider, row.destination, "guard"));
}

const targets = bookingTargets(
  { name: "Gatorland", types: ["zoo", "tourist_attraction"], address: "14501 S Orange Blossom Trl, Orlando, FL 32837, USA" },
  "entertainment",
  { url: BARE },
  "Orlando",
);
push("bookingTargets.verifiedUrl", targets && targets.verifiedUrl);
push("bookingTargets.tk", targets && targets.tk);
push("eventTicketHref", eventTicketHref("hhn-orlando-2026", { surface: "guard" }));
push("commerceHref", commerceHref({ provider: "viator", offerId: "d663-1", surface: "guard", contentId: "guard" }));

let wrappedMarkets = 0;
for (const key of MARKET_KEYS) {
  const raw = destinationUrl("viator", key);
  if (!raw) continue;
  wrappedMarkets++;
  push("destinationUrl.viator." + key, withViatorTracking(raw));
}
const viatorBook = bookItTarget({ name: "ZooTampa", types: ["zoo"] }, { available: ["viator"], city: "Tampa" });
push("bookItTarget.viator", viatorBook && viatorBook.url ? viatorBook.url : null);

process.stdout.write(JSON.stringify({ urls: out, bareInput: BARE, wrappedMarketCount: wrappedMarkets, marketCount: MARKET_KEYS.length }));
