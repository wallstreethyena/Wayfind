// The ten intent-first answers behind Wayfind's Fall / Augtober poster.
//
// A `fall` tag is necessary context, not sufficient evidence. Ordinary shows,
// restaurants and bars that merely happen between September and November do
// not become seasonal recommendations. Each classifier below requires the
// concrete product the rail promises, and returns ONE primary rail so the same
// event cannot repeat down the collection under different headlines.

import { distanceMi, scoreEvent } from "./curatedEvents.js";
import { FALL_DISCOVERY_RAIL } from "./fallDiscoveries2026.js";
import { eventFranchiseKey } from "./fallSkin.js";
import { railScoreOf } from "./railRank.js";

export const FALL_INTENT_RAIL_DEFS = Object.freeze([
  { id: "food", title: "Fall Drinks & Seasonal Bites", deck: "Florida's best seasonal sips and bites." },
  { id: "farms", title: "Pumpkin Patches & Fall Farms", deck: "Real farms, pumpkins, hayrides, and fall fun." },
  { id: "theme-parks", title: "Halloween Theme Parks", deck: "Florida park nights, matched to your vibe." },
  { id: "haunts", title: "Haunted Houses & Fright Nights", deck: "The scariest local haunts worth braving." },
  { id: "family", title: "Halloween With the Kids", deck: "Kid-safe Halloween fun without the nightmares." },
  { id: "oktoberfest", title: "Oktoberfest & Beer Gardens", deck: "German bites, cold beer, and live music." },
  { id: "date-night", title: "Spooky Date Night", deck: "Spooky nights made for two." },
  { id: "festivals", title: "Fall Festivals & Outdoor Nights", deck: "The fall events worth showing up for." },
  { id: "photos", title: "Florida Fall Photo Spots", deck: "Picture-perfect fall views worth the stop." },
  { id: "day-trips", title: "Florida Fall Day Trips", deck: "Seasonal escapes worth the extra miles." },
]);

const BASE_ORDER = FALL_INTENT_RAIL_DEFS.map((rail) => rail.id);
export const FALL_NEAR_MI = 27;
// Eight is the desired depth, not permission to leave the user's market.
// Every shelf has its own hard radius and remains honestly thin when the
// verified local inventory cannot meet that target.
export const FALL_MIN_RESULTS = 8;
export const FALL_RAIL_RADIUS_MI = Object.freeze({
  food: 27,
  farms: 45,
  "theme-parks": 60,
  haunts: 45,
  family: 27,
  oktoberfest: 45,
  "date-night": 27,
  festivals: 45,
  photos: 45,
  "day-trips": 60,
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

  // Owner supplied discoveries have an editorially chosen primary intent.
  // This explicit map prevents a family farm from duplicating into Family or
  // a seasonal cafe from being mistaken for a pumpkin farm by keyword alone.
  const discoveryRail = FALL_DISCOVERY_RAIL[event.event_id || event.id];
  if (discoveryRail) return discoveryRail;

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

// EVENTS vs PLACES compare on ONE normalized 0-100 scale (WO item 2). scoreEvent
// (lib/curatedEvents.js) is a *different* instrument on purpose — urgency,
// proximity-to-today, editorial/uniqueness/popularity and freshness, weighted
// to sum to at most ~10 — it answers "how compelling is this happening right
// now", not "how good is this venue". Comparing its raw ~0-10 output directly
// against wfScore's 0-100 meant a place's score numerically dominated almost
// every event (an event topping out near 10 could never outrank even a
// mediocre 40-wfScore place) — a second, quieter ranking bug sitting right
// behind the more visible ring one. FALL_EVENT_SCORE_SCALE puts scoreEvent on
// the SAME 0-100 magnitude wfScore already occupies, so an urgent, well-
// targeted event can outrank a merely-good place instead of being
// structurally crushed by the 10x larger place scale. This does not claim the
// two measure the same thing — it only stops one from silently out-massing
// the other on unit alone.
const FALL_EVENT_SCORE_SCALE = 10;

function normalizedCardScore(item, ctx) {
  if (item.kind === "event") {
    const raw = scoreEvent(item, ctx);
    return Number.isFinite(raw) ? raw * FALL_EVENT_SCORE_SCALE : null;
  }
  return railScoreOf(item);
}

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, distance ASC as a
// TIE-BREAK ONLY — never a pre-empting term. FALL_NEAR_MI / FALL_RAIL_RADIUS_MI
// remain ADMISSION rules (the radius filter in composeFallIntentRails below
// still refuses anything past a rail's radius); there is no longer a distance
// RING ahead of the score. That ring was the identical shape that broke Night
// Out: it exiled a wider-ring, higher-scoring card below a nearer,
// lower-scoring one regardless of the number on the card.
function rankCards(a, b, ctx) {
  const av = normalizedCardScore(a, ctx);
  const bv = normalizedCardScore(b, ctx);
  if (av == null && bv != null) return 1;
  if (bv == null && av != null) return -1;
  if (av != null && bv != null && av !== bv) return bv - av;
  const aMiles = itemDistance(a, ctx);
  const bMiles = itemDistance(b, ctx);
  return (Number.isFinite(aMiles) ? aMiles : Infinity) - (Number.isFinite(bMiles) ? bMiles : Infinity);
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
  const candidates = Object.fromEntries(FALL_INTENT_RAIL_DEFS.map((rail) => [rail.id, []]));
  for (const event of Array.isArray(events) ? events : []) {
    const rail = fallEventRail(event);
    const miles = rail ? itemDistance(event, ctx) : null;
    if (rail && candidates[rail] && miles != null && miles <= FALL_RAIL_RADIUS_MI[rail]) {
      candidates[rail].push({ ...event, kind: "event", distMi: miles });
    }
  }
  for (const place of Array.isArray(places) ? places : []) {
    const rail = String(place?.fallRail || "");
    const miles = rail ? itemDistance(place, ctx) : null;
    if (rail && candidates[rail] && miles != null && miles <= FALL_RAIL_RADIUS_MI[rail]) {
      candidates[rail].push({ ...place, kind: "place", distMi: miles });
    }
  }
  const byId = new Map(FALL_INTENT_RAIL_DEFS.map((rail) => [rail.id, rail]));
  const rails = fallRailOrder(today).map((id) => {
    const cards = uniqueCards(candidates[id], ctx);
    return { ...byId.get(id), cards, fallbackUsed: false };
  });
  return { phase: fallPhase(today), rails };
}
