// lib/areaTwins.js — READ-ONLY detector for generic district / area pins stored twice.
//
// WHY (2026-10-14): "Downtown Winter Haven" (tourist_attraction, 3 reviews) and
// "Downtown, Winter Haven, Fl" (event_venue, 22 reviews) sat 87 m apart in
// wf_inventory as two cards for one downtown. Neither existing detector can see it:
//   - scripts/check-inventory-integrity.mjs groups on EXACT lowercase name, so the
//     comma and ", Fl" suffix hide the pair;
//   - tools/python/wayfind_audit duplicates() needs the SAME category and a 0.92
//     name similarity, and Google types these two differently.
//
// This module only REPORTS. It never edits, merges or retires anything — a human
// reviews each pair, then a reversible migration (see
// supabase/migrations/20261014120000_winter_haven_downtown_twin.sql for the pattern).
//
// Pure functions, no I/O, so scripts/test-area-twins.mjs can import and invoke them.

const STATE_SUFFIX = /(?:,\s*|\s+)(?:fl|fla|florida)\.?\s*$/i;

// Words that make a name a generic place-of-the-area rather than a business.
const AREA_WORDS = [
  "downtown", "midtown", "uptown", "old town", "oldtown", "town center", "town centre",
  "city center", "city centre", "historic district", "historic downtown", "arts district",
  "business district", "district", "village", "waterfront", "main street", "downtown area",
];

// Tokens dropped before comparing, so "Downtown X" == "Downtown X Historic District".
const NOISE_TOKENS = new Set(["the", "of", "in", "area", "historic", "district", "fl", "fla", "florida", "dt", "dtwn"]);

const SYNONYMS = new Map([
  ["dtwn", "downtown"], ["dt", "downtown"], ["oldtown", "old town"], ["centre", "center"],
  ["st", "street"], ["saint", "st"],
]);

function strip(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "Downtown, Winter Haven, Fl" and "Downtown Winter Haven" -> "downtown winter haven". */
export function normalizeAreaName(name) {
  let s = strip(name).trim();
  s = s.replace(STATE_SUFFIX, "");
  s = s.replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ");
  const toks = s.split(/\s+/).filter(Boolean).map((t) => SYNONYMS.get(t) || t);
  return toks.filter((t) => !NOISE_TOKENS.has(t)).join(" ");
}

/** True when the NAME says "an area" (Downtown X, X Village, Old Town ...). Category is ignored on purpose. */
export function isAreaName(name) {
  const s = " " + strip(name).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
  return AREA_WORDS.some((w) => s.includes(" " + w + " "));
}

export function metersApart(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function reviews(r) { return Number((r && r.signals && r.signals.reviews) || 0); }

/**
 * Rows are serving wf_inventory rows ({place_id,name,lat,lng,metro,primary_type,category,signals}).
 * Returns pairs of area-named rows whose normalized names are equal and that sit within maxMeters.
 * Different category / primary_type is ALLOWED (that is the whole point). Sorted by distance.
 */
export function findAreaTwins(rows, { maxMeters = 400 } = {}) {
  const buckets = new Map();
  for (const r of rows) {
    if (!r || !r.name || r.lat == null || r.lng == null || !isAreaName(r.name)) continue;
    const key = normalizeAreaName(r.name);
    if (!key || key.split(" ").length < 2) continue; // a bare "village" is not an identity
    (buckets.get(key) || buckets.set(key, []).get(key)).push(r);
  }
  const out = [];
  for (const [key, g] of buckets) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      if (g[i].place_id === g[j].place_id) continue;
      const m = metersApart(g[i], g[j]);
      if (m > maxMeters) continue;
      const [a, b] = reviews(g[i]) >= reviews(g[j]) ? [g[i], g[j]] : [g[j], g[i]];
      out.push({
        key, meters: Math.round(m),
        stronger: { place_id: a.place_id, name: a.name, primary_type: a.primary_type || null, reviews: reviews(a) },
        weaker: { place_id: b.place_id, name: b.name, primary_type: b.primary_type || null, reviews: reviews(b) },
        sameType: (a.primary_type || null) === (b.primary_type || null),
        metro: a.metro || null,
      });
    }
  }
  return out.sort((x, y) => x.meters - y.meters);
}
