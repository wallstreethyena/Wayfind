// Client-safe, exact-name hooks for places whose admission/venue inventory is
// already verified in partnerOfferRegistry. These do not add, remove, score or
// reorder a place. They only let an existing editorial/place card disclose a
// relevant ticket path when the card's name matches exactly.
const placePick = (offerId, provider, merchant, aliases, extra) => Object.freeze({
  offerId,
  provider,
  merchant,
  aliases: Object.freeze(aliases),
  // Optional Google place ids. The live ?place= sheet loads by id; a display-
  // name drift must not drop a founder-verified pin (Trust 2026-08-25, Shell
  // Key). Empty for every row that is still exact-name only.
  placeIds: Object.freeze((extra && extra.placeIds) || []),
});

export const PLACE_PARTNER_PICKS = Object.freeze([
  // ══ 2026-08-19 — THE RAIL-CARD MONETIZATION AUDIT (owner: "I want a full
  // audit on all of the place cards that could have deep links, and if they
  // don't, the deep links applied"). Measured first: 102 unique places on the
  // live daypart rails near Parrish, ZERO carried a partner pick — this list
  // covered Tampa/StPete/Clearwater venues and none of the Bradenton-market
  // rail inventory. Every row below was CONTENT-verified on the partner's
  // live page the same day (product title + street address / city named on
  // page — never a status code, never a guessed URL). Viator rows resolve by
  // product_code against wf_experiences (link_ok pipeline keeps them
  // honest); the codes here were confirmed link_ok:true today.
  // Verified-but-NOT-wired, recorded so nobody re-audits them: Canoe Outpost
  // Little Manatee, Escape Reality, Mote SEA, Bishop Museum, Florida
  // Railroad Museum, Gulf Islands Ferry, Circus Sarasota, PopStroke,
  // Jungle Gardens, Big Cat Habitat — NO partner inventory exists (Viator/
  // Tiqets/TicketNetwork all miss); The Ringling has only a drive-by trolley
  // on Viator, not admission — deep-linking it would sell the wrong thing.
  placePick("412732P1", "viator", "Viator", ["Get Up and Go Kayaking - Robinson Preserve", "Get Up and Go Kayaking Robinson Preserve"]),
  placePick("454941P4", "viator", "Viator", ["Robinson Preserve"]),
  // TreeUmph! Adventure Course — 22211P1 UNPINNED 2026-08-20. Live Viator
  // product d25738-22211P1 did not redirect, but H1 is exactly "Sorry, this
  // product is unavailable" with no Book/price widget. Empty-slot until a
  // live product names TreeUmph. Do not pin similar-experiences rail SKUs.
  placePick("237533P5", "viator", "Viator", ["Egmont Key State Park", "Egmont Key"]),
  // 2026-08-19 founder-verified (browser load): Clear Kayak Tour of Shell Key
  // Preserve and Tampa Bay Area. Meet Tierra Verde / St. Petersburg. Exact
  // product d5403-173028P1 — NOT the scallop HOLD-SKU, NOT a searchResults
  // handoff. Exact-name only on the existing summer-universe / Atlas card.
  // Rank is untouched: this list never scores or reorders a place.
  placePick("173028P1", "viator", "Viator", ["Shell Key Preserve"], {
    placeIds: ["ChIJ5_NkHLUcw4gRndvLQGe_Ox8"],
  }),
  // ══ 2026-08-20 cash-register factory ══
  // Owner browser-verified batch (2026-08-19): ONE offer per exact existing
  // card name. offerId is the wf_experiences product_code. Never searchResults,
  // never 236862P2, never a second SKU on the same card. Rank untouched.
  // Fort De Soto is its own e-bike pin (324135P3), not the Egmont ferry.
  placePick("324135P3", "viator", "Viator", ["Fort De Soto Park"]),
  // RETIRED 350236P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 20572P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  placePick("87414P4", "viator", "Viator", ["Turtle Beach"]),
  placePick("136885P1", "viator", "Viator", ["Siesta Beach"]),
  placePick("136885P3", "viator", "Viator", ["Myakka River State Park"]),
  placePick("203023P2", "viator", "Viator", ["Anna Maria Island Dolphin Tours"]),
  placePick("454941P3", "viator", "Viator", ["Coquina Beach"]),
  placePick("298601P1", "viator", "Viator", ["Pier 60"]),
  // RETIRED 308814P5 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 11779P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 288108P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  placePick("343215P2", "viator", "Viator", ["Rainbow Springs State Park"]),
  placePick("290298P1", "viator", "Viator", ["Silver Springs State Park Glass Bottom Boat Tours"]),
  // RETIRED 65756P5 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 431125P10 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 101001P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // Factory-verified extras (exact existing names, not in the owner list;
  // one SKU each; do not add a second hop on any owner-pinned card).
  // RETIRED 17325KEYYAN — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  placePick("184792P17", "viator", "Viator", ["Three Sisters Springs"]),
  placePick("5467P2", "viator", "Viator", ["Wild Florida Adventure Park"]),
  placePick("350214P1", "viator", "Viator", ["St. Pete Pier"]),
  // RETIRED 17984P2 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  placePick("68831P1", "viator", "Viator", ["Ted Sperling Park Nature Trail"]),
  // RETIRED 26315P9 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 105290P10 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // ══ 2026-08-20 cash-register factory batch 2 ══
  // Live product pages named these exact existing cards (H1 + product code;
  // not searchResults, not another country, not another product). One offer
  // per card. Rank untouched. Kayak SKUs that say "do not enter the park"
  // stay unpinned — Blue Spring here is the in-park St. Johns River cruise.
  // RETIRED 386845P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 236733P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // RETIRED 431125P5 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // Named operator boat, not a beach pin. Live H1: "Little Toot Dolphin
  // Adventure at Clearwater Beach". Dest 22457 Clearwater USA. Exact editorial
  // card name only — Clearwater Beach stays empty (Pier 60 already has sunset).
  placePick("179637P1", "viator", "Viator", ["Little Toot Dolphin Adventure"]),
  // Keys Huka Dive — existing atlas card (Casey Key / Nokomis). Factory
  // verify: HTTP 403, 0 redirects, URL stayed on d276-5608638P1 (not
  // searchResults, not another product). Dest 276 is Florida USA (not a
  // Keys-reef dest). Syndicated live title (AAA Trip Canvas SKU URL +
  // Care.com "By Viator"): "Shark Tooth Snorkeling Adventure and Huka Dive
  // in Venice Florida" with ticket prices — names Huka + Venice, not
  // Pennekamp / Key West. Exact card name only; Venice Beach stays empty.
  // RETIRED 5608638P1 — absent from wf_experiences 2026-09-09; see RETIRED_VIATOR_PINS
  // Bare "Fun Spot America" (the rail card's exact name) missed the suffixed
  // Tiqets aliases below; 3170P97 is the parks admission product already
  // link_ok in wf_experiences, and it covers both FL parks so the bare name
  // cannot sell the wrong city.
  placePick("3170P97", "viator", "Viator", ["Fun Spot America"]),
  // ══ 2026-08-12 batch 2. City-suffix rule still governs (this list has no geo
  // gate). Comedy-club and music-venue brands are the risky class here — "Funny
  // Bone" and "House of Blues" exist in many markets — so those ship suffixed.
  // "Oscura" and "Freedom Factory" are deliberately NOT given place hooks: both
  // are generic enough that a same-named venue in another market would inherit
  // the ticket. Their registry rows stand for the geo-gated path instead.
  placePick("tampa-venue-straz-morsani", "ticketnetwork", "TicketNetwork", ["David A. Straz Jr. Center for the Performing Arts", "Straz Center for the Performing Arts", "Carol Morsani Hall"]),
  placePick("stpete-venue-mahaffey", "ticketnetwork", "TicketNetwork", ["The Mahaffey Theater", "Mahaffey Theater", "Duke Energy Center for the Arts"]),
  placePick("tampa-venue-orpheum", "ticketnetwork", "TicketNetwork", ["The Orpheum Tampa", "Orpheum Ybor City"]),
  placePick("tampa-venue-side-splitters", "ticketnetwork", "TicketNetwork", ["Side Splitters Comedy Club"]),
  placePick("tampa-venue-funny-bone", "ticketnetwork", "TicketNetwork", ["Tampa Funny Bone Comedy Club", "Funny Bone Comedy Club Tampa"]),
  placePick("clearwater-venue-baycare-sound", "ticketnetwork", "TicketNetwork", ["The BayCare Sound", "Coachman Park"]),
  placePick("clearwater-venue-capitol-theatre", "ticketnetwork", "TicketNetwork", ["Nancy and David Bilheimer Capitol Theatre", "Capitol Theatre Clearwater"]),
  placePick("sarasota-venue-mccurdys", "ticketnetwork", "TicketNetwork", ["McCurdy's Comedy Theatre", "McCurdys Comedy Theatre"]),
  placePick("clearwater-venue-baycare-ballpark", "ticketnetwork", "TicketNetwork", ["BayCare Ballpark"]),
  placePick("stpete-venue-al-lang-stadium", "ticketnetwork", "TicketNetwork", ["Al Lang Stadium"]),
  placePick("bradenton-venue-premier-sports-campus", "ticketnetwork", "TicketNetwork", ["Premier Sports Campus at Lakewood Ranch", "Premier Sports Campus"]),
  placePick("bradenton-venue-motorsports-park", "ticketnetwork", "TicketNetwork", ["Bradenton Motorsports Park"]),
  // ══ 2026-08-12 — Travelpayouts deeplink batch. Every destination behind these
  // ids was fetched and content-verified the same day (see the long note in
  // lib/partnerOfferRegistry.js for the two soft-404 mechanisms that ate the
  // candidates which are NOT here).
  //
  // The city-suffix rule from the 2026-08-08 batch still governs: this list has
  // NO geo gate, so any brand that exists in more than one market is suffixed.
  // "Hard Rock Live" is the obvious one — there is a Hard Rock Live in Hollywood
  // FL as well as Orlando, so only the suffixed alias ships here.
  placePick("tampa-hook-museum-of-art", "tiqets", "Tiqets", ["Tampa Museum of Art"]),
  placePick("tampa-hook-mosi", "tiqets", "Tiqets", ["Museum of Science & Industry", "Museum of Science and Industry", "MOSI"]),
  placePick("tampa-hook-selfie-wrld", "tiqets", "Tiqets", ["Selfie WRLD Tampa"]),
  placePick("stpete-hook-museum-of-history", "tiqets", "Tiqets", ["St. Petersburg Museum of History", "St Petersburg Museum of History"]),
  // TicketNetwork venue pages. Performer pages (Tampa Bay Rays, Sarasota
  // Orchestra) were verified too but are deliberately NOT here: a performer is
  // not a place, and an exact-name lookup would attach a team's ticket page to
  // whatever venue happens to share the string.
  placePick("stpete-venue-tropicana-field", "ticketnetwork", "TicketNetwork", ["Tropicana Field"]),
  placePick("clearwater-venue-ruth-eckerd-hall", "ticketnetwork", "TicketNetwork", ["Ruth Eckerd Hall"]),
  placePick("tampa-venue-midflorida-amphitheatre", "ticketnetwork", "TicketNetwork", ["MIDFLORIDA Credit Union Amphitheatre", "MidFlorida Credit Union Amphitheatre"]),
  placePick("tampa-venue-yuengling-center", "ticketnetwork", "TicketNetwork", ["Yuengling Center"]),
  placePick("tampa-venue-tampa-theatre", "ticketnetwork", "TicketNetwork", ["Tampa Theatre"]),
  placePick("bradenton-venue-lecom-park", "ticketnetwork", "TicketNetwork", ["LECOM Park"]),
  placePick("orlando-venue-kia-center", "ticketnetwork", "TicketNetwork", ["Kia Center"]),
  placePick("orlando-venue-camping-world-stadium", "ticketnetwork", "TicketNetwork", ["Camping World Stadium"]),
  placePick("orlando-venue-hard-rock-live", "ticketnetwork", "TicketNetwork", ["Hard Rock Live Orlando"]),
  placePick("orlando-venue-addition-financial-arena", "ticketnetwork", "TicketNetwork", ["Addition Financial Arena"]),
  placePick("sunrise-venue-amerant-bank-arena", "ticketnetwork", "TicketNetwork", ["Amerant Bank Arena"]),
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
  placePick("tampa-venue-amalie-arena", "ticketnetwork", "TicketNetwork", ["Amalie Arena", "Benchmark International Arena"]),
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
  // Charlotte Sports Park pick removed 2026-08-12 with its registry row — the
  // TicketNetwork venue record is retired and the page has no inventory.
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
  // Owner requested Klook on these exact cards (2026-09-11). Replace the
  // existing pin once, rather than adding a competing second booking CTA.
  // Volcano Bay retains its existing offer; HHN and CityWalk never match.
  placePick("orlando-klook-universal-admission", "klook", "Klook", ["Universal Orlando Resort", "Universal Studios Florida", "Universal's Islands of Adventure", "Universal Islands of Adventure", "Universal Epic Universe", "Universal's Epic Universe"]),
  placePick("6", "undercover_tourist", "Undercover Tourist", ["Universal Volcano Bay", "Universal's Volcano Bay"]),
  placePick("merritt-island-klook-kennedy-admission", "klook", "Klook", ["Kennedy Space Center Visitor Complex", "Kennedy Space Center"]),
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
const BY_ID = new Map();
for (const row of PLACE_PARTNER_PICKS) {
  for (const alias of row.aliases) BY_NAME.set(norm(alias), row);
  for (const id of row.placeIds) {
    if (id) BY_ID.set(String(id), row);
  }
}


// ── RETIRED PINS — the product is gone from the catalogue ────────────────
//
// 2026-09-09 audit. 16 of the 35 pinned Viator codes (46%) had no matching row
// in wf_experiences. Nothing stopped them: the old placePickIsLive() was a
// two-code denylist with no knowledge of the catalogue, so each one still
// returned a pick, still rendered a "Book" button, and on click resolved to
// offer-not-found and 302'd the customer back to the Wayfind homepage.
// Production had already logged exactly that for 288108P1.
//
// A missing Book button is better than a fake one, so these are retired now
// rather than held open until replacements are found. They are recorded here —
// not consulted by placePartnerPick() — so the replacement research has its
// worklist and nobody re-pins a known-dead code by accident.
//
// Worth noting for that research: several of these are beaches, state parks and
// public spaces (Lido Beach, Fort De Soto's neighbours, Honeymoon Island,
// Caladesi, Tampa Riverwalk, The Bay Park). isNeverBookable() already excludes
// beaches from ever carrying a CTA, so some of these should not be re-pinned at
// all — the right answer for them is no button, permanently.
//
// UNKNOWN IS NOT DEAD. These are retired because the product is ABSENT from the
// catalogue, which is a fact. A product whose health probe merely failed
// (403, timeout, rate limit) is unknown, not dead, and must never land here.
export const RETIRED_VIATOR_PINS = Object.freeze([
  { offerId: "350236P1", names: ["Tarpon Springs Sponge Docks"] },
  { offerId: "20572P1", names: ["Lido Beach"] },
  { offerId: "308814P5", names: ["Caladesi Island State Park"] },
  { offerId: "11779P1", names: ["Honeymoon Island State Park"] },
  { offerId: "288108P1", names: ["Weeki Wachee Springs State Park"] },
  { offerId: "65756P5", names: ["Bioluminescence Tours - Cocoa Beach"] },
  { offerId: "431125P10", names: ["Everglades City Airboat Tours"] },
  { offerId: "101001P1", names: ["John Pennekamp Coral Reef State Park"] },
  { offerId: "17325KEYYAN", names: ["Dry Tortugas National Park"] },
  { offerId: "17984P2", names: ["Robbie's of Islamorada"] },
  { offerId: "26315P9", names: ["BK Adventure"] },
  { offerId: "105290P10", names: ["Wekiwa Springs State Park"] },
  { offerId: "386845P1", names: ["The Bay Park"] },
  { offerId: "236733P1", names: ["Tampa Riverwalk"] },
  { offerId: "431125P5", names: ["Blue Spring State Park"] },
  { offerId: "5608638P1", names: ["Keys Huka Dive"] },
]);

// ── THE SERVEABILITY GATE ────────────────────────────────────────────────
//
// Replaces the two-code denylist that used to sit at the top of this file. That
// gate could only ever refuse the two SKUs somebody had typed into it, so the
// 16 pins above rendered a Book button for a product that no longer existed and
// the click 302'd the customer back to our homepage. A denylist answers "is
// this one of the two codes we know about"; the question that protects revenue
// is "does the catalogue still carry this product, and is it alive".
//
// THE THREE OUTCOMES, in the order they are decided:
//   1. absent from the catalogue          -> no CTA        (proven gone)
//   2. present and health says DEAD        -> no CTA        (proven dead)
//   3. present and health says alive or is unknown -> CTA   (serve)
//
// UNKNOWN IS NOT DEAD, and that rule is the whole reason this is a gate rather
// than a filter. A 403, a timeout, a rate limit or a never-probed row is OUR
// failure, not the product's (lib/experienceLinkHealth classifies exactly this
// way). Treating unknown as dead would let one bad Viator afternoon silently
// un-monetize the entire pinned catalogue, which costs more than the defect it
// would be trying to prevent.
//
// WHERE THE CATALOGUE COMES FROM — read this before assuming more than it does.
// Place cards render on the CLIENT from client state, synchronously; there is
// no catalogue in scope there and a gate cannot await one. So this function
// takes the catalogue as an OPTIONAL argument:
//
//   - a caller that HAS catalogue rows (a server route, a cron, a guard) passes
//     one and gets a live existence/health verdict;
//   - a caller that does not gets the RECORDED verdict — RETIRED_VIATOR_PINS,
//     which is the catalogue's own answer from the last audit, plus the HOLD
//     codes.
//
// The recorded verdict is only trustworthy while something keeps it current, so
// the second half of this gate lives in scripts/check-inventory-integrity.mjs:
// it reads production with real credentials and FAILS when a pinned code has no
// catalogue row and is not recorded here.
//
// BE PRECISE ABOUT WHAT THAT BUYS (corrected 2026-09-10 — the first version of
// this comment claimed "a new death becomes a red build before it becomes a
// customer clicking a dead Book button", which was not true and is exactly the
// kind of claim scripts/check-guard-honesty.mjs exists to stop). That sweep
// DETECTS a new death; on its own it does not QUARANTINE one. A red build still
// needs a human to retire the pin and ship, and customers can click in between.
//
// The third half — the one that actually closes that window — is the live
// quarantine: lib/pinHealth.js computes positive death verdicts server-side,
// /api/partner/pin-health serves them, and lib/pinQuarantine.js hands them to
// this gate as `catalog.quarantined`. A product that dies stops painting a CTA
// within one 5-minute cache generation, with no deploy.
//
// So the three are: this ledger (instant, but only as fresh as the last ship),
// the quarantine feed (live, but only for pins the server has judged), and the
// credentialed sweep (the thing that makes a new death impossible to ignore).
// Do not delete the sweep and leave this list behind — on its own the list is a
// cache with no invalidation.
//
// The redirect layer already fails closed for the same three cases
// (lib/commerceProviders resolveOffer: offer-not-found / offer-link-dead). This
// gate is the half that stops the button from being PAINTED, which is the part
// the customer sees.

// Viator HOLD codes — same values as lib/viatorDenylist.js VIATOR_SKU_DENYLIST.
// Still inlined so the homepage chunk does not pull the denylist module and its
// HTML parsers; test-viator-integrity-lock CALLs the denylist against every row
// here, so the two cannot drift without a red build.
const HOLD_CODES = Object.freeze(["236862P2", "22211P1"]);

const RETIRED_CODES = new Set(RETIRED_VIATOR_PINS.map((r) => String(r.offerId).toUpperCase()));
const HOLD_SET = new Set(HOLD_CODES.map((c) => c.toUpperCase()));

/**
 * Build the catalogue view this gate accepts, from wf_experiences rows.
 * Kept here (not in the guard) so the shape the gate reads and the shape a
 * caller builds cannot drift apart.
 *
 * @param {Array<{product_code?:string, link_ok?:boolean|null}>} rows
 * @returns {{has:(code:string)=>boolean, health:(code:string)=>boolean|null}}
 */
export function viatorCatalogFromRows(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = String((r && r.product_code) || "").trim().toUpperCase();
    if (!code) continue;
    // link_ok is tri-state: true alive, false proven dead, null never probed.
    m.set(code, r && typeof r.link_ok === "boolean" ? r.link_ok : null);
  }
  return {
    has: (code) => m.has(String(code || "").trim().toUpperCase()),
    health: (code) => {
      const v = m.get(String(code || "").trim().toUpperCase());
      return v === undefined ? null : v;
    },
  };
}

/**
 * Why a pin may or may not be shown. Returned rather than a bare boolean so a
 * caller can log WHICH containment fired — "no CTA" and "no CTA because the
 * product is gone" are different facts to an operator.
 *
 * @param {object|null} row   a PLACE_PARTNER_PICKS row
 * @param {object} [catalog]  optional. Any subset of:
 *   - has(code) -> boolean            existence; a code it does not have is
 *                                     refused as absent-from-catalogue
 *   - health(code) -> true|false|null tri-state; only an explicit false refuses
 *   - quarantined(code) -> boolean    a positive server verdict that this exact
 *                                     code must not serve
 *   `viatorCatalogFromRows()` builds the first two from wf_experiences rows;
 *   `usePinQuarantine()` (lib/pinQuarantine.js) supplies the third, live, in
 *   the browser. The third is deliberately the only one the CLIENT gets: a
 *   quarantine list can only ever remove a named code, whereas an existence
 *   view refuses by OMISSION, so a truncated or empty client-side catalogue
 *   would take every Book button on the site down at once.
 * @returns {{serveable:boolean, reason:string|null}}
 */
export function pinServeability(row, catalog) {
  if (!row) return { serveable: false, reason: "no-pin" };
  // Non-Viator pins resolve against their own tables/registries in
  // lib/commerceProviders (wf_deals, the TicketNetwork + CityPASS registries),
  // which apply the same existence and tracking rules at redirect time. This
  // catalogue is Viator's; handing a Viator catalogue to a Tiqets row and
  // finding nothing would be a false death, not a check.
  if (row.provider !== "viator") return { serveable: true, reason: null };

  const code = String(row.offerId || "").trim().toUpperCase();
  if (!code) return { serveable: false, reason: "no-offer-id" };
  if (HOLD_SET.has(code)) return { serveable: false, reason: "hold-denylisted" };
  if (RETIRED_CODES.has(code)) return { serveable: false, reason: "retired-absent-from-catalogue" };

  // The LIVE verdict, when a caller has one. Checked before the existence view
  // because it is the most recent thing anybody knows about this code.
  if (catalog && typeof catalog.quarantined === "function" && catalog.quarantined(code)) {
    return { serveable: false, reason: "quarantined-live-health" };
  }
  if (catalog && typeof catalog.has === "function") {
    if (!catalog.has(code)) return { serveable: false, reason: "absent-from-catalogue" };
    // Explicitly false only. undefined/null is "never probed" and still serves.
    if (typeof catalog.health === "function" && catalog.health(code) === false) {
      return { serveable: false, reason: "catalogue-link-dead" };
    }
  }
  return { serveable: true, reason: null };
}

export function placePartnerPick(place, catalog) {
  const byId = place && place.id ? (BY_ID.get(String(place.id)) || null) : null;
  const name = norm(place && place.name);
  const byName = name ? (BY_NAME.get(name) || null) : null;
  // Place-id wins when both are set and disagree: the live sheet is opened
  // by id. They agree for every row that carries a placeIds list today.
  const row = byId || byName;
  // The serveability gate is the lock, not the comments above the list: a HOLD
  // code, a retired code, or (when the caller supplies a catalogue) a product
  // the catalogue no longer carries cannot become a Book pin, however it got
  // back into PLACE_PARTNER_PICKS.
  if (!row || !pinServeability(row, catalog).serveable) return null;
  return row;
}

// One offer per card. A founder pin is the Book; the nearby / viaTours
// list must not paint a second earning CTA on the same sheet.
//
// A pin the gate refuses is NOT a pin, so the nearby list opens back up — a
// place whose founder product died falls back to real nearby inventory instead
// of being left with no bookable path at all. Same `catalog` argument, passed
// straight through, so the two surfaces cannot disagree about liveness.
export function nearbyTourListAllowed(place, catalog) {
  return !placePartnerPick(place, catalog);
}
