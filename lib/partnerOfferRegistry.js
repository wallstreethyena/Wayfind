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
  "orlando-best-gocity-pass": offer("gocity", "https://gocity.com/en/orlando/passes/all-inclusive"),

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
  // Coverage-gap fill 2026-08-01: Tampa had no "tonight" pick. The Clearwater
  // buffet-cruise candidate first considered was confirmed dead ("Temporarily
  // unavailable" on its own product page and on the Tampa cruises collection
  // page) — this sunset cruise was checked in both places and is "Available
  // today" with a real evening departure, so it replaces that candidate rather
  // than shipping a guessed slug.
  "tampa-tonight-sunset-cruise": offer("tiqets", "https://www.tiqets.com/en/tampa-attractions-c79946/tickets-for-clearwater-sunset-cruise-with-champagne-p1114271/"),
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
  "nyc-best-gocity-explorer": offer("gocity", "https://gocity.com/en/new-york/passes/explorer"),
  // Coverage-gap fill 2026-08-01: NYC had no "budget" pick. Standalone entry,
  // not the $72.99 One World Observatory bundle — confirmed "Available today"
  // on its own Tiqets product page.
  "nyc-budget-911-memorial": offer("tiqets", "https://www.tiqets.com/en/the-9-11-memorial-museum-tickets-l145772/"),

  // NYC place-card hooks, 2026-08-01. Sourced from Tiqets' own "Top 30 New
  // York" catalogue (shared to the owner's Drive same day by a Tiqets
  // partner-team address) and re-verified one by one in the provider browser
  // before shipping — the catalogue names the product and product id, never
  // the bookability or the live URL slug, so nothing here rides on the
  // catalogue's say-so alone. All four landed live with a real "Check
  // availability" CTA and a real price at verification time.
  "nyc-hook-empire-state": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-empire-state-building-express-entry-p975073/"),
  "nyc-hook-one-world-observatory": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-one-world-observatory-skip-all-lines-p975392/"),
  "nyc-hook-vessel-hudson-yards": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-vessel-at-hudson-yards-p993581/"),
  "nyc-hook-summit-vanderbilt": offer("tiqets", "https://www.tiqets.com/en/new-york-attractions-c260932/tickets-for-summit-one-vanderbilt-skip-the-line-ticket-guided-tour-p1110089/"),
});

// Sarasota's remaining gaps (tonight, hidden-gems, budget, best-of) are filled
// in lib/intentPartnerPicks.js directly against real wf_experiences rows
// (provider "viator"), not through this registry — see PROVIDERS.viator in
// lib/commerceProviders.js: Viator offer ids resolve as a live product_code
// lookup against our own table, which already carries link_ok/fail_count
// verification, rather than a hand-pasted destination URL here.

export function partnerOfferById(id, provider) {
  const row = PARTNER_OFFER_REGISTRY[String(id || "")] || null;
  if (!row || (provider && row.provider !== provider)) return null;
  return row;
}
