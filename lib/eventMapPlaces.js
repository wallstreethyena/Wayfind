import { pinCategory, PIN_CATEGORIES } from "./mapPinStandard.js";
import { pinFamily } from "./mapPinGlyph.js";

export const EVENT_MAP_FAMILY = Object.fromEntries(
  Object.entries(PIN_CATEGORIES).map(([key, value]) => [key, { ...value, icon: key }])
);

const categoryFallback = (place) => {
  if (place?.mapKind === "stay") return "hotels";
  const value = String(place?.category || place?.cat || "").toLowerCase();
  if (/cafe|café|coffee|dessert|sweet|bakery/.test(value)) return "cafe";
  if (/restaurant|food|dining/.test(value)) return "food";
  if (/night|bar|drink/.test(value)) return "nightlife";
  if (/hotel|stay|lodg/.test(value)) return "hotels";
  if (/spa|wellness/.test(value)) return "wellness";
  if (/gym|fitness|sport/.test(value)) return "fitness";
  if (/show|event|theat|music/.test(value)) return "shows";
  if (/outdoor|nature|park|trail/.test(value)) return "outdoors";
  if (/shop/.test(value)) return "shopping";
  if (/beach|water/.test(value)) return "beach";
  if (/to do|attraction|activity/.test(value)) return "attractions";
  return value;
};

export function eventMapFamily(place, fallbackCategory) {
  if (place?.mapKind === "stay") return "stay";
  return pinFamily(place, categoryFallback(place) || fallbackCategory) || "other";
}

export function eventMapGlyph(place) {
  const family = eventMapFamily(place);
  return EVENT_MAP_FAMILY[family]?.icon || EVENT_MAP_FAMILY.other.icon;
}

export function eventMapColor(place) {
  return pinCategory(eventMapFamily(place)).color;
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
