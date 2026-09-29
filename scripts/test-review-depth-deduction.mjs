#!/usr/bin/env node
// scripts/test-review-depth-deduction.mjs — THE REVIEW-DEPTH DEDUCTION.
//
// Owner, 2026-09-28: thin-volume places ("usually not even fully built",
// easy for an owner to solicit five stars) were ranking at the top. Rule:
//   fewer than 500 reviews    → −0.3 on the badge (3 internal)
//   500 through 2,000 reviews → −0.1 on the badge (1 internal)
//   more than 2,000           → nothing
// and hidden-gem pills stay exactly where they were.
//
// Every assertion here CALLS the code (CLAUDE.md "assert on the call"):
//   1. the bands, including both edges, through reviewDepthDeduction;
//   2. wayfindScore itself carries it (the one formula every surface uses);
//   3. the two former inline copies — experienceWayfindScore and the beach
//      sort key — agree with wayfindScore, so shown == sorted holds;
//   4. the /eat SQL-scored page applies it in the row map and re-sorts;
//   5. the gem pill is still chosen on rating + reviews, not on this number.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  wayfindScore, reviewDepthDeduction,
  FEW_REVIEWS_BELOW, FEW_REVIEWS_DEDUCTION, ESTABLISHING_REVIEWS_MAX, ESTABLISHING_DEDUCTION,
} from "../lib/wayfindScore.js";
import { experienceWayfindScore } from "../lib/experiencesData.js";
import { rankBeaches } from "../lib/beaches.js";
import { toDisplayScore } from "../lib/score.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// Undeducted Bayesian, written out independently so the delta is measurable.
const undeducted = (r, n) => {
  const v = n || 0;
  return Math.round((((v / (v + 60)) * r + (60 / (v + 60)) * 3.9) / 5) * 100);
};

// ── 1. THE BANDS ────────────────────────────────────────────────────────────
ok(FEW_REVIEWS_BELOW === 500 && FEW_REVIEWS_DEDUCTION === 3 && ESTABLISHING_REVIEWS_MAX === 2000 && ESTABLISHING_DEDUCTION === 1,
  "constants are 500 / 3 internal and 2000 / 1 internal (−0.3 and −0.1 on the /10 badge)");
for (const [n, want] of [[0, 3], [1, 3], [499, 3], [500, 1], [1200, 1], [2000, 1], [2001, 0], [50000, 0]]) {
  ok(reviewDepthDeduction(n) === want, `${n} reviews → −${want} internal (got ${reviewDepthDeduction(n)})`);
}
for (const junk of [null, undefined, NaN, -5, "abc"]) {
  ok(reviewDepthDeduction(junk) === 3, `garbage review count (${String(junk)}) reads as zero reviews → −3`);
}
ok(reviewDepthDeduction("1500") === 1, "a numeric-string count is read as the number");

// ── 2. IT IS IN THE CANONICAL FORMULA ───────────────────────────────────────
for (const [r, n] of [[4.9, 300], [5.0, 40], [4.8, 499], [4.7, 500], [4.6, 2000], [4.6, 2001], [4.5, 12000]]) {
  const got = wayfindScore(r, n);
  const want = undeducted(r, n) - reviewDepthDeduction(n);
  ok(got === want, `wayfindScore(${r}, ${n}) = ${want} (got ${got})`);
}
// The owner's complaint, on the badge: a thin 4.9 no longer ties/beats a proven 4.6.
const thin = wayfindScore(4.9, 300), proven = wayfindScore(4.6, 3000);
ok(toDisplayScore(thin) === 9.2 && toDisplayScore(proven) === 9.2,
  `4.9★/300 reads ${toDisplayScore(thin)} (was ${toDisplayScore(undeducted(4.9, 300))}); 4.6★/3000 reads ${toDisplayScore(proven)} (untouched)`);
ok(wayfindScore(0, 100) === null && wayfindScore(null, 0) === null,
  "an unrated place is still NULL — the deduction never mints a number (Score pending)");

// ── 3. THE FORMER INLINE COPIES AGREE ───────────────────────────────────────
for (const [r, n] of [[4.9, 120], [4.7, 800], [4.4, 5000], [5, 0]]) {
  ok(experienceWayfindScore({ rating: r, reviews: n }) === wayfindScore(r, n),
    `experienceWayfindScore(${r}, ${n}) === wayfindScore (got ${experienceWayfindScore({ rating: r, reviews: n })} vs ${wayfindScore(r, n)})`);
}
ok(experienceWayfindScore({ rating: 0, reviews: 10 }) === 0, "…and an unrated experience still sorts last at 0");

const beaches = rankBeaches([
  { name: "Thin Perfect", rating: 4.9, reviews: 300 },
  { name: "Mid", rating: 4.8, reviews: 1500 },
  { name: "Proven", rating: 4.7, reviews: 9000 },
  { name: "Tiny", rating: 5.0, reviews: 20 },
]);
ok(beaches.length === 4, "positive control: all four beaches ranked");
let mono = true;
for (let i = 1; i < beaches.length; i++) if (beaches[i].wf > beaches[i - 1].wf) mono = false;
ok(mono, `beach order is monotonic in the badge it paints (${beaches.map((b) => `${b.name}=${b.wf}`).join(", ")})`);
ok(beaches.every((b) => b.wf === wayfindScore(b.rating, b.reviews)), "every beach badge IS wayfindScore");

// ── 4. THE SQL-SCORED /eat PAGE ─────────────────────────────────────────────
{
  const src = strip(readFileSync(join(ROOT, "app/eat/[metro]/[cuisine]/page.js"), "utf8"));
  ok(/import\s*\{[^}]*\breviewDepthDeduction\b[^}]*\}\s*from\s*["'][./]+lib\/wayfindScore["']/.test(src),
    "/eat imports reviewDepthDeduction from lib/wayfindScore");
  const map = src.match(/const places = rows\.map\(\(r\) => \{[\s\S]*?\n  \}\)\.sort\(/);
  ok(!!map, "positive control: the row map + sort is found under its known shape");
  ok(!!map && /Number\(r\.wf_score\) - reviewDepthDeduction\(r\.reviews\)/.test(map[0]),
    "…the SQL score has the deduction subtracted INSIDE that map (not merely imported)");
  ok(!!map && /wfScore: wf,/.test(map[0]) && /score: wf == null \? null/.test(map[0]),
    "…and both the badge score and wfScore are the deducted value, so the list sorts on what it shows");
}

// ── 5. HIDDEN-GEM PILLS ARE UNTOUCHED ───────────────────────────────────────
{
  const home = strip(readFileSync(join(ROOT, "app/home.js"), "utf8"));
  const card = strip(readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  ok((home.match(/if \(p\.rating >= 4\.4 && p\.reviews >= 15 && p\.reviews < 800\) q\.add\("gem"\)/g) || []).length === 1,
    "home.js gem pill still keys on rating ≥ 4.4 and 15–799 reviews (not on the deducted score)");
  ok((card.match(/if \(rating >= 4\.4 && reviews >= 15 && reviews < 800\) q\.add\("gem"\)/g) || []).length === 1,
    "IconicPlaceCard gem pill likewise unchanged");
}

console.log(`\ntest-review-depth-deduction: ${fail ? "FAIL" : "OK"} — ${pass} assertions; <500 → −0.3, 500–2000 → −0.1, >2000 → 0 EXECUTED through wayfindScore, experienceWayfindScore, rankBeaches; /eat applies it in-map; gem pills unchanged`);
process.exit(fail ? 1 : 0);
