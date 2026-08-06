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

if (fail.length) {
  console.error(`check-ranking-integrity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-ranking-integrity: ${pass} assertions passed (one score, declared in lib/wayfindScore.js, null for unrated)`);
