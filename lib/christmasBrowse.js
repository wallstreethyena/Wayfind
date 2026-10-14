// lib/christmasBrowse.js: SERVER ONLY. The statewide Christmas browse
// (/christmas-in-florida and /api/christmas/browse), lead packet v4 2026-10-13.
//
// Reads the SAME merged data as the home rails (wf_events + the research data,
// lib/christmasResearch.js), so a listing is never on one surface and missing
// from the other. Hidden local rails hide nothing here: every published,
// current listing is in the unfiltered browse exactly once.
//
// Filters: region, category, date (this weekend, next 7 days, Nov / Dec / Jan,
// a specific date), price (free / paid / not announced), audience, a "Dates
// not announced" toggle (undated season listings are never inside a date
// filter) and a name or city search. Sort: nearest first when a location is
// known, otherwise date then region.
import { isTrusted } from "./curatedEvents.js";
import { distanceMi } from "./curatedEvents.js";
import { christmasEventRail, CHRISTMAS_INTENT_RAIL_DEFS, CHRISTMAS_SEASON_END } from "./christmasIntentRails.js";
import { mergeChristmasResearch, CHRISTMAS_RESEARCH_CANONICAL, CHRISTMAS_WATCHLIST_2026 } from "./christmasResearch.js";
import { enrichChristmasEvent } from "./christmasPool.js";
import { christmasEventCard } from "./christmasCards.js";
import { fallEventLive } from "./fallPool.js";
import { hasUpcomingFallOccurrence } from "./fallIntentRails.js";
import { CHRISTMAS_DAY_TRIP_MI } from "./christmasCardCopy.js";

export const CHRISTMAS_BROWSE_PAGE_SIZE = 24;

export const CHRISTMAS_REGIONS = Object.freeze([
  "Panhandle", "North Florida & Big Bend", "First Coast", "Central Florida", "Daytona & Space Coast",
  "Tampa Bay", "Suncoast", "Southwest Florida", "Treasure Coast & Palm Beaches", "South Florida & Keys",
]);

// Filter key -> label, and which research categories or rails it covers.
export const CHRISTMAS_BROWSE_CATEGORIES = Object.freeze([
  { id: "lights", label: "Light displays", categories: ["lights", "neighborhood-lights"], rails: ["lights"] },
  { id: "gardens", label: "Gardens", categories: ["gardens"] },
  { id: "drive-thru", label: "Drive thru lights", categories: ["drive-thru"] },
  { id: "parades", label: "Parades", categories: ["parade"], rails: ["parades"] },
  { id: "boat-parades", label: "Boat parades", categories: ["boat-parade"], rails: ["boat-parades"] },
  { id: "markets", label: "Markets and festivals", categories: ["market", "festival", "village", "downtown"], rails: ["towns-markets"] },
  { id: "tree-lightings", label: "Tree lightings", categories: ["tree-lighting"] },
  { id: "santa", label: "Santa", categories: ["santa"] },
  { id: "trains", label: "Trains", categories: ["train"] },
  { id: "cruises", label: "Cruises", categories: ["cruise"] },
  { id: "shows", label: "Concerts, ballet and theater", categories: ["concert", "ballet", "theater"], rails: ["shows-outings"] },
  { id: "historic-homes", label: "Historic homes and museums", categories: ["historic-home", "museum"] },
  { id: "theme-parks", label: "Theme parks", categories: ["theme-park"], rails: ["theme-parks"] },
  { id: "dining", label: "Dining and brunch", categories: ["dining"] },
  { id: "popup-bars", label: "Pop up bars", categories: ["popup-bar"], rails: ["popup-bars"] },
  { id: "parties", label: "Parties and nightlife", categories: ["party", "nightlife"], rails: ["parties"] },
  { id: "snow-ice", label: "Snow and ice", categories: ["snow-ice"] },
]);
const CATEGORY_BY_ID = new Map(CHRISTMAS_BROWSE_CATEGORIES.map((c) => [c.id, c]));

export const CHRISTMAS_BROWSE_DATES = Object.freeze([
  { id: "weekend", label: "This weekend" }, { id: "next7", label: "Next 7 days" },
  { id: "nov", label: "November" }, { id: "dec", label: "December" }, { id: "jan", label: "January" },
]);
export const CHRISTMAS_BROWSE_PRICES = Object.freeze([{ id: "free", label: "Free" }, { id: "paid", label: "Paid" }, { id: "unannounced", label: "Price not announced" }]);
export const CHRISTMAS_BROWSE_AUDIENCES = Object.freeze([{ id: "family", label: "Family" }, { id: "all-ages", label: "All ages" }, { id: "adults-only", label: "Adults only" }]);

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
function addDays(d, n) {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}
const weekday = (d) => { const [y, m, day] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, day)).getUTCDay(); };

// [from, to] for a date filter id, relative to the Eastern date `today`.
export function christmasDateWindow(id, today, specific = "") {
  if (DATE_RX.test(specific)) return [specific, specific];
  if (id === "weekend") {
    const wd = weekday(today);
    const fri = wd === 0 ? addDays(today, -2) : wd === 6 ? addDays(today, -1) : addDays(today, 5 - wd);
    const from = fri < today ? today : fri;
    return [from, addDays(fri, 2)];
  }
  if (id === "next7") return [today, addDays(today, 6)];
  if (id === "nov") return ["2026-11-01", "2026-11-30"];
  if (id === "dec") return ["2026-12-01", "2026-12-31"];
  if (id === "jan") return ["2027-01-01", "2027-01-31"];
  return null;
}

function inWindow(card, [from, to]) {
  if (card.season_undated || !card.start_date) return false;
  if (Array.isArray(card.occurrence_dates) && card.occurrence_dates.length) return card.occurrence_dates.some((d) => d >= from && d <= to);
  const end = card.end_date || card.start_date;
  return card.start_date <= to && end >= from;
}

// Region for a row the research does not cover: the research region of the
// same city, else the nearest research listing's region.
function regionFor(card) {
  if (card.region) return card.region;
  const city = String(card.city || "").toLowerCase();
  const same = CHRISTMAS_RESEARCH_CANONICAL.find((row) => String(row.city || "").toLowerCase() === city && row.region);
  if (same) return same.region;
  let best = null, bestMi = Infinity;
  for (const row of CHRISTMAS_RESEARCH_CANONICAL) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(card.lat)) continue;
    const mi = distanceMi({ lat: row.lat, lng: row.lng }, { lat: Number(card.lat), lng: Number(card.lng) });
    if (Number.isFinite(mi) && mi < bestMi) { bestMi = mi; best = row.region; }
  }
  return best;
}

const RAIL_CATEGORY = Object.freeze({ lights: "lights", "towns-markets": "market", "theme-parks": "theme-park", "boat-parades": "boat-parade", parades: "parade", "shows-outings": "concert", "popup-bars": "popup-bar", parties: "party" });
function priceKind(card) {
  if (card.price_kind) return card.price_kind;
  return card.is_free === true ? "free" : card.is_free === false ? "paid" : "unannounced";
}
function audienceOf(card) {
  if (card.audience) return card.audience;
  return Number(card.minimum_age) >= 18 ? "adults-only" : "all-ages";
}

function isCurrent(e, today) {
  if (e.season_undated === true) return today <= CHRISTMAS_SEASON_END;
  return fallEventLive(e, today) && hasUpcomingFallOccurrence(e, today);
}

// Every published, current Christmas listing as a browse card. Pure.
export function christmasBrowseListings(databaseRows, today) {
  const seen = new Set();
  const out = [];
  for (const row of mergeChristmasResearch(databaseRows || [])) {
    if (!isTrusted(row)) continue;
    const rail = christmasEventRail(row);
    if (!rail || !isCurrent(row, today)) continue;
    const e = enrichChristmasEvent(row, new Map());
    if (seen.has(e.event_id)) continue;
    seen.add(e.event_id);
    const card = christmasEventCard(e, { today });
    const categories = [...new Set([...(Array.isArray(e.christmas_categories) ? e.christmas_categories : []), RAIL_CATEGORY[rail]].filter(Boolean))];
    out.push({ ...card, region: regionFor(card), browse_categories: categories, price_kind: priceKind(card), audience: audienceOf(card) });
  }
  return out;
}

export function parseChristmasBrowseQuery(params) {
  const get = (k) => String((typeof params?.get === "function" ? params.get(k) : params?.[k]) || "").trim();
  const lat = Number.parseFloat(get("lat")), lng = Number.parseFloat(get("lng"));
  return {
    region: CHRISTMAS_REGIONS.includes(get("region")) ? get("region") : "",
    category: CATEGORY_BY_ID.has(get("category")) ? get("category") : "",
    when: CHRISTMAS_BROWSE_DATES.some((d) => d.id === get("when")) ? get("when") : "",
    date: DATE_RX.test(get("date")) ? get("date") : "",
    price: CHRISTMAS_BROWSE_PRICES.some((p) => p.id === get("price")) ? get("price") : "",
    audience: CHRISTMAS_BROWSE_AUDIENCES.some((a) => a.id === get("audience")) ? get("audience") : "",
    undated: get("undated") === "1",
    q: get("q").slice(0, 60),
    lat: Number.isFinite(lat) && lat > 24 && lat < 31.2 ? lat : null,
    lng: Number.isFinite(lng) && lng > -88 && lng < -79.5 ? lng : null,
    page: Math.max(1, Math.min(100, Number.parseInt(get("page"), 10) || 1)),
  };
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function filterChristmasBrowse(listings, query, today) {
  const window = query.date || query.when ? christmasDateWindow(query.when, today, query.date) : null;
  const cat = query.category ? CATEGORY_BY_ID.get(query.category) : null;
  const q = norm(query.q);
  return listings.filter((card) => {
    if (query.region && card.region !== query.region) return false;
    if (cat && !((cat.categories || []).some((c) => card.browse_categories.includes(c)) || (cat.rails || []).includes(card.christmasRail))) return false;
    if (query.undated && !card.season_undated) return false;
    if (window && !inWindow(card, window)) return false;
    if (query.price && card.price_kind !== query.price) return false;
    if (query.audience && card.audience !== query.audience) return false;
    if (q && !norm([card.name, card.title, card.city, card.venue].join(" ")).includes(q)) return false;
    return true;
  });
}

const firstDate = (card, today) => {
  if (card.season_undated || !card.start_date) return "9999-12-31";
  const nights = (card.occurrence_dates || []).filter((d) => d >= today);
  if (nights.length) return nights[0];
  return card.start_date > today ? card.start_date : today;
};

export function sortChristmasBrowse(cards, query, today) {
  const located = query.lat != null && query.lng != null;
  const withMiles = cards.map((card) => {
    const mi = located && Number.isFinite(Number(card.lat)) && card.lat != null ? distanceMi(card, { lat: query.lat, lng: query.lng }) : null;
    const distMi = Number.isFinite(mi) ? Math.round(mi * 10) / 10 : null;
    return { ...card, distMi, distanceNote: distMi == null ? null : distMi > CHRISTMAS_DAY_TRIP_MI ? "Day trip" : null };
  });
  const regionRank = (r) => { const i = CHRISTMAS_REGIONS.indexOf(r); return i < 0 ? 99 : i; };
  return withMiles.sort((a, b) => {
    if (located) {
      const am = a.distMi == null ? Infinity : a.distMi, bm = b.distMi == null ? Infinity : b.distMi;
      if (am !== bm) return am - bm;
    }
    const ad = firstDate(a, today), bd = firstDate(b, today);
    if (ad !== bd) return ad.localeCompare(bd);
    const rr = regionRank(a.region) - regionRank(b.region);
    if (rr) return rr;
    return String(a.title).localeCompare(String(b.title));
  });
}

// The slim card the browse sends to the browser (no server only fields).
export function christmasBrowseCardJson(card) {
  const keep = ["id", "kind", "title", "name", "city", "venue", "region", "lat", "lng", "start_date", "end_date", "when", "schedule", "select_nights", "occurrence_dates", "season_undated",
    "timed_entry", "overnight", "price_label", "price_kind", "is_free", "audience", "audience_label", "detailHref", "url", "hook", "image", "placeholder", "imageIsVenue", "christmasRail",
    "approxLocation", "distMi", "distanceNote", "place_id", "browse_categories", "ticket", "slug"];
  return Object.fromEntries(keep.filter((k) => card[k] !== undefined).map((k) => [k, card[k]]));
}

export function christmasBrowsePage(listings, query, today) {
  const filtered = sortChristmasBrowse(filterChristmasBrowse(listings, query, today), query, today);
  const size = CHRISTMAS_BROWSE_PAGE_SIZE;
  const start = (query.page - 1) * size;
  return {
    total: filtered.length,
    page: query.page,
    pageSize: size,
    hasMore: start + size < filtered.length,
    cards: filtered.slice(start, start + size).map(christmasBrowseCardJson),
  };
}

export function christmasBrowseFacets() {
  return {
    regions: CHRISTMAS_REGIONS,
    categories: CHRISTMAS_BROWSE_CATEGORIES.map(({ id, label }) => ({ id, label })),
    dates: CHRISTMAS_BROWSE_DATES, prices: CHRISTMAS_BROWSE_PRICES, audiences: CHRISTMAS_BROWSE_AUDIENCES,
    rails: CHRISTMAS_INTENT_RAIL_DEFS.map(({ id, title }) => ({ id, title })),
  };
}

export function christmasWatchlist() {
  return CHRISTMAS_WATCHLIST_2026.map((row) => ({ ...row }));
}
