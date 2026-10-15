// Server-only CJ integrations. The owner website PID and all three deep-link
// creatives were read from CJ's signed-in generator on 2026-10-15. No tracking
// URL was followed to obtain this evidence. Keep each advertiser host separate.
import { CJ_PID } from "./deals.js";

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
  "orlando-theater-ticketsmarter": Object.freeze({ provider: "ticketsmarter", destination: "https://www.ticketsmarter.com/venues/dr-phillips-center-walt-disney-theater", verifiedOn: "2026-10-15" }),
  "epic-pass-compare": Object.freeze({ provider: "epicpass", destination: "https://www.epicpass.com/pass-results/passes.aspx", verifiedOn: "2026-10-15" }),
  "vrbo-orlando": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/central-disney-orlando/orlando", verifiedOn: "2026-10-15" }),
  "vrbo-tampa": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/central-west/tampa", verifiedOn: "2026-10-15" }),
  "vrbo-sarasota": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-west/sarasota", verifiedOn: "2026-10-15" }),
  "vrbo-siesta-key": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-west/siesta-key", verifiedOn: "2026-10-15" }),
  "vrbo-miami": Object.freeze({ provider: "vrbo", destination: "https://www.vrbo.com/vacation-rentals/usa/florida/south-east/miami", verifiedOn: "2026-10-15" }),
});

export function cjPartnerOfferById(id, provider) {
  const row = Object.hasOwn(CJ_PARTNER_OFFERS, id) ? CJ_PARTNER_OFFERS[id] : null;
  return row?.provider === provider ? row : null;
}
