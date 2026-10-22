// lib/searchRank.js — order unified search hits in code.
//
// The model may only narrow a candidate set. It never names a place, never
// returns prose, and never supplies this order. Affiliate, sponsor, offer, and
// commission fields are not read, even if a future row grows one.

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
