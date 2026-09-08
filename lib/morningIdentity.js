// One morning candidate can serve both coffee and breakfast.  It must still
// have one display identity.  Keep that decision independent from the broad
// query/candidate gate so an incomplete provider payload cannot turn a café
// into a breakfast restaurant simply because `primaryType` was omitted.
import { isBreakfastPlace } from "./breakfast.js";

const CAFE_TYPES = new Set([
  "cafe", "coffee_shop", "tea_house", "bakery", "bagel_shop", "donut_shop",
]);
const BREAKFAST_TYPES = new Set([
  "breakfast_restaurant", "brunch_restaurant", "diner", "pancake_restaurant",
]);
const GENERIC_FOOD_TYPES = new Set(["", "restaurant", "food", "point_of_interest", "establishment"]);

// `\b` after é is false in JavaScript (é is not an ASCII word character), so
// the accented spelling gets its own alternative.
const CAFE_NAME = /\b(cafe|coffee|espresso|roaster(y)?|tea house|bakery|bakeshop|bagel|donut)\b|café/i;
const BREAKFAST_NAME = /\b(breakfast|brunch|pancake(s)?|waffle(s)?|diner|biscuit|crepe|omelet(te)?|eggs?)\b/i;
// These are bar-like rooms that provider types routinely mislabel as cafés.
// This must live beside the display classifier, not only in the menu filter,
// because the Breakfast poster consumes the same broad Food pool directly.
const MORNING_EXCLUDE = /\bkava\b|\bkratom\b|hookah|shisha|\bvape\b|smoke ?shop/i;
// Lodging may contain the word "breakfast" as a service, but it is never a
// breakfast destination.  This belongs in the shared classifier so the menu
// and poster reject the same Bed-and-Breakfast inventory rows.
const LODGING_MORNING_VETO = /^(lodging|hotel|motel|resort|bed_and_breakfast|guest_house|vacation_rental)$/;
// Some provider rows arrive with no structured types at all.  "Bed and
// Breakfast" is then a lodging NAME, not meal evidence; without this name
// veto Jimmy Dean B&B can bypass every type-level lodging protection.
const LODGING_NAME_VETO = /\bbed\s*(?:and|&)\s*breakfast\b|\bb&b\b/i;
// A dinner room with a secondary brunch tag is not a breakfast destination.
// Keep this deliberately narrow: Cracker Barrel's american_restaurant primary
// genuinely serves breakfast, while Fleming's steakhouse does not belong here.
const BREAKFAST_VETO_PRIMARY = /steak|fine_dining|wine_bar|night_club|cocktail|^bar(_and_grill)?$/;

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function list(value) {
  if (Array.isArray(value)) return value.map(normalized).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,|]+/).map(normalized).filter(Boolean);
  return [];
}

// Providers have used all four aliases over time.  This deliberately returns
// a set: provider type order is not a semantic primary identity.
export function morningTypes(place) {
  return new Set([
    ...list(place?.types),
    ...list(place?.google_types),
    ...list(place?.googleTypes),
  ]);
}

export function morningPrimaryType(place) {
  return normalized(place?.primaryType || place?.primary_type);
}

function hasAny(types, candidates) {
  for (const type of candidates) if (types.has(type)) return true;
  return false;
}

function canonicalMorningView(place, primary, types, name) {
  return {
    ...place,
    // The rail predicate predates one provider's `googleTypes` alias.  Give
    // it one normalized view so its existing vetoes see exactly the evidence
    // the poster/menu identity sees; type order remains irrelevant there.
    types: [...types],
    primaryType: primary,
    // Its ASCII word-boundary test cannot terminate after `é`.  Normalize
    // only that spelling before the canonical predicate rather than adding a
    // broad fallback that could bypass nutrition/retail/quick-service vetoes.
    name: name.replace(/café/gi, "cafe"),
  };
}

export function isMorningCandidate(place) {
  const primary = morningPrimaryType(place);
  const types = morningTypes(place);
  const name = String(place?.name || "");
  if (LODGING_MORNING_VETO.test(primary) || [...types].some((type) => LODGING_MORNING_VETO.test(type))) return false;
  if (LODGING_NAME_VETO.test(name)) return false;
  if (MORNING_EXCLUDE.test(`${name} ${[...types].join(" ")}`)) return false;
  // The poster and menu share the rail's proven candidate eligibility.  This
  // keeps its primary-cuisine, nutrition-club, retail, and quick-service
  // vetoes from being accidentally reimplemented (and drifting) here.
  if (!isBreakfastPlace(canonicalMorningView(place, primary, types, name))) return false;
  return CAFE_TYPES.has(primary)
    || BREAKFAST_TYPES.has(primary)
    || hasAny(types, CAFE_TYPES)
    || hasAny(types, BREAKFAST_TYPES)
    || CAFE_NAME.test(name)
    || BREAKFAST_NAME.test(name);
}

// Returns `"breakfast"`, `"cafe"`, or null.  Meal-first names intentionally
// win: "Keke's Breakfast Cafe" promises breakfast even when a provider gives
// it an unhelpfully generic café type.  Otherwise an explicit primary wins;
// with no primary, café evidence wins a dual-service tie to prevent real cafés
// from leaking into Best Breakfast when `primaryType` is absent.
export function morningDisplayIdentity(place) {
  if (!isMorningCandidate(place)) return null;
  const primary = morningPrimaryType(place);
  const types = morningTypes(place);
  const name = String(place?.name || "");

  if (BREAKFAST_NAME.test(name) && !BREAKFAST_VETO_PRIMARY.test(primary)) return "breakfast";
  if (BREAKFAST_TYPES.has(primary)) return "breakfast";
  if (CAFE_TYPES.has(primary)) return "cafe";

  const hasCafeType = hasAny(types, CAFE_TYPES);
  const hasCafeName = CAFE_NAME.test(name);
  const hasBreakfast = hasAny(types, BREAKFAST_TYPES) || BREAKFAST_NAME.test(name);
  // A restaurant can have a real bakery/café counter (Arte Caffè is the
  // production shape).  Explicit café evidence therefore wins before a
  // cuisine primary is treated as a reason to discard it.
  if (hasCafeType || (GENERIC_FOOD_TYPES.has(primary) && hasCafeName)) return "cafe";
  // A breakfast secondary is sufficient for a generic/cuisine restaurant
  // such as Cracker Barrel, but not for a steakhouse Sunday-brunch tag.
  if (hasBreakfast && !BREAKFAST_VETO_PRIMARY.test(primary)) return "breakfast";
  if (!GENERIC_FOOD_TYPES.has(primary)) return null;
  return null;
}
