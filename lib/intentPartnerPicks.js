// Public, client-safe placement catalogue for intent-sheet partner picks.
//
// This file deliberately contains NO destination URLs. The browser receives
// only an opaque offer id and links to Wayfind's /api/commerce/go redirect.
// The server-only destination registry lives in partnerOfferRegistry.js.
// Keeping those halves separate prevents raw affiliate/product URLs from
// leaking into the client bundle while still making placement location-aware.

import { isHotlinkRefusedImage } from "./imageHostPolicy.js";

const CITIES = Object.freeze({
  orlando: Object.freeze(["orlando", "winter park", "kissimmee", "lake buena vista"]),
  tampa: Object.freeze(["tampa", "tampa bay", "st. petersburg", "saint petersburg"]),
  clearwater: Object.freeze(["clearwater"]),
  sarasota: Object.freeze(["sarasota", "bradenton", "lakewood ranch", "venice", "anna maria", "anna maria island", "siesta key", "longboat key"]),
  parrish: Object.freeze(["parrish"]),
  "st-augustine": Object.freeze(["st. augustine", "st augustine", "saint augustine"]),
  "key-west": Object.freeze(["key west"]),
  miami: Object.freeze(["miami"]),
  "las-vegas": Object.freeze(["las vegas", "vegas"]),
  "new-york": Object.freeze(["new york", "new york city", "nyc", "manhattan", "brooklyn", "queens", "bronx"]),
});

// Client-safe affiliate geography. These are verified Viator destination ids,
// never destination URLs. Small towns can belong to a larger bookable market
// without losing their own name in the UI: Parrish keeps Parrish editorial
// copy while its inventory resolves inside the Sarasota/Bradenton catalogue.
// Unknown cities retain a strict city-name query and no destination id, so the
// API must still find positive local evidence or return no products.
const INVENTORY_MARKETS = Object.freeze({
  orlando: Object.freeze({ searchCity: "Orlando", region: "Orlando", destId: "663" }),
  "winter park": Object.freeze({ searchCity: "Orlando", region: "Orlando Winter Park", destId: "663" }),
  kissimmee: Object.freeze({ searchCity: "Orlando", region: "Orlando Kissimmee", destId: "663" }),
  "lake buena vista": Object.freeze({ searchCity: "Orlando", region: "Orlando Lake Buena Vista", destId: "663" }),
  tampa: Object.freeze({ searchCity: "Tampa", region: "Tampa", destId: "666" }),
  "tampa bay": Object.freeze({ searchCity: "Tampa", region: "Tampa Bay", destId: "666" }),
  clearwater: Object.freeze({ searchCity: "Clearwater", region: "Clearwater St Petersburg", destId: "5403" }),
  "st. petersburg": Object.freeze({ searchCity: "St Petersburg", region: "St Petersburg", destId: "5403" }),
  "saint petersburg": Object.freeze({ searchCity: "St Petersburg", region: "St Petersburg", destId: "5403" }),
  sarasota: Object.freeze({ searchCity: "Sarasota", region: "Sarasota", destId: "25738" }),
  bradenton: Object.freeze({ searchCity: "Bradenton", region: "Sarasota Bradenton", destId: "25738" }),
  parrish: Object.freeze({ searchCity: "Bradenton", region: "Sarasota Bradenton Parrish", destId: "25738" }),
  "lakewood ranch": Object.freeze({ searchCity: "Bradenton", region: "Sarasota Bradenton Lakewood Ranch", destId: "25738" }),
  venice: Object.freeze({ searchCity: "Sarasota", region: "Sarasota Venice", destId: "25738" }),
  "anna maria": Object.freeze({ searchCity: "Sarasota", region: "Sarasota Anna Maria", destId: "25738" }),
  "anna maria island": Object.freeze({ searchCity: "Sarasota", region: "Sarasota Anna Maria", destId: "25738" }),
  "siesta key": Object.freeze({ searchCity: "Sarasota", region: "Sarasota Siesta Key", destId: "25738" }),
  "longboat key": Object.freeze({ searchCity: "Sarasota", region: "Sarasota Longboat Key", destId: "25738" }),
  "st. augustine": Object.freeze({ searchCity: "St. Augustine", region: "St. Augustine" }),
  "st augustine": Object.freeze({ searchCity: "St. Augustine", region: "St. Augustine" }),
  "saint augustine": Object.freeze({ searchCity: "St. Augustine", region: "St. Augustine" }),
  "key west": Object.freeze({ searchCity: "Key West", region: "Key West" }),
  miami: Object.freeze({ searchCity: "Miami", region: "Miami" }),
  "las vegas": Object.freeze({ searchCity: "Las Vegas", region: "Las Vegas" }),
  vegas: Object.freeze({ searchCity: "Las Vegas", region: "Las Vegas" }),
  "new york": Object.freeze({ searchCity: "New York City", region: "New York City", destId: "687" }),
  "new york city": Object.freeze({ searchCity: "New York City", region: "New York City", destId: "687" }),
  nyc: Object.freeze({ searchCity: "New York City", region: "New York City", destId: "687" }),
  manhattan: Object.freeze({ searchCity: "New York City", region: "New York City Manhattan", destId: "687" }),
  brooklyn: Object.freeze({ searchCity: "New York City", region: "New York City Brooklyn", destId: "687" }),
  queens: Object.freeze({ searchCity: "New York City", region: "New York City Queens", destId: "687" }),
  bronx: Object.freeze({ searchCity: "New York City", region: "New York City Bronx", destId: "687" }),
});

const pick = (offerId, provider, merchant, eyebrow, title, reason, cta = "Check availability") =>
  Object.freeze({ offerId, provider, merchant, eyebrow, title, reason, cta });

const artPick = (offerId, provider, merchant, eyebrow, title, reason, image, details = {}, cta = "Check availability") =>
  Object.freeze({ ...pick(offerId, provider, merchant, eyebrow, title, reason, cta), image, ...details });

const LOCAL_INTENT_COPY = Object.freeze({
  "date-night": Object.freeze({ query: "food wine evening tour", eyebrow: "A local date worth booking", reason: (city) => `A verified experience in ${city} that gives the evening a real centerpiece while leaving the rest of the date flexible.` }),
  family: Object.freeze({ query: "family experience", eyebrow: "A family plan nearby", reason: (city) => `A verified, bookable experience around ${city} when the family wants one clear plan instead of another open-ended search.` }),
  tonight: Object.freeze({ query: "evening experience", eyebrow: "Bookable around town", reason: (city) => `A verified local experience around ${city} for turning tonight into a plan without sending you to a generic attractions page.` }),
  "worth-the-drive": Object.freeze({ query: "day trip experience", eyebrow: "Make the drive count", reason: (city) => `A verified experience in the ${city} area with enough substance to justify building part of the day around it.` }),
  "hidden-gems": Object.freeze({ query: "unique local experience", eyebrow: "Look past the obvious", reason: (city) => `A verified ${city} experience that offers a more specific story than the standard first-time-visitor checklist.` }),
  budget: Object.freeze({ query: "affordable experience", eyebrow: "A bookable value pick", reason: (city) => `A verified option around ${city} for keeping the plan interesting without making price the only thing that matters.` }),
  "best-of": Object.freeze({ query: "top attractions", eyebrow: "A bookable local standout", reason: (city) => `A verified ${city} experience that belongs beside the area's durable place recommendations—not inside their ranking.` }),
});

// One deliberately chosen, bookable complement per sheet. These NEVER enter
// rankRows(), the Wayfind Score, or the durable place order. They are a separate
// partner layer after the coupon strip and before the organic experience rail.
export const INTENT_PARTNER_PICKS = Object.freeze({
  orlando: Object.freeze({
    "date-night": pick(
      "orlando-date-night-sealife-andretti", "tiqets", "Tiqets", "A two-stop date",
      "SEA LIFE Orlando + Andretti Indoor Karting",
      "Start under the aquarium lights, then make the second half playful indoors—an easy Orlando date even when the weather turns."
    ),
    family: pick(
      "orlando-family-wonderworks-crayola", "tiqets", "Tiqets", "Rain-proof family plan",
      "WonderWorks + Crayola Experience",
      "Two hands-on attractions in one plan, with enough variety for kids without asking the adults to spend the day watching from a bench."
    ),
    tonight: pick(
      "orlando-tonight-sealife", "tiqets", "Tiqets", "Easy to book tonight",
      "SEA LIFE Orlando",
      "A compact indoor option on International Drive when you want a real activity without committing the entire evening."
    ),
    "worth-the-drive": pick(
      "orlando-drive-kennedy-explore", "tiqets", "Tiqets", "Make the drive count",
      "Kennedy Space Center + Explore Tour",
      "The added Explore Tour turns the coast drive into a fuller space-day instead of a quick admission stop."
    ),
    "hidden-gems": pick(
      "orlando-hidden-chocolate-kingdom", "tiqets", "Tiqets", "Beyond the theme parks",
      "Chocolate Kingdom Factory Tour",
      "A small-scale factory tour that shows how chocolate is made—specific, tactile, and very different from Orlando's headline attractions."
    ),
    budget: pick(
      "orlando-budget-iride-trolley", "tiqets", "Tiqets", "Spend less getting around",
      "I-Ride Trolley Orlando",
      "A practical way to connect International Drive stops without paying for a separate ride every time."
    ),
    "best-of": pick(
      "orlando-best-gocity-pass", "gocity", "Go City", "Bundle the shortlist",
      "Go City Orlando All-Inclusive Pass",
      "Best when your Orlando plan already includes several paid attractions; compare the included choices first so the pass serves the trip rather than deciding it."
    ),
  }),

  tampa: Object.freeze({
    family: pick(
      "tampa-family-florida-aquarium", "klook", "Klook", "Tampa's family anchor",
      "The Florida Aquarium",
      "A downtown, weather-proof family plan with enough habitats to carry a half day and Channelside immediately outside."
    ),
    "best-of": pick(
      "citypass-tampa", "citypass", "CityPASS", "Bundle the headline stops",
      "Tampa Bay CityPASS®",
      "Useful when the trip includes several major attractions and you would rather make one ticket decision than five."
    ),
    "hidden-gems": pick(
      "tampa-hidden-plant-museum", "tiqets", "Tiqets", "The city before the skyline",
      "Henry B. Plant Museum + Audio Guide",
      "Step inside Tampa's Gilded Age story in the former railroad hotel that shaped the city's early tourism."
    ),
    "date-night": pick(
      "tampa-date-dali-museum", "tiqets", "Tiqets", "An art-led date",
      "The Dalí Museum",
      "The collection gives the date a built-in conversation, and St. Petersburg's waterfront handles the before-or-after part."
    ),
    "worth-the-drive": pick(
      "tampa-drive-clearwater-aquarium", "tiqets", "Tiqets", "A purpose-built coast day",
      "Clearwater Marine Aquarium",
      "Make the Gulf-side drive for a working marine-rescue center rather than treating it like a conventional display aquarium."
    ),
    budget: pick(
      "tampa-budget-plant-museum", "tiqets", "Tiqets", "A smaller-ticket history stop",
      "Henry B. Plant Museum + Audio Guide",
      "A focused cultural stop that adds real Tampa context without requiring a full attraction-day itinerary."
    ),
    tonight: pick(
      "tampa-tonight-sunset-cruise", "tiqets", "Tiqets", "Bookable after dark",
      "Clearwater Sunset Cruise with Champagne",
      "A 105-minute Gulf sunset cruise with a champagne toast, timed to put you on the water for the moment the light changes instead of chasing a spot on the beach."
    ),
  }),

  sarasota: Object.freeze({
    "date-night": pick(
      "sarasota-date-van-wezel", "ticketnetwork", "TicketNetwork", "Put a show in the plan",
      "What's playing at Van Wezel",
      "Sarasota's waterfront performance hall makes the evening feel decided while leaving dinner and a bayfront walk flexible."
    ),
    "worth-the-drive": pick(
      "sarasota-drive-dali-museum", "tiqets", "Tiqets", "Cross the bay for the collection",
      "The Dalí Museum",
      "A strong St. Petersburg day trip when the art—not just the drive—is substantial enough to be the plan."
    ),
    family: pick(
      "sarasota-family-florida-aquarium", "klook", "Klook", "A bigger family day",
      "The Florida Aquarium",
      "Worth saving for a Tampa day when the family wants a major indoor attraction rather than another quick local stop."
    ),
    // Coverage-gap fill 2026-08-01: tonight/hidden-gems/budget/best-of had no
    // curated pick and fell through to inventoryPartnerPick()'s generic
    // nationwide copy. Tiqets carries no direct Sarasota inventory (checked
    // three ways: a Tiqets-branded city search, an evening/night-tour search,
    // and a targeted search for Marie Selby / Mote Marine / The Ringling —
    // all came up empty), so these four use provider "viator" with real
    // product_code values read straight from wf_experiences (link_ok: true,
    // fail_count: 0, refreshed same day this was written) instead of a
    // hand-pasted URL — same resolution path PROVIDERS.viator already uses
    // for the un-curated fallback, just with Sarasota-specific copy.
    tonight: pick(
      "292464P2", "viator", "Viator", "Lights up after sunset",
      "Clear Kayak LED Night Glass Bottom Tour",
      "A see-through kayak lit from below for a night paddle on Sarasota Bay—one of the few genuinely after-dark bookable options in this market."
    ),
    "hidden-gems": pick(
      "454941P4", "viator", "Viator", "Away from Siesta Key",
      "Robinson Preserve Mangrove Tour",
      "A guided paddle through a restored mangrove preserve north of the city—quieter water and a different stretch of the estuary than the Siesta Key routes most visitors book."
    ),
    budget: pick(
      "5560271P1", "viator", "Viator", "Low price, high odds",
      "Bradenton Manatee Watching Walking Tour",
      "A guided shoreline walk with a guaranteed manatee sighting, priced well under a kayak or boat charter for the same wildlife."
    ),
    "best-of": pick(
      "108117P1", "viator", "Viator", "The market's proven pick",
      "Sarasota Guided Mangrove Tunnel Kayak Tour",
      "The area's most-booked bookable experience by a wide margin—thousands of trips through the mangrove tunnels holding a five-star average."
    ),
  }),

  parrish: Object.freeze({
    "best-of": artPick(
      "412732P1", "viator", "Viator", "Beyond the train platform",
      "Clear Kayak Ecotour at Robinson Preserve",
      "Parrish's railroad museum is the local signature; this guided mangrove paddle adds a distinctly Manatee County half-day when the plan needs more than one stop.",
      "https://getupandgokayaking.com/wp-content/uploads/sites/5272/2023/11/Robinson-Preserve-Clear-Kayak-Ecotour-image-1.jpg?w=700&h=700&zoom=2",
      Object.freeze({ rating: 4.8, reviews: 57, duration: "2h" })
    ),
    // FIRST AWIN PLACEMENT (2026-08-12). SamBoat approved today; the dashboard
    // reads "Joined" and it is the only advertiser in Advertiser Performance.
    //
    // WHY PARRISH / WORTH-THE-DRIVE AND NOT A TAMPA SLOT: Parrish had six empty
    // intent slots and Tampa had none, so this fills a real gap instead of
    // evicting a pick someone chose. It is also the honest reading of the
    // intent — Parrish is inland and the boats are 30–45 minutes west, which is
    // exactly what "worth the drive" is for. SamBoat has NO Sarasota, Bradenton
    // or Anna Maria page (all soft-404), so Tampa is the nearest real inventory
    // and the copy says so rather than implying boats leave from Parrish.
    "worth-the-drive": artPick(
      "tampa-boat-samboat", "awin_samboat", "SamBoat", "Make the drive count",
      "Rent a boat on Tampa Bay",
      "Parrish is landlocked, so the water is the drive — captained and bareboat rentals launch from Tampa and Clearwater, about forty minutes west.",
      "https://cdn.samboat.fr/announcements-v2/6792e347d082f-s.webp"
    ),
  }),

  // New city keys for verified Awin inventory that has no existing catalogue.
  // Orlando / Tampa / Sarasota featured slots stay with their current picks;
  // complements for those cities go on INTENT_PARTNER_RAILS.
  "st-augustine": Object.freeze({
    tonight: artPick(
      "staug-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "After dark in the old city",
      "St. Augustine Ghost Tour",
      "A walking night tour through the old city — the tour itself, not a generic attractions pass.",
      "https://assets.usghostadventures.com/wp-content/uploads/2022/10/St.-Augustine-Hero-Image.webp"
    ),
    // LANE C (2026-09-15). Registered in partnerOfferRegistry.js, rendered
    // nowhere. Live-verified: canonical unchanged, og:title "St. Augustine:
    // Hop-on Hop-off Old Town Trolley | Book Online".
    "best-of": artPick(
      "staugustine-hook-old-town-trolley", "tiqets", "Tiqets", "See the old city at your own pace",
      "St. Augustine Hop-On Hop-Off Old Town Trolley",
      "A day-long hop-on hop-off loop through the historic district — the practical way to string together the old city's sights without parking twice.",
      "https://aws-tiqets-cdn.imgix.net/images/content/ac6efc5e028041f6ac48f6d8ec947de5.jpg?auto=format%2Ccompress&fit=crop&q=70&w=600"
    ),
  }),

  "key-west": Object.freeze({
    tonight: artPick(
      "keywest-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "Island nights",
      "Key West Ghost Tour",
      "A walking night tour through Old Town — book the tour, not a sunset-cruise substitute.",
      "https://assets.usghostadventures.com/wp-content/uploads/2024/11/city_hero.webp"
    ),
    "worth-the-drive": artPick(
      "keywest-boat-samboat", "awin_samboat", "SamBoat", "Get on the water",
      "Rent a boat in Key West",
      "Captained and bareboat rentals from Key West — the water is the plan, not a day-trip add-on from the mainland.",
      "https://cdn.samboat.fr/announcements-v2/6810280cc925e-s.webp"
    ),
  }),

  miami: Object.freeze({
    // LANE C (2026-09-15). Both registered in partnerOfferRegistry.js,
    // rendered nowhere. Live-verified via browser render (gocity.com blocks
    // plain curl behind Cloudflare, so status-code-only checks are not
    // evidence either way — CLAUDE.md's "a 403 is not evidence of existence"
    // note runs both directions): "Our Miami passes" — a real, live pass
    // comparison page with working pricing and add-to-cart, not a 404/soft-404.
    "best-of": artPick(
      "miami-pass-gocity-all-inclusive", "gocity", "Go City", "Bundle the shortlist",
      "Go City Miami All-Inclusive Pass",
      "Best when the Miami plan already includes several paid attractions in one trip; compare the included list first so the pass serves the itinerary rather than deciding it.",
      "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/miami/Everglades_Alligator_Farm_6_verified"
    ),
    "worth-the-drive": artPick(
      "miami-boat-samboat", "awin_samboat", "SamBoat", "Get on the water",
      "Rent a boat in Miami",
      "Captained and bareboat rentals from Miami — a water day, not a substitute for a city attraction.",
      "https://cdn.samboat.fr/announcements-v2/682516529dd51-s.webp"
    ),
  }),

  clearwater: Object.freeze({
    // LANE C (2026-09-15). clearwater-hook-dolphin-cruise was registered in
    // partnerOfferRegistry.js but rendered nowhere. Live-verified the same
    // day: canonical URL unchanged (no soft-404 category fallback), og:title
    // "Clearwater: Guided Dolphin Exploration Cruise | Book Online".
    // clearwater-hook-calypso-queen was NOT placed here — its offer URL
    // redirects to the "Tampa Evening Cruises" category page (canonical
    // rewrites to tampa-evening-cruises-l205520, not the product page), the
    // exact soft-404 shape CLAUDE.md's guard-honesty notes call out. Skipped;
    // reported rather than shipped as a dead-looking Book button.
    family: artPick(
      "clearwater-hook-dolphin-cruise", "tiqets", "Tiqets", "See dolphins from the water",
      "Clearwater Guided Dolphin Exploration Cruise",
      "A guided small-boat cruise built around dolphin sightings on the Gulf side — a clear plan for a family afternoon that does not depend on the beach itself.",
      "https://aws-tiqets-cdn.imgix.net/images/content/54683b639d45431c916213df78a5857e.jpeg?auto=format%2Ccompress&fit=crop&q=70&w=600"
    ),
    "worth-the-drive": artPick(
      "clearwater-boat-samboat", "awin_samboat", "SamBoat", "Get on the water",
      "Rent a boat in Clearwater",
      "Captained and bareboat rentals from Clearwater — the Gulf is the plan, not a Tampa attraction wearing a beach label.",
      "https://cdn.samboat.fr/announcements-v2/652e280068633-s.webp"
    ),
  }),

  "las-vegas": Object.freeze({
    tonight: artPick(
      "vegas-shows-caesarsshows", "awin_caesarsshows", "Caesars Shows", "Center Strip shows",
      "Las Vegas shows at Caesars",
      "A live listing of Center Strip headliners and show packages — Vegas only, never a Florida night out.",
      "https://assets.caesars.com/m/14b099de46992a6d/original/colosseum-exterior-night-1920x1080.jpg",
      Object.freeze({}),
      "See shows"
    ),
  }),

  "new-york": Object.freeze({
    "date-night": pick(
      "nyc-date-liberty-sunset-cruise", "tiqets", "Tiqets", "Let the skyline do the work",
      "Statue of Liberty Sunset Cruise",
      "A moving skyline, sunset timing, and no pressure to manufacture conversation across a restaurant table."
    ),
    family: pick(
      "nyc-family-amnh", "tiqets", "Tiqets", "The dependable big museum day",
      "American Museum of Natural History",
      "Dinosaurs, the blue whale, and enough distinct halls for each person to find a favorite without splitting the family up."
    ),
    tonight: pick(
      "nyc-tonight-harbor-lights", "tiqets", "Tiqets", "New York after the lights come on",
      "Circle Line Evening Sightseeing Cruise",
      "See the skyline change after dark while keeping the evening to one clear, bookable plan."
    ),
    "hidden-gems": pick(
      "nyc-hidden-artechouse", "tiqets", "Tiqets", "Immersive, not encyclopedic",
      "ARTECHOUSE New York",
      "A compact digital-art experience for the day when another all-afternoon museum is not what the group needs."
    ),
    "worth-the-drive": pick(
      "nyc-drive-bronx-zoo", "tiqets", "Tiqets", "Leave Midtown behind",
      "Bronx Zoo",
      "The scale rewards the trip north—plan it as the day, not an add-on between Manhattan stops."
    ),
    "best-of": pick(
      "nyc-best-gocity-explorer", "gocity", "Go City", "Choose the icons you want",
      "Go City New York Explorer Pass",
      "Choose from the city's major paid landmarks and spread the visits across 30 days—useful when your shortlist is already clear and a fixed itinerary is not."
    ),
    // Coverage-gap fill 2026-08-01: the standalone ticket, not the $72.99
    // One World Observatory bundle — confirmed on its own Tiqets product page.
    // v8.31 LANE C: this key was accidentally duplicated (two identical object
    // literals under one `budget:` property) — the second silently overwrote
    // the first at parse time. Same value both times, so nothing rendered
    // wrong, but a future edit to only one copy would have gone invisible.
    // Kept once; see scripts/check-intent-partner-picks.mjs for the
    // no-duplicate-keys guard this earns.
    budget: pick(
      "nyc-budget-911-memorial", "tiqets", "Tiqets", "One focused ticket",
      "9/11 Memorial & Museum Entry",
      "A single standalone ticket to one of the city's most substantial sites, priced well under the combo passes that bundle it with pricier observation decks."
    ),
  }),
});

// A sheet may carry more than one deliberately chosen product when the
// products answer meaningfully different questions. Parrish is the first
// explicit multi-pick market: a preserve paddle, a sunset wildlife outing,
// and a private island-water tour. The railroad museum remains an editorial
// landmark because it is not an approved affiliate; it must never be dressed
// up as a partner link merely to make this rail look fuller.
export const INTENT_PARTNER_RAILS = Object.freeze({
  orlando: Object.freeze({
    budget: Object.freeze([
      INTENT_PARTNER_PICKS.orlando.budget,
      // LANE C (2026-09-15). orlando-pass-gocity-essentials was registered
      // in partnerOfferRegistry.js, rendered nowhere. Live-verified via
      // browser render: "Our Orlando passes" comparison page, live pricing
      // and cart — the cheaper of Orlando's two Go City tiers, kept as a
      // rail complement rather than displacing the trolley featured pick.
      artPick(
        "orlando-pass-gocity-essentials", "gocity", "Go City", "The cheaper pass",
        "Go City Orlando Essentials Pass",
        "The lower-priced Go City tier — worth comparing against the All-Inclusive pass when the shortlist is short enough that the cheaper bundle already covers it.",
        "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/orlando/AP_Kennedy_Space_Center_07_axfw86"
      ),
    ]),
    "worth-the-drive": Object.freeze([
      INTENT_PARTNER_PICKS.orlando["worth-the-drive"],
      artPick(
        "orlando-airport-rentcars", "awin_rentcars", "Rentcars", "Airport car rental",
        "Rent a car at Orlando International (MCO)",
        "Airport car rental at MCO — trip support for the drive, not an Orlando attraction.",
        "https://static.rentcars.com/imagens/carros/chevrolet-spark.png",
        Object.freeze({}),
        "Compare airport rentals"
      ),
      // LANE C (2026-09-15). orlando-best-gatorland-kennedy was registered
      // in partnerOfferRegistry.js, rendered nowhere. Live-verified: og:title
      // "Gatorland Orlando + Kennedy Space Center" — a real combo product,
      // not the plain Kennedy admission already covered by the featured pick.
      artPick(
        "orlando-best-gatorland-kennedy", "tiqets", "Tiqets", "Two coast-drive stops, one ticket",
        "Gatorland + Kennedy Space Center Combo",
        "Pairs Gatorland with Kennedy Space Center admission on one ticket — a fuller coast day than either stop alone.",
        "https://aws-tiqets-cdn.imgix.net/images/content/e4c24e2b80194f59a57cea6ffa6417f8.jpg?auto=format%2Ccompress&fit=crop&q=70&w=600"
      ),
    ]),
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS.orlando["best-of"],
      // LANE C (2026-09-15). orlando-pass-gocity-explorer was registered in
      // partnerOfferRegistry.js, rendered nowhere. Live-verified: "Our
      // Orlando passes" comparison page, live pricing and cart. All-Inclusive
      // stays featured (per plan); Explorer is the pick-your-own-attractions
      // alternative rather than a replacement.
      artPick(
        "orlando-pass-gocity-explorer", "gocity", "Go City", "Choose your own attractions",
        "Go City Orlando Explorer Pass",
        "Pick a set number of attractions from the Go City list instead of the fixed All-Inclusive bundle — better when the shortlist is short and specific.",
        "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/orlando/madame_tussauds_orlando_4_yszsve"
      ),
    ]),
    // LANE E (2026-09-16). orlando-tour-echoes-of-history was stuck in
    // menuPartnerOffers.js's DELIBERATELY_UNPLACED because PROVIDERS.wegotrip
    // did not exist. Now lit (lib/commerceProviders.js). Re-fetched live: H1
    // "Orlando: Echoes of History Audio Tour", Book now CTA present. Kept as
    // a rail complement beside the Chocolate Kingdom featured pick — a
    // self-guided history walk is a different kind of "beyond the theme
    // parks" answer, not a replacement for it.
    "hidden-gems": Object.freeze([
      INTENT_PARTNER_PICKS.orlando["hidden-gems"],
      artPick(
        "orlando-tour-echoes-of-history", "wegotrip", "WeGoTrip", "A self-guided history walk",
        "Orlando: Echoes of History Audio Tour",
        "A self-paced audio walk through Orlando's pre-theme-park history — a quieter, more specific story than the factory-tour featured pick.",
        "https://wgt-prod-storage.s3.amazonaws.com/media/products/imagefile/None/tmp14voijvg.jpg"
      ),
    ]),
  }),
  "key-west": Object.freeze({
    // LANE E (2026-09-16). keywest-tour-old-town-audio was stuck in
    // menuPartnerOffers.js's DELIBERATELY_UNPLACED because PROVIDERS.wegotrip
    // did not exist. Now lit. Re-fetched live: H1 "Key West: Easy Strolling
    // (or Biking) Self-Guided Audio Tour Through the Heart of Downtown", Book
    // now CTA present. key-west has no existing "best-of" featured pick, so
    // this rail carries the tour alone rather than pairing it with a
    // nonexistent INTENT_PARTNER_PICKS["key-west"]["best-of"].
    "best-of": Object.freeze([
      artPick(
        "keywest-tour-old-town-audio", "wegotrip", "WeGoTrip", "See Old Town at your own pace",
        "Key West: Self-Guided Audio Tour Through Old Town",
        "A self-paced walking (or biking) audio tour through the heart of Old Town — a bookable standout beside Key West's durable place recommendations.",
        "https://wgt-prod-storage.s3.amazonaws.com/media/products/imagefile/None/promo-wegotrip.jpg"
      ),
    ]),
  }),
  tampa: Object.freeze({
    tonight: Object.freeze([
      INTENT_PARTNER_PICKS.tampa.tonight,
      artPick(
        "tampa-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "After dark in Cigar City",
        "Tampa Ghost Tour",
        "A walking night tour through Tampa — a different evening than the Gulf sunset cruise, not a replacement for it.",
        "https://assets.usghostadventures.com/wp-content/uploads/2024/09/Tampa-Hero-Image.webp"
      ),
    ]),
    "worth-the-drive": Object.freeze([
      INTENT_PARTNER_PICKS.tampa["worth-the-drive"],
      artPick(
        "tampa-airport-rentcars", "awin_rentcars", "Rentcars", "Airport car rental",
        "Rent a car at Tampa Airport (TPA)",
        "Airport car rental at TPA — trip support for getting around the bay, not a Tampa attraction.",
        "https://static.rentcars.com/imagens/carros/chevrolet-spark.png",
        Object.freeze({}),
        "Compare airport rentals"
      ),
    ]),
    // LANE C (2026-09-15). tampa-hook-golf-cart-tour was registered in
    // partnerOfferRegistry.js, rendered nowhere. Tampa's tour/landmark rails
    // are Lane B's surface (menu rails), but best-of already has a natural,
    // existing intent-rail slot — CityPASS's featured pick had no rail at
    // all — so this is the one Tampa placement from this batch that belongs
    // here rather than with Lane B. Live-verified: og:title "Tampa: Guided
    // Sightseeing Tour in Golf Cart | Book Online".
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS.tampa["best-of"],
      artPick(
        "tampa-hook-golf-cart-tour", "tiqets", "Tiqets", "See downtown a different way",
        "Tampa Guided Sightseeing Tour by Golf Cart",
        "A guided golf-cart loop through downtown and Ybor City — a lighter-weight complement to CityPASS's bundled admissions, not a replacement for them.",
        "https://aws-tiqets-cdn.imgix.net/images/content/d10b009741354ab49351f3774961e310.jpeg?auto=format%2Ccompress&fit=crop&q=70&w=600"
      ),
    ]),
  }),
  sarasota: Object.freeze({
    "worth-the-drive": Object.freeze([
      INTENT_PARTNER_PICKS.sarasota["worth-the-drive"],
      artPick(
        "sarasota-airport-rentcars", "awin_rentcars", "Rentcars", "Airport car rental",
        "Rent a car at Sarasota-Bradenton (SRQ)",
        "Airport car rental at SRQ — trip support for the drive, not a Sarasota attraction.",
        "https://static.rentcars.com/imagens/carros/chevrolet-spark.png",
        Object.freeze({}),
        "Compare airport rentals"
      ),
    ]),
  }),
  parrish: Object.freeze({
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS.parrish["best-of"],
      artPick(
        "454941P1", "viator", "Viator", "Sunset on the Manatee coast",
        "Sunset Kayak Dolphin Tour",
        "A guided two-hour paddle near Anna Maria Island timed for the softer evening light, with dolphins and manatees possible along the route.",
        "https://www.pelago.com/img/products/US-United%20States/sunset-kayak-experience-with-dolphin-sightseeing/82ef1c56-bf90-4e86-9d6d-7762dafbbb74_sunset-kayak-experience-with-dolphin-sightseeing.jpg",
        Object.freeze({ rating: 5, reviews: 112, duration: "2h" })
      ),
      artPick(
        "parrish-best-dali-museum", "tiqets", "Tiqets", "An art day across the bay",
        "The Dalí Museum",
        "A substantial St. Petersburg collection for the day when a regional culture stop is more appealing than another outdoor excursion.",
        "https://aws-tiqets-cdn.imgix.net/images/content/37e788d70a724b89870cc13e47f834b0.png?auto=format%2Ccompress&fit=crop&q=70",
        Object.freeze({ rating: 4.7, reviews: 65 })
      ),
      artPick(
        "5502818P1", "viator", "Viator", "Make it a private water day",
        "Private Dolphin Boat Tour around Anna Maria Island",
        "A private coastal outing for groups who want wildlife and island views without sharing the itinerary with a full tour boat.",
        "https://media.tacdn.com/media/attractions-splice-spp-210x118/13/a6/6b/a2.jpg",
        Object.freeze({ rating: 5, reviews: 15, duration: "2h" })
      ),
    ]),
  }),
  miami: Object.freeze({
    // LANE C (2026-09-15). miami-pass-gocity-explorer was registered in
    // partnerOfferRegistry.js, rendered nowhere. Live-verified the same as
    // its All-Inclusive sibling above. All-Inclusive stays featured; Explorer
    // is the pick-your-own alternative, not a replacement.
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS.miami["best-of"],
      artPick(
        "miami-pass-gocity-explorer", "gocity", "Go City", "Choose your own attractions",
        "Go City Miami Explorer Pass",
        "Pick a set number of attractions from the Go City Miami list instead of the fixed All-Inclusive bundle — better when the shortlist is short and specific.",
        "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/miami/SuperblueMiami_GoCity_Listing04"
      ),
    ]),
    // LANE E (2026-09-16). Both miami-tour-art-deco-south-beach and
    // miami-tour-downtown-audio were stuck in menuPartnerOffers.js's
    // DELIBERATELY_UNPLACED because PROVIDERS.wegotrip did not exist. Now lit
    // (lib/commerceProviders.js). Re-fetched live: H1s "Miami: Art Deco
    // Heritage of South Beach Audio Tour" and "Miami: Downtown Audio Tour",
    // Book now CTA present on both. miami has no existing "hidden-gems"
    // featured pick, so this rail carries both self-guided tours rather than
    // pairing with a nonexistent featured pick.
    "hidden-gems": Object.freeze([
      artPick(
        "miami-tour-art-deco-south-beach", "wegotrip", "WeGoTrip", "Beyond South Beach's nightlife",
        "Miami: Art Deco Heritage of South Beach Audio Tour",
        "A self-guided walk through South Beach's Art Deco district, told through its architecture rather than its nightlife reputation.",
        "https://wgt-prod-storage.s3.amazonaws.com/media/products/product/3221/depositphotos40468909l.jpg"
      ),
      artPick(
        "miami-tour-downtown-audio", "wegotrip", "WeGoTrip", "Downtown, on foot",
        "Miami: Downtown Audio Tour",
        "A self-guided audio walk through Downtown Miami — a specific, low-key alternative to the beach-and-boat itinerary most first visits default to.",
        "https://wegotrip.com/imgproxy/insecure/rs:fill:1200:630:1/g:sm/plain/?url=https://wgt-prod-storage.s3.eu-west-3.amazonaws.com/media/products/imagefile/None/depositphotos117344460l.jpg"
      ),
    ]),
  }),
  "new-york": Object.freeze({
    // LANE C (2026-09-15). nyc-best-city-cards was registered in
    // partnerOfferRegistry.js, rendered nowhere. Live-verified: the
    // destination now renders as "New York Attraction Passes" (Tiqets
    // renamed the listing; canonical still resolves to the same content,
    // not a category fallback) — a multi-card comparison distinct from the
    // single Go City Explorer Pass that stays featured.
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS["new-york"]["best-of"],
      artPick(
        "nyc-best-city-cards", "tiqets", "Tiqets", "Compare every NYC pass at once",
        "New York Attraction Passes",
        "A side-by-side listing of New York's attraction cards and passes — useful for comparing options against the Go City Explorer Pass before committing to one.",
        "https://aws-tiqets-cdn.imgix.net/images/content/8314ea818e7d4ebdb4c4579490594cba.JPG?auto=format%2Ccompress&fit=crop&q=70&w=600"
      ),
    ]),
  }),
});

export function normalizePartnerCity(city) {
  const raw = String(city || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return null;
  for (const [key, aliases] of Object.entries(CITIES)) {
    if (aliases.some((alias) => raw === alias || raw.startsWith(alias + ","))) return key;
  }
  return null;
}

// RENDERABLE IMAGES ONLY (2026-09-17 production photo audit). A pick whose
// image lives on a host that refuses a gowayfind.com Referer renders as a
// broken picture in every browser (lib/imageHostPolicy.js). Such a pick is
// not served until the partner supplies a licensed creative; the data stays
// in place for that day.
export function pickImageRenderable(pick) {
  return !isHotlinkRefusedImage(pick && pick.image);
}

export function intentPartnerPick(city, intent) {
  const cityKey = normalizePartnerCity(city);
  if (!cityKey || !intent) return null;
  const pick = INTENT_PARTNER_PICKS[cityKey]?.[intent] || null;
  return pick && pickImageRenderable(pick) ? pick : null;
}

export function intentPartnerPicks(city, intent) {
  const cityKey = normalizePartnerCity(city);
  if (!cityKey || !intent) return [];
  const rail = INTENT_PARTNER_RAILS[cityKey]?.[intent];
  if (Array.isArray(rail) && rail.length) {
    const usable = rail.filter(pickImageRenderable);
    if (usable.length) return usable;
  }
  const featured = INTENT_PARTNER_PICKS[cityKey]?.[intent];
  return featured && pickImageRenderable(featured) ? [featured] : [];
}

// The nationwide seam. Curated inventory above wins where an editor has
// verified the exact product and written local copy. Everywhere else, the
// intent page asks Wayfind's existing city-mode Viator resolver for verified
// local products and this promotes the first usable result. It consumes only
// the opaque product code; the raw product URL is deliberately ignored.
export function localPartnerQuery(city, intent) {
  const cleanCity = String(city || "").split(",")[0].trim().slice(0, 40);
  const copy = LOCAL_INTENT_COPY[intent];
  if (!cleanCity || cleanCity === "your town" || !copy) return null;
  const market = INVENTORY_MARKETS[cleanCity.toLowerCase().replace(/\s+/g, " ")];
  return `${market?.searchCity || cleanCity} ${copy.query}`;
}

export function partnerInventoryRequest(city, intent) {
  const cleanCity = String(city || "").split(",")[0].trim().slice(0, 40);
  const query = localPartnerQuery(cleanCity, intent);
  if (!query) return null;
  const market = INVENTORY_MARKETS[cleanCity.toLowerCase().replace(/\s+/g, " ")];
  return Object.freeze({
    query,
    region: market?.region || cleanCity,
    destId: market?.destId || null,
    searchCity: market?.searchCity || cleanCity,
  });
}

export function inventoryPartnerPick(city, intent, inventory) {
  const cleanCity = String(city || "").split(",")[0].trim().slice(0, 40);
  const copy = LOCAL_INTENT_COPY[intent];
  const item = Array.isArray(inventory)
    ? inventory.find((row) => row && String(row.code || "").trim() && String(row.title || "").trim())
    : null;
  if (!cleanCity || cleanCity === "your town" || !copy || !item) return null;
  return pick(
    String(item.code).trim(), "viator", "Viator", copy.eyebrow,
    String(item.title).trim().slice(0, 140), copy.reason(cleanCity)
  );
}

function inventoryDetails(inventory, offerId) {
  const row = Array.isArray(inventory)
    ? inventory.find((item) => String(item?.code || "").trim() === String(offerId || "").trim())
    : null;
  if (!row) return null;
  const details = {};
  const image = String(row.image || "").trim();
  const rating = Number(row.rating || 0) || 0;
  const reviews = Number(row.reviews || 0) || 0;
  const fromPrice = Number(row.fromPrice || 0) || 0;
  const duration = String(row.duration || "").trim();
  if (image) details.image = image;
  if (rating > 0) details.rating = rating;
  if (reviews > 0) details.reviews = reviews;
  if (fromPrice > 0) details.fromPrice = fromPrice;
  if (duration) details.duration = duration;
  return Object.freeze(details);
}

export function resolvedIntentPartnerPicks(city, intent, inventory, limit = 4) {
  const cleanCity = String(city || "").split(",")[0].trim().slice(0, 40);
  const copy = LOCAL_INTENT_COPY[intent];
  const chosen = [];
  const ids = new Set();
  const titles = new Set();
  const add = (value) => {
    if (!value || chosen.length >= limit) return;
    const id = String(value.offerId || "").trim();
    const titleKey = String(value.title || "").trim().toLowerCase();
    if (!id || !titleKey || ids.has(id) || titles.has(titleKey)) return;
    ids.add(id);
    titles.add(titleKey);
    const details = inventoryDetails(inventory, id);
    chosen.push(Object.freeze({ ...value, ...(details || {}) }));
  };

  intentPartnerPicks(city, intent).forEach(add);
  if (cleanCity && cleanCity !== "your town" && copy && Array.isArray(inventory)) {
    for (const row of inventory) {
      if (chosen.length >= limit) break;
      const id = String(row?.code || "").trim();
      const title = String(row?.title || "").trim().slice(0, 140);
      if (!id || !title) continue;
      add(pick(id, "viator", "Viator", copy.eyebrow, title, copy.reason(cleanCity)));
    }
  }
  return Object.freeze(chosen);
}

export function resolvedIntentPartnerPick(city, intent, inventory) {
  return resolvedIntentPartnerPicks(city, intent, inventory, 1)[0] || null;
}

export function partnerRailInventory(inventory, featuredPick) {
  if (!Array.isArray(inventory)) return inventory;
  const featured = Array.isArray(featuredPick) ? featuredPick : [featuredPick];
  const featuredIds = new Set(featured.map((row) => String(row?.offerId || "").trim()).filter(Boolean));
  return featuredIds.size
    ? inventory.filter((row) => !featuredIds.has(String(row?.code || "").trim()))
    : inventory;
}

// Merge broad city search results with exact curated-product enrichment. The
// broad search keeps its order; exact rows fill missing artwork/metadata and
// append only when their product code was outside the search window.
export function mergePartnerInventory(inventory, curated) {
  const rows = Array.isArray(inventory) ? inventory : [];
  const exact = Array.isArray(curated) ? curated : [];
  const byCode = new Map(exact.map((row) => [String(row?.code || "").trim(), row]).filter(([code]) => code));
  const merged = rows.map((row) => {
    const code = String(row?.code || "").trim();
    const detail = byCode.get(code);
    if (!detail) return row;
    byCode.delete(code);
    return Object.freeze({ ...row, ...detail });
  });
  for (const row of exact) {
    const code = String(row?.code || "").trim();
    if (code && byCode.has(code)) {
      merged.push(Object.freeze({ ...row }));
      byCode.delete(code);
    }
  }
  return Object.freeze(merged);
}

export function allIntentPartnerPicks() {
  const seen = new Set();
  const out = [];
  for (const [city, intents] of Object.entries(INTENT_PARTNER_PICKS)) {
    for (const [intent, value] of Object.entries(intents)) {
      seen.add(`${city}:${intent}`);
      const rail = INTENT_PARTNER_RAILS[city]?.[intent];
      const values = Array.isArray(rail) && rail.length ? rail : [value];
      for (const entry of values) out.push({ city, intent, ...entry });
    }
  }
  // LANE E (2026-09-16). A rail can exist for a city:intent pair with NO
  // featured pick in INTENT_PARTNER_PICKS (e.g. miami:hidden-gems,
  // key-west:best-of) — intentPartnerPicks() already serves these directly
  // (it falls back to the rail before ever looking at a featured pick), so
  // skipping them here would let real, client-reachable inventory go
  // completely unvalidated by every assertion below. Walking
  // INTENT_PARTNER_RAILS separately, skipping any pair already covered
  // above, closes that gap without double-counting a shared pair.
  for (const [city, intents] of Object.entries(INTENT_PARTNER_RAILS)) {
    for (const [intent, rail] of Object.entries(intents)) {
      if (seen.has(`${city}:${intent}`)) continue;
      if (!Array.isArray(rail) || !rail.length) continue;
      for (const entry of rail) out.push({ city, intent, ...entry });
    }
  }
  return out;
}

// Caps along the bookable-highlights path. The rail asks for a 40–50
// candidate window so filtering (dead links, missing art, duplicate titles)
// can still leave 30 qualified unique products. /api/viator/tours city mode
// already allows 60; /api/experiences serves up to 100 from owned
// wf_experiences. Neither number is a display target — the rail then keeps
// the best PARTNER_RAIL_RENDER_LIMIT.
export const PARTNER_INVENTORY_CANDIDATE_COUNT = 48;
export const PARTNER_RAIL_RENDER_LIMIT = 30;

// Destinations /api/experiences can serve as a single market. Must stay
// lockstep with lib/experiencesData.js DESTS. An unknown destId (NYC 687)
// must NEVER hit that route: serveExperiences falls through to every Florida
// dest when metroToDest misses, which would flood a non-Florida guide.
export const OWNED_EXPERIENCE_DEST_IDS = Object.freeze(["25738", "5403", "22457", "666", "663"]);

export function canReadOwnedExperienceCache(destId) {
  return OWNED_EXPERIENCE_DEST_IDS.includes(String(destId || "").trim());
}

function inventoryItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.tours)) return payload.tours;
  return Array.isArray(payload) ? payload : [];
}

function isRealPartnerImage(image) {
  const value = String(image || "").trim();
  return /^(https?:\/\/|\/)/i.test(value);
}

/**
 * Candidate rows that may become a bookable-highlights card. Dead links
 * (link_ok === false) drop; unchecked (null/absent) still serve — same rule
 * as dropDeadLinkRows. Imageless rows drop here so they cannot consume a
 * render slot that a qualified product would have filled.
 */
export function qualifyPartnerInventory(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  return list.filter((row) => {
    if (!row || row.link_ok === false) return false;
    const code = String(row.code || row.product_code || "").trim();
    const title = String(row.title || "").trim();
    if (!code || !title || !isRealPartnerImage(row.image)) return false;
    const idKey = code.toLowerCase();
    const titleKey = title.toLowerCase();
    if (seen.has(idKey) || seen.has(titleKey)) return false;
    seen.add(idKey);
    seen.add(titleKey);
    return true;
  });
}

function partnerToursCount(request, candidateCount) {
  // Owned dests already have a 40–50 window from wf_experiences. Keep the
  // live Viator search at its historical 12 so we do not enlarge a paid
  // fanout when the cache can fill the rail. Unseeded cities have no cache
  // and need the larger live window to have any chance of 30 cards.
  return canReadOwnedExperienceCache(request.destId) ? 12 : candidateCount;
}

export function partnerInventoryFetchPlan(city, intent, opts = {}) {
  const request = partnerInventoryRequest(city, intent);
  if (!request) return null;
  const candidateCount = Math.min(Math.max(Number(opts.count) || PARTNER_INVENTORY_CANDIDATE_COUNT, 1), 60);
  const tours = new URLSearchParams({ q: request.query, region: request.region, mode: "city", count: String(partnerToursCount(request, candidateCount)) });
  if (request.destId) tours.set("destId", request.destId);
  const curated = new URLSearchParams({ city: String(city || ""), intent: String(intent || "") });
  const experiences = canReadOwnedExperienceCache(request.destId)
    ? new URLSearchParams({ city: request.searchCity, limit: String(candidateCount) })
    : null;
  return Object.freeze({
    request,
    candidateCount,
    toursUrl: "/api/viator/tours?" + tours.toString(),
    curatedUrl: "/api/viator/curated?" + curated.toString(),
    experiencesUrl: experiences ? "/api/experiences?" + experiences.toString() : null,
  });
}

/**
 * Fetch the partner inventory a rail needs, given a city + intent.
 *
 * EXTRACTED 2026-08-02 (audit F2). This ran inline inside IntentPageClient,
 * which meant IntentPartnerPick could only ever render where THAT component had
 * already done the work. Mounting the rail anywhere else — a guide page, a
 * landing page — produced a rail that resolved its curated picks correctly and
 * then rendered NOTHING, because every pick is dropped unless it has an image
 * and the images arrive with this inventory. Measured before the fix: 18 of 18
 * guides would have shown an empty rail. A styled surface with no door.
 *
 * So the fetch lives here and both callers use it. Returns [] on any failure —
 * a provider outage must degrade the rail, never throw into a page render.
 *
 * `fetchImpl` is injectable so a guard can exercise this without a network.
 */
export async function fetchPartnerInventory(city, intent, opts = {}) {
  const doFetch = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return [];
  const plan = partnerInventoryFetchPlan(city, intent, opts);
  if (!plan) return []; // no city, no honest query — skip rather than guess
  try {
    // Exact-product enrichment is ADDITIVE: a provider or cache outage must
    // never erase the broad city rail that already loaded successfully, so the
    // curated call is caught separately rather than failing the pair. Owned
    // wf_experiences is the same: a cache miss must not erase the live search.
    const exactPromise = doFetch(plan.curatedUrl)
      .then((r) => (r && r.ok ? r.json() : null))
      .catch(() => null);
    const ownedPromise = plan.experiencesUrl
      ? doFetch(plan.experiencesUrl).then((r) => (r && r.ok ? r.json() : null), () => null)
      : Promise.resolve(null);
    const r = await doFetch(plan.toursUrl);
    const [j, exact, owned] = await Promise.all([r && r.ok ? r.json() : null, exactPromise, ownedPromise]);
    const live = inventoryItems(j);
    const cached = inventoryItems(owned);
    // Owned cache first: already dest-scoped, link-health filtered, and
    // ranked. Live search fills codes the cache window missed. Curated
    // enrichment still appends exact editor products outside both windows.
    const merged = mergePartnerInventory(mergePartnerInventory(cached, live), exact && exact.items);
    return qualifyPartnerInventory(merged).slice(0, plan.candidateCount);
  } catch (e) {
    return [];
  }
}
