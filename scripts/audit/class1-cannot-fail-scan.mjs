#!/usr/bin/env node
// scripts/audit/class1-cannot-fail-scan.mjs — CENSUS TOOL (not wired into
// prebuild), part of the 2026-09-04 extended guard-honesty audit
// (docs/audits/guard-honesty-extended-2026-09-04.md).
//
// Finds guards structurally incapable of failing regardless of what they
// find: no reachable path to a non-zero exit anywhere in the file, a
// tautological assertion argument, or an empty catch block that silently
// swallows whatever the guard was checking.
//
// METHOD / FALSE-POSITIVE SURFACE (stated up front, per CLAUDE.md's own
// guard-writing doctrine — a heuristic must say what it gets wrong):
//   - "no reachable non-zero exit" requires none of process.exit(<positive
//     literal or variable>), process.exitCode = <positive>, a bare `throw`,
//     or a call to assert()/assert.*() anywhere in the comment/string-
//     stripped source. A guard that fails by some OTHER mechanism (e.g.
//     returning a rejected promise from main() with no top-level catch,
//     which Node still exits non-zero on) would be a FALSE POSITIVE here —
//     rare in this repo's convention, not zero.
//   - the tautology check only catches the SPECIFIC shapes named in the
//     work order (`ok(true`, `ok(1,`, `X || true`, `!false`) — a more
//     creative tautology (`ok(1 === 1, ...)`) is a FALSE NEGATIVE.
//   - empty-catch is a real syntactic fact, but not every empty catch is a
//     class-1 bug — some legitimately guard a best-effort side channel
//     (e.g. "try to warn on Slack, don't fail the build over it"). Each
//     hit is read by hand in the report, not reported as a violation on
//     its own.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripCommentsAndStrings } from "../lib/guardHonestyAnalysis.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const SCRIPTS = path.join(ROOT, "scripts");
const files = readdirSync(SCRIPTS).filter((f) => /^(check|test)-.*\.mjs$/.test(f));

const results = [];
for (const f of files) {
  const abs = path.join(SCRIPTS, f);
  const raw = readFileSync(abs, "utf8");
  const code = stripCommentsAndStrings(raw);

  // Every process.exit(<args>) call in the file — including ternary and
  // variable arguments (`process.exit(bad ? 1 : 0)`, `process.exit(rc)`),
  // which an earlier version of this scan missed and mis-flagged
  // check-dupes.mjs / check-date-night-identity.mjs / check-known-for-tiers.mjs
  // / test-beach-geo.mjs as NO-FAIL-PATH when all four have a real,
  // reachable non-zero exit via exactly that idiom.
  const EXIT_CALL_RX = /process\.exit\(\s*([^)]*)\)/g;
  let hasNonzeroExit = false;
  let em;
  while ((em = EXIT_CALL_RX.exec(code))) {
    const arg = em[1].trim();
    if (arg !== "0" && arg !== "") hasNonzeroExit = true; // anything but a bare literal 0
  }
  const hasExitCodeAssign = /process\.exitCode\s*=\s*[1-9]/.test(code) || /process\.exitCode\s*=\s*[a-zA-Z_$]/.test(code);
  const hasThrow = /\bthrow\b/.test(code);
  const hasAssert = /\bassert(?:\.\w+)?\s*\(/.test(code);
  const canReachFailure = hasNonzeroExit || hasExitCodeAssign || hasThrow || hasAssert;

  const findings = [];
  if (!canReachFailure) {
    findings.push("NO-FAIL-PATH: no reachable non-zero exit anywhere in file");
  }

  const OK_RX = /\b(ok|assert)\s*\(([^;]*?)\)/g;
  let m;
  while ((m = OK_RX.exec(code))) {
    const arg = m[2].split(",")[0].trim();
    if (/^true$/.test(arg) || /^1$/.test(arg) || /\|\|\s*true\b/.test(arg) || /^!\s*false$/.test(arg)) {
      findings.push(`TAUTOLOGY: ${m[0].slice(0, 90).replace(/\s+/g, " ")}`);
    }
  }

  const EMPTY_CATCH_RX = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  const emptyCatches = (code.match(EMPTY_CATCH_RX) || []).length;
  if (emptyCatches > 0) findings.push(`EMPTY-CATCH: ${emptyCatches} occurrence(s)`);

  if (findings.length) results.push({ file: f, findings });
}

console.log(`class1-cannot-fail-scan: ${files.length} guard files scanned, ${results.length} flagged`);
for (const r of results) {
  console.log(`\n${r.file}`);
  for (const f of r.findings) console.log(`  - ${f}`);
}
