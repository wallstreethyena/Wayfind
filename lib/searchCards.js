// lib/searchCards.js — search results shaped for the existing PlaceCard.
//
// Places, guides (the site's blogs), and events share one card and one
// order: relevance, quality, distance. A place still needs a real rating.
// A guide or event with a title and an internal page renders on that same
// card with the score left empty. This module does not invent a rating or
// a review count, and it does not read affiliate or sponsor fields.
//
// Order is rankSearchCards. The model is not consulted here. Callers may
// pass filters it already validated.

import { readFileSync } from "node:fs";
import { cardComplete, searchEditorialCard } from "./score.js";
import { serveFromInventory } from "./inventoryServe.js";
import { usableSupabaseEnv } from "./atlasPlaceAllowlist.js";
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { cityFromLabel } from "./searchCatalog.js";
import { siteTodayStr } from "./siteTime.js";
import { resolveSearchIntent } from "./searchIntent.js";
import { priceLevelOf } from "./price.js";
import { classifyPlace, classifyEvent, classifyGuide, taxonomyForQuery } from "./searchTaxonomy.js";
import { applySearchFilters, rankSearchCards, searchScore } from "./searchRank.js";
import { searchIndexDocuments } from "./unifiedSearch.js";
import { rankInventory, boxForRadius, LEAN_INVENTORY_FIELDS } from "./inventoryServe.js";
import { singularQuery } from "./searchRank.js";
import { foodTermsFor, carriesFoodTerms, rankFoodWordDocs } from "./searchFoodTerms.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { eventIsOpenRun, EVENT_OPEN_RUN_DAYS } from "./eventVisitFacts.js";
import { nextOpenDay } from "./scheduleNoteDays.js";

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
  if (value == null || value === "" || typeof value === "boolean") return null;
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
    keywords: [...(Array.isArray(row.tags) ? row.tags : []), ...(Array.isArray(row.cuisines) ? row.cuisines : []), row.primary_type || row.primaryType, row.locality].filter(Boolean),
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
    cuisines: place.cuisines,
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

function addIsoDays(dayStr, n) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(row.start_date || "")) ? String(row.start_date) : null;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(row.end_date || "")) ? String(row.end_date) : null;
  const occurrenceDates = occurrenceDatesFor(row);
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
    lat: row.approx === true && row.venue_lat == null ? null : finite(row.venue_lat != null ? row.venue_lat : row.lat),
    lng: row.approx === true && row.venue_lng == null ? null : finite(row.venue_lng != null ? row.venue_lng : row.lng),
    types: row.google_types || row.types || [],
    primaryType: row.primary_type || row.primaryType || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    address: row.city || "",
    line: "",
    city_slug: (cityFromLabel(row.city) || {}).slug || null,
    free: row.is_free === true || row.price_band === "free",
    startDate,
    endDate,
    occurrenceDates,
    selectNights: row.select_nights === true || row.selectNights === true,
    scheduleNote: typeof (row.schedule_note ?? row.scheduleNote) === "string" ? String(row.schedule_note ?? row.scheduleNote) : "",
    verifyNote: typeof (row.verify_note ?? row.verifyNote) === "string" ? String(row.verify_note ?? row.verifyNote) : "",
    visitSchedule: row.visit_schedule || row.visitSchedule || null,
  };
}

function scheduleAllowsDay(schedule, day) {
  if (!schedule || typeof schedule !== "object") return true;
  if (Array.isArray(schedule.excluded_dates) && schedule.excluded_dates.includes(day)) return false;
  if (schedule.date_hours && typeof schedule.date_hours === "object") {
    if (Object.prototype.hasOwnProperty.call(schedule.date_hours, day)) {
      return Array.isArray(schedule.date_hours[day]) && schedule.date_hours[day].length > 0;
    }
    if (schedule.dates_only) return false;
  }
  if (schedule.weekday_hours && typeof schedule.weekday_hours === "object") {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const sessions = schedule.weekday_hours[dow] ?? schedule.weekday_hours[String(dow)];
    return Array.isArray(sessions) && sessions.length > 0;
  }
  return true;
}

/** True when active on `dayStr`, false when explicitly not yet open / not running on `dayStr`, null when undated. */
export function eventActiveOnDay(doc, dayStr) {
  if (!doc || doc.kind !== "event" || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayStr || ""))) return null;
  const schedule = doc.visitSchedule || doc.visit_schedule || null;
  if (Array.isArray(doc.occurrenceDates) && doc.occurrenceDates.length) {
    return doc.occurrenceDates.includes(dayStr) && scheduleAllowsDay(schedule, dayStr);
  }
  if (doc.startDate) {
    const openRun = eventIsOpenRun({
      start_date: doc.startDate,
      end_date: doc.endDate,
      schedule_note: doc.scheduleNote,
      verify_note: doc.verifyNote,
    });
    const effectiveEnd = doc.endDate || (openRun ? addIsoDays(doc.startDate, EVENT_OPEN_RUN_DAYS) : doc.startDate);
    if (doc.startDate > dayStr) return false;
    if (effectiveEnd && effectiveEnd < dayStr) return false;
    if (!scheduleAllowsDay(schedule, dayStr)) return false;
    if (doc.selectNights || doc.scheduleNote) {
      return nextOpenDay({
        start_date: doc.startDate,
        end_date: effectiveEnd,
        select_nights: doc.selectNights === true,
        schedule_note: doc.scheduleNote || "",
      }, dayStr, dayStr) === dayStr;
    }
    return true;
  }
  if (doc.endDate && doc.endDate < dayStr) return false;
  return null;
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
      city_slug: (cityFromLabel(guide.region) || {}).slug || null,
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

function safeHref(href) {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") && href.length <= 240 ? href : null;
}

function toCard(doc, city) {
  if (!doc || !doc.id) return null;
  const name = String(doc.cardName || doc.title || "").trim();
  const lat = finite(doc.lat);
  const lng = finite(doc.lng);
  const href = safeHref(doc.href);
  const editorial = doc.kind === "guide" || doc.kind === "event";
  if (!name) return null;
  if (!editorial && (lat == null || lng == null)) return null;
  if (editorial && !href) return null;
  const types = Array.isArray(doc.types) ? doc.types.filter(Boolean) : [];
  let primaryType = doc.primaryType || null;
  if (!primaryType && !types.length && doc.nav && TYPE_FOR_LABEL[doc.nav.category]) primaryType = TYPE_FOR_LABEL[doc.nav.category];
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
    ...(doc.kind === "event" ? {
      ...(doc.startDate ? { start_date: doc.startDate } : {}),
      ...(doc.endDate ? { end_date: doc.endDate } : {}),
      ...(doc.scheduleNote ? { schedule_note: doc.scheduleNote } : {}),
      ...(doc.selectNights ? { select_nights: true } : {}),
      ...(Array.isArray(doc.occurrenceDates) && doc.occurrenceDates.length ? { occurrence_dates: doc.occurrenceDates } : {}),
      ...(doc.visitSchedule ? { visit_schedule: doc.visitSchedule } : {}),
      ...(doc.free === true ? { is_free: true } : {}),
    } : {}),
  };
  if (searchEditorialCard(card)) return card;
  return cardComplete(card) ? card : null;
}

function indexDoc(row) {
  if (!row || (row.kind !== "guide" && row.kind !== "event")) return null;
  const title = String(row.title || "").trim();
  const href = safeHref(row.href);
  if (!title || !href) return null;
  const keywords = Array.isArray(row.keywords) ? row.keywords.map(String) : [];
  const nav = row.kind === "guide"
    ? classifyGuide({ title, keyword: keywords.join(" "), region: row.city_name, relatedKeywords: keywords })
    : classifyEvent({ category: row.category, tags: keywords, event_name: title });
  return {
    kind: row.kind,
    id: `${row.kind}:${href}`,
    title,
    cardName: title,
    href,
    nav,
    category: nav && nav.category,
    keywords,
    rating: null,
    reviews: 0,
    lat: finite(row.lat),
    lng: finite(row.lng),
    types: [],
    primaryType: null,
    tags: keywords,
    address: row.city_name || "",
    line: "",
    city_slug: row.city_slug || null,
    free: row.price_band === "free",
  };
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

const TEXT_POOL_RADIUS_MI = 25;
const TEXT_POOL_ROWS = 500;
const TEXT_STOP = new Set(["a", "an", "and", "at", "in", "of", "the", "near", "me"]);

function foldWord(text) {
  return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2018\u2019'`]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textTokens(query) {
  return foldWord(query).split(" ").filter((t) => t.length > 1 && !TEXT_STOP.has(t)).map((t) => singularQuery(t));
}

/** Every query word is in the name, or in the row's own cuisine / primary type words. */
export function rowCarriesQuery(row, tokens) {
  if (!row || !tokens.length) return false;
  const nameWords = new Set(foldWord(row.name).split(" ").map((w) => singularQuery(w)));
  const vocab = new Set();
  for (const c of Array.isArray(row.cuisines) ? row.cuisines : []) for (const w of foldWord(c).split(" ")) if (w) vocab.add(singularQuery(w));
  for (const w of foldWord(String(row.primary_type || "").replace(/_/g, " ")).split(" ")) if (w) vocab.add(singularQuery(w));
  return tokens.every((t) => nameWords.has(t) || vocab.has(t));
}

// A word search ("tacos") reads the owned rows NEAR the searched city whose
// name, cuisine or primary type carries the word. directSearch only serves
// rows refreshed in the last 30 days and (for names) needs the exact plural,
// so most nearby taco places never reached the cards and the three fresh
// ones left were 28 to 35 miles out. Same serving gates as the Food tab
// (rankInventory: open, not excluded, really rated, inside the radius).
function textApostropheStem(lead, rawQuery) {
  if (!lead || !rawQuery) return "";
  const parts = String(rawQuery)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((p) => singularQuery(p))
    .filter((p) => p.length >= 3 && !TEXT_STOP.has(p) && /^[a-z0-9]+$/.test(p) && lead.includes(p) && p !== lead)
    .sort((a, b) => b.length - a.length);
  return parts[0] || "";
}

async function loadTextInventory(query, city, env, fetchImpl, rawQuery = query) {
  const config = supabaseConfig(env);
  const food = foodTermsFor(query);
  const tokens = textTokens(query);
  if (!config || !city || !tokens.length || tokens.some((t) => !/^[a-z0-9]+$/.test(t))) return [];
  const radiusM = Math.round(TEXT_POOL_RADIUS_MI * 1609.344);
  const box = boxForRadius(city.lat, city.lng, radiusM);
  const lead = [...tokens].sort((a, b) => b.length - a.length)[0];
  const apoStem = !food ? textApostropheStem(lead, rawQuery) : "";
  // A food word reads its names and its cuisines (tacos -> taco names + mexican).
  const orClauses = food
    ? [...food.names].map((n) => `name.ilike.*${n}*`)
      .concat([...new Set([...food.cuisines, ...food.names])].map((c) => `primary_type.ilike.*${c}*`))
      .concat([...food.cuisines].map((c) => `cuisines.cs.{${c}}`))
    : [
      `name.ilike.*${lead}*`,
      ...(apoStem ? [`name.ilike.*${apoStem}*`] : []),
      `primary_type.ilike.*${lead}*`,
      `cuisines.cs.{${lead}}`,
    ];
  try {
    const url = new URL("/rest/v1/wf_inventory", config.url);
    url.searchParams.set("select", `${LEAN_INVENTORY_FIELDS.replace(",photo_ref", "")}`);
    url.searchParams.set("lat", `gte.${box.minLat.toFixed(5)}`);
    url.searchParams.append("lat", `lte.${box.maxLat.toFixed(5)}`);
    url.searchParams.set("lng", `gte.${box.minLng.toFixed(5)}`);
    url.searchParams.append("lng", `lte.${box.maxLng.toFixed(5)}`);
    url.searchParams.set("or", `(${orClauses.join(",")})`);
    url.searchParams.set("order", "place_id.asc");
    url.searchParams.set("limit", String(TEXT_POOL_ROWS));
    const response = await (fetchImpl || fetch)(url, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
    if (!response || !response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    const carried = rows.filter((row) => (food
      ? carriesFoodTerms({ name: row.name, cuisines: row.cuisines, primaryType: row.primary_type }, food)
      : rowCarriesQuery(row, tokens)));
    return rankInventory(carried, city.lat, city.lng, radiusM, TEXT_POOL_ROWS).map(ownedDoc).filter(Boolean);
  } catch {
    return [];
  }
}

function searchToken(query) {
  const parts = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
  parts.sort((a, b) => b.length - a.length);
  return parts[0] || "";
}

async function loadEvents(query, taxonomy, env, fetchImpl, { city, intentId, todayStr } = {}) {
  if (taxonomy && taxonomy.mode === "category") return [];
  const config = supabaseConfig(env);
  const token = searchToken(query) || (taxonomy && taxonomy.keywords && taxonomy.keywords[0]) || "";
  if (!config || !/^[a-z0-9]+$/.test(token)) return [];
  const fetchFn = fetchImpl || fetch;
  const isChristmas = intentId === "christmas" || token === "christmas";
  try {
    const url = new URL("/rest/v1/wf_events", config.url);
    url.searchParams.set("select", "event_id,slug,event_name,short_title,city,category,subcategory,tags,audience,lat,lng,place_id,venue,event_status,start_date,end_date,select_nights,schedule_note,is_free,price_band");
    url.searchParams.set("or", isChristmas
      ? "(event_name.ilike.*christmas*,event_name.ilike.*holiday*,category.eq.holiday)"
      : `(event_name.ilike.*${token}*,category.eq.${token})`);
    url.searchParams.set("event_status", "in.(scheduled,sold_out)");
    url.searchParams.set("order", "start_date.asc.nullslast");
    url.searchParams.set("limit", isChristmas ? "120" : "40");
    const response = await fetchFn(url, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
    if (!response || !response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return [];
    const activeDay = todayStr || siteTodayStr();
    const live = rows
      .filter((row) => !row.end_date ? (!row.start_date || String(row.start_date) >= activeDay || eventIsOpenRun(row)) : String(row.end_date) >= activeDay)
      .sort((a, b) => {
        const aOpen = a.start_date && String(a.start_date) <= activeDay ? 0 : 1;
        const bOpen = b.start_date && String(b.start_date) <= activeDay ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const aMi = milesBetween(finite(a.lat), finite(a.lng), city) ?? 999;
        const bMi = milesBetween(finite(b.lat), finite(b.lng), city) ?? 999;
        return aMi - bMi;
      });
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

// "free things to do" cards (2026-11-11). Owner rule: strictly honest, never
// a paid museum, zoo, or ticketed attraction under a free search. Inventory
// carries no price for places, so a place qualifies only by a primary type
// that is open to the public at no charge (a beach, a city/county park, a
// trail, a plaza, a playground) and a name that is not a ticketed kind. State
// and national parks charge an entry fee and are not in the list. Events and
// index rows qualify only with explicit evidence (is_free / price_band
// "free"). Guides are excluded. No evidence means no card, never a guess.
const FREE_PLACE_TYPES = new Set(["beach", "park", "city_park", "dog_park", "hiking_area", "playground", "plaza", "picnic_ground"]);
// Live on production 2026-11-12: "Venture Outdoors" (Orlando, a kayak and
// paddleboard rental) carries primaryType "hiking_area" with the secondary
// type "sports_activity_location". A business self-tags with a public-space
// type, so ANY commercial secondary type disqualifies a place from "free".
const COMMERCIAL_TYPES = new Set([
  "sports_activity_location", "sports_club", "gym", "fitness_center", "travel_agency", "tour_agency",
  "store", "shopping_mall", "car_rental", "boat_rental", "bicycle_store", "sporting_goods_store",
  "amusement_center", "amusement_park", "water_park", "event_venue", "lodging", "resort_hotel", "hotel",
  "restaurant", "bar", "cafe", "food", "spa", "golf_course", "marina", "tourist_information_center",
]);
// Names are a heuristic, so this list leans toward refusing: a free place
// missed is a lost card, a paid place shown is a broken promise. Audit
// 2026-11-11: Hillsborough regional parks ($2/vehicle), Boyd Hill Nature
// Preserve ($3), Fort De Soto ($5) are Google "park" with names the first
// list missed; many Florida springs and canopy walks sit inside paid parks.
const TICKETED_NAME = /\b(state park|national park|state forest|regional park|preserve|nature center|sanctuary|springs?|canopy|botanical|fort|zoo|aquarium|museum|gardens?|theme park|water ?park|golf|resort|club|spa|tours?|cruise|rentals?|stadium|arena)\b/i;

export function isFreeDoc(doc) {
  if (!doc) return false;
  if (doc.kind === "event") return doc.free === true;
  if (doc.kind === "place") {
    const type = String(doc.primaryType || "").toLowerCase();
    const types = Array.isArray(doc.types) ? doc.types.map((t) => String(t).toLowerCase()) : [];
    return FREE_PLACE_TYPES.has(type)
      && !types.some((t) => COMMERCIAL_TYPES.has(t))
      && !TICKETED_NAME.test(String(doc.title || doc.cardName || ""));
  }
  return false;
}

/** The same rule for a place as /api/search returns it (directSearch shape). */
export function isFreeOwnedPlace(place) {
  return isFreeDoc(ownedDoc(place));
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
  const effectiveToday = today || siteTodayStr();
  const intent = resolveSearchIntent(query, { lat, lng });
  const constraints = intent.constraints || {};
  const baseTaxonomy = taxonomyForQuery(intent.id);
  const taxonomy = intent.id === "rainy" && constraints.ageGroup === "toddlers"
    ? { ...baseTaxonomy, subs: [...new Set([...(baseTaxonomy.subs || []), "family:toddlers"])] }
    : baseTaxonomy;
  const city = intent.city;
  const rankQuery = intent.recognized && intent.phrase ? intent.phrase : (intent.text || query);
  const fixture = Array.isArray(places) || Array.isArray(events) ? null : readFixture(env);
  const placeRows = Array.isArray(places)
    ? places.map(placeDoc).filter(Boolean)
    : (fixture && Array.isArray(fixture.places) ? fixture.places.map(placeDoc).filter(Boolean) : await loadInventory(taxonomy, city, env));
  const owned = (ownedPlaces || []).map(ownedDoc).filter(Boolean);
  const textPool = !Array.isArray(places) && !(fixture && Array.isArray(fixture.places)) && taxonomy.mode !== "category" && (!intent.recognized || intent.id === "christmas")
    ? await loadTextInventory(intent.id === "christmas" ? "christmas" : intent.text, city, env, fetchImpl, query)
    : [];
  // Category phrases read places. Events join text queries (halloween, christmas, a
  // name). A fixture file is the stand-in for both sources and follows the
  // same split, so a halloween venue does not also fill "things to do".
  const eventRows = Array.isArray(events)
    ? events.map(eventDoc).filter(Boolean)
    : (fixture && Array.isArray(fixture.events) && taxonomy.mode !== "category"
      ? fixture.events.map(eventDoc).filter(Boolean)
      : await loadEvents(rankQuery, taxonomy, env, fetchImpl, { city, intentId: intent.id, todayStr: effectiveToday }));
  const guideRows = Array.isArray(guides) ? guides : guideRecords(effectiveToday);
  const indexed = Array.isArray(guides) && Array.isArray(events)
    ? []
    : (await searchIndexDocuments(rankQuery, { env, fetchImpl })).map(indexDoc).filter(Boolean);
  const allDocs = [...placeRows, ...owned, ...textPool, ...eventRows, ...guideRows].filter(Boolean);
  const needsActiveToday = constraints.openNow === true || constraints.when === "now" || constraints.when === "tonight" || constraints.when === "today";
  const isCheap = constraints.budget === "cheap";
  const activeRadiusCap = Number(taxonomy && taxonomy.radiusMi) > 0 ? Number(taxonomy.radiusMi) : 80;
  const passesConstraints = (doc) => {
    if (intent.free && !isFreeDoc(doc)) return false;
    if (needsActiveToday && doc.kind === "event" && eventActiveOnDay(doc, effectiveToday) !== true) return false;
    if (needsActiveToday && doc.kind !== "guide" && city) {
      const dist = milesBetween(finite(doc.lat), finite(doc.lng), city);
      if (dist != null && dist > activeRadiusCap) return false;
    }
    if (isCheap && doc.kind === "place" && doc.priceNum != null && doc.priceNum >= 3) return false;
    return true;
  };
  const docs = allDocs.filter(passesConstraints);
  const seenHref = new Set(docs.map((doc) => doc.href).filter(Boolean));
  for (const doc of indexed) {
    if (!passesConstraints(doc)) continue;
    if (!doc.href || seenHref.has(doc.href)) continue;
    seenHref.add(doc.href);
    docs.push(doc);
  }
  const hasKnownAffordable = isCheap && docs.some((doc) => (doc.kind === "place" && doc.priceNum != null && doc.priceNum <= 2) || isFreeDoc(doc));
  const budgetDocs = hasKnownAffordable
    ? [
      ...docs.filter((doc) => (doc.kind === "place" && doc.priceNum != null && doc.priceNum <= 2) || isFreeDoc(doc)),
      ...docs.filter((doc) => !((doc.kind === "place" && doc.priceNum != null && doc.priceNum <= 2) || isFreeDoc(doc))),
    ]
    : docs;
  // A food word ("tacos") is answered by food places near the city, nearest
  // band first. Anything else, or nothing nearby, keeps the general ranking.
  const foodTerms = taxonomy.mode !== "category" && !intent.recognized ? foodTermsFor(intent.text) : null;
  // 2026-10-24: on production the Claude understand step adds
  // filters.keywords (["tacos"]), and applySearchFilters keeps only docs whose
  // text literally contains that word. That dropped Pepe's Cantina (mexican,
  // 2.2 mi) and even "Taco Bell" ("taco" is not "tacos"), so live St. Pete
  // "tacos" started at 10.7 mi while the same code without that filter led
  // with 2.2 mi. For a food word the food terms (names + cuisines, whole
  // words) already decide what matches, so the literal keyword list is
  // dropped; category / price / kid filters still apply.
  const cardFilters = foodTerms && filters && Array.isArray(filters.keywords) ? { ...filters, keywords: null } : filters;
  const filtered = applySearchFilters(budgetDocs, cardFilters);
  const foodRanked = foodTerms ? rankFoodWordDocs(filtered.docs, foodTerms, city) : [];
  const baseRanked = foodRanked.length ? foodRanked : rankSearchCards(filtered.docs, { query: rankQuery, city, taxonomy });
  const ranked = hasKnownAffordable
    ? [
      ...baseRanked.filter((doc) => (doc.kind === "place" && doc.priceNum != null && doc.priceNum <= 2) || isFreeDoc(doc)),
      ...baseRanked.filter((doc) => !((doc.kind === "place" && doc.priceNum != null && doc.priceNum <= 2) || isFreeDoc(doc))),
    ]
    : baseRanked;
  const seen = new Set();
  const cards = [];
  const guideHits = taxonomy.mode === "category" ? [] : guideRows.filter((guide) => searchScore(guide, rankQuery, city) > 0);
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
  return { cards, city, taxonomy, recognized: intent.recognized === true, constraints };
}

export { classifyPlace, classifyEvent, classifyGuide, coverageOf } from "./searchTaxonomy.js";
