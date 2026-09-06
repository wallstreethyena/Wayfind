#!/usr/bin/env node
/**
 * audit-starvation-measure — ONE surface, ONE point, BOTH retrievals, and the
 * SAME admission at the end of each.
 *
 * This is the Node half of scripts/audit_candidate_starvation.py. Python
 * orchestrates it; this file is where Wayfind's taxonomy lives, because it
 * imports the shipped predicates instead of describing them.
 *
 * THE MEASUREMENT FLAW THIS FILE IS SHAPED TO AVOID. The first Night Out funnel
 * compared "the route's pool" against "all admissible rows", and the two sides
 * did not mean the same thing: the route side came through rankInventory(),
 * whose gate is radius x 1.15 and which also refuses closed/excluded/unrated
 * rows, while the other side applied an exact cut and none of those filters. It
 * produced a NEGATIVE loss (203 route vs 202 admissible), which is impossible
 * when one set contains the other, and that impossibility was the only tell.
 *
 * The correction is structural rather than careful: BOTH columns end in
 * admitOwnedRows() with the SAME identity function, so a mismatch is not
 * something you can write by accident.
 *
 *   OLD  serveFromInventory(top-N of the surface's broad categories) -> admit
 *   NEW  fetchOwnedPool(deterministic, exhaustive, identity-first)   -> admit
 *
 * Read-only. No provider calls. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/audit-starvation-measure.mjs --surface=lunch-break --lat=27.5949 --lng=-82.4265
 */
import { SURFACE_BY_ID, SURFACES } from "./lib/starvationSurfaces.mjs";
import { serveFromInventory } from "../lib/inventoryServe.js";
import { admitOwnedRows, fetchOwnedPool } from "../lib/ownedPool.js";
import { sbEnv } from "../lib/serverCache.js";

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const surfaceId = arg("surface", "");
const LAT = Number(arg("lat", "27.5949"));
const LNG = Number(arg("lng", "-82.4265"));
const asJson = process.argv.includes("--json");

if (!SURFACE_BY_ID[surfaceId]) {
  console.error(`audit-starvation-measure: unknown surface "${surfaceId}". Known: ${SURFACES.map((s) => s.id).join(", ")}`);
  process.exit(2);
}
if (!sbEnv()) {
  console.error("audit-starvation-measure: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — this reads owned inventory and cannot run without them.");
  process.exit(3);
}

const surface = SURFACE_BY_ID[surfaceId];
const origin = { lat: LAT, lng: LNG };

// serveFromInventory returns rows already mapped into the Google-ish shape
// (invRowToPlace). admitOwnedRows expects RAW wf_inventory rows, so map back —
// field for field, no interpretation. This seam is where the first funnel went
// wrong; keeping it a dumb rename is the point.
const toRawRow = (p) => ({
  place_id: p.id,
  name: p?.displayName?.text || p.name,
  lat: p?.location?.latitude ?? p.lat,
  lng: p?.location?.longitude ?? p.lng,
  category: p.category || null,
  primary_type: p.primaryType || p.primary_type || null,
  google_types: Array.isArray(p.types) ? p.types : [],
  cuisines: Array.isArray(p.cuisines) ? p.cuisines : [],
  status: p.businessStatus || "OPERATIONAL",
  excluded: p.excluded,
  editorial: p?.editorialSummary?.text || p.editorial || null,
  photo_ref: p.photo_ref || null,
  signals: { rating: typeof p.rating === "number" ? p.rating : null, reviews: Number(p.userRatingCount || p.reviews || 0) },
});

// ── OLD: the shipped retrieval, exactly as the route issues it ──────────────
const radiusM = surface.radiusMi * 1609.34;
const reads = [];
for (const cat of surface.categories) {
  const subs = (surface.oldSubs && surface.oldSubs[cat]) || [undefined];
  for (const sub of subs) reads.push({ cat, sub });
}
const oldSettled = await Promise.all(reads.map((r) =>
  serveFromInventory(r.cat, LAT, LNG, radiusM, surface.oldN, r.sub, { failLoud: false, primaryOnly: false })
    .then((rows) => ({ ...r, rows }))
    .catch(() => ({ ...r, rows: [], failed: true }))));

const oldRaw = oldSettled.flatMap((r) => r.rows.map(toRawRow));
const oldAdmit = admitOwnedRows(oldRaw, origin, { maxMi: surface.radiusMi, identity: surface.claims });

// ── NEW: identity-first, deterministic, exhaustive ─────────────────────────
//
// A category the registry declares broad BY DESIGN is read the OLD way in BOTH
// columns, so the delta below is exactly what the SHIPPED code recovers rather
// than a ceiling nobody built. Today, for instance, reads attractions and beach
// identity-first and deliberately leaves food/nightlife/hotels/shopping on the
// shared reader (isBestFood is a score floor, which a top-N-by-score read serves
// rather than starves). Measuring all six as if they were identity-first would
// report a recovery the product does not actually make.
const byDesign = surface.broadByDesign || {};
const identityFirstCats = surface.categories.filter((c) => !byDesign[c]);
const stillBroadCats = surface.categories.filter((c) => byDesign[c]);

const pool = await fetchOwnedPool(LAT, LNG, {
  categories: identityFirstCats,
  radiusMi: surface.radiusMi,
  identity: surface.claims,
});
let nextPlaces = pool.places;
let nextStats = pool.stats;
if (stillBroadCats.length) {
  const extra = await Promise.all(stillBroadCats.map((cat) =>
    serveFromInventory(cat, LAT, LNG, radiusM, surface.oldN, undefined, { failLoud: false, primaryOnly: false })
      .catch(() => [])));
  const admitted = admitOwnedRows(extra.flat().map(toRawRow), origin, { maxMi: surface.radiusMi, identity: surface.claims });
  const seen = new Set(nextPlaces.map((p) => p.id));
  nextPlaces = nextPlaces.concat(admitted.places.filter((p) => !seen.has(p.id)));
  nextStats = {
    ...nextStats,
    rows: nextStats.rows + admitted.stats.rows,
    servable: nextStats.servable + admitted.stats.servable,
    withinRadius: nextStats.withinRadius + admitted.stats.withinRadius,
    qualified: nextPlaces.length,
    broadByDesign: stillBroadCats,
  };
}
const next = { places: nextPlaces, stats: nextStats };

const oldBuckets = surface.bucket(oldAdmit.places, origin);
const newBuckets = surface.bucket(next.places, origin);

const railRows = surface.rails.map((id) => ({
  id,
  title: (surface.railTitles && surface.railTitles[id]) || id,
  old: oldBuckets[id] || 0,
  next: newBuckets[id] || 0,
}));

const report = {
  surface: surface.id,
  title: surface.title,
  route: surface.route,
  declaredStatus: surface.status,
  lat: LAT, lng: LNG,
  radiusMi: surface.radiusMi,
  categories: surface.categories,
  overlappingRails: !!surface.overlappingRails,
  old: {
    reads: oldSettled.map((r) => ({ cat: r.cat, sub: r.sub || null, rows: r.rows.length, failed: !!r.failed })),
    reachedClassifier: oldRaw.length,
    qualified: oldAdmit.stats.qualified,
    byRail: oldBuckets,
  },
  next: {
    rowsRead: next.stats.perCategory,
    rows: next.stats.rows,
    servable: next.stats.servable,
    withinRadius: next.stats.withinRadius,
    qualified: next.stats.qualified,
    truncated: next.stats.truncated,
    sourceFailures: next.stats.sourceFailures,
    broadByDesign: next.stats.broadByDesign || [],
    byRail: newBuckets,
  },
  recovered: railRows.reduce((n, r) => n + Math.max(0, r.next - r.old), 0),
  // A fix that thins a rail is not a fix. Named, not summarised.
  railsThatLost: railRows.filter((r) => r.next < r.old).map((r) => ({ id: r.id, old: r.old, next: r.next })),
  // Still zero WITH the complete owned pool is NOT candidate starvation. It is
  // genuine scarcity, evidence starvation or taxonomy starvation, and no amount
  // of retrieval will move it — naming them keeps the next investigation honest.
  stillZero: railRows.filter((r) => r.next === 0).map((r) => r.id),
  genuinelyOne: railRows.filter((r) => r.next === 1).map((r) => r.id),
  rails: railRows,
};

if (asJson) {
  console.log(JSON.stringify(report));
} else {
  const pad = (s, w) => String(s).padEnd(w);
  console.log(`\n${surface.title} — ${LAT}, ${LNG} — exactly <= ${surface.radiusMi}mi — both columns share ONE admission\n`);
  console.log(`OLD  rows the shipped read returned : ${report.old.reachedClassifier}   (${report.old.reads.map((r) => `${r.cat}${r.sub ? ":" + r.sub : ""} ${r.rows}`).join(", ")})`);
  console.log(`OLD  qualifying after admission     : ${report.old.qualified}`);
  console.log("");
  console.log(`NEW  owned rows read in the box     : ${report.next.rows}   (${Object.entries(report.next.rowsRead).map(([k, v]) => k + " " + v).join(", ")})${report.next.truncated ? "  [TRUNCATED]" : ""}`);
  console.log(`NEW  servable / within radius       : ${report.next.servable} / ${report.next.withinRadius}`);
  console.log(`NEW  qualifying                     : ${report.next.qualified}`);
  console.log("");
  console.log(pad("rail", 34) + pad("OLD", 7) + pad("NEW", 7) + "gained");
  console.log("-".repeat(58));
  for (const r of railRows) console.log(pad(String(r.title).slice(0, 32), 34) + pad(r.old, 7) + pad(r.next, 7) + (r.next - r.old > 0 ? "+" + (r.next - r.old) : r.next - r.old));
  console.log("-".repeat(58));
  console.log(`\nQualifying candidates recovered: ${report.recovered}`);
  if (report.railsThatLost.length) console.log(`!! RAILS THAT LOST: ${report.railsThatLost.map((r) => `${r.id} ${r.old}->${r.next}`).join(", ")}`);
  if (report.stillZero.length) console.log(`Still zero with the FULL owned pool (A/C/D, never B): ${report.stillZero.join(", ")}`);
  if (report.genuinelyOne.length) console.log(`Genuinely one verified option: ${report.genuinelyOne.join(", ")}`);
  console.log("");
}
