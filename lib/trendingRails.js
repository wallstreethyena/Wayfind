// Trending Now rails (owner, 2026-11-05: "organize it into rails — one rail
// for food, one for festivals, one for parties, one for shows and events and
// one for everything else that is trending").
//
// The homepage TRENDING NOW poster opens five shelves. Each shelf mixes the
// two kinds of trend Wayfind can evidence:
//
//   • dated happenings this week (wf_events + the live event feed), with any
//     row the Tuesday/Thursday trend scout tagged `wf-trending` ranked first;
//   • places from the trending rail pool (lib/railSelect.js: the owner's
//     curated trends, real spike flags, creator video), sorted onto a shelf
//     by what the place IS.
//
// The scout steers a row onto a shelf with a `trend-<rail>` tag (for example
// `trend-festivals`). Without a tag the row is classified here, so a shelf
// never depends on the scout having run. Nothing is padded: an empty shelf
// is not rendered (TrendingRails.js).
import { byWayfindScore } from "./railRank.js";
// No import from posterEvents.js: posterEvents imports THIS module, so the
// show test below is self-contained (same segment words posterEventBucket reads).
function isShowEvent(event) {
  const segment = String(event?.segment || "").toLowerCase();
  const genre = String(event?.genre || "").toLowerCase();
  if (genre.includes("comedy") || /\b(comedian|stand[- ]?up|improv|comedy|open mic)\b/i.test(String(event?.name || ""))) return true;
  return /music|concert|sport|arts|theatre|theater/.test(segment);
}

export const TRENDING_RAIL_DEFS = Object.freeze([
  Object.freeze({ id: "food", title: "Trending Food", deck: "What Florida is eating this week." }),
  Object.freeze({ id: "festivals", title: "Trending Festivals", deck: "The festivals drawing the biggest crowds." }),
  Object.freeze({ id: "parties", title: "Trending Parties and Nightlife", deck: "Where the night is happening." }),
  Object.freeze({ id: "shows", title: "Trending Shows and Events", deck: "Concerts, comedy, theater and games worth tickets." }),
  Object.freeze({ id: "more", title: "Everything Else Trending", deck: "Everything else people are talking about." }),
]);
export const TRENDING_RAIL_IDS = Object.freeze(TRENDING_RAIL_DEFS.map((r) => r.id));
const RAIL_SET = new Set(TRENDING_RAIL_IDS);

/** Tag the scout writes on a wf_events row it verified as trending this week. */
export const TREND_TAG = "wf-trending";
export const TREND_RAIL_TAG_PREFIX = "trend-";
/** How far ahead a dated happening counts as "trending now" (days). */
export const TRENDING_EVENT_WINDOW_DAYS = 10;
/** Demand floor for a happening without a scout tag (eventPopularitySignal's
 * 0-100 scale: PredictHQ rank, or Wayfind popularity_score 7/10 and up). */
export const TRENDING_EVENT_MIN_SIGNAL = 70;

/** The shelf a scout tag pins a row to, or null. */
export function trendRailFromTags(tags) {
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw || "").trim().toLowerCase();
    if (!tag.startsWith(TREND_RAIL_TAG_PREFIX)) continue;
    const id = tag.slice(TREND_RAIL_TAG_PREFIX.length);
    if (RAIL_SET.has(id)) return id;
  }
  return null;
}

export function isScoutTrending(tags) {
  return (Array.isArray(tags) ? tags : []).some((t) => String(t || "").trim().toLowerCase() === TREND_TAG);
}

const FESTIVAL_RE = /\b(fest|festival|festivals|fiesta|faire?|carnival|jamboree|expo|jubilee)\b/i;
const PARTY_RE = /\b(party|parties|nightlife|dj|rave|bash|soir[eé]e|gala|crawl|night market|block party|silent disco|dance night|glow)\b/i;
const FOOD_RE = /\b(food|wine|beer|brew|brewery|taste|tasting|chef|dinner|brunch|bbq|barbecue|seafood|oyster|taco|burger|pizza|cocktail|spirits|sip)\b/i;

/** The shelf a dated happening belongs on. */
export function trendingEventRail(event) {
  if (!event) return "more";
  const pinned = event.trendRail && RAIL_SET.has(event.trendRail) ? event.trendRail : trendRailFromTags(event.tags);
  if (pinned) return pinned;
  const name = String(event.name || "");
  const segment = String(event.segment || "").toLowerCase();
  const genre = String(event.genre || "").toLowerCase();
  if (segment === "festival" || FESTIVAL_RE.test(name)) return "festivals";
  if (PARTY_RE.test(name) || /nightlife|party/.test(genre)) return "parties";
  if (segment === "food" || FOOD_RE.test(name)) return "food";
  if (isShowEvent(event)) return "shows";
  return "more";
}

const PARTY_TYPES = ["night_club", "bar", "pub", "brewery", "winery", "lounge", "cocktail", "wine_bar", "beer_garden", "karaoke", "dance_hall", "sports_bar", "nightlife"];
const FOOD_TYPES = ["restaurant", "cafe", "coffee", "bakery", "dessert", "ice_cream", "food", "meal", "diner", "pizza", "steak", "seafood", "brunch", "breakfast", "donut", "taco", "sushi", "bbq", "barbecue", "deli", "juice", "tea", "food_court", "food_truck"];
const SHOW_TYPES = ["performing_arts", "theater", "theatre", "concert", "amphitheater", "stadium", "arena", "comedy", "movie_theater", "cinema", "event_venue", "live_music", "music_venue", "opera", "symphony"];

function placeTypeText(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return [place?.primaryType, place?.primary_type, place?.category, place?.primaryCategory, ...types]
    .filter(Boolean).map((t) => String(t).toLowerCase()).join(" ");
}

/** The shelf a trending place belongs on (places never claim "festivals"). */
export function trendingPlaceRail(place) {
  if (!place) return "more";
  const pinned = place.trendRail && RAIL_SET.has(place.trendRail) ? place.trendRail : trendRailFromTags(place.tags);
  if (pinned) return pinned;
  const text = placeTypeText(place);
  const has = (list) => list.some((t) => text.includes(t));
  // Order matters: a brewery restaurant reads as nightlife, a dinner theater as a show.
  if (has(PARTY_TYPES)) return "parties";
  if (has(SHOW_TYPES)) return "shows";
  if (has(FOOD_TYPES)) return "food";
  return "more";
}

/** Split a place list onto the five shelves, keeping the incoming (ranked) order. */
export function splitTrendingPlaces(places) {
  const out = Object.fromEntries(TRENDING_RAIL_IDS.map((id) => [id, []]));
  const seen = new Set();
  for (const place of Array.isArray(places) ? places : []) {
    if (!place || !place.id || seen.has(place.id)) continue;
    seen.add(place.id);
    out[trendingPlaceRail(place)].push(place);
  }
  // The rail rank law (scripts/check-rail-rank-law.mjs): score DESC, then
  // reviews, distance, id — the one shared comparator, never a local copy.
  for (const id of TRENDING_RAIL_IDS) out[id].sort(byWayfindScore);
  return out;
}

/** True when a dated happening starts or is still running inside the window. */
export function inTrendingWindow(event, todayStr, days = TRENDING_EVENT_WINDOW_DAYS) {
  const start = String(event?.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayStr || ""))) return false;
  const end = String(event?.endDate || start).slice(0, 10);
  // Pure calendar arithmetic on the Eastern date the caller passed in
  // (siteTodayStr); no clock is read here, so no UTC day can leak in.
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  const limit = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  return end >= todayStr && start <= limit;
}
