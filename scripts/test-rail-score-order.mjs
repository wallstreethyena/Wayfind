// scripts/test-rail-score-order.mjs — the EXPERIENCES rails order by the
// WAYFIND SCORE. This file covers experienceWayfindScore / rankExperiences
// ONLY (lib/experiencesData.js) — the Viator experiences collection. It does
// NOT cover, and never has covered, any of Wayfind's poster rail composers
// (nightOut, fall, dateNight, birthday, todayDiscovery, lunchBreak, worth
// eating, breakfast, …). For the GLOBAL law that governs every one of those,
// see lib/railRank.js and scripts/check-rail-rank-law.mjs.
//
// Owner, 2026-08-05: "they are not being displayed by highest to lowest score,
// I want the highest score to show first."
//
// 2026-09-03 — the same complaint came back a third time, this time on Night
// Out ("Joyland 8.5/16.8mi, La Jaula 7.7/14.9mi, Enigma 9.0/18mi" — a 9.0
// sitting below a 7.7). This file's every assertion below targets
// rankExperiences() and had been green the entire time: it was answering a
// question about the Experiences rail while the real regression lived in
// lib/nightOutIntent.js and lib/fallIntentRails.js, whose composers this file
// never imports and never calls. THAT is scripts/check-rail-rank-law.mjs's
// entire reason to exist — it enumerates every rail composer from the
// filesystem (glob, not a hand-written list) instead of trusting that one
// well-guarded rail means the rest are guarded too.
//
// THE DEFECT (the original, 2026-08-05 one). rankExperiences() ordered correctly — by experienceWayfindScore,
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
//
// FIXED 2026-09-04 (guard-honesty audit, disease "scoped-by-name"). This guard
// asserted the absence of the regression on TWO HARDCODED files —
// app/home.js and app/components/IntentPartnerPick.js, the two that had the
// bug on 2026-08-05. Every rail composer written or copy-pasted afterwards
// (SummerPicksRails, HomeAffiliateActivityRail, ViatorRail, FoodTourRail,
// TourStrip, BookingCTA, screens/Events — all of them call
// experienceWayfindScore/rankExperiences) was completely unguarded: this file
// would stay green even if one of THEM shipped the exact same rating-dominant
// re-sort. Section 2 below now DISCOVERS every caller by walking app/ and
// grepping for the real call syntax, so a new rail composer is covered the
// day it is added — the guard's file list can only grow, never require a
// human to remember to add a path to an array.
import { experienceWayfindScore, rankExperiences } from "../lib/experiencesData.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

// THE REGRESSION: NO rail composer that scores cards with the Wayfind Score
// may re-sort by the old rating-dominant base. Asserted as an absence in code
// with comments stripped, across the DISCOVERED UNION of call sites — not a
// hand-maintained list — because the defect is "some file, anywhere, computes
// this inline expression", and any file that was never taught to the guard is
// exactly as unprotected as if the guard did not exist.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const REPO_ROOT = new URL("..", import.meta.url);
const CALL_RX = /\b(?:experienceWayfindScore|rankExperiences)\s*\(/;

// Walk app/ (the only tree that can render a rail) for every file whose CODE
// — not a comment, not a string — actually CALLS one of the two guarded
// functions. This is the "union of plausible locations" pattern CLAUDE.md
// prescribes for exactly this failure mode ("assert the invariant, not the
// file path").
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
}
const candidates = [];
walk(path.join(new URL(REPO_ROOT).pathname, "app"), candidates);

const callers = [];
for (const abs of candidates) {
  const raw = readFileSync(abs, "utf8");
  const code = strip(raw);
  if (CALL_RX.test(code)) callers.push({ abs, code, rel: path.relative(new URL(REPO_ROOT).pathname, abs) });
}

// Discovery sanity floor: on 2026-09-04 nine files called one of these two
// functions (home.js, IntentPartnerPick, SummerPicksRails,
// HomeAffiliateActivityRail, ViatorRail, FoodTourRail, TourStrip,
// BookingCTA, screens/Events). A walk that silently found zero — a wrong
// root, a broken regex — would make every assertion below vacuously true,
// which is worse than no guard because it would report OK. Guard the guard.
ok(callers.length >= 5, `discovered ${callers.length} caller(s) of experienceWayfindScore/rankExperiences under app/ — expected at least 5 (a lower count than the known 9 means the walk broke, not that rails were deleted)`);

for (const { code, rel } of callers) {
  ok(!/rating[^\n]{0,16}\*\s*2\s*\+\s*Math\.min\(\s*0?\.4/.test(code),
     `${rel} does not re-sort by the rating-dominant base (rating*2 + min(.4, log10(reviews))) — that formula is what put a 5.0-from-3 above a 4.7-from-2000`);
}
console.log(`test-rail-score-order: discovered and swept ${callers.length} caller(s): ${callers.map((c) => c.rel).join(", ")}`);

// POSITIVE CONTROL: the banned pattern is detectable, so the absence above means something.
// The first draft of this pattern excluded ")" and therefore did not match
// the real expression `t.rating || 0) * 2`. The control caught it.
ok(/rating[^\n]{0,16}\*\s*2\s*\+\s*Math\.min\(\s*0?\.4/.test("const base = Number(t.rating || 0) * 2 + Math.min(.4, Math.log10(x) / 10);"),
   "positive control: the old rating-dominant expression IS matched when present");

console.log(`test-rail-score-order: OK — ${pass} assertions (Wayfind Score values review depth; rankExperiences is score-descending; neither rail re-sorts by the rating-dominant base)`);
