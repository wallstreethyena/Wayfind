// lib/christmasCardCopy.js: the small, CLIENT SAFE part of the Christmas
// collection (card labels, distance groups and the distance label).
// app/components/ChristmasIntentRails.js imports THIS file, never
// lib/christmasIntentRails.js, so the server registry
// (lib/christmasDiscoveries2026.js) never enters the browser bundle.

// The red label pill on each card: short (14 characters or fewer), never truncated.
export const CHRISTMAS_CARD_LABELS = Object.freeze({
  lights: "LIGHTS",
  "towns-markets": "TOWNS",
  "theme-parks": "THEME PARKS",
  "boat-parades": "BOAT PARADES",
  parades: "PARADES",
  "shows-outings": "SHOWS",
  "popup-bars": "POP UP BARS",
  parties: "PARTIES",
});

export const CHRISTMAS_NEARBY_MI = 35;
export const CHRISTMAS_DAY_TRIP_MI = 90;
export const CHRISTMAS_DISTANCE_GROUPS = Object.freeze([
  Object.freeze({ id: "nearby", label: "Nearby" }),
  Object.freeze({ id: "within-reach", label: "Within reach" }),
  Object.freeze({ id: "day-trip", label: "Day trip" }),
]);
export function christmasDistanceGroup(miles) {
  if (miles === null || miles === undefined || miles === "") return null;
  const mi = Number(miles);
  if (!Number.isFinite(mi)) return null;
  if (mi <= CHRISTMAS_NEARBY_MI) return "nearby";
  if (mi <= CHRISTMAS_DAY_TRIP_MI) return "within-reach";
  return "day-trip";
}
// The distance a card shows: always the true distance; a Day trip says so; a
// city centre location says it is approximate ("~").
export function christmasDistanceLabel(card) {
  const mi = Number(card?.distMi);
  if (!Number.isFinite(mi)) return null;
  const dayTrip = christmasDistanceGroup(mi) === "day-trip" ? " · Day trip" : "";
  if (card.approxLocation) return "~" + Math.round(mi) + " mi" + dayTrip;
  return (mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10) + " mi" + dayTrip;
}

