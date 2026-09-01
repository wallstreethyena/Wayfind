// The ten intent-first answers behind Wayfind's Fall / Augtober poster.
//
// A `fall` tag is necessary context, not sufficient evidence. Ordinary shows,
// restaurants and bars that merely happen between September and November do
// not become seasonal recommendations. Each classifier below requires the
// concrete product the rail promises, and returns ONE primary rail so the same
// event cannot repeat down the collection under different headlines.

import { distanceMi, scoreEvent } from "./curatedEvents.js";
import { eventFranchiseKey } from "./fallSkin.js";

export const FALL_INTENT_RAIL_DEFS = Object.freeze([
  { id: "food", title: "Fall Drinks & Seasonal Bites", deck: "Documented pumpkin drinks, cider, pastries, harvest menus and Halloween cocktails — not ordinary coffee wearing an orange label." },
  { id: "farms", title: "Pumpkin Patches & Fall Farms", deck: "Real patches, corn mazes, hayrides, harvest weekends and farm experiences worth the drive." },
  { id: "theme-parks", title: "Halloween Theme Parks", deck: "Florida's major park events, separated by who they are actually right for." },
  { id: "haunts", title: "Haunted Houses & Fright Nights", deck: "Actual haunted houses, trails and scare attractions — fear level matters here." },
  { id: "family", title: "Halloween With the Kids", deck: "Costumes, candy and explicitly family-safe programming with no adult party leakage." },
  { id: "oktoberfest", title: "Oktoberfest & Beer Gardens", deck: "German food, seasonal beer, live music and fall brewery celebrations with a verified program." },
  { id: "date-night", title: "Spooky Date Night", deck: "Themed bars, Halloween cocktails, ghost tours and atmospheric nights built for adults or couples." },
  { id: "festivals", title: "Fall Festivals & Outdoor Nights", deck: "Destination-worthy food, art, music, cultural and community festivals — not every event that happens in fall." },
  { id: "photos", title: "Best Fall Photo Spots", deck: "Pumpkin displays, fields, décor and installations with explicit visual proof." },
  { id: "day-trips", title: "Florida Fall Day Trips", deck: "Scenic, natural and small-town escapes with a real seasonal reason to go." },
]);

const BASE_ORDER = FALL_INTENT_RAIL_DEFS.map((rail) => rail.id);
export const FALL_RAIL_RADIUS_MI = Object.freeze({
  food: 75,
  farms: 120,
  "theme-parks": 450,
  haunts: 160,
  family: 75,
  oktoberfest: 120,
  "date-night": 120,
  festivals: 160,
  photos: 160,
  "day-trips": 250,
});
const PHASE_ORDER = Object.freeze({
  early: ["food", "theme-parks", "date-night", "farms", "oktoberfest", "festivals", "photos", "haunts", "family", "day-trips"],
  opening: ["farms", "oktoberfest", "festivals", "food", "theme-parks", "photos", "family", "date-night", "haunts", "day-trips"],
  halloween: ["haunts", "date-night", "theme-parks", "farms", "family", "photos", "festivals", "oktoberfest", "food", "day-trips"],
  lastMinute: ["family", "haunts", "farms", "theme-parks", "date-night", "photos", "festivals", "food", "oktoberfest", "day-trips"],
  november: ["festivals", "day-trips", "food", "photos", "farms", "theme-parks", "family", "date-night", "haunts", "oktoberfest"],
});

export function fallPhase(today) {
  const md = String(today || "").slice(5);
  if (md >= "11-01") return "november";
  if (md >= "10-24") return "lastMinute";
  if (md >= "10-10") return "halloween";
  if (md >= "09-25") return "opening";
  return "early";
}

export function fallRailOrder(today) {
  return (PHASE_ORDER[fallPhase(today)] || BASE_ORDER).slice();
}

function wordsOf(event) {
  return [event?.event_name, event?.title, event?.category, event?.subcategory, ...(event?.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
}

const has = (list, value) => Array.isArray(list) && list.includes(value);
const hasAny = (list, values) => values.some((value) => has(list, value));

export function fallEventRail(event) {
  if (!event) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const audience = Array.isArray(event.audience) ? event.audience : [];
  const text = wordsOf(event);
  const seasonal = hasAny(tags, ["fall", "halloween", "pumpkins", "pumpkin", "harvest"]);
  if (!seasonal) return null;

  const themePark = has(tags, "theme-park") || /theme-park/.test(String(event.subcategory || ""));
  const farm = hasAny(tags, ["pumpkins", "pumpkin", "farm", "harvest"])
    && /(?:pumpkin|farm|harvest|corn maze|hayride)/.test(text);
  const scary = has(tags, "scary") || /haunted-house|haunted-trail|fright|horror park/.test(text);
  const familyHalloween = hasAny(audience, ["families", "kids"])
    && (has(tags, "halloween") || has(tags, "trick-or-treat"))
    && !scary;
  const oktoberfest = /oktoberfest/.test(text)
    || (has(tags, "beer") && /(?:german|beer garden|brewery|oktober)/.test(text));
  const photoProof = hasAny(tags, ["photo-op", "sunflowers", "sunflower", "instagrammable"])
    || has(audience, "photographers");
  const dateNight = has(audience, "couples")
    && (hasAny(tags, ["halloween", "date-night", "nightlife", "candlelight"])
      || /themed-bar|cocktail|ghost tour|haunted dinner/.test(text));
  const themedNightOut = (hasAny(tags, ["halloween", "date-night", "nightlife", "candlelight"])
      || /halloween|haunted|ghost/.test(text))
    && /themed-bar|cocktail|\bbar\b|ghost tour|haunted dinner/.test(text)
    && (hasAny(audience, ["adults", "couples"]) || /bar|cocktail|tour|dinner/.test(text));
  const halloweenThemePark = themePark
    && !themedNightOut
    && (hasAny(tags, ["halloween", "scary", "trick-or-treat"])
      || /halloween|horror|howl-o-scream|brick-or-treat|spooktacular|ghosts.{0,8}goblins|sideshow obscura/.test(text));
  const festival = event.category === "festival"
    || /festival|night-market|market|street-festival|renaissance-fair/.test(String(event.subcategory || ""))
    || /\bfestival\b/.test(String(event.event_name || event.title || "").toLowerCase());
  const dayTrip = hasAny(tags, ["nature", "scenic", "hiking", "springs", "small-town", "road-trip"])
    || /state park|scenic drive|historic downtown|fall color|nature preserve/.test(text);

  // Primary identity wins in this exact order. HHN is a theme-park decision,
  // not duplicated as a local haunt; a pumpkin farm is not repeated in the
  // family lane; an Oktoberfest is not relabelled as a generic festival.
  if (themedNightOut) return "date-night";
  if (halloweenThemePark) return "theme-parks";
  if (farm) return "farms";
  if (scary) return "haunts";
  if (familyHalloween) return "family";
  if (oktoberfest) return "oktoberfest";
  if (photoProof) return "photos";
  if (dateNight) return "date-night";
  if (festival) return "festivals";
  if (dayTrip) return "day-trips";
  return null;
}

function itemDistance(item, ctx) {
  if (Number.isFinite(item?.distMi)) return Number(item.distMi);
  const value = distanceMi(item, ctx);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function rankEvent(event, ctx) {
  return scoreEvent(event, ctx);
}

function rankPlace(place) {
  return Number(place?.wfScore || 0);
}

function rankCards(a, b, ctx) {
  const av = a.kind === "event" ? rankEvent(a, ctx) : rankPlace(a);
  const bv = b.kind === "event" ? rankEvent(b, ctx) : rankPlace(b);
  return (bv - av) || ((itemDistance(a, ctx) ?? 9999) - (itemDistance(b, ctx) ?? 9999));
}

function uniqueCards(cards, ctx) {
  const ids = new Set();
  const names = new Set();
  const series = new Set();
  return cards.slice().sort((a, b) => rankCards(a, b, ctx)).filter((card) => {
    const id = String(card?.id || card?.event_id || "");
    const name = String(card?.name || card?.event_name || card?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const family = card.kind === "event" ? String(card.event_series_id || eventFranchiseKey(name) || id) : "";
    if (!id || !name || ids.has(id) || names.has(name) || (family && series.has(family))) return false;
    ids.add(id);
    names.add(name);
    if (family) series.add(family);
    card.distMi = itemDistance(card, ctx);
    return true;
  });
}

export function composeFallIntentRails(events, places, { lat = null, lng = null, today = "", now = new Date() } = {}) {
  const ctx = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, now } : { now };
  const buckets = Object.fromEntries(FALL_INTENT_RAIL_DEFS.map((rail) => [rail.id, []]));
  for (const event of Array.isArray(events) ? events : []) {
    const rail = fallEventRail(event);
    const miles = rail ? itemDistance(event, ctx) : null;
    if (rail && buckets[rail] && (miles == null || miles <= FALL_RAIL_RADIUS_MI[rail])) {
      buckets[rail].push({ ...event, kind: "event", distMi: miles });
    }
  }
  for (const place of Array.isArray(places) ? places : []) {
    const rail = String(place?.fallRail || "");
    const miles = rail ? itemDistance(place, ctx) : null;
    if (rail && buckets[rail] && (miles == null || miles <= FALL_RAIL_RADIUS_MI[rail])) {
      buckets[rail].push({ ...place, kind: "place", distMi: miles });
    }
  }
  const byId = new Map(FALL_INTENT_RAIL_DEFS.map((rail) => [rail.id, rail]));
  const rails = fallRailOrder(today).map((id) => ({
    ...byId.get(id),
    cards: uniqueCards(buckets[id], ctx),
  }));
  return { phase: fallPhase(today), rails };
}
