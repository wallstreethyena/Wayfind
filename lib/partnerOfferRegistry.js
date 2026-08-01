// SERVER-ONLY curated destination registry for intent-sheet partner offers.
// Client code must import lib/intentPartnerPicks.js instead. The browser sends
// only provider + opaque offer id to /api/commerce/go; this module resolves the
// destination and the provider wrapper is applied behind that redirect.

const offer = (provider, destination, verifiedOn = "2026-08-01") =>
  Object.freeze({ provider, destination, verifiedOn });

export const PARTNER_OFFER_REGISTRY = Object.freeze({
  // Orlando — exact products verified in the provider browser on 2026-08-01.
  "orlando-date-night-sealife-andretti": offer("tiqets", "https://www.tiqets.com/en/sea-life-orlando-andretti-indoor-karting-b44735/"),
  "orlando-family-wonderworks-crayola": offer("tiqets", "https://www.tiqets.com/en/wonderworks-orlando-crayola-experience-b2784/"),
  "orlando-tonight-sealife": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-sea-life-orlando-p976215/"),
  "orlando-drive-kennedy-explore": offer("tiqets", "https://www.tiqets.com/en/merritt-island-attractions-c79867/tickets-for-ksc-explore-tour-p1034813/"),
  "orlando-hidden-chocolate-kingdom": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-chocolate-kingdom-factory-tour-p979525/"),
  "orlando-budget-iride-trolley": offer("tiqets", "https://www.tiqets.com/en/orlando-attractions-c79889/tickets-for-i-ride-trolley-0rlando-p1011971/"),
  "orlando-best-gatorland-kennedy": offer("tiqets", "https://www.tiqets.com/en/gatorland-orlando-kennedy-space-center-b1321/"),

  // Tampa Bay + Sarasota market. The Klook aquarium product is the useful
  // destination behind the owner's older unlabelled short link; this replaces
  // the generic/no-sub-id placement with a server-tracked offer id.
  "tampa-family-florida-aquarium": offer("klook", "https://www.klook.com/en-US/activity/159925-the-florida-aquarium-ticket/"),
  "tampa-best-citypass": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-tampa-bay-citypass-p1002067/"),
  "tampa-hidden-plant-museum": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-henry-b-plant-museum-p1006254/"),
  "tampa-date-dali-museum": offer("tiqets", "https://www.tiqets.com/en/the-salvador-dali-museum-tickets-l233216/"),
  "tampa-drive-clearwater-aquarium": offer("tiqets", "https://www.tiqets.com/en/clearwater-marine-aquarium-tickets-l147957/"),
  "tampa-budget-plant-museum": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-henry-b-plant-museum-p1006254/"),
  "tampa-deal-florida-aquarium": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-the-florida-aquarium-entry-p975440/"),
  "tampa-deal-adventure-island": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-adventure-island-tampa-bay-p1016749/"),
  "sarasota-date-van-wezel": offer("ticketnetwork", "https://www.ticketnetwork.com/venues/van-wezel-performing-arts-hall-tickets"),
  "sarasota-drive-dali-museum": offer("tiqets", "https://www.tiqets.com/en/the-salvador-dali-museum-tickets-l233216/"),
  "sarasota-family-florida-aquarium": offer("klook", "https://www.klook.com/en-US/activity/159925-the-florida-aquarium-ticket/"),
  "orlando-deal-klook-pass": offer("klook", "https://www.klook.com/en-US/activity/81445-klook-pass-orlando/"),

  // New York — exact Tiqets collection/product pages verified 2026-08-01.
  "nyc-date-liberty-sunset-cruise": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-new-york-statue-of-liberty-sunset-cruise-p1093659/"),
  "nyc-family-amnh": offer("tiqets", "https://www.tiqets.com/en/american-museum-of-natural-history-amnh-tickets-l145532/"),
  "nyc-tonight-harbor-lights": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-new-york-harbor-lights-cruise-p974212/"),
  "nyc-hidden-artechouse": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-artechouse-new-york-p1009619/"),
  "nyc-drive-bronx-zoo": offer("tiqets", "https://www.tiqets.com/en/bronx-zoo-tickets-l146581/"),
  "nyc-best-city-cards": offer("tiqets", "https://www.tiqets.com/en/new-york-city-cards-l200067/"),
});

export function partnerOfferById(id, provider) {
  const row = PARTNER_OFFER_REGISTRY[String(id || "")] || null;
  if (!row || (provider && row.provider !== provider)) return null;
  return row;
}
