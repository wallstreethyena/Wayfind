// Pure family-day rail identity. Venue identity may use Google types and a
// narrow name fallback; planning facts come only from familyDayEvidence.
import { familyFilterFacts } from "./familyDayEvidence.js";

export const FAMILY_DAY_RAILS = Object.freeze([
  { id: "beach", title: "Beach Days", description: "Sand, shore and a day on Florida's coast.", cats: ["beach"] },
  { id: "attractions", title: "Theme Parks & Attractions", description: "Theme parks, rides and destination attractions.", cats: ["attractions"] },
  { id: "water", title: "Water Fun", description: "Water parks, splash pads and places built for swimming.", cats: ["attractions"] },
  { id: "animals", title: "Animals & Aquariums", description: "Aquariums, zoos and wildlife attractions.", cats: ["attractions"] },
  { id: "outdoors", title: "Outdoors & Wildlife", description: "Parks, gardens, trails and nature preserves.", cats: ["attractions"] },
  { id: "indoor", title: "Museums & Indoor Play", description: "Museums and places specifically built for indoor play.", cats: ["attractions"] },
  { id: "space", title: "Space & Big Learning", description: "Space centers, planetariums and science destinations.", cats: ["attractions"] },
  { id: "active", title: "Sports, Games & Active Fun", description: "Bowling, mini golf, skating and hands-on activity venues.", cats: ["attractions"] },
  { id: "culture", title: "Events, Culture & History", description: "Performances, cultural sites, history and family events.", cats: ["attractions"] },
  { id: "food", title: "Family Food & Entertainment", description: "Food halls, markets, desserts and dining built into the outing.", cats: ["food", "shopping", "attractions"] },
]);

const RAIL_IDS = new Set(FAMILY_DAY_RAILS.map((rail) => rail.id));
const GENERIC_TYPES = new Set(["tourist_attraction", "point_of_interest", "establishment", "premise"]);
const WEATHER_SAFE_PRIMARY_TYPES = new Set([
  "art_museum", "bowling_alley", "childrens_museum", "indoor_playground",
  "planetarium", "science_museum", "video_arcade",
]);

const EXACT = {
  beach: new Set(["beach"]),
  attractions: new Set(["theme_park", "amusement_park", "roller_coaster"]),
  water: new Set(["water_park", "aquatic_center", "public_swimming_pool", "swimming_pool", "splash_pad"]),
  animals: new Set(["aquarium", "zoo", "animal_park", "wildlife_park", "wildlife_refuge"]),
  outdoors: new Set(["park", "city_park", "state_park", "national_park", "nature_preserve", "hiking_area", "botanical_garden", "arboretum"]),
  indoor: new Set(["museum", "art_museum", "childrens_museum", "amusement_center", "indoor_playground", "video_arcade"]),
  space: new Set(["planetarium", "observatory", "science_museum", "space_center"]),
  active: new Set(["bowling_alley", "miniature_golf_course", "go_kart_track", "trampoline_park", "skating_rink", "sports_complex", "sports_activity_location", "stadium", "adventure_sports_center"]),
  culture: new Set(["cultural_center", "historical_landmark", "history_museum", "performing_arts_theater"]),
  food: new Set(["food_court", "farmers_market", "ice_cream_shop", "dessert_shop", "candy_store", "dinner_theater", "family_entertainment_center"]),
};

const NAMES = {
  beach: /\b(beach|public beach|beach access)\b/i,
  attractions: /\b(theme park|amusement park)\b/i,
  water: /\b(water park|aquatic center|splash pad)\b/i,
  animals: /\b(aquarium|zoo|animal park|wildlife park|jungle gardens)\b/i,
  outdoors: /\b(nature preserve|state park|national park|botanical gardens?|arboretum|hiking trail)\b/i,
  indoor: /\b(children'?s museum|indoor playground|indoor play|family fun center|arcade)\b/i,
  space: /\b(space center|space museum|planetarium|observatory|science (center|museum)|museum of science)\b/i,
  active: /\b(bowling|mini(ature)? golf|go[ -]?karts?|trampoline|skating rink|sports complex|adventure course|escape room)\b/i,
  culture: /\b(history (center|museum)|historical (site|landmark)|cultural center|performing arts|family festival)\b/i,
  food: /\b(food hall|farmers'? market|ice cream|dessert|candy shop|dinner (show|theat(?:er|re))|entertainment district|family entertainment center)\b/i,
};

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
}

function typesOf(place) {
  const raw = Array.isArray(place?.types) && place.types.length
    ? place.types
    : Array.isArray(place?.google_types) ? place.google_types : [];
  return raw.map(norm).filter(Boolean);
}

function primaryOf(place) {
  return norm(place?.primaryType || place?.primary_type || "");
}

function railForExactType(type) {
  if (!type) return null;
  for (const rail of FAMILY_DAY_RAILS) if (EXACT[rail.id].has(type)) return rail.id;
  return null;
}

function railIdentity(place) {
  if (!place) return null;
  const primary = primaryOf(place);
  const name = String(place.name || place.title || "").trim();
  const verified = familyFilterFacts(place?.place_id || place?.id || "");
  const types = typesOf(place);
  // These are adult/special-interest identities in real owned inventory. They
  // need positive, exact-ID family evidence before any broad park/activity type
  // may admit them.
  if ((/\b(nude|nudist|adults? only|dog (?:park|beach)|axe(?: throwing)?|boat ramp)\b/i.test(name)
      || types.includes("dog_park")) && !verified) return null;
  // Space identity is narrower than Google's generic `museum` identity. The
  // name may refine that generic primary, but may never override a restaurant,
  // hotel, shop or other specific identity.
  if ((!primary || GENERIC_TYPES.has(primary) || primary === "museum") && NAMES.space.test(name)) return "space";
  // Google frequently calls trampoline and game venues amusement parks. Their
  // explicit activity name is the more useful subtype, without letting a name
  // override a hotel, restaurant, shop or other unrelated primary identity.
  if (["amusement_park", "amusement_center", "tourist_attraction"].includes(primary) && NAMES.active.test(name)) return "active";
  if (primary === "amusement_center" && types.some((type) => type === "amusement_park" || type === "theme_park")) return "attractions";
  const primaryRail = railForExactType(primary);
  if (primaryRail) return primaryRail;

  // A specific primary identity outside this family taxonomy is decisive. This
  // prevents a restaurant, hotel or shop with an incidental museum/park type
  // or suggestive name from entering a family rail. Generic Google identities
  // carry no such verdict, so their explicit secondary types may decide.
  if (primary && !GENERIC_TYPES.has(primary)) return null;

  for (const type of types) {
    const rail = railForExactType(type);
    // A generic tourist attraction can carry an incidental `park` secondary
    // type. Require its name to identify an actual park before that secondary
    // signal can turn a statue or monument into an Outdoors destination.
    if (rail === "outdoors" && GENERIC_TYPES.has(primary) && type === "park" && !/\bpark\b/i.test(name)) continue;
    if (rail) return rail;
  }

  const category = norm(place.category);
  if (category === "beach") return "beach";
  if (place.kind === "event" && /\b(family|culture|history|festival|performance)\b/i.test(String(place.category || "") + " " + String(place.tags || ""))) return "culture";

  if (!name) return null;
  for (const rail of FAMILY_DAY_RAILS) if (NAMES[rail.id].test(name)) return rail.id;
  return null;
}

/**
 * Automatic unsafe-weather admission is separate from the user's evidence
 * filters. Reviewed indoor evidence wins; otherwise only a narrow primary type
 * that itself proves an indoor venue qualifies. A bare `museum` stays unknown
 * because museums may include open-air campuses.
 */
export function familyWeatherSafe(place) {
  const facts = familyFilterFacts(place?.place_id || place?.id || "");
  if (Array.isArray(facts?.weather_fit) && facts.weather_fit.includes("indoor")) return true;
  const primary = primaryOf(place);
  if (WEATHER_SAFE_PRIMARY_TYPES.has(primary)) return true;
  const name = String(place?.name || place?.title || "").trim();
  return primary === "museum"
    && /\b(children'?s museum|science museum|museum of science|space museum|planetarium)\b/i.test(name);
}

export function familyRailMatches(place, railId) {
  const id = norm(railId);
  if (!RAIL_IDS.has(id)) return false;
  const primary = primaryOf(place);
  const hardVeto = /(^|_)(hotel|motel|lodging|resort|restaurant|bar|pub|night_club|store|supplier|contractor|parking|residential|apartment)(_|$)/.test(primary);
  const verified = familyFilterFacts(place?.place_id || place?.id || "");
  if (!hardVeto && Array.isArray(verified?.rail_types) && verified.rail_types.includes(id)) return true;
  return railIdentity(place) === id;
}

function selected(value) {
  return (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]).map(norm).filter(Boolean);
}

function factValues(facts, key) {
  const value = facts && facts[key];
  return selected(value);
}

/**
 * AND across selected facets, OR within a facet. familyFilterFacts is the
 * trust boundary: missing, expired or unproven evidence becomes unknown and a
 * selected filter therefore excludes the place.
 */
export function matchesFamilyFilters(place, filters = {}) {
  const placeId = place?.place_id || place?.id || "";
  const facts = familyFilterFacts(placeId);
  const fields = {
    ages: "ages",
    weather: "weather_fit",
    cost: "cost",
    duration: "duration_recommendation",
    style: "style",
    composition: "composition",
  };
  for (const [facet, factKey] of Object.entries(fields)) {
    const wanted = selected(filters?.[facet]);
    if (!wanted.length) continue;
    const have = new Set(factValues(facts, factKey));
    if (facet === "ages" && have.has("all_ages")) {
      for (const age of ["baby", "toddler", "kid", "tween", "teen"]) have.add(age);
    }
    if (!wanted.some((value) => have.has(value))) return false;
  }
  const logistics = selected(filters?.logistics);
  if (logistics.length) {
    const has = (value) => value === "parking"
      ? facts?.parking === true
      : value === "reservation"
        ? facts?.reservation_required === true
        : value === "walk_up"
          ? facts?.reservation_required === false
          : value === "stroller"
            ? facts?.stroller === true
            : value === "stroller_parking"
              ? facts?.stroller_parking === true
              : value === "changing"
                ? facts?.changing_facilities === true
                : value === "height"
                  ? facts?.height_restrictions === true
          : false;
    if (!logistics.some(has)) return false;
  }
  return true;
}
