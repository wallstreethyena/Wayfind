// lib/inventoryBoxBatch.js — SERVER-ONLY. WO8b (2026-09-02), PRODUCTION PERF
// REGRESSION, part 2.
//
// WO8 cut BYTES (editorial off the bulk reads, ~33% smaller). It did not cut
// ROUND TRIPS — the memo cache only collapses two calls that ask for the
// EXACT same box, and loadPools' cats x cities loop and buildDrivePool's
// neighbour-city fan-out almost never repeat a box; they ask for many
// DIFFERENT, often-overlapping ones. Round trips are the clock (~200-500ms
// each), so this file cuts THOSE: it groups a set of {catSlug, city} jobs
// whose read boxes actually overlap, issues ONE consolidated wf_inventory
// read per overlapping group, and reproduces each city's own
// serveFromInventory(...) result — same physical category, same chip/sub
// filter, same radius, same n, same rankInventory call — from that one
// fetch's rows. It then PRIMES the caller's readCache under the exact key
// serveFromInventory would have used, so the caller's normal rankedFor(...)
// calls run completely unmodified and simply find their answer already
// cached. Nothing about ranking, radii, predicates, or caps changes — only
// how many times the network is asked for rows that answer them.
//
// SAFETY — WHY ONLY OVERLAPPING BOXES ARE MERGED. A rectangular box big
// enough to cover two FAR-APART cities also covers the empty water/marsh/
// interstate between them. Reading it wastes rows on ground nothing needs and
// — the real risk — competes with genuinely relevant rows for the same
// `limit`, reintroducing exactly the heap-order truncation v8.49 exists to
// prevent (see lib/inventoryServe.js's header on that bug). So two cities'
// boxes are merged ONLY when they geometrically overlap; a city whose box is
// disjoint from every other city in its category group keeps its own
// individual, uncombined read — this file changes nothing about it, and the
// caller's normal (memoized but unconsolidated) path serves it.
//
// EQUIVALENCE. This is provable, not just argued: the union box is a
// SUPERSET of every member box, so it can only ADMIT rows a per-city read
// would also have found (nothing member-box-eligible is excluded here that
// the individual read would have kept) — and each city's own result is still
// produced by calling the SAME rankInventory(rows, city.lat, city.lng,
// radiusM, n) the individual path calls, re-applying that city's own exact
// distance gate to the shared row set. scripts/test-rail-compute-budget.mjs's
// equivalence snapshot is what proves the two paths agree in practice, not
// just in this argument.
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { rankInventory, boxForRadius, LEAN_INVENTORY_FIELDS } from "./inventoryServe.js";
import { LANDING_INV_SPEC } from "./landingInventory.js";

// The two radii fetchLandingInventory's tryAt() ever asks for (lib/
// landingInventory.js: tight then, only if thin, wide). The union box is
// sized to the WIDE radius so either request the caller ends up making finds
// its answer already primed.
const TIGHT_RADIUS_M = 27359;
const WIDE_RADIUS_M = 48280;
// fetchLandingInventory never sets opts.limit from either call site this
// batches (loadPools, buildDrivePool) — n is always this floor.
const N = 80;

function cityKey(city) {
  return `${Number(city.lat).toFixed(6)},${Number(city.lng).toFixed(6)}`;
}

function boxesOverlap(a, b) {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLng < b.minLng || a.minLng > b.maxLng);
}

// Union-find over box-overlap: groups of 2+ cities whose WIDE boxes touch,
// transitively (A overlaps B, B overlaps C -> one group of three, even if A
// and C do not directly overlap). A city that overlaps nothing stays its own
// singleton group and is left for the caller's normal per-city read.
function clusterByOverlap(cities) {
  const boxes = cities.map((c) => boxForRadius(c.lat, c.lng, WIDE_RADIUS_M));
  const parent = cities.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) union(i, j);
    }
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

async function fetchUnionBox(s, physical, box, limit, deadlineMs) {
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const base = `${s.url}/rest/v1/wf_inventory?select=${LEAN_INVENTORY_FIELDS}&limit=${limit}`
    + `&lat=gte.${box.minLat.toFixed(4)}&lat=lte.${box.maxLat.toFixed(4)}`
    + `&lng=gte.${box.minLng.toFixed(4)}&lng=lte.${box.maxLng.toFixed(4)}`;
  const withSecondary = `${base}&or=(category.eq.${physical},secondary_categories.cs.{${physical}})`;
  const plain = `${base}&category=eq.${physical}`;
  try {
    let r = await fetchDeadline(withSecondary, { headers: h, cache: "no-store" }, deadlineMs);
    if (!r.ok) r = await fetchDeadline(plain, { headers: h, cache: "no-store" }, deadlineMs); // pre-migration
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

// Same shape serveFromInventoryUncached applies before calling rankInventory
// — the chip/sub contract must run BEFORE the per-city cap (v8.49), and it is
// a pure per-row predicate that does not depend on which city is asking, so
// it runs ONCE here on the shared fetched set rather than once per city.
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

/**
 * Primes `readCache` for every job whose city clusters with at least one
 * other city sharing its physical category. `jobs` is [{catSlug, city}] —
 * catSlug a LANDING_CATS key ("things-to-do" | "restaurants" | "beaches" |
 * "nightlife"), city an object carrying .lat/.lng (a LANDING_CITIES entry).
 * Never throws; a failed consolidated read simply primes nothing for that
 * group and the caller's normal per-city path runs as if this were never
 * called — same fail-soft contract every read site in this pipeline keeps.
 */
export async function primeConsolidatedInventoryReads(jobs, readCache) {
  if (!Array.isArray(jobs) || !jobs.length || !readCache) return;
  const { sbEnv } = await import("./serverCache.js");
  const s = sbEnv();
  if (!s) return;

  // Group jobs by physical wf_inventory category (LANDING_INV_SPEC maps
  // catSlug -> {cat: physical, sub} 1:1 for all four rankedFor categories).
  const byPhysical = new Map();
  for (const { catSlug, city } of jobs) {
    if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
    const spec = LANDING_INV_SPEC[catSlug];
    if (!spec) continue;
    const k = spec.cat;
    if (!byPhysical.has(k)) byPhysical.set(k, { sub: spec.sub, cities: new Map() });
    byPhysical.get(k).cities.set(cityKey(city), city);
  }

  for (const [physical, { sub, cities: cityMap }] of byPhysical) {
    const cities = [...cityMap.values()];
    if (cities.length < 2) continue; // nothing to consolidate — single city, own read
    const clusters = clusterByOverlap(cities);
    for (const cluster of clusters) {
      if (cluster.cities.length < 2) continue; // disjoint — left for the per-city path
      // "limit sized to cover the sum of per-city caps" (WO8b) — each
      // individual read this replaces was itself capped at limit=1000, so the
      // union read gets that much room per member city. The 20000 ceiling
      // only guards a pathological future cluster (a metro whose pool grows
      // to dozens of overlapping towns) from requesting an unbounded limit;
      // no cluster this pipeline forms today comes close to it.
      const limit = Math.min(1000 * cluster.cities.length, 20000);
      const rows = await fetchUnionBox(s, physical, cluster.box, limit, DB_DEADLINE_MS);
      if (!rows.length) continue;
      const filtered = await applySubFilter(rows, physical, sub);
      for (const city of cluster.cities) {
        for (const radiusM of [TIGHT_RADIUS_M, WIDE_RADIUS_M]) {
          const result = rankInventory(filtered, city.lat, city.lng, radiusM, N);
          const key = `srv:${physical}:${Number(city.lat).toFixed(4)}:${Number(city.lng).toFixed(4)}:${radiusM}:${N}:${sub}:0:1`;
          readCache.get(key, () => result);
        }
      }
    }
  }
}
