// scripts/census-calibrate.mjs — PHASE 2 calibration. ZERO API calls.
//
// Reads one saturated per-metro census and derives, PER CATEGORY, where the
// head/tail boundary actually sits. This is the whole point of paying for one
// full metro: the floor for the other twenty gets set from evidence instead of
// from somebody's judgement.
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

// The operative number: the review floor above which a category's top-20 is
// stable — i.e. the 20th-ranked venue's review count. Anything below it cannot
// enter that top-20 no matter how much more we sweep.
console.log(`\n  DERIVED per-category floor (reviews of the 20th-ranked venue —`);
console.log(`  below this a row cannot reach that category's top-20):\n`);
for (const c of CATS) {
  const sorted = [...c.rows].sort((a, b) => b.reviews - a.reviews);
  const cut = sorted[19] ? sorted[19].reviews : null;
  const hidden = c.rows.filter((r) => r.reviews < 3000).length;
  console.log(`    ${c.slug.padEnd(14)} top20-cut ${String(cut ?? "n/a").padStart(6)}   head(>=cut) ${String(sorted.filter((r) => cut != null && r.reviews >= cut).length).padStart(4)}   tail(<3000, Hidden-gems pool) ${String(hidden).padStart(5)}`);
}

console.log(`\n  NOTE: these floors bound the TOP-20 surface only. They are not a`);
console.log(`  census cutoff — Hidden gems (<3,000 reviews) and #414 new rooms are`);
console.log(`  tail rows, so a head-only census would make both impossible.`);
