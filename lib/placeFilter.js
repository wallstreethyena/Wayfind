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

export const SERVICE_RX = /\b(moving|storage|heating|cooling|hvac|air condition|plumb|roof|septic|pest control|exterminat|insurance|realty|real estate|law firm|law office|attorney|paralegal|notary|bank|credit union|eyeglass|optical|optometr|vision center|lasik|dentist|dental|orthodont|urgent care|clinic|hospital|dialysis|chiropract|physical therapy|veterinar|animal hospital|auto repair|auto body|collision|car wash|oil change|tire shop|transmission|towing|locksmith|tax service|accounting|payroll|staffing|funeral|cremat|dry clean|laundromat|self storage|u ?haul|pawn|phone repair|mattress|carpet|flooring|granite|cabinet|window tint|solar|landscap|lawn care|tree service|pressure wash|gutter|fence|garage door|pool service|pool cleaning|water treatment|propane|title loan|check cashing|bail bond|nail salon|nails? (&|and) spa|nail spa|nail bar|hair salon|hair studio|barber|beauty salon|beauty supply|tanning|waxing|lash (studio|bar)|brow bar|supercuts|great clips)\b/i;

export const SERVICE_TYPES_RX = /moving_company|storage|electrician|plumber|roofing|general_contractor|painter\b|locksmith|car_repair|car_wash|car_dealer|gas_station|insurance|lawyer|real_estate|\bbank\b|\batm\b|accounting|dentist|dental|doctor|physiotherapist|veterinary|hospital|pharmacy|drugstore|funeral|laundry|courthouse|local_government|post_office|police|fire_station|primary_school|secondary_school|cemetery|medical_lab|optician|optometrist|beauty_salon|hair_care|nail_salon|barber_shop/;

export const CAT_ALLOW = {
  beach: /beach|park|pier|marina|waterfront|boardwalk|\bbay\b|coast|shore|island|preserve|cove|lagoon|kayak|paddle|boat|sail|surf|snorkel|dive|tiki|dock|inlet|\bkey\b|sandbar/i,
  attractions: /tourist_attraction|amusement|theme_park|water_park|aquarium|zoo|museum|art_gallery|gallery|park|garden|trail|preserve|beach|marina|pier|boardwalk|landmark|histor|monument|stadium|arena|theater|theatre|cinema|movie|bowling|arcade|escape|mini.?golf|golf|go.?kart|\bkart|skat|climb|trampoline|paintball|axe|laser tag|casino|winery|brewery|distillery|\bfarm\b|orchard|ranch|\bspa\b|wellness|tour\b|cruise|airboat|kayak|paddle|charter|playground|splash|observat|planetarium|science|cultural|performing|music venue|festival|fairground|attraction|recreation|entertainment|night_club|event_venue|national_memorial|point_of_interest_landmark/i,
};

// Sub-filter contracts: "categoryId:subId" -> what the tapped chip promises.
export const SUB_ALLOW = {
  "attractions:museums": /museum|gallery|art_gallery|exhibit|planetarium|science center|histor|heritage|memorial|collection/i,
  "attractions:tours": /\btour|cruise|charter|sightseeing|airboat|kayak|paddle|boat|excursion|safari|trolley|segway|tasting|expedition/i,
  "attractions:outdoors": /park|trail|preserve|garden|beach|nature|outdoor|marina|pier|boardwalk|kayak|paddle|springs|river|island/i,
  "attractions:landmarks": /landmark|monument|histor|memorial|bridge|lighthouse|tower|statue|pier|plaza|district|heritage|national_/i,
  "attractions:arts": /art|gallery|theater|theatre|performing|studio|mural|opera|ballet|symphony|playhouse|cinema/i,
  "attractions:spa": /\bspa\b|wellness|massage|sauna|salt (room|cave)|float|bathhouse|hammam/i,
  "attractions:family": /park|zoo|aquarium|museum|playground|mini.?golf|arcade|bowling|trampoline|family|kids|splash|petting|carousel|train ride|railroad|science|skating/i,
  "beach:beaches": /beach|\bkey\b|shore|coast|sandbar|island/i,
  "beach:marinas": /marina|boat|dock|yacht|harbor|harbour|sail|charter/i,
  "beach:parking": /parking|garage|\blot\b/i,
  "beach:giftshops": /gift|souvenir|shop|boutique|surf|beach store/i,
};

// The one gate. categoryId/subId may be null/"all" — then only the service
// blocklist applies (used by composites and generic pools). `p` needs only
// { name, types? }.
export function placeAllowed(categoryId, subId, p) {
  if (!p || !p.name) return false;
  const hay = (((p.types || []).join(" ")) + " " + p.name).toLowerCase();
  if (SERVICE_TYPES_RX.test(hay) || SERVICE_RX.test(hay)) return false;
  if (categoryId && subId && subId !== "all") {
    const sub = SUB_ALLOW[categoryId + ":" + subId];
    if (sub) return sub.test(hay);
  }
  if (categoryId && CAT_ALLOW[categoryId]) return CAT_ALLOW[categoryId].test(hay);
  return true;
}
