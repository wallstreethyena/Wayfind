// lib/searchRank.js — order unified search hits in code.
//
// The model may only narrow a candidate set. It never names a place, never
// returns prose, and never supplies this order. Affiliate, sponsor, offer, and
// commission fields are not read, even if a future row grows one.
//
// Card order is relevance, then quality (the Wayfind Score from a real rating
// and review count), then distance. A category hit can qualify a row when the
// query is a category phrase. It never invents a rating.

import { wayfindScore } from "./wayfindScore.js";
import { dateNightFit, taxonomyMatches } from "./searchTaxonomy.js";

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function grams(padded) {
  const out = new Set();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Same shape as pg_trgm similarity: padded 3-grams, |intersection| / |union|. */
export function trigramSimilarity(left, right) {
  const a = grams(`  ${normalize(left)} `);
  const b = grams(`  ${normalize(right)} `);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

function wordSimilarity(query, title) {
  const qt = normalize(query).split(" ").filter((token) => token.length > 3);
  const tt = normalize(title).split(" ").filter((token) => token.length > 2);
  if (!qt.length || !tt.length) return 0;
  let total = 0;
  for (const word of qt) {
    let best = 0;
    for (const other of tt) best = Math.max(best, trigramSimilarity(word, other));
    if (best < 0.45) return 0;
    total += best;
  }
  return total / qt.length;
}

function miles(aLat, aLng, bLat, bLng) {
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLng = (bLng - aLng) * p;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return (2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)))) / 1609.344;
}

function haystack(doc) {
  return normalize([doc.title, doc.city_name, ...(doc.keywords || [])].filter(Boolean).join(" "));
}

export function searchScore(doc, query, city) {
  const q = normalize(query);
  const title = normalize(doc && doc.title);
  if (!q || q.length < 2 || !title) return 0;
  const hay = haystack(doc);
  let score = 0;
  if (title === q) score = 1000;
  else if (title.startsWith(`${q} `) || title.startsWith(q)) score = 700;
  else if (title.includes(q) || hay.includes(q)) score = title.includes(q) ? 520 : 280;
  else {
    const sim = Math.max(trigramSimilarity(title, q), wordSimilarity(q, title));
    if (sim < 0.42) return 0;
    score = Math.round(200 + sim * 300);
  }
  if (city && doc.city_slug && (doc.city_slug === city.slug || doc.city_slug === city.pageSlug)) score += 40;
  if (city && Number.isFinite(Number(doc.lat)) && Number.isFinite(Number(doc.lng))) {
    score -= Math.min(miles(city.lat, city.lng, Number(doc.lat), Number(doc.lng)), 400) * 0.12;
  }
  return score;
}

const CATEGORIES = new Set(["food", "nightlife", "attractions", "beach", "hotels", "shopping", "events", "guides", "coupons"]);

function categoryAgrees(doc, category) {
  if (!category || !CATEGORIES.has(category)) return true;
  if (!doc.category) return true;
  if (doc.category === category) return true;
  if (category === "beach" && doc.category === "beaches") return true;
  if (category === "events" && doc.kind === "event") return true;
  if (category === "guides" && doc.kind === "guide") return true;
  if (category === "coupons" && doc.kind === "coupon") return true;
  return false;
}

/** Drop rows the validated filters exclude. A filter that would empty the set is not applied. */
export function applySearchFilters(docs, filters) {
  if (!filters) return { docs: docs || [], relaxed: false };
  const next = (docs || []).filter((doc) => {
    if (!categoryAgrees(doc, filters.category)) return false;
    if (filters.kid_friendly === true && doc.kid_friendly === false) return false;
    if (filters.price && doc.price_band && doc.price_band !== filters.price) return false;
    if (Array.isArray(filters.keywords) && filters.keywords.length) {
      const hay = haystack(doc);
      if (!filters.keywords.some((keyword) => hay.includes(normalize(keyword)))) return false;
    }
    return true;
  });
  if (!next.length) return { docs: docs || [], relaxed: true };
  return { docs: next, relaxed: false };
}

export function rankSearchDocuments(docs, { query, city, filters } = {}) {
  const applied = applySearchFilters(docs, filters);
  return applied.docs
    .map((doc) => ({ doc, score: searchScore(doc, query, city) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.doc.title).localeCompare(String(b.doc.title)) || String(a.doc.href).localeCompare(String(b.doc.href)))
    .map((row) => row.doc);
}

function qualityPoints(doc) {
  const rating = Number(doc && doc.rating);
  const reviews = Number(doc && doc.reviews);
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  const score = wayfindScore(rating, Number.isFinite(reviews) && reviews > 0 ? reviews : 0);
  return score == null ? 0 : score;
}

function milesAway(doc, city) {
  if (!city || !Number.isFinite(Number(doc && doc.lat)) || !Number.isFinite(Number(doc && doc.lng))) return null;
  if (!Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lng))) return null;
  return miles(Number(city.lat), Number(city.lng), Number(doc.lat), Number(doc.lng));
}

function editDistance(left, right) {
  if (Math.abs(left.length - right.length) > 2) return 3;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = new Array(cols);
  const next = new Array(cols);
  for (let col = 0; col < cols; col++) prev[col] = col;
  for (let row = 1; row < rows; row++) {
    next[0] = row;
    let best = next[0];
    for (let col = 1; col < cols; col++) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      next[col] = Math.min(prev[col] + 1, next[col - 1] + 1, prev[col - 1] + cost);
      if (next[col] < best) best = next[col];
    }
    if (best > 2) return 3;
    for (let col = 0; col < cols; col++) prev[col] = next[col];
  }
  return prev[cols - 1];
}

/** One-token typos the trigram floor misses ("manetees" / "manatee"). */
function typoPoints(query, title) {
  const wanted = normalize(query).split(" ").filter((token) => token.length >= 7);
  const have = normalize(title).split(" ").filter((token) => token.length >= 6);
  if (!wanted.length || !have.length) return 0;
  for (const word of wanted) {
    if (!have.some((other) => editDistance(word, other) <= 2)) return 0;
  }
  return 240;
}

function keywordHit(doc, taxonomy) {
  const words = taxonomy && Array.isArray(taxonomy.keywords) ? taxonomy.keywords : [];
  if (!words.length) return false;
  const hay = haystack(doc);
  return words.some((word) => hay.includes(normalize(word)));
}

function editorialKind(doc) {
  return !!(doc && (doc.kind === "guide" || doc.kind === "event"));
}

// A guide with no coordinates belongs to its city. Another city's guide is
// not a result. An event with coordinates still uses the radius below.
function editorialOutsideCity(doc, city) {
  if (!editorialKind(doc) || !doc.city_slug || !city) return false;
  if (doc.city_slug === city.slug || doc.city_slug === city.pageSlug) return false;
  if (Number.isFinite(Number(doc.lat)) && Number.isFinite(Number(doc.lng))) return false;
  return true;
}

/** Relevance + quality + distance. 0 means the row is not a result. */
export function cardRankScore(doc, { query, city, taxonomy } = {}) {
  if (editorialOutsideCity(doc, city)) return 0;
  const text = searchScore(doc, query, city);
  const mode = taxonomy && taxonomy.mode;
  const navHit = doc && doc.nav;
  const categoryHit = taxonomyMatches(navHit, taxonomy);
  let categoryPoints = 0;
  if (navHit && taxonomy && Array.isArray(taxonomy.categories) && taxonomy.categories.includes(navHit.category)) {
    categoryPoints = mode === "category" ? 460 : 70;
    if (taxonomy.subs && taxonomy.subs.includes(`${navHit.category}:${navHit.sub}`) && navHit.sub && navHit.sub !== "all") categoryPoints += 80;
  }
  const words = keywordHit(doc, taxonomy) ? 220 : 0;
  const typos = text > 0 ? 0 : typoPoints(query, doc && doc.title);
  const editorial = editorialKind(doc);
  let fitPoints = 0;
  if (taxonomy && taxonomy.fit === "date") {
    // The room test is for places. A guide or event that actually matches
    // the phrase stays in the same list; a family restaurant still drops.
    if (!editorial) {
      const fit = dateNightFit(doc);
      if (fit === "excluded") return 0;
      if (fit !== "favored" && fit !== "room" && text < 500) return 0;
      // Same relevance for every fitting room. Quality and distance still
      // order those rooms. A generic meal room stays eligible behind them.
      if (fit === "favored") fitPoints = 180;
    } else if (text <= 0 && words <= 0 && typos <= 0) return 0;
  }
  // Places earn the category shelf by being that kind of room. A matching
  // guide or event earns the same shelf from the phrase itself when its own
  // nav category is a different shelf (a date-night ghost tour is filed
  // under attractions). No commercial field is read.
  if (editorial && mode === "category" && text >= 280 && categoryPoints === 0) categoryPoints = 460;
  if (mode === "category") {
    if (!categoryHit && words <= 0 && typos <= 0 && text < 500) return 0;
  } else if (mode === "kind") {
    const kinds = taxonomy.kinds || [];
    if (!kinds.includes(doc && doc.kind)) return 0;
  } else if (text <= 0 && words <= 0 && typos <= 0) return 0;
  const away = milesAway(doc, city);
  const cap = taxonomy && Number(taxonomy.radiusMi) > 0 ? Number(taxonomy.radiusMi) : 140;
  if (away != null && away > cap && text < 500) return 0;
  const distancePenalty = away == null ? 18 : Math.min(away, 160) * 1.15;
  return text + categoryPoints + fitPoints + words + typos + qualityPoints(doc) * 0.45 - distancePenalty;
}

export function rankSearchCards(docs, ctx) {
  return (docs || [])
    .map((doc) => ({ doc, score: cardRankScore(doc, ctx) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || qualityPoints(b.doc) - qualityPoints(a.doc) || String(a.doc.title).localeCompare(String(b.doc.title)) || String(a.doc.href || "").localeCompare(String(b.doc.href || "")))
    .map((row) => row.doc);
}

export function dedupeSearchResults(results, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const row of results || []) {
    if (!row || !row.href || seen.has(row.href)) continue;
    seen.add(row.href);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
