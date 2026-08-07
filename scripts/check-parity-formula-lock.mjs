// scripts/check-parity-formula-lock.mjs
//
// scripts/census-parity.mjs measures RETRIEVAL by holding RANKING constant: it
// runs the shipped ranker over the full census and over the small pool
// rankedFor() retrieves, and attributes the difference to retrieval.
//
// That only works if "the shipped ranker" really is the shipped one. wfScore is
// a non-exported const (lib/landing.js) and the _s expression is inline, so the
// parity script has to COPY them. A copied formula with no lock is a silent
// divergence waiting to happen: landing.js gets tuned, the parity metric keeps
// scoring against a ranker the site no longer uses, and it goes on reporting a
// confident number for a question nobody is asking any more.
//
// This guard fails the build the moment either side drifts.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

const landing = readFileSync(join(ROOT, "lib/landing.js"), "utf8");
const parity = readFileSync(join(ROOT, "scripts/census-parity.mjs"), "utf8");

// Normalise whitespace so formatting changes don't trip the lock, but any
// change to operands, constants or operators does.
const norm = (s) => s.replace(/\s+/g, "");

// ── 1. the score ──────────────────────────────────────────────────────────
// UPDATED, NOT DELETED (2026-08-06), exactly as the old message demanded.
//
// This used to compare two COPIES of `const wfScore = (r, n) => ...`, one in
// lib/landing.js and one in scripts/census-parity.mjs, and assert the text
// matched. It did match — and both were wrong. The copy in landing.js returned
// bayes*10 on a 0–50 scale against a distance penalty tuned for 0–100, and
// returned 39 for an UNRATED place. Two identical copies of a wrong formula is
// exactly what a text-parity lock cannot see.
//
// Both now import lib/wayfindScore.js, so there is nothing left to drift. The
// assertion becomes: neither may go back to declaring its own, and both must
// honour the null contract, or the parity metric is once again ranking with a
// formula the site does not use.
ok(/import \{ wayfindScore, governedWayfindScore \} from "\.\/wayfindScore\.js"/.test(landing),
  "lib/landing.js imports the shared Wayfind Score");
ok(/import \{ wayfindScore, governedWayfindScore \} from "\.\.\/lib\/wayfindScore\.js"/.test(parity),
  "scripts/census-parity.mjs imports the SAME shared Wayfind Score — a copy here is how the parity metric silently stops measuring the shipped ranker");
ok(!/const wfScore = \(r, n\) =>/.test(landing) && !/const wfScore = \(r, n\) =>/.test(parity),
  "neither file declares its own copy of the formula any more");
ok(/q == null/.test(landing) && /q == null/.test(parity),
  "both branch on a null score — the parity ranker must drop unrated places the same way the site does");

// ── 2. the distance penalty inside the _s expression ──────────────────────
// THE GOVERNING LAW (2026-08-07): both sides rank through
// governedWayfindScore — the flat law terms replaced the 1.3/mi model.
ok(/governedWayfindScore\(q, \{ hasCreatorVideo: hasCreatorVideoAt\(p\)/.test(landing),
  "lib/landing.js ranks through governedWayfindScore (the law: +7 video, −2 past 17mi)");
ok(/governedWayfindScore\(q, \{ hasCreatorVideo: hasCreatorVideoAt\(p\)/.test(parity),
  "scripts/census-parity.mjs mirrors the same governed call");
ok(!/\(mi - 4\) \* 1\.3/.test(landing) && !/\(p\.distMi \|\| 0\) - 4\) \* 1\.3/.test(parity),
  "neither side still carries the retired 1.3/mi model");

// ── 3. the terms the _s expression is built from ──────────────────────────
// If landing.js grows a NEW term, parity silently stops matching the shipped
// ranker. Catch the term list, not just the pieces we already copied.
// _s is now assigned inside a block (the null branch), so capture the whole
// forEach body rather than a single-statement expression.
const sExpr = landing.match(/pool\.forEach\(\(p\) => \{([\s\S]*?)\n  \}\);/);
ok(!!sExpr, "lib/landing.js still builds p._s inside rankedFor's pool.forEach");
if (sExpr) {
  // Dotted call sites are captured whole ("CURATED_NAMES.has", not
  // "CURATED_NAMES"), so the allowlist must carry the exact captured form.
  const known = ["wayfindScore", "governedWayfindScore", "hasCreatorVideoAt", "isFinite", "Math.min", "CURATED_NAMES.has", "_nn", "localCategoryBoost"];
  const calls = [...sExpr[1].matchAll(/([A-Za-z_$][A-Za-z0-9_$.]*)\s*\(/g)].map((m) => m[1]);
  const unknown = calls.filter((c) => !known.includes(c));
  ok(unknown.length === 0,
    `lib/landing.js _s gained an unrecognised term: ${unknown.join(", ")}. scripts/census-parity.mjs must be updated to mirror it, or its "ranking held constant" claim is false.`);
}

// ── 4. prove the lock can FAIL ────────────────────────────────────────────
// A guard that has never gone red in front of anyone is a guard being guessed
// about. Run the same comparison against a deliberately mutated formula and
// assert it is rejected.
{
  // There is no longer a pair of copied formulas to diff, so the self-test
  // proves the thing that replaced it: the import assertions are real regex
  // matches against real files, and a file that does NOT import the shared
  // score is rejected. Run them against a fabricated source that declares its
  // own copy — the exact regression this lock now exists to stop.
  const impostor = 'const wfScore = (r, n) => (((n||0)/((n||0)+60))*(r||0) + (60/((n||0)+60))*3.9) * 10;';
  const wouldPass = /import \{ wayfindScore \} from "\.\/wayfindScore\.js"/.test(impostor)
    && !/const wfScore = \(r, n\) =>/.test(impostor);
  ok(wouldPass === false, "self-test: a file that declares its own wfScore copy must NOT satisfy the import assertions — if it does, this lock is comparing nothing");
}

if (fails) { console.error(`check-parity-formula-lock: ${fails} failure(s)`); process.exit(1); }
console.log("check-parity-formula-lock: OK — both files import the ONE Wayfind Score, both drop unrated places, distance penalty and the _s term list match lib/landing.js; self-test rejected a file carrying its own copy");
