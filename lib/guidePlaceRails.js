// Curated guide place rails. Identity is exact placeId only.
// Ratings, review totals, scores and photo refs are never stored here.
//
// Two independent gates (lovebug rail release invariant):
//   1) Place gate: exact placeId → OPERATIONAL inventory → real Wayfind card.
//   2) Revenue gate: exact venue → verified partner offer → /api/commerce/go.
// Passing the place gate does not require the revenue gate. A missing
// affiliate offer must never hide the card. A partner search result must
// never become Book/Tickets. An affiliate product must never masquerade
// as a Wayfind place.
import { isOperational } from "./businessStatus.js";
import { wayfindScore } from "./wayfindScore.js";

export const GUIDE_PLACE_RAILS = Object.freeze({
  "florida-lovebug-season": Object.freeze({
    title: "SKIP THE SWARM",
    subtitle: "Indoor Florida moves when outside is getting annoying.",
    secondary: "Open Wayfind for places closer to you.",
    secondaryHref: "/",
    insertAfterPick: "The Wayfind move: change the plan, not the whole day",
    markets: Object.freeze([
      Object.freeze({
        id: "gulf-coast",
        label: "Gulf Coast",
        items: Object.freeze([
          Object.freeze({ placeId: "ChIJr7ec9tEXw4gRwicCx3wfH2w", market: "Bradenton", name: "The Bishop Museum of Science and Nature" }),
          Object.freeze({ placeId: "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4", market: "Sarasota", name: "Sarasota Art Museum" }),
          Object.freeze({ placeId: "ChIJRyOEfAo5w4gR664aD_YYBLU", market: "Sarasota", name: "Mote Science Education Aquarium (SEA)" }),
        ]),
      }),
      Object.freeze({
        id: "tampa-bay",
        label: "Tampa Bay",
        items: Object.freeze([
          Object.freeze({ placeId: "ChIJCXAq5_DEwogRjTPE2xlsZtE", market: "Tampa", name: "The Florida Aquarium" }),
          Object.freeze({ placeId: "ChIJJboiAY3EwogRJCLbox7T-70", market: "Tampa", name: "Tampa Bay History Center" }),
          Object.freeze({ placeId: "ChIJyaCQzpHhwogRBdPcZI6UOyc", market: "St. Petersburg", name: "The Dalí Museum" }),
        ]),
      }),
      Object.freeze({
        id: "orlando",
        label: "Orlando",
        items: Object.freeze([
          Object.freeze({ placeId: "ChIJo2bql5B654gR_ITN9PGhBbU", market: "Orlando", name: "Orlando Science Center" }),
          Object.freeze({ placeId: "ChIJmy7U4VJ-54gRi1LoS6wwFj0", market: "Orlando", name: "SEA LIFE Orlando Aquarium" }),
          Object.freeze({ placeId: "ChIJc1x01Xl_54gR3yyWFYterI4", market: "Orlando", name: "Museum of Illusions Orlando" }),
          Object.freeze({ placeId: "ChIJRdxzRk1-54gRJvqlZQbtpE4", market: "Orlando", name: "WonderWorks Orlando" }),
        ]),
      }),
    ]),
  }),
  "red-bull-dance-your-style-tampa-2026": Object.freeze({
    title: "AROUND THE BATTLES",
    subtitle: "Live Wayfind picks near both venues.",
    secondary: "Open Wayfind for more around downtown Tampa.",
    secondaryHref: "/",
    insertAfterPick: "Eat and drink around the weekend",
    markets: Object.freeze([
      Object.freeze({
        id: "convention-center",
        label: "Saturday: near the Convention Center",
        items: Object.freeze([
          Object.freeze({ placeId: "ChIJJ13SCI3EwogRcX2q5Fs_HkU", market: "Downtown Tampa", name: "Harpoon Harry's Crab House - Tampa" }),
          Object.freeze({ placeId: "ChIJL_dfJozEwogRF_55TezQpYo", market: "Downtown Tampa", name: "Tampa Riverwalk" }),
          Object.freeze({ placeId: "ChIJB1L_XIzEwogR1Eslu42A1NQ", market: "Downtown Tampa", name: "Hattricks" }),
          Object.freeze({ placeId: "ChIJzyHjx5LEwogRuGs9V-RMHrA", market: "Harbour Island", name: "American Social - Bar & Kitchen" }),
          Object.freeze({ placeId: "ChIJCXAq5_DEwogRjTPE2xlsZtE", market: "Channelside", name: "The Florida Aquarium" }),
        ]),
      }),
      Object.freeze({
        id: "ybor-city",
        label: "Friday: around The RITZ Ybor",
        items: Object.freeze([
          Object.freeze({ placeId: "ChIJz8e7TVLEwogRBeybvscHnD4", market: "Ybor City", name: "Columbia Restaurant" }),
          Object.freeze({ placeId: "ChIJmfFGVBPFwogRIYyNhvz3X9Y", market: "Ybor City", name: "7th + Grove" }),
          Object.freeze({ placeId: "ChIJ1yQNClHEwogRaCW7u5bgT0Y", market: "Ybor City", name: "Gaspar's Grotto" }),
          Object.freeze({ placeId: "ChIJq2_lAFHEwogRRCeJJ77fHgg", market: "Ybor City", name: "Bad Monkey Ybor" }),
        ]),
      }),
    ]),
  }),
});

export function guidePlaceRailConfig(slug) {
  const key = typeof slug === "string" ? slug.trim() : "";
  return GUIDE_PLACE_RAILS[key] || null;
}

export function declaredGuideRailPlaceIds(config) {
  const ids = [];
  for (const market of (config && config.markets) || []) {
    for (const item of market.items || []) {
      const id = String(item && item.placeId || "").trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

function inventoryKey(row) {
  return String((row && (row.place_id || row.id || row.placeId)) || "").trim();
}

function cardOmitReason(row, id) {
  if (!row) return "unresolved";
  if (inventoryKey(row) !== id) return "identity-mismatch";
  if (!String(row.name || "").trim()) return "not-card-ready";
  if (!isOperational(row)) return "not-operational";
  if (!(row.photo_ref || row.photoRef)) return "no-photo";
  const rating = Number(row.rating != null ? row.rating : row.signals && row.signals.rating);
  const reviews = Number(row.reviews != null ? row.reviews : row.signals && row.signals.reviews);
  const score = row.governed_score != null ? Number(row.governed_score) : wayfindScore(rating, reviews);
  if (!(rating > 0 && reviews >= 15 && score != null)) return "not-card-ready";
  return null;
}

function toCardPlace(row, declared) {
  const rating = Number(row.rating != null ? row.rating : row.signals && row.signals.rating);
  const reviews = Number(row.reviews != null ? row.reviews : row.signals && row.signals.reviews);
  const score = row.governed_score != null ? Number(row.governed_score) : wayfindScore(rating, reviews);
  return {
    id: inventoryKey(row),
    name: row.name,
    rating,
    reviews,
    lat: row.lat,
    lng: row.lng,
    photoRef: row.photo_ref || row.photoRef || null,
    types: row.types || row.google_types || [],
    category: row.category || null,
    primary_type: row.primary_type || null,
    editorial: row.editorial || null,
    governed_score: score,
    wfScore: score,
    market: declared.market,
    near: declared.market,
  };
}

/**
 * Resolve a curated rail against current inventory.
 * Only declared exact IDs may enter. Missing, closed, or photo-less rows drop.
 * Never substitutes a similarly named venue. Order is governed Wayfind Score
 * inside each market, then review count.
 */
export function resolveGuidePlaceRail(config, inventoryRows) {
  if (!config) return { title: "", subtitle: "", secondary: "", secondaryHref: "/", markets: [], places: [], omitted: [] };
  const byId = new Map();
  for (const row of inventoryRows || []) {
    const id = inventoryKey(row);
    if (id) byId.set(id, row);
  }
  const declared = new Set(declaredGuideRailPlaceIds(config));
  const markets = [];
  const places = [];
  const omitted = [];
  for (const market of config.markets || []) {
    const resolved = [];
    for (const item of market.items || []) {
      const id = String(item.placeId || "").trim();
      if (!id || !declared.has(id)) continue;
      const row = byId.get(id);
      const reason = cardOmitReason(row, id);
      if (reason) {
        omitted.push({ placeId: id, name: item.name || null, reason, market: market.id });
        continue;
      }
      resolved.push(toCardPlace(row, item));
    }
    resolved.sort((a, b) => (b.governed_score - a.governed_score) || (b.reviews - a.reviews) || a.name.localeCompare(b.name));
    if (resolved.length) {
      markets.push({ id: market.id, label: market.label, places: resolved });
      places.push(...resolved);
    }
  }
  return {
    title: config.title,
    subtitle: config.subtitle,
    secondary: config.secondary,
    secondaryHref: config.secondaryHref || "/",
    insertAfterPick: config.insertAfterPick || null,
    markets,
    places,
    omitted,
  };
}
