// One identity catalogue for Wayfind's major Florida parks. This file never
// stores a partner URL or chooses a seller. placePartnerPick() remains the one
// ticket winner after an owned inventory row has matched here exactly.

export const THEME_PARK_MODES = Object.freeze({
  flagship: Object.freeze({ title: "Florida's Biggest Parks", description: "Major Florida parks worth planning a day or trip around." }),
  family: Object.freeze({ title: "Theme Parks", description: "Florida parks with a verified place card and ticket path." }),
  orlando: Object.freeze({ title: "Orlando's Biggest Parks", description: "The major parks around Orlando, ranked by Wayfind Score." }),
});

const park = (key, name, market, aliases, modes = ["flagship", "family", "orlando"]) => Object.freeze({
  key, name, market, modes: Object.freeze(modes), aliases: Object.freeze([...new Set([name, ...aliases])]),
});

export const THEME_PARKS = Object.freeze([
  park("walt_disney_world", "Walt Disney World Resort", "orlando", ["Walt Disney World"]),
  park("magic_kingdom", "Magic Kingdom Park", "orlando", ["Magic Kingdom"]),
  park("epcot", "EPCOT", "orlando", []),
  park("hollywood_studios", "Disney's Hollywood Studios", "orlando", []),
  park("animal_kingdom", "Disney's Animal Kingdom Theme Park", "orlando", ["Disney's Animal Kingdom"]),
  park("universal_orlando", "Universal Orlando Resort", "orlando", []),
  park("universal_studios", "Universal Studios Florida", "orlando", []),
  park("islands_of_adventure", "Universal's Islands of Adventure", "orlando", ["Universal Islands of Adventure"]),
  park("epic_universe", "Universal Epic Universe", "orlando", ["Universal's Epic Universe"]),
  park("volcano_bay", "Universal Volcano Bay", "orlando", ["Universal's Volcano Bay"]),
  park("seaworld", "SeaWorld Orlando", "orlando", []),
  park("discovery_cove", "Discovery Cove", "orlando", []),
  park("gatorland", "Gatorland", "orlando", []),
  park("kennedy", "Kennedy Space Center Visitor Complex", "orlando", ["Kennedy Space Center"]),
  park("legoland", "LEGOLAND Florida Resort", "central_florida", ["LEGOLAND Florida", "LEGOLAND Florida Park"]),
  park("peppa_pig", "Peppa Pig Theme Park", "central_florida", ["Peppa Pig Theme Park Florida"]),
  park("busch_gardens", "Busch Gardens Tampa Bay", "tampa", ["Busch Gardens"], ["flagship", "family"]),
]);

export function normalizeThemeParkName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const BY_ALIAS = new Map();
for (const row of THEME_PARKS) for (const alias of row.aliases) BY_ALIAS.set(normalizeThemeParkName(alias), row);

export function themeParkForPlace(place) {
  return BY_ALIAS.get(normalizeThemeParkName(place && (place.name || place.title))) || null;
}

export function themeParkIntent(query) {
  const q = normalizeThemeParkName(query);
  if (!q) return null;
  const exact = BY_ALIAS.get(q);
  if (exact) return { kind: "exact", park: exact };
  if (q === "epic universe") return { kind: "exact", park: THEME_PARKS.find((row) => row.key === "epic_universe") };
  if (/^(florida |orlando )?(theme|amusement) parks?( tickets?)?$/.test(q)) return { kind: "broad", park: null };
  if (/^(disney|walt disney world)( parks?)?( tickets?)?$/.test(q)) return { kind: "operator", operator: "disney" };
  if (/^universal( orlando)?( parks?)?( tickets?)?$/.test(q)) return { kind: "operator", operator: "universal" };
  return null;
}

const DISNEY_KEYS = new Set(["walt_disney_world", "magic_kingdom", "epcot", "hollywood_studios", "animal_kingdom"]);
const UNIVERSAL_KEYS = new Set(["universal_orlando", "universal_studios", "islands_of_adventure", "epic_universe", "volcano_bay"]);
export function themeParkOperator(park) {
  if (park && DISNEY_KEYS.has(park.key)) return "disney";
  if (park && UNIVERSAL_KEYS.has(park.key)) return "universal";
  return null;
}

export function parksForMode(mode = "flagship") {
  const safe = Object.hasOwn(THEME_PARK_MODES, mode) ? mode : "flagship";
  return THEME_PARKS.filter((row) => row.modes.includes(safe));
}

export function themeParkHeading(mode = "flagship") {
  return THEME_PARK_MODES[mode] || THEME_PARK_MODES.flagship;
}

export function orderThemeParks(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const as = Number(a && a.wfScore) || 0, bs = Number(b && b.wfScore) || 0;
    if (bs !== as) return bs - as;
    const ar = Number(a && a.reviews) || 0, br = Number(b && b.reviews) || 0;
    if (br !== ar) return br - ar;
    return String(a && a.name || "").localeCompare(String(b && b.name || ""));
  });
}
