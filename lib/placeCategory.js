// lib/placeCategory.js — THE one source of truth for "which Wayfind section
// does this place belong to," and whether it belongs in Wayfind at all.
//
// v6.16 UNIFICATION: lib/placeTaxonomy.js no longer decides categories; it is a
// thin tags layer over this file. There is now ONE classifier, so the category a
// place is STORED with (wf_inventory, written by the seeder) can never disagree
// with the category the LIVE gate (lib/placeFilter.js) computes. That divergence
// was the "wrong list" bug class at its root: the seeder called a marina a beach
// while the gate called it an activity, and nothing reconciled them.
//
// ── THE LOAD-BEARING RULE: primaryType decides ───────────────────────────────
// Google's `types` array is an unordered grab-bag and its ORDER IS NOT MEANING —
// v6.15 resolved by "first type carrying a strong identity," which meant a real
// hotel whose types happen to start with `wellness_center, spa, gym` classified
// as an Activity (EVEN Hotel Sarasota, verified in prod data). `primaryType` is
// Google's OWN answer to "what is this place," and it is decisive where `types`
// is ambiguous. Verified against all 1,027 real rows in wf_inventory:
//
//   EVEN Hotel      types start wellness_center/spa/gym → primaryType `hotel`      → Hotels
//   Seasons 52      has `wine_bar`                      → primaryType `american_restaurant` → Food
//   End Zone Grille has `restaurant`                    → primaryType `sports_bar`  → Nightlife
//   MarineMax       has `marina`                        → primaryType `supplier`    → EXCLUDED (boat dealer)
//   Venice Yacht Cl has `storage`                       → primaryType `marina`      → Activities
//   Discount Tackle has `marina`                        → primaryType `store`       → Shopping
//   Bay Indies      has `lodging`                       → primaryType `mobile_home_park` → EXCLUDED
//   "BEAUTIFUL HOUSE NEAR BEACH w/ Pool"                → primaryType `lodging`     → EXCLUDED (scraped rental)
//
// primaryType is OPTIONAL: the live Google path (lib/google.js) does not request
// it, so live places fall back to the type-list resolver below — unchanged from
// v6.15, so live behaviour does not regress. The seeder DOES request it, so the
// owned inventory gets the decisive signal.
//
// Fixtures for every case above are REAL rows frozen from production
// (data/atlas/fixtures-real-types.json) — never assumed types. See
// scripts/check-categories.mjs.

// ── Sections (identity) vs stored categories (which list) ───────────────────
// section  : Food | Nightlife | Activities | Hotels | Shopping   (a place's IDENTITY)
// category : food | nightlife | attractions | beach | hotels | shopping
//            (the STORED wf_inventory list — deliberately NOT always lowercase(section);
//             a grocery store's identity is Food but it lives in the Shopping>Markets list)
export const CATEGORY_SECTION = { food: "Food", nightlife: "Nightlife", hotels: "Hotels", shopping: "Shopping", beach: "Activities", attractions: "Activities" };

// ═══════════════════════════════════════════════════════════════════════════
// EXCLUSIONS — a place that is not a destination is not a Wayfind result, in
// ANY category. These run BEFORE classification, so nothing can "sneak in via a
// stray retail type" (the v6.15 hole: a general_contractor carrying
// `home_goods_store` matched the Shopping allowlist and was ADMITTED).
// ═══════════════════════════════════════════════════════════════════════════

// A place whose OWN declared identity (primaryType) is a trade, a supplier, a
// dealership or a residence. Google is telling us what it is; believe it.
const EXCLUDE_PRIMARY = new Set([
  // trades & suppliers.
  // NOTE: `manufacturer` is deliberately NOT here — Loaded Cannon Distillery (165
  // reviews, a real nightlife venue) has primaryType `manufacturer`. And `service`
  // is NOT here either: it covers Enander's Winter Wonderland Christmas Light
  // Display (448 reviews), Lemon Bay Boat Rental and Ray's Canoe Hideaway — all
  // real places. Both are handled below by the type-list rules instead.
  "general_contractor", "plumber", "electrician", "roofing_contractor",
  "supplier", "moving_company", "storage", "self_storage", "wholesaler", "distribution_service",
  // vehicles
  "car_dealer", "car_repair", "car_wash", "auto_parts_store", "gas_station", "boat_dealer",
  // professional services
  "insurance_agency", "real_estate_agency", "lawyer", "accounting", "bank", "atm",
  "funeral_home", "laundry", "dry_cleaner", "courthouse", "local_government_office", "post_office",
  // residential / infrastructure — never a destination
  "mobile_home_park", "housing_complex", "apartment_complex", "apartment_building",
  "condominium_complex", "gated_community", "parking_lot", "parking_garage",
  // private clubs and civic orgs (Elks Lodge et al.) — not open discovery results
  "association_or_organization",
]);

// Residential/infrastructure TYPES. These veto ONLY when primaryType gives no
// real destination identity — see exclusionReason(). Google tags condo-RESORTS
// with `condominium_complex` (Casa Del Mar, Tortuga Inn: 465 and 501 reviews,
// primaryType `resort_hotel`/`hotel`), so a blanket type veto here deletes real
// hotels.
const RESIDENTIAL_TYPE = /\b(mobile_home_park|housing_complex|apartment_complex|apartment_building|condominium_complex|gated_community|parking_lot|parking_garage)\b/;

// ── WHY THERE IS NO SECONDARY-TYPE "TRADE" VETO ────────────────────────────
// There was one, and it deleted real shops. Google tags big-box retailers with
// `manufacturer` and `supplier` as SECONDARY types, and furniture retailers with
// `general_contractor` (they do installs). Measured against the live inventory,
// a secondary-type trade veto excluded DICK'S Sporting Goods (291 reviews),
// Staples (223), Tractor Supply (165), Kile's ACE Hardware (190) and Hudson's
// Furniture (994) — and Hudson's type signature is INDISTINGUISHABLE from the
// contractor it was meant to catch.
//
// This is the v4.96b lesson restated: legit places carry poisonous secondary
// types (a marina lists `storage`, a zoo lists `veterinary_care`). The ONLY
// reliable discriminator is primaryType — Google's own answer to "what is this
// place" — which cleanly separates the trades (primaryType `general_contractor`
// / `plumber` / `service`) from the shops (primaryType `furniture_store` /
// `sporting_goods_store` / `store`).
//
// So the trade veto below fires ONLY when primaryType gives no retail identity
// at all. That is the line between:
//   Faling Construction  primaryType `service`        + general_contractor → EXCLUDED
//   Hudson's Furniture   primaryType `furniture_store` + general_contractor → KEPT
// Their TYPE LISTS are nearly identical; only primaryType tells them apart.
const TRADE_TYPE = /\b(general_contractor|plumber|electrician|roofing_contractor|moving_company)\b/;

// A real hotel DECLARES it is a hotel. A scraped short-term rental carries only
// the generic `lodging` type ("BEAUTIFUL HOUSE NEAR BEACH w/ Private Heated
// Pool" — 39 of 50 such rows in prod have ZERO reviews). Note this must NOT fire
// on campgrounds/RV parks, which also carry bare `lodging`.
const REAL_LODGING_TYPE = /\b(hotel|motel|resort_hotel|bed_and_breakfast|hostel|extended_stay_hotel|inn|guest_house)\b/;
// NOTE: `farm` is deliberately NOT here — a farm's primaryType is a real
// Activities identity (Hunsader Farms), and excluding it would delete a genuine
// attraction to catch one rental row. Precision over recall on exclusions.
const RENTAL_PRIMARY = new Set(["lodging", "private_guest_room", "cottage", "vacation_rental"]);
const OUTDOOR_LODGING_TYPE = /\b(campground|rv_park|camping_cabin)\b/;

export const EXCLUSION = {
  SERVICE: "service_or_trade",
  RESIDENTIAL: "residential_or_parking",
  RENTAL: "short_term_rental",
};

function typeTokens(p) {
  if (!p) return [];
  if (p.types && p.types.length) return p.types.map((t) => String(t).toLowerCase());
  if (p.type) return [String(p.type).toLowerCase().replace(/ /g, "_")];
  return [];
}
const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

// Why this place must never appear in Wayfind — or null if it may.
export function exclusionReason(p) {
  const arr = typeTokens(p);
  const joined = " " + arr.join(" ") + " ";
  const pt = primaryOf(p);

  // ── 1. primaryType is DECISIVE, in both directions ────────────────────────
  // Google's own answer to "what is this place" outranks every secondary type.
  if (pt && EXCLUDE_PRIMARY.has(pt)) {
    return /parking|mobile_home|housing|apartment|condominium|gated/.test(pt) ? EXCLUSION.RESIDENTIAL : EXCLUSION.SERVICE;
  }
  // A place whose primaryType IS a real destination (hotel, restaurant, marina,
  // museum…) is that thing, whatever poisonous secondary types it also carries.
  // This is what keeps Casa Del Mar Beach Resort (primaryType `resort_hotel`,
  // but ALSO typed `condominium_complex` + `real_estate_agency`) in Hotels.
  // Shopping is deliberately NOT trusted here: a trade business can present a
  // retail primaryType, so those still face the checks below.
  const primarySection = sectionFromPrimary(pt);
  if (primarySection && primarySection !== "Shopping") return null;

  // ── 2. no decisive primaryType → fall back to the type list ───────────────
  if (RESIDENTIAL_TYPE.test(joined)) return EXCLUSION.RESIDENTIAL;

  const sec = sectionFromTypes(arr);

  // The ORIGINAL v6.15 service veto, preserved: a service business with NO strong
  // discovery identity is not a Wayfind result. Catches the auto shop typed
  // [car_repair, store] — `store` is a GENERIC token that grants no real identity.
  // (Dropping this in favour of the primaryType rules alone regressed check-gate:
  // "The Shop" walked straight into Shopping. The guardrails caught it.)
  if (SERVICE_TYPE.test(joined) && !sec) return EXCLUSION.SERVICE;

  // The trade veto. `!primarySection` is load-bearing: a place Google calls a
  // furniture_store / sporting_goods_store / store HAS a retail identity and is
  // exempt, even though big-box retailers routinely carry a stray
  // `general_contractor` type (Hudson's Furniture, 994 reviews, does installs).
  // This only bites when Google itself had no better answer than `service`.
  if (!primarySection && TRADE_TYPE.test(joined) && (!sec || sec === "Shopping")) return EXCLUSION.SERVICE;
  // Scraped short-term rental: carries ONLY the generic `lodging` type, is not a
  // campground, and Google's own primaryType says `lodging` rather than `hotel`.
  //
  // This REQUIRES a primaryType on purpose. The live Google path (lib/google.js)
  // does not request primaryType, so live results can never hit this branch —
  // live behaviour is unchanged, and the rule only bites where we have Google's
  // own answer (the seeded inventory). Widening it to type-only would risk
  // excluding a legitimate hotel that a live search returned thinly typed.
  const hasLodging = /\blodging\b/.test(joined);
  if (pt && RENTAL_PRIMARY.has(pt) && hasLodging && !REAL_LODGING_TYPE.test(joined) && !OUTDOOR_LODGING_TYPE.test(joined)) return EXCLUSION.RENTAL;
  return null;
}
export const isExcluded = (p) => exclusionReason(p) !== null;

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_TYPE = /\b(car_repair|auto_repair|auto_parts|car_dealer|car_wash|gas_station|self_storage|storage|laundry|dry_clean|bank|atm|insurance_agency|real_estate_agency|lawyer|accounting|doctor|dentist|hospital|physiotherap|veterinary|plumber|electrician|roofing|general_contractor|moving_company|funeral_home|nail_salon|hair_salon|hair_care|beauty_salon|barber_shop|barber|tanning)\b/;

const FOOD_TYPE = /restaurant|_restaurant|\bfood\b|food_court|food_store|meal_takeaway|meal_delivery|\bcafe\b|cafeteria|coffee|espresso|bakery|bagel|sandwich|\bdeli\b|delicatessen|donut|doughnut|ice_cream|frozen_yogurt|gelato|dessert|confection|patisserie|creamery|pastry|butcher|greengrocer|grocery|supermarket|pizzeria|pizza|taqueria|\btaco|sushi|ramen|noodle|steak_house|barbecue|\bbbq\b|\bdiner\b|bistro|eatery|brasserie|gastropub|juice|smoothie|tea_house|bubble_tea|creperie|buffet/;
const NIGHTLIFE_TYPE = /night_club|nightclub|\bbar\b|_bar\b|\bpub\b|pub_|brewery|brewpub|taproom|tavern|wine_bar|cocktail|\blounge\b|speakeasy|distillery|karaoke|hookah|dance_club|beer_garden/;
const HOTEL_TYPE = /lodging|\bhotel|motel|resort_hotel|\bresort\b|guest_house|guesthouse|bed_and_breakfast|\bhostel\b|\binn\b|cottage|cabin|vacation_rental|extended_stay/;
const ACTIVITY_TYPE = /tourist_attraction|amusement|theme_park|water_park|aquarium|\bzoo\b|museum|art_gallery|\bpark\b|national_park|state_park|dog_park|nature_preserve|natural_feature|botanical|\bgarden\b|\btrail\b|hiking|\bbeach\b|marina|\bpier\b|boardwalk|landmark|historical|monument|memorial|stadium|\barena\b|theater|theatre|performing_arts|concert_hall|live_music_venue|music_venue|movie_theater|cinema|bowling|arcade|casino|winery|golf_course|\bgolf\b|playground|planetarium|science_museum|observation|event_venue|amphitheater|amphitheatre|fairground|recreation|\bgym\b|fitness_center|\bspa\b|wellness_center|fishing_charter|sports_club/;
const SPECIFIC_SHOP = /department_store|clothing_store|shoe_store|jewelry_store|\bbook_store\b|electronics_store|home_goods_store|furniture_store|sporting_goods_store|hardware_store|\bgift_shop\b|boutique|flea_market|shopping_mall|shopping_center|\boutlet\b|convenience_store|liquor_store|pet_store|toy_store|florist|home_improvement_store|bicycle_store|record_store|thrift|consignment|antique/;
const GENERIC_SHOP = /\bstore\b|\bshop\b|shop_|_shop\b|\bmall\b|marketplace|bazaar|emporium/;

// Google's OWN answer to "what is this place". Decisive when present.
function sectionFromPrimary(pt) {
  if (!pt) return null;
  if (/^(hotel|motel|resort_hotel|bed_and_breakfast|hostel|extended_stay_hotel|inn|guest_house)$/.test(pt)) return "Hotels";
  if (/^(campground|rv_park|camping_cabin)$/.test(pt)) return "Activities"; // outdoor lodging is an experience
  if (/(^|_)restaurant$|^(cafe|coffee_shop|bakery|deli|delicatessen|sandwich_shop|bagel_shop|donut_shop|ice_cream_shop|dessert_shop|diner|cafeteria|food_court|meal_takeaway|meal_delivery|steak_house|pizzeria|creamery|butcher_shop|juice_shop|tea_house|candy_store|chocolate_shop|grocery_store|supermarket|health_food_store|food_store|farmers_market|market)$/.test(pt)) return "Food";
  if (/^(bar|pub|night_club|nightclub|sports_bar|wine_bar|brewery|brewpub|taproom|tavern|beer_garden|distillery|cocktail_lounge|karaoke_bar|bar_and_grill|dance_hall)$/.test(pt)) return "Nightlife";
  if (/^(marina|beach|park|state_park|national_park|dog_park|museum|art_museum|history_museum|art_gallery|aquarium|zoo|botanical_garden|garden|amusement_park|water_park|tourist_attraction|historical_landmark|historical_place|monument|planetarium|performing_arts_theater|cultural_center|movie_theater|bowling_alley|video_arcade|casino|golf_course|miniature_golf_course|stadium|arena|event_venue|concert_hall|live_music_venue|hiking_area|wildlife_park|wildlife_refuge|nature_preserve|natural_feature|observation_deck|spa|wellness_center|gym|fitness_center|sports_activity_location|sports_club|fishing_charter|tour_agency|travel_agency|amphitheatre|amphitheater|playground|water_sports|scuba_diving_center|adventure_sports_center|farm|ranch|winery|vineyard)$/.test(pt)) return "Activities";
  if (/(_store|_shop)$|^(store|shop|shopping_mall|shopping_center|boutique|flea_market|outlet_store|department_store|warehouse_store|florist|thrift_store|antique_store)$/.test(pt)) return "Shopping";
  return null;
}

// The v6.15 type-list resolver — UNCHANGED, so live places (which carry no
// primaryType) behave exactly as they do today. Used only when primaryType is
// absent or unrecognised.
function sectionFromTypes(arr) {
  if (!arr.length) return null;
  const joined = " " + arr.join(" ") + " ";
  const has = (rx) => rx.test(joined);
  const strong = {
    Hotels: has(HOTEL_TYPE), Food: has(FOOD_TYPE), Nightlife: has(NIGHTLIFE_TYPE),
    Activities: has(ACTIVITY_TYPE), Shopping: has(SPECIFIC_SHOP),
  };
  const anyStrong = strong.Hotels || strong.Food || strong.Nightlife || strong.Activities || strong.Shopping;
  if (/\bcampground\b|\brv_park\b/.test(joined)) return "Activities";
  if (has(SERVICE_TYPE) && !anyStrong) return null;
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

// Name is the last-chance net for type-poor places (Google returns only
// point_of_interest/establishment for some famous beaches and gardens). It can
// FLAG, it must never silently decide — callers mark `via: "name"` rows
// needs_review (the seeder's rule, preserved from lib/placeTaxonomy.js).
function sectionFromName(name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return null;
  if (/\bbeach\b/.test(n)) return "Activities";
  if (/\baquarium\b|\bzoo\b|\bmuseum\b|\bgallery\b|\bplanetarium\b/.test(n)) return "Activities";
  if (/botanical|\bgardens?\b|\bpreserve\b|\bnature\s+(park|trail|center)\b/.test(n)) return "Activities";
  return null;
}

// The place's Wayfind section, or null when it carries no discovery identity.
// Back-compatible with v6.15 (lib/placeFilter.js and app/home.js call this).
export function primaryCategory(p) {
  if (isExcluded(p)) return null;
  return sectionFromPrimary(primaryOf(p)) || sectionFromTypes(typeTokens(p));
}

// A pure service business with no discovery identity. Kept for back-compat;
// prefer isExcluded(), which also covers residential and scraped rentals.
export function isServicePlace(p) {
  const arr = typeTokens(p);
  if (!arr.length) return false;
  return SERVICE_TYPE.test(" " + arr.join(" ") + " ") && primaryCategory(p) === null;
}

// Outdoor / daytime / nature identity — never after-dark Nightlife, whatever
// live music it happens to host.
const OUTDOOR_TYPE = /\bpark\b|national_park|state_park|dog_park|nature_preserve|natural_feature|botanical|\bgarden\b|\btrail\b|hiking|\bbeach\b|campground|playground|marina/;
export function isOutdoorNature(p) {
  const j = " " + typeTokens(p).join(" ") + " ";
  return OUTDOOR_TYPE.test(j) && !NIGHTLIFE_TYPE.test(j);
}

export function catOfType(x) {
  return primaryCategory({ types: [String(x || "")] });
}

// ── the specific identities that decide WHICH LIST a section lands in ───────
const isGrocery = (arr, pt) => /^(grocery_store|supermarket|health_food_store|food_store|farmers_market|market)$/.test(pt) || arr.some((t) => /^(grocery_store|supermarket|farmers_market)$/.test(t));

// A grocery/market has a FOOD identity but is not a place to eat. OWNER RULE
// (2026-07-14): findable under Shopping > Markets, never in "best places to eat".
// The gate (lib/placeFilter.js) uses this to keep Publix out of the food list.
export const isGroceryMarket = (p) => isGrocery(typeTokens(p), primaryOf(p));
const isMarina = (arr, pt) => pt === "marina" || (arr.includes("marina") && !pt);
const isRealBeach = (arr, name) => arr.includes("beach") || /\bbeach\b/i.test(String(name || ""));
const isCamp = (arr, pt) => /^(campground|rv_park|camping_cabin)$/.test(pt) || arr.some((t) => /^(campground|rv_park)$/.test(t));

// ═══════════════════════════════════════════════════════════════════════════
// classify — the ONE entry point. Returns everything a caller needs: the
// identity (section), the stored list (category), any SECOND list it also
// belongs in (secondary), its sub-filter tags, how it was decided (via), and
// whether it is excluded from Wayfind entirely.
// ═══════════════════════════════════════════════════════════════════════════
export function classify(input) {
  const p = Array.isArray(input) ? { types: input } : (input || {});
  const arr = typeTokens(p);
  const pt = primaryOf(p);
  const name = p.name || "";

  const reason = exclusionReason(p);
  if (reason) return { section: null, category: null, tags: [], secondary: [], via: null, excluded: true, reason };

  let via = null;
  let section = sectionFromPrimary(pt);
  if (section) via = "primaryType";
  if (!section) { section = sectionFromTypes(arr); if (section) via = "types"; }
  if (!section) { section = sectionFromName(name); if (section) via = "name"; }
  if (!section) return { section: null, category: null, tags: [], secondary: [], via: null, excluded: false, reason: null };

  const tags = [];
  const secondary = [];
  const add = (t) => { if (t && !tags.includes(t)) tags.push(t); };
  let category;
  // Tags must see primaryType too. A place whose only identity is its
  // primaryType (Google returns bare point_of_interest/establishment for many
  // galleries and museums) would otherwise resolve into the right section with
  // NO tags, and then match no sub-filter chip at all.
  const tt = pt ? arr.concat(pt) : arr;
  const hasType = (rx) => tt.some((t) => rx.test(t));

  if (section === "Hotels") category = "hotels";
  else if (section === "Nightlife") { category = "nightlife"; if (hasType(/bar|pub|tavern|brewery|taproom|beer_garden/)) add("bars"); if (hasType(/night_club/)) add("clubs"); if (hasType(/karaoke/)) add("karaoke"); }
  else if (section === "Food") {
    // OWNER RULE: grocery/markets are findable under Shopping > Markets, and are
    // kept OUT of "best places to eat". Their IDENTITY stays Food (that is what
    // keeps them out of Shopping "All" via placeFilter's crossVeto) but their
    // stored LIST is shopping.
    if (isGrocery(arr, pt)) { category = "shopping"; add("markets"); }
    else {
      category = "food";
      if (hasType(/breakfast_restaurant|brunch_restaurant|bagel_shop/)) add("breakfast");
      if (hasType(/bakery|ice_cream_shop|dessert_shop|donut_shop|chocolate_shop|candy_store|creamery/)) add("dessert");
      if (hasType(/fast_food_restaurant|meal_takeaway|sandwich_shop|food_court|hamburger_restaurant/)) add("quickbites");
    }
  } else if (section === "Shopping") {
    category = "shopping";
    if (hasType(/shopping_mall/) || /\bmall\b/i.test(name)) add("malls");
    if (hasType(/flea_market|market/)) add("markets");
    if (hasType(/outlet/) || /\boutlet\b/i.test(name)) add("outlets");
    if (hasType(/boutique/)) add("boutiques");
  } else { // Activities
    if (isRealBeach(arr, name)) {
      // The `beach` list has exactly ONE sub-filter (beaches). Emitting an
      // attractions tag here (outdoors/family/…) would produce a tag that
      // matches no chip in this category — the read path pairs tags to chips by
      // equality, so an out-of-vocabulary tag is silently dead weight.
      return { section, category: "beach", tags: ["beaches"], secondary: [], via, excluded: false, reason: null };
    }
    if (isMarina(arr, pt)) { category = "attractions"; add("marinas"); } // on-the-water, NOT a beach
    else category = "attractions";
    if (isCamp(arr, pt)) {
      // OWNER RULE: a campground/RV resort is BOTH an outdoor experience and a
      // real place to stay tonight. It lives in attractions and ALSO serves the
      // hotels list via secondary_categories.
      category = "attractions";
      secondary.push("hotels");
      add("outdoors");
    }
    if (hasType(/museum|planetarium/) || /\bmuseum\b/i.test(name)) add("museums");
    if (hasType(/art_gallery|performing_arts_theater|cultural_center|theater|theatre/)) add("arts");
    if (hasType(/\bpark\b|botanical|garden|hiking_area|natural_feature|nature_preserve|trail/)) add("outdoors");
    if (hasType(/aquarium|zoo|amusement_park|water_park|wildlife_park|playground/)) add("family");
    if (hasType(/^(spa|wellness_center|sauna|massage)$/)) add("spa");
    if (hasType(/historical_landmark|historical_place|monument/)) add("landmarks");
    if (hasType(/tour_agency|travel_agency|fishing_charter/)) add("tours");
  }

  return { section, category, tags, secondary, via, excluded: false, reason: null };
}
