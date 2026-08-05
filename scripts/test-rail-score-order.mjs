// scripts/test-rail-score-order.mjs — the rails order by the WAYFIND SCORE.
//
// Owner, 2026-08-05: "they are not being displayed by highest to lowest score,
// I want the highest score to show first."
//
// THE DEFECT. rankExperiences() ordered correctly — by experienceWayfindScore,
// the Bayesian blend that weights review DEPTH. Both rails then RE-SORTED by
// `rating * 2 + min(0.4, log10(reviews))`, in which reviews contribute at most
// 0.4 and rating dominates. Measured on the real shape:
//
//     4.7 with 2000 reviews   Score 94   railBase  9.73   -> shown 3rd
//     4.9 with   40 reviews   Score 86   railBase  9.96   -> shown 2nd
//     5.0 with    3 reviews   Score 79   railBase 10.06   -> shown 1st
//
// A 5.0 from three people beat a 4.7 from two thousand, and the correct order
// was destroyed immediately after being computed.
//
// This asserts the ORDER, not the formula — a future scoring change is free to
// move the numbers as long as depth still beats a thin perfect rating.
import { experienceWayfindScore, rankExperiences } from "../lib/experiencesData.js";
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("test-rail-score-order: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const ROWS = [
  { title: "thin perfect", rating: 5.0, reviews: 3 },
  { title: "deep strong", rating: 4.7, reviews: 2000 },
  { title: "mid", rating: 4.9, reviews: 40 },
  { title: "deep good", rating: 4.6, reviews: 900 },
];

// The Score itself must value depth — the property everything below rests on.
ok(experienceWayfindScore(ROWS[1]) > experienceWayfindScore(ROWS[0]),
   `the Wayfind Score ranks depth over a thin perfect rating (4.7/2000 = ${experienceWayfindScore(ROWS[1])} vs 5.0/3 = ${experienceWayfindScore(ROWS[0])})`);

// rankExperiences is score-descending.
const ranked = rankExperiences(ROWS);
for (let i = 1; i < ranked.length; i += 1) {
  ok(experienceWayfindScore(ranked[i - 1]) >= experienceWayfindScore(ranked[i]),
     `rankExperiences is score-DESCENDING at position ${i} (${experienceWayfindScore(ranked[i - 1])} then ${experienceWayfindScore(ranked[i])})`);
}
ok(ranked[0].title === "deep strong", `the highest Score shows first (got "${ranked[0].title}")`);

// THE REGRESSION: neither rail may re-sort by the old rating-dominant base.
// Asserted as an absence in code with comments stripped, because both rails
// compute their sort inline and the defect IS that expression.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const f of ["app/home.js", "app/components/IntentPartnerPick.js"]) {
  const code = strip(readFileSync(new URL("../" + f, import.meta.url), "utf8"));
  ok(!/rating[^\n]{0,16}\*\s*2\s*\+\s*Math\.min\(\s*0?\.4/.test(code),
     `${f} does not re-sort by the rating-dominant base (rating*2 + min(.4, log10(reviews))) — that formula is what put a 5.0-from-3 above a 4.7-from-2000`);
  ok(/experienceWayfindScore\(/.test(code), `${f} scores its cards with experienceWayfindScore`);
}

// POSITIVE CONTROL: the banned pattern is detectable, so the absence above means something.
// The first draft of this pattern excluded ")" and therefore did not match
// the real expression `t.rating || 0) * 2`. The control caught it.
ok(/rating[^\n]{0,16}\*\s*2\s*\+\s*Math\.min\(\s*0?\.4/.test("const base = Number(t.rating || 0) * 2 + Math.min(.4, Math.log10(x) / 10);"),
   "positive control: the old rating-dominant expression IS matched when present");

console.log(`test-rail-score-order: OK — ${pass} assertions (Wayfind Score values review depth; rankExperiences is score-descending; neither rail re-sorts by the rating-dominant base)`);
