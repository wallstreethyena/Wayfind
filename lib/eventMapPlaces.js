import { pinFamily } from "./mapPinGlyph.js";

export const EVENT_MAP_FAMILY = {
  // Text-presentation selectors request monochrome pictograms rather than
  // multicolour emoji; the runtime also asks MapKit to tint every glyph white.
  cafe: { label: "Coffee & cafés", icon: "☕︎", color: "#B45309" },
  food: { label: "Food", icon: "🍴︎", color: "#F97316" },
  drinks: { label: "Drinks", icon: "🍸︎", color: "#A855F7" },
  shows: { label: "Shows", icon: "♫", color: "#7C3AED" },
  outdoors: { label: "Outdoors", icon: "🌴︎", color: "#22C55E" },
  water: { label: "On the water", icon: "⛱︎", color: "#06B6D4" },
  culture: { label: "Things to do", icon: "🏛︎", color: "#6366F1" },
  stay: { label: "Stays", icon: "🛏︎", color: "#0284C7" },
  shop: { label: "Shopping", icon: "🛍︎", color: "#F43F5E" },
  other: { label: "More", icon: "•", color: "#64748B" },
};

const categoryFallback = (place) => {
  if (place?.mapKind === "stay") return "hotels";
  const value = String(place?.category || place?.cat || "").toLowerCase();
  if (/restaurant|food|dining/.test(value)) return "food";
  if (/night|bar|drink/.test(value)) return "nightlife";
  if (/hotel|stay|lodg/.test(value)) return "hotels";
  if (/shop/.test(value)) return "shopping";
  if (/beach|water/.test(value)) return "beach";
  if (/to do|attraction|activity/.test(value)) return "attractions";
  return value;
};

export function eventMapFamily(place) {
  if (place?.mapKind === "stay") return "stay";
  return pinFamily(place, categoryFallback(place)) || "other";
}

export function eventMapGlyph(place) {
  const family = eventMapFamily(place);
  return EVENT_MAP_FAMILY[family]?.icon || EVENT_MAP_FAMILY.other.icon;
}

export function eventMapColor(place) {
  return EVENT_MAP_FAMILY[eventMapFamily(place)]?.color || EVENT_MAP_FAMILY.other.color;
}

const identity = (place) => String(place?.id ?? "").trim();

function uniquePlaces(places) {
  const seen = new Set();
  const unique = [];
  for (const place of Array.isArray(places) ? places : []) {
    const id = identity(place);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...place, id, mapFamily: eventMapFamily(place) });
  }
  return unique;
}

// Map identity comes from the exact hotel list rendered by EventStayCards.
export function eventStayMapPins(places = []) {
  return uniquePlaces(places.filter(p => p?.id && p.name && p.detailHref && Number.isFinite(p.lat) && Number.isFinite(p.lng)))
    .map((p, index) => ({ ...p, href: p.detailHref, cat: "Hotel", category: "hotels", mapKind: "stay", mapFamily: "stay", mapRank: index + 1 }));
}

export function mergeEventMapPlaces(nearby = [], stays = []) {
  const exactStays = uniquePlaces(stays);
  const stayIds = new Set(exactStays.map(identity));
  return [...uniquePlaces(nearby).filter(p => !stayIds.has(identity(p))), ...exactStays];
}
