#!/usr/bin/env node
/**
 * check-guards-can-fail — no assertion in scripts/ may be incapable of failing.
 *
 * AGENTS.md §4: "A check that cannot fail is worse than no check, because it
 * launders an unknown into a green."
 *
 * Three of these were found live on 2026-07-29, all inside the 173-guard suite,
 * all shaped `ok(!/regex/.test(x) || true, "...")`:
 *
 *   test-device-id.mjs:19          "no evercookie/fingerprint resurrection"
 *   test-ranking-editorial.mjs:15  "star-number cannot render alongside editorial"
 *   test-experiment.mjs:122        no duplicate detail_open tracking (empty message)
 *
 * All three were NEGATIVE assertions. The pattern is always the same: a text
 * search hits a false positive — usually a COMMENT that names the very thing it
 * forbids — and `|| true` is appended to unblock instead of fixing the
 * expression. The device-id one was the worst case: it sat between two live
 * privacy checks, so the suite verified that our privacy promise was written
 * down while the check that it was honoured was switched off.
 *
 * Two of the three turned out to pass fine once the bypass was removed, which
 * means the bypass was never needed — it was added defensively and never
 * revisited. That is exactly why this file exists: nobody goes back.
 *
 * If a property genuinely cannot be expressed, DELETE the assertion with a
 * comment saying what it checked and why it is gone. A removed check is honest.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve("scripts");
let pass = 0;
const findings = [];

// Strip comments so a doc-comment describing the pattern (like this file's own
// header) is never mistaken for a live bypass.
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// This file necessarily CONTAINS the patterns it hunts for — in its own regexes
// and its own error strings. Scanning itself would be a guaranteed false
// positive, and "strip string literals too" is not a fix: the patterns would
// still appear inside the regex literals. Self-exclusion is the honest answer,
// and it is safe because this file's own assertions are exercised by the
// red-prove in the PR rather than by itself.
const SELF = "check-guards-can-fail.mjs";
const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && f !== SELF);

for (const f of files) {
  const src = codeOnly(readFileSync(path.join(DIR, f), "utf8"));
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/\bok\s*\(/.test(line)) return;
    const n = i + 1;

    // 1. tautological OR — the assertion can never be false
    if (/\|\|\s*(true|1)\b/.test(line)) {
      findings.push(`${f}:${n} — ok(...) contains a tautological "|| true" / "|| 1"`);
    }
    // 2. empty message — a failure nobody can act on.
    //    Parse the ok(...) call and inspect its LAST argument. A naive
    //    /,\s*""\s*\)/ matches any inner `.replace(x, "")` on the same line and
    //    reported 10 false positives on first run — the check ran correctly and
    //    answered a different question.
    const at = line.indexOf("ok(");
    if (at !== -1) {
      let depth = 0, end = -1;
      for (let j = at + 2; j < line.length; j++) {
        const ch = line[j];
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end !== -1) {
        const args = line.slice(at + 3, end);
        // split on TOP-LEVEL commas only
        let d = 0, last = "", cur = "";
        for (const ch of args) {
          if ("([{".includes(ch)) d++;
          else if (")]}".includes(ch)) d--;
          if (ch === "," && d === 0) { last = cur; cur = ""; } else cur += ch;
        }
        const msg = cur.trim();
        if (last && /^(""|''|``)$/.test(msg)) {
          findings.push(`${f}:${n} — ok(...) has an empty failure message`);
        }
      }
    }
    // 3. literal-true condition
    if (/\bok\s*\(\s*(true|1)\s*,/.test(line)) {
      findings.push(`${f}:${n} — ok(true, ...) is unconditionally green`);
    }
  });
  pass++;
}

if (findings.length) {
  console.error("check-guards-can-fail: FAIL — assertions that cannot fail:");
  findings.forEach((x) => console.error("    " + x));
  console.error("  Fix the ASSERTION to express the real property. Never re-add the bypass.");
  console.error("  If the property cannot be expressed, delete the check with a comment saying why.");
  process.exit(1);
}

console.log(`check-guards-can-fail: OK — ${pass} guard files scanned, no tautological conditions, no empty failure messages`);
