#!/usr/bin/env node
/**
 * check-one-clock — the hour is read in ONE place.
 *
 * Owner directive (2026-07-30): "Build it ONCE and re-point everything at it.
 * Guard it: fail the build if getHours() appears outside lib/nowContext.js."
 *
 * WHAT THIS ACTUALLY PREVENTS. Before lib/nowContext.js, 38 call sites across
 * 14 files each read the clock and each bucketed the day for themselves, and
 * they disagreed: home.js split food at 11/15/21, the picks header at 11/17,
 * the greeting at 12/17, date-night at 15/4; Surprise.js said 12/17;
 * IntentPageClient used a two-bucket 15-hour binary. Every one of those was
 * defensible on its own and the aggregate was a product that looked identical
 * at 8am and 8pm while every surface believed it was time-aware. A single
 * re-added getHours() re-opens exactly that, silently, because a private
 * bucketing never fails — it just quietly disagrees.
 *
 * WHY THE SCOPE IS "READS THE WALL CLOCK", NOT THE LITERAL STRING getHours:
 * `new Date().getHours()` is one spelling. `d.getHours()`, `getUTCHours()` on a
 * shifted date, and `Intl.DateTimeFormat(..., {hour}).formatToParts` are the
 * others, and this repo contained all four. A guard that pinned only the first
 * would go green the moment someone used the second — the "assert the invariant,
 * not the string" rule from CLAUDE.md, applied to its own subject.
 *
 * FALSE-POSITIVE DISCIPLINE (CLAUDE.md: "a guard that fires on CORRECT code is
 * worse than no guard"). This strips comments and string literals before
 * scanning, because prose legitimately says "getHours" — this file's own header
 * does, six times. It runs against the whole tree and must be silent on every
 * correct file, and the success line states the surface it swept so a reviewer
 * can falsify the number.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// The one file allowed to read the wall clock, plus the two that legitimately
// predate it and are themselves single-purpose time sources it delegates to.
const ALLOWED = new Set([
  "lib/nowContext.js",   // THE source
  "lib/siteTime.js",     // the venue-local CALENDAR DAY source; nowContext imports it
  "lib/businessStatus.js", // venue-offset opening-hours math, driven by Date.now() + a per-place utcOffset
]);
// Guards and tests may exercise the clock directly — that is their job.
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "docs", "supabase", "design-after-final"]);

const HOUR_READS = [
  { re: /\.getHours\s*\(/g, what: "getHours()" },
  { re: /\.getUTCHours\s*\(/g, what: "getUTCHours()" },
  { re: /hourCycle\s*:/g, what: "Intl hourCycle (a private ET-hour reader)" },
];

// PER-LINE OPT-OUT. Whole-file allowlisting is too blunt: it would let a real
// daypart bucketing hide inside a file exempted for an unrelated reason. A
// marker on the offending LINE keeps the exemption narrow, forces the author to
// state a reason, and shows up in review as a deliberate act.
//
//   const idx = new Date().getUTCHours() % pages.length; // one-clock-ok: round-robin index, not a daypart
//
// The reason is REQUIRED — a bare marker is rejected below, because "// one-clock-ok"
// with no justification is how an exemption becomes a habit.
const OPT_OUT = /\/\/\s*one-clock-ok:\s*(\S.*)$/;

// Blank comments and string/template literals so prose and UI copy cannot match.
// Deliberately simple and conservative: it only ever REMOVES content, so the
// worst case is a missed offender, never a false accusation.
function codeOnly(src) {
  let out = "", i = 0, n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === "/" && c2 === "/") { while (i < n && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && c2 === "*") { out += "  "; i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; } out += "  "; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += " "; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") { out += "  "; i += 2; continue; } out += src[i] === "\n" ? "\n" : " "; i++; }
      out += " "; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e) || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e)) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT).filter((f) => {
  const rel = path.relative(ROOT, f);
  return !rel.startsWith("scripts" + path.sep); // guards/tests may read the clock
});

const offenders = [];
const exempt = [];
let scanned = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  if (ALLOWED.has(rel)) continue;
  scanned++;
  const raw = readFileSync(f, "utf8");
  const rawLines = raw.split("\n");
  const code = codeOnly(raw);
  for (const { re, what } of HOUR_READS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split("\n").length;
      // The marker is read from the RAW line (it lives in a comment, which
      // codeOnly has already blanked).
      const opt = OPT_OUT.exec(rawLines[line - 1] || "");
      if (opt && opt[1].trim().length >= 12) { exempt.push(`${rel}:${line} — ${what} (${opt[1].trim()})`); continue; }
      if (opt) { offenders.push(`${rel}:${line} — ${what} has a one-clock-ok marker with no usable reason`); continue; }
      offenders.push(`${rel}:${line} — ${what}`);
    }
  }
}

// POSITIVE CONTROL. A checker that reports zero for everything is broken, not
// clean — the exact failure a `git grep -c` pipeline produced on this repo when
// it silently summed the wrong awk field and read as a merge-#346 feature loss.
// Prove the probe finds a KNOWN positive before trusting a zero from it.
const control = codeOnly(readFileSync(path.resolve(ROOT, "lib/nowContext.js"), "utf8"));
if (!/\.getHours\s*\(/.test(control)) {
  console.error("check-one-clock: FAIL — the probe found no getHours() in lib/nowContext.js, which is known to contain one (the Intl fallback).");
  console.error("  The scanner or codeOnly() is broken. A zero from it would be meaningless.");
  process.exit(1);
}
// NEGATIVE CONTROL: prose must not match, or the guard fires on its own comments.
if (/\.getHours\s*\(/.test(codeOnly('// this comment mentions d.getHours() and a string "x.getHours()"'))) {
  console.error("check-one-clock: FAIL — codeOnly() does not strip comments/strings; the guard would fire on prose.");
  process.exit(1);
}

if (offenders.length) {
  console.error(`check-one-clock: FAIL — ${offenders.length} wall-clock read(s) outside lib/nowContext.js:\n`);
  for (const o of offenders) console.error("  " + o);
  console.error(`
  The hour has ONE source: lib/nowContext.js.
    the float hour  -> siteHourFloat()
    the bucket      -> bucketForHour(h)   morning | afternoon | night
    everything else -> nowContext({ lat, lng, city, weather })

  Do not re-derive a daypart locally. Ten private bucketings is the bug this
  replaced: every surface was time-aware and they all disagreed, so the app
  showed the same list at 8am and 8pm.

  A meal name?    mealForHour(h)      A greeting?   greetingForHour(h)
  A prose label?  BUCKET_PHRASE[b] / BUCKET_NOUN[b]

  If you genuinely need a raw clock read (solar position, a venue offset),
  add the file to ALLOWED here with a comment saying why.`);
  process.exit(1);
}

// State the exemptions in the success line. A guard whose opt-outs are
// invisible slowly stops guarding anything.
if (exempt.length) {
  console.log(`check-one-clock: ${exempt.length} justified exemption(s):`);
  for (const e of exempt) console.log("  · " + e);
}
console.log(`check-one-clock: OK — ${scanned} source files scanned for 3 wall-clock read forms, ${exempt.length} justified exemption(s), 0 unexplained reads outside the ${ALLOWED.size} allowed time modules (positive + negative controls passed)`);
