// lib/searchCards.js — search results shaped for the existing PlaceCard.
//
// Places come from owned inventory. Events and guides (the site's blogs) use
// that same card only when a real rated place carries them: the event's venue,
// or a guide pick that is already a place. A row with no rating is mapped for
// category coverage and can affect nothing on screen — PlaceCard refuses it,
// and this module does not invent a rating or a review count.
//
// Order is rankSearchCards: relevance, quality, distance. The model is not
// consulted here. Callers may pass filters it already validated.

import { readFileSync } from "node:fs";
import { cardComplete } from "./score.js";
import { serveFromInventory } from "./inventoryServe.js";
import { usableSupabaseEnv } from "./atlasPlaceAllowlist.js";
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { siteTodayStr } from "./siteTime.js";
import { resolveSearchIntent } from "./searchIntent.js";
import { priceLevelOf } from "./price.js";
import { classifyPlace, classifyEvent, classifyGuide, taxonomyForQuery } from "./searchTaxonomy.js";
import { applySearchFilters, rankSearchCards, searchScore } from "./searchRank.js";

const CARD_LIMIT = 12;
const TYPE_FOR_LABEL = {
  food: "restaurant",
  nightlife: "bar",
  attractions: "tourist_attraction",
  family: "amusement_park",
  hotels: "hotel",
  shopping: "shopping_mall",
};

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flag(row, signals, key) {
  if (signals && typeof signals[key] === "boolean") return signals[key];
  if (row && typeof row[key] === "boolean") return row[key];
  return null;
}

function supabaseConfig(env) {
  const source = env || {};
  const url = String(source.SUPABASE_URL || source.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(source.SUPABASE_SERVICE_ROLE_KEY || source.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return usableSupabaseEnv(url, key) ? { url, key } : null;
}

function readFixture(env) {
  const file = env && typeof env.WAYFIND_SEARCH_CARD_FIXTURE === "string" ? env.WAYFIND_SEARCH_CARD_FIXTURE.trim() : "";
  if (!file || supabaseConfig(env)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function placeDoc(row) {
  if (!row) return null;
  const name = String(row.name || row.title || "").trim();
  const id = String(row.place_id || row.id || "").trim();
  if (!name || !id) return null;
  const signals = row.signals || {};
  const rating = finite(signals.rating != null ? signals.rating : row.rating);
  const reviews = finite(signals.reviews != null ? signals.reviews : row.reviews);
  const nav = classifyPlace({
    category: row.category,
    tags: row.tags,
    primary_type: row.primary_type || row.primaryType,
    google_types: row.google_types || row.types,
  });
  const lat = finite(row.lat != null ? row.lat : row.location && (row.location.latitude ?? row.location.lat));
  const lng = finite(row.lng != null ? row.lng : row.location && (row.location.longitude ?? row.location.lng));
  return {
    kind: "place",
    id,
    title: name,
    cardName: name,
    href: null,
    nav,
    category: nav && nav.category,
    keywords: [...(Array.isArray(row.tags) ? row.tags : []), row.primary_type || row.primaryType, row.locality].filter(Boolean),
    rating: rating != null && rating > 0 ? rating : null,
    reviews: reviews != null && reviews > 0 ? reviews : 0,
    lat,
    lng,
    types: row.google_types || row.types || [],
    primaryType: row.primary_type || row.primaryType || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    address: row.locality || row.address || "",
    line: "",
    priceNum: priceLevelOf(signals.priceNum != null ? signals.priceNum : row.priceNum != null ? row.priceNum : row.priceLevel),
    servesWine: flag(row, signals, "servesWine"),
    servesCocktails: flag(row, signals, "servesCocktails"),
    reservable: flag(row, signals, "reservable"),
    dineIn: flag(row, signals, "dineIn"),
  };
}

function ownedDoc(place) {
  if (!place || !place.id) return null;
  const name = typeof place.displayName === "string" ? place.displayName : place.displayName && place.displayName.text;
  return placeDoc({
    id: place.id,
    name: name || place.name,
    lat: place.location && (place.location.latitude ?? (typeof place.location.lat === "function" ? place.location.lat() : place.location.lat)),
    lng: place.location && (place.location.longitude ?? (typeof place.location.lng === "function" ? place.location.lng() : place.location.lng)),
    category: place.category,
    primaryType: place.primaryType,
    types: place.types,
    tags: place.tags,
    rating: place.rating,
    reviews: place.userRatingCount != null ? place.userRatingCount : place.reviews,
    locality: place.locality || "",
    priceLevel: place.priceLevel,
    servesWine: place.servesWine,
    servesCocktails: place.servesCocktails,
    reservable: place.reservable,
    dineIn: place.dineIn,
  });
}

function eventDoc(row) {
  if (!row) return null;
  const title = String(row.event_name || row.short_title || row.title || "").trim();
  if (!title) return null;
  const nav = classifyEvent(row);
  const venue = String(row.venue_name || row.venue || "").trim();
  const rating = finite(row.rating);
  const reviews = finite(row.reviews);
  const id = String(row.place_id || "").trim();
  return {
    kind: "event",
    id: id || `event:${row.event_id || row.slug || title}`,
    title,
    cardName: venue || title,
    href: row.slug ? `/florida-events/${row.slug}` : null,
    nav,
    category: nav && nav.category,
    keywords: [row.category, row.subcategory, ...(Array.isArray(row.tags) ? row.tags : []), title].filter(Boolean),
    rating: rating != null && rating > 0 ? rating : null,
    reviews: reviews != null && reviews > 0 ? reviews : 0,
    lat: finite(row.venue_lat != null ? row.venue_lat : row.lat),
    lng: finite(row.venue_lng != null ? row.venue_lng : row.lng),
    types: row.google_types || row.types || [],
    primaryType: row.primary_type || row.primaryType || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    address: row.city || "",
    line: "",
  };
}

function guideRecords(today) {
  const docs = [];
  for (const [slug, guide] of Object.entries(currentGuides(GUIDES, today))) {
    if (!guide || !guide.title) continue;
    const nav = classifyGuide(guide);
    const placeIds = (guide.picks || []).map((pick) => pick && pick.placeId).filter(Boolean);
    docs.push({
      kind: "guide",
      id: `guide:${slug}`,
      title: guide.title,
      cardName: guide.title,
      href: `/guides/${slug}`,
      nav,
      category: nav && nav.category,
      keywords: [guide.keyword, guide.region, ...(guide.relatedKeywords || [])].filter(Boolean),
      rating: null,
      reviews: 0,
      lat: null,
      lng: null,
      types: [],
      primaryType: null,
      tags: [],
      address: guide.region || "",
      line: "",
      placeIds,
    });
  }
  return docs;
}

function milesBetween(lat, lng, city) {
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = Math.PI / 180;
  const dLat = (lat - city.lat) * p;
  const dLng = (lng - city.lng) * p;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(city.lat * p) * Math.cos(lat * p) * Math.sin(dLng / 2) ** 2;
  return (2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)))) / 1609.344;
}

function toCard(doc, city) {
  if (!doc || !doc.id) return null;
  const name = String(doc.cardName || doc.title || "").trim();
  const lat = finite(doc.lat);
  const lng = finite(doc.lng);
  if (!name || lat == null || lng == null) return null;
  const types = Array.isArray(doc.types) ? doc.types.filter(Boolean) : [];
  let primaryType = doc.primaryType || null;
  if (!primaryType && !types.length && doc.nav && TYPE_FOR_LABEL[doc.nav.category]) primaryType = TYPE_FOR_LABEL[doc.nav.category];
  const href = typeof doc.href === "string" && doc.href.startsWith("/") && !doc.href.startsWith("//") ? doc.href : null;
  const line = doc.cardName && doc.cardName !== doc.title ? doc.title : "";
  const card = {
    id: String(doc.id),
    name,
    lat,
    lng,
    rating: finite(doc.rating) != null && finite(doc.rating) > 0 ? finite(doc.rating) : null,
    reviews: finite(doc.reviews) != null && finite(doc.reviews) > 0 ? finite(doc.reviews) : 0,
    types,
    primaryType,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    distMi: milesBetween(lat, lng, city),
    address: doc.address || "",
    href: doc.kind === "place" ? null : href,
    kind: doc.kind || "place",
    line,
    navCategory: doc.nav ? doc.nav.category : null,
  };
  return cardComplete(card) ? card : null;
}

async function loadInventory(taxonomy, city, env) {
  if (!taxonomy || taxonomy.mode !== "category" || !city) return [];
  const config = supabaseConfig(env);
  if (!config) return [];
  const radius = Math.round((taxonomy.radiusMi || 40) * 1609.344);
  const pool = Number(taxonomy.pool) > 0 ? Number(taxonomy.pool) : 24;
  const seen = new Set();
  const calls = [];
  const add = (cat, sub) => {
    const key = `${cat}:${sub || "all"}`;
    if (!cat || seen.has(key)) return;
    seen.add(key);
    calls.push(serveFromInventory(cat, city.lat, city.lng, radius, pool, sub || "all", { env: config }).catch(() => []));
  };
  for (const cat of taxonomy.allowGeneral || []) add(cat, "all");
  if ((taxonomy.subs || []).length) {
    for (const pair of taxonomy.subs) {
      const [cat, sub] = String(pair).split(":");
      if ((taxonomy.allowGeneral || []).includes(cat)) continue;
      add(cat, sub);
    }
  } else {
    for (const cat of taxonomy.categories || []) add(cat, "all");
  }
  for (const extra of taxonomy.also || []) add(extra[0], extra[1]);
  const groups = await Promise.all(calls);
  return groups.flat().map(ownedDoc).filter(Boolean);
}

function searchToken(query) {
  const parts = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
  parts.sort((a, b) => b.length - a.length);
  return parts[0] || "";
}

async function loadEvents(query, taxonomy, env, fetchImpl) {
  if (taxonomy && taxonomy.mode === "category") return [];
  const config = supabaseConfig(env);
  const token = searchToken(query) || (taxonomy && taxonomy.keywords && taxonomy.keywords[0]) || "";
  if (!config || !/^[a-z0-9]+$/.test(token)) return [];
  const fetchFn = fetchImpl || fetch;
  try {
    const url = new URL("/rest/v1/wf_events", config.url);
    url.searchParams.set("select", "event_id,slug,event_name,short_title,city,category,subcategory,tags,audience,lat,lng,place_id,venue,event_status,end_date");
    url.searchParams.set("or", `(event_name.ilike.*${token}*,category.eq.${token})`);
    url.searchParams.set("event_status", "in.(scheduled,sold_out)");
    url.searchParams.set("limit", "30");
    const response = await fetchFn(url, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
    if (!response || !response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return [];
    const today = siteTodayStr();
    const live = rows.filter((row) => !row.end_date || String(row.end_date) >= today);
    const ids = [...new Set(live.map((row) => row.place_id).filter(Boolean))].slice(0, 40);
    let venues = new Map();
    if (ids.length) {
      const placeUrl = new URL("/rest/v1/wf_inventory", config.url);
      placeUrl.searchParams.set("select", "place_id,name,lat,lng,category,primary_type,google_types,tags,signals,locality");
      placeUrl.searchParams.set("place_id", `in.(${ids.join(",")})`);
      const placeResponse = await fetchFn(placeUrl, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
      if (placeResponse && placeResponse.ok) {
        const placeRows = await placeResponse.json();
        venues = new Map((Array.isArray(placeRows) ? placeRows : []).map((row) => [row.place_id, row]));
      }
    }
    return live.map((row) => {
      const venue = venues.get(row.place_id) || {};
      const signals = venue.signals || {};
      return eventDoc({
        ...row,
        venue_name: venue.name || row.venue,
        venue_lat: venue.lat,
        venue_lng: venue.lng,
        rating: signals.rating,
        reviews: signals.reviews,
        primary_type: venue.primary_type,
        google_types: venue.google_types,
        locality: venue.locality,
      });
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Rank places, events, and guides for one query.
 * Pass `places` / `events` / `guides` to skip the network (tests, and a local
 * fixture file when inventory is not configured).
 */
export async function searchResultCards({
  query,
  lat,
  lng,
  places,
  events,
  guides,
  ownedPlaces,
  filters,
  env,
  fetchImpl,
  today,
} = {}) {
  const intent = resolveSearchIntent(query, { lat, lng });
  const taxonomy = taxonomyForQuery(intent.id);
  const city = intent.city;
  const fixture = Array.isArray(places) || Array.isArray(events) ? null : readFixture(env);
  const placeRows = Array.isArray(places)
    ? places.map(placeDoc).filter(Boolean)
    : (fixture && Array.isArray(fixture.places) ? fixture.places.map(placeDoc).filter(Boolean) : await loadInventory(taxonomy, city, env));
  const owned = (ownedPlaces || []).map(ownedDoc).filter(Boolean);
  // Category phrases read places. Events join text queries (halloween, a
  // name). A fixture file is the stand-in for both sources and follows the
  // same split, so a halloween venue does not also fill "things to do".
  const eventRows = Array.isArray(events)
    ? events.map(eventDoc).filter(Boolean)
    : (fixture && Array.isArray(fixture.events) && taxonomy.mode !== "category"
      ? fixture.events.map(eventDoc).filter(Boolean)
      : await loadEvents(intent.text || query, taxonomy, env, fetchImpl));
  const guideRows = Array.isArray(guides) ? guides : guideRecords(today || siteTodayStr());
  const docs = [...placeRows, ...owned, ...eventRows, ...guideRows].filter(Boolean);
  const filtered = applySearchFilters(docs, filters);
  const ranked = rankSearchCards(filtered.docs, { query: intent.text || query, city, taxonomy });
  const seen = new Set();
  const cards = [];
  const guideHits = taxonomy.mode === "category" ? [] : guideRows.filter((guide) => searchScore(guide, intent.text || query, city) > 0);
  for (const doc of ranked) {
    const card = toCard(doc, city);
    if (!card || seen.has(card.id)) continue;
    if (!card.line) {
      const guide = guideHits.find((row) => Array.isArray(row.placeIds) && row.placeIds.includes(card.id));
      if (guide) card.line = guide.title;
    }
    seen.add(card.id);
    cards.push(card);
    if (cards.length >= CARD_LIMIT) break;
  }
  return { cards, city, taxonomy, recognized: intent.recognized === true };
}

export { classifyPlace, classifyEvent, classifyGuide, coverageOf } from "./searchTaxonomy.js";
