#!/usr/bin/env node
/**
 * check-ranking-integrity — one Wayfind Score, and it is never invented.
 *
 * WHAT WAS FOUND (2026-08-06). The score was implemented three times:
 *
 *   lib/google.js:357   canonical, 0–100
 *   lib/beaches.js:12   a byte-identical inline copy, guarded for drift
 *   lib/landing.js:77   `const wfScore = ...`, commented "Same Bayesian blend
 *                       the app ranks with" — and it was not
 *
 * The third returned bayes*10 (0–50) rather than round(bayes/5*100) (0–100),
 * and returned 39.0 for an UNRATED place where canonical returns null:
 *
 *   excellent, proven (4.6/3000)    92  vs  45.9
 *   great, few reviews (5.0/4)      79  vs  39.7
 *   UNRATED                       null  vs  39.0
 *
 * Consequences, both live on the paid-ad landing pages: the distance penalty
 * (capped 30) and curated bonus (+15) are tuned for 0–100, so on a 0–50 scale
 * they weighed double — a 20-mile drive cost 43% of the maximum instead of
 * 21%. And unrated inventory ranked against rated inventory on a number nobody
 * had earned.
 *
 * The drift guard that existed (test-beaches-page) compared CONSTANTS between
 * two of the three files. It could not have caught this, because landing.js
 * used the same constants in a different expression, and was not one of the
 * two files it looked at. So this guard RUNS the function instead of reading
 * it, and enumerates every declaration site rather than a known pair.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. RUN it. The formula is the thing, not the constants. ───────────── */
const { wayfindScore, WAYFIND_SCORE_M, WAYFIND_SCORE_C } =
  await import(new URL("../lib/wayfindScore.js", import.meta.url).href);

ok(typeof wayfindScore === "function", "lib/wayfindScore.js exports wayfindScore");
ok(WAYFIND_SCORE_M === 60 && WAYFIND_SCORE_C === 3.9, `the Bayesian constants are m=60, C=3.9 (got ${WAYFIND_SCORE_M}/${WAYFIND_SCORE_C})`);

// The 0–100 contract. Every downstream constant — the 30-point distance cap,
// the +15 curated bonus, lib/score.js's bands — is calibrated to it.
ok(wayfindScore(4.6, 3000) === 92, `4.6 over 3000 reviews scores 92 on the 0–100 scale (got ${wayfindScore(4.6, 3000)}) — a 0–50 scale silently doubles every penalty and bonus applied to it`);
ok(wayfindScore(5.0, 4) === 79, `a 5.0 from 4 reviews scores 79 (got ${wayfindScore(5.0, 4)}) — the Bayesian pull is what stops it beating a proven 4.6`);
ok(wayfindScore(4.6, 3000) > wayfindScore(5.0, 4), "a proven 4.6 outranks an unproven 5.0 — the entire reason the blend exists");

// THE NULL CONTRACT. "We do not know" is not a low score.
for (const [r, n] of [[null, 0], [null, 500], [undefined, 10], [0, 900]]) {
  ok(wayfindScore(r, n) === null, `wayfindScore(${JSON.stringify(r)}, ${n}) is null, not a number — an unrated place must not rank on an invented figure`);
}

/* ── 2. exactly ONE declaration in the repo ────────────────────────────── */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git" || e.startsWith(".wf-jsx-")) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}
const SRC = [...walk(path.join(REPO, "lib")), ...walk(path.join(REPO, "app"))];
const decls = [];
for (const f of SRC) {
  const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // a declaration, not a re-export and not a call
  if (/\bfunction wayfindScore\s*\(/.test(body)) decls.push(path.relative(REPO, f));
  // the shape landing.js used: an arrow holding the Bayesian expression
  if (/=>\s*\(*\(*\([^)]*\)\s*\/\s*\(\s*\([^)]*\)\s*\+\s*60\s*\)\s*\)/.test(body) && /3\.9/.test(body)) {
    decls.push(path.relative(REPO, f) + " (inline Bayesian arrow)");
  }
}
ok(
  decls.length === 1 && decls[0] === "lib/wayfindScore.js",
  `the Wayfind Score is declared exactly once, in lib/wayfindScore.js. Found: ${JSON.stringify(decls)}. A second copy is how a 0–50 scale shipped to the paid landing pages under a comment claiming it matched.`
);

/* ── 3. the landing ranker must not score an unrated place ─────────────── */
const LANDING = readFileSync(path.join(REPO, "lib/landing.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/import \{ wayfindScore \} from "\.\/wayfindScore\.js"/.test(LANDING),
  "lib/landing.js imports the shared score rather than restating it");
ok(/q == null/.test(LANDING) || /q === null/.test(LANDING),
  "lib/landing.js branches on a null score — without it an unrated place ranks on a number it never earned");
ok(!/\* 10;/.test(LANDING.slice(0, LANDING.indexOf("_s ="))) ,
  "no bayes*10 expression survives above the ranker — that was the 0–50 scale");

/* ── 4. proximity actually bites, and the head is diverse ──────────────
   RUN over the exact rows the live engine returned for food near Parrish at
   07:00 on 2026-08-06. The old curve (-0.2 past 17mi) left a 21.9-mile drive
   at the top of a section titled "Best places to eat NEARBY". */
const tb = await import(new URL("../lib/todaysBest.js", import.meta.url).href).catch(() => null);
ok(!!tb, "lib/todaysBest.js loads in plain node");

if (tb) {
  const { byVisibleScore, driveDeduction, diversifyHead, PROXIMITY_FREE_MI, PROXIMITY_PER_MI, PROXIMITY_MAX } = tb;

  ok(driveDeduction(PROXIMITY_FREE_MI) === 0, `nothing is deducted inside ${PROXIMITY_FREE_MI}mi`);
  ok(driveDeduction(NaN) === 0 && driveDeduction(undefined) === 0, "an unknown distance is not penalised — tours have no coordinates");
  ok(driveDeduction(120) === PROXIMITY_MAX, `the deduction caps at ${PROXIMITY_MAX} — past that, further is already out of the running`);
  ok(driveDeduction(22) > driveDeduction(10) + 1,
    `a 22mi drive costs more than a point beyond a 10mi one (${driveDeduction(22).toFixed(2)} vs ${driveDeduction(10).toFixed(2)}) — the rule it replaced separated them by 0.2, which changed no order at all`);

  // The measured rows, verbatim.
  const PARRISH = [
    { name: "Anna Maria Island Beach Cafe", distance_mi: 23.5, rating: 4.5, reviews: 5206, primary_type: "cafe" },
    { name: "Melt N Dip",                   distance_mi: 21.9, rating: 4.9, reviews: 1782, primary_type: "dessert_shop" },
    { name: "American Honey Creamery",      distance_mi: 10.4, rating: 4.7, reviews: 737,  primary_type: "dessert_shop" },
    { name: "Cracker Barrel",               distance_mi: 10.5, rating: 4.5, reviews: 5847, primary_type: "american_restaurant" },
    { name: "Rocco's Tacos",                distance_mi: 15.9, rating: 4.6, reviews: 7055, primary_type: "mexican_restaurant" },
    { name: "Chick-fil-A",                  distance_mi: 12.7, rating: 4.5, reviews: 3574, primary_type: "fast_food_restaurant" },
  ];
  const ordered = byVisibleScore(PARRISH);
  ok(ordered[0].distance_mi < 12,
    `the top pick for "nearby" is inside 12 miles (got ${ordered[0].name} at ${ordered[0].distance_mi}mi) — this exact list used to lead with a 21.9-mile drive`);
  ok(ordered.findIndex((r) => r.name === "Melt N Dip") > 2 && ordered.findIndex((r) => r.name === "Anna Maria Island Beach Cafe") > 2,
    "both 20-mile-plus rows fall out of the top three");

  // Unrated must not compete. It used to score 0 here and 39 in landing.js —
  // wrong in both directions, from two different invented numbers.
  // The discriminating case. Scoring an unrated place 0 ALSO puts it last in a
  // list of good places — by luck, not by contract. It only diverges against a
  // rated row whose distance penalty drives it below zero, which is exactly
  // where the old code got it wrong: "we have never heard of it" outranked
  // "we know it is terrible".
  const terribleFar = { name: "terrible-far", distance_mi: 30, rating: 1.0, reviews: 5000, primary_type: "bar" };
  const unratedNear = { name: "unrated-near", distance_mi: 0.5, rating: null, reviews: 0, primary_type: "cafe" };
  const both = byVisibleScore([unratedNear, terribleFar]);
  ok(both[both.length - 1].name === "unrated-near",
    `an unrated place sorts BELOW even a 1-star place 30 miles away (got ${both.map((r) => r.name).join(" > ")}) — it does not rank on a number nobody gave it. Scoring it 0 instead of excluding it reverses this.`);
  const withUnrated = byVisibleScore([unratedNear, ...PARRISH]);
  ok(withUnrated[withUnrated.length - 1].name === "unrated-near",
    "and it stays last in a real list, from half a mile away");

  // Diversity of the head.
  const clones = [
    { name: "taco1", distance_mi: 1, rating: 4.9, reviews: 5000, primary_type: "mexican_restaurant" },
    { name: "taco2", distance_mi: 1, rating: 4.8, reviews: 5000, primary_type: "mexican_restaurant" },
    { name: "taco3", distance_mi: 1, rating: 4.7, reviews: 5000, primary_type: "mexican_restaurant" },
    { name: "cafe1", distance_mi: 2, rating: 4.4, reviews: 5000, primary_type: "cafe" },
    { name: "bar1",  distance_mi: 2, rating: 4.3, reviews: 5000, primary_type: "bar" },
  ];
  const head = byVisibleScore(clones).slice(0, 3).map((r) => r.primary_type);
  ok(new Set(head).size === 3, `no two of the top three share a primary_type (got ${JSON.stringify(head)}) — three taco bars is not a shortlist`);
  ok(byVisibleScore(clones)[0].name === "taco1", "the single best row still leads — diversity reorders the head, it does not override the ranking");

  // Totality: these run inside a render.
  for (const bad of [null, undefined, [], [null], [{}], [{ rating: "x" }]]) {
    let threw = false;
    try { byVisibleScore(bad); diversifyHead(bad); } catch (e) { threw = true; }
    ok(!threw, `byVisibleScore/diversifyHead survive ${JSON.stringify(bad)}`);
  }
}

/* ── 8. ONE ARITHMETIC: every surface orders through lib/rankPlaces.js ─────
 *
 * Spec guard 8. app/home.js composed the ordering SIX times, in six subtly
 * different expressions, and they disagreed about what an unrated place is
 * worth (50 on three rows, 0 on the other three) — so the same unknown place
 * sat mid-pack on the personalised feed and dead last on the fit sorts, on one
 * screen, on one visit.
 *
 * Two things are asserted, and the second is the one that matters: that the
 * extraction was actually behaviour-identical. The six original expressions are
 * retyped here verbatim from the commit that removed them, and run against
 * placeScore() over every combination of inputs including the awkward ones. A
 * refactor that quietly changes results is not a refactor.
 */
{
  const { placeScore, UNRATED_MIDPACK, UNRATED_LAST, FAVE_TIER_WEIGHT, CURATED_BONUS } =
    await import(new URL("../lib/rankPlaces.js", import.meta.url).href);
  const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8");

  ok(FAVE_TIER_WEIGHT === 4 && CURATED_BONUS === 15, "the shared weights are the historical ones (4 a fave tier, 15 curated)");

  // No hand-composed ordering survives outside the module. RED: reinstate any
  // of the six by writing `wfScore ... + featuredBoost(` in one expression.
  const handRolled = (HOME.match(/wfScore[^;\n]{0,120}\+\s*featuredBoost\(/g) || []);
  ok(handRolled.length === 0,
     `no surface composes its own ordering from wfScore + boosts (found ${handRolled.length}: ${JSON.stringify(handRolled.slice(0, 2))}) — six of these drifted apart before they were unified`);
  const routed = (HOME.match(/placeScore\(\{|byPlaceScore\(/g) || []).length;
  ok(routed >= 6, `every ranking site routes through placeScore/byPlaceScore (found ${routed}, expected >= 6)`);

  // THE EQUIVALENCE. Six expressions, exactly as they were written.
  const was = {
    ps:   (p) => (p.wfScore || 50) + p.boost - p.dist + p.fave * 4 + p.feat + p.comm + (p.cur ? 15 : 0) + p.cre,
    hol:  (p) => (p.wfScore || 50) + p.fit + p.pin + p.feat + p.cre,
    base: (p) => (p.wfScore != null ? p.wfScore : 50) + p.feat + p.comm + p.cre,
    fitA: (p) => (p.wfScore || 0) + p.feat + (p.cur ? 15 : 0) + p.ctx + p.cre,
    fitB: (p) => (p.wfScore || 0) + p.feat + p.ctx + p.cre,
    cond: (p) => (p.wfScore || 0) + p.fave * 4 + p.feat + p.comm + p.cre,
  };
  const now = {
    ps:   (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, contextBoost: p.boost, distancePenalty: p.dist, faveTier: p.fave, featured: p.feat, community: p.comm, curated: !!p.cur, evidence: p.cre }),
    hol:  (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, contextBoost: p.fit + p.pin, featured: p.feat, evidence: p.cre }),
    base: (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, zeroIsUnrated: false, featured: p.feat, community: p.comm, evidence: p.cre }),
    fitA: (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_LAST, featured: p.feat, curated: !!p.cur, contextBoost: p.ctx, evidence: p.cre }),
    fitB: (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_LAST, featured: p.feat, contextBoost: p.ctx, evidence: p.cre }),
    cond: (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_LAST, faveTier: p.fave, featured: p.feat, community: p.comm, evidence: p.cre }),
  };
  let n = 0; const bad = [];
  for (const wfScore of [null, undefined, 0, 1, 42, 50, 78, 92, 100])
    for (const a of [0, 1, 7, 15, 30]) for (const b of [0, 1, 7, 15, 30]) for (const cur of [false, true]) {
      const p = { wfScore, boost: a, dist: b, fave: a % 4, feat: b, comm: a, cur, cre: b, fit: a, pin: b, ctx: a };
      for (const k of Object.keys(was)) { n += 1; if (was[k](p) !== now[k](p)) bad.push(`${k} @ wfScore=${wfScore}: was ${was[k](p)}, now ${now[k](p)}`); }
    }
  ok(n >= 2000, `the equivalence sweep actually ran (${n} evaluations) — a loop that compared nothing would pass silently`);
  ok(bad.length === 0, `placeScore reproduces all six original expressions exactly over ${n} evaluations (${bad.length} mismatches: ${JSON.stringify(bad.slice(0, 3))})`);

  // ZERO IS A SCORE, NOT AN ABSENCE — and the two surviving readings of that are
  // pinned so the next commit collapses them deliberately, not by accident.
  ok(placeScore({ quality: 0, unratedBase: 50 }) === 50, "a computed 0 currently falls back like an unrated place on five of the six sites (historical `||` coercion, preserved)");
  ok(placeScore({ quality: 0, unratedBase: 50, zeroIsUnrated: false }) === 0, "…while boostBase's `!= null` reading keeps it a real 0 — the seventh disagreement, now visible in one file instead of six");
  ok(placeScore({ quality: null, unratedBase: UNRATED_LAST }) === 0 && placeScore({ quality: null, unratedBase: UNRATED_MIDPACK }) === 50,
     "an unrated place is still worth 0 on some surfaces and 50 on others — DELIBERATELY not fixed in the extraction commit, so this reads as the bug it is");

  // Commission can never become a term.
  // CODE, not prose. The first version of this assertion failed on the module's
  // OWN header, which says "commission is not a term" — a guard that cannot
  // tell a rule from a violation of it is worse than no guard, and the spec's
  // own instruction is to assert syntactic position rather than a bare
  // substring. Comments are stripped before asking.
  const RANK_SRC = readFileSync(path.join(REPO, "lib/rankPlaces.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  ok(!/affiliate|commission|payout|partner_priority|partnerPriority/i.test(RANK_SRC),
     "lib/rankPlaces.js contains no affiliate/commission/payout identifier — every surface and the App Store description claim rankings are merit-based, and this file is where that is true or false");
  ok(!/^import .*(affiliate|commerce|monetize|deals)/m.test(RANK_SRC), "…and imports nothing that could carry one in");
}

if (fail.length) {
  console.error(`check-ranking-integrity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-ranking-integrity: ${pass} assertions passed (one score, declared in lib/wayfindScore.js, null for unrated)`);
