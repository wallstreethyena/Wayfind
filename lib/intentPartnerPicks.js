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
  "new-york": Object.freeze(["new york", "new york city", "nyc", "manhattan", "brooklyn", "queens", "bronx"]),
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
      "orlando-best-gatorland-kennedy", "tiqets", "Tiqets", "Two Florida originals",
      "Gatorland + Kennedy Space Center",
      "Pair old-Florida wildlife with the Space Coast—the two sides of Central Florida that theme-park-only trips miss."
    ),
  }),

  tampa: Object.freeze({
    family: pick(
      "tampa-family-florida-aquarium", "klook", "Klook", "Tampa's family anchor",
      "The Florida Aquarium",
      "A downtown, weather-proof family plan with enough habitats to carry a half day and Channelside immediately outside."
    ),
    "best-of": pick(
      "tampa-best-citypass", "tiqets", "Tiqets", "Bundle the headline stops",
      "Tampa Bay CityPASS",
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
      "nyc-best-city-cards", "tiqets", "Tiqets", "One pass, several icons",
      "New York City attraction passes",
      "Best when your shortlist already includes several paid landmarks and you want one place to compare the pass options."
    ),
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

// The nationwide seam. Curated inventory above wins where an editor has
// verified the exact product and written local copy. Everywhere else, the
// intent page asks Wayfind's existing city-mode Viator resolver for verified
// local products and this promotes the first usable result. It consumes only
// the opaque product code; the raw product URL is deliberately ignored.
export function localPartnerQuery(city, intent) {
  const cleanCity = String(city || "").split(",")[0].trim().slice(0, 40);
  const copy = LOCAL_INTENT_COPY[intent];
  if (!cleanCity || cleanCity === "your town" || !copy) return null;
  return `${cleanCity} ${copy.query}`;
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

export function resolvedIntentPartnerPick(city, intent, inventory) {
  return intentPartnerPick(city, intent) || inventoryPartnerPick(city, intent, inventory);
}

export function allIntentPartnerPicks() {
  return Object.entries(INTENT_PARTNER_PICKS).flatMap(([city, intents]) =>
    Object.entries(intents).map(([intent, value]) => ({ city, intent, ...value }))
  );
}
