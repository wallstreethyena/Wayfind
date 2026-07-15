// Single source of truth for the discovery system (v3.1).
// Layer 1 (INTENTS) renders on the mood card. Layer 2 (DISCOVER) renders under
// "All categories" inside the same card. Every entry carries a declarative
// action the page dispatcher runs, so Home, sheets and future surfaces share
// one config. REQUIRED is regression-tested in scripts/test-tags.mjs: a UI
// redesign that drops a core category fails the build.
export const INTENTS = [
  { id: "tonight", label: "Tonight", act: { type: "screen", screen: "events" } },
  { id: "food", label: "Food", act: { type: "browse", cat: "food" } },
  { id: "todo", label: "Things to do", act: { type: "browse", cat: "attractions" } },
  { id: "kids", label: "With kids", act: { type: "exp", key: "family" } },
  { id: "date", label: "Date night", act: { type: "exp", key: "romantic" } },
  { id: "rainy", label: "Rainy day", act: { type: "sheet", sheet: "rainy" } },
  { id: "gems", label: "Hidden gems", act: { type: "exp", key: "gem" } },
  { id: "drive", label: "Worth the drive", act: { type: "sheet", sheet: "drive" } },
];
export const DISCOVER = [
  { id: "breakfast", label: "Breakfast", act: { type: "sub", cat: "food", sub: "breakfast" } },
  { id: "brunch", label: "Brunch", act: { type: "sub", cat: "food", sub: "brunch" } },
  { id: "coffee", label: "Coffee", act: { type: "sub", cat: "food", sub: "coffee" } },
  { id: "dinner", label: "Dinner", act: { type: "sub", cat: "food", sub: "dinner" } },
  { id: "dessert", label: "Dessert", act: { type: "sub", cat: "food", sub: "dessert" } },
  { id: "drinks", label: "Drinks", act: { type: "sub", cat: "food", sub: "drinks" } },
  { id: "cheapeats", label: "Cheap eats", act: { type: "exp", key: "value" } },
  { id: "nightlife", label: "Nightlife", act: { type: "browse", cat: "nightlife" } },
  { id: "clubs", label: "Clubs", act: { type: "sub", cat: "nightlife", sub: "clubs" } },
  { id: "livemusic", label: "Live music", act: { type: "sub", cat: "nightlife", sub: "music" } },
  { id: "beach", label: "Beach", act: { type: "sub", cat: "attractions", sub: "outdoors" } }, // v6.28: beaches live under Things to do → Outdoors
  { id: "family", label: "Family", act: { type: "browse", cat: "family" } },
  { id: "outdoors", label: "Outdoors", act: { type: "sub", cat: "attractions", sub: "outdoors" } },
  { id: "museums", label: "Museums", act: { type: "sub", cat: "attractions", sub: "museums" } },
  { id: "tours", label: "Tours", act: { type: "sub", cat: "attractions", sub: "tours" } },
  { id: "spa", label: "Spa & wellness", act: { type: "sub", cat: "attractions", sub: "spa" } },
  { id: "tourist", label: "Tourist must-dos", act: { type: "sheet", sheet: "mustdos" } },
  { id: "shopping", label: "Shopping", act: { type: "browse", cat: "shopping" } },
  { id: "stays", label: "Stays", act: { type: "browse", cat: "hotels" } },
  { id: "events", label: "Events", act: { type: "screen", screen: "events" } },
  { id: "familyfriendly", label: "Family-friendly", act: { type: "exp", key: "family" } },
  { id: "romantic", label: "Romantic", act: { type: "exp", key: "romantic" } },
];
// The six home tiles, in display order. The menu renders THIS, so the
// regression fixtures below actually guard the live UI, not a shadow config.
export const CATEGORY_TILES = [
  { id: "food", label: "Food" },
  { id: "nightlife", label: "Night out" },
  { id: "attractions", label: "Things to do" },
  { id: "family", label: "Family" }, // v6.28: replaced "Beach day" (beaches now live under Things to do → Outdoors)
  { id: "hotels", label: "Stays" },
  { id: "shopping", label: "Shopping" },
];
export const REQUIRED = ["tonight", "food", "todo", "kids", "date", "rainy", "gems", "drive", "breakfast", "brunch", "coffee", "dinner", "drinks", "nightlife", "clubs", "beach", "outdoors", "shopping", "stays", "livemusic", "events", "tourist", "cheapeats", "romantic", "familyfriendly"];
export function allIds() { return [...INTENTS, ...DISCOVER].map((x) => x.id); }
export function validAct(a) { return !!a && ["screen", "browse", "exp", "sheet", "sub"].includes(a.type); }
