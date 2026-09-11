// lib/inventoryBoxBatch.js — SERVER-ONLY. WO8b (2026-09-02), PRODUCTION PERF
// REGRESSION, part 2.
//
// The batch reader is an accelerator only. It may save round trips, but it may
// never decide which candidates exist.
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { rankInventory, boxForRadius, LEAN_INVENTORY_FIELDS } from "./inventoryServe.js";
import { LANDING_INV_SPEC } from "./landingInventory.js";

const TIGHT_RADIUS_M = 27359;
const WIDE_RADIUS_M = 48280;
const N = 80;
export const PRIME_DEADLINE_MS = Math.min(DB_DEADLINE_MS, 1500);

function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lng).toFixed(6)}`;
}

function boxesOverlap(a, b) {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLng < b.minLng || a.minLng > b.maxLng);
}

function clusterByOverlap(cities) {
  const boxes = cities.map((c) => boxForRadius(c.lat, c.lng, WIDE_RADIUS_M));
  const parent = cities.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) if (boxesOverlap(boxes[i], boxes[j])) union(i, j);
  }
  const groups = new Map();
  for (let i = 0; i < cities.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].map((idxs) => ({
    cities: idxs.map((i) => cities[i]),
    box: idxs.reduce((acc, i) => ({
      minLat: Math.min(acc.minLat, boxes[i].minLat), maxLat: Math.max(acc.maxLat, boxes[i].maxLat),
      minLng: Math.min(acc.minLng, boxes[i].minLng), maxLng: Math.max(acc.maxLng, boxes[i].maxLng),
    }), boxes[idxs[0]]),
  }));
}

// Stable order removes heap-order roulette. A short response proves the union
// is complete. If the response fills the whole limit, another candidate may
// exist, so discard the prime and let the authoritative per-city reads run.
async function fetchUnionBox(s, physical, box, limit, deadlineMs) {
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const base = `${s.url}/rest/v1/wf_inventory?select=${LEAN_INVENTORY_FIELDS}&limit=${limit}&order=place_id.asc`
    + `&lat=gte.${box.minLat.toFixed(4)}&lat=lte.${box.maxLat.toFixed(4)}`
    + `&lng=gte.${box.minLng.toFixed(4)}&lng=lte.${box.maxLng.toFixed(4)}`;
  const withSecondary = `${base}&or=(category.eq.${physical},secondary_categories.cs.{${physical}})`;
  const plain = `${base}&category=eq.${physical}`;
  try {
    let r = await fetchDeadline(withSecondary, { headers: h, cache: "no-store" }, deadlineMs);
    if (!r.ok) r = await fetchDeadline(plain, { headers: h, cache: "no-store" }, deadlineMs);
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length >= limit) return [];
    return rows;
  } catch {
    return [];
  }
}

async function applySubFilter(rows, cat, subId) {
  if (!subId || subId === "all") return rows;
  const key = `${cat}:${subId}`;
  const { chipIdentity, CHIP_IDENTITY } = await import("./chipIdentity.js");
  const { SUB_ALLOW } = await import("./placeFilter.js");
  if (!(CHIP_IDENTITY[key] || SUB_ALLOW[key])) return rows;
  return rows.filter((row) => {
    try {
      return chipIdentity(cat, subId, {
        name: row.name, types: row.google_types || [],
        primary_type: row.primary_type, primaryType: row.primary_type,
        category: row.category,
      });
    } catch { return true; }
  });
}

export async function primeConsolidatedInventoryReads(jobs, readCache, deps = {}) {
  if (!Array.isArray(jobs) || !jobs.length || !readCache) return;
  const { sbEnv } = await import("./serverCache.js");
  const s = deps.config || sbEnv();
  if (!s) return;

  const byPhysical = new Map();
  for (const { catSlug, city } of jobs) {
    if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
    const spec = LANDING_INV_SPEC[catSlug];
    if (!spec) continue;
    const k = spec.cat;
    if (!byPhysical.has(k)) byPhysical.set(k, { sub: spec.sub, cities: new Map() });
    byPhysical.get(k).cities.set(cityKey(city), city);
  }

  const batches = [];
  for (const [physical, { sub, cities: cityMap }] of byPhysical) {
    const cities = [...cityMap.values()];
    if (cities.length < 2) continue;
    const clusters = clusterByOverlap(cities);
    for (const cluster of clusters) {
      if (cluster.cities.length < 2) continue;
      // Runaway ceiling, never a merchandising cut. Filling it makes the prime
      // ambiguous, and fetchUnionBox refuses to cache that partial universe.
      const limit = Math.min(1000 * cluster.cities.length, 20000);
      batches.push(async () => {
        const rows = await (deps.readUnion || fetchUnionBox)(s, physical, cluster.box, limit, PRIME_DEADLINE_MS);
        if (!rows.length) return;
        const filtered = await applySubFilter(rows, physical, sub);
        for (const city of cluster.cities) {
          for (const radiusM of [TIGHT_RADIUS_M, WIDE_RADIUS_M]) {
            const result = rankInventory(filtered, city.lat, city.lng, radiusM, N);
            const key = `srv:${physical}:${Number(city.lat).toFixed(4)}:${Number(city.lng).toFixed(4)}:${radiusM}:${N}:${sub}:0:1`;
            readCache.get(key, () => result);
          }
        }
      });
    }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      try { await batch(); } catch { /* leave unprimed; normal read owns truth */ }
    }
  }));
}
