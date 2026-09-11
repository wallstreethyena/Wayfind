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

function remainingMs(deadlineAt) {
  const left = Math.floor(deadlineAt - Date.now());
  if (left <= 0) throw new Error("Inventory union prime exceeded its deadline");
  return left;
}

function beforeDeadline(start, deadlineAt) {
  const left = remainingMs(deadlineAt);
  let timer;
  return Promise.race([
    Promise.resolve().then(start),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Inventory union prime exceeded its deadline")), left);
    }),
  ]).finally(() => clearTimeout(timer));
}

function contentRange(response) {
  const raw = response?.headers && typeof response.headers.get === "function"
    ? response.headers.get("content-range")
    : null;
  if (raw == null || raw === "") return null;
  const match = String(raw).match(/^\s*(?:(\d+)-(\d+)|\*)\/(\d+|\*)\s*$/);
  if (!match) throw new Error("Inventory union returned a malformed Content-Range");
  return {
    start: match[1] == null ? null : Number(match[1]),
    end: match[2] == null ? null : Number(match[2]),
    total: match[3] === "*" ? null : Number(match[3]),
  };
}

function rowsAreUnique(rows, seen = new Set()) {
  for (const row of rows) {
    const id = row && typeof row.place_id === "string" ? row.place_id.trim() : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

async function isMissingSecondaryColumn(response, deadlineAt) {
  if (response?.status !== 400) return false;
  try {
    const body = await beforeDeadline(() => response.json(), deadlineAt);
    const diagnostic = body && typeof body === "object"
      ? `${body.message || ""} ${body.details || ""}`
      : "";
    return body?.code === "42703" && /\bsecondary_categories\b/.test(diagnostic);
  } catch {
    return false;
  }
}

// Ask for the entire ceiling plus one on the first request. PostgREST may cap
// that response below the requested Range, so subsequent offsets advance by
// the number of rows actually returned. Exact counts can prove completion
// without an extra request; otherwise only an empty terminal/+1 probe can.
async function fetchUnionBox(s, physical, box, limit, deadlineMs, suppliedDeadlineAt) {
  const deadlineAt = Number.isFinite(suppliedDeadlineAt)
    ? suppliedDeadlineAt
    : Date.now() + deadlineMs;
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "count=exact", "Range-Unit": "items" };
  const base = `${s.url}/rest/v1/wf_inventory?select=${LEAN_INVENTORY_FIELDS}&order=place_id.asc`
    + `&lat=gte.${box.minLat.toFixed(4)}&lat=lte.${box.maxLat.toFixed(4)}`
    + `&lng=gte.${box.minLng.toFixed(4)}&lng=lte.${box.maxLng.toFixed(4)}`;
  const withSecondary = `${base}&or=(category.eq.${physical},secondary_categories.cs.{${physical}})`;
  const plain = `${base}&category=eq.${physical}`;
  const rows = [];
  const seen = new Set();
  let url = withSecondary;
  let countMode;
  let exactTotal = null;

  try {
    while (rows.length <= limit) {
      const from = rows.length;
      const request = () => fetchDeadline(url, {
        headers: { ...h, Range: `${from}-${limit}` },
        cache: "no-store",
      }, remainingMs(deadlineAt));
      let response = await beforeDeadline(request, deadlineAt);

      // A pre-migration database may lack secondary_categories. Only that
      // precise first-page SQL error permits a primary-category retry; mixing
      // query meanings after paging starts could silently drop candidates.
      if (!response?.ok && from === 0 && url === withSecondary
          && await isMissingSecondaryColumn(response, deadlineAt)) {
        url = plain;
        response = await beforeDeadline(request, deadlineAt);
      }
      if (!response?.ok) return { rows: [], complete: false };

      const page = await beforeDeadline(() => response.json(), deadlineAt);
      if (!Array.isArray(page)) return { rows: [], complete: false };
      const range = contentRange(response);
      const pageCountMode = range?.total == null ? "none" : "exact";
      if (countMode == null) countMode = pageCountMode;
      if (pageCountMode !== countMode) return { rows: [], complete: false };
      if (pageCountMode === "exact") {
        if (exactTotal == null) exactTotal = range.total;
        if (range.total !== exactTotal) return { rows: [], complete: false };
      }

      if (page.length) {
        if (range && (range.start !== from || range.end !== from + page.length - 1)) {
          return { rows: [], complete: false };
        }
        if (!rowsAreUnique(page, seen)) return { rows: [], complete: false };
        rows.push(...page);
      } else {
        if (range && (range.start !== null || range.end !== null)) return { rows: [], complete: false };
        if (exactTotal != null && exactTotal !== from) return { rows: [], complete: false };
        return { rows, complete: true };
      }

      if (rows.length > limit) return { rows: [], complete: false };
      if (exactTotal != null) {
        if (exactTotal > limit || rows.length > exactTotal) return { rows: [], complete: false };
        if (rows.length === exactTotal) return { rows, complete: true };
      }
    }
  } catch {
    return { rows: [], complete: false };
  }
  return { rows: [], complete: false };
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
        const deadlineAt = Date.now() + PRIME_DEADLINE_MS;
        const answer = await beforeDeadline(
          () => (deps.readUnion || fetchUnionBox)(s, physical, cluster.box, limit, PRIME_DEADLINE_MS, deadlineAt),
          deadlineAt,
        );
        if (!answer || answer.complete !== true || !Array.isArray(answer.rows)
            || !answer.rows.length || !rowsAreUnique(answer.rows)) return;
        const filtered = await beforeDeadline(() => applySubFilter(answer.rows, physical, sub), deadlineAt);
        const entries = [];
        for (const city of cluster.cities) {
          for (const radiusM of [TIGHT_RADIUS_M, WIDE_RADIUS_M]) {
            const result = rankInventory(filtered, city.lat, city.lng, radiusM, N);
            const key = `srv:${physical}:${Number(city.lat).toFixed(4)}:${Number(city.lng).toFixed(4)}:${radiusM}:${N}:${sub}:0:1`;
            entries.push([key, result]);
          }
        }
        remainingMs(deadlineAt);
        for (const [key, result] of entries) readCache.get(key, () => result);
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
