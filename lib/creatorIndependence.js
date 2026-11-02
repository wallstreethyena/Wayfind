// lib/creatorIndependence.js — creator handles that are NOT independent
// corroboration for the "trending" floor (lib/trendSignal.js, owner rule: the
// trending glow must rest on genuine evidence).
//
// The floor is "2+ DISTINCT creators filmed this place". A venue's own account,
// or a tourism / aggregator page, is not a second voice: the town has not
// noticed the place, the place (or a feed that reposts it) has noticed itself.
// Their videos still DISPLAY everywhere; only the corroboration COUNT skips
// them (lib/creatorSignals.js + lib/creatorVideos.js creatorCountFor).
//
// Keys are the lowercase alphanumeric form (same as creatorSignals' norm()).
// Tiny on purpose: this file is in the eager "/" bundle via creatorSignals.js.
export const NON_INDEPENDENT_CREATOR_HANDLES = Object.freeze(new Set([
  "dallas discovered", // Regional discovery publisher; display with credit, not independent corroboration.
  "sellingjax", // Realtor promotional guide.
  "jessinthesuburbs", // Realtor promotional guide.
  "brownandbrownfarms 55", // The farm own account; underscore folds to a space.
  "fortlauderdaledowntown", // City-guide promotion, not independent corroboration.
  "katrin pfitzenreiter", // Real estate account; underscore folds to a space in norm().
  "ilovetheburg", // City guide account, not independent corroboration.
  "techtravelrentals", // Rental business promotion, not independent corroboration.
  "everafterfarmsflowers", // The flower farm own account.
  "thingstodo florida", // Dotted handle uses the shared resolver's space-folded form.

  "briantreks",          // This intake explicitly thanks Raglan Road for hosting; display with credit, not independent corroboration.
  "tookiesandtreats",     // Tookies and Treats bakery's own promotional account
  "cherrysmashfl",       // Cherry Smash's own account; its announcement is not an independent endorsement
  "staugcoffeehouse",    // St Augustine Coffee House's own account
  "thefoxmercantile",    // The Fox Mercantile's own account
  "tazacafefm",          // Taza Cafe's own account
  "haileycoffey",        // Sole curated post thanks venue; potentially hosted, not independent corroboration
  "nuevacantina",         // Nueva Cantina's own account (Tampa, Palm Harbor)
  "atthediner",           // "@ The Diner" own account (Orlando, Lake Buena Vista)
  "mangoniwg",            // MANGONI Italian Market's own account (Winter Garden)
  "perfectpresscoffeeco", // The Perfect Press Coffee Co.'s own account
  "rosallielefrenchcafe", // Rosallie Le French Cafe's own account
  "helenamodernriviera",  // Helena Modern Riviera's own account
  "harvestmoonorchard",   // Harvest Moon Farm & Orchard's own account
  "pintosfarm",           // Pinto's Farm's own account
  "secretsoftampabay",    // "Secrets of Tampa Bay" aggregator page
  "influencetampa",       // "Influence Tampa" aggregator page
  "visitspc",             // Visit St. Pete/Clearwater tourism bureau
  "strandhillpublictampa", // Strandhill Public's own account (Tampa Heights)
  "sidebaratgs",          // Sidebar at G's own account (inside Giancarlo's, Tampa)
  "tampabayisawesome",    // "Tampa Bay Is Awesome" events aggregator page
  "raglanroadpub",        // Raglan Road Irish Pub's own account (Disney Springs)
  "theeyeorlando",        // The Eye's own account (@theeyeorlando_, Orlando); trailing underscore drops in norm()
]));

/** `normHandle` must already be lowercased/alphanumeric-folded. */
export const isIndependentCreator = (normHandle) => !NON_INDEPENDENT_CREATOR_HANDLES.has(normHandle);
