// The five intent first answers behind Wayfind's Christmas in Florida poster.
//
// Modeled on lib/fallIntentRails.js and reusing its date law, distance helper
// and chronological ordering. Each event lands in exactly ONE rail (or none),
// so a card never repeats down the collection under different headlines.

import { distanceMi } from "./curatedEvents.js";
import { chronologicalCards, hasUpcomingFallOccurrence } from "./fallIntentRails.js";
import { fallEventLive } from "./fallPool.js";
import { withoutAdultVenues } from "./placeCategory.js";
import {
  CHRISTMAS_PLACE_RAIL, CHRISTMAS_THEME_PARK_EVENT_IDS, CHRISTMAS_MANATEE_EVENT_IDS,
} from "./christmasPool.js";

// DECK WORDING: two decks differ from the first draft of the spec because the
// standing owner law (lib/railDeckCopy.js, 2026-09-04: 5 to 8 words, no colon)
// rejects the draft text ("Florida's biggest Christmas nights." is 4 words;
// "Christmas, Florida style: lit boats on the water." has a colon and 9 words).
export const CHRISTMAS_INTENT_RAIL_DEFS = Object.freeze([
  Object.freeze({ id: "beaches", title: "Winter Beach Days", deck: "Warm sand while everyone else is freezing." }),
  Object.freeze({ id: "theme-parks", title: "Theme Park Christmas", deck: "Florida's biggest Christmas nights, at the parks." }),
  Object.freeze({ id: "nights-out", title: "Holiday Nights Out", deck: "Light walks, tree lightings and markets near you." }),
  Object.freeze({ id: "manatees", title: "Manatees & Warm Springs", deck: "Florida's gentle giants come in for the winter." }),
  Object.freeze({ id: "boat-parades", title: "Boat Parades & Waterfront Lights", deck: "Christmas, Florida style, with lit boats." }),
]);

// Admission radius in miles. A rail with nothing inside its radius falls back
// to the nearest statewide cards (fallbackUsed = true), capped at the target.
export const CHRISTMAS_RAIL_RADIUS_MI = Object.freeze({
  beaches: 120,
  "theme-parks": 150,
  "nights-out": 60,
  manatees: 150,
  "boat-parades": 120,
});
export const CHRISTMAS_FALLBACK_COUNT = 8;

const THEME_PARK_IDS = new Set(CHRISTMAS_THEME_PARK_EVENT_IDS);
const MANATEE_IDS = new Set(CHRISTMAS_MANATEE_EVENT_IDS);

const BOAT_RX = /boat parade|regatta|boat-a-long|lighted boat|light boat/i;
const MANATEE_RX = /manatee (?:season|festival)/i;
const NIGHTS_RX = /christmas|holiday|lights|tree lighting|santa|winter (?:festival|market|village|wonderland)|nutcracker|enchant|noel|yule|grinch|winterfest/i;
// Never Christmas, however the other words match.
const NEVER_RX = /veterans boat parade|clearwater jazz holiday|florida winter music festival|winter park autumn art festival|dear evan hansen|anastasia/i;
const SPOOKY_RX = /halloween|spooky|haunt|fright|howl o scream|howl-o-scream|trick or treat|pumpkin|oktoberfest|\bboo\b/i;

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function nameOf(event) {
  return String(event?.event_name || event?.title || event?.name || "");
}

// True when [start, end] overlaps Nov 15 .. Jan 6 of the season it belongs to.
function overlapsSeason(event, fromMd, toMd, toNextYear) {
  const start = String(event?.start_date || "");
  if (!DATE_RX.test(start)) return false;
  const endRaw = String(event?.end_date || "");
  const end = DATE_RX.test(endRaw) ? endRaw : start;
  const y0 = Number(start.slice(0, 4));
  for (const y of [y0 - 1, y0]) {
    const from = `${y}-${fromMd}`;
    const to = `${toNextYear ? y + 1 : y}-${toMd}`;
    if (start <= to && end >= from) return true;
  }
  return false;
}
export const inChristmasWindow = (event) => overlapsSeason(event, "11-15", "01-06", true);
// Manatee season runs roughly mid November through March.
const inManateeWindow = (event) => overlapsSeason(event, "11-15", "03-31", true);

// Exactly one rail id, or null.
export function christmasEventRail(event) {
  if (!event) return null;
  const id = String(event.event_id || event.id || "");
  if (THEME_PARK_IDS.has(id)) return "theme-parks";
  const name = nameOf(event);
  if (NEVER_RX.test(name) || SPOOKY_RX.test(name)) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  if (tags.some((tag) => /^(?:halloween|spooky|fall)$/i.test(String(tag))) && !/christmas/i.test(name)) return null;
  if (BOAT_RX.test(name) && inChristmasWindow(event)) return "boat-parades";
  if (MANATEE_IDS.has(id) || (MANATEE_RX.test(name) && inManateeWindow(event))) return "manatees";
  if (NIGHTS_RX.test(name) && inChristmasWindow(event)) return "nights-out";
  return null;
}

function itemDistance(item, ctx) {
  if (Number.isFinite(item?.distMi)) return Number(item.distMi);
  const value = distanceMi(item, ctx);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

// Same order law as Fall (date first, then nearest, then score), but the
// repeat guard is id, exact name and series only. Fall's franchise key
// collapses the first three words of a name, which would merge unrelated
// Christmas events that all start "Christmas at ...".
function uniqueCards(cards, ctx) {
  const ids = new Set();
  const names = new Set();
  const series = new Set();
  return cards.slice().sort((a, b) => chronologicalCards(a, b, ctx)).filter((card) => {
    const id = String(card?.id || card?.event_id || "");
    const name = String(card?.name || card?.event_name || card?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const family = card.kind === "event" && card.event_series_id ? String(card.event_series_id) : "";
    if (!id || !name || ids.has(id) || names.has(name) || (family && series.has(family))) return false;
    ids.add(id);
    names.add(name);
    if (family) series.add(family);
    card.distMi = itemDistance(card, ctx);
    return true;
  });
}

function eventIsLive(event, today) {
  return fallEventLive(event, today) && hasUpcomingFallOccurrence(event, today);
}

const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function composeChristmasIntentRails(events, places, { lat = null, lng = null, today = "", now = new Date() } = {}) {
  places = withoutAdultVenues(places);
  const ctx = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, now, today } : { now, today };
  const inside = Object.fromEntries(CHRISTMAS_INTENT_RAIL_DEFS.map((rail) => [rail.id, []]));
  const outside = Object.fromEntries(CHRISTMAS_INTENT_RAIL_DEFS.map((rail) => [rail.id, []]));
  const admit = (list, card, miles, radius) => (miles <= radius ? list.inside : list.outside).push(card);
  const bucket = (rail) => ({ inside: inside[rail], outside: outside[rail] });

  for (const event of Array.isArray(events) ? events : []) {
    const rail = christmasEventRail(event);
    if (!rail || !inside[rail] || !eventIsLive(event, today)) continue;
    const miles = itemDistance(event, ctx);
    if (miles == null) continue;
    admit(bucket(rail), { ...event, id: event.id || event.event_id, kind: "event", distMi: miles }, miles, CHRISTMAS_RAIL_RADIUS_MI[rail]);
  }

  // A venue anchor in Holiday Nights Out only stands in for a dated event. If
  // a dated event card already names the same venue, the event is the card.
  const nightsEvents = [...inside["nights-out"], ...outside["nights-out"]];
  const venueTaken = (anchor) => nightsEvents.some((event) =>
    (event.place_id && event.place_id === anchor.id)
    || (event.venue && norm(event.venue) && norm(event.venue) === norm(anchor.name || anchor.title)));

  for (const item of Array.isArray(places) ? places : []) {
    const id = String(item?.id || item?.place_id || "");
    const rail = String(item?.christmasRail || CHRISTMAS_PLACE_RAIL[id] || "");
    if (!rail || !inside[rail]) continue;
    const miles = itemDistance(item, ctx);
    if (miles == null) continue;
    const card = { ...item, id, kind: "place", distMi: miles };
    if (rail === "nights-out" && venueTaken(card)) continue;
    admit(bucket(rail), card, miles, CHRISTMAS_RAIL_RADIUS_MI[rail]);
  }

  const rails = CHRISTMAS_INTENT_RAIL_DEFS.map((def) => {
    let cards = uniqueCards(inside[def.id], ctx);
    let fallbackUsed = false;
    if (!cards.length && outside[def.id].length) {
      const nearest = outside[def.id].slice().sort((a, b) => a.distMi - b.distMi).slice(0, CHRISTMAS_FALLBACK_COUNT);
      cards = uniqueCards(nearest, ctx);
      fallbackUsed = cards.length > 0;
    }
    return { id: def.id, title: def.title, deck: def.deck, cards, fallbackUsed };
  });
  return { rails };
}
