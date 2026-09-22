import { milesBetween } from "./locationHonesty.js";
import { familyWeatherSafe, matchesFamilyFilters } from "./familyDayTaxonomy.js";

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
  // Aliases below include not just the canonical/legal name but the common
  // search phrasing a person actually types (audit 2026-09-22, PR #1420
  // follow-up): "Busch Gardens Tampa" is how most people spell it without
  // "Bay"; "Hollywood Studios"/"Animal Kingdom"/"Islands of Adventure"/
  // "Volcano Bay" drop the Disney's/Universal's possessive most people never
  // type; "SeaWorld", "LEGOLAND" and "Peppa Pig" are searched bare, without
  // the market/venue-type suffix. Every addition here is a plain string; it
  // adds a search phrasing, never a new merchant or place identity.
  // "Walt Disney World® Resort" (with the registered-trademark glyph) is the
  // exact name of the photographed, rated wf_inventory row for the resort as
  // a whole (audit 2026-09-22: the untrademarked spelling below only matched
  // a different, unphotographed row, so the resort card never rendered).
  // lib/themeParksServer.js matches names by exact (case-insensitive) SQL
  // ilike, not fuzzy search, so the glyph has to be listed verbatim here.
  park("walt_disney_world", "Walt Disney World Resort", "orlando", ["Walt Disney World", "Walt Disney World® Resort"]),
  park("magic_kingdom", "Magic Kingdom Park", "orlando", ["Magic Kingdom"]),
  park("epcot", "EPCOT", "orlando", []),
  park("hollywood_studios", "Disney's Hollywood Studios", "orlando", ["Hollywood Studios"]),
  park("animal_kingdom", "Disney's Animal Kingdom Theme Park", "orlando", ["Disney's Animal Kingdom", "Animal Kingdom"]),
  park("universal_orlando", "Universal Orlando Resort", "orlando", ["Universal Orlando"]),
  park("universal_studios", "Universal Studios Florida", "orlando", ["Universal Studios", "Universal Studios Orlando"]),
  park("islands_of_adventure", "Universal's Islands of Adventure", "orlando", ["Universal Islands of Adventure", "Islands of Adventure"]),
  park("epic_universe", "Universal Epic Universe", "orlando", ["Universal's Epic Universe", "Epic Universe"]),
  park("volcano_bay", "Universal Volcano Bay", "orlando", ["Universal's Volcano Bay", "Volcano Bay"]),
  park("seaworld", "SeaWorld Orlando", "orlando", ["SeaWorld"]),
  park("discovery_cove", "Discovery Cove", "orlando", []),
  park("gatorland", "Gatorland", "orlando", []),
  park("kennedy", "Kennedy Space Center Visitor Complex", "orlando", ["Kennedy Space Center"]),
  // "LEGOLAND® Florida Resort" (registered-trademark glyph) is the exact
  // name of the photographed, rated wf_inventory row; the untrademarked
  // "LEGOLAND Florida Resort" only matches a separate, unphotographed
  // placeholder row (place_id wfadd_legoland_florida), so without this exact
  // string the rail card never rendered (audit 2026-09-22).
  park("legoland", "LEGOLAND Florida Resort", "central_florida", ["LEGOLAND Florida", "LEGOLAND Florida Park", "LEGOLAND", "LEGOLAND® Florida Resort"]),
  park("peppa_pig", "Peppa Pig Theme Park", "central_florida", ["Peppa Pig Theme Park Florida", "Peppa Pig"]),
  park("busch_gardens", "Busch Gardens Tampa Bay", "tampa", ["Busch Gardens", "Busch Gardens Tampa"], ["flagship", "family"]),
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

// The statewide homepage rail remains broad. Family Day supplies its actual
// planning context so the same parks cannot bypass distance, weather or facts.
export function filterFamilyThemeParks(rows, context) {
  if (!context) return rows;
  const { lat, lng, radiusMi, filters = {}, indoorOnly = false, ready = false, paused = false } = context;
  if (!ready || paused || ![lat, lng, radiusMi].every(Number.isFinite) || radiusMi <= 0) return [];
  return rows.filter((place) => {
    if (![place.lat, place.lng].every(Number.isFinite)) return false;
    const distance = milesBetween({ lat, lng }, place);
    return Number.isFinite(distance) && distance <= radiusMi
      && (!indoorOnly || familyWeatherSafe(place)) && matchesFamilyFilters(place, filters);
  });
}
