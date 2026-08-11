// Client-safe, exact-name hooks for places whose admission/venue inventory is
// already verified in partnerOfferRegistry. These do not add, remove, score or
// reorder a place. They only let an existing editorial/place card disclose a
// relevant ticket path when the card's name matches exactly.

const placePick = (offerId, provider, merchant, aliases) => Object.freeze({
  offerId,
  provider,
  merchant,
  aliases: Object.freeze(aliases),
});

export const PLACE_PARTNER_PICKS = Object.freeze([
  placePick("tampa-family-florida-aquarium", "klook", "Klook", ["The Florida Aquarium", "Florida Aquarium"]),
  placePick("tampa-hidden-plant-museum", "tiqets", "Tiqets", ["Henry B. Plant Museum", "Henry Plant Museum"]),
  placePick("tampa-date-dali-museum", "tiqets", "Tiqets", ["The Dalí Museum", "The Dali Museum", "Salvador Dalí Museum", "Salvador Dali Museum"]),
  placePick("tampa-drive-clearwater-aquarium", "tiqets", "Tiqets", ["Clearwater Marine Aquarium"]),
  placePick("sarasota-date-van-wezel", "ticketnetwork", "TicketNetwork", ["Van Wezel Performing Arts Hall", "Van Wezel"]),
  placePick("orlando-tonight-sealife", "tiqets", "Tiqets", ["SEA LIFE Orlando Aquarium", "SEA LIFE Orlando"]),
  placePick("orlando-hidden-chocolate-kingdom", "tiqets", "Tiqets", ["Chocolate Kingdom - Factory Adventure Tour", "Chocolate Kingdom"]),
  placePick("nyc-family-amnh", "tiqets", "Tiqets", ["American Museum of Natural History"]),
  placePick("nyc-hidden-artechouse", "tiqets", "Tiqets", ["ARTECHOUSE NYC", "ARTECHOUSE New York"]),
  placePick("nyc-drive-bronx-zoo", "tiqets", "Tiqets", ["Bronx Zoo"]),
  // 2026-08-01, sourced from Tiqets' own Top-30-NYC catalogue, each
  // re-verified live before shipping (see the registry comment).
  placePick("nyc-hook-empire-state", "tiqets", "Tiqets", ["Empire State Building"]),
  placePick("nyc-hook-one-world-observatory", "tiqets", "Tiqets", ["One World Observatory", "One World Trade Center Observatory"]),
  placePick("nyc-hook-vessel-hudson-yards", "tiqets", "Tiqets", ["Vessel", "The Vessel", "Vessel at Hudson Yards"]),
  placePick("nyc-hook-summit-vanderbilt", "tiqets", "Tiqets", ["SUMMIT One Vanderbilt", "Summit One Vanderbilt"]),
  // 2026-08-07 — Tampa Bay + Orlando attraction ticket hooks. Each venue's
  // Tiqets page was opened and confirmed live/bookable with a real price before
  // shipping. Exact-name disclosure only; the geo-gated Book-it path in
  // lib/venueOffers.js carries the same offers with a mandatory market.
  placePick("tampa-hook-zootampa", "tiqets", "Tiqets", ["ZooTampa at Lowry Park", "ZooTampa", "Lowry Park Zoo"]),
  placePick("tampa-hook-busch-gardens", "tiqets", "Tiqets", ["Busch Gardens Tampa Bay", "Busch Gardens"]),
  placePick("tampa-hook-glazer-childrens", "tiqets", "Tiqets", ["Glazer Children's Museum", "Glazer Childrens Museum"]),
  placePick("tampa-hook-dinosaur-world", "tiqets", "Tiqets", ["Dinosaur World", "Dinosaur World Florida"]),
  placePick("stpete-hook-imagine-museum", "tiqets", "Tiqets", ["Imagine Museum"]),
  placePick("stpete-hook-floridarama", "tiqets", "Tiqets", ["FloridaRAMA"]),
  placePick("orlando-hook-aquatica", "tiqets", "Tiqets", ["Aquatica Orlando", "Aquatica"]),
  placePick("orlando-hook-boggy-creek", "tiqets", "Tiqets", ["Boggy Creek Airboat Adventures", "Boggy Creek Airboat Rides"]),
  placePick("orlando-hook-central-florida-zoo", "tiqets", "Tiqets", ["Central Florida Zoo & Botanical Gardens", "Central Florida Zoo and Botanical Gardens", "Central Florida Zoo"]),
  placePick("orlando-hook-wonderworks", "tiqets", "Tiqets", ["WonderWorks Orlando", "WonderWorks"]),
  placePick("orlando-hook-icon-park", "tiqets", "Tiqets", ["ICON Park", "ICON Park Orlando"]),
  placePick("orlando-hook-andretti", "tiqets", "Tiqets", ["Andretti Indoor Karting & Games", "Andretti Indoor Karting and Games", "Andretti Indoor Karting"]),
  placePick("daytona-hook-speedway", "tiqets", "Tiqets", ["Daytona International Speedway"]),
  placePick("winterhaven-hook-legoland", "tiqets", "Tiqets", ["LEGOLAND Florida Resort", "LEGOLAND Florida", "LEGOLAND Florida Park"]),
  placePick("orlando-hook-gatorland", "tiqets", "Tiqets", ["Gatorland"]),
  placePick("orlando-hook-seaworld", "tiqets", "Tiqets", ["SeaWorld Orlando"]),
  placePick("orlando-hook-crayola", "tiqets", "Tiqets", ["Crayola Experience Orlando", "Crayola Experience"]),
  placePick("winterhaven-hook-peppa-pig", "tiqets", "Tiqets", ["Peppa Pig Theme Park", "Peppa Pig Theme Park Florida"]),
  placePick("orlando-hook-fun-spot", "tiqets", "Tiqets", ["Fun Spot America Orlando", "Fun Spot Orlando"]),
  placePick("kissimmee-hook-fun-spot", "tiqets", "Tiqets", ["Fun Spot America Kissimmee", "Fun Spot Kissimmee"]),
  // 2026-08-08 — attraction ticket hooks, batch 2. Each venue's Tiqets page was
  // fetched and confirmed live/bookable with a real price on 2026-08-08.
  //
  // THIS LIST HAS NO GEO GATE — `placePartnerPick` is a pure exact-name lookup,
  // so a multi-city BRAND must never appear here under its bare name or the
  // wrong city inherits the ticket (the F4 bug, in the one surface that cannot
  // refuse it). Measured against real inventory: wf_inventory holds a New York
  // place literally named "Museum of Sex" and a Chicago one named "Flyover",
  // either of which a bare-brand alias would mis-sell. So every brand that
  // exists in more than one market is CITY-SUFFIXED here, even where only one
  // city's product shipped. The bare names live in lib/venueOffers.js instead,
  // where a match additionally requires the market.
  placePick("orlando-hook-madame-tussauds", "tiqets", "Tiqets", ["Madame Tussauds Orlando"]),
  placePick("orlando-hook-titanic-exhibition", "tiqets", "Tiqets", ["Titanic: The Artifact Exhibition", "Titanic The Artifact Exhibition"]),
  placePick("orlando-hook-dezerland-park", "tiqets", "Tiqets", ["Dezerland Park Orlando", "Dezerland Action Park Orlando"]),
  placePick("orlando-hook-discovery-cove", "tiqets", "Tiqets", ["Discovery Cove"]),
  placePick("orlando-hook-orlando-eye", "tiqets", "Tiqets", ["The Orlando Eye", "The Wheel at ICON Park"]),
  placePick("orlando-hook-ripleys", "tiqets", "Tiqets", ["Ripley's Believe It or Not! Orlando", "Ripley's Believe It or Not Orlando"]),
  placePick("kissimmee-hook-island-h2o", "tiqets", "Tiqets", ["Island H2O Water Park", "Island H2O Live!"]),
  placePick("kissimmee-hook-old-town", "tiqets", "Tiqets", ["Old Town Kissimmee"]),
  placePick("kenansville-hook-wild-florida", "tiqets", "Tiqets", ["Wild Florida", "Wild Florida Airboats"]),
  placePick("miami-hook-zoo-miami", "tiqets", "Tiqets", ["Zoo Miami"]),
  placePick("miami-hook-jungle-island", "tiqets", "Tiqets", ["Jungle Island"]),
  placePick("miami-hook-frost-science", "tiqets", "Tiqets", ["Phillip & Patricia Frost Museum of Science", "Frost Museum of Science"]),
  placePick("miami-hook-paradox-museum", "tiqets", "Tiqets", ["Paradox Museum Miami", "Paradox Experience Miami"]),
  placePick("miami-hook-wynwood-walls", "tiqets", "Tiqets", ["Wynwood Walls", "The Wynwood Walls"]),
  placePick("miami-hook-superblue", "tiqets", "Tiqets", ["Superblue Miami"]),
  placePick("miami-hook-museum-ice-cream", "tiqets", "Tiqets", ["Museum of Ice Cream Miami"]),
  placePick("miami-hook-skyviews-wheel", "tiqets", "Tiqets", ["Skyviews Miami Observation Wheel", "Skyviews Miami"]),
  placePick("miami-hook-museum-of-sex", "tiqets", "Tiqets", ["Museum of Sex Miami"]),
  placePick("miami-hook-historymiami", "tiqets", "Tiqets", ["HistoryMiami Museum", "HistoryMiami"]),
  placePick("miami-hook-deering-estate", "tiqets", "Tiqets", ["Deering Estate", "The Deering Estate"]),
  placePick("miami-hook-everglades-safari-park", "tiqets", "Tiqets", ["Everglades Safari Park"]),
  placePick("miami-hook-museum-of-graffiti", "tiqets", "Tiqets", ["Museum of Graffiti"]),
  placePick("davie-hook-flamingo-gardens", "tiqets", "Tiqets", ["Flamingo Gardens"]),
  placePick("ftl-hook-everglades-holiday-park", "tiqets", "Tiqets", ["Everglades Holiday Park"]),
  placePick("weston-hook-sawgrass-park", "tiqets", "Tiqets", ["Sawgrass Recreation Park"]),
  placePick("chicago-hook-skydeck", "tiqets", "Tiqets", ["Skydeck Chicago", "Willis Tower Skydeck"]),
  placePick("chicago-hook-360-chicago", "tiqets", "Tiqets", ["360 CHICAGO", "360 Chicago Observation Deck"]),
  placePick("chicago-hook-shedd-aquarium", "tiqets", "Tiqets", ["Shedd Aquarium", "John G. Shedd Aquarium"]),
  placePick("chicago-hook-field-museum", "tiqets", "Tiqets", ["The Field Museum", "Field Museum of Natural History", "The Field Museum of Natural History"]),
  placePick("chicago-hook-adler-planetarium", "tiqets", "Tiqets", ["Adler Planetarium"]),
  placePick("chicago-hook-art-institute", "tiqets", "Tiqets", ["The Art Institute of Chicago", "Art Institute of Chicago"]),
  placePick("chicago-hook-navy-pier-wheel", "tiqets", "Tiqets", ["Navy Pier", "Navy Pier Centennial Wheel", "Centennial Wheel"]),
  placePick("chicago-hook-flyover", "tiqets", "Tiqets", ["FlyOver Chicago", "FlyOver at Navy Pier"]),
  placePick("chicago-hook-balloon-museum", "tiqets", "Tiqets", ["Balloon Museum Chicago"]),
  placePick("chicago-hook-color-factory", "tiqets", "Tiqets", ["Color Factory Chicago"]),
  placePick("chicago-hook-museum-ice-cream", "tiqets", "Tiqets", ["Museum of Ice Cream Chicago"]),
  placePick("chicago-hook-museum-of-illusions", "tiqets", "Tiqets", ["Museum of Illusions Chicago"]),
  placePick("chicago-hook-mca", "tiqets", "Tiqets", ["Museum of Contemporary Art Chicago", "MCA Chicago"]),
  placePick("gurnee-hook-six-flags", "tiqets", "Tiqets", ["Six Flags Great America"]),
  placePick("gurnee-hook-hurricane-harbor", "tiqets", "Tiqets", ["Hurricane Harbor Chicago", "Six Flags Hurricane Harbor Chicago"]),
  placePick("nyc-hook-top-of-the-rock", "tiqets", "Tiqets", ["Top of The Rock", "Top of the Rock Observation Deck"]),
  placePick("nyc-hook-museum-of-illusions", "tiqets", "Tiqets", ["Museum of Illusions - New York", "Museum of Illusions New York"]),
  placePick("nyc-hook-madame-tussauds", "tiqets", "Tiqets", ["Madame Tussauds New York"]),
  placePick("nyc-hook-moma", "tiqets", "Tiqets", ["The Museum of Modern Art (MoMA)", "The Museum of Modern Art", "MoMA"]),
  placePick("nyc-hook-riseny", "tiqets", "Tiqets", ["RiseNY"]),
  placePick("nyc-hook-ny-aquarium", "tiqets", "Tiqets", ["New York Aquarium"]),
  placePick("nyc-hook-museum-ice-cream", "tiqets", "Tiqets", ["Museum of Ice Cream New York"]),
  placePick("staug-hook-pirate-museum", "tiqets", "Tiqets", ["St. Augustine Pirate & Treasure Museum", "Pirate & Treasure Museum"]),
  placePick("staug-hook-aquarium", "tiqets", "Tiqets", ["St. Augustine Aquarium"]),
  placePick("staug-hook-shipwreck-museum", "tiqets", "Tiqets", ["St. Augustine Shipwreck Museum"]),
  placePick("staug-hook-history-museum", "tiqets", "Tiqets", ["St. Augustine History Museum"]),

  // ── 2026-08-11 CJ expansion (owner ask: "deep link another 30 cards"). ────
  // TicketNetwork FL venues — every offerId is a title-verified venue page in
  // partnerOfferRegistry; the provider now tracks through the verified CJ dlg
  // form. Aliases stay STRICT-exact (booking-integrity law: Hard Rock Live
  // exists in Hollywood FL too, so only the Orlando-qualified name matches).
  placePick("tampa-venue-amalie-arena", "ticketnetwork", "TicketNetwork", ["Amalie Arena"]),
  placePick("tampa-venue-raymond-james-stadium", "ticketnetwork", "TicketNetwork", ["Raymond James Stadium"]),
  placePick("tampa-venue-steinbrenner-field", "ticketnetwork", "TicketNetwork", ["George M. Steinbrenner Field", "Steinbrenner Field"]),
  placePick("tampa-venue-midflorida-amphitheatre", "ticketnetwork", "TicketNetwork", ["MidFlorida Credit Union Amphitheatre", "MIDFLORIDA Credit Union Amphitheatre"]),
  placePick("clearwater-venue-ruth-eckerd-hall", "ticketnetwork", "TicketNetwork", ["Ruth Eckerd Hall"]),
  placePick("stpete-venue-jannus-live", "ticketnetwork", "TicketNetwork", ["Jannus Live"]),
  placePick("stpete-venue-tropicana-field", "ticketnetwork", "TicketNetwork", ["Tropicana Field"]),
  placePick("bradenton-venue-lecom-park", "ticketnetwork", "TicketNetwork", ["LECOM Park"]),
  placePick("sarasota-venue-ed-smith-stadium", "ticketnetwork", "TicketNetwork", ["Ed Smith Stadium"]),
  placePick("orlando-venue-kia-center", "ticketnetwork", "TicketNetwork", ["Kia Center"]),
  placePick("orlando-venue-camping-world-stadium", "ticketnetwork", "TicketNetwork", ["Camping World Stadium"]),
  placePick("orlando-venue-hard-rock-live", "ticketnetwork", "TicketNetwork", ["Hard Rock Live Orlando"]),
  placePick("orlando-venue-house-of-blues", "ticketnetwork", "TicketNetwork", ["House of Blues Orlando"]),
  placePick("orlando-venue-addition-financial-arena", "ticketnetwork", "TicketNetwork", ["Addition Financial Arena"]),
  placePick("portcharlotte-venue-charlotte-sports-park", "ticketnetwork", "TicketNetwork", ["Charlotte Sports Park"]),
  placePick("lakeland-venue-publix-field", "ticketnetwork", "TicketNetwork", ["Publix Field at Joker Marchant Stadium", "Joker Marchant Stadium"]),
  placePick("staug-venue-amphitheatre", "ticketnetwork", "TicketNetwork", ["St. Augustine Amphitheatre", "The St. Augustine Amphitheatre"]),
  placePick("tampa-venue-ritz-ybor", "ticketnetwork", "TicketNetwork", ["The Ritz Ybor", "The RITZ Ybor"]),
  // Undercover Tourist — offerId is the wf_deals row id (cron-health-checked;
  // pinned in lib/deals.js UT_PLACE_DEAL_IDS). Discounted park tickets for the
  // exact park card the user is looking at. ONLY the parks with no existing
  // hook: SeaWorld/Busch Gardens/LEGOLAND/Gatorland/Discovery Cove/Peppa Pig
  // (and Daytona for TN) already carry shipped Tiqets hooks —
  // check-partner-hook-collisions caught the overlap and the shipped
  // monetization keeps the name (never displaced silently).
  placePick("5", "undercover_tourist", "Undercover Tourist", ["Walt Disney World Resort", "Walt Disney World", "Magic Kingdom Park", "Magic Kingdom", "EPCOT", "Disney's Hollywood Studios", "Disney's Animal Kingdom Theme Park", "Disney's Animal Kingdom"]),
  placePick("6", "undercover_tourist", "Undercover Tourist", ["Universal Orlando Resort", "Universal Studios Florida", "Universal's Islands of Adventure", "Universal Islands of Adventure", "Universal Epic Universe", "Universal's Epic Universe", "Universal Volcano Bay", "Universal's Volcano Bay"]),
  placePick("17", "undercover_tourist", "Undercover Tourist", ["Kennedy Space Center Visitor Complex", "Kennedy Space Center"]),
  // Adventure Island rides the existing registry-verified Tiqets product.
  placePick("tampa-deal-adventure-island", "tiqets", "Tiqets", ["Adventure Island", "Adventure Island Tampa Bay"]),
]);

const norm = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const BY_NAME = new Map();
for (const row of PLACE_PARTNER_PICKS) {
  for (const alias of row.aliases) BY_NAME.set(norm(alias), row);
}

export function placePartnerPick(place) {
  const name = norm(place && place.name);
  return name ? (BY_NAME.get(name) || null) : null;
}

