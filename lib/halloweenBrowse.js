// Client/server pure browse contract. Venue/product coordinates only; no city
// centres, no radius widening, no inferred family suitability or ratings.
import { toDisplayScore } from "./score.js";

export const HALLOWEEN_BROWSE_RADIUS_MI = 40;
export const HALLOWEEN_BROWSE_CATEGORIES = Object.freeze([
  { id: "family", title: "Family Halloween" },
  { id: "scares", title: "Haunted houses and scare parks" },
  { id: "ghost", title: "Ghost tours and haunted walks" },
  { id: "parties", title: "Halloween parties and nightlife" },
]);
const CATEGORY_IDS = new Set(HALLOWEEN_BROWSE_CATEGORIES.map((row) => row.id));
const EARTH_RADIUS_MI = 3958.7613;

export function halloweenCoordinates(row, now = Date.now()) {
  if (!row || row.coordApprox === true || row.approxLocation === true || row.coord_approx === true) return null;
  if (row.coordinateExpiresAt != null && !(Number.isFinite(Date.parse(row.coordinateExpiresAt)) && now <= Date.parse(row.coordinateExpiresAt))) return null;
  const { lat, lng } = row;
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

export function halloweenDistanceMi(a, b, now = Date.now()) {
  if (!halloweenCoordinates(a, now) || !halloweenCoordinates(b, now)) return null;
  const rad = Math.PI / 180;
  const angle = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(Math.min(1, angle)), Math.sqrt(Math.max(0, 1 - angle)));
}

function categoryOf(card, browseType) {
  // A negative adult-only flag is not evidence that a ghost tour suits kids.
  if (card.adultOnly === true) return card.kind === "pub_crawl" ? "parties" : browseType === "tour" ? "ghost" : "scares";
  if (browseType === "tour") return card.kind === "haunted_attraction" || card.group === "event" ? "scares" : card.kind === "pub_crawl" ? "parties" : "ghost";
  if (card.filters?.includes("family")) return "family";
  if (card.id === "channelside" || card.browseCategory === "parties") return "parties";
  if (card.filters?.some((value) => value === "major" || value === "local")) return "scares";
  return CATEGORY_IDS.has(card.browseCategory) ? card.browseCategory : null;
}

function priceOf(card, browseType) {
  if (card.bookable === false) return { sortPrice: null, priceBasis: "unavailable" };
  if (browseType === "haunt" && card.price?.kind === "included") return { sortPrice: null, priceBasis: "included" };
  const price = browseType === "tour" ? card.fromPrice
    : card.price?.kind === "from" ? card.price.amount : card.price?.kind === "range" ? card.price.low : null;
  const basis = browseType === "haunt" ? "per person" : card.priceUnit;
  return Number.isFinite(price) && price >= 0 && (basis === "per person" || basis === "per group")
    ? { sortPrice: price, priceBasis: basis } : { sortPrice: null, priceBasis: "unknown" };
}

function ratingOf(card, browseType) {
  const raw = card.governed_score ?? card.wfScore;
  const score = Number(raw) > 0 && Number(raw) <= 100 ? toDisplayScore(raw) : null;
  if (score != null) return { ratingKind: "wayfind", ratingValue: score };
  if (browseType === "tour" && Number.isFinite(card.rating) && card.rating > 0 && card.rating <= 5 && Number.isFinite(card.reviews) && card.reviews > 0) {
    return { ratingKind: "traveler", ratingValue: card.rating };
  }
  return { ratingKind: null, ratingValue: null };
}

// The incoming model has already applied expiry, source availability and
// product holds. Keep its facts, source ids and CTA objects unchanged.
export function halloweenBrowseCards(model, { now = Date.now() } = {}) {
  const out = [];
  const seen = new Map();
  for (const [browseType, rows] of [["haunt", model?.haunts], ["tour", model?.eventTours], ["tour", model?.tours]]) {
    for (const card of Array.isArray(rows) ? rows : []) {
      if (!card || !card.id || card.id === "sideshowObscura") continue;
      const key = browseType + ":" + (card.browseIdentity || card.eventId || card.id);
      const browseCategory = categoryOf(card, browseType);
      if (!browseCategory) continue;
      const coords = halloweenCoordinates(card, now);
      const normalized = { ...card, browseType, browseCategory, ...priceOf(card, browseType), ...ratingOf(card, browseType),
        lat: coords?.lat ?? null, lng: coords?.lng ?? null };
      if (seen.has(key)) {
        const index = seen.get(key);
        if (!halloweenCoordinates(out[index], now) && coords) out[index] = normalized;
        continue;
      }
      seen.set(key, out.length);
      out.push(normalized);
    }
  }
  return out;
}

const PRICE_GROUPS = Object.freeze({ "per person": "Per person ticket prices", "per group": "Private group prices", included: "Included with paid admission", unknown: "Check current price", unavailable: "Currently unavailable" });
const PRICE_ORDER = Object.keys(PRICE_GROUPS);
const RATING_GROUPS = Object.freeze({ wayfind: "Wayfind Score", traveler: "Traveler ratings on Viator", unrated: "No comparable rating available" });
const RATING_ORDER = Object.keys(RATING_GROUPS);
const reviewsOf = (card) => Number.isFinite(card.reviews) && card.reviews > 0 ? card.reviews : 0;
const stable = (a, b) => String(a.id).localeCompare(String(b.id));

export function sortHalloweenBrowse(cards, sort = "rated") {
  const mode = ["rated", "near", "price"].includes(sort) ? sort : "rated";
  const miles = (card) => Number.isFinite(card.distanceMi) ? card.distanceMi : Infinity;
  const ranked = cards.map((card) => ({ ...card, browseGroup: mode === "price" ? PRICE_GROUPS[card.priceBasis] || PRICE_GROUPS.unknown
    : mode === "rated" ? RATING_GROUPS[card.ratingKind || "unrated"] : "" }));
  return ranked.sort((a, b) => {
    if (mode === "price") {
      const group = PRICE_ORDER.indexOf(a.priceBasis) - PRICE_ORDER.indexOf(b.priceBasis);
      if (group) return group;
      if (a.sortPrice != null && b.sortPrice != null && a.sortPrice !== b.sortPrice) return a.sortPrice - b.sortPrice;
    } else if (mode === "rated") {
      const group = RATING_ORDER.indexOf(a.ratingKind || "unrated") - RATING_ORDER.indexOf(b.ratingKind || "unrated");
      if (group) return group;
      if (a.ratingValue != null && b.ratingValue != null && a.ratingValue !== b.ratingValue) return b.ratingValue - a.ratingValue;
      // Match the Wayfind score law; review depth precedes distance at a tie.
      const reviewDiff = reviewsOf(b) - reviewsOf(a);
      if (a.ratingKind && reviewDiff) return reviewDiff;
    }
    return miles(a) - miles(b) || stable(a, b);
  });
}

export function halloweenBrowse(model, { lat = null, lng = null, sort = "rated", category = "all", now = Date.now() } = {}) {
  const all = halloweenBrowseCards(model, { now });
  const located = all.filter((card) => halloweenCoordinates(card, now));
  const coverage = { total: all.length, located: located.length, unknown: all.length - located.length };
  const origin = halloweenCoordinates({ lat, lng });
  const cards = origin ? sortHalloweenBrowse(located.map((card) => ({ ...card, distanceMi: halloweenDistanceMi(origin, card, now) }))
    // Compare full precision. A 40.04 mi card must not enter as rounded 40.0.
    .filter((card) => card.distanceMi <= HALLOWEEN_BROWSE_RADIUS_MI && (category === "all" || card.browseCategory === category)), sort) : [];
  return { status: origin ? "ready" : "location-required", radiusMi: HALLOWEEN_BROWSE_RADIUS_MI, coverage, cards,
    rails: HALLOWEEN_BROWSE_CATEGORIES.filter((rail) => category === "all" || rail.id === category)
      .map((rail) => ({ ...rail, cards: cards.filter((card) => card.browseCategory === rail.id) })) };
}
