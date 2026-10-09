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
]));

/** `normHandle` must already be lowercased/alphanumeric-folded. */
export const isIndependentCreator = (normHandle) => !NON_INDEPENDENT_CREATOR_HANDLES.has(normHandle);
