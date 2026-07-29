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

// ── 1. wfScore ────────────────────────────────────────────────────────────
const wfLanding = landing.match(/const wfScore = \(r, n\) => ([^;]+);/);
ok(!!wfLanding, "lib/landing.js still defines `const wfScore = (r, n) => ...` — if this moved, the parity lock cannot see it and MUST be updated, not deleted");
const wfParity = parity.match(/const wfScore = \(r, n\) => ([^;]+);/);
ok(!!wfParity, "scripts/census-parity.mjs still defines its wfScore copy");
if (wfLanding && wfParity) {
  ok(norm(wfLanding[1]) === norm(wfParity[1]),
    `wfScore has DRIFTED between lib/landing.js and scripts/census-parity.mjs.\n    landing: ${wfLanding[1].trim()}\n    parity : ${wfParity[1].trim()}\n    The parity metric would be ranking with a formula the site no longer uses.`);
}

// ── 2. the distance penalty inside the _s expression ──────────────────────
const penLanding = landing.match(/mi <= 4 \? 0 : Math\.min\(30, \(mi - 4\) \* 1\.3\)/);
ok(!!penLanding, "lib/landing.js still applies the `mi <= 4 ? 0 : Math.min(30, (mi-4)*1.3)` distance penalty in the _s expression");
const penParity = parity.match(/mi <= 4 \? 0 : Math\.min\(30, \(mi - 4\) \* 1\.3\)/);
ok(!!penParity, "scripts/census-parity.mjs mirrors the same distance penalty");

// ── 3. the terms the _s expression is built from ──────────────────────────
// If landing.js grows a NEW term, parity silently stops matching the shipped
// ranker. Catch the term list, not just the pieces we already copied.
const sExpr = landing.match(/p\._s = ([^;]+);/);
ok(!!sExpr, "lib/landing.js still assigns p._s = ... in rankedFor");
if (sExpr) {
  // Dotted call sites are captured whole ("CURATED_NAMES.has", not
  // "CURATED_NAMES"), so the allowlist must carry the exact captured form.
  const known = ["wfScore", "Math.min", "CURATED_NAMES.has", "_nn", "localCategoryBoost"];
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
  const mutated = wfLanding ? wfLanding[1].replace("3.9", "4.9") : "x";
  const shouldFail = wfParity ? norm(mutated) === norm(wfParity[1]) : false;
  ok(shouldFail === false, "self-test: a mutated wfScore (3.9 -> 4.9) must NOT compare equal — if it does, this lock is comparing nothing");
}

if (fails) { console.error(`check-parity-formula-lock: ${fails} failure(s)`); process.exit(1); }
console.log("check-parity-formula-lock: OK — wfScore, distance penalty and the _s term list match lib/landing.js; mutation self-test rejected a drifted formula");
