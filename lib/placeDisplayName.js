// Client-safe display-name overrides for exact, proven place identities.
//
// Google may use a legal/umbrella venue label that is accurate upstream but
// awkward in Wayfind's card UI. Overrides here are keyed by exact place_id so
// they can never rename a nearby hotel, shop, restaurant, or similarly named
// business. Ranking, category membership, and partner selection remain separate.
export const DISNEY_WORLD_PLACE_ID = "ChIJ96XKNOZ-3YgRoPEc0B85Hqc";
export const DISNEY_WORLD_DISPLAY_NAME = "Disney World";

export function placeDisplayName(place, fallback = "") {
  const raw = place && (
    (typeof place.displayName === "string" ? place.displayName : place.displayName && place.displayName.text)
    || place.name
    || place.title
  );
  const id = String((place && (place.id || place.place_id)) || "");
  if (id === DISNEY_WORLD_PLACE_ID) return DISNEY_WORLD_DISPLAY_NAME;
  return String(raw || fallback || "");
}
