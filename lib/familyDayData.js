// Server-only, owned inventory. Category pools are shared by the ten lazy rails;
// a failed read is an error, never an empty family recommendation.
import { sbEnv } from "./serverCache.js";
import { boxForRadius, invRowToPlace, distMeters, LEAN_INVENTORY_FIELDS } from "./inventoryServe.js";
import { readOwnedCategory, OWNED_POOL_MAX_ROWS } from "./ownedPool.js";
import { isOperational } from "./businessStatus.js";
import { toDateNightPlace } from "./dateNightIntent.js";
import { lawfulComparator } from "./lawfulOrder.js";
import { pageOf } from "./railPage.js";
import { FAMILY_DAY_RAILS, canonicalFamilyRailId, familyRailMatches, familyWeatherSafe, matchesFamilyFilters } from "./familyDayTaxonomy.js";
import { FAMILY_DAY_EVIDENCE } from "./familyDayEvidence.js";
import { isFloridaInventory } from "./socialIdentity.js";

const pools = new Map();
// Stay below PostgREST's row ceiling, like fetchCuratedEvents does. A bounded
// scan that hits its cap reports truncated instead of claiming full coverage.
const PAGE_SIZE = 500;
const POOL_TTL_MS = 60000;

export function validFamilyOrigin(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && isFloridaInventory({ lat, lng });
}

export function composeFamilyRail(rawRows, { lat, lng, radiusMi, rail, filters = {}, indoorOnly = false }) {
  const seen = new Set();
  const places = [];
  for (const raw of rawRows) {
    if (!raw || raw.excluded || !isOperational(raw.status)) continue;
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng) || !validFamilyOrigin(raw.lat, raw.lng)) continue;
    if (distMeters(lat, lng, raw.lat, raw.lng) > radiusMi * 1609.34) continue;
    // Categorize BEFORE any popularity cap; a small museum must not compete
    // with all restaurants just to reach the museum classifier.
    const familyEvidence = FAMILY_DAY_EVIDENCE[raw.place_id] || null;
    if (!familyRailMatches({ ...raw, familyEvidence }, rail)) continue;
    if (indoorOnly && !familyWeatherSafe(raw)) continue;
    const row = toDateNightPlace(invRowToPlace(raw), { lat, lng });
    if (!row || row.rating < 4.5 || row.reviews < 500 || seen.has(row.id)) continue;
    // The shared date mapper defaults a missing price to zero. Family cards
    // must not turn missing admission data into a visible "Free" claim.
    if (!Number.isInteger(raw.signals?.priceNum) || raw.signals.priceNum < 0 || raw.signals.priceNum > 4) {
      row.priceNum = null;
      row.priceLevel = null;
    }
    row.familyEvidence = familyEvidence;
    if (!matchesFamilyFilters(row, filters)) continue;
    seen.add(row.id);
    places.push(row);
  }
  return places.sort(lawfulComparator((p) => -(p.distMi || 0)));
}

export function pageFamilyRail(rows, { page, size } = {}) {
  return pageOf(rows, { page, size });
}

async function readCategory(cat, lat, lng, radiusMi) {
  const key = `${cat}:${lat}:${lng}:${radiusMi}`;
  const now = Date.now();
  const hit = pools.get(key);
  if (hit && hit.expires > now) return hit.promise;
  for (const [k, v] of pools) if (v.expires <= now) pools.delete(k);
  if (pools.size >= 64) pools.delete(pools.keys().next().value);
  const entry = { expires: now + POOL_TTL_MS, promise: null };
  entry.promise = (async () => {
    const env = sbEnv();
    if (!env) throw new Error("Family inventory is not configured");
    const box = boxForRadius(lat, lng, radiusMi * 1609.34);
    return readOwnedCategory(env, cat, box, {
      fields: LEAN_INVENTORY_FIELDS,
      pageSize: PAGE_SIZE,
      maxRows: OWNED_POOL_MAX_ROWS,
      deadlineMs: 4000,
      deadlineAt: Date.now() + 7000,
    });
  })().catch((error) => { if (pools.get(key) === entry) pools.delete(key); throw error; });
  pools.set(key, entry);
  return entry.promise;
}

export async function familyDayAnswer(options) {
  const rail = canonicalFamilyRailId(options.rail);
  const def = FAMILY_DAY_RAILS.find((r) => r.id === rail);
  if (!def) throw new Error("Unknown family rail");
  const results = await Promise.all(def.cats.map((cat) => readCategory(cat, options.lat, options.lng, options.radiusMi)));
  const canonicalOptions = { ...options, rail };
  const matched = composeFamilyRail(results.flatMap((p) => p.rows), canonicalOptions);
  const paged = pageFamilyRail(matched, options);
  return { ...paged, matched: matched.length, rail, radiusMi: options.radiusMi,
    truncated: results.some((p) => p.truncated), more: paged.hasMore };
}
