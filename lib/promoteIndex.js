// lib/promoteIndex.js — PURE, testable core of the index→library promoter.
//
// STRATEGY ("own the candidate set", v6.04–v6.16): every place the app has ever
// surfaced is logged in wf_place_ids (the discovery INDEX). This module decides
// which of those places are not yet cards in wf_inventory (the owned LIBRARY),
// so the orchestrator (scripts/promote-index.mjs) can enrich + promote them —
// making category serving quota-independent (the v6.34 outage-fallback pulls
// from here). Same split as the seeder: NO network / clock / filesystem here;
// every rule is unit-tested (scripts/test-promote-index.mjs) rather than trusted.
//
// The orchestrator reuses the SEEDER'S classification core so a promoted card is
// byte-identical to a seeded one — one taxonomy, one row shape, one review-queue
// rule. This file adds only what promotion needs on top: geographic bucketing of
// the index, the missing-set (idempotency) computation, cost planning against a
// hard spend cap, and a STRICT production-write validator.
import { buildInventoryRow, reconcile, computeDiff, categoryCounts } from "./seedPlaces.js";
export { buildInventoryRow, reconcile, computeDiff, categoryCounts };

// The only categories the read path knows (lib/inventoryServe CATS). A row whose
// category is anything else must never be written.
export const KNOWN_CATEGORIES = ["food", "nightlife", "attractions", "beach", "hotels", "shopping"];

// Promotion metro bounding boxes. DELIBERATELY separate from seedPlaces
// METRO_BOUNDS: promotion buckets the EXISTING index geographically and must not
// change the seeder's grid metros. Boxes cover the metro core + near suburbs;
// they may overlap (Tampa/St. Pete) — bucketMetro breaks ties by nearest center.
export const PROMOTE_METROS = {
  "manatee-sarasota": { minLat: 27.02, maxLat: 27.62, minLng: -82.72, maxLng: -82.15 },
  "tampa":            { minLat: 27.60, maxLat: 28.17, minLng: -82.75, maxLng: -82.20 },
  "st-pete":          { minLat: 27.66, maxLat: 27.98, minLng: -82.79, maxLng: -82.55 },
  "orlando":          { minLat: 28.30, maxLat: 28.75, minLng: -81.65, maxLng: -81.10 },
};

// The exact column set written to wf_inventory (mirrors scripts/seed-places
// upsert()). The single source of truth for BOTH the projection (toWriteRow) and
// the validator, so what we validate is exactly what we write — no drift.
export const WRITE_COLUMNS = [
  "place_id", "name", "lat", "lng", "category", "tags", "google_types", "primary_type",
  "metro", "signals", "editorial", "photo_ref", "status", "anchor", "source",
  "needs_review", "last_verified_at", "refreshed_at",
];

export function isFiniteNum(n) { return typeof n === "number" && isFinite(n); }

export function inBounds(lat, lng, b) {
  return isFiniteNum(lat) && isFiniteNum(lng) && lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

// Nearest metro whose box CONTAINS the point (boxes can overlap → pick the box
// whose center is closest). Returns the metro key, or null if no box contains it.
export function bucketMetro(lat, lng, metros = PROMOTE_METROS) {
  if (!isFiniteNum(lat) || !isFiniteNum(lng)) return null;
  let best = null, bestD = Infinity;
  for (const [key, b] of Object.entries(metros)) {
    if (!inBounds(lat, lng, b)) continue;
    const cLat = (b.minLat + b.maxLat) / 2, cLng = (b.minLng + b.maxLng) / 2;
    const d = (lat - cLat) * (lat - cLat) + (lng - cLng) * (lng - cLng);
    if (d < bestD) { bestD = d; best = key; }
  }
  return best;
}

// computeMissing — the PROMOTABLE set: index rows inside `metroKey`'s box that
// are NOT already inventory cards, de-duplicated by place_id, with a usable
// coordinate. This is the idempotency core: after a promotion the ids are in
// `existingIds`, so a rerun with the refreshed inventory yields fewer/zero. Never
// mutates its inputs. Returns { missing[], skipped:{...counts} }.
export function computeMissing(indexRows, existingIds, metroKey, metros = PROMOTE_METROS) {
  const b = metros[metroKey];
  if (!b) throw new Error("unknown promote metro: " + metroKey + " (known: " + Object.keys(metros).join(", ") + ")");
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const seen = new Set();
  const missing = [];
  const skipped = { existing: 0, outOfBox: 0, unlocatable: 0, dupe: 0, noId: 0 };
  for (const r of indexRows || []) {
    const id = r && r.place_id;
    if (!id || typeof id !== "string") { skipped.noId++; continue; }
    if (seen.has(id)) { skipped.dupe++; continue; }
    seen.add(id);
    if (existing.has(id)) { skipped.existing++; continue; }
    const lat = r.lat, lng = r.lng;
    if (!isFiniteNum(lat) || !isFiniteNum(lng)) { skipped.unlocatable++; continue; }
    if (!inBounds(lat, lng, b)) { skipped.outOfBox++; continue; }
    missing.push({ place_id: id, name: r.name != null ? String(r.name) : null, lat, lng });
  }
  return { missing, skipped };
}

// planEnrichment — cost + volume plan BEFORE any paid call. Enrichment is capped
// by BOTH a record limit and a hard USD spend cap; willEnrich is the largest
// count that satisfies every cap, and estimateUSD for that subset can NEVER
// exceed maxSpendUSD. Pure arithmetic — the orchestrator prints this and refuses
// to enrich more than willEnrich.
export function planEnrichment(missingCount, opts = {}) {
  const perRec = Number(opts.costPerRecord) > 0 ? Number(opts.costPerRecord) : 0.017; // Place Details (New) ~$17/1k
  const recordLimit = Math.max(0, Math.floor(Number(opts.recordLimit) >= 0 ? Number(opts.recordLimit) : 500));
  const spendCap = Math.max(0, Number(opts.maxSpendUSD) >= 0 ? Number(opts.maxSpendUSD) : 25);
  const n = Math.max(0, Math.floor(missingCount) || 0);
  const affordable = perRec > 0 ? Math.floor(spendCap / perRec) : n;
  const willEnrich = Math.max(0, Math.min(n, recordLimit, affordable));
  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    missingCount: n,
    willEnrich,
    costPerRecord: perRec,
    estimateUSD: round2(willEnrich * perRec),      // cost of THIS run — always ≤ spendCap
    fullEstimateUSD: round2(n * perRec),           // cost to promote the whole backlog
    spendCapUSD: spendCap,
    recordLimit,
    affordable,
    cappedByLimit: willEnrich < n && recordLimit <= affordable,
    cappedBySpend: willEnrich < n && affordable < recordLimit,
  };
}

// toWriteRow — project a built inventory row onto EXACTLY the wf_inventory write
// columns (mirrors scripts/seed-places upsert cols()), stamping refreshed_at.
// What the validator checks and what the upsert sends are this same object.
export function toWriteRow(r, nowIso) {
  return {
    place_id: r.place_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    category: r.category,
    tags: Array.isArray(r.tags) ? r.tags : [],
    google_types: Array.isArray(r.google_types) ? r.google_types : [],
    primary_type: r.primary_type != null ? r.primary_type : null,
    metro: r.metro,
    signals: r.signals != null ? r.signals : null,
    editorial: r.editorial != null ? r.editorial : null,
    photo_ref: r.photo_ref != null ? r.photo_ref : null,
    status: r.status != null ? r.status : null,
    anchor: !!r.anchor,
    source: r.source || "promote_index",
    needs_review: !!r.needs_review,
    last_verified_at: r.last_verified_at != null ? r.last_verified_at : null,
    refreshed_at: nowIso,
  };
}

// validateInventoryRow — STRICT gate for the production write path. EVERY field
// that would land in wf_inventory is checked; any failure REJECTS the row (it is
// never written) with a full list of reasons the orchestrator prints. Stricter
// than reconcile (which only needs a classification): here a wrong bound, a
// closed listing, an unknown category, a stray column, or a malformed signals
// blob is a hard reject. Takes the PROJECTED write-row (from toWriteRow).
export function validateInventoryRow(w, { metroKey, metros = PROMOTE_METROS } = {}) {
  const errors = [];
  if (!w || typeof w !== "object") return { ok: false, errors: ["not an object"] };

  // No stray columns — guards against schema drift silently writing junk.
  for (const k of Object.keys(w)) if (!WRITE_COLUMNS.includes(k)) errors.push("unknown column: " + k);

  if (typeof w.place_id !== "string" || !w.place_id.trim()) errors.push("place_id missing/blank");
  if (typeof w.name !== "string" || !w.name.trim()) errors.push("name missing/blank");

  if (!isFiniteNum(w.lat) || !isFiniteNum(w.lng)) errors.push("lat/lng not finite");
  else if (metroKey) {
    const b = metros[metroKey];
    if (!b) errors.push("unknown metro: " + metroKey);
    else if (!inBounds(w.lat, w.lng, b)) errors.push(`coords out of ${metroKey} bounds (${w.lat},${w.lng}) — wrong/moved place id`);
    if (b && w.metro !== metroKey) errors.push(`metro "${w.metro}" != run metro "${metroKey}"`);
  }

  if (!KNOWN_CATEGORIES.includes(w.category)) errors.push("category not known: " + w.category);

  // Never write a non-operational place. null (unknown) is allowed; anything
  // present and not OPERATIONAL is a reject (a fresh enrichment said it is closed).
  if (w.status != null && w.status !== "OPERATIONAL") errors.push("non-operational status: " + w.status);

  if (!Array.isArray(w.tags)) errors.push("tags not an array");
  if (!Array.isArray(w.google_types)) errors.push("google_types not an array");

  if (w.signals != null) {
    if (typeof w.signals !== "object") errors.push("signals not an object");
    else {
      const { rating, reviews } = w.signals;
      if (!(rating == null || isFiniteNum(rating))) errors.push("signals.rating not null/number");
      if (!(reviews == null || (isFiniteNum(reviews) && reviews >= 0))) errors.push("signals.reviews not a non-negative number");
    }
  }

  if (typeof w.anchor !== "boolean") errors.push("anchor not boolean");
  if (typeof w.needs_review !== "boolean") errors.push("needs_review not boolean");
  if (typeof w.refreshed_at !== "string" || !w.refreshed_at) errors.push("refreshed_at missing");

  return { ok: errors.length === 0, errors };
}

// dedupeById — a single upsert batch must never carry two rows with the same
// place_id (keeps the first; reports the count dropped). Belt-and-braces on top
// of the DB primary key so the payload itself can't create a conflict.
export function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const r of rows || []) {
    if (!r || typeof r.place_id !== "string") { dropped++; continue; }
    if (seen.has(r.place_id)) { dropped++; continue; }
    seen.add(r.place_id);
    out.push(r);
  }
  return { rows: out, dropped };
}

// auditEntry — shape one append-only audit-log record. Pure: the caller stamps
// nowIso and writes it. NEVER carries secrets (only the Supabase host, never the
// key), so the audit trail is safe to keep in the repo working tree.
export function auditEntry({ mode, metroKey, args, host, counts, costPlan, sampleIds, nowIso }) {
  return {
    ts: nowIso,
    mode,
    metro: metroKey,
    host: host || null,
    args: args || null,
    counts: counts || null,
    costPlan: costPlan || null,
    sampleIds: Array.isArray(sampleIds) ? sampleIds.slice(0, 25) : [],
  };
}
