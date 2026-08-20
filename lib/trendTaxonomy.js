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

// The owner-supplied launch universe for the homepage's Exploding Near You
// experiment. This is product taxonomy, not a source snapshot: the imported
// feed may decide which of these concepts has momentum, but it may not introduce
// an undeclared string into the UI or turn an undeclared topic into a Places
// query. (The universe count is owner-set: 20 on 2026-08-11, 32 on 2026-08-19
// when the Florida 40-map landed — test-exploding-nearby pins the exact list.)
//
// `headline` and `dek` are controlled Wayfind copy. Raw provider prose never
// reaches a card, and the server returns one of these objects only after the
// match and freshness gates have passed.
//
// `stat` (owner, 2026-08-11: \u201cexplain to the user that it is trending recently
// and share the data with them in the editorial\u201d) is the owner-supplied search
// signal behind each trend \u2014 global figures displayed on 2026-08-09, not
// Tampa-specific, and rendered with that dating (EXPLODING_STAT_ASOF) so the
// card names its real evidence instead of a bare \u201cthis is trending\u201d. These are
// measured period-over-period deltas from the licensed list, which is exactly
// the claim test-trend-vocab forbids FABRICATING on level-only data \u2014 here the
// delta is the datum itself.
// The owner-supplied FLORIDA trend list (top-20 2026-08-11; +12 from the
// owner's 40-map 2026-08-19), in the OWNER'S
// rank order. `rank` IS the research ranking: the homepage works from #1 down
// and reaches deeper only when a higher trend has no verified local match
// (owner: "i want the top 10 ideally and work our way down").
//
// `primaryBucket` / `alsoBuckets` are the owner's researched dayparts mapped
// onto the app's ONE clock (lib/nowContext BUCKET_EDGES). The owner's
// 6:30/11:30/5:30 windows and the app's 6/11:30/17:30 edges agree except the
// first morning half hour; a second private clock would violate
// check-one-clock, so the shared edges win. A trend renders ONLY inside its
// declared windows: primary-daypart trends order first, then also-works,
// both by owner rank (lib/explodingLaunchSearch.launchTrendsForBucket).
export const EXPLODING_NEARBY_UNIVERSE = [
  { key: "smash_burgers", rank: 1, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Smash burgers", headline: "The smash burger obsession", dek: "Crisp-edged, griddled burgers are becoming the order people seek out, not just another menu option.", stat: "Global searches up 650% — 1.5M a month; \u201csmash burger near me\u201d up 50%." },
  { key: "elevated_ramen", rank: 2, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Elevated ramen and noodle bowls", headline: "Ramen worth planning dinner around", dek: "Rich, chef-level ramen and noodle bowls are becoming the warm, satisfying dinner people plan around.", stat: null },
  { key: "caribbean_curry_bowls", rank: 3, primaryBucket: "afternoon", alsoBuckets: ["night"], label: "Caribbean curry bowls", headline: "Island comfort food, now a destination", dek: "Curry chicken, goat, roti, and oxtail are turning island comfort food into a destination order.", stat: null },
  { key: "miso_umami_seafood", rank: 4, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Miso and umami seafood", headline: "Seafood with serious umami", dek: "Miso-glazed fish and umami-rich plates are becoming the coastal dinner order people seek out.", stat: null },
  { key: "functional_smoothie_acai", rank: 5, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Functional smoothies and a\u00e7a\u00ed bowls", headline: "Smoothie bowls built for how you feel", dek: "Smoothies and a\u00e7a\u00ed bowls built for how you actually feel are becoming the morning and post-workout stop.", stat: null },
  { key: "high_protein_grab_and_go", rank: 6, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "High-protein grab-and-go", headline: "Protein you can grab and go", dek: "Protein shakes and bowls people can grab fast are becoming the default breakfast and gym-day fuel.", stat: null },
  { key: "gut_health_food", rank: 7, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Fiber and gut-health food", headline: "Eating for your gut, daily", dek: "Kombucha, kefir, and gut-friendly bowls are moving from a niche habit into the daily routine.", stat: null },
  { key: "fermented_pickled", rank: 8, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Fermented and pickled flavors", headline: "Fermented flavors, ordered on purpose", dek: "Kimchi, miso, and house pickles are showing up as the flavors people order on purpose.", stat: null },
  { key: "matcha_specialty_coffee", rank: 9, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Matcha and specialty coffee", headline: "The caffeine run becomes the destination", dek: "Matcha lattes and carefully sourced coffee are turning the daily caffeine run into the destination itself.", stat: null },
  { key: "mocktail_bar", rank: 10, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Zero-proof and low-ABV cocktails", headline: "Zero-proof, full cocktail craft", dek: "Full cocktail craft with less or no alcohol is making a night out easier to say yes to.", stat: null },
  { key: "savory_cocktails", rank: 11, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Savory cocktails", headline: "The savory cocktail moment", dek: "Dirty martinis and savory builds are the orders defining the current cocktail-bar moment.", stat: null },
  { key: "food_hall", rank: 12, primaryBucket: "afternoon", alsoBuckets: ["night"], label: "Food halls", headline: "One stop, every craving", dek: "Multi-concept halls let one visit cover lunch, browsing, happy hour, and dinner.", stat: null },
  { key: "immersive_dining", rank: 13, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Experiential dining", headline: "Dinner that is the whole event", dek: "Chef events, themed menus, and food-and-music nights are turning dinner into the occasion itself.", stat: "Global searches up 1,040%." },
  { key: "pilates_reformer", rank: 14, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Reformer Pilates and Lagree", headline: "Low-impact, high-burn Pilates", dek: "Low-impact resistance training is becoming a go-to studio workout.", stat: "Global searches up 393% — 450K a month." },
  { key: "cold_plunge_sauna", rank: 15, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Cold plunge and sauna recovery", headline: "Sauna, plunge, repeat", dek: "Sauna-and-plunge sessions are becoming a social recovery ritual, not just athlete rehab.", stat: "Global searches up 6,700%; \u201cnear me\u201d searches up 14%." },
  { key: "social_wellness_clubs", rank: 16, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Social wellness clubs", headline: "Where recovery meets a social life", dek: "People are pairing recovery, movement, and community in one place.", stat: "Global searches up 3,500%; \u201csocial wellness club near me\u201d up 175%." },
  { key: "soft_clubbing", rank: 17, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Soft clubbing and coffee raves", headline: "Dance nights that start early", dek: "Earlier, lower-pressure dance events are making a night out easier to say yes to.", stat: "Global searches up 7,200%; \u201csoft clubbing near me\u201d up 2,900%." },
  { key: "listening_bar", rank: 18, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Listening bars", headline: "Going out for the music itself", dek: "Hi-fi rooms and intimate music nights are becoming the more intentional way to go out.", stat: null },
  { key: "pickleball", rank: 19, primaryBucket: "afternoon", alsoBuckets: ["morning", "night"], label: "Pickleball and padel", headline: "Sunrise sessions to lit-court nights", dek: "Social court sports are becoming the default way to meet up, from sunrise sessions to lit-court nights.", stat: null },
  { key: "golf_simulators", rank: 20, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Golf simulators and social play", headline: "A round of golf as a night out", dek: "Simulator lounges with food and drinks are turning a round of golf into a group night out.", stat: null },
  // ── v8.25 — THE OWNER'S FLORIDA 40-MAP EXPANSION (2026-08-19: "here are
  // the trends I want to make sure we are looking for, especially in the
  // areas we cover, fetching place cards for them and placing those cards
  // appropriately in the right category"). Twelve clusters from the owner's
  // 40-trend Florida opportunity map join the ranked universe at 21-32,
  // ordered by the map's own priority (soft adventure first — springs,
  // kayaks, manatees — then the social-night and culinary-specificity
  // clusters). Only clusters with an HONEST local evidence gate joined:
  // Michelin (no Google-type proof), bioluminescent paddling (outside every
  // covered metro's radius) and cruise-port itineraries (content, not place
  // cards) were deliberately left out rather than gated dishonestly. Deks are
  // controlled Wayfind copy grounded in the map's demand notes; no fabricated
  // stats — `stat` stays null where the owner's research gave no figure.
  { key: "springs_swimming", rank: 21, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Springs swimming and tubing", headline: "Clear water, real Florida", dek: "Spring-fed swimming holes are the heat escape people plan mornings around — clear water without the beach crowds.", stat: null },
  { key: "kayak_wildlife_tours", rank: 22, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Kayak and clear-kayak tours", headline: "Paddle where the wildlife is", dek: "Beginner-friendly guided paddles through mangroves and clear-bottom kayaks are the soft adventure everyone can say yes to.", stat: null },
  { key: "manatee_swim", rank: 23, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Manatee encounters", headline: "The gentle giants, up close", dek: "Seeing a manatee up close is the rare wildlife moment people drive for — strongest in the cool months, when they gather.", stat: null },
  { key: "sunset_cruise", rank: 24, primaryBucket: "afternoon", alsoBuckets: ["night"], label: "Dolphin and sunset cruises", headline: "The view does the planning", dek: "An easy group outing with dolphins, a sunset and a built-in dinner pairing — the boat handles the itinerary.", stat: null },
  { key: "fishing_charters", rank: 25, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Fishing charters", headline: "Catch it, then eat it", dek: "Guided charters turn a day on the water into a story — and the catch-to-table dinner people actually remember.", stat: null },
  { key: "escape_game_bars", rank: 26, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Escape rooms and game bars", headline: "Competitive socializing", dek: "Escape rooms, axe throwing and game bars are the group answer to dates, rainy days and \u201cwhat do we do tonight\u201d.", stat: null },
  { key: "retro_arcades", rank: 27, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Retro arcades and pinball", headline: "Nostalgia, one quarter at a time", dek: "Pinball halls and arcade bars are affordable social nights with a hook nobody has to explain.", stat: null },
  { key: "comedy_small_shows", rank: 28, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Comedy and small live shows", headline: "Tonight, but make it a show", dek: "Stand-up rooms and small-format live shows are the local, social answer to \u201cwhat should we do tonight\u201d.", stat: null },
  { key: "artisanal_bakeries", rank: 29, primaryBucket: "morning", alsoBuckets: ["afternoon"], label: "Destination bakeries", headline: "Worth waking up for", dek: "Croissants, focaccia and limited drops have turned the best bakeries into destinations with their own lines.", stat: null },
  { key: "cuban_latin_flavor", rank: 30, primaryBucket: "afternoon", alsoBuckets: ["night"], label: "Cuban and Latin flavor", headline: "Cultural specificity, on a plate", dek: "Cuban, Caribbean and Latin American kitchens with a story are what food travelers now seek out over generic \u201cinternational\u201d.", stat: null },
  { key: "omakase", rank: 31, primaryBucket: "night", alsoBuckets: [], label: "Omakase and sushi counters", headline: "Dinner as theater", dek: "Chef-led counters and tasting menus turn scarcity and craft into the highest-intent dinner reservation in town.", stat: null },
  { key: "waterfront_seafood", rank: 32, primaryBucket: "night", alsoBuckets: ["afternoon"], label: "Fresh-catch seafood", headline: "The catch, near the water", dek: "Grouper, stone crab and local oysters — seafood that names its water is Florida's natural edge over any generic menu.", stat: null },
];

export const EXPLODING_STAT_ASOF = "search data, Aug 9, 2026";

export const EXPLODING_NEARBY_KEYS = EXPLODING_NEARBY_UNIVERSE.map((t) => t.key);

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
    aliases: ["mocktail bar", "zero proof bar", "non alcoholic bar", "alcohol free bar", "zero proof cocktails", "low abv cocktails"],
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
    // Raised to 0.75 when food halls joined the homepage launch universe (same
    // homepage evidence bar as every other launch trend).
    evidenceFloor: 0.75,
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
    evidenceFloor: 0.75, // v8.25: raised on joining the ranked launch universe
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
    aliases: ["pickleball", "pickleball court", "pickleball club", "indoor pickleball", "padel", "padel court", "padel club", "pickleball and padel"],
    family: "fitness", intent: "do",
    categories: ["attractions"],
    primaryTypes: ["sports_complex", "sports_club", "athletic_field", "gym"],
    types: ["sports_complex", "sports_club", "athletic_field", "gym", "park", "stadium"],
    // The product trap in reverse: a sporting-goods shop selling paddles is not
    // a place to play, and it will match "pickleball" in its name every time.
    denyTypes: ["sporting_goods_store", "store", "shopping_mall", "clothing_store"],
    tagEvidence: ["pickleball", "padel"],
    lists: ["things-to-do", "nearby", "budget"],
    query: "pickleball and padel courts in {metro}", querySku: "searchText",
    // Raised to 0.75 when pickleball joined the homepage launch universe: a
    // homepage trend needs strong concept-specific evidence (test-exploding-nearby).
    evidenceFloor: 0.75,
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
    evidenceFloor: 0.75, // v8.25: raised on joining the ranked launch universe
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
    evidenceFloor: 0.75, // v8.25: raised on joining the ranked launch universe
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

  // ── Exploding Near You launch universe ─────────────────────────────────
  // Every concept below is narrower than its venue type. The discriminating
  // tag or a verified editorial fact is mandatory in lib/trendMatch.js, so a
  // cafe never becomes a hojicha result and a park never becomes forest
  // bathing merely because it has the right general shape.
  smash_burgers: {
    aliases: ["smash burgers", "smash burger", "smashed burger"],
    family: "cuisine", intent: "eat", categories: ["food", "nightlife"],
    primaryTypes: ["hamburger_restaurant", "american_restaurant", "restaurant"],
    types: ["hamburger_restaurant", "american_restaurant", "restaurant", "bar"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["smash-burger", "smash-burgers"], lists: ["food", "tonight"],
    query: "smash burger restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  soft_clubbing: {
    aliases: ["soft clubbing", "early clubbing", "sober dance party", "daytime dance party"],
    family: "nightlife_format", intent: "attend", categories: ["nightlife", "attractions"],
    primaryTypes: ["night_club", "event_venue", "dance_hall"], types: ["night_club", "event_venue", "dance_hall", "bar"],
    denyTypes: ["liquor_store", "store"], tagEvidence: ["soft-clubbing", "sober-party", "day-party"],
    lists: ["tonight", "things-to-do"], query: "soft clubbing dance event in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  cold_plunge_sauna: {
    aliases: ["cold plunge sauna", "cold-plunge sauna", "sauna and cold plunge", "hot cold recovery"],
    family: "wellness", intent: "book", categories: ["attractions"],
    primaryTypes: ["wellness_center", "gym", "fitness_center", "spa"], types: ["wellness_center", "gym", "fitness_center", "spa"],
    denyTypes: ["beauty_salon", "hair_salon", "store"], tagEvidence: ["cold-plunge", "sauna-cold-plunge", "hot-cold-recovery"],
    lists: ["things-to-do", "nearby"], query: "cold plunge sauna recovery in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  social_wellness_clubs: {
    aliases: ["social wellness club", "wellness social club", "wellness club"],
    family: "wellness", intent: "do", categories: ["attractions"],
    primaryTypes: ["wellness_center", "fitness_center", "gym", "social_club"], types: ["wellness_center", "fitness_center", "gym", "social_club"],
    denyTypes: ["beauty_salon", "store"], tagEvidence: ["social-wellness", "wellness-club"],
    lists: ["things-to-do", "nearby"], query: "social wellness club in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  puppy_yoga: {
    aliases: ["puppy yoga", "yoga with puppies", "adoptable puppy yoga"],
    family: "wellness", intent: "attend", categories: ["attractions"],
    primaryTypes: ["yoga_studio", "event_venue", "fitness_center"], types: ["yoga_studio", "event_venue", "fitness_center", "animal_shelter"],
    denyTypes: ["pet_store", "veterinary_care", "store"], tagEvidence: ["puppy-yoga"],
    lists: ["things-to-do"], query: "puppy yoga event in {metro}", querySku: "searchText", evidenceFloor: 0.85,
  },
  hojicha_lattes: {
    aliases: ["hojicha latte", "hojicha lattes", "roasted green tea latte"],
    family: "beverage", intent: "drink", categories: ["food"],
    primaryTypes: ["cafe", "coffee_shop", "tea_house"], types: ["cafe", "coffee_shop", "tea_house", "bakery"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"], tagEvidence: ["hojicha", "hojicha-latte"],
    lists: ["food", "tonight"], query: "hojicha latte cafe in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  candlelight_concerts: {
    aliases: ["candlelight concert", "candlelight concerts", "concert by candlelight"],
    family: "culture", intent: "attend", categories: ["attractions", "nightlife"],
    primaryTypes: ["concert_hall", "event_venue", "performing_arts_theater", "church"], types: ["concert_hall", "event_venue", "performing_arts_theater", "church"],
    denyTypes: ["store"], tagEvidence: ["candlelight-concert", "candlelit-concert"],
    lists: ["things-to-do", "tonight"], query: "candlelight concert in {metro}", querySku: "searchText", evidenceFloor: 0.85,
  },
  immersive_gamebox: {
    aliases: ["immersive gamebox", "immersive game box"],
    family: "activity", intent: "book", categories: ["attractions"],
    primaryTypes: ["amusement_center", "video_arcade", "event_venue"], types: ["amusement_center", "video_arcade", "event_venue"],
    denyTypes: ["store", "electronics_store"], tagEvidence: ["immersive-gamebox"],
    lists: ["things-to-do", "tonight"], query: "Immersive Gamebox in {metro}", querySku: "searchText", evidenceFloor: 0.9,
  },
  dubai_chocolate: {
    aliases: ["dubai chocolate", "pistachio kunafa chocolate", "dubai chocolate bar"],
    family: "dessert", intent: "eat", categories: ["food", "shopping"],
    primaryTypes: ["chocolate_shop", "dessert_shop", "candy_store", "bakery", "cafe"], types: ["chocolate_shop", "dessert_shop", "candy_store", "bakery", "cafe"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"], tagEvidence: ["dubai-chocolate"],
    lists: ["food"], query: "Dubai chocolate dessert in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  black_sesame_lattes: {
    aliases: ["black sesame latte", "black-sesame latte", "black sesame lattes"],
    family: "beverage", intent: "drink", categories: ["food"],
    primaryTypes: ["cafe", "coffee_shop", "tea_house"], types: ["cafe", "coffee_shop", "tea_house", "bakery"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"], tagEvidence: ["black-sesame", "black-sesame-latte"],
    lists: ["food", "tonight"], query: "black sesame latte cafe in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  hwachae: {
    aliases: ["hwachae", "korean fruit punch", "subak hwachae"],
    family: "dessert", intent: "eat", categories: ["food"],
    primaryTypes: ["korean_restaurant", "dessert_shop", "cafe"], types: ["korean_restaurant", "dessert_shop", "cafe"],
    denyTypes: ["grocery_store", "supermarket"], tagEvidence: ["hwachae"],
    lists: ["food"], query: "hwachae Korean fruit punch in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  tanghulu: {
    aliases: ["tanghulu", "candied fruit skewer", "candied fruit skewers"],
    family: "dessert", intent: "eat", categories: ["food", "shopping"],
    primaryTypes: ["dessert_shop", "candy_store", "chinese_restaurant", "market"], types: ["dessert_shop", "candy_store", "chinese_restaurant", "market"],
    denyTypes: ["grocery_store", "supermarket"], tagEvidence: ["tanghulu"],
    lists: ["food", "budget"], query: "tanghulu candied fruit in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  kunafa: {
    aliases: ["kunafa", "knafeh", "kanafeh", "Nablus kunafa"],
    family: "dessert", intent: "eat", categories: ["food"],
    primaryTypes: ["dessert_shop", "bakery", "middle_eastern_restaurant", "cafe"], types: ["dessert_shop", "bakery", "middle_eastern_restaurant", "cafe"],
    denyTypes: ["grocery_store", "supermarket"], tagEvidence: ["kunafa", "knafeh"],
    lists: ["food", "tonight"], query: "kunafa knafeh dessert in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  protein_ice_cream: {
    aliases: ["protein ice cream", "high protein ice cream", "protein soft serve"],
    family: "dessert", intent: "eat", categories: ["food"],
    primaryTypes: ["ice_cream_shop", "dessert_shop", "health_food_restaurant"], types: ["ice_cream_shop", "dessert_shop", "health_food_restaurant"],
    denyTypes: ["grocery_store", "supermarket", "nutrition_store"], tagEvidence: ["protein-ice-cream", "protein-soft-serve"],
    lists: ["food"], query: "protein ice cream shop in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  immersive_dining: {
    aliases: ["immersive dining", "immersive dinner", "theatrical dining", "multisensory dining", "experiential dining"],
    family: "dining_format", intent: "book", categories: ["food", "nightlife", "attractions"],
    primaryTypes: ["restaurant", "event_venue", "performing_arts_theater"], types: ["restaurant", "event_venue", "performing_arts_theater"],
    denyTypes: ["meal_takeaway", "grocery_store", "store"], tagEvidence: ["immersive-dining", "theatrical-dining", "multisensory-dining"],
    lists: ["food", "tonight", "things-to-do"], query: "immersive dining experience in {metro}", querySku: "searchText", evidenceFloor: 0.85,
  },
  pilates_reformer: {
    aliases: ["pilates reformer", "reformer pilates", "reformer class", "lagree", "lagree class"],
    family: "fitness", intent: "do", categories: ["attractions"],
    primaryTypes: ["pilates_studio", "fitness_center", "gym"], types: ["pilates_studio", "fitness_center", "gym"],
    denyTypes: ["store", "sporting_goods_store"], tagEvidence: ["reformer-pilates", "pilates-reformer"],
    lists: ["things-to-do", "nearby"], query: "reformer Pilates studio in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  rucking: {
    aliases: ["rucking", "ruck club", "weighted walking club", "rucking group"],
    family: "fitness", intent: "attend", categories: ["attractions"],
    primaryTypes: ["fitness_center", "gym", "park", "sports_club"], types: ["fitness_center", "gym", "park", "sports_club"],
    denyTypes: ["sporting_goods_store", "store"], tagEvidence: ["rucking", "ruck-club"],
    lists: ["things-to-do", "budget"], query: "rucking club group in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  breathwork: {
    aliases: ["breathwork", "guided breathwork", "breathwork class"],
    family: "wellness", intent: "attend", categories: ["attractions"],
    primaryTypes: ["wellness_center", "yoga_studio", "meditation_center", "fitness_center"], types: ["wellness_center", "yoga_studio", "meditation_center", "fitness_center", "event_venue"],
    denyTypes: ["beauty_salon", "store"], tagEvidence: ["breathwork", "guided-breathwork"],
    lists: ["things-to-do", "tonight"], query: "guided breathwork class in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  forest_bathing: {
    aliases: ["forest bathing", "guided forest bathing", "shinrin yoku"],
    family: "seasonal_nature", intent: "attend", categories: ["attractions"],
    primaryTypes: ["nature_preserve", "park", "botanical_garden", "tourist_attraction"], types: ["nature_preserve", "park", "botanical_garden", "tourist_attraction"],
    denyTypes: ["store", "spa"], tagEvidence: ["forest-bathing", "shinrin-yoku"],
    lists: ["things-to-do", "worth-the-drive"], query: "guided forest bathing in {metro}", querySku: "searchText", evidenceFloor: 0.85,
  },
  kintsugi: {
    aliases: ["kintsugi", "kintsugi workshop", "Japanese pottery repair workshop"],
    family: "culture", intent: "attend", categories: ["attractions", "shopping"],
    primaryTypes: ["art_studio", "art_gallery", "community_center", "school"], types: ["art_studio", "art_gallery", "community_center", "school"],
    denyTypes: ["home_goods_store", "furniture_store"], tagEvidence: ["kintsugi", "kintsugi-workshop"],
    lists: ["things-to-do"], query: "kintsugi workshop in {metro}", querySku: "searchText", evidenceFloor: 0.85,
  },

  // ── Owner top-20 Florida launch universe (2026-08-11) additions ─────────
  // Same law as every concept above: types are truth, names lie, and the
  // narrow offering must be PROVEN (type proof or name proof in
  // lib/explodingLaunchSearch.js) before a card exists.
  elevated_ramen: {
    aliases: ["elevated ramen", "ramen", "ramen bar", "noodle bowls", "elevated noodle bowls", "tonkotsu ramen"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["ramen_restaurant", "japanese_restaurant", "restaurant"],
    types: ["ramen_restaurant", "japanese_restaurant", "asian_restaurant", "restaurant"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["ramen"], lists: ["food", "tonight"],
    query: "ramen noodle bar in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  caribbean_curry_bowls: {
    aliases: ["caribbean curry bowls", "caribbean curry", "curry goat", "roti shop", "oxtail", "jamaican curry"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["caribbean_restaurant", "jamaican_restaurant", "restaurant"],
    types: ["caribbean_restaurant", "jamaican_restaurant", "restaurant", "meal_takeaway"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["caribbean", "jamaican"], lists: ["food", "budget"],
    query: "caribbean jamaican curry restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  miso_umami_seafood: {
    aliases: ["miso seafood", "umami seafood", "miso glazed fish", "miso cod", "miso salmon"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["japanese_restaurant", "sushi_restaurant", "seafood_restaurant"],
    types: ["japanese_restaurant", "sushi_restaurant", "seafood_restaurant", "fine_dining_restaurant", "asian_restaurant", "restaurant"],
    denyTypes: ["grocery_store", "supermarket", "meal_takeaway"],
    tagEvidence: ["miso", "umami"], lists: ["food", "tonight"],
    query: "miso glazed seafood restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  functional_smoothie_acai: {
    aliases: ["functional smoothies", "acai bowls", "acai bowl shop", "smoothie bowls", "functional smoothie bowls"],
    family: "beverage", intent: "eat", categories: ["food"],
    primaryTypes: ["acai_shop", "juice_shop", "cafe"],
    types: ["acai_shop", "juice_shop", "cafe", "health_food_restaurant"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["acai", "smoothie"], lists: ["food", "budget"],
    query: "acai bowl smoothie bar in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  high_protein_grab_and_go: {
    aliases: ["high protein grab and go", "protein shakes", "protein bowls", "nutrition shakes", "high protein food"],
    family: "beverage", intent: "eat", categories: ["food"],
    primaryTypes: ["juice_shop", "cafe", "health_food_restaurant"],
    types: ["juice_shop", "cafe", "health_food_restaurant", "meal_takeaway"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["protein", "high-protein"], lists: ["food", "budget"],
    query: "protein shakes and bowls in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  gut_health_food: {
    aliases: ["gut health food", "fiber and gut health", "kombucha bar", "gut friendly bowls", "gut health cafe"],
    family: "wellness", intent: "eat", categories: ["food"],
    primaryTypes: ["juice_shop", "cafe", "health_food_restaurant"],
    types: ["juice_shop", "cafe", "health_food_restaurant", "vegan_restaurant"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["kombucha", "gut-health"], lists: ["food"],
    query: "kombucha gut health cafe in {metro}", querySku: "searchText", evidenceFloor: 0.8,
  },
  fermented_pickled: {
    aliases: ["fermented flavors", "pickled flavors", "kimchi", "fermentation restaurant", "fermented food"],
    family: "cuisine", intent: "eat", categories: ["food", "nightlife"],
    primaryTypes: ["korean_restaurant", "japanese_restaurant", "restaurant"],
    types: ["korean_restaurant", "japanese_restaurant", "restaurant", "bar"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["fermented", "kimchi", "pickled"], lists: ["food", "tonight"],
    query: "kimchi fermented food restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  matcha_specialty_coffee: {
    aliases: ["matcha", "matcha latte", "matcha cafe", "specialty coffee", "third wave coffee", "matcha and specialty coffee"],
    family: "beverage", intent: "drink", categories: ["food"],
    primaryTypes: ["cafe", "coffee_shop", "tea_house"],
    types: ["cafe", "coffee_shop", "tea_house", "bakery"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["matcha", "specialty-coffee"], lists: ["food", "tonight"],
    query: "matcha latte specialty coffee in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  savory_cocktails: {
    aliases: ["savory cocktails", "savory cocktail bar", "msg martini", "dirty martini bar"],
    family: "nightlife_format", intent: "drink", categories: ["nightlife"],
    primaryTypes: ["bar", "wine_bar", "night_club"],
    types: ["bar", "wine_bar", "night_club", "restaurant"],
    denyTypes: ["liquor_store", "package_store"],
    tagEvidence: ["savory-cocktails", "martini"], lists: ["tonight", "nearby"],
    query: "craft cocktail bar dirty martini in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  golf_simulators: {
    aliases: ["golf simulators", "golf simulator", "indoor golf", "golf lounge", "social golf", "golf simulator bar"],
    family: "activity", intent: "do", categories: ["attractions", "nightlife"],
    primaryTypes: ["amusement_center", "sports_club", "sports_complex", "golf_course"],
    types: ["amusement_center", "sports_club", "sports_complex", "golf_course", "bar", "event_venue", "restaurant"],
    // A golf shop sells clubs and carries "golf" in its name every time; the
    // pickleball sporting-goods trap in a different aisle.
    denyTypes: ["sporting_goods_store", "store", "clothing_store"],
    tagEvidence: ["golf-simulator", "indoor-golf"], lists: ["things-to-do", "tonight"],
    query: "golf simulator lounge in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  // ── v8.25 — the owner's Florida 40-map clusters (see universe header) ──
  kayak_wildlife_tours: {
    aliases: ["kayak tour", "clear kayak", "mangrove kayak", "guided paddle"],
    family: "nature", intent: "book", categories: ["attractions"],
    primaryTypes: ["tourist_attraction", "travel_agency", "marina", "park"],
    types: ["tourist_attraction", "travel_agency", "marina", "park", "sports_activity_location", "event_venue"],
    denyTypes: ["sporting_goods_store", "store"],
    tagEvidence: ["kayak-tour", "clear-kayak"], lists: ["things-to-do"],
    query: "guided kayak tour in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  fishing_charters: {
    aliases: ["fishing charter", "charter fishing", "inshore fishing", "sportfishing"],
    family: "water", intent: "book", categories: ["attractions"],
    primaryTypes: ["fishing_charter", "marina", "tourist_attraction"],
    types: ["fishing_charter", "marina", "tourist_attraction", "travel_agency"],
    denyTypes: ["sporting_goods_store", "store", "fishing_store"],
    tagEvidence: ["fishing-charter"], lists: ["things-to-do"],
    query: "fishing charter in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  escape_game_bars: {
    aliases: ["escape room", "game bar", "axe throwing", "board game cafe"],
    family: "activity", intent: "do", categories: ["attractions", "nightlife"],
    primaryTypes: ["amusement_center", "event_venue"],
    types: ["amusement_center", "event_venue", "bar", "tourist_attraction"],
    denyTypes: ["store", "toy_store"],
    tagEvidence: ["escape-room", "game-bar", "axe-throwing"], lists: ["things-to-do", "tonight"],
    query: "escape room game bar in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  retro_arcades: {
    aliases: ["retro arcade", "pinball", "arcade bar", "barcade"],
    family: "activity", intent: "do", categories: ["attractions", "nightlife"],
    primaryTypes: ["video_arcade", "amusement_center"],
    types: ["video_arcade", "amusement_center", "bar", "event_venue"],
    denyTypes: ["store", "toy_store", "electronics_store"],
    tagEvidence: ["arcade", "pinball"], lists: ["things-to-do", "tonight"],
    query: "retro arcade pinball bar in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  comedy_small_shows: {
    aliases: ["comedy club", "stand-up comedy", "improv show", "live comedy"],
    family: "nightlife_format", intent: "attend", categories: ["nightlife", "attractions"],
    primaryTypes: ["comedy_club", "performing_arts_theater"],
    types: ["comedy_club", "performing_arts_theater", "event_venue", "bar", "night_club"],
    denyTypes: ["store"],
    tagEvidence: ["comedy", "improv"], lists: ["tonight", "things-to-do"],
    query: "comedy club live show in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  artisanal_bakeries: {
    aliases: ["artisan bakery", "croissant", "focaccia", "destination bakery"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["bakery"],
    types: ["bakery", "cafe", "coffee_shop", "dessert_shop"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["bakery", "croissant", "focaccia"], lists: ["food"],
    query: "artisan bakery croissant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  cuban_latin_flavor: {
    aliases: ["cuban food", "cuban restaurant", "latin american food", "caribbean kitchen"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["cuban_restaurant", "latin_american_restaurant", "caribbean_restaurant"],
    types: ["cuban_restaurant", "latin_american_restaurant", "caribbean_restaurant", "restaurant", "cafe"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store"],
    tagEvidence: ["cuban", "latin"], lists: ["food"],
    query: "cuban latin restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
  },
  waterfront_seafood: {
    aliases: ["fresh catch seafood", "grouper", "stone crab", "local oysters"],
    family: "cuisine", intent: "eat", categories: ["food"],
    primaryTypes: ["seafood_restaurant"],
    types: ["seafood_restaurant", "restaurant", "bar_and_grill"],
    denyTypes: ["grocery_store", "supermarket", "convenience_store", "fish_store"],
    tagEvidence: ["seafood", "fresh-catch"], lists: ["food", "tonight"],
    query: "fresh catch seafood restaurant in {metro}", querySku: "searchText", evidenceFloor: 0.75,
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
