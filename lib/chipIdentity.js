// lib/chipIdentity.js — SERVER + GUARDS. Named membership for every home chip.
//
// Do not import this from app/home.js or lib/sources.js. The homepage JS
// ratchet is 496KB gz; this graph (beaches / meal / placeFilter wrappers)
// is why #955 first failed CI. Client membership is placeAllowed.
//
// Food → Cafés / Lunch is #951's contract (placeAllowed). This module
// names it and extends the same identity-before-rank rule to every other
// chip. Family → Rainy day is indoor family rooms — Ca' d'Zan / Ringling
// campus / outdoor parks / beaches fail. Beaches is sit-on-sand.

import { placeAllowed } from "./placeFilter.js";
import { isBeachPlace, BEACH_FACILITY_RX } from "./beaches.js";
import { isLunchPlace } from "./mealPlace.js";

function hayOf(p) {
  const name = String((p && (p.name || p.title || (p.displayName && p.displayName.text))) || "").toLowerCase();
  const types = ((p && (p.types || p.google_types)) || []).map((t) => String(t).toLowerCase());
  const primary = String((p && (p.primaryType || p.primary_type)) || types[0] || "").toLowerCase();
  return { name, types, primary, hay: [name, primary, ...types].join(" ") };
}

const NIGHTLIFE_RX = /night_club|nightclub|cocktail_bar|strip club|hookah|speakeasy/;

export function isCafePlace(p) { return placeAllowed("food", "cafes", p); }
export function isBreakfastChip(p) { return placeAllowed("food", "breakfast", p); }
export function isLunchChip(p) { return isLunchPlace(p) && placeAllowed("food", "lunch", p); }
export function isFoodPlace(p) { return placeAllowed("food", "all", p); }
export function isDinnerChip(p) { return placeAllowed("food", "dinner", p); }
export function isQuickBitePlace(p) { return placeAllowed("food", "quickbites", p); }
export function isDeliveryPlace(p) { return placeAllowed("food", "delivery", p); }
export function isDessertChip(p) { return placeAllowed("food", "dessert", p); }

export function isNightlifePlace(p) { return placeAllowed("nightlife", "all", p); }
export function isBarPlace(p) { return placeAllowed("nightlife", "bars", p); }
export function isClubPlace(p) { return placeAllowed("nightlife", "clubs", p); }
export function isSpeakeasyPlace(p) { return placeAllowed("nightlife", "speakeasy", p); }
export function isKaraokePlace(p) { return placeAllowed("nightlife", "karaoke", p); }
export function isSportsBarPlace(p) { return placeAllowed("nightlife", "sports", p); }
export function isLiveMusicPlace(p) { return placeAllowed("nightlife", "music", p); }

export function isAttractionPlace(p) { return placeAllowed("attractions", "all", p); }
export function isOutdoorsPlace(p) { return placeAllowed("attractions", "outdoors", p); }
export function isMuseumPlace(p) { return placeAllowed("attractions", "museums", p); }
export function isAttractionFamilyPlace(p) { return placeAllowed("attractions", "family", p); }
export function isTourPlace(p) { return placeAllowed("attractions", "tours", p); }
export function isSpaPlace(p) { return placeAllowed("attractions", "spa", p); }
export function isLandmarkPlace(p) { return placeAllowed("attractions", "landmarks", p); }
export function isArtsPlace(p) { return placeAllowed("attractions", "arts", p); }
export function isOnTheWaterPlace(p) { return placeAllowed("attractions", "marinas", p); }

export function isSitOnSandPlace(p) {
  const shaped = {
    name: p && (p.name || (p.displayName && p.displayName.text) || p.title),
    title: p && p.title,
    types: p && (p.types || p.google_types),
    primaryType: p && (p.primaryType || p.primary_type),
    primary_type: p && (p.primary_type || p.primaryType),
    category: p && p.category,
  };
  if (isBeachPlace(shaped)) return true;
  // Public beach parks (Fort De Soto) are typed park + beach. A mansion
  // museum is not sit-on-sand even when inventory files it under attractions.
  if (!placeAllowed("attractions", "beaches", shaped) && !placeAllowed("beach", "beaches", shaped)) return false;
  const { name, types, primary } = hayOf(shaped);
  if (primary === "museum" || /ca['’]?\s*d['’]?\s*zan|\bmansion\b|tennis|pickleball/.test(name)) return false;
  // A FACILITY AT a beach is not the beach. Same list lib/beaches.js already
  // vets the beaches dataset with - a pavilion, a marina, a pier, a car park.
  if (BEACH_FACILITY_RX.test(name)) return false;
  // TYPE evidence only. The old tail ended `|| /\bbeach\b/.test(name)`, which
  // is a NAME rescue one level above the one placeAllowed closes, and it is how
  // both of these reached Activities > Beaches on a live Parrish screenshot:
  //   "E.G. Simmons Beach Pavilion 12"  primary null, types [point_of_interest]
  //   "Apollo Beach Preserve"           primary nature_preserve, types [park, ...]
  // Neither carries a beach type anywhere. Both are filed category=beach in
  // wf_inventory, and that coarse bucket is not identity - it is the reason the
  // chip needs one. Fort De Soto Park still passes: it is typed park + beach.
  return primary === "beach" || types.includes("beach");
}

export function isToddlerPlace(p) {
  if (!p) return false;
  const { name, hay } = hayOf(p);
  if (NIGHTLIFE_RX.test(hay)) return false;
  if (/\bmuseum\b/.test(hay) && !/children|toddler|kiddie|sensory/.test(hay)) return false;
  const parkShaped = /\b(park|riverwalk|river walk|waterfront|sports_complex|stadium)\b/.test(hay);
  const toddlerAmenity = /playground|splash|petting|carousel|kiddie|toddler|sensory|play ?cafe|indoor ?play|children/.test(hay);
  if (parkShaped && !toddlerAmenity && !/\b(zoo|aquarium|farm|garden|library|aviary)\b/.test(hay)) return false;
  return /playground|childrens_museum|children.?s? ?museum|splash|petting|carousel|aquarium|\bfarm\b|botanical|\bgarden\b|library|story ?time|\bzoo\b|kiddie|toddler|sensory|play ?cafe|indoor ?play|aviary|wildlife|arboretum/.test(hay + " " + name);
}

export function isKidsPlace(p) {
  if (!p) return false;
  const { name, hay } = hayOf(p);
  if (NIGHTLIFE_RX.test(hay)) return false;
  if (/escape/.test(hay) && !/\b(kid|kids|child|children|family|junior|teen)\b/.test(name)) return false;
  return /arcade|trampoline|mini.?golf|go.?kart|\bkart\b|laser ?tag|bowling|water_park|amusement|theme_park|candy|ice_cream|skat|climb|fun.?center|entertainment|carousel|\bzoo\b|aquarium|paintball|batting ?cage|roller|playground|kids?|child/.test(hay);
}

export function isFamilyDiningPlace(p) {
  if (!p) return false;
  const { hay } = hayOf(p);
  if (NIGHTLIFE_RX.test(hay)) return false;
  return /restaurant|\bcafe\b|coffee|brewery|pizzeria|pizza|\bdiner\b|grill|bbq|taqueria|\btaco|burger|ice_cream|bakery|eatery|kitchen|bistro|gastropub|food/.test(hay);
}

export function isRainyDayPlace(p) {
  if (!p) return false;
  const { hay } = hayOf(p);
  if (NIGHTLIFE_RX.test(hay)) return false;
  if (/ca['’]?\s*d['’]?\s*zan|ringling|tibbals|circus museum|\bmansion\b|\bvilla\b|historic (home|house|estate)|waterfront (mansion|estate)/.test(hay)) return false;
  if (/\bbeach\b/.test(hay) && !/indoor|aquarium|museum|library/.test(hay)) return false;
  if (/\b(park|trail|preserve|boardwalk|pier|marina)\b/.test(hay) && !/indoor|museum|aquarium|library|arcade|bowling|planetarium|science/.test(hay)) return false;
  if (/indoor|play ?cafe|indoor_playground|aquarium|planetarium|science_museum|childrens_museum|children.?s? ?museum|library|arcade|trampoline|bowling|climb|escape ?room|cinema|movie|ice.?rink/.test(hay)) return true;
  return /\bmuseum\b/.test(hay) && /science|children|kid|planetarium|natural.?histor/.test(hay);
}

export function isFamilyTabPlace(p) { return placeAllowed("family", "all", p); }
export function isToddlerChip(p) { return isToddlerPlace(p) && placeAllowed("family", "toddlers", p); }
export function isKidsChip(p) { return isKidsPlace(p) && placeAllowed("family", "kids", p); }
export function isGrownupsChip(p) { return isFamilyDiningPlace(p) && placeAllowed("family", "adults", p); }
export function isRainyChip(p) { return isRainyDayPlace(p) && placeAllowed("family", "rainy", p); }

function stayHay(p) {
  return `${String((p && p.name) || "").toLowerCase()} ${((p && p.types) || []).join(" ").toLowerCase()}`;
}
export function isStayPlace(p) { return placeAllowed("hotels", "all", p); }
export function isLuxuryStayChip(p) {
  return placeAllowed("hotels", "luxury", p) && /luxury|ritz|four seasons|waldorf|st\.?\s*regis|palace|grand|\bresort\b/.test(stayHay(p));
}
export function isBudgetStayChip(p) {
  return placeAllowed("hotels", "budget", p) && /motel|\binn\b|lodge|suites|extended stay|super 8|days inn|la quinta|red roof|econo/.test(stayHay(p));
}
export function isBeachStayChip(p) {
  return placeAllowed("hotels", "beach", p) && /beach|gulf|ocean|\bisland\b|\bkey\b/.test(stayHay(p));
}
export function isBoutiqueStayChip(p) {
  return placeAllowed("hotels", "boutique", p) && /boutique|historic/.test(stayHay(p));
}

export function isShoppingPlace(p) { return placeAllowed("shopping", "all", p); }
export function isMallPlace(p) { return placeAllowed("shopping", "malls", p); }
export function isBoutiqueShopPlace(p) { return placeAllowed("shopping", "boutiques", p); }
export function isMarketPlace(p) { return placeAllowed("shopping", "markets", p); }
export function isOutletPlace(p) { return placeAllowed("shopping", "outlets", p); }
export function isGiftShopPlace(p) { return placeAllowed("shopping", "giftshops", p); }
export function isLegacyBeachTabPlace(p) { return isSitOnSandPlace(p); }

export const CHIP_IDENTITY = {
  "food:all": isFoodPlace,
  "food:breakfast": isBreakfastChip,
  "food:cafes": isCafePlace,
  "food:lunch": isLunchChip,
  "food:dinner": isDinnerChip,
  "food:quickbites": isQuickBitePlace,
  "food:delivery": isDeliveryPlace,
  "food:dessert": isDessertChip,
  "nightlife:all": isNightlifePlace,
  "nightlife:bars": isBarPlace,
  "nightlife:clubs": isClubPlace,
  "nightlife:speakeasy": isSpeakeasyPlace,
  "nightlife:karaoke": isKaraokePlace,
  "nightlife:sports": isSportsBarPlace,
  "nightlife:music": isLiveMusicPlace,
  "attractions:all": isAttractionPlace,
  "attractions:outdoors": isOutdoorsPlace,
  "attractions:beaches": isSitOnSandPlace,
  "attractions:museums": isMuseumPlace,
  "attractions:family": isAttractionFamilyPlace,
  "attractions:tours": isTourPlace,
  "attractions:spa": isSpaPlace,
  "attractions:landmarks": isLandmarkPlace,
  "attractions:arts": isArtsPlace,
  "attractions:marinas": isOnTheWaterPlace,
  "beach:all": isSitOnSandPlace,
  "beach:beaches": isSitOnSandPlace,
  "family:all": isFamilyTabPlace,
  "family:toddlers": isToddlerChip,
  "family:kids": isKidsChip,
  "family:adults": isGrownupsChip,
  "family:rainy": isRainyChip,
  "hotels:all": isStayPlace,
  "hotels:luxury": isLuxuryStayChip,
  "hotels:budget": isBudgetStayChip,
  "hotels:beach": isBeachStayChip,
  "hotels:boutique": isBoutiqueStayChip,
  "shopping:all": isShoppingPlace,
  "shopping:malls": isMallPlace,
  "shopping:boutiques": isBoutiqueShopPlace,
  "shopping:markets": isMarketPlace,
  "shopping:outlets": isOutletPlace,
  "shopping:giftshops": isGiftShopPlace,
};

export function chipIdentity(cat, sub, p) {
  if (!p) return false;
  const c = String(cat || "").toLowerCase();
  const s = String(sub || "all").toLowerCase() || "all";
  const fn = CHIP_IDENTITY[`${c}:${s}`];
  if (fn) return !!fn(p);
  return placeAllowed(c, s, p);
}
