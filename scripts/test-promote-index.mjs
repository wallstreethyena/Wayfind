// scripts/test-promote-index.mjs — local, offline tests for the index→library
// promoter. NO network: the enrich→validate chain runs real buildInventoryRow/
// classify over FAKE Google Place Details resources. Also a source-level guard
// suite over the orchestrator so its safety invariants can't silently regress.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  PROMOTE_METROS, bucketMetro, inBounds, computeMissing, planEnrichment,
  buildInventoryRow, reconcile, toWriteRow, validateInventoryRow, dedupeById, KNOWN_CATEGORIES,
} from "../lib/promoteIndex.js";

let pass = 0;
const fail = (m) => { console.error("test-promote-index: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (g, w, m) => { if (g !== w) fail(`${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); pass++; };
const NOW = "2026-07-15T18:00:00.000Z";

// ── 1. bucketMetro / inBounds ────────────────────────────────────────────────
eq(bucketMetro(28.538, -81.379), "orlando", "downtown Orlando → orlando");
eq(bucketMetro(27.336, -82.531), "manatee-sarasota", "Sarasota → manatee-sarasota");
eq(bucketMetro(27.947, -82.459), "tampa", "Tampa → tampa");
eq(bucketMetro(25.761, -80.191), null, "Miami → null (no box)");
eq(bucketMetro(null, -81), null, "null lat → null");
ok(inBounds(28.5, -81.4, PROMOTE_METROS.orlando), "inBounds true for Orlando point");
ok(!inBounds(28.5, -81.4, PROMOTE_METROS.tampa), "inBounds false for wrong box");

// ── 2. computeMissing + idempotency ──────────────────────────────────────────
const index = [
  { place_id: "A", name: "Orlando A", lat: 28.54, lng: -81.38 },
  { place_id: "B", name: "Orlando B", lat: 28.55, lng: -81.30 },
  { place_id: "B", name: "dup id", lat: 28.55, lng: -81.30 },      // duplicate id
  { place_id: "C", name: "Sarasota C", lat: 27.34, lng: -82.53 },  // out of orlando box
  { place_id: "D", name: "No coords", lat: null, lng: null },       // unlocatable
  { place_id: "E", name: "Already", lat: 28.53, lng: -81.37 },      // already in library
  { name: "no id", lat: 28.5, lng: -81.4 },                         // no id
];
const r1 = computeMissing(index, new Set(["E"]), "orlando");
eq(r1.missing.length, 2, "missing = A,B (C out-of-box, D unlocatable, E existing, dup+noid skipped)");
eq(r1.missing.map((m) => m.place_id).sort().join(","), "A,B", "missing ids are A,B");
eq(r1.skipped.existing, 1, "1 existing skipped");
eq(r1.skipped.outOfBox, 1, "1 out of box");
eq(r1.skipped.unlocatable, 1, "1 unlocatable");
eq(r1.skipped.dupe, 1, "1 duplicate id");
eq(r1.skipped.noId, 1, "1 no-id");
// idempotency: after promoting A,B they're in the library → rerun yields nothing
const r2 = computeMissing(index, new Set(["E", "A", "B"]), "orlando");
eq(r2.missing.length, 0, "idempotent: rerun after add promotes nothing");
let threw = false; try { computeMissing(index, new Set(), "nowhere"); } catch { threw = true; }
ok(threw, "unknown metro throws");

// ── 3. planEnrichment — caps never exceeded ──────────────────────────────────
const p1 = planEnrichment(846, { costPerRecord: 0.017, maxSpendUSD: 25, recordLimit: 500 });
eq(p1.willEnrich, 500, "846 capped to --limit 500");
eq(p1.estimateUSD, 8.5, "500 × 0.017 = $8.50");
eq(p1.fullEstimateUSD, 14.38, "backlog 846 × 0.017 = $14.38");
ok(p1.cappedByLimit && !p1.cappedBySpend, "capped by limit, not spend");
const p2 = planEnrichment(846, { costPerRecord: 0.017, maxSpendUSD: 10, recordLimit: 5000 });
eq(p2.willEnrich, 588, "spend cap $10 → floor(10/0.017)=588");
ok(p2.estimateUSD <= 10, "estimate never exceeds the $10 spend cap");
ok(p2.cappedBySpend && !p2.cappedByLimit, "capped by spend, not limit");
const p3 = planEnrichment(10, { costPerRecord: 0.017, maxSpendUSD: 25, recordLimit: 500 });
eq(p3.willEnrich, 10, "small backlog enriches fully");
ok(!p3.cappedByLimit && !p3.cappedBySpend, "no cap when backlog fits");
eq(planEnrichment(100, { maxSpendUSD: 0 }).willEnrich, 0, "zero spend cap → enrich nothing");

// ── 4. enrich→build→validate over FAKE Google resources (no network) ─────────
const gPlace = (over = {}) => ({
  id: "ChIJorl_museum", displayName: { text: "Orlando Museum of Art" },
  location: { latitude: 28.573, longitude: -81.369 },
  types: ["museum", "tourist_attraction", "point_of_interest"], primaryType: "museum",
  rating: 4.6, userRatingCount: 1200, priceLevel: "PRICE_LEVEL_MODERATE",
  businessStatus: "OPERATIONAL", editorialSummary: { text: "Art museum." },
  photos: [{ name: "places/ChIJorl_museum/photos/abc" }], ...over,
});
{
  const b = buildInventoryRow(gPlace(), "orlando", { nowIso: NOW });
  ok(b.row, "museum builds a row");
  eq(b.row.category, "attractions", "museum → attractions");
  const w = toWriteRow(b.row, NOW);
  const v = validateInventoryRow(w, { metroKey: "orlando" });
  ok(v.ok, "valid museum row passes validation: " + v.errors.join(","));
  eq(w.metro, "orlando", "metro stamped");
  eq(w.refreshed_at, NOW, "refreshed_at stamped");
  eq(w.source, "google_type", "source carried from build");
}
{ // closed place → rejected on status
  const b = buildInventoryRow(gPlace({ businessStatus: "CLOSED_PERMANENTLY" }), "orlando", { nowIso: NOW });
  const v = validateInventoryRow(toWriteRow(b.row, NOW), { metroKey: "orlando" });
  ok(!v.ok && v.errors.some((e) => /non-operational/.test(e)), "closed place rejected");
}
{ // coords outside the run metro → rejected on bounds
  const b = buildInventoryRow(gPlace({ location: { latitude: 27.34, longitude: -82.53 } }), "orlando", { nowIso: NOW });
  const v = validateInventoryRow(toWriteRow(b.row, NOW), { metroKey: "orlando" });
  ok(!v.ok && v.errors.some((e) => /out of orlando bounds/.test(e)), "out-of-bounds coords rejected");
}
{ // missing name → build refuses (no row), never reaches the DB
  const b = buildInventoryRow(gPlace({ displayName: null }), "orlando", { nowIso: NOW });
  ok(!b.row, "nameless place yields no row");
}
{ // unknown category → rejected
  const w = toWriteRow({ place_id: "X", name: "Lot", lat: 28.5, lng: -81.4, category: "parking", tags: [], google_types: [], metro: "orlando", signals: null, anchor: false, needs_review: false }, NOW);
  const v = validateInventoryRow(w, { metroKey: "orlando" });
  ok(!v.ok && v.errors.some((e) => /category not known/.test(e)), "unknown category rejected");
}
{ // stray column → rejected (schema-drift guard)
  const w = toWriteRow({ place_id: "X", name: "Y", lat: 28.5, lng: -81.4, category: "food", tags: [], google_types: [], metro: "orlando", signals: null, anchor: false, needs_review: false }, NOW);
  w.evil = 1;
  const v = validateInventoryRow(w, { metroKey: "orlando" });
  ok(!v.ok && v.errors.some((e) => /unknown column: evil/.test(e)), "stray column rejected");
}
{ // null status + null signals are allowed (unknown, not a lie)
  const w = toWriteRow({ place_id: "X", name: "Y", lat: 28.5, lng: -81.4, category: "food", tags: [], google_types: [], metro: "orlando", signals: null, status: null, anchor: false, needs_review: false }, NOW);
  ok(validateInventoryRow(w, { metroKey: "orlando" }).ok, "null status/signals allowed");
}

// ── 5. dedupeById ────────────────────────────────────────────────────────────
{
  const d = dedupeById([{ place_id: "A" }, { place_id: "A" }, { place_id: "B" }, { name: "no id" }]);
  eq(d.rows.length, 2, "dedupe keeps A,B");
  eq(d.dropped, 2, "dropped 1 dup + 1 no-id");
}
ok(KNOWN_CATEGORIES.length === 6, "six known categories");

// ── 6. GUARD — orchestrator safety invariants (source-level) ─────────────────
const orch = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "promote-index.mjs"), "utf8");
ok(/--apply/.test(orch), "orchestrator has an explicit --apply flag");
ok(/resolution=merge-duplicates/.test(orch), "writes are idempotent upserts (merge-duplicates)");
ok(/PROMOTE \$\{args\.metro\} \$\{deduped\.rows\.length\}/.test(orch), "apply requires a typed confirmation phrase");
ok(/if \(!args\.enrich\)/.test(orch) && /PLAN ONLY/.test(orch), "default mode is PLAN — no paid calls, no writes");
ok(!/method:\s*["']DELETE["']/.test(orch), "orchestrator performs NO DELETE (upsert-only)");
ok(/Backup written/.test(orch) && /ROLLBACK/.test(orch), "apply writes a backup and prints rollback");
ok(/validateInventoryRow/.test(orch), "every row is validated before write");

console.log(`test-promote-index: OK — ${pass} assertions (bucketing, missing-set idempotency, cost caps, enrich→validate chain, dedupe, orchestrator guards)`);
