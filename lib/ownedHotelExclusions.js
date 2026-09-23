// lib/ownedHotelExclusions.js — rows in lib/ownedHotels.json that are NOT
// a place you can book a room at (2026-09-23, before the app launch).
//
// WHY A LIST AND NOT A DELETE. The owned library is ingested data; deleting
// rows loses the record of what was there and why it went. Each row below is
// named, keyed by its card id, and carries the evidence that removed it, so
// the decision is reviewable and reversible. Two kinds of evidence, both
// recorded at the time:
//   - the name itself says it is not lodging (a restaurant, a spa, a travel
//     agency, a condo association, a campground, an amenity like "Pool at",
//     or an email address that ended up in a name column), or
//   - Google answered "not-lodging" for the place at that exact address
//     during the identity backfill, and the row is not named like lodging
//     either. A row whose name DOES say hotel/inn/motel/resort/suites is kept
//     even when Google disagreed, because Google may have matched a neighbour.
//
// These cards were carrying a "Check rates" button. A booking button on a
// nail salon or a symphony is the kind of thing a launch is judged by.
export const OWNED_HOTEL_EXCLUSIONS = Object.freeze([
  { key: "wfh-ahenige-netvantage-me-27382", name: "ahenige@netvantage.me", reason: "an email address, not a place" },
  { key: "wfh-anna-maria-vacations-27509", name: "Anna Maria Vacations", reason: "a travel agency or rental manager" },
  { key: "wfh-aqua-nails-spa-27267", name: "Aqua Nails Spa", reason: "a spa or personal-care business" },
  { key: "wfh-casa-cay-27128", name: "Casa Cay", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-casa-mar-27261", name: "Casa Mar", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-cedars-bar-grill-27418", name: "Cedars Bar & Grill", reason: "a restaurant or bar" },
  { key: "wfh-crescent-arms-27254", name: "Crescent Arms", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-crescent-towers-apt-27249", name: "Crescent Towers Apt", reason: "a condominium or apartment building" },
  { key: "wfh-dale-nelson-27277", name: "Dale Nelson", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-exotic-pattaya-thailand-tours-27374", name: "Exotic Pattaya Thailand Tours", reason: "a travel agency or rental manager" },
  { key: "wfh-fantasy-travel-27464", name: "Fantasy Travel", reason: "a travel agency or rental manager" },
  { key: "wfh-florida-west-coast-symphony-27343", name: "Florida West Coast Symphony", reason: "not a place you can stay" },
  { key: "wfh-floridaloha-vacations-27118", name: "Floridaloha Vacations", reason: "a travel agency or rental manager" },
  { key: "wfh-g-s-quick-stop-quick-rest-before-work-again-27303", name: "G's Quick Stop - Quick Rest Before Work Again", reason: "not lodging" },
  { key: "wfh-ggs-late-night-27261", name: "GGS Late Night", reason: "a restaurant or bar" },
  { key: "wfh-gulf-and-bay-club-27266", name: "Gulf And Bay Club", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-gulf-haven-27264", name: "Gulf Haven", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-gulf-to-bay-club-27126", name: "Gulf To Bay Club", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-gulfcoast-holiday-homes-27336", name: "Gulfcoast Holiday Homes", reason: "a travel agency or rental manager" },
  { key: "wfh-hewett-s-tropical-haven-27257", name: "Hewett's Tropical Haven", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-house-br-27246", name: "House BR", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-house-of-the-sun-27250", name: "House of the Sun", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-hyatt-pool-27248", name: "Hyatt Pool", reason: "an amenity, not a property" },
  { key: "wfh-laplaya-longboat-key-27394", name: "LaPlaya Longboat Key", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-libby-luxury-beach-spa-27357", name: "Libby Luxury Beach Spa", reason: "a spa or personal-care business" },
  { key: "wfh-lido-beach-house-27312", name: "Lido Beach House", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-midnight-cove-27254", name: "Midnight Cove", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-monterey-village-27358", name: "Monterey Village", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-new-dawn-travels-dream-vacations-27070", name: "New Dawn Travels Dream Vacations", reason: "a travel agency or rental manager" },
  { key: "wfh-pacific-tomato-growers-27521", name: "Pacific Tomato Growers", reason: "not a place you can stay" },
  { key: "wfh-plantation-community-foundation-27060", name: "Plantation Community Foundation", reason: "not a place you can stay" },
  { key: "wfh-pleasant-lake-r-v-park-27450", name: "Pleasant Lake R V Park", reason: "a campground or RV park, never a hotel card" },
  { key: "wfh-polynesian-gardens-27258", name: "Polynesian Gardens", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-pool-at-holiday-inn-express-suites-27461", name: "Pool at Holiday Inn Express & Suites", reason: "an amenity, not a property" },
  { key: "wfh-regency-centers-27269", name: "Regency Centers", reason: "not a place you can stay" },
  { key: "wfh-ritz-carlton-beach-club-poolside-27306", name: "Ritz Carlton Beach Club Poolside", reason: "an amenity, not a property" },
  { key: "wfh-san-marcos-27109", name: "San Marcos", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-sea-club-2-27263", name: "Sea Club 2", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-sea-winds-27249", name: "Sea Winds", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-seagrove-siesta-key-27252", name: "Seagrove Siesta Key", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-seawinds-siesta-key-vacation-holiday-rental-27250", name: "Seawinds, Siesta Key Vacation & Holiday Rental", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-seista-key-sunset-27216", name: "Seista Key Sunset", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siesta-beach-house-27263", name: "Siesta Beach House", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siesta-dunes-27257", name: "Siesta Dunes", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siesta-key-for-me-the-palm-bay-club-27263", name: "Siesta Key For Me - The Palm Bay Club", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siesta-key-sarasota-vacation-27297", name: "Siesta Key Sarasota Vacation", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siesta-pearl-27275", name: "Siesta Pearl", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-siestakey-turtle-beach-vacation-27216", name: "SiestaKey Turtle Beach Vacation", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-sip-n-cycle-cruises-27220", name: "Sip-N-Cycle Cruises", reason: "a travel agency or rental manager" },
  { key: "wfh-sip-n-cycle-cruises-27274", name: "Sip-N-Cycle Cruises", reason: "a travel agency or rental manager" },
  { key: "wfh-slim-down-sarasota-27054", name: "Slim Down Sarasota", reason: "a spa or personal-care business" },
  { key: "wfh-stay-and-visit-italy-27249", name: "Stay And Visit Italy", reason: "a travel agency or rental manager" },
  { key: "wfh-sun-n-fun-resort-and-campground-27339", name: "Sun N Fun Resort and Campground", reason: "a campground or RV park, never a hotel card" },
  { key: "wfh-sunsets-on-the-key-27276", name: "Sunsets On The Key", reason: "Google says the place at this address is not lodging" },
  { key: "wfh-tara-verandas-condo-association-27442", name: "Tara Verandas Condo Association", reason: "a condominium or apartment building" },
  { key: "wfh-toucans-restaurant-27340", name: "Toucans Restaurant", reason: "a restaurant or bar" },
  { key: "wfh-turtle-beach-campground-27220", name: "Turtle Beach Campground", reason: "a campground or RV park, never a hotel card" },
  { key: "wfh-venice-massage-27059", name: "Venice Massage", reason: "a spa or personal-care business" },
]);

const EXCLUDED_KEYS = new Set(OWNED_HOTEL_EXCLUSIONS.map((r) => r.key));
/** The card id lib/hotels.js toPlace() builds, so an exclusion keys off the exact card. */
export function ownedHotelKey(h) {
  const lat = Number(h && h.lat);
  const slug = String((h && h.name) || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  return "wfh-" + slug + "-" + (Number.isFinite(lat) ? Math.round(lat * 1000) : 0);
}
/** true when this owned row must never be served as a hotel card. */
export function isExcludedOwnedHotel(h) {
  return EXCLUDED_KEYS.has(ownedHotelKey(h));
}
