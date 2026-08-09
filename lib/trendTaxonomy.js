// lib/trendTaxonomy.js — the CONTROLLED vocabulary between a trend feed and
// Wayfind. Nothing from a CSV reaches inventory matching, Google discovery or a
// card without passing through a concept declared in this file.
//
// THE FAILURE THIS EXISTS TO PREVENT. A trend feed is a list of strings people
// searched for. Most of them are not places, and the ones that are not are
// dangerous in a specific way: they LOOK matchable. "Hands-free dog leash" is a
// rising product, and a keyword matcher will happily hand it to every
// dog-friendly park. "Viator" is a booking platform, and matching it boosts
// every tour in the metro — which is both meaningless and, because Viator is an
// affiliate partner, indistinguishable from paid placement in the ranking. "AI
// travel planner" is software that will match a tourist attraction on the word
// "travel."
//
// None of those are bugs in the matcher. They are the matcher doing exactly what
// substring matching does. The fix is not a better string comparison — it is
// refusing to let an undeclared string become a query at all.
//
// SO: an ALLOWLIST, not a denylist. A topic that maps to no CONCEPT below is
// rejected with a reason and never reaches Google or inventory. The denylists
// further down exist to give a SPECIFIC rejection reason (and to make the test
// suite able to assert "this was rejected because it is a product", not merely
// "this was rejected"), not to be the primary defence. A denylist as primary
// defence fails open on every string nobody thought of.

/** Wayfind's inventory categories (supabase/places-inventory.sql). */
export const WF_CATEGORIES = ["food", "nightlife", "attractions", "beach", "hotels", "shopping"];

/** The eight menu lists this system is allowed to touch, by their route keys. */
export const MENU_LISTS = [
  "nearby",           // The best near you
  "food",             // Best places to eat nearby
  "things-to-do",     // Top things to do
  "hidden-gems",      // Hidden gems
  "creator-finds",    // Finds from local creators
  "tonight",          // Perfect for tonight
  "worth-the-drive",  // Worth the drive
  "budget",           // Big fun, small budget
];

// "The best near you" is deliberately ABSENT from every concept's `lists` below.
// It is the UNION of concepts qualified for the other relevant lists, computed
// by nearbyEligibleConcepts() — never its own pool. A catch-all membership would
// be a concept qualifying for the front page without qualifying for anything
// specific, which is how a vague trend reaches the most valuable surface.
export const NEARBY_IS_UNION = true;

/**
 * Topic families. The family is what category-relative normalisation buckets on
 * — food search volume dwarfs niche activity volume, so a raw volume comparison
 * would let any restaurant concept outrank every activity concept forever.
 */
export const TOPIC_FAMILIES = [
  "cuisine", "beverage", "dessert", "dining_format",
  "activity", "outdoor", "water", "fitness", "culture", "nightlife_format",
  "seasonal_nature", "wellness",
];

/**
 * THE CONCEPT REGISTRY. Each entry is a thing a person can actually do at a real
 * place in a real metro.
 *
 * Fields:
 *   aliases        controlled surface forms that MAP to this concept. Matching a
 *                  topic to a concept is exact-on-normalised-alias, never
 *                  substring — see conceptForTopic().
 *   family         the normalisation bucket.
 *   intent         eat | drink | visit | attend | book | do — the "how would a
 *                  person experience this" test. A topic with no intent is not a
 *                  Wayfind topic.
 *   categories     Wayfind categories a matching place may be in.
 *   primaryTypes   Google primaryType values that constitute POSITIVE evidence.
 *   types          Google `types` entries that constitute weaker positive evidence.
 *   denyTypes      types that DISQUALIFY a match even if something else matched.
 *   tagEvidence    DISCRIMINATING Wayfind tags only — tokens that identify THIS
 *                  concept, never the venue type. "coffee" is not evidence of
 *                  "Korean coffee"; "korean" is. Generic venue tags are already
 *                  scored by primaryTypes/types, and letting them double as
 *                  concept evidence is what made a plain cafe match a cuisine.
 *   lists          which menu lists this concept may order.
 *   query          the CONTROLLED Google Places query template. `{metro}` is the
 *                  only interpolation, and it is filled from an approved metro
 *                  list — never from CSV text. See googleQueryFor().
 *   querySku       which metered Places SKU the template costs.
 *   evidenceFloor  minimum semantic confidence for this concept to match. Narrow
 *                  concepts with a dedicated Google type can afford a low floor;
 *                  concepts that can only ever be evidenced by a tag or an
 *                  editorial fact need a high one.
 */
export const CONCEPTS = {
  // ── Food & drink ─────────────────────────────────────────────────────────
  korean_coffee: {
    aliases: ["korean coffee", "korean cafe", "korean coffee shop", "dalgona coffee shop"],
    family: "beverage", intent: "drink",
    categories: ["food"],
    primaryTypes: ["cafe", "coffee_shop"],
    types: ["cafe", "coffee_shop", "bakery"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store", "gas_station"],
    tagEvidence: ["korean"],
    lists: ["food", "tonight"],
    query: "korean coffee shop in {metro}", querySku: "searchText",
    // A cafe alone is not a KOREAN cafe. The cuisine tag or an editorial fact has
    // to carry it, so the floor is above what type evidence alone can reach.
    evidenceFloor: 0.6,
  },
  vietnamese_coffee: {
    aliases: ["vietnamese coffee", "vietnamese cafe", "ca phe sua da", "egg coffee"],
    family: "beverage", intent: "drink",
    categories: ["food"],
    primaryTypes: ["cafe", "coffee_shop", "vietnamese_restaurant"],
    types: ["cafe", "coffee_shop", "vietnamese_restaurant"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["vietnamese"],
    lists: ["food", "tonight"],
    query: "vietnamese coffee shop in {metro}", querySku: "searchText",
    evidenceFloor: 0.6,
  },
  kakigori: {
    aliases: ["kakigori", "shaved ice dessert", "japanese shaved ice"],
    family: "dessert", intent: "eat",
    categories: ["food"],
    primaryTypes: ["dessert_shop", "ice_cream_shop", "japanese_restaurant"],
    types: ["dessert_shop", "ice_cream_shop", "japanese_restaurant", "cafe"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["kakigori"],
    lists: ["food", "tonight"],
    query: "kakigori shaved ice dessert in {metro}", querySku: "searchText",
    // Highly specific: a generic ice cream shop is NOT kakigori. Needs the venue
    // named or verified for it.
    evidenceFloor: 0.75,
  },
  natural_wine_bar: {
    aliases: ["natural wine bar", "natural wine", "orange wine bar", "low intervention wine bar"],
    family: "nightlife_format", intent: "drink",
    categories: ["nightlife", "food"],
    primaryTypes: ["wine_bar", "bar"],
    types: ["wine_bar", "bar", "restaurant"],
    denyTypes: ["liquor_store", "grocery_store", "supermarket"],
    tagEvidence: ["natural-wine"],
    lists: ["food", "tonight", "nearby"],
    query: "natural wine bar in {metro}", querySku: "searchText",
    // "Natural wine" at a restaurant with no evidence it pours any is the
    // canonical false match. A wine_bar type gets you partway; the tag or an
    // editorial fact is what closes it.
    evidenceFloor: 0.7,
  },
  listening_bar: {
    aliases: ["listening bar", "hi-fi bar", "hifi listening bar", "vinyl bar"],
    family: "nightlife_format", intent: "drink",
    categories: ["nightlife"],
    primaryTypes: ["bar", "night_club"],
    types: ["bar", "night_club"],
    denyTypes: ["liquor_store", "package_store"],
    tagEvidence: ["listening-bar", "vinyl"],
    lists: ["tonight", "nearby"],
    query: "listening bar vinyl in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },
  mocktail_bar: {
    aliases: ["mocktail bar", "zero proof bar", "non alcoholic bar", "alcohol free bar"],
    family: "nightlife_format", intent: "drink",
    categories: ["nightlife", "food"],
    primaryTypes: ["bar", "cafe"],
    types: ["bar", "cafe", "restaurant"],
    denyTypes: ["liquor_store"],
    tagEvidence: ["zero-proof", "mocktails"],
    lists: ["tonight", "food"],
    query: "zero proof mocktail bar in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },
  food_hall: {
    aliases: ["food hall", "food market hall", "culinary hall"],
    family: "dining_format", intent: "eat",
    categories: ["food", "shopping"],
    primaryTypes: ["food_court", "shopping_mall", "market"],
    types: ["food_court", "market", "shopping_mall", "restaurant"],
    denyTypes: ["supermarket", "grocery_store"],
    tagEvidence: ["food-hall"],
    lists: ["food", "budget", "nearby"],
    query: "food hall in {metro}", querySku: "searchText",
    evidenceFloor: 0.6,
  },
  filipino_bakery: {
    aliases: ["filipino bakery", "filipino bread", "pandesal bakery"],
    family: "cuisine", intent: "eat",
    categories: ["food"],
    primaryTypes: ["bakery"],
    types: ["bakery", "cafe", "restaurant"],
    denyTypes: ["grocery_store", "supermarket"],
    tagEvidence: ["filipino"],
    lists: ["food", "budget"],
    query: "filipino bakery in {metro}", querySku: "searchText",
    evidenceFloor: 0.7,
  },
  omakase: {
    aliases: ["omakase", "omakase sushi", "chefs counter sushi"],
    family: "dining_format", intent: "eat",
    categories: ["food"],
    primaryTypes: ["japanese_restaurant", "sushi_restaurant", "restaurant"],
    types: ["japanese_restaurant", "sushi_restaurant", "restaurant"],
    denyTypes: ["grocery_store", "supermarket", "meal_takeaway"],
    tagEvidence: ["omakase"],
    lists: ["food", "tonight"],
    query: "omakase sushi counter in {metro}", querySku: "searchText",
    evidenceFloor: 0.7,
  },
  supper_club: {
    aliases: ["supper club", "private supper club"],
    family: "dining_format", intent: "attend",
    categories: ["food", "nightlife"],
    primaryTypes: ["restaurant", "bar"],
    types: ["restaurant", "bar", "event_venue"],
    denyTypes: ["grocery_store", "supermarket"],
    tagEvidence: ["supper-club"],
    lists: ["tonight", "food"],
    query: "supper club in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },

  // ── Things to do ─────────────────────────────────────────────────────────
  pickleball: {
    aliases: ["pickleball", "pickleball court", "pickleball club", "indoor pickleball"],
    family: "fitness", intent: "do",
    categories: ["attractions"],
    primaryTypes: ["sports_complex", "sports_club", "athletic_field", "gym"],
    types: ["sports_complex", "sports_club", "athletic_field", "gym", "park", "stadium"],
    // The product trap in reverse: a sporting-goods shop selling paddles is not
    // a place to play, and it will match "pickleball" in its name every time.
    denyTypes: ["sporting_goods_store", "store", "shopping_mall", "clothing_store"],
    tagEvidence: ["pickleball"],
    lists: ["things-to-do", "nearby", "budget"],
    query: "pickleball courts in {metro}", querySku: "searchText",
    evidenceFloor: 0.6,
  },
  bioluminescent_kayaking: {
    aliases: ["bioluminescent kayaking", "bioluminescence tour", "bio bay kayak", "glowing water kayak tour"],
    family: "water", intent: "book",
    categories: ["attractions"],
    primaryTypes: ["tourist_attraction", "travel_agency", "boat_tour_agency"],
    types: ["tourist_attraction", "travel_agency", "boat_tour_agency", "marina"],
    // AGENTS.md §8 beach exclusion doctrine, applied at the concept layer: a
    // beach is not a bookable kayak operator, and beaches carry
    // tourist_attraction in their Google types.
    denyTypes: ["natural_feature", "beach", "sporting_goods_store", "store"],
    tagEvidence: ["bioluminescent"],
    lists: ["things-to-do", "worth-the-drive"],
    query: "bioluminescent kayak tour in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },
  immersive_art: {
    aliases: ["immersive art", "immersive art exhibit", "digital art experience", "projection art experience"],
    family: "culture", intent: "visit",
    categories: ["attractions"],
    primaryTypes: ["art_gallery", "museum", "tourist_attraction"],
    types: ["art_gallery", "museum", "tourist_attraction", "event_venue"],
    denyTypes: ["store", "shopping_mall"],
    tagEvidence: ["immersive", "digital-art"],
    lists: ["things-to-do", "tonight"],
    query: "immersive art experience in {metro}", querySku: "searchText",
    // An ordinary museum is NOT an immersive art experience — the canonical
    // over-match on this concept. Needs the venue verified for it.
    evidenceFloor: 0.8,
  },
  sunset_cruise: {
    aliases: ["sunset cruise", "sunset sail", "sunset boat tour"],
    family: "water", intent: "book",
    categories: ["attractions"],
    primaryTypes: ["boat_tour_agency", "travel_agency", "tourist_attraction", "marina"],
    types: ["boat_tour_agency", "travel_agency", "tourist_attraction", "marina"],
    denyTypes: ["natural_feature", "beach", "store"],
    tagEvidence: ["sunset-cruise"],
    lists: ["things-to-do", "tonight", "worth-the-drive"],
    query: "sunset cruise boat tour in {metro}", querySku: "searchText",
    evidenceFloor: 0.65,
  },
  food_tour: {
    aliases: ["food tour", "walking food tour", "culinary tour"],
    family: "culture", intent: "book",
    categories: ["attractions"],
    primaryTypes: ["travel_agency", "tourist_attraction"],
    types: ["travel_agency", "tourist_attraction"],
    denyTypes: ["restaurant", "store", "meal_takeaway"],
    tagEvidence: ["food-tour"],
    lists: ["things-to-do"],
    query: "guided food walking tour in {metro}", querySku: "searchText",
    evidenceFloor: 0.7,
  },
  sound_bath: {
    aliases: ["sound bath", "sound healing", "gong bath"],
    family: "wellness", intent: "attend",
    categories: ["attractions"],
    primaryTypes: ["yoga_studio", "spa", "wellness_center"],
    types: ["yoga_studio", "spa", "wellness_center", "event_venue"],
    denyTypes: ["store", "beauty_salon", "hair_care"],
    tagEvidence: ["sound-bath"],
    lists: ["things-to-do", "tonight"],
    query: "sound bath meditation studio in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },
  indoor_climbing: {
    aliases: ["indoor climbing", "rock climbing gym", "bouldering gym", "climbing gym"],
    family: "fitness", intent: "do",
    categories: ["attractions"],
    primaryTypes: ["gym", "sports_complex", "fitness_center"],
    types: ["gym", "sports_complex", "fitness_center"],
    denyTypes: ["sporting_goods_store", "store", "clothing_store"],
    tagEvidence: ["climbing", "bouldering"],
    lists: ["things-to-do", "nearby"],
    query: "indoor rock climbing gym in {metro}", querySku: "searchText",
    evidenceFloor: 0.6,
  },
  manatee_swim: {
    aliases: ["manatee swim", "swim with manatees", "manatee tour", "manatee snorkel tour"],
    family: "seasonal_nature", intent: "book",
    categories: ["attractions"],
    primaryTypes: ["travel_agency", "boat_tour_agency", "tourist_attraction"],
    types: ["travel_agency", "boat_tour_agency", "tourist_attraction", "marina"],
    denyTypes: ["natural_feature", "beach", "store", "aquarium"],
    tagEvidence: ["manatee"],
    lists: ["worth-the-drive", "things-to-do"],
    query: "swim with manatees tour in {metro}", querySku: "searchText",
    evidenceFloor: 0.75,
  },
  springs_swimming: {
    aliases: ["natural springs swimming", "freshwater springs", "spring fed swimming"],
    family: "seasonal_nature", intent: "visit",
    categories: ["attractions", "beach"],
    primaryTypes: ["park", "national_park", "state_park", "tourist_attraction"],
    types: ["park", "national_park", "state_park", "tourist_attraction", "natural_feature"],
    denyTypes: ["store", "spa", "gym"],
    tagEvidence: ["springs"],
    lists: ["worth-the-drive", "budget", "things-to-do"],
    query: "natural springs swimming park in {metro}", querySku: "searchText",
    evidenceFloor: 0.65,
  },
  night_market: {
    aliases: ["night market", "evening market", "night bazaar"],
    family: "culture", intent: "visit",
    categories: ["shopping", "food"],
    primaryTypes: ["market", "event_venue"],
    types: ["market", "event_venue", "shopping_mall"],
    denyTypes: ["supermarket", "grocery_store", "department_store"],
    tagEvidence: ["night-market"],
    lists: ["tonight", "budget", "things-to-do"],
    query: "night market in {metro}", querySku: "searchText",
    evidenceFloor: 0.7,
  },
};

// ── Exclusion vocabularies ──────────────────────────────────────────────────
//
// These do NOT decide acceptance — CONCEPTS does. They decide the REASON a topic
// was rejected, which is what makes the owner report actionable and the tests
// able to assert intent rather than outcome.

/** Whole topic families that can never be experienced at a place. */
export const EXCLUDED_DOMAINS = {
  software: ["ai", "app", "software", "saas", "platform", "api", "chatbot", "llm", "plugin", "dashboard", "crm", "automation tool"],
  startup_finance: ["startup", "vc", "venture", "ipo", "etf", "crypto", "token", "stock", "valuation", "funding round", "investment"],
  marketing: ["seo tool", "marketing tool", "ad platform", "affiliate program", "lead gen"],
  electronics: ["headphones", "earbuds", "laptop", "smartphone", "tablet", "smartwatch", "camera", "drone", "monitor", "console"],
  apparel: ["shoes", "sneakers", "jacket", "leggings", "handbag", "sunglasses", "watch band", "hoodie", "dress"],
  equipment: ["leash", "harness", "backpack", "luggage", "suitcase", "tent", "paddle board inflatable", "kayak rack", "racket", "paddle", "cooler", "stroller"],
  packaged_goods: ["snack", "protein bar", "cereal", "sauce", "seasoning", "frozen", "canned", "powder", "kit", "meal kit", "grocery"],
  supplements: ["supplement", "creatine", "collagen", "electrolyte", "vitamin", "probiotic", "nootropic", "magnesium"],
  beauty: ["serum", "moisturizer", "sunscreen", "retinol", "lip", "mascara", "shampoo", "skincare"],
  media_celebrity: ["netflix", "season", "episode", "tv show", "trailer", "celebrity", "podcast", "album", "meme", "challenge", "tiktok trend"],
  // Booking platforms and OTAs. Boosting every tour because an aggregator is
  // trending is meaningless — and because these are affiliate partners, it is
  // also indistinguishable from paid placement in the ranking.
  booking_platform: ["viator", "getyourguide", "tripadvisor", "expedia", "booking.com", "airbnb", "vrbo", "klook", "tiqets", "opentable", "resy"],
};

/** Tokens that signal a topic is a PRODUCT you buy, not an experience you have. */
export const PRODUCT_MARKERS = [
  "best ", " review", " vs ", " price", "buy ", " for sale", " deal", "discount code",
  "how to make", "recipe", " brand", " gift", "amazon", " kit", " machine", " maker",
];

const normalize = (s) =>
  String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export { normalize as normalizeTopic };

// Alias → concept key. Built once. Exact match on the normalised alias is the
// ONLY way a topic becomes a concept — see the header on why substring matching
// is the defect, not the implementation.
const ALIAS_INDEX = (() => {
  const m = new Map();
  for (const [key, c] of Object.entries(CONCEPTS)) {
    for (const a of c.aliases) {
      const n = normalize(a);
      // A duplicate alias across two concepts would make mapping order-dependent
      // and therefore unauditable. Fail at module load, not in production.
      if (m.has(n) && m.get(n) !== key) {
        throw new Error(`trendTaxonomy: alias "${a}" is claimed by both ${m.get(n)} and ${key} — aliases must be unique`);
      }
      m.set(n, key);
    }
  }
  return m;
})();

/** Every alias in the registry, for a guard that wants to assert coverage. */
export const ALL_ALIASES = [...ALIAS_INDEX.keys()];

/**
 * Classify a raw topic string.
 *
 * Returns { concept, key, reason } — `concept` is null on rejection and `reason`
 * is ALWAYS populated, in both directions. A rejection with no reason is the
 * thing that makes an owner report a wall of zeroes.
 */
export function conceptForTopic(rawTopic) {
  const n = normalize(rawTopic);
  if (!n) return { concept: null, key: null, reason: "empty topic name" };

  const hit = ALIAS_INDEX.get(n);
  if (hit) return { concept: CONCEPTS[hit], key: hit, reason: `matched controlled alias "${n}"` };

  // Not in the allowlist. Everything below only chooses the REASON.
  for (const [domain, tokens] of Object.entries(EXCLUDED_DOMAINS)) {
    for (const t of tokens) {
      const nt = normalize(t);
      // Word-boundary containment, not substring: "ai" must not match "thai",
      // and "app" must not match "apple pie". This is the same class of bug the
      // classifier notes in CLAUDE.md describe (parking→park, drugstore→store).
      if (nt && new RegExp(`(^| )${nt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(n)) {
        return { concept: null, key: null, reason: `excluded domain "${domain}" (matched "${t}") — not experienceable at a place` };
      }
    }
  }
  for (const marker of PRODUCT_MARKERS) {
    if (n.includes(normalize(marker))) {
      return { concept: null, key: null, reason: `product-shaped topic (matched "${marker.trim()}") — a thing to buy, not a place to go` };
    }
  }
  return {
    concept: null, key: null,
    reason: "no controlled Wayfind concept — a topic must map to a declared concept before it can match a place or become a Google query",
  };
}

/** Concepts eligible for a given menu list. */
export function conceptsForList(list) {
  if (list === "nearby") return nearbyEligibleConcepts();
  return Object.entries(CONCEPTS).filter(([, c]) => c.lists.includes(list)).map(([k]) => k);
}

/**
 * "The best near you" — the UNION of concepts that already qualify for a
 * SPECIFIC list, never its own pool. See NEARBY_IS_UNION.
 */
export function nearbyEligibleConcepts() {
  const specific = MENU_LISTS.filter((l) => l !== "nearby");
  const out = new Set();
  for (const [k, c] of Object.entries(CONCEPTS)) {
    if (c.lists.some((l) => specific.includes(l))) out.add(k);
  }
  return [...out];
}

/** Approved metros. A query may only be scoped to one of these. */
export const APPROVED_METROS = ["tampa", "orlando", "manatee-sarasota"];

/** Human-readable metro names for a Google text query. */
const METRO_QUERY_NAME = {
  tampa: "Tampa, Florida",
  orlando: "Orlando, Florida",
  "manatee-sarasota": "Sarasota, Florida",
};

/**
 * Build the ONE Google Places query a concept is allowed to make.
 *
 * THIS IS THE CHOKE POINT that stops arbitrary CSV text reaching Google. The
 * query string is assembled from the concept's OWN declared template plus an
 * approved metro name. The raw topic is not a parameter and cannot be one — the
 * function never sees it.
 *
 * Throws on an unknown concept or an unapproved metro rather than returning a
 * best-effort string, because a silently-degraded query still costs money and
 * still returns places we would then have to trust.
 */
export function googleQueryFor(conceptKey, metro) {
  const c = CONCEPTS[conceptKey];
  if (!c) throw new Error(`trendTaxonomy: "${conceptKey}" is not a declared concept — refusing to build a Google query`);
  if (!APPROVED_METROS.includes(metro)) {
    throw new Error(`trendTaxonomy: "${metro}" is not an approved metro (${APPROVED_METROS.join(", ")}) — refusing to build an unscoped Google query`);
  }
  return {
    concept: conceptKey,
    metro,
    textQuery: c.query.replace("{metro}", METRO_QUERY_NAME[metro]),
    sku: c.querySku,
    allowedPrimaryTypes: c.primaryTypes,
    allowedTypes: c.types,
    denyTypes: c.denyTypes,
    categories: c.categories,
  };
}
