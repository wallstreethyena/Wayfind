#!/usr/bin/env node
/**
 * check-lib-call-imports — a component may not CALL one of our lib/ functions
 * without importing it.
 *
 * AUTHORED BY ANOTHER LANE on fix/booking-cta-reference-error, folded in here at
 * the owner's direction rather than raced: their code fix was byte-identical to
 * the one that shipped in #494, but this guard was theirs alone and it covers a
 * gap mine does not.
 *
 * The two are complementary, and both are now mandatory for extraction PRs:
 *   test-detail-render-smoke  RENDERS the component — catches anything that
 *                             actually throws on a path the test exercises.
 *   this file                 STATIC across every source file — catches an
 *                             unbound call in code no test happens to render.
 * The first proves the paths we thought of; the second covers the ones we did not.
 *
 * THE PRODUCTION CRASH THIS EXISTS FOR (2026-07-30)
 * #486 extracted the booking resolver into lib/bookingResolve.js. It moved
 * hasVerifiedTours() there as a NON-EXPORTED local and left the call site in
 * app/components/BookingCTA.js line 29 untouched. Every render of <BookingCTA>
 * with a place object then threw:
 *
 *     ReferenceError: Can't find variable: hasVerifiedTours
 *
 * which the ErrorBoundary caught and painted as "That took a wrong turn" — read
 * by the owner, reasonably, as a 404. Three real users hit it 14 times in one
 * afternoon on iOS Safari. It only fired on BOOKABLE places, because Detail.js
 * renders <BookingCTA variant="primary"> inside its `hasBooking` branch, which is
 * why desktop's twelve cafe/bakery detail opens looked fine and the failure read
 * as mobile-only.
 *
 * WHY NOTHING CAUGHT IT
 *   • `next build` does not resolve identifiers across module scopes — a bare
 *     reference to a name that does not exist is valid JavaScript until it runs.
 *   • This repo has no ESLint, so `no-undef` was never available.
 *   • 200+ guards existed and not one RENDERED a component. Every check was
 *     text- or pure-function-level, and this defect lives in neither.
 *
 * HOW THIS CHECKS IT WITHOUT A SCOPE ANALYSER
 * The universe is deliberately narrow: the names lib/ actually exports. For each
 * source file, any bare call to one of those names must be satisfied by an import
 * or a local declaration in that same file. That is precise enough to have zero
 * false positives from React, globals, or function parameters, and it is aimed at
 * exactly the hazard that produced the crash — a function relocated into lib/
 * while a caller kept calling it by bare name.
 *
 * Namespace imports are handled for free: `import * as Aff` is called as
 * `Aff.foo(...)`, which is not a bare call and never matches.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e)) out.push(p);
  }
  return out;
};

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Prose is not code. A UI label like "devices (first-party)" or a definition
// string containing "last 5 minutes (Wayfind's own event log…)" both look exactly
// like a bare call to the regex below, and both produced false positives on the
// first run. Contents are blanked rather than removed so nothing else shifts.
const blankStrings = (s) =>
  s
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => "`" + " ".repeat(Math.max(0, m.length - 2)) + "`")
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'");

/* ── the universe: every named function lib/ exports ──────────────────────── */
const libFiles = walk(path.resolve("lib"));
ok(libFiles.length > 10, `found lib modules to scan (got ${libFiles.length}) — an empty scan would make this guard vacuous`);

const exportedBy = new Map(); // name -> Set(modules)
for (const f of libFiles) {
  const src = stripComments(readFileSync(f, "utf8"));
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm)) names.add(m[1]);
  for (const n of names) {
    if (!exportedBy.has(n)) exportedBy.set(n, new Set());
    exportedBy.get(n).add(path.relative(process.cwd(), f));
  }
}
ok(exportedBy.size > 30, `collected lib export names (got ${exportedBy.size}) — too few would make the scan below vacuous`);
// Sanity anchor: the function whose absence caused the crash must be in the
// universe. If a future refactor un-exports it, this guard says so directly.
ok(exportedBy.has("hasVerifiedTours"),
  "hasVerifiedTours is exported from lib/ — it was a non-exported local when it crashed production, and every <BookingCTA> render threw");

/* ── the scan ─────────────────────────────────────────────────────────────── */
const sources = [...walk(path.resolve("app")), ...libFiles];
ok(sources.length > 40, `found source files to scan (got ${sources.length})`);

let scanned = 0;
for (const f of sources) {
  const rel = path.relative(process.cwd(), f);
  const raw = readFileSync(f, "utf8");
  const src = stripComments(raw);
  const code = blankStrings(src); // call detection runs on code only, never prose
  scanned++;

  // Names this file legitimately has in scope: anything imported by name, and
  // anything it declares itself.
  const inScope = new Set();
  // Named imports, INCLUDING alongside a default: `import Comp, { a, b } from …`.
  // Matching only `import {` missed those and produced a false positive on
  // Detail.js, which imports hasBookingCTA exactly that way.
  for (const m of src.matchAll(/import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from/g)) {
    for (const piece of m[1].split(",")) {
      const nm = piece.trim().split(/\s+as\s+/).pop().trim();
      if (nm) inScope.add(nm);
    }
  }
  // DESTRUCTURED FUNCTION PARAMETERS — `function C({ openExternal, logEvent })`
  // and `({ a, b }) =>`. These are the commonest way a component legitimately has
  // a name in scope, and omitting them made this guard fire on correct code.
  // A guard that fires on correct code gets switched off, which is worse than no
  // guard, so the scope set has to model real scoping, not a convenient subset.
  for (const m of src.matchAll(/(?:function\s*[\w$]*\s*\(|\(\s*)\{([^{}]*)\}\s*(?:\)|,)/g)) {
    for (const piece of m[1].split(",")) {
      const nm = piece.trim().split(":").pop().split("=")[0].replace(/^\.\.\./, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nm)) inScope.add(nm);
    }
  }
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) inScope.add(m[1]);
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) inScope.add(m[1]);
  // Destructured locals, e.g. `const { hasVerifiedTours } = deps`.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const piece of m[1].split(",")) {
      const nm = piece.trim().split(":").pop().trim();
      if (nm) inScope.add(nm);
    }
  }

  for (const [name, modules] of exportedBy) {
    if (inScope.has(name)) continue;
    // A BARE call: the name followed by "(", not preceded by a dot or a word
    // char. `Aff.hasVerifiedTours(` and `myHasVerifiedTours(` both correctly miss.
    const bare = new RegExp("(^|[^\\w$.])" + name + "\\s*\\(", "m");
    if (!bare.test(code)) continue;
    fail.push(
      `${rel} CALLS ${name}() but neither imports nor declares it. ${name} is exported by ${[...modules].join(", ")} — ` +
      "add the import. A bare reference to a name that is not in scope is valid JavaScript until it RUNS, then it is a " +
      "ReferenceError that takes the whole render down (see this guard's header: it shipped to production and read as a 404)."
    );
  }
}
ok(scanned > 40, `scanned ${scanned} files`);

if (fail.length) {
  console.error("check-lib-call-imports: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-lib-call-imports: OK — ${pass} assertions, ${scanned} files scanned against ${exportedBy.size} lib export names (no component calls a lib function it does not import)`);
