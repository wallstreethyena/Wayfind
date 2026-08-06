// scripts/check-guard-integrity.mjs — assertions written after the failure
// report are silently discarded.
//
// FOUND THE HARD WAY (2026-08-06). Many guards in this suite use a
// COLLECT-THEN-REPORT shape:
//
//     const fail = [];
//     const ok = (c, m) => { if (c) pass++; else fail.push(m); };
//     ...
//     if (fail.length) { ...; process.exit(1); }
//
// That shape is better than exit-on-first-failure — one run tells you
// everything that is wrong. But it makes POSITION load-bearing in a way
// nothing announces: any ok() written BELOW the report is collected into an
// array that is never looked at again. The guard prints "N assertions passed"
// and exits 0 while holding real failures.
//
// This is not hypothetical. check-home-answer-first.mjs was extended with 19
// assertions appended after its report; ten of them were failing and the guard
// reported success. Nothing in the suite noticed, because the suite's contract
// is the exit code and the exit code was 0.
//
// So: for every guard that collects, the report must be the LAST thing that
// can run. This guard reads the suite and proves it.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(REPO, "scripts");

// LINE-BASED, on purpose.
//
// The first version of this file stripped comments and then strings with
// regexes, and it destroyed the very thing it was looking for: stripping
// `//`-comments FIRST eats the `//` inside every "https://..." literal, which
// leaves an unbalanced quote, after which the string-stripping regex swallows
// the rest of the file — including the `if (fail.length)` report. It then
// reported 24 guards as having no report at all. Every one of them had one.
//
// That is the same failure this repo already has a scar from (a greedy
// block-comment strip once deleted 158KB of live code from app/home.js because
// regex literals contain "/*"). Regex-lexing JavaScript does not work. Guards
// are written in a plain style — one statement per line, assertions at the
// start of a line — so read lines, which cannot silently swallow a file.
const isCommentLine = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

/** Index of the line holding the failure report, or -1. */
function reportLine(lines) {
  return lines.findIndex((l) => !isCommentLine(l) && /if\s*\(\s*fail\.length/.test(l));
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs")).sort();
ok(files.length > 100, `the suite was actually read (found ${files.length} scripts) — an empty scan would pass vacuously`);

let collectors = 0;
let checked = 0;
for (const f of files) {
  if (f === "check-guard-integrity.mjs") continue;
  const raw = readFileSync(path.join(DIR, f), "utf8");
  // Only guards that COLLECT are at risk. One that exits on the first failure
  // has no ordering hazard, so it is out of scope rather than assumed safe.
  if (!/const fail\s*=\s*\[\]/.test(raw)) continue;
  if (!/fail\.push\(/.test(raw)) continue;
  collectors += 1;

  const lines = raw.split("\n");
  const report = reportLine(lines);
  ok(report >= 0, `${f}: a guard that collects failures HAS a report — collecting into an array nobody reads is worse than not asserting`);
  if (report < 0) continue;

  // `!isCommentLine` matters: a COMMENTED-OUT process.exit(1) still contains
  // the text. Caught by RED proof — the first version of this assertion passed
  // happily against `// process.exit(1);`, which is a guard that reports its
  // failures in red and then exits 0, the worst of both worlds.
  ok(lines.slice(report, report + 12).some((l) => !isCommentLine(l) && /process\.exit\(1\)/.test(l)),
     `${f}: the report exits non-zero — run-guards reads the exit code and nothing else`);

  // THE PROPERTY: nothing that can record a failure runs after the report.
  const after = lines.slice(report + 1).filter((l) => !isCommentLine(l));
  const orphaned = after.filter((l) => /^\s*ok\s*\(/.test(l)).length;
  ok(orphaned === 0,
     `${f}: ${orphaned} assertion(s) are written AFTER the failure report and can never fail the guard — move the report to the end of the file`);
  ok(after.filter((l) => /fail\.push\(/.test(l)).length === 0,
     `${f}: nothing records a failure after the report is read`);
  checked += 1;
}

ok(collectors >= 20, `the collect-then-report pattern really is widespread (${collectors} guards) — this is a suite-wide property, not one file's quirk`);
ok(checked === collectors, `every collector was checked (${checked}/${collectors})`);

if (fail.length) {
  console.error(`check-guard-integrity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-guard-integrity: OK — ${pass} assertions across ${collectors} collect-then-report guards; none can silently discard an assertion`);
