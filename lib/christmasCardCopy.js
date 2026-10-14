// lib/christmasCardCopy.js: the small, CLIENT SAFE part of the Christmas
// collection (card labels, distance groups and the distance label).
// app/components/ChristmasIntentRails.js imports THIS file, never
// lib/christmasIntentRails.js, so the server data (lib/christmasResearch.js,
// data/christmas-2026-research.json) never enters the browser bundle.

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


// ── Honesty chips (Christmas v4, lead packet 2026-10-13) ─────────────────────
// Client safe: reads only the card's own fields. Never claims a date for an
// undated season, never calls an unknown price free, labels select nights,
// timed entry, overnight runs and who it is for.
export const CHRISTMAS_SEASON_UNDATED_TEXT = "2026 season confirmed, dates not announced yet";
export const CHRISTMAS_PRICE_UNKNOWN_TEXT = "Price not announced";
const MONTH = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (d) => MONTH[Number(String(d).slice(5, 7))] + " " + Number(String(d).slice(8, 10));

export function christmasPriceLabel(card) {
  if (card?.price_label) return card.price_label;
  if (card?.is_free === true) return "Free";
  if (card?.is_free === false) return "Ticketed";
  return CHRISTMAS_PRICE_UNKNOWN_TEXT;
}

export function christmasWhenBadge(card) {
  return card?.season_undated === true ? { label: "2026 season", value: "Dates TBA", tone: "later" } : null;
}

export function christmasHonestyChips(card, today = "") {
  if (!card) return [];
  const chips = [];
  if (card.season_undated === true) chips.push({ key: "undated", icon: "🗓", label: "Dates not announced yet", title: CHRISTMAS_SEASON_UNDATED_TEXT });
  else if (card.select_nights) {
    const next = (Array.isArray(card.occurrence_dates) ? card.occurrence_dates : []).filter((d) => !today || d >= today).slice(0, 2);
    chips.push({ key: "nights", icon: "🌙", label: next.length ? "Select nights · next " + next.map(md).join(", ") : "Select nights", title: "Select nights only; every night is listed on the event page" });
  }
  if (card.timed_entry === true) chips.push({ key: "timed", icon: "⏱", label: "Timed entry" });
  if (card.overnight === true) chips.push({ key: "overnight", icon: "🌙", label: "Runs past midnight" });
  chips.push({ key: "price", icon: "🎟", label: christmasPriceLabel(card) });
  if (card.audience_label) chips.push({ key: "age", icon: card.audience === "adults-only" ? "🍸" : "👪", label: card.audience_label });
  return chips;
}
