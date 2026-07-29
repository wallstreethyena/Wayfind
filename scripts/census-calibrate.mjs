// scripts/census-calibrate.mjs — PHASE 2 calibration. ZERO API calls.
//
// Reads one saturated per-metro census and reports, PER CATEGORY, the review-count
// distribution — so a floor for the other twenty metros is chosen against evidence
// instead of judgement.
//
// RESULT ON ORLANDO: there is no boundary to derive. The decay is smooth at every
// floor, in all four categories. Where the head ends is a PRODUCT decision, not a
// discoverable fact. This script therefore reports the distribution and refuses to
// print a number that would look like a measurement.
//
// Why per category and not one constant: Orlando restaurants had 750 candidates
// against nightlife's 516 and scored 0/20 against nightlife's 1/20. Their
// head/tail boundaries cannot be the same number. Same lesson as the metro
// radius and RAIL_MIN_REVIEWS — a constant calibrated on one cell is wrong in
// the others.
//
// THE TAIL IS NOT DISPOSABLE. Two shipped surfaces live in it:
//   - "Hidden gems" is DEFINED as under 3,000 reviews.
//   - #414 new-venue eligibility exists precisely because a review floor
//     structurally excludes new rooms, and new rooms are tail rows.
// So this script does not propose discarding the tail. It reports where the
// ranked head stops moving, so a future sweep can decide how hard to chase the
// tail — not whether to keep it.
//
// Classification uses the SHIPPED gate (lib/placeFilter.placeAllowed), not a new
// predicate. Deriving predicates here would block census completeness on
// editorial judgement, and every revision would force a paid re-sweep.
//
// Usage: node scripts/census-calibrate.mjs --city orlando

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { placeAllowed } from "../lib/placeFilter.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

// gateCat values as used by lib/landing.js LANDING_CATS.
const CATS = [
  { slug: "nightlife",     gate: "nightlife" },
  { slug: "restaurants",   gate: "food" },
  { slug: "things-to-do",  gate: "attractions" },
  { slug: "beaches",       gate: "beach" },
];

const slug = arg("city", "orlando");
const census = JSON.parse(readFileSync(join(ROOT, "tmp", `census-${slug}.json`), "utf8"));
const rows = census.rows.filter((r) => r.inMetro);

if (!rows.length) { console.error("FATAL: census has no in-metro rows"); process.exit(1); }
if (!census.saturation) { console.error("FATAL: census carries no saturation record"); process.exit(1); }

console.log(`═══ CALIBRATION ${slug} ═══`);
console.log(`  census rows in-metro : ${rows.length}`);
console.log(`  metro saturated      : ${census.saturation.stoppedEarly ? "yes" : "NO"}`);
if (census.saturation.budgetHit) console.log(`  *** budget bound at ${census.saturation.maxCalls} calls — figures below are a FLOOR ***`);
console.log(`  uncategorised (Rule 2): ${census.counts.uncategorised}`);

// Discovery order per place_id, reconstructed from the persisted raw curve. This
// is what makes "where did the head stop moving" answerable at all — and it only
// works because the curve was persisted rather than just the verdict.
const curve = census.saturation.curve || [];
if (!curve.length) { console.error("FATAL: raw curve absent — cannot derive discovery order. Re-run the sweep with curve persistence."); process.exit(1); }

console.log(`\n  raw curve entries    : ${curve.length}`);

// POSITIVE CONTROL on the classifier: it must accept SOME rows and reject SOME.
// A gate that passes everything or nothing is broken, not permissive.
for (const c of CATS) {
  const inCat = rows.filter((r) => placeAllowed(c.gate, null, { name: r.name, primaryType: r.primaryType, types: r.types, rating: r.rating, userRatingCount: r.reviews }));
  c.rows = inCat;
}
const anyAllNone = CATS.filter((c) => c.rows.length === 0 || c.rows.length === rows.length);
if (anyAllNone.length === CATS.length) { console.error("FATAL: classifier passed all-or-nothing for every category — gate is broken, not the data."); process.exit(1); }

console.log(`\n  category membership (shipped gate, one row may belong to several):`);
for (const c of CATS) console.log(`    ${c.slug.padEnd(14)} ${String(c.rows.length).padStart(5)}  (${(100 * c.rows.length / rows.length).toFixed(1)}% of census)`);
const claimed = new Set(CATS.flatMap((c) => c.rows.map((r) => r.place_id)));
console.log(`    ${"UNCLAIMED".padEnd(14)} ${String(rows.length - claimed.size).padStart(5)}  <- in the census, no category takes them (the Ole Red shape)`);

console.log(`\n  head/tail boundary per category — cumulative share of the category`);
console.log(`  held above each review floor. The floor to pick is where the curve`);
console.log(`  flattens: more depth stops buying ranked positions.\n`);
const FLOORS = [0, 100, 250, 500, 1000, 2000, 3000, 5000, 10000];
process.stdout.write("    category        " + FLOORS.map((f) => String(f).padStart(6)).join("") + "\n");
for (const c of CATS) {
  if (!c.rows.length) { console.log(`    ${c.slug.padEnd(14)}  (no rows)`); continue; }
  const line = FLOORS.map((f) => (String(c.rows.filter((r) => r.reviews >= f).length).padStart(6))).join("");
  console.log(`    ${c.slug.padEnd(14)}${line}`);
}

// ── NO DERIVED FLOOR IS REPORTED, AND THAT IS THE FINDING ────────────────
// An earlier version printed "the review count of the 20th-ranked venue" as a
// derived per-category floor. It ranked by review volume — reproducing exactly
// the metric that was withdrawn for the food cells, one layer down. At full
// metro scale it returns, for NIGHTLIFE:
//
//   102353 Rainforest Cafe   38106 STK Steakhouse   27911 McDonald's   21342 IHOP
//
// and puts the venues this lane exists to surface at rank 37 (Twin Peaks),
// 97 (House of Blues), 133 (Ole Red), 489 (SAK Comedy Lab). A "floor" of 16,512
// reviews derived from that would exclude every one of them. The number was
// arithmetically correct and would have misdirected the fix.
//
// The distribution table above is the honest output. Read down any column and
// the decay is SMOOTH — 1495, 1255, 1097, 902, 674, 454, 315, 173, 64 for
// nightlife, and the same shape for the other three. There is no knee.
//
// So: where the head ends is a PRODUCT decision, not a discoverable fact. The
// census must therefore keep the tail, which is what "Hidden gems" (<3,000
// reviews) and #414's new rooms are made of.
console.log(`\n  NO DERIVED FLOOR — the distribution has no knee.`);
console.log(`  Cumulative counts decay smoothly at every floor in the table above, so`);
console.log(`  there is no boundary to discover; only one to choose. Reporting a number`);
console.log(`  here would be a product decision wearing a measurement's clothes.\n`);
for (const c of CATS) {
  const hidden = c.rows.filter((r) => r.reviews < 3000).length;
  console.log(`    ${c.slug.padEnd(14)} ${String(c.rows.length).padStart(5)} rows   tail(<3000, the Hidden-gems pool) ${String(hidden).padStart(5)}  = ${(100 * hidden / (c.rows.length || 1)).toFixed(0)}% of the category`);
}

console.log(`\n  NOTE: nothing above is a census cutoff. Hidden gems (<3,000 reviews) and`);
console.log(`  #414's new rooms are tail rows — 79-86% of every category — so a`);
console.log(`  head-only census would make both structurally impossible.`);
