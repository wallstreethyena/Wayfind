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

