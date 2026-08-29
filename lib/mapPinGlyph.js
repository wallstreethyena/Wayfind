// lib/mapPinGlyph.js — WHAT GOES INSIDE THE MAP PIN.
//
// v8.85 (owner, 2026-08-28, on the Food/Dinner map at Bradenton showing 13
// identical orange teardrops): "show me number top 5 choices and make the
// places have an icon representing its categories".
//
// Both halves are the same missing idea: the pin head is a white dot, so
// thirteen results look like thirteen of the same thing. The map already
// KNOWS the rank (it is a feature property and has been all along, used only
// to size pin #1) and it knows the place's primary type. Neither reached the
// reader.
//
// THE RULE, and it is deliberately ordered:
//
//   ranks 1-5   -> the NUMERAL. A top-five pick's position is the most useful
//                  thing the map can say about it, and it is the thing the
//                  bottom sheet's "ranked by fit" is promising. Five, not ten:
//                  a two-digit numeral inside a 20px pin head is unreadable at
//                  a real device ratio, and "top five" is a claim a reader can
//                  actually hold in their head.
//   everything  -> the CATEGORY GLYPH, from the place's PRIMARY type.
//
// PRIMARY TYPE ONLY — the same discipline lib/showVenue.js and lib/daylight.js
// keep, for the same reason. Google's types[] is a union of every facet a place
// has: a steakhouse carries `bar`, a hotel carries `restaurant`, and a
// brewery carries `live_music_venue`. Reading the union would give a third of
// the map the wrong picture, confidently.
//
// EMOJI, NOT A CUSTOM ICON SET. Wayfind already speaks in emoji everywhere a
// category is named — the place-card chips (🍕 🍣 🥩 🦐 🍔 🌮 🍝 🍰 ☕ 🍺), the
// explore tiles, the rail art. A bespoke SVG set would be a second visual
// vocabulary for the same nouns, and the pin is 28px: at that size a glyph
// people already recognise beats one they have to learn.
//
// THE MAP IS GROUNDED, NOT GUESSED. Every key below appears in the live
// /api/rails payload for the flagship metro (measured 2026-08-28, 1,404 rows
// across 17 rails); the long tail falls through to the category default, and
// an unknown place gets a neutral dot rather than a wrong picture.

// Primary type -> glyph. Ordered roughly by how often each appears in real
// inventory near the flagship reader, so the common cases are easy to audit.
const TYPE_GLYPH = {
  // food, by cuisine — the chips' own vocabulary
  pizza_restaurant: "🍕", sushi_restaurant: "🍣", steak_house: "🥩",
  seafood_restaurant: "🦐", hamburger_restaurant: "🍔", mexican_restaurant: "🌮",
  taco_restaurant: "🌮", italian_restaurant: "🍝", ramen_restaurant: "🍜",
  thai_restaurant: "🍜", vietnamese_restaurant: "🍜", chinese_restaurant: "🥡",
  asian_restaurant: "🥡", japanese_restaurant: "🍱", korean_barbecue_restaurant: "🥩",
  indian_restaurant: "🍛", greek_restaurant: "🥙", mediterranean_restaurant: "🥙",
  middle_eastern_restaurant: "🥙", spanish_restaurant: "🥘", cuban_restaurant: "🥘",
  latin_american_restaurant: "🥘", brazilian_restaurant: "🥩",
  barbecue_restaurant: "🍖", chicken_restaurant: "🍗", sandwich_shop: "🥪",
  deli: "🥪", bagel_shop: "🥯", vegan_restaurant: "🥗", vegetarian_restaurant: "🥗",
  salad_shop: "🥗", fine_dining_restaurant: "🍽️", american_restaurant: "🍽️",
  family_restaurant: "🍽️", restaurant: "🍽️", fast_food_restaurant: "🍟",
  meal_takeaway: "🥡", buffet_restaurant: "🍽️", food_court: "🍽️",

  // the morning and the sweet end
  cafe: "☕", coffee_shop: "☕", tea_house: "🍵", breakfast_restaurant: "🥞",
  brunch_restaurant: "🥞", bakery: "🥐", pastry_shop: "🥐", donut_shop: "🍩",
  ice_cream_shop: "🍦", dessert_shop: "🍰", candy_store: "🍬",
  confectionery: "🍬", juice_shop: "🧃", acai_shop: "🍓",

  // the evening
  bar: "🍸", cocktail_bar: "🍸", wine_bar: "🍷", pub: "🍺", irish_pub: "🍺",
  brewery: "🍺", brewpub: "🍺", beer_garden: "🍺", gastropub: "🍺",
  sports_bar: "📺", bar_and_grill: "🍽️", lounge_bar: "🍸", night_club: "🪩",
  dive_bar: "🍺", karaoke: "🎤", hookah_bar: "💨",

  // shows — the v8.83 additions, so the rail and the map agree
  comedy_club: "🎤", live_music_venue: "🎸", concert_hall: "🎼",
  performing_arts_theater: "🎭", opera_house: "🎭", theater_company: "🎭",
  amphitheatre: "🎪", amphitheater: "🎪", dance_hall: "💃", jazz_club: "🎷",
  movie_theater: "🎬",

  // outdoors and water
  beach: "🏖️", park: "🌳", city_park: "🌳", state_park: "🌲", national_park: "🌲",
  nature_preserve: "🌿", wildlife_refuge: "🦌", wildlife_park: "🦁",
  botanical_garden: "🌺", garden: "🌺", hiking_area: "🥾", dog_park: "🐕",
  playground: "🛝", picnic_ground: "🧺", campground: "⛺", rv_park: "🚐",
  marina: "⛵", fishing_pier: "🎣", fishing_charter: "🎣",
  boat_tour_agency: "🚤", water_park: "🌊", swimming_pool: "🏊",
  golf_course: "⛳", farm: "🌾", farmers_market: "🧺",

  // things to do
  museum: "🏛️", art_gallery: "🖼️", aquarium: "🐠", zoo: "🦁",
  amusement_park: "🎢", amusement_center: "🕹️", video_arcade: "🕹️",
  bowling_alley: "🎳", indoor_playground: "🛝", miniature_golf_course: "⛳",
  escape_room_center: "🔐", tourist_attraction: "📍", historical_landmark: "🏛️",
  observation_deck: "🔭", bridge: "🌉", library: "📚", casino: "🎰",
  adventure_sports_center: "🧗", tour_agency: "🧭", event_venue: "🎟️",
  stadium: "🏟️", arena: "🏟️", auditorium: "🎭", convention_center: "🎟️",

  // stays and shops, so a mixed view still reads
  hotel: "🏨", resort_hotel: "🏨", motel: "🏨", bed_and_breakfast: "🏨",
  shopping_mall: "🛍️", clothing_store: "👕", book_store: "📚",
  gift_shop: "🎁", thrift_store: "🧥", spa: "💆", gym: "🏋️",
};

// When the primary type is unknown, the VIEW's category is still a true thing
// to say, and it is what the map is filtered to.
const CATEGORY_GLYPH = {
  food: "🍽️", nightlife: "🍸", attractions: "📍",
  family: "👨‍👩‍👧", hotels: "🏨", shopping: "🛍️",
};

// Not a picture of anything — the honest "we know where, not what".
export const NEUTRAL_GLYPH = "\u2022";

// ── COLOUR IS THE CHANNEL THAT SURVIVES ─────────────────────────────────────
//
// v8.89 (owner, 2026-08-29, on the pin strip v8.85 shipped): "you cannot see
// the icon in these, I need the icon to be distinguished between food, bars,
// hotels etc."
//
// He is right twice over, and the second half is the one that matters.
//
//   1. The glyph was too small. 10px of emoji inside a 14.4px white disc on a
//      28px pin, then drawn at icon-size 0.9 — about 9 device pixels of
//      picture. That is mush at any DPR.
//
//   2. AND THE COLOUR WAS SAYING THE WRONG THING. MapView derived one colour
//      per VIEW — `{food:…, nightlife:…}[category]` — so every pin on the Food
//      map was the same orange whatever the place was. The one channel that
//      IS legible at 28px was spent restating the filter the reader had just
//      chosen. A steakhouse, a coffee shop and a beach bar came out identical.
//
// So colour now comes from the PLACE. Nine families, chosen to be separable at
// a glance and at a distance — not nine shades of one hue, and not a rainbow:
// each is a hue a reader can name, and the two that sit closest (nightlife
// purple / culture indigo) are never the dominant pair on one screen because
// their rails are different rails.
//
// The families are coarser than TYPE_GLYPH on purpose. Colour answers "what
// KIND of place", the glyph answers "which one" — asking colour to carry
// sixty distinctions would give sixty indistinguishable colours, which is the
// bug this replaces, pointing the other way.
const FAMILY_COLOR = {
  food: "#F97316",       // orange — the product's own accent, and the biggest set
  cafe: "#B45309",       // coffee brown, distinct from the food orange beside it
  drinks: "#A855F7",     // violet — bars, pubs, breweries, clubs
  shows: "#EC4899",      // pink — comedy, theatre, live music, cinema
  outdoors: "#22C55E",   // green — parks, preserves, trails, gardens
  water: "#06B6D4",      // cyan — beaches, marinas, piers, boats
  culture: "#6366F1",    // indigo — museums, galleries, landmarks, libraries
  stay: "#64748B",       // slate — hotels, resorts, motels
  shop: "#F43F5E",       // rose — malls, boutiques, markets, thrift
};

// Primary type -> family. Only where the family is not obvious from the glyph
// map's own grouping; everything else falls through the suffix rules below.
const FAMILY_BY_TYPE = {
  cafe: "cafe", coffee_shop: "cafe", tea_house: "cafe", bakery: "cafe",
  pastry_shop: "cafe", donut_shop: "cafe", ice_cream_shop: "cafe",
  dessert_shop: "cafe", juice_shop: "cafe", acai_shop: "cafe",
  candy_store: "cafe", confectionery: "cafe",

  bar: "drinks", cocktail_bar: "drinks", wine_bar: "drinks", pub: "drinks",
  irish_pub: "drinks", brewery: "drinks", brewpub: "drinks",
  beer_garden: "drinks", gastropub: "drinks", sports_bar: "drinks",
  lounge_bar: "drinks", night_club: "drinks", dive_bar: "drinks",
  karaoke: "drinks", hookah_bar: "drinks", bar_and_grill: "drinks",

  comedy_club: "shows", live_music_venue: "shows", concert_hall: "shows",
  performing_arts_theater: "shows", opera_house: "shows",
  theater_company: "shows", amphitheatre: "shows", amphitheater: "shows",
  dance_hall: "shows", jazz_club: "shows", movie_theater: "shows",
  casino: "shows", event_venue: "shows", auditorium: "shows",
  convention_center: "shows", stadium: "shows", arena: "shows",

  park: "outdoors", city_park: "outdoors", state_park: "outdoors",
  national_park: "outdoors", nature_preserve: "outdoors",
  wildlife_refuge: "outdoors", wildlife_park: "outdoors",
  botanical_garden: "outdoors", garden: "outdoors", hiking_area: "outdoors",
  dog_park: "outdoors", playground: "outdoors", picnic_ground: "outdoors",
  campground: "outdoors", rv_park: "outdoors", golf_course: "outdoors",
  farm: "outdoors", farmers_market: "outdoors", zoo: "outdoors",
  adventure_sports_center: "outdoors",

  beach: "water", marina: "water", fishing_pier: "water",
  fishing_charter: "water", boat_tour_agency: "water", water_park: "water",
  swimming_pool: "water", aquarium: "water",

  museum: "culture", art_gallery: "culture", historical_landmark: "culture",
  library: "culture", observation_deck: "culture", bridge: "culture",
  tourist_attraction: "culture", tour_agency: "culture",
  amusement_park: "culture", amusement_center: "culture",
  video_arcade: "culture", bowling_alley: "culture",
  miniature_golf_course: "culture", escape_room_center: "culture",
  indoor_playground: "culture",

  hotel: "stay", resort_hotel: "stay", motel: "stay", bed_and_breakfast: "stay",

  shopping_mall: "shop", clothing_store: "shop", book_store: "shop",
  gift_shop: "shop", thrift_store: "shop", spa: "shop", gym: "shop",
  store: "shop", wholesaler: "shop",
};

// The VIEW's category is the last true thing we can say when the primary type
// is unknown — and it is what the map is filtered to, so it cannot mislead.
const FAMILY_BY_CATEGORY = {
  food: "food", nightlife: "drinks", attractions: "culture",
  family: "outdoors", hotels: "stay", shopping: "shop", beach: "water",
};

export const NEUTRAL_COLOR = "#94A3B8";

export const RANKED_PIN_COUNT = 5;

const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

/** The category glyph for one place, given the view it is being shown in. */
export function categoryGlyph(place, category) {
  const direct = TYPE_GLYPH[primaryOf(place)];
  if (direct) return direct;
  // A `*_restaurant` we have not named is still dinner; same for the two
  // other suffix families that Google mints new members of constantly.
  const primary = primaryOf(place);
  if (/_restaurant$/.test(primary)) return "🍽️";
  if (/_bar$/.test(primary)) return "🍸";
  if (/_store$|_shop$/.test(primary)) return "🛍️";
  return CATEGORY_GLYPH[String(category || "").toLowerCase()] || NEUTRAL_GLYPH;
}

/**
 * What this pin shows. `rank` is 1-based.
 *
 *   { kind: "rank",  text: "1".."5" }   the top five
 *   { kind: "glyph", text: "🍕" }        everything else
 *
 * Total over garbage: a missing or nonsense rank simply falls to the glyph,
 * because a pin with no picture is a worse answer than a pin with the right
 * one, and neither should ever throw inside a map render loop.
 */
export function pinGlyphFor(place, rank, category) {
  const r = Number(rank);
  if (Number.isInteger(r) && r >= 1 && r <= RANKED_PIN_COUNT) return { kind: "rank", text: String(r) };
  return { kind: "glyph", text: categoryGlyph(place, category) };
}

/**
 * The sprite cache key. One image per (colour x glyph x selected) combination,
 * which is what keeps this ONE symbol layer rather than N DOM markers — the
 * perf rule MapView has kept for places since it was written. A screenful is
 * typically 8-12 distinct sprites, and addImage is idempotent.
 *
 * Glyphs are not URL-safe or id-safe by nature, so the key hashes the text
 * rather than embedding it: an emoji is several code units and MapLibre image
 * ids are compared as plain strings, so a stable short hash keeps ids tidy and
 * collision-free enough for a dozen-entry cache.
 */
/**
 * Which COLOUR FAMILY this place belongs to — the pin's hue.
 *
 * Primary type first (the v8.30.1 discipline: Google's types[] is a union of
 * facets, and a steakhouse carrying `bar` would come out violet), then the
 * three suffix families Google mints new members of constantly, then the
 * view's own category, then neutral.
 *
 * `category` is the map's current filter and is a fact about the VIEW, so it
 * is the fallback rather than the answer: it is the last true thing we can say
 * when we do not know what the place is.
 */
export function pinFamily(place, category) {
  const primary = primaryOf(place);
  const direct = FAMILY_BY_TYPE[primary];
  if (direct) return direct;
  if (/_restaurant$|^restaurant$|^deli$|^sandwich_shop$|_grill$|^food_court$|^buffet/.test(primary)) return "food";
  if (/_bar$|^pub$/.test(primary)) return "drinks";
  if (/_cafe$|^cafe/.test(primary)) return "cafe";
  if (/_store$|_shop$|^market/.test(primary)) return "shop";
  if (/^hotel|_hotel$|^inn$|^lodging$/.test(primary)) return "stay";
  if (/_park$|^park$|^trail/.test(primary)) return "outdoors";
  if (/_theater$|_theatre$|_club$|_hall$/.test(primary)) return "shows";
  return FAMILY_BY_CATEGORY[String(category || "").toLowerCase()] || null;
}

/**
 * The pin colour for one place. NOT for the view it is in — see the block
 * above FAMILY_COLOR for the whole argument.
 *
 * Total over garbage, because this runs inside a map render loop: an unknown
 * place gets the neutral slate, which reads as "a result" and claims nothing.
 */
export function pinColorFor(place, category) {
  const fam = pinFamily(place, category);
  return (fam && FAMILY_COLOR[fam]) || NEUTRAL_COLOR;
}

export function pinImageKey(color, glyph, selected) {
  let h = 0;
  const s = String(glyph == null ? "" : glyph);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `wf-pin-${selected ? "sel-" : ""}${String(color || "").replace("#", "")}-${(h >>> 0).toString(36)}`;
}

export { TYPE_GLYPH, CATEGORY_GLYPH, FAMILY_COLOR, FAMILY_BY_TYPE, FAMILY_BY_CATEGORY };
