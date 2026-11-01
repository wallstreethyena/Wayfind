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
import { isTrusted, eventOrganizerTicketUrl } from "./curatedEvents.js";
import { eventTicketDeal } from "./eventTicketDeals.js";
import { distanceMi } from "./curatedEvents.js";
import { christmasEventRail, CHRISTMAS_INTENT_RAIL_DEFS, CHRISTMAS_SEASON_END } from "./christmasIntentRails.js";
import { mergeChristmasResearch, CHRISTMAS_RESEARCH_CANONICAL, CHRISTMAS_WATCHLIST_2026 } from "./christmasResearch.js";
import { enrichChristmasEvent } from "./christmasPool.js";
import { christmasEventCard } from "./christmasCards.js";
import { fallEventLive } from "./fallPool.js";
import { hasUpcomingFallOccurrence } from "./fallIntentRails.js";
import { CHRISTMAS_DAY_TRIP_MI } from "./christmasCardCopy.js";
import { christmasCopy } from "./christmasCardCopy.js";
import { seasonalHospitalityIds, seasonalHospitalityPlaces, reconcileSeasonalHospitalityEvents } from "./seasonalHospitality.js";
import { SEASONAL_HOSPITALITY_2026 } from "./seasonalHospitalityCatalog2026.js";
import { brandKey } from "./placeDedupe.js";
import { placeCardDetailHref } from "./placeCardRoute.js";
import { supabaseLive } from "./supabase.js";

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
  { id: "dining", label: "Dining and brunch", categories: ["dining"], rails: ["seasonal-food"] },
  { id: "popup-bars", label: "Bars and themed dining", categories: ["popup-bar", "themed-dining"], rails: ["popup-bars"] },
  { id: "parties", label: "Parties and nightlife", categories: ["party", "nightlife"], rails: ["parties"] },
  { id: "snow-ice", label: "Snow and ice", categories: ["snow-ice"] },
]);
const CATEGORY_BY_ID = new Map(CHRISTMAS_BROWSE_CATEGORIES.map((c) => [c.id, c]));

// The pill menu on /christmas-in-florida (owner direction 2026-11-01: one menu
// for everything). A pill is a short label over one or more browse categories
// (or the family audience). `category` in the URL and API accepts a category id
// OR a pill id, so ?category=lights lands on the Light shows pill. A pill is
// offered only when at least one listing matches it (christmasBrowsePills).
export const CHRISTMAS_BROWSE_PILLS = Object.freeze([
  { id: "lights", label: "Light shows", categories: ["lights", "gardens", "drive-thru"] },
  { id: "theme-parks", label: "Theme parks", categories: ["theme-parks"] },
  { id: "parades", label: "Parades and boats", categories: ["parades", "boat-parades"] },
  { id: "shows", label: "Shows and ballet", categories: ["shows"] },
  { id: "markets", label: "Markets and Santa", categories: ["markets", "tree-lightings", "santa"] },
  { id: "popup-bars", label: "Bars and dining", categories: ["popup-bars", "dining"] },
  { id: "parties", label: "Parties", categories: ["parties"] },
  { id: "family", label: "Family friendly", audience: "family" },
].map((pill) => Object.freeze(pill)));
const PILL_BY_ID = new Map(CHRISTMAS_BROWSE_PILLS.map((p) => [p.id, p]));
// The category definitions a `category` query value stands for.
function categoryDefsFor(id) {
  if (!id) return [];
  const pill = PILL_BY_ID.get(id);
  if (pill && pill.categories) return pill.categories.map((c) => CATEGORY_BY_ID.get(c)).filter(Boolean);
  return CATEGORY_BY_ID.has(id) ? [CATEGORY_BY_ID.get(id)] : [];
}
const matchesDefs = (card, defs) => defs.some((cat) => (cat.categories || []).some((c) => (card.browse_categories || []).includes(c)) || (cat.rails || []).includes(card.christmasRail));
export function christmasBrowsePills(listings) {
  const cards = Array.isArray(listings) ? listings : [];
  return CHRISTMAS_BROWSE_PILLS.filter((pill) => cards.some((card) => (pill.audience ? card.audience === pill.audience : matchesDefs(card, categoryDefsFor(pill.id)))))
    .map(({ id, label }) => ({ id, label }));
}

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

function inWindow(card, [from, to], requireServiceDate = false) {
  if (card.season_undated) return false;
  if (Array.isArray(card.occurrence_dates) && card.occurrence_dates.length) return card.occurrence_dates.some((d) => d >= from && d <= to);
  // A seasonal envelope is not a service calendar. Select-night venues may
  // close on holidays or weekdays inside the run, so only explicit dates can
  // qualify them for a particular day, next week or this weekend.
  if (requireServiceDate && card.hospitalityEvidence && card.select_nights) return false;
  if (!card.start_date) return false;
  const end = card.end_date || (card.closing_unannounced ? CHRISTMAS_SEASON_END : card.start_date);
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

const RAIL_CATEGORY = Object.freeze({ lights: "lights", "towns-markets": "market", "theme-parks": "theme-park", "boat-parades": "boat-parade", parades: "parade", "shows-outings": "concert", "popup-bars": "popup-bar", "seasonal-food": "dining", parties: "party" });
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
  if (e.closing_unannounced === true && !e.end_date) return today <= CHRISTMAS_SEASON_END;
  return fallEventLive(e, today) && hasUpcomingFallOccurrence(e, today);
}

// Every published, current Christmas listing as a browse card. Pure.
export function christmasBrowseListings(databaseRows, today, inventory = [], catalog = SEASONAL_HOSPITALITY_2026) {
  const seen = new Set();
  // The wf_events slugs: those rows have their own event page, so their cards
  // link to it (live fix 2026-10-14: 103 merged cards linked off site because
  // the browse built its cards without these, unlike the rails route).
  const pageSlugs = new Set((databaseRows || []).map((row) => row?.slug).filter(Boolean));
  const out = [];
  for (const row of mergeChristmasResearch(databaseRows || [])) {
    if (!isTrusted(row)) continue;
    const rail = christmasEventRail(row);
    if (!rail || !isCurrent(row, today)) continue;
    const e = enrichChristmasEvent(row, new Map());
    if (seen.has(e.event_id)) continue;
    seen.add(e.event_id);
    const card = christmasEventCard(e, { today, pageSlugs });
    const categories = [...new Set([...(Array.isArray(e.christmas_categories) ? e.christmas_categories : []), RAIL_CATEGORY[rail]].filter(Boolean))];
    out.push({ ...card, region: regionFor(card), browse_categories: categories, price_kind: priceKind(card), audience: audienceOf(card) });
  }
  // The same takeover keeps its event identity; a separate party at a
  // restaurant does not erase its seasonal menu. Match exactly as the poster.
  const reconciled = reconcileSeasonalHospitalityEvents(out, seasonalHospitalityPlaces(inventory, "christmas", today, catalog));
  out.splice(0, out.length, ...reconciled.events);
  for (const place of reconciled.places) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    const dates = place.occurrence_dates || [];
    const card = {
      ...place,
      start_date: place.seasonalStart, end_date: place.seasonalThrough,
      season_undated: !place.seasonalStart && !place.seasonalThrough && !dates.length,
      closing_unannounced: !!place.seasonalStart && !place.seasonalThrough && !dates.length,
      seasonalWhen: christmasCopy(place.seasonalWhen),
      hook: christmasCopy(place.take),
      detailHref: placeCardDetailHref(place.place_id),
      browse_categories: [RAIL_CATEGORY[place.christmasRail]].filter(Boolean),
      price_kind: "unannounced", audience: "unannounced",
    };
    out.push({ ...card, region: regionFor(card) });
  }
  return out;
}

export function parseChristmasBrowseQuery(params) {
  const get = (k) => String((typeof params?.get === "function" ? params.get(k) : params?.[k]) || "").trim();
  const lat = Number.parseFloat(get("lat")), lng = Number.parseFloat(get("lng"));
  return {
    region: CHRISTMAS_REGIONS.includes(get("region")) ? get("region") : "",
    category: CATEGORY_BY_ID.has(get("category")) || PILL_BY_ID.has(get("category")) ? get("category") : "",
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
  const requireServiceDate = !!query.date || query.when === "weekend" || query.when === "next7";
  const pill = query.category ? PILL_BY_ID.get(query.category) : null;
  const catDefs = categoryDefsFor(query.category);
  const q = norm(query.q);
  return listings.filter((card) => {
    if (query.region && card.region !== query.region) return false;
    if (pill && pill.audience && card.audience !== pill.audience) return false;
    if (query.category && !(pill && pill.audience) && !matchesDefs(card, catDefs)) return false;
    if (query.undated && !card.season_undated) return false;
    if (window && !inWindow(card, window, requireServiceDate)) return false;
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

// 0 = an event with a real ticket way in, 1 = everything else. The partner
// registry is read only for whether a ticket exists (never its provider).
function ticketTier(card) {
  if (!card || card.kind === "place" || !card.id) return 1;
  return eventOrganizerTicketUrl(card) || eventTicketDeal(card.id) ? 0 : 1;
}

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
    // One list for the whole page (owner 2026-11-01): events with a real way in
    // (the organizer's ticket page or a partner ticket) come first. A tier only,
    // never a partner or price preference: within a tier the order is the date.
    const at = ticketTier(a), bt = ticketTier(b);
    if (at !== bt) return at - bt;
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
    "timed_entry", "overnight", "closing_unannounced", "price_label", "price_kind", "is_free", "audience", "audience_label", "detailHref", "url", "hook", "image", "placeholder", "imageIsVenue", "christmasRail",
    "approxLocation", "distMi", "distanceNote", "place_id", "browse_categories", "ticket", "slug", "photos",
    // A licensed photo's credit travels with it (CC BY-SA attribution, live
    // 2026-10-14: browse cards showed the Wikimedia photos with no credit).
    "photoAttr", "photoAttrHref", "rating", "reviews", "wfScore", "category", "primaryType", "types", "take", "seasonalWhen", "sourceUrl", "hospitalityEvidence"];
  return Object.fromEntries(keep.filter((k) => card[k] !== undefined).map((k) => [k, card[k]]));
}

// The directory (christmasBrowseListings) keeps every location so a city
// search can still name the farther branch. The page the reader sees keeps
// one place card per brand: the closer branch when a location is known,
// otherwise the higher Wayfind score (then reviews).
function collapseBrowseBrands(cards, located) {
  const at = new Map();
  const out = [];
  for (const card of cards) {
    if (!card || card.kind !== "place") { out.push(card); continue; }
    const key = brandKey(card);
    if (!key) { out.push(card); continue; }
    if (!at.has(key)) { at.set(key, out.length); out.push(card); continue; }
    if (located) continue;
    const i = at.get(key);
    const current = out[i];
    const score = (Number(card.wfScore) || 0) - (Number(current.wfScore) || 0);
    const reviews = (Number(card.reviews) || 0) - (Number(current.reviews) || 0);
    if (score > 0 || (score === 0 && reviews > 0)) out[i] = card;
  }
  return out;
}

export function christmasBrowsePage(listings, query, today) {
  const located = query.lat != null && query.lng != null;
  const filtered = collapseBrowseBrands(sortChristmasBrowse(filterChristmasBrowse(listings, query, today), query, today), located);
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

// ── One cache for the page and the API (Fable audit, 2026-10-13) ─────────────
// /christmas-in-florida is dynamic (filters come from the URL), so both it and
// /api/christmas/browse read through this: the merged listings are memoized
// per Eastern day for 10 minutes, and each normalized filter set's page for 10
// minutes (bounded). A failed wf_events read is never cached.
export const CHRISTMAS_BROWSE_TTL_MS = 10 * 60 * 1000;
const LISTINGS_MEMO = { day: "", at: 0, listings: null };
const PAGE_MEMO = new Map();
export function christmasBrowseQueryKey(query) {
  const q = query || {};
  return JSON.stringify(["region", "category", "when", "date", "price", "audience", "undated", "q", "lat", "lng", "page"].map((k) => [k, q[k] ?? ""]));
}
const HOSPITALITY_PLACE_COLUMNS = "place_id,name,lat,lng,metro,category,primary_type,google_types,signals,editorial,photo_ref,status,excluded";
export async function fetchChristmasHospitalityInventory(ids) {
  if (!ids.length) return [];
  if (!supabaseLive) throw new Error("Christmas hospitality inventory unavailable: Supabase is not configured");
  const result = await supabaseLive.from("wf_inventory").select(HOSPITALITY_PLACE_COLUMNS)
    .in("place_id", ids).abortSignal(AbortSignal.timeout(3500));
  if (result.error) throw new Error("Christmas hospitality inventory unavailable: " + String(result.error.message || result.error));
  if (!Array.isArray(result.data)) throw new Error("Christmas hospitality inventory returned no data array");
  return result.data;
}
export async function christmasBrowseCached(query, today, fetchRows, { now = Date.now(), fetchPlaces = fetchChristmasHospitalityInventory, catalog = SEASONAL_HOSPITALITY_2026 } = {}) {
  if (!LISTINGS_MEMO.listings || LISTINGS_MEMO.day !== today || now - LISTINGS_MEMO.at > CHRISTMAS_BROWSE_TTL_MS) {
    // Publish the cache only after both owned reads succeed. A partial event
    // response must not hide the hospitality catalog for another ten minutes.
    const [rows, inventory] = await Promise.all([
      fetchRows(), fetchPlaces(seasonalHospitalityIds("christmas", today, catalog)),
    ]);
    if (!Array.isArray(inventory)) throw new Error("Christmas hospitality inventory returned no data array");
    const listings = christmasBrowseListings(rows, today, inventory, catalog);
    LISTINGS_MEMO.day = today; LISTINGS_MEMO.at = now; LISTINGS_MEMO.listings = listings;
    PAGE_MEMO.clear();
  }
  const key = today + "|" + christmasBrowseQueryKey(query);
  const held = PAGE_MEMO.get(key);
  if (held && now - held.at <= CHRISTMAS_BROWSE_TTL_MS) return { ...held.value, cached: true };
  const value = { listings: LISTINGS_MEMO.listings, page: christmasBrowsePage(LISTINGS_MEMO.listings, query, today) };
  if (PAGE_MEMO.size >= 200) PAGE_MEMO.delete(PAGE_MEMO.keys().next().value);
  PAGE_MEMO.set(key, { at: now, value });
  return value;
}
