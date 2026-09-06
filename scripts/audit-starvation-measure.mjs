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
 *   OLD  the shipped CUT (the unordered database window, the chip contract where
 *        the route carried one, then rankInventory's top-N) -> admit
 *   NEW  every owned row that was read, identity-first          -> admit
 *
 * Read-only. No provider calls. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/audit-starvation-measure.mjs --surface=lunch-break --lat=27.5949 --lng=-82.4265
 */
import { SURFACE_BY_ID, SURFACES } from "./lib/starvationSurfaces.mjs";
import { rankInventory } from "../lib/inventoryServe.js";
import { admitOwnedRows, readOwnedCategory } from "../lib/ownedPool.js";
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
const radiusM = surface.radiusMi * 1609.34;

/**
 * BOTH COLUMNS READ THE SAME ROWS. Only the CUT differs.
 *
 * v3 of this diagnostic, and each version was corrected because the previous one
 * compared two different universes:
 *
 *   v1  the route side came through rankInventory (gate radius x 1.15, plus row
 *       filters) and the other side applied an exact cut with none of them, so a
 *       rail read 203 vs 202 — a NEGATIVE loss, impossible when one set contains
 *       the other, and the only tell that the comparison was wrong.
 *   v2  both sides ended in one admission, but the OLD side was reconstructed
 *       from serveFromInventory's OUTPUT, and invRowToPlace does not carry
 *       `category` and re-expresses priceNum as the PRICE_LEVEL_* enum. Rebuilding
 *       a raw row from it silently dropped both. isSpecialDateDinner reads
 *       priceNum >= 2, so the OLD column lost most of Date Night's dinner rail,
 *       dinner therefore consumed fewer places, and a Sarasota speakeasy dinner
 *       should have claimed appeared as "a rail that LOST a candidate". A
 *       product regression that was really a measurement artifact.
 *   v3  reads the complete owned rows ONCE and derives both columns from them.
 *       The OLD column is the shipped CUT applied to those same rows — the real
 *       rankInventory selecting real ids, and the same chipIdentity contract the
 *       route's `sub` reads carried. Nothing is re-mapped, so nothing can be
 *       lost in the mapping.
 *
 * What remains a MODEL rather than a measurement, stated so it is not read as
 * more than it is: the shipped `limit=1000` had no ORDER BY, so which thousand
 * arrived was Postgres heap order and is unknowable after the fact. It is
 * modelled here as the first 1,000 by place_id. Any deterministic stand-in is
 * arbitrary; what is NOT arbitrary is that a thousand of them arrived and the
 * rest did not.
 */
const { chipIdentity, CHIP_IDENTITY } = await import("../lib/chipIdentity.js");
const { SUB_ALLOW } = await import("../lib/placeFilter.js");

const OLD_DB_LIMIT = 1000;  // lib/inventoryServe.js — `&limit=1000`, no order=

const rawByCat = {};
const readStats = {};
{
  const { boxForRadius } = await import("../lib/inventoryServe.js");
  const box = boxForRadius(LAT, LNG, radiusM);
  const env = sbEnv();
  const settled = await Promise.allSettled(surface.categories.map((c) => readOwnedCategory(env, c, box, {})));
  settled.forEach((r, i) => {
    const cat = surface.categories[i];
    rawByCat[cat] = r.status === "fulfilled" ? r.value.rows : [];
    readStats[cat] = r.status === "fulfilled" ? r.value.rows.length : null;
  });
  if (Object.values(readStats).every((v) => v === null)) {
    console.error("audit-starvation-measure: every owned read failed");
    process.exit(5);
  }
}

// ── OLD: the shipped CUT, over those same rows ──────────────────────────────
const oldReads = [];
const oldIds = new Set();
for (const cat of surface.categories) {
  const subs = (surface.oldSubs && surface.oldSubs[cat]) || [undefined];
  for (const sub of subs) {
    let rows = rawByCat[cat] || [];
    // 1. the unordered database window (modelled — see the header)
    const truncated = rows.length > OLD_DB_LIMIT;
    rows = rows.slice(0, OLD_DB_LIMIT);
    // 2. the chip contract, when the route's read carried one (v8.49 applies it
    //    BEFORE the cap, so it is applied here in the same place). chipIdentity
    //    is IMPORTED and CALLED; this file holds no copy of a chip's rule.
    const subId = String(sub || "").toLowerCase();
    if (subId && (CHIP_IDENTITY[`${cat}:${subId}`] || SUB_ALLOW[`${cat}:${subId}`])) {
      rows = rows.filter((row) => {
        try {
          return chipIdentity(cat, subId, {
            name: row.name, types: row.google_types || [], primary_type: row.primary_type,
            primaryType: row.primary_type, category: row.category,
          });
        } catch (e) { return true; }
      });
    }
    // 3. rankInventory's real row filters, 1.15 gate, score and top-N. Called,
    //    not restated — it returns mapped places, and only the IDS are taken,
    //    so the rows admitted below are the ORIGINAL rows.
    const kept = rankInventory(rows, LAT, LNG, radiusM, surface.oldN);
    for (const p of kept) oldIds.add(p.id);
    oldReads.push({ cat, sub: sub || null, inBox: (rawByCat[cat] || []).length, afterChip: rows.length, kept: kept.length, dbTruncated: truncated });
  }
}
const oldRows = surface.categories.flatMap((c) => (rawByCat[c] || []).filter((r) => oldIds.has(r.place_id)));
const oldAdmit = admitOwnedRows(oldRows, origin, {
  maxMi: surface.radiusMi, identity: surface.claims, toPlace: surface.toPlace,
});

// ── NEW: identity-first over every row that was read ────────────────────────
//
// A category the registry declares broad BY DESIGN keeps the OLD cut in this
// column too, so the delta is exactly what the SHIPPED code recovers rather than
// a ceiling nobody built. Today reads attractions and beach identity-first and
// deliberately leaves food/nightlife/hotels/shopping on the shared reader.
const byDesign = surface.broadByDesign || {};
const newRows = surface.categories.flatMap((c) =>
  (byDesign[c] ? (rawByCat[c] || []).filter((r) => oldIds.has(r.place_id)) : (rawByCat[c] || [])));
const nextAdmit = admitOwnedRows(newRows, origin, {
  maxMi: surface.radiusMi, identity: surface.claims, toPlace: surface.toPlace,
});
const next = {
  places: nextAdmit.places,
  stats: {
    ...nextAdmit.stats,
    perCategory: readStats,
    truncated: false,
    sourceFailures: Object.values(readStats).filter((v) => v === null).length,
    broadByDesign: Object.keys(byDesign),
  },
};
const oldAdmitStats = oldAdmit.stats;

const oldBuckets = surface.bucket(oldAdmit.places, origin);
const newBuckets = surface.bucket(next.places, origin);

const notMeasured = surface.railsNotMeasured || {};
const railRows = surface.rails.filter((id) => !notMeasured[id]).map((id) => ({
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
  railsNotMeasured: notMeasured,
  old: {
    reads: oldReads,
    reachedClassifier: oldRows.length,
    qualified: oldAdmitStats.qualified,
    byRail: oldBuckets,
    dbWindowTruncated: oldReads.some((r) => r.dbTruncated),
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
  console.log(`OLD  rows the shipped cut let through: ${report.old.reachedClassifier}   (${report.old.reads.map((r) => `${r.cat}${r.sub ? ":" + r.sub : ""} ${r.kept}/${r.inBox}${r.dbTruncated ? "*" : ""}`).join(", ")})${report.old.dbWindowTruncated ? "   * the unordered limit=1000 window also bit" : ""}`);
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
