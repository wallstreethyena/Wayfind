// Public, client-safe placement catalogue for intent-sheet partner picks.
//
// This file deliberately contains NO destination URLs. The browser receives
// only an opaque offer id and links to Wayfind's /api/commerce/go redirect.
// The server-only destination registry lives in partnerOfferRegistry.js.
// Keeping those halves separate prevents raw affiliate/product URLs from
// leaking into the client bundle while still making placement location-aware.

const CITIES = Object.freeze({
  orlando: Object.freeze(["orlando", "winter park", "kissimmee", "lake buena vista"]),
  tampa: Object.freeze(["tampa", "tampa bay", "clearwater", "st. petersburg", "saint petersburg"]),
  sarasota: Object.freeze(["sarasota", "bradenton", "lakewood ranch", "venice", "anna maria"]),
  parrish: Object.freeze(["parrish"]),
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

const LOCAL_INTENT_COPY = Object.freeze({
  "date-night": Object.freeze({ query: "date night experience", eyebrow: "A local date worth booking", reason: (city) => `A verified experience in ${city} that gives the evening a real centerpiece while leaving the rest of the date flexible.` }),
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
    "best-of": pick(
      "412732P1", "viator", "Viator", "Beyond the train platform",
      "Clear Kayak Ecotour at Robinson Preserve",
      "Parrish's railroad museum is the local signature; this guided mangrove paddle adds a distinctly Manatee County half-day when the plan needs more than one stop."
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
    budget: pick(
      "nyc-budget-911-memorial", "tiqets", "Tiqets", "One focused ticket",
      "9/11 Memorial & Museum Entry",
      "A single standalone ticket to one of the city's most substantial sites, priced well under the combo passes that bundle it with pricier observation decks."
    ),
    // Coverage-gap fill 2026-08-01: the standalone ticket, not the $72.99
    // One World Observatory bundle — confirmed on its own Tiqets product page.
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
  parrish: Object.freeze({
    "best-of": Object.freeze([
      INTENT_PARTNER_PICKS.parrish["best-of"],
      pick(
        "454941P1", "viator", "Viator", "Sunset on the Manatee coast",
        "Sunset Kayak Dolphin Tour",
        "A guided two-hour paddle near Anna Maria Island timed for the softer evening light, with dolphins and manatees possible along the route."
      ),
      pick(
        "5502818P1", "viator", "Viator", "Make it a private water day",
        "Private Dolphin Boat Tour around Anna Maria Island",
        "A private coastal outing for groups who want wildlife and island views without sharing the itinerary with a full tour boat."
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

export function intentPartnerPick(city, intent) {
  const cityKey = normalizePartnerCity(city);
  if (!cityKey || !intent) return null;
  return INTENT_PARTNER_PICKS[cityKey]?.[intent] || null;
}

export function intentPartnerPicks(city, intent) {
  const cityKey = normalizePartnerCity(city);
  if (!cityKey || !intent) return [];
  const rail = INTENT_PARTNER_RAILS[cityKey]?.[intent];
  if (Array.isArray(rail) && rail.length) return rail;
  const featured = INTENT_PARTNER_PICKS[cityKey]?.[intent];
  return featured ? [featured] : [];
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
  return Object.freeze({
    image: String(row.image || "").trim() || null,
    rating: Number(row.rating || 0) || 0,
    reviews: Number(row.reviews || 0) || 0,
    fromPrice: Number(row.fromPrice || 0) || 0,
    duration: String(row.duration || "").trim() || null,
  });
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

export function allIntentPartnerPicks() {
  return Object.entries(INTENT_PARTNER_PICKS).flatMap(([city, intents]) =>
    Object.entries(intents).flatMap(([intent, value]) => {
      const rail = INTENT_PARTNER_RAILS[city]?.[intent];
      const values = Array.isArray(rail) && rail.length ? rail : [value];
      return values.map((entry) => ({ city, intent, ...entry }));
    })
  );
}
