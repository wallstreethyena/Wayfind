// Server-only CJ integrations. The owner website PID and all three deep-link
// creatives were read from CJ's signed-in generator on 2026-10-15. No tracking
// URL was followed to obtain this evidence. Keep each advertiser host separate.
import { CJ_PID } from "./deals.js";
import { siteTodayStr } from "./siteTime.js";

export const CJ_PARTNERS = Object.freeze({
  ticketsmarter: Object.freeze({ advertiserId: "5346842", linkId: "15735296", host: "ticketsmarter.com", trackingHost: "www.kqzyfj.com" }),
  epicpass: Object.freeze({ advertiserId: "7418759", linkId: "17171490", host: "epicpass.com", trackingHost: "www.jdoqocy.com" }),
  vrbo: Object.freeze({ advertiserId: "2691607", linkId: "10697641", host: "vrbo.com", trackingHost: "www.dpbolvw.net" }),
});

export function cjPartnerDeepLink(key, destination, subId = "place_pick") {
  const p = Object.hasOwn(CJ_PARTNERS, key) ? CJ_PARTNERS[key] : null;
  if (!p || !destination) return null;
  let u;
  try { u = new URL(destination); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port ||
      ![p.host, "www." + p.host].includes(u.hostname.toLowerCase())) return null;
  const out = new URL(`https://${p.trackingHost}/click-${CJ_PID}-${p.linkId}`);
  out.searchParams.set("url", u.toString());
  out.searchParams.set("sid", String(subId || "place_pick").replace(/[^\w.:-]/g, "").slice(0, 40) || "place_pick");
  return out.toString();
}

// Verified merchant destinations, never accepted from a visitor's request.
// Venue/market browse pages are labelled as browsing, not a particular event,
// available room, price or date. Epic Pass has no Florida placement.
export const CJ_PARTNER_OFFERS = Object.freeze({
  // 2026-11-05: verified Enchant St. Petersburg listings at this venue. This is a
  // resale marketplace browse choice, not an exact-date or official ticket.
  "enchant-stpete-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/venues/tropicana-field", verifiedOn: "2026-11-05" }),
  "orlando-theater-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/venues/dr-phillips-center-walt-disney-theater", verifiedOn: "2026-10-15" }),
  // Exact performances reviewed against organizer schedules and selectable
  // merchant inventory on 2026-11-06. Their cards describe longer runs; the
  // secondary choice labels and cutoffs in secondaryEventTickets bind ONE date.
  "christmas-carol-orlando-nov29-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/e/a-christmas-carol-tickets-orlando-11-29-2026-margeson-theatre-at-orlando-shakespeare-center/3434093", verifiedOn: "2026-11-06", expiresOn: "2026-11-29" }),
  "miami-nutcracker-dec11-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/e/miami-city-ballet-the-nutcracker-tickets-miami-12-11-2026-ziff-opera-house-at-the-adrienne-arsht-center/3388768", verifiedOn: "2026-11-06", expiresOn: "2026-12-11" }),
  "orange-park-nutcracker-dec12-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/e/the-florida-ballet-the-nutcracker-tickets-orange-park-12-12-2026-thrasher-horne-center/3494618", verifiedOn: "2026-11-06", expiresOn: "2026-12-12" }),
  "parker-nutcracker-dec18-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/e/arts-ballet-theatre-of-florida-the-nutcracker-tickets-fort-lauderdale-12-18-2026-lillian-s-wells-hall-at-the-parker/3478410", verifiedOn: "2026-11-06", expiresOn: "2026-12-18" }),
  "parker-celtic-christmas-dec23-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/e/celtic-angels-christmas-tickets-fort-lauderdale-12-23-2026-lillian-s-wells-hall-at-the-parker/3478675", verifiedOn: "2026-11-06", expiresOn: "2026-12-23" }),
  "epic-pass-compare": Object.freeze({ provider: "epicpass", destination: "https://www.epicpass.com/pass-results/passes.aspx", verifiedOn: "2026-10-15" }),
  "vrbo-orlando": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/central-disney-orlando/orlando", verifiedOn: "2026-10-15" }),
  "vrbo-tampa": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/central-west/tampa", verifiedOn: "2026-10-15" }),
  "vrbo-sarasota": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-west/sarasota", verifiedOn: "2026-10-15" }),
  "vrbo-siesta-key": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-west/siesta-key", verifiedOn: "2026-10-15" }),
  "vrbo-miami": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-east/miami", verifiedOn: "2026-10-15" }),
});

export function cjPartnerOfferById(id, provider, { today = siteTodayStr() } = {}) {
  const row = Object.hasOwn(CJ_PARTNER_OFFERS, id) ? CJ_PARTNER_OFFERS[id] : null;
  if (row?.provider !== provider) return null;
  // The redirect resolves this again on every click: an old shared /go URL
  // must not outlive the exact performance merely because its card is gone.
  if (row.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(today || "") || today > row.expiresOn)) return null;
  return row;
}
