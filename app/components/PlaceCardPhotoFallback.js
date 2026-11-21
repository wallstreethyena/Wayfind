// Display-only photography. Never store these paths against a place ID or
// return them from a venue-photo resolver.
const PHOTO_THEMES = [
  ["beach", /^(beach|public_beach|beaches)$/],
  ["aquarium", /^(aquarium|aquariums)$/],
  ["themeparks", /^(amusement_park|theme_park|theme_parks|amusement_parks|amusement_center)$/],
  ["outdoors", /^(park|parks|outdoors|state_park|national_park|nature_preserve|wildlife_park|hiking_area|trails|botanical_garden|garden|gardens)$/],
  ["arts", /^(art_gallery|art_museum|gallery|galleries|museum|museums|arts_and_culture)$/],
  ["music", /^(live_music|live_music_venue|concert_hall|music_venue|concerts)$/],
  ["family", /^(family|family_fun|family_activities|board_game_cafe|game_store)$/],
  ["coffee", /^(coffee|coffee_shop|cafe|cafes|cafés?|tea_house|coffee_and_tea)$/],
  ["dessert", /^(bakery|bakeries|desserts?|dessert_shop|ice_cream|ice_cream_shop|donut_shop|doughnut_shop|cookie_shop|confectionery)$/],
  ["breakfast", /^(breakfast|breakfast_restaurant|brunch|brunch_restaurant)$/],
  ["pizza", /^(pizza|pizza_restaurant|pizzeria)$/],
  ["burger", /^(hamburger_restaurant|burger|burgers|fast_food|fast_food_restaurant|quick_bites)$/],
  ["dining", /^(dinner|fine_dining|fine_dining_restaurant)$/],
  ["food", /^(food|restaurant|lunch|deli|meal_takeaway)$/],
  ["nightlife", /^(nightlife|night_out|bar|pub|brewery|cocktail_bar|night_club|wine_bar|brewpub|beer_garden|lounge)$/],
  ["stays", /^(hotel|hotels|lodging|resort|resort_hotel|stays|motel|inn|bed_and_breakfast)$/],
  ["shopping", /^(shopping|shop|store|shopping_mall|clothing_store|boutique|gift_shop|outlet_mall|department_store)$/],
];

export function placeCardPhotoTheme(place, category) {
  const candidates = [place?.primaryType, place?.primary_type, place?.type, place?.cardCategory,
    place?.category, category, ...(Array.isArray(place?.types) ? place.types : [])];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const key = value.toLowerCase().trim().replace(/[\s-]+/g, "_");
    const match = PHOTO_THEMES.find(([, types]) => types.test(key));
    if (match) return match[0];
  }
  return "neutral";
}

export default function PlaceCardPhotoFallback({ place, category, name = place?.name, eager = false }) {
  const theme = placeCardPhotoTheme(place, category);
  const label = theme === "neutral" ? "Illustrative photo" : "Representative photo";
  return (
    <div className="wf-place-representative" data-place-photo-theme={theme} role="img"
      aria-label={name ? label + " for " + name : label}>
      <img src={`/place-photos/representative/${theme}.webp`} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
