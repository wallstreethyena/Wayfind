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

