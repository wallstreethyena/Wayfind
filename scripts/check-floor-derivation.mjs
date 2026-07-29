// scripts/check-floor-derivation.mjs
//
// Structural guard against one specific mistake that came within inches of
// shipping THREE times in a single night, each time caught only by inspection:
//
//   1. Phase 1 restaurants — a review-volume top-20 published as the yardstick,
//      with "no shipped predicate, volume alone" attached as a footnote. The
//      number became the headline. Its "missing" venues were Rainforest Cafe,
//      McDonald's and IHOP, which the page is correct to omit.
//   2. The gated re-measure — same shape, withdrawn before it went anywhere.
//   3. census-calibrate.mjs — printed "review count of the 20th-ranked venue"
//      as a DERIVED per-category floor. Gated to nightlife it yields 16,512,
//      which would exclude Twin Peaks (rank 37), House of Blues (97), Ole Red
//      (133) and SAK Comedy Lab (489) — every venue the work exists to surface.
//
// Catching the same thing three times by noticing is not a vigilance record, it
// is a missing guard. The failure is always identical: a review-count number
// derived from "the Nth-ranked venue by volume" and presented as a measured
// floor. It is arithmetically correct every time, which is exactly why nobody
// stops it — and per AGENTS.md §4, a wrong metric does not merely mismeasure, it
// misdirects the fix.
//
// THE RULE
// A script may derive a review-count floor. It may NOT derive one from a rank
// index without saying, in the file, what method it used. Declare the method:
//
//   // FLOOR-METHOD: <named statistical method and why it suits this data>
//
// The reference implementation is lib/marketFloor.js marketReviewFloor(), which
// takes the MEDIAN of the pool's review counts, scales it by REL_FLOOR_FRACTION,
// and clamps to [REL_FLOOR_MIN, REL_FLOOR_MAX]. That is a percentile method: it
// describes the distribution rather than reading one venue off a sorted list.
//
// Rank-index derivation is not banned — it is required to be declared, because
// declaring it is the step at which somebody notices it is wrong.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "scripts");
const SELF = "check-floor-derivation.mjs";

// The trigger is an ASSIGNMENT to an identifier that names a bar (floor / cut /
// threshold / min-reviews) whose right-hand side reads a review count.
//
// The first version also flagged any `[N] ... .reviews` anywhere, and that was
// wrong: it fired on `ok(dd[0].reviews === 1863, ...)` in test-beaches-page.mjs
// and `.sort(byTopRated)[0].reviews === 50` in test-top-rated.mjs. Those are
// ASSERTIONS comparing a review count, not derivations of a bar. A guard that
// fires on correct code gets disabled, so the trigger must be the shape of the
// mistake and not merely its vocabulary.
//
// `=(?!=)` so `===` comparisons are never mistaken for assignments.
const ASSIGN_RX = /\b(?:const|let|var)?\s*[A-Za-z0-9_$]*(?:floor|cut|thresh|minReviews|reviewBar)[A-Za-z0-9_$]*\s*=(?!=)\s*[^;\n]*\.reviews\b/i;
const DECLARED_RX = /FLOOR-METHOD:/;

let fails = 0, scanned = 0, exempt = 0;
const hits = [];

for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".mjs") || f === SELF) continue;
  const src = readFileSync(join(DIR, f), "utf8");
  scanned++;
  const declared = DECLARED_RX.test(src);
  const lines = src.split("\n");
  const found = [];
  lines.forEach((ln, i) => {
    // Skip comment lines — a comment describing the mistake is not the mistake.
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
    if (ASSIGN_RX.test(ln)) found.push({ line: i + 1, text: ln.trim().slice(0, 110) });
  });
  if (!found.length) continue;
  if (declared) { exempt++; continue; }
  for (const h of found) hits.push({ file: f, ...h });
}

for (const h of hits) {
  console.error(`  FAIL: scripts/${h.file}:${h.line} derives a review-count bar from a rank index with no declared method`);
  console.error(`        ${h.text}`);
  fails++;
}

// ── prove the check can fail ──────────────────────────────────────────────
// A guard that has never gone red in front of anyone is a guard being guessed
// about. Run both patterns against the exact expression that shipped in
// census-calibrate.mjs and assert they are caught.
{
  const shipped = "const cut = sorted[19] ? sorted[19].reviews : null;";
  const caught = ASSIGN_RX.test(shipped);
  if (!caught) { console.error("  FAIL: self-test — the exact line that shipped is NOT matched; this guard is inert"); fails++; }
  // Both real false positives from the first version, kept as permanent
  // regression cases so the trigger can never widen back onto assertions.
  const benign = [
    "const total = rows.length;",
    'ok(dd.length === 1 && dd[0].reviews === 1863, "same-name rows collapse to the strongest");',
    "ok([{ wfScore: 9, reviews: 10 }].sort(byTopRated)[0].reviews === 50,",
  ];
  for (const b of benign) if (ASSIGN_RX.test(b)) { console.error(`  FAIL: self-test — benign line matched, guard would block correct code: ${b.slice(0, 70)}`); fails++; }
}

if (fails) {
  console.error(`\ncheck-floor-derivation: ${fails} failure(s).`);
  console.error(`Add a "// FLOOR-METHOD: <method and why>" comment to the file, or derive the`);
  console.error(`bar from the distribution (see lib/marketFloor.js marketReviewFloor — median,`);
  console.error(`scaled, clamped) instead of reading one venue off a sorted list.`);
  process.exit(1);
}
console.log(`check-floor-derivation: OK — ${scanned} scripts scanned, ${exempt} with a declared FLOOR-METHOD, 0 undeclared rank-index floors; self-test caught the exact line that shipped and cleared a benign one`);
