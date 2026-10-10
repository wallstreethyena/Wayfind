// The eight intent first answers behind Wayfind's Christmas in Florida poster.
//
// Modeled on lib/fallIntentRails.js and reusing its date law and distance
// helper, with its OWN ordering law (distance groups, below). Each event lands
// in exactly ONE rail (or none), so a card never repeats down the collection
// under different headlines.

import { distanceMi } from "./curatedEvents.js";
import { hasUpcomingFallOccurrence, nextFallOccurrence } from "./fallIntentRails.js";
import { fallEventLive } from "./fallPool.js";
import { withoutAdultVenues } from "./placeCategory.js";
import { CHRISTMAS_EVENT_RAIL, CHRISTMAS_EXCEPTIONAL_IDS, CHRISTMAS_POPUP_SEASON_THROUGH } from "./christmasDiscoveries2026.js";
import { CHRISTMAS_CARD_LABELS, CHRISTMAS_NEARBY_MI, CHRISTMAS_DAY_TRIP_MI, CHRISTMAS_DISTANCE_GROUPS, christmasDistanceGroup, christmasDistanceLabel } from "./christmasCardCopy.js";

// Re-exported so server code and guards keep one import site.
export { CHRISTMAS_CARD_LABELS, CHRISTMAS_NEARBY_MI, CHRISTMAS_DAY_TRIP_MI, CHRISTMAS_DISTANCE_GROUPS, christmasDistanceGroup, christmasDistanceLabel };

// Christmas v3 (lead packet, 2026-10-09): EIGHT rails in this order. Decks obey
// the standing owner law (lib/railDeckCopy.js: 5 to 8 words, one sentence, no
// colon, no digits). Beaches and Manatees left the collection; their guides
// stay published at /guides and are simply not mapped here.
export const CHRISTMAS_INTENT_RAIL_DEFS = Object.freeze([
  Object.freeze({ id: "lights", title: "Lights & Glowing Gardens", deck: "Glowing gardens, light trails and drive thru displays." }),
  Object.freeze({ id: "towns-markets", title: "Towns, Markets & Festive Walks", deck: "Tree lightings, holiday markets and downtown strolls." }),
  Object.freeze({ id: "theme-parks", title: "Theme Parks, Snow, Trains & Santa", deck: "Park holidays, snow, Santa and festive train rides." }),
  Object.freeze({ id: "boat-parades", title: "Boat Parades & Coastal Traditions", deck: "Lit boats, surfing Santas and waterfront traditions." }),
  Object.freeze({ id: "parades", title: "Christmas Parades", deck: "Floats, marching bands and Santa through town." }),
  Object.freeze({ id: "shows-outings", title: "Shows, Historic Homes & Holiday Outings", deck: "Holiday shows, decorated historic homes and outings." }),
  Object.freeze({ id: "popup-bars", title: "Christmas Pop Up Bars (21+)", deck: "Festive cocktail pop ups for grown ups only." }),
  Object.freeze({ id: "parties", title: "Christmas Parties", deck: "Santa brunches, bar crawls and holiday parties." }),
]);
export const CHRISTMAS_RAIL_IDS = Object.freeze(CHRISTMAS_INTENT_RAIL_DEFS.map((rail) => rail.id));
const RAIL_SET = new Set(CHRISTMAS_RAIL_IDS);

// Each rail links its OWN guide; a guide is never reused across rails. Slugs
// only: the guide records are projected server side (lib/christmasGuides.js).
export const CHRISTMAS_RAIL_GUIDE_SLUGS = Object.freeze({
  lights: "florida-holiday-nights-out-2026",
  "theme-parks": "florida-theme-park-christmas-2026",
  "boat-parades": "florida-christmas-boat-parades-2026",
});

// ── The ordering law (Christmas only, lead packet 2026-10-09) ────────────────
// Per rail, per viewer: Nearby (35 mi or less), Within reach (35 to 90 mi),
// Day trip (over 90 mi, labeled). Groups in that order, so a 91 mi card can
// never sit ahead of an 18 mi card. Inside Nearby and Within reach: events by
// next date, then quality, then distance; places by quality (wfScore). Inside
// Day trip: nearest first. Never by affiliate.
// Lead decisions, 2026-10-09 (no padding with far trips):
//   * parties, pop up bars, parades: local only (within 90 mi); a rail with
//     nothing local is empty and the page hides it.
//   * lights, towns, boat parades, shows: Nearby and Within reach, then at most
//     CHRISTMAS_DAY_TRIP_MAX day trips: any item of the rail from 90 to 150 mi,
//     headliners from 150 to 200 mi, nothing past 200 mi.
//   * theme parks: every park event statewide (all exceptional), grouped.
const GROUP_RANK = Object.freeze({ nearby: 0, "within-reach": 1, "day-trip": 2 });
// The most day trips a non statewide rail may show.
export const CHRISTMAS_DAY_TRIP_MAX = 6;
// Day trip reach (lead, 2026-10-09): any eligible item of the rail up to
// CHRISTMAS_DAY_TRIP_ANY_MI, a headliner up to CHRISTMAS_DAY_TRIP_CAP_MI, and
// nothing past that hard cap.
export const CHRISTMAS_DAY_TRIP_ANY_MI = 150;
export const CHRISTMAS_DAY_TRIP_CAP_MI = 200;
// Rails shown statewide (all groups), still in group order.
export const CHRISTMAS_STATEWIDE_RAILS = Object.freeze(["theme-parks"]);
// Rails that never show a day trip.
export const CHRISTMAS_LOCAL_ONLY_RAILS = Object.freeze(["parties", "popup-bars", "parades"]);
const EXCEPTIONAL = new Set(CHRISTMAS_EXCEPTIONAL_IDS);
export const isExceptional = (card) => card?.exceptional === true || EXCEPTIONAL.has(String(card?.event_id || card?.id || ""));
function dayTripEligible(card) {
  const mi = Number(card.distMi);
  if (!Number.isFinite(mi) || mi > CHRISTMAS_DAY_TRIP_CAP_MI) return false;
  return mi <= CHRISTMAS_DAY_TRIP_ANY_MI || isExceptional(card);
}

const BOAT_RX = /boat parade|regatta|boat-a-long|lighted boat|light boat/i;
const PARADE_RX = /\bparade\b/i;
const LIGHTS_RX = /\blights?\b|lantern|glow/i;
const NIGHTS_RX = /christmas|holiday|lights|tree lighting|santa|winter (?:festival|market|village|wonderland)|nutcracker|enchant|noel|yule|grinch|winterfest/i;
// Never Christmas, however the other words match.
const NEVER_RX = /veterans boat parade|clearwater jazz holiday|florida winter music festival|winter park autumn art festival|dear evan hansen|anastasia|indie flea/i;
const SPOOKY_RX = /halloween|spooky|haunt|fright|howl o scream|howl-o-scream|trick or treat|pumpkin|oktoberfest|\bboo\b/i;

const STRONG_RX = /christmas|holiday|santa|nutcracker|noel|yule|grinch|winter/i;
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

// Exactly one rail id, or null. The registry's explicit rail wins
// (lib/christmasDiscoveries2026.js); the name regex is only a fallback for
// unmapped rows, and only inside the season window.
export function christmasEventRail(event) {
  if (!event) return null;
  const id = String(event.event_id || event.id || "");
  const name = nameOf(event);
  if (NEVER_RX.test(name) || SPOOKY_RX.test(name)) return null;
  const explicit = String(event.christmas_rail || CHRISTMAS_EVENT_RAIL[id] || "");
  if (explicit) return RAIL_SET.has(explicit) ? explicit : null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  // A stray fall/halloween tag does not veto an event whose own NAME says
  // Christmas or holiday. Halloween words in the name are already refused above.
  if (tags.some((tag) => /^(?:halloween|spooky|fall)$/i.test(String(tag))) && !STRONG_RX.test(name)) return null;
  if (!inChristmasWindow(event)) return null;
  if (BOAT_RX.test(name)) return "boat-parades";
  if (PARADE_RX.test(name)) return "parades";
  if (!NIGHTS_RX.test(name)) return null;
  return LIGHTS_RX.test(name) && !/market|festival|tree lighting/i.test(name) ? "lights" : "towns-markets";
}

function itemDistance(item, ctx) {
  if (Number.isFinite(item?.distMi)) return Number(item.distMi);
  const value = distanceMi(item, ctx);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

const normName = (card) => String(card?.name || card?.event_name || card?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Quality inside a group. Events: the better sourced, better verified row.
// Places: the governed Wayfind score. Affiliate data is never read here.
const eventQuality = (card) => (Number(card.source_tier) > 0 ? 1 / Number(card.source_tier) : 0) + (card.verification_confidence === "high" ? 0.5 : 0);
const placeQuality = (card) => (Number.isFinite(card.governed_score) ? card.governed_score : Number(card.wfScore) || 0);

export function christmasOrder(a, b, ctx = {}) {
  const ga = GROUP_RANK[christmasDistanceGroup(a.distMi)] ?? 3;
  const gb = GROUP_RANK[christmasDistanceGroup(b.distMi)] ?? 3;
  if (ga !== gb) return ga - gb;
  // Day trips: nearest first (lead, 2026-10-09).
  if (ga === GROUP_RANK["day-trip"]) {
    const d = (Number(a.distMi) || 0) - (Number(b.distMi) || 0);
    if (d) return d;
  }
  const ae = a.kind === "event", be = b.kind === "event";
  if (ae !== be) return ae ? -1 : 1;
  if (ae) {
    const ad = nextFallOccurrence(a, ctx.today) || "9999-12-31";
    const bd = nextFallOccurrence(b, ctx.today) || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    const q = eventQuality(b) - eventQuality(a);
    if (q) return q;
  } else {
    const q = placeQuality(b) - placeQuality(a);
    if (q) return q;
  }
  return (Number(a.distMi) || 0) - (Number(b.distMi) || 0) || String(a.id).localeCompare(String(b.id));
}

// One card per id, per name, per event series AND per venue: two cards for the
// same place are one recommendation, never number padding. Cards are ordered
// by the law FIRST, so the card that survives is the one the law ranks first.
function uniqueCards(cards, ctx) {
  const seen = { ids: new Set(), names: new Set(), series: new Set(), venues: new Set() };
  return cards.slice().sort((a, b) => christmasOrder(a, b, ctx)).filter((card) => {
    const id = String(card?.id || card?.event_id || "");
    const name = normName(card);
    const family = card.kind === "event" && card.event_series_id ? String(card.event_series_id) : "";
    const venue = String(card.kind === "event" ? (card.place_id || "") : id);
    if (!id || !name || seen.ids.has(id) || seen.names.has(name) || (family && seen.series.has(family)) || (venue && seen.venues.has(venue))) return false;
    seen.ids.add(id);
    seen.names.add(name);
    if (family) seen.series.add(family);
    if (venue) seen.venues.add(venue);
    return true;
  });
}

function eventIsLive(event, today) {
  return fallEventLive(event, today) && hasUpcomingFallOccurrence(event, today);
}

export function composeChristmasIntentRails(events, places, { lat = null, lng = null, today = "", now = new Date() } = {}) {
  places = withoutAdultVenues(places);
  const ctx = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, now, today } : { now, today };
  const pool = Object.fromEntries(CHRISTMAS_RAIL_IDS.map((id) => [id, []]));

  for (const event of Array.isArray(events) ? events : []) {
    const rail = christmasEventRail(event);
    if (!rail || !pool[rail] || !eventIsLive(event, today)) continue;
    const miles = itemDistance(event, ctx);
    if (miles == null) continue;
    pool[rail].push({ ...event, id: event.id || event.event_id, kind: "event", distMi: miles });
  }

  for (const item of Array.isArray(places) ? places : []) {
    const id = String(item?.id || item?.place_id || "");
    const rail = String(item?.christmasRail || "");
    if (!id || !pool[rail]) continue;
    // A pop up bar has no dated night, only a confirmed season: it leaves the
    // collection when that season is over (Eastern date, siteTodayStr).
    if (rail === "popup-bars" && today && today > CHRISTMAS_POPUP_SEASON_THROUGH) continue;
    const miles = itemDistance(item, ctx);
    if (miles == null) continue;
    pool[rail].push({ ...item, id, kind: "place", distMi: miles });
  }

  const rails = CHRISTMAS_INTENT_RAIL_DEFS.map((def) => {
    const ordered = uniqueCards(pool[def.id], ctx).map((card) => ({ ...card, distanceGroup: christmasDistanceGroup(card.distMi) }));
    const close = ordered.filter((card) => card.distanceGroup !== "day-trip");
    const far = ordered.filter((card) => card.distanceGroup === "day-trip");
    let dayTrips = [];
    if (CHRISTMAS_STATEWIDE_RAILS.includes(def.id)) dayTrips = far;
    else if (!CHRISTMAS_LOCAL_ONLY_RAILS.includes(def.id)) dayTrips = far.filter(dayTripEligible).slice(0, CHRISTMAS_DAY_TRIP_MAX);
    return { id: def.id, title: def.title, deck: def.deck, cards: [...close, ...dayTrips], fallbackUsed: false };
  });
  return { rails };
}
