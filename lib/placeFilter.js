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

export const SERVICE_RX = /\b(moving|storage|heating|cooling|hvac|air condition|plumb|roofing|roofer|roof (repair|replacement|cleaning|coating)|septic|pest control|exterminat|insurance|realty|real estate|law firm|law office|attorney|paralegal|notary|bank|credit union|eyeglass|eye ?glass|eye ?wear|contacts? (&|and) eye|contact lens|optical|optometr|optician|vision (center|works|source|care)|lasik|dentist|dental|orthodont|urgent care|clinic|hospital|dialysis|chiropract|physical therapy|veterinar|animal hospital|auto repair|auto body|collision|car wash|oil change|tire shop|transmission|towing|locksmith|tax service|accounting|payroll|staffing|funeral|cremat|dry clean|laundromat|self storage|u ?haul|pawn|phone repair|mattress|carpet|flooring|granite|cabinet|window tint|solar|landscap|lawn care|tree service|pressure wash|gutter|fence|garage door|pool service|pool cleaning|water treatment|propane|title loan|check cashing|bail bond|recycling|scrap (metal|yard)|salvage yard|junkyard|metal recycling|waste (management|disposal)|landfill|sanitation|wholesale|distribution center|fulfillment center|nail salon|nails? (&|and) spa|nail spa|nail bar|hair salon|hair studio|barber|beauty salon|beauty supply|tanning|waxing|lash (studio|bar)|brow bar|supercuts|great clips)\b/i;

export const SERVICE_TYPES_RX = /moving_company|storage|electrician|plumber|roofing|general_contractor|painter\b|locksmith|car_repair|car_wash|car_dealer|gas_station|insurance|lawyer|real_estate|\bbank\b|\batm\b|accounting|dentist|dental|doctor|physiotherapist|veterinary|hospital|pharmacy|drugstore|funeral|laundry|courthouse|local_government|post_office|police|fire_station|primary_school|secondary_school|cemetery|medical_lab|optician|optometrist|beauty_salon|hair_care|nail_salon|barber_shop|health_and_beauty|tanning_salon|eyecare_store|tobacco_store|construction_supplies|business_service|swimming_pool_maintenance|skin_care_clinic|medical_center/;

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
};

// Sub-filter contracts: "categoryId:subId" -> what the tapped chip promises.
export const SUB_ALLOW = {
  "attractions:museums": /museum|gallery|art_gallery|exhibit|planetarium|science center|histor|heritage|memorial|collection/i,
  "attractions:tours": /\btour|cruise|charter|sightseeing|airboat|kayak|paddle|boat|excursion|safari|trolley|segway|tasting|expedition/i,
  "attractions:outdoors": /park|trail|preserve|garden|beach|nature|outdoor|marina|pier|boardwalk|kayak|paddle|springs|river|island/i,
  "attractions:landmarks": /landmark|monument|histor|memorial|bridge|lighthouse|tower|statue|pier|plaza|district|heritage|national_|archaeolog|state_park/i,
  "attractions:arts": /art|gallery|theater|theatre|performing|studio|mural|opera|ballet|symphony|playhouse|cinema/i,
  "attractions:spa": /\bspa\b|wellness|massage|sauna|salt (room|cave)|float|bathhouse|hammam/i,
  "attractions:family": /park|zoo|aquarium|museum|playground|mini.?golf|arcade|bowling|trampoline|family|kids|splash|petting|carousel|train ride|railroad|science|skating|garden|arboretum|amusement|escape|wildlife|aviary|nature|preserve|beach|library/i,
  "beach:beaches": /beach|\bkey\b|shore|coast|sandbar|island/i,
  "beach:marinas": /marina|boat|dock|yacht|harbor|harbour|sail|charter/i,
  "beach:parking": /parking|garage|\blot\b/i,
  "beach:giftshops": /gift|souvenir|shop|boutique|surf|beach store/i,
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
export function placeAllowed(categoryId, subId, p) {
  if (!p || !p.name) return false;
  const types = ((p.types || []).join(" ")).toLowerCase();
  const name = String(p.name).toLowerCase();
  if (SERVICE_RX.test(name)) return false;
  const allow = (categoryId && subId && subId !== "all" && SUB_ALLOW[categoryId + ":" + subId]) || (categoryId && CAT_ALLOW[categoryId]) || null;
  if (allow && allow.test(types)) return true;
  if (SERVICE_TYPES_RX.test(types) || SERVICE_RX.test(types)) return false;
  const ex = categoryId ? CAT_EXCLUDE[categoryId] : null;
  if (ex && ex.test(types)) return false;
  if (!allow) return !(ex && ex.test(name));
  return allow.test(name) && !(ex && ex.test(name));
}
