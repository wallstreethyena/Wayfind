// lib/placeFilter.js — THE single source of truth for what may appear in
// Wayfind discovery results. v4.94, born from a trust failure: a nail salon
// ranked #1 under "Museums", HVAC companies appeared in Things to do, and
// eyeglass stores on Beach day. Every result path — primary search, backfill,
// experiences, composites, and every source (Google, Foursquare, NPS, RIDB,
// OSM) — must call placeAllowed() before ranking. If a code path skips this
// module, THAT is the bug. The check-gate build guardrail imports this file
// directly and fails the build if junk passes or legit places are killed.
//
// Deliberately dependency-free so the build gate can execute it standalone.
//
// Three layers, in order:
//   1. SERVICE blocklist — home/professional/personal services never appear
//      in discovery, in ANY category (aggressive by product direction).
//   2. Category allowlists — Beach day and Things to do must only surface
//      what their names promise.
//   3. Sub-filter allowlists — Museums must be museums, Tours must be tours.
//      A place that survives the category gate still fails here if it does
//      not match the sub-filter the user actually tapped.

import { primaryCategory, isServicePlace, isExcluded, isGroceryMarket, isOutdoorNature, CATEGORY_SECTION } from "./placeCategory.js";

export const SERVICE_RX = /\b(moving|storage|heating|cooling|hvac|air condition|plumb|roofing|roofer|roof (repair|replacement|cleaning|coating)|septic|pest control|exterminat|insurance|realty|real estate|law firm|law office|attorney|paralegal|notary|bank|credit union|eyeglass|eye ?glass|eye ?wear|contacts? (&|and) eye|contact lens|optical|optometr|optician|vision (center|works|source|care)|lasik|dentist|dental|orthodont|urgent care|clinic|hospital|dialysis|chiropract|physical therapy|veterinar|animal hospital|auto repair|auto body|collision|car wash|oil change|tire shop|transmission|towing|locksmith|tax service|accounting|payroll|staffing|funeral|cremat|dry clean|laundromat|self storage|u ?haul|pawn|phone repair|mattress|carpet|flooring|granite|cabinet|window tint|solar|landscap|lawn care|tree service|pressure wash|gutter|fence|garage door|pool service|pool cleaning|water treatment|propane|title loan|check cashing|bail bond|recycling|nursery\b|garden center|outdoor (kitchen|cabinet|furniture|solution|care|service|living)s?|pools? (builder|contractor|design|install|service)|screen enclosure|paver|hardscap|irrigation|sprinkler|scrap (metal|yard)|salvage yard|junkyard|metal recycling|waste (management|disposal)|landfill|sanitation|wholesale|distribution center|fulfillment center|nail salon|nails? (&|and) spa|nail spa|nail bar|hair salon|hair studio|barber|beauty salon|beauty supply|tanning|waxing|lash (studio|bar)|brow bar|supercuts|great clips|parking|park.{0,4}(n|and|&).{0,4}ride)\b/i;

export const SERVICE_TYPES_RX = /moving_company|storage|electrician|plumber|roofing|general_contractor|painter\b|locksmith|car_repair|car_wash|car_dealer|gas_station|insurance|lawyer|real_estate|\bbank\b|\batm\b|accounting|dentist|dental|doctor|physiotherapist|veterinary|hospital|pharmacy|drugstore|funeral|laundry|courthouse|local_government|post_office|police|fire_station|primary_school|secondary_school|cemetery|medical_lab|optician|optometrist|beauty_salon|hair_care|nail_salon|barber_shop|health_and_beauty|tanning_salon|eyecare_store|tobacco_store|construction_supplies|business_service|swimming_pool_maintenance|skin_care_clinic|medical_center|furniture_store|home_goods_store|hardware_store|plant_nursery|garden_center|home_improvement|\bparking\b|park_and_ride/;

export const CAT_ALLOW = {
  // v4.95: EVERY category now has a types-first allowlist ("America's Best
  // Contacts & Eye Glasses" ranked #1 in Food — a blocklist alone can't keep
  // up with creative names; the category must positively look like what the
  // user asked for). Word lists are generous because Foursquare/NPS/RIDB
  // types are derived from human category names, not Google enums.
  food: /restaurant|food|cafe|coffee|bakery|\bbar\b|pub\b|brewery|breweries|brewing|brewhouse|winery|distillery|pizzeria|pizza|taco|taqueria|bbq|barbecue|grill|diner|deli|ice_cream|ice cream|gelato|dessert|donut|doughnut|bagel|sandwich|burger|chicken|seafood|sushi|steak|buffet|bistro|eatery|kitchen|cantina|creperie|juice|smoothie|tea ?house|boba|brunch|(?<!and[_ ])breakfast|meal_|food_truck|food truck|market|gastropub|noodle|ramen|pho\b|thai|mexican|italian|chinese|indian|cuban|caribbean|mediterranean|greek|japanese|korean|vietnamese|wings|pancake|waffle|creamery|cheesecake|taproom|tavern|ale ?house|oyster|crab|fish/i,
  nightlife: /\bbar\b|pub\b|night_club|nightclub|lounge|brewery|breweries|brewing|brewhouse|taproom|tavern|speakeasy|cocktail|wine|karaoke|billiard|pool hall|comedy|live music|music venue|club\b|distillery|ale ?house|saloon|cigar|hookah|dance|dive_bar|sports_bar|gastropub|restaurant|casino/i,
  hotels: /lodging|hotel|motel|resort|\binn\b|suites|bed.{0,5}breakfast|bed and breakfast|guest_house|guesthouse|vacation rental|campground|rv_park|villa|bungalow|boutique hotel|extended stay/i,
  shopping: /store|shop\b|shopping|mall|market|boutique|outlet|plaza|antique|thrift|vintage|consignment|bookstore|book_store|gift|souvenir|jewel|clothing|apparel|surf|record|toy|art suppl|florist|farmers|bazaar|emporium|gallery|department_store|grocery|gourmet/i,
  beach: /beach|park|pier|marina|waterfront|boardwalk|\bbay\b|coast|shore|island|preserve|cove|lagoon|kayak|paddle|boat|sail|surf|snorkel|dive|tiki|dock|inlet|\bkey\b|sandbar/i,
  // v6.28 — FAMILY: family-appropriate activity types + names. Deliberately NO
  // bare "restaurant"/"bar" here (the family:adults SUB_ALLOW handles dining);
  // CAT_EXCLUDE.family keeps nightlife/adult-only out of the general family view.
  family: /tourist_attraction|amusement|theme_park|water_park|aquarium|\bzoo\b|museum|childrens|children|\bpark\b|garden|playground|splash|carousel|petting|\bfarm\b|orchard|arcade|trampoline|mini.?golf|bowling|go.?kart|\bkart\b|laser ?tag|skat|climb|candy|sweet|ice_cream|toy_store|\btoy\b|plush|library|science|planetarium|nature|wildlife|aviary|escape ?room|entertainment|recreation|family|\bkids?\b|beach|fun.?center|activity/i,
  attractions: /tourist_attraction|amusement|theme_park|water_park|aquarium|zoo|museum|art_gallery|gallery|park|garden|trail|preserve|beach|marina|pier|boardwalk|landmark|histor|monument|stadium|arena|theater|theatre|cinema|movie|bowling|arcade|escape|mini.?golf|golf|go.?kart|\bkart|skat|climb|trampoline|paintball|axe|laser tag|casino|winery|brewery|distillery|\bfarm\b|orchard|ranch|\bspa\b|wellness|tour\b|cruise|airboat|kayak|paddle|charter|playground|splash|observat|planetarium|science|cultural|performing|music venue|festival|fairground|circus|attraction|recreation|entertainment|night_club|event_venue|national_memorial|point_of_interest_landmark/i,
};

// v4.96 — per-category EXCLUDE lists. The "Bed & Breakfast" lesson: the
// query "best breakfast" text-matches B&B LODGINGS, and an allowlist that
// tests names lets them through because the name contains "breakfast".
// These run against structured TYPES first and veto outright — a place
// typed as lodging can never be a Food result, typed as office/industrial
// can never be discovery anywhere.
export const CAT_EXCLUDE = {
  food: /lodging|bed.{0,5}breakfast|hotel\b|motel|resort\b|campground|rv_park|hostel|\boffice\b|recycling|scrap|salvage|junkyard|warehouse|wholesale|distribution|manufactur|industrial|logistics|coworking|headquarters|apartment|condominium/i,
  nightlife: /lodging|bed.{0,5}breakfast|motel|campground|rv_park|hostel|\boffice\b|recycling|scrap|salvage|junkyard|warehouse|wholesale|distribution|manufactur|industrial|logistics|coworking|headquarters|apartment|condominium/i,
  hotels: /\boffice\b|recycling|scrap|salvage|warehouse|wholesale|distribution|manufactur|industrial|apartment_complex/i,
  shopping: /recycling|scrap|salvage|junkyard|wholesale|distribution|manufactur|industrial|\boffice\b|apartment|lodging|hotel\b/i,
  attractions: /\boffice\b|recycling|scrap|salvage|junkyard|warehouse|wholesale|distribution|manufactur|industrial|apartment|condominium/i,
  beach: /\boffice\b|recycling|scrap|salvage|junkyard|warehouse|wholesale|distribution|manufactur|industrial|apartment|condominium/i,
  // v6.28 — FAMILY: adult-only / nightlife are never a general family result.
  // (The family:adults sub-filter surfaces kid-welcome dining via its own
  // SUB_ALLOW; a bare bar/club still can't lead the family tab.)
  family: /night_club|nightclub|\bcocktail\b|hookah|\bcasino\b|liquor_store|smoke ?shop|vape|adult|strip club|\boffice\b|recycling|scrap|salvage|junkyard|warehouse|wholesale|distribution|manufactur|industrial|apartment|condominium/i,
};

// Sub-filter contracts: "categoryId:subId" -> what the tapped chip promises.
export const SUB_ALLOW = {
  // v6.34 — FOOD > Cafés (owner ask): EXCLUSIVELY cafés. A place passes only on
  // a coffee-forward identity (type or name); breakfast diners and plain
  // restaurants fail the contract even when the "best cafes" query returns them.
  "food:cafes": /\bcafe\b|café|coffee_shop|coffeehouse|\bcoffee\b|espresso|roaster|roastery|tea_house|tea ?room|bakery ?cafe|brew ?bar/i,
  "attractions:museums": /museum|gallery|art_gallery|exhibit|planetarium|science center|histor|heritage|memorial|collection/i,
  "attractions:tours": /\btour|cruise|charter|sightseeing|airboat|kayak|paddle|boat|excursion|safari|trolley|segway|tasting|expedition/i,
  "attractions:outdoors": /park|trail|preserve|garden|beach|nature|outdoor|marina|pier|boardwalk|kayak|paddle|springs|river|island/i,
  "attractions:landmarks": /landmark|monument|histor|memorial|bridge|lighthouse|tower|statue|pier|plaza|district|heritage|national_|archaeolog|state_park/i,
  "attractions:arts": /art|gallery|theater|theatre|performing|studio|mural|opera|ballet|symphony|playhouse|cinema/i,
  "attractions:spa": /\bspa\b|wellness|massage|sauna|salt (room|cave)|float|bathhouse|hammam/i,
  "attractions:family": /park|zoo|aquarium|museum|playground|mini.?golf|arcade|bowling|trampoline|family|kids|splash|petting|carousel|train ride|railroad|science|skating|garden|arboretum|amusement|escape|wildlife|aviary|nature|preserve|beach|library/i,
  // v6.28 — FAMILY sub-filters, age-targeted so only appropriate places appear.
  // Toddlers (1–3): gentle + safe — deliberately EXCLUDES high-intensity venues
  // (trampoline/go-kart/laser tag/climb) by simply not listing them here.
  "family:toddlers": /playground|childrens_museum|children.?s? ?museum|splash|petting|carousel|aquarium|\bfarm\b|botanical|\bgarden\b|library|story ?time|nature|preserve|\bpark\b|\bzoo\b|kiddie|toddler|sensory|play ?cafe|indoor ?play|train ride|railroad|aviary|wildlife|arboretum/i,
  // Kids: maximum joy — arcades, trampoline parks, candy, mini-golf, etc.
  "family:kids": /arcade|trampoline|mini.?golf|go.?kart|\bkart\b|laser ?tag|bowling|water_park|amusement|theme_park|candy|sweet ?shop|ice_cream|toy_store|\btoy\b|plush|skat|climb|escape ?room|fun.?center|entertainment|carousel|\bzoo\b|aquarium|paintball|batting ?cage|karaoke|roller/i,
  // Grown-ups too: kid-WELCOME dining where a couple can relax with kids along.
  "family:adults": /restaurant|\bcafe\b|coffee|brewery|brew ?pub|pizzeria|pizza|\bdiner\b|grill|bbq|barbecue|taqueria|\btaco|burger|ice_cream|bakery|creamery|eatery|kitchen|bistro|gastropub|food/i,
  // Rainy day: indoor family options.
  "family:rainy": /museum|aquarium|arcade|trampoline|bowling|indoor|play ?cafe|planetarium|science|climb|escape ?room|cinema|movie|library|childrens/i,
  "beach:beaches": /beach|\bkey\b|shore|coast|sandbar|island/i,
  // v6.34 — owner ask: Things-to-do gets a dedicated Beaches sub. Same
  // beaches-only contract; a marina is still not a beach (v6.16).
  "attractions:beaches": /beach|\bkey\b|shore|coast|sandbar|island/i,
  // v6.16: on-the-water lives under attractions now (a marina is not a beach).
  // The beach:marinas key is kept so any deep link or saved URL still resolves.
  "attractions:marinas": /marina|boat|dock|yacht|harbor|harbour|sail|charter/i,
  "beach:marinas": /marina|boat|dock|yacht|harbor|harbour|sail|charter/i,
  // v5.06: the dead beach:parking / beach:giftshops contracts left with their
  // chips (v4.97) — and parking lots are now SERVICE-blocked outright:
  // "Coquina Beach Parking" (4.9 stars — people love free parking) ranked #4
  // under Beach day because its NAME contains "beach". A parking lot is never
  // a discovery destination, whatever it is named or how well it is rated.
};

// The one gate. v4.96 GLOBAL RULE — types are the truth, names lie:
// every Wayfind query starts with "best …", so businesses NAMED "Best X"
// (Best Metal Recycling, Best Aunt Ever Office) keyword-match every
// category, and "best breakfast" matches "Bed and Breakfast" lodgings.
// Order of judgment:
//   1. Service blocklist (types + name) — never in discovery, anywhere.
//   2. Category EXCLUDE on structured TYPES — typed as lodging/office/
//      industrial? Vetoed for this category outright, whatever the name says.
//   3. Allowlist on structured TYPES — typed as what the user asked for? In.
//   4. Only when types carry no signal does the NAME get a vote, and then it
//      must both look right (allowlist) and not look wrong (exclude list).
// categoryId/subId may be null/"all" — then only the blocklists apply.
// v4.96b — live-data lesson: legit places carry poisonous SECONDARY types
// (a marina lists "storage", a day spa lists "beauty_salon", a gallery lists
// "painter", a zoo lists "veterinary_care"). Judgment order matters:
//   1. A service-business NAME is disqualifying everywhere (nail salon, HVAC,
//      movers — names of service shops are reliable).
//   2. A place TYPED as what the user asked for IS that thing — the positive
//      structured identity wins; incidental secondary types don't veto it.
//   3. Only places with NO allow-type identity face the type blocklists.
//   4. A place with no type signal at all lives or dies by its name: it must
//      look right and not look wrong.
// v6.15 GLOBAL RULE — a place only appears in a category whose IDENTITY it
// shares. Surgical cross-category veto: only the confirmed contamination
// directions, so a legit dual-identity place (a gastropub that is both Food
// and Nightlife) still passes.
function crossVeto(categoryId, subId, p, primary) {
  // v6.16 OWNER RULE: a grocery store's identity IS Food, but it is not a place
  // to eat. Publix, Wawa and Whole Foods are findable under Shopping > Markets
  // and never in "best places to eat nearby".
  if (categoryId === "food" && isGroceryMarket(p)) return true;
  if (categoryId === "shopping") {
    // The dedicated Markets sub-tab is where farm/grocery/gourmet markets
    // belong (owner rule: keep them OUT of "All", surface them under Markets).
    // Everywhere else in Shopping, a food identity is contamination.
    if (subId === "markets") return primary === "Nightlife" || primary === "Hotels";
    return primary === "Food" || primary === "Nightlife" || primary === "Hotels" || primary === "Activities" || isOutdoorNature(p);
  }
  if (categoryId === "nightlife") return isOutdoorNature(p) || primary === "Shopping" || primary === "Hotels";
  if (categoryId === "hotels") return primary === "Food" || primary === "Nightlife" || primary === "Shopping";
  return false;
}

export function placeAllowed(categoryId, subId, p) {
  if (!p || !p.name) return false;
  const types = ((p.types || []).join(" ")).toLowerCase();
  const name = String(p.name).toLowerCase();
  if (SERVICE_RX.test(name)) return false;
  // v6.15: identity-first gating, BEFORE the allow-admit — a pure service is
  // never a discovery result, and a place whose primary section is a different
  // commercial category can't cross-contaminate this list (cafe/auto/grocery ->
  // Shopping, outdoor/nature -> Nightlife). Stops the stray "store"/"music
  // venue" type from sneaking a place into the wrong section.
  //
  // v6.16 — THE HOLE THIS CLOSES: isServicePlace() only vetoed a service business
  // with NO other strong identity. A general_contractor that also carried
  // `home_goods_store` kept anyStrong=true, sailed past the veto, and then matched
  // CAT_ALLOW.shopping (because "home_goods_store" contains the substring "store")
  // at the early-return below — BEFORE SERVICE_TYPES_RX was ever consulted. Result,
  // measured against the live 1,027-row inventory: 44 of 48 service-typed rows and
  // 18 of 18 residential rows were ADMITTED. A parking lot ("Park Store Go") was in
  // Hotels; a car dealership was in Things-To-Do; a construction company was in
  // Shopping. isExcluded() is the identity-first veto that actually holds:
  // service/trade, residential/parking, and scraped short-term rentals.
  if (isExcluded(p)) return false;
  const _primary = primaryCategory(p);
  if (categoryId && crossVeto(categoryId, subId, p, _primary)) return false;
  // v6.28 — Family > Toddlers (ages 1–3): safety veto. High-intensity venues are
  // excluded even when their NAME contains a gentle word ("trampoline park",
  // "water park") — a 1–3-year-old can't do a trampoline park or go-karts.
  if (categoryId === "family" && subId === "toddlers") {
    const j = name + " " + types;
    if (/trampoline|go.?kart|\bkart\b|laser ?tag|paintball|amusement_center|water_?park|water ?park|skate|\bclimb|zip.?line|batting ?cage|arcade|roller ?rink|escape ?room/i.test(j)) return false;
  }
  // v6.18 GLOBAL RULE — a meal filter keeps its promise. A bar / pub / martini
  // lounge / brewery is not a Breakfast (or Dessert) destination unless it
  // genuinely serves that meal. This stops the exact live offender: an Irish
  // pub & martini bar ranked #1 under "Breakfast" in Bradenton. Signal-based
  // (name + types) so it holds no matter which order Google lists the types.
  // Bars still appear under Food·All and Dinner, where they belong.
  if (categoryId === "food" && (subId === "breakfast" || subId === "dessert")) {
    const j = name + " " + types;
    const barSignal = /night_?club|\bbar\b|_bar\b|\bpub\b|martini|cocktail|tavern|saloon|speakeasy|hookah|brewery|brew ?pub|distillery|taproom|\blounge\b/i.test(j);
    const mealSignal = subId === "breakfast"
      ? /breakfast|brunch|\bcafe\b|café|coffee|espresso|bakery|bagel|donut|doughnut|pancake|waffle|\bdiner\b|biscuit|creperie|crepe|omelet|\begg/i.test(j)
      : /dessert|bakery|ice[ _]?cream|gelato|frozen[ _]?yogurt|froyo|creamery|cupcake|patisserie|pastry|chocolate|candy|confection|cheesecake|donut|doughnut|custard|creperie/i.test(j);
    if (barSignal && !mealSignal) return false;
  }
  const allow = (categoryId && subId && subId !== "all" && SUB_ALLOW[categoryId + ":" + subId]) || (categoryId && CAT_ALLOW[categoryId]) || null;
  if (allow && allow.test(types)) return true;
  if (SERVICE_TYPES_RX.test(types) || SERVICE_RX.test(types)) return false;
  const ex = categoryId ? CAT_EXCLUDE[categoryId] : null;
  if (ex && ex.test(types)) return false;
  if (!allow) return !(ex && ex.test(name));
  return allow.test(name) && !(ex && ex.test(name));
}
