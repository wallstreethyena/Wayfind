// lib/viatorIngest.js — dynamic, LOCATION-GENERIC Viator ingestion. Resolves ANY
// city to its Viator destination (freetext, cached) then pulls that destination's
// top-rated products across the 11 catalogs, maps them to wf_experiences rows and
// keeps only quality10 >= 7.5. This is what makes "Things to do" + verified
// booking buttons appear in cities BEYOND the 5 Florida markets — the owner's ask
// that it work for the user's searched OR default location, permanently, with no
// hardcoded destIds. Pure server helper: no Next, no DB writes (the caller upserts).
import { CATEGORIES, productToRow } from "./experiencesData.js";

const VIATOR = "https://api.viator.com/partner";
const vh = (key) => ({ "exp-api-key": key, Accept: "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" });

// public.wf_quality10 replicated EXACTLY (IMMUTABLE sql fn): a Bayesian blend of
// the product rating toward a 4.2 prior (weight = 60 reviews), scaled to /10. Kept
// in lockstep with the DB — scripts/test-city-viator.mjs pins the identity.
export function quality10(rating, reviews) {
  const r = rating != null ? Number(rating) : 4.0;
  const n = Number(reviews) || 0;
  return Math.round(((n / (n + 60)) * r + (60 / (n + 60)) * 4.2) * 2 * 100) / 100;
}
export const QUALITY_FLOOR = 7.5;

// city string -> Viator destId, cached per warm lambda. Viator ranks freetext
// destination matches by relevance; we take the top match whose name shares a
// token with the query so an off-topic result can't slip through and pollute the
// feed with wrong-geo products (the booking-integrity failure mode).
const destCache = new Map();
export async function resolveViatorDest(cityStr, key, { timeoutMs = 6000 } = {}) {
  const q = String(cityStr || "").trim();
  if (!q || !key) return null;
  const ck = q.toLowerCase();
  if (destCache.has(ck)) return destCache.get(ck);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${VIATOR}/search/freetext`, {
      method: "POST", signal: ctrl.signal, headers: vh(key),
      body: JSON.stringify({ searchTerm: q, currency: "USD", searchTypes: [{ searchType: "DESTINATIONS", pagination: { start: 1, count: 5 } }] }),
    });
    if (!r.ok) { destCache.set(ck, null); return null; }
    const d = await r.json();
    const results = d && d.destinations && Array.isArray(d.destinations.results) ? d.destinations.results : [];
    const cityTokens = ck.split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
    const hit = results.find((x) => {
      const name = String((x && (x.name || x.destinationName)) || "").toLowerCase();
      return name && cityTokens.some((tok) => name.includes(tok));
    }) || results[0] || null;
    const id = hit ? String((hit.id != null ? hit.id : hit.destinationId != null ? hit.destinationId : hit.ref) || "").replace(/^d/i, "") : "";
    const destId = /^\d+$/.test(id) ? id : null;
    destCache.set(ck, destId);
    return destId;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function searchDestTag(destId, tag, key, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${VIATOR}/products/search`, {
      method: "POST", signal: ctrl.signal, headers: vh(key),
      body: JSON.stringify({ filtering: { destination: String(destId), tags: [tag] }, sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" }, pagination: { start: 1, count: 25 }, currency: "USD" }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.products) ? d.products : [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function pool(thunks, limit) {
  const out = []; let i = 0;
  async function w() { while (i < thunks.length) { const k = i++; out[k] = await thunks[k](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length || 1) }, w));
  return out;
}

// Pull a city's Viator products (any destination on earth) as wf_experiences
// rows, quality gated. Returns { destId, rows }; rows is [] when there's no key,
// no resolvable destination, or nothing clears the floor. Never throws.
export async function pullViatorCityRows(cityStr, key, { concurrency = 6 } = {}) {
  const destId = await resolveViatorDest(cityStr, key);
  if (!destId) return { destId: null, rows: [] };
  const city = String(cityStr || "").split(",")[0].trim().slice(0, 80);
  const raw = await pool(
    CATEGORIES.map((c) => () => searchDestTag(destId, c.tag, key, 9000).then((products) => ({ products, c }))),
    concurrency
  );
  const byCode = new Map();
  for (const { products, c } of raw) {
    for (const p of products) {
      const base = productToRow(p, destId, city);
      if (!base) continue;
      const hit = byCode.get(base.product_code);
      if (hit) hit.cats.add(c.key);
      else byCode.set(base.product_code, { row: base, cats: new Set([c.key]) });
    }
  }
  const nowIso = new Date().toISOString();
  const rows = [...byCode.values()]
    .map(({ row, cats }) => ({ ...row, categories: [...cats], refreshed_at: nowIso }))
    .filter((row) => quality10(row.rating, row.reviews) >= QUALITY_FLOOR);
  return { destId, rows };
}
