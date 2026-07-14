// lib/placeCategory.js — THE one source of truth for "which Wayfind section
// does this place belong to," read from Google types.
//
// GLOBAL RULE (v6.15): types are the truth, and identity resolves by the
// PRIMARY type first — but only among identities the place STRONGLY has, so a
// generic catch-all type (store / shop / point_of_interest) can never steal a
// place that is really Food/Nightlife/Activities, and a mall's food-court
// "restaurant" type can't flip the mall to Food.
//
// This fixes a whole CLASS of "wrong thing in the wrong list" bugs at the root:
//   • bagel_shop / coffee_shop / grocery_store were read as Shopping (they
//     contain "shop"/"store" and the old Food matcher didn't know them),
//   • an auto-repair "The Shop" slipped into Shopping via a bare "store" type,
//   • a nature-preserve live-music venue leaked into Nightlife.
// The classifier below + the shared gate (lib/placeFilter.js) enforce it, and
// scripts/check-categories.mjs executes it against fixtures so it can't regress.

// Pure service businesses are never a discovery result (they can carry a stray
// retail/food type — an auto shop lists "store", a day spa lists "salon").
const SERVICE_TYPE = /\b(car_repair|auto_repair|auto_parts|car_dealer|car_wash|gas_station|self_storage|storage|laundry|dry_clean|bank|atm|insurance_agency|real_estate_agency|lawyer|accounting|doctor|dentist|hospital|physiotherap|veterinary|plumber|electrician|roofing|general_contractor|moving_company|funeral_home|nail_salon|hair_salon|hair_care|beauty_salon|barber_shop|barber|tanning)\b/;

// FOOD — every restaurant/cafe/bakery variant, INCLUDING the _shop and _store
// forms Google uses that a bare "shop"/"store" match would otherwise steal.
const FOOD_TYPE = /restaurant|_restaurant|\bfood\b|food_court|food_store|meal_takeaway|meal_delivery|\bcafe\b|cafeteria|coffee|espresso|bakery|bagel|sandwich|\bdeli\b|delicatessen|donut|doughnut|ice_cream|frozen_yogurt|gelato|dessert|confection|patisserie|creamery|pastry|butcher|greengrocer|grocery|supermarket|pizzeria|pizza|taqueria|\btaco|sushi|ramen|noodle|steak_house|barbecue|\bbbq\b|\bdiner\b|bistro|eatery|brasserie|gastropub|juice|smoothie|tea_house|bubble_tea|creperie|buffet/;

const NIGHTLIFE_TYPE = /night_club|nightclub|\bbar\b|_bar\b|\bpub\b|pub_|brewery|brewpub|taproom|tavern|wine_bar|cocktail|\blounge\b|speakeasy|distillery|karaoke|hookah|dance_club|beer_garden/;

// NOTE: campground / rv_park are deliberately NOT here — outdoor lodging is an
// Activities/outdoors experience, handled by the early return in primaryCategory
// (the pre-v6.15 rule the Canoe Outpost case locks).
const HOTEL_TYPE = /lodging|\bhotel|motel|resort_hotel|\bresort\b|guest_house|guesthouse|bed_and_breakfast|\bhostel\b|\binn\b|cottage|cabin|vacation_rental|extended_stay/;

const ACTIVITY_TYPE = /tourist_attraction|amusement|theme_park|water_park|aquarium|\bzoo\b|museum|art_gallery|\bpark\b|national_park|state_park|dog_park|nature_preserve|natural_feature|botanical|\bgarden\b|\btrail\b|hiking|\bbeach\b|marina|\bpier\b|boardwalk|landmark|historical|monument|memorial|stadium|\barena\b|theater|theatre|performing_arts|concert_hall|live_music_venue|music_venue|movie_theater|cinema|bowling|arcade|casino|winery|golf_course|\bgolf\b|playground|planetarium|science_museum|observation|event_venue|amphitheater|amphitheatre|fairground|recreation|\bgym\b|fitness_center|\bspa\b|wellness_center/;

// Specific, real retail identities (a place typed like this genuinely IS a
// store) vs the generic catch-all that must never win over a real identity.
const SPECIFIC_SHOP = /department_store|clothing_store|shoe_store|jewelry_store|\bbook_store\b|electronics_store|home_goods_store|furniture_store|sporting_goods_store|hardware_store|\bgift_shop\b|boutique|flea_market|shopping_mall|shopping_center|\boutlet\b|convenience_store|liquor_store|pet_store|toy_store|florist|home_improvement_store|bicycle_store|record_store|thrift|consignment|antique/;
const GENERIC_SHOP = /\bstore\b|\bshop\b|shop_|_shop\b|\bmall\b|marketplace|bazaar|emporium/;

function typeTokens(p) {
  if (!p) return [];
  if (p.types && p.types.length) return p.types.map((t) => String(t).toLowerCase());
  if (p.type) return [String(p.type).toLowerCase().replace(/ /g, "_")];
  return [];
}

// The place's Wayfind section, or null when its types carry no discovery
// identity (a pure service, or no type signal — then the caller may fall back
// to the name).
export function primaryCategory(p) {
  const arr = typeTokens(p);
  if (!arr.length) return null;
  const joined = " " + arr.join(" ") + " ";
  const has = (rx) => rx.test(joined);
  const strong = {
    Hotels: has(HOTEL_TYPE),
    Food: has(FOOD_TYPE),
    Nightlife: has(NIGHTLIFE_TYPE),
    Activities: has(ACTIVITY_TYPE),
    Shopping: has(SPECIFIC_SHOP),
  };
  const anyStrong = strong.Hotels || strong.Food || strong.Nightlife || strong.Activities || strong.Shopping;
  // Outdoor lodging (campground / RV park) is an Activities/outdoors experience,
  // never a Hotels result — even though it also carries a "lodging" type. This
  // is the pre-v6.15 rule the Canoe Outpost case (lib/lodging + check-lodging)
  // depends on.
  if (/\bcampground\b|\brv_park\b/.test(joined)) return "Activities";
  // Service with no real discovery identity → not a Wayfind result at all.
  if (has(SERVICE_TYPE) && !anyStrong) return null;
  // Resolve by the FIRST type that carries an identity the place STRONGLY has.
  for (const t of arr) {
    if (HOTEL_TYPE.test(t) && strong.Hotels) return "Hotels";
    if (FOOD_TYPE.test(t) && strong.Food) return "Food";
    if (NIGHTLIFE_TYPE.test(t) && strong.Nightlife) return "Nightlife";
    if (ACTIVITY_TYPE.test(t) && strong.Activities) return "Activities";
    if ((SPECIFIC_SHOP.test(t) || GENERIC_SHOP.test(t)) && (strong.Shopping || !anyStrong)) return "Shopping";
  }
  if (strong.Food) return "Food";
  if (strong.Nightlife) return "Nightlife";
  if (strong.Activities) return "Activities";
  if (strong.Hotels) return "Hotels";
  if (strong.Shopping) return "Shopping";
  if (has(GENERIC_SHOP)) return "Shopping";
  return null;
}

// A pure service business (car repair, salon, bank...) with no discovery
// identity — must never appear in any Wayfind category.
export function isServicePlace(p) {
  const arr = typeTokens(p);
  if (!arr.length) return false;
  const joined = " " + arr.join(" ") + " ";
  return SERVICE_TYPE.test(joined) && primaryCategory(p) === null;
}

// Outdoor / daytime / nature identity — never after-dark Nightlife, whatever
// live music it happens to host (the "Habitat House Concerts" nature-preserve
// case). Excludes places that also carry a real bar/club type.
const OUTDOOR_TYPE = /\bpark\b|national_park|state_park|dog_park|nature_preserve|natural_feature|botanical|\bgarden\b|\btrail\b|hiking|\bbeach\b|campground|playground|marina/;
export function isOutdoorNature(p) {
  const j = " " + typeTokens(p).join(" ") + " ";
  return OUTDOOR_TYPE.test(j) && !NIGHTLIFE_TYPE.test(j);
}

// Single-token classifier (some callers pass one Google type). Returns the
// same section names as primaryCategory.
export function catOfType(x) {
  return primaryCategory({ types: [String(x || "")] });
}

// Which Wayfind section a browse categoryId maps to (beach + attractions are
// both the outdoor/Activities section).
export const CATEGORY_SECTION = { food: "Food", nightlife: "Nightlife", hotels: "Hotels", shopping: "Shopping", beach: "Activities", attractions: "Activities" };
