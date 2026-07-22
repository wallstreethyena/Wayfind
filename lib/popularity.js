// lib/popularity.js — Tier-2 popularity fetchers (owner handoff, 2026-07-21).
// Each source drops ONE oriented number (higher = more popular) per place
// into wf_place_popularity; wf_place_popularity_scored normalizes; the
// wf_best_picks ranker auto-blends. This module never invents a metric:
// no match above the confidence floor, or a missing field, means NO row.
//
// Implemented sources (keys verified in Preview + Production):
//   yelp        — review_count            (food)
//   foursquare  — popularity 0..1         (all categories; only when the
//                 API actually returns the field — never derived)
//   tripadvisor — num_reviews             (all; hard per-run cap, the free
//                 tier is 5k calls/month and each place costs 2 calls)
//   wikipedia   — 30-day pageviews        (attractions + beaches; keyless)
// Documented follow-ups, deliberately NOT wired:
//   besttime    — needs a street address; wf_inventory stores none. Wiring
//                 it on name+coords returns wrong venues — worse than empty.
//   ticketmaster/predicthq — event demand, not place popularity; they join
//                 when the event→venue mapping lands (#231).
export const SOURCE_CAPS = { tripadvisor: 20 }; // per cron run
export const CONFIDENCE_FLOOR = 0.55;

const T = 4500;
const jf = async (url, init) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), T);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
};

// ── matching ────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export function nameSim(a, b) {
  const ta = new Set(norm(a).split(" ").filter(Boolean));
  const tb = new Set(norm(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.max(ta.size, tb.size);
}
const R = 3958.8;
export function distMi(a, b, c, d) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(c - a), dLng = rad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// 70% name, 30% proximity (full credit ≤0.15mi, zero ≥1mi). A candidate with
// no coordinates leans on the name alone, scaled down — never up.
export function matchConfidence(place, cand) {
  const n = nameSim(place.name, cand.name);
  if (cand.lat == null || cand.lng == null) return n * 0.7;
  const d = distMi(place.lat, place.lng, cand.lat, cand.lng);
  const prox = d <= 0.15 ? 1 : d >= 1 ? 0 : 1 - (d - 0.15) / 0.85;
  return 0.7 * n + 0.3 * prox;
}
export function bestMatch(place, cands) {
  let best = null, bc = 0;
  for (const c of cands || []) {
    const conf = matchConfidence(place, c);
    if (conf > bc) { bc = conf; best = c; }
  }
  return best && bc >= CONFIDENCE_FLOOR ? { cand: best, confidence: Math.round(bc * 100) / 100 } : null;
}

// ── routing ─────────────────────────────────────────────────────────────────
export function sourcesFor(category) {
  if (category === "food" || category === "nightlife") return ["yelp", "foursquare", "tripadvisor"];
  if (category === "attractions" || category === "beach") return ["wikipedia", "foursquare", "tripadvisor"];
  return ["foursquare", "tripadvisor"];
}

// ── fetchers: each returns {external_id, metric_value, raw, match_confidence} or null ──
export async function fetchYelp(place) {
  const key = (process.env["YELP_API_KEY"] || "").trim();
  if (!key) return null;
  const d = await jf(`https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(place.name)}&latitude=${place.lat}&longitude=${place.lng}&radius=1600&limit=3`, { headers: { Authorization: "Bearer " + key } });
  const cands = (d && d.businesses || []).map((b) => ({ id: b.id, name: b.name, lat: b.coordinates && b.coordinates.latitude, lng: b.coordinates && b.coordinates.longitude, reviews: b.review_count }));
  const m = bestMatch(place, cands);
  if (!m || m.cand.reviews == null) return null;
  return { external_id: m.cand.id, metric_value: m.cand.reviews, raw: { review_count: m.cand.reviews }, match_confidence: m.confidence };
}

export async function fetchFoursquare(place) {
  const key = (process.env["FOURSQUARE_API_KEY"] || "").trim();
  if (!key) return null;
  const d = await jf(`https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(place.name)}&ll=${place.lat},${place.lng}&radius=1600&limit=3&fields=fsq_id,name,geocodes,popularity`, { headers: { Authorization: key } });
  const cands = (d && d.results || []).map((r) => ({ id: r.fsq_id, name: r.name, lat: r.geocodes && r.geocodes.main && r.geocodes.main.latitude, lng: r.geocodes && r.geocodes.main && r.geocodes.main.longitude, popularity: r.popularity }));
  const m = bestMatch(place, cands);
  if (!m || typeof m.cand.popularity !== "number") return null; // field is tier-gated: absent -> no row, never derived
  return { external_id: m.cand.id, metric_value: m.cand.popularity, raw: { popularity: m.cand.popularity }, match_confidence: m.confidence };
}

export async function fetchTripadvisor(place) {
  const key = (process.env["TRIPADVISOR_API_KEY"] || "").trim();
  if (!key) return null;
  const s = await jf(`https://api.content.tripadvisor.com/api/v1/location/search?key=${key}&searchQuery=${encodeURIComponent(place.name)}&latLong=${place.lat},${place.lng}&radius=2&radiusUnit=mi&language=en`);
  const cands = (s && s.data || []).slice(0, 3).map((r) => ({ id: r.location_id, name: r.name, lat: null, lng: null }));
  const m = bestMatch(place, cands);
  if (!m) return null;
  const det = await jf(`https://api.content.tripadvisor.com/api/v1/location/${m.cand.id}/details?key=${key}&language=en`);
  const n = det && det.num_reviews != null ? parseInt(det.num_reviews, 10) : null;
  if (!Number.isFinite(n)) return null;
  return { external_id: String(m.cand.id), metric_value: n, raw: { num_reviews: n }, match_confidence: m.confidence };
}

export async function fetchWikipedia(place) {
  // keyless: find the article, sum 30 days of pageviews
  const s = await jf(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(place.name)}&limit=1&namespace=0&format=json&origin=*`);
  const title = s && s[1] && s[1][0];
  if (!title || nameSim(place.name, title) < CONFIDENCE_FLOOR) return null;
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 30);
  const fmt = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, "");
  const pv = await jf(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, "_"))}/daily/${fmt(start)}/${fmt(end)}`);
  const total = (pv && pv.items || []).reduce((a, x) => a + (x.views || 0), 0);
  if (!total) return null;
  return { external_id: title, metric_value: total, raw: { pageviews_30d: total }, match_confidence: Math.round(nameSim(place.name, title) * 100) / 100 };
}

export const FETCHERS = { yelp: fetchYelp, foursquare: fetchFoursquare, tripadvisor: fetchTripadvisor, wikipedia: fetchWikipedia };
