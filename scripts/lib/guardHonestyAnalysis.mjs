// scripts/lib/guardHonestyAnalysis.mjs — shared static-analysis engine
// originally built for the 2026-09-04 guard-honesty audit
// (docs/audits/guard-honesty-2026-09-04.md, branch ship/audit-trio-2026-09-04)
// and its meta-guard scripts/check-guard-honesty.mjs. Ported verbatim (byte-
// for-byte, no logic changes) into this branch so the MACHINE-READABLE GUARD
// REGISTRY (scripts/lib/build-guard-registry.mjs, scripts/lib/guard-registry.json)
// and its CI check (scripts/check-guard-registry.mjs) reuse the SAME
// CALL/RENDER/STRUCTURAL classification and assertion analysis rather than
// re-implementing it — so the registry and the (separate, not-yet-merged)
// honesty audit never drift into answering slightly different questions
// about the same file. If/when ship/audit-trio-2026-09-04 merges, this file
// should be reconciled (byte-diffed) against that branch's copy, not
// duplicated a second time.
//
// This is deliberately NOT a full parser. It approximates three properties
// CLAUDE.md names as the recurring disease shapes:
//   1. does the file actually EXECUTE anything (import lib/app, render, or
//      spawn a child process) — or is it pure regex-over-source that never
//      says so?
//   2. does every "X does not appear" check sit next to a proof that the
//      probe CAN find X (a positive control) — or is the absence unproven?
//   3. does at least one assertion's SUBJECT come from a value code actually
//      RETURNED — or could every assertion in the file pass against dead code?
// Like any static heuristic it has false positives and false negatives; both
// check-guard-honesty.mjs and the audit report say so rather than presenting
// it as a formal verifier.
import { readFileSync } from "node:fs";

// A minimal JS TOKEN WALKER — not a parser, but it must know the FOUR things
// that make naive quote-scanning wrong: line comments, block comments,
// string/template literals, and REGEX LITERALS. Missing regex literals was a
// real bug here: a pattern like `/^["']|["']$/g` (this file's own dotenv
// value-unquoting regex, and check-supabase-key-live.mjs's) contains a bare
// `"` inside a character class. A walker that treats every `"`/`'` as a
// string delimiter — regardless of context — starts "a string" right there,
// desyncing every position after it for the rest of the file: paren-balance
// in findAssertionCalls went from "many ok() calls found" to "1", which
// silently hid a well-built guard's real assertions from this analyzer. The
// classic regex-vs-division ambiguity is resolved with the standard
// heuristic: a "/" is a regex start unless the last significant token was a
// value (identifier, number, closing `)`/`]`/`}`, or a value keyword).
const NOT_REGEX_BEFORE = /[\w$\])]$|\b(?:this|super)$/;
function tokenize(src, onToken) {
  let i = 0;
  const n = src.length;
  let lastSig = ""; // last significant (non-whitespace, non-comment) text seen
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      onToken("comment", i, j, src.slice(i, j));
      i = j;
    } else if (c === "/" && c2 === "*") {
      let j = src.indexOf("*/", i + 2);
      if (j === -1) j = n; else j += 2;
      onToken("comment", i, j, src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        j++;
      }
      onToken("string", i, j, src.slice(i, j));
      lastSig = ")"; // a string is a VALUE — same regex-disambiguation role as `)`
      i = j;
    } else if (c === "/" && !NOT_REGEX_BEFORE.test(lastSig)) {
      // Candidate regex literal. Scan to a closing unescaped "/", respecting
      // character classes (`/` inside `[...]` does not close the regex).
      let j = i + 1, inClass = false, closed = false;
      while (j < n) {
        const cj = src[j];
        if (cj === "\\") { j += 2; continue; }
        if (cj === "\n") break; // a regex literal cannot span a line — bail, it wasn't one
        if (cj === "[") inClass = true;
        else if (cj === "]") inClass = false;
        else if (cj === "/" && !inClass) { j++; closed = true; break; }
        j++;
      }
      if (closed) {
        while (j < n && /[a-z]/i.test(src[j])) j++; // flags
        onToken("regex", i, j, src.slice(i, j));
        lastSig = ")"; // a regex literal is also a VALUE
        i = j;
      } else {
        onToken("code", i, i + 1, c); // division or malformed — treat as one char of code
        lastSig = c;
        i++;
      }
    } else {
      onToken("code", i, i + 1, c);
      if (!/\s/.test(c)) lastSig = (lastSig + c).slice(-8);
      i++;
    }
  }
}

// Comments only (KEEPS string AND regex literals intact, including import
// specifiers — stripping those too was an early bug in this file: it
// blanked the exact `"../lib/foo.js"` text that import detection needs to
// see, so every guard in the repo read as "no lib/app import", including
// ones that plainly do).
export function stripComments(src) {
  let out = "";
  tokenize(src, (kind, start, end, text) => {
    out += kind === "comment" ? text.replace(/[^\n]/g, " ") : text;
  });
  return out;
}

// Comments AND string-literal CONTENTS blanked (quotes kept, so positions/
// length are stable), regex literals left INTACT — for scanning where source
// appears as CODE, not as a UI label or a comment. This is what CLAUDE.md's
// check-lib-call-imports postmortem calls "prose is not code: blank string
// contents before scanning for calls" (ui.js's `"devices (first-party)"`
// label, eventMap.js's `"last 5 minutes"` string, both misread as real calls
// before this rule) — regex literals are kept as real syntax, not blanked,
// because their delimiters and flags are part of the CODE, not prose.
export function stripCommentsAndStrings(src) {
  let out = "";
  tokenize(src, (kind, start, end, text) => {
    if (kind === "comment") { out += text.replace(/[^\n]/g, " "); return; }
    if (kind === "string") {
      const quote = text[0];
      const inner = text.slice(1, -1).replace(/[^\n]/g, " ");
      const closer = text.length > 1 ? text[text.length - 1] : "";
      out += quote + inner + closer;
      return;
    }
    out += text; // code and regex pass through verbatim
  });
  return out;
}

const RENDER_RX = /\bjsxLoad\b|\bloadComponent\s*\(|ReactDOMServer|renderToStaticMarkup|renderToString|\bpuppeteer\b|\bplaywright\b|\bJSDOM\b/;
const CHILDPROC_RX = /\bchild_process\b|\bspawnSync\s*\(|\bexecSync\s*\(|\bexecFileSync\s*\(|\bspawn\s*\(|\bfork\s*\(|\bexeca\s*\(/;
const LIBAPP_IMPORT_RX = /(?:from|require\()\s*["']((?:\.{1,2}\/)+(?:lib|app)\/[^"']*|(?:lib|app)\/[^"']*)["']/;
const DYNAMIC_IMPORT_LIBAPP_RX = /\bimport\s*\(\s*[^)]*["']((?:\.{1,2}\/)+(?:lib|app)\/[^"']*|(?:lib|app)\/[^"']*)["']/;
// A handful of guards (e.g. test-book-it.mjs) copy a lib/ file into a temp
// dir first (so a rewritten/stubbed copy can be imported under plain node)
// and then `await import()` THAT path — the specifier never contains "lib/"
// or "app/" literally. Treat "reads lib/ or app/ source AND dynamically
// imports something" as executing real code too; it is a real load-bearing
// CALL of the copied module, not a regex over it.
const READS_LIBAPP_SOURCE_RX = /\breadFileSync\s*\([^)]*["'`](?:\.{1,2}\/)*(?:lib|app)\/[^"'`]*["'`]|\bcopyFileSync\s*\([^)]*["'`](?:\.{1,2}\/)*(?:lib|app)\/[^"'`]*["'`]/;
const ANY_DYNAMIC_IMPORT_RX = /\bimport\s*\(/;

export function detectCapabilities(rawSrc) {
  // Import specifiers live INSIDE string literals by definition, so
  // capability detection runs on comments-stripped-only source. Everything
  // else (assertion-content analysis) runs on the fully-stripped version.
  const importScanCode = stripComments(rawSrc);
  const code = stripCommentsAndStrings(rawSrc);
  const hasLibAppImport = LIBAPP_IMPORT_RX.test(importScanCode) || DYNAMIC_IMPORT_LIBAPP_RX.test(importScanCode)
    || (READS_LIBAPP_SOURCE_RX.test(importScanCode) && ANY_DYNAMIC_IMPORT_RX.test(importScanCode));
  const hasRenderHarness = RENDER_RX.test(code);
  const hasChildProcessExec = CHILDPROC_RX.test(code);
  const canExecute = hasLibAppImport || hasRenderHarness || hasChildProcessExec;
  const first20 = rawSrc.split("\n").slice(0, 20).join("\n");
  const hasStructuralOnlyTag = /\/\/\s*STRUCTURAL-ONLY\s*:/.test(first20);
  return { code, importScanCode, hasLibAppImport, hasRenderHarness, hasChildProcessExec, canExecute, hasStructuralOnlyTag };
}

// Names that get real values bound to them by an import/dynamic-import/await
// import from a local lib/app module, OR from a render call — i.e. names
// whose invocation in an assertion counts as "the subject is a RETURNED
// value" rather than a source string.
export function boundCallableNames(code) {
  const names = new Set();
  // import { a, b as c } from "..."   /  import a from "..."   /  import * as ns
  const importRe = /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s+([A-Za-z_$][\w$]*))?\s*from\s*["'][^"']+["']/g;
  let m;
  while ((m = importRe.exec(code))) {
    if (m[1]) names.add(m[1]);
    if (m[3]) names.add(m[3]);
    if (m[2]) {
      for (const part of m[2].split(",")) {
        const piece = part.trim();
        if (!piece) continue;
        const asMatch = piece.match(/as\s+([A-Za-z_$][\w$]*)/);
        names.add(asMatch ? asMatch[1] : piece.split(/\s+/)[0]);
      }
    }
  }
  // const { a, b } = await import("...")   /  const mod = await import("...")
  const dynRe = /(?:const|let|var)\s*(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))\s*=\s*await\s+import\s*\(/g;
  while ((m = dynRe.exec(code))) {
    if (m[1]) { for (const part of m[1].split(",")) { const piece = part.trim().split(":").pop().trim(); if (piece) names.add(piece.split(/\s+/)[0]); } }
    if (m[2]) names.add(m[2]);
  }
  // render/exec helpers whose OUTPUT is what an assertion should inspect —
  // child-process execution is the third recognized "canExecute" mechanism
  // alongside lib/app imports and render harnesses (check-locks.mjs is a
  // real, working guard whose only "call" is git via execSync — nothing
  // here comes from a lib/app import, so without this it read as zero
  // returned-value assertions despite genuinely running git and branching
  // on its output).
  for (const n of ["renderToStaticMarkup", "renderToString", "loadComponent", "execSync", "spawnSync", "execFileSync"]) names.add(n);
  return names;
}

// Find top-level "assertion calls": ok(...), assert(...), expect(...), fail
// guarded ifs (`if (!X) fail(...)`). Returns [{argsText, start, end}] where
// argsText is the raw text of the call's arguments (paren-balanced).
// The overwhelmingly common name is `ok`, but several strong guards define
// their own 2- or 3-argument helper under a different name — `eq` (compares
// two values), `w`, `check` — and this repo does not standardize it. Detect
// the DEFINITION (`const NAME = (c, m) => {`, `const NAME = (a, b, m) => {`)
// per file rather than hardcoding a name list, so a guard is read by its own
// convention instead of penalized for not matching someone else's.
function customAssertionHelperNames(code) {
  const names = new Set();
  // Require AT LEAST TWO parameters (a comma in the param list) — the real
  // convention here is always (condition, message) or (actual, expected,
  // message). Without this, a one-arg wrapper like `const sh = (cmd) => {...}`
  // (check-locks.mjs's execSync wrapper) matched too, and every CALL SITE of
  // "sh" was misread as an assertion — which then hid the file's real
  // assertions (a plain `if (x) { console.error(...); process.exit(1); }`
  // with no `fail(` call) from the "zero assertions found at all" fallback
  // path, because findAssertionCalls no longer reported zero.
  const defRx = /const\s+([A-Za-z_$][\w$]*)\s*=\s*\([^),]+,[^)]*\)\s*=>/g;
  let m;
  while ((m = defRx.exec(code))) {
    const name = m[1];
    if (name.length <= 6 && !["const", "read", "walk", "call", "load"].includes(name)) names.add(name);
  }
  return names;
}

export function findAssertionCalls(code) {
  const calls = [];
  // node:assert/strict's `assert.equal(...)` / `assert.deepEqual(...)` /
  // `assert.strictEqual(...)` shape is a real, common assertion idiom in this
  // repo (test-event-category-art.mjs and 9 others) that a bare
  // `\b(ok|assert|expect)\(` never matches — "assert" is followed by "."
  // there, not "(". Missing it made several genuinely strong CALL guards
  // read as having zero assertions at all. Same for a file's own differently-
  // named helper (`eq`, `w` — test-sync-reconcile.mjs defines `eq(a,b,m)`).
  const custom = [...customAssertionHelperNames(code)].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const CALLEE_RX = new RegExp("\\b(ok|assert(?:\\.\\w+)?|expect" + (custom.length ? "|" + custom.join("|") : "") + ")\\s*\\(", "g");
  let m;
  while ((m = CALLEE_RX.exec(code))) {
    const open = CALLEE_RX.lastIndex - 1;
    let depth = 0, i = open;
    for (; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") { depth--; if (depth === 0) break; }
    }
    calls.push({ callee: m[1], argsText: code.slice(open + 1, i), start: m.index, end: i });
  }
  // `if (!X) fail(...)` / `if (X) fail(...)` STRUCTURAL guards' own idiom —
  // the condition IS the assertion even though it never calls ok()/assert().
  const IF_FAIL_RX = /if\s*\(([^;{}]*?)\)\s*(?:\{[^{}]*?\bfail\s*\(|fail\s*\()/g;
  while ((m = IF_FAIL_RX.exec(code))) {
    calls.push({ callee: "if-fail", argsText: m[1], start: m.index, end: m.index + m[0].length });
  }
  return calls;
}

// Variables assigned (directly, or one hop via .json()/.text()/a property
// read on something already derived) from a call to a bound name — the
// overwhelmingly common real pattern is `const ranked = rankExperiences(x);`
// followed by SEVERAL assertions on `ranked[0]`, `ranked[i]`, never
// re-typing `rankExperiences(` inside the assertion itself. Missing this
// hop was the single biggest source of false positives in an early version
// of this analyzer — it flagged files like test-rail-score-order.mjs, which
// is about as CALL as a guard gets. Two passes catches the common
// `const r = await GET(...); const { json } = await r.json();` chain.
export function derivedReturnedValueNames(code, boundNames) {
  const derived = new Set();
  const escaped = [...boundNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return derived;
  const callRx = new RegExp("\\b(?:" + escaped.join("|") + ")\\s*\\(");
  const assignRx = /(?:const|let|var)\s*(?:\{([^}]*)\}|(\[[^\]]*\])|([A-Za-z_$][\w$]*))\s*=\s*(?:await\s+)?([^;\n]+)/g;
  const addLhs = (m) => {
    if (m[3]) derived.add(m[3]);
    if (m[1]) for (const part of m[1].split(",")) { const p = part.trim().split(":").pop().trim(); if (p) derived.add(p.split(/\s+/)[0].replace(/[{}]/g, "")); }
    // array destructuring `[a, b]` — best-effort, names only
    if (m[2]) for (const p of m[2].replace(/[[\]]/g, "").split(",")) { const t = p.trim(); if (t) derived.add(t); }
  };
  // Two more real-world shapes beyond a fresh `const X = <call>` declaration:
  //   PLAIN REASSIGNMENT   `html = renderToStaticMarkup(...)`  (declared earlier
  //     with `let html;`, assigned inside a try/catch — very common around a
  //     render call that might throw)
  //   SUBSCRIPT ASSIGNMENT `rendered[label] = html;`            (an accumulator
  //     object keyed by test case, read back later as `rendered[key]` — the
  //     shape test-creator-finds-render-smoke.mjs and siblings use to assert
  //     several rendered variants without re-declaring a variable per case)
  // Missing these made a real RENDER guard that asserts entirely on rendered
  // HTML (stored in exactly this accumulator shape) read as "never asserts on
  // a returned value" — false positive on one of the strongest guards in the
  // suite.
  const reassignRx = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?([^=;\n][^;\n]*)/g;
  const subscriptAssignRx = /\b([A-Za-z_$][\w$]*)\s*\[[^\]]*\]\s*=\s*(?:await\s+)?([^;\n]+)/g;
  // 8 passes: real chains run deep (playwright fixtures alone go
  // chromium -> browser -> page -> loc -> row[name]= -> measured[id]=row,
  // six hops). Each pass is a handful of linear regex scans over one file's
  // source, so even 8 is cheap; too few passes was an earlier false-positive
  // source (test-card-action-row.mjs, a real browser-measurement guard,
  // read as "never asserts on a returned value" because the chain from
  // `chromium.launch()` to the `measured` object it ultimately asserts on
  // is five hops deep and 3 passes stopped two hops short).
  for (let pass = 0; pass < 8; pass++) {
    const allNames = new Set([...boundNames, ...derived]);
    const anyRx = new RegExp("\\b(?:" + [...allNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b");
    let m;
    assignRx.lastIndex = 0;
    while ((m = assignRx.exec(code))) {
      const rhs = m[4] || "";
      if (callRx.test(rhs) || anyRx.test(rhs)) addLhs(m);
    }
    reassignRx.lastIndex = 0;
    while ((m = reassignRx.exec(code))) {
      const lhs = m[1], rhs = m[2] || "";
      if (rhs.trim().startsWith("=")) continue; // was actually `==`
      if (callRx.test(rhs) || anyRx.test(rhs)) derived.add(lhs);
    }
    subscriptAssignRx.lastIndex = 0;
    while ((m = subscriptAssignRx.exec(code))) {
      const lhs = m[1], rhs = m[2] || "";
      // the ACCUMULATOR (`rendered`) becomes derived when what's stored INTO
      // it is itself bound/derived — later `rendered[x]` reads then match.
      if (callRx.test(rhs) || anyRx.test(rhs)) derived.add(lhs);
    }
  }
  return derived;
}

// Rule 3: at least one assertion's argument text references (calls OR reads
// a property/index of) a name that is bound to something code actually
// RETURNED (an imported function invoked, a render call, or a variable
// derived from one), as opposed to every assertion testing only literal
// source text read via readFileSync/regex.
export function hasAssertionOnReturnedValue(code) {
  const names = boundCallableNames(code);
  if (names.size === 0) return false;
  const derived = derivedReturnedValueNames(code, names);
  const all = new Set([...names, ...derived]);
  const rx = new RegExp("\\b(?:" + [...all].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b");
  const calls = findAssertionCalls(code);
  for (const { argsText } of calls) {
    if (rx.test(argsText)) return true;
  }
  // Fallback for guards that don't use the ok()/assert()/if-fail idiom at
  // all (a manual `bad++` counter + console.log + process.exit(bad?1:0) is
  // common in this repo — check-dupes.mjs is one). If the file never uses a
  // recognized assertion shape, judging it by "no assertion referenced a
  // returned value" would be the analyzer's own gap, not the guard's — so
  // fall back to: does a bound/derived name appear in ANY comparison or
  // conditional in the whole file? That is still "the subject is a returned
  // value", just not wrapped in ok()/assert().
  if (calls.length === 0) {
    const condRx = new RegExp("\\b(?:" + [...all].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b[^;\\n]{0,40}(?:===|!==|==|!=|>=|<=|>|<|\\.length)|(?:if|while)\\s*\\([^)]*\\b(?:" + [...all].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b");
    if (condRx.test(code)) return true;
  }
  return false;
}

// Rule 2: absence checks (`!X.test(...)`, `!....includes(...)`, `.not.toContain`,
// `toBeFalsy`) paired with SOME evidence the probe is provably reachable —
// either the identical pattern is exercised elsewhere in the file (a
// same-file positive control), or the file says so in prose near an
// assertion (the "positive control" / "known-good" idiom already used across
// this repo). Returns the list of absence checks that have NO such evidence.
// A "test/includes" occurrence: which VARIABLE is being tested (the
// ARGUMENT — e.g. `.test(cache)`, `.includes(code)`), whether negated.
// Deliberately does NOT try to parse the PATTERN doing the testing (a regex
// literal can contain nested character classes/alternations/quantifiers —
// e.g. this very file's own `[\s\S]{0,80}another city` — and an early
// version of this matcher tried to capture that as part of the match,
// which pathologically backtracked on exactly that shape and hung the
// analyzer on its own source). Only simple identifier/property arguments
// are matched (`.test(cache)`, not `.test(cache.slice(0,10))`) — good
// enough for the common "does source X contain/not-contain this" shape
// these guards actually use; anything fancier is simply not classified
// (neither flagged nor cleared), which is the safe direction to be wrong in.
const CALL_ARG_RX = /\.(test|includes)\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\)/g;

// Walk BACKWARD (character-by-character, no regex — nothing here can
// backtrack) from the "." that starts ".test(" / ".includes(" to find where
// its SUBJECT begins, so negation-detection can look for a "!" immediately
// before the subject rather than immediately before the dot. The subject is
// either an identifier/property chain (`code`, `h.foo`) or a regex literal
// (`/pattern/gi`) — this codebase's guards use both as `.test()`'s receiver.
function subjectStart(text, dotPos) {
  let i = dotPos - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return dotPos;
  if (/[A-Za-z0-9_$]/.test(text[i])) {
    // identifier/property chain: walk back over word chars and single dots
    while (i >= 0 && (/[A-Za-z0-9_$]/.test(text[i]) || (text[i] === "." && /[A-Za-z0-9_$]/.test(text[i - 1] || "")))) i--;
    return i + 1;
  }
  // regex literal: skip trailing flag letters, then find the CLOSING "/",
  // then walk back to the matching (non-escaped) OPENING "/".
  while (i >= 0 && /[a-z]/i.test(text[i])) i--;
  if (i < 0 || text[i] !== "/") return dotPos; // not a recognizable regex literal
  i--; // now inside the regex body, scanning backward from just before the closing "/"
  while (i >= 0) {
    if (text[i] === "/" && text[i - 1] !== "\\") return i; // opening "/"
    i--;
  }
  return dotPos;
}

function scanOccurrences(text) {
  const out = [];
  CALL_ARG_RX.lastIndex = 0;
  let m;
  while ((m = CALL_ARG_RX.exec(text))) {
    const start = subjectStart(text, m.index); // m.index is the "." itself (CALL_ARG_RX starts with \.)
    const before = text.slice(Math.max(0, start - 4), start);
    const negated = /!\s*$/.test(before) && !/!==\s*$|!=\s*$/.test(before);
    out.push({ method: m[1], subject: m[2], negated });
  }
  return out;
}

// Whether a given occurrence, in a call of the given callee shape, is an
// ABSENCE claim ("this must NOT be found") as opposed to a PRESENCE claim
// ("this must be found"):
//   ok(...)/assert(...) fails when its condition is FALSE, so passing means
//     the condition is true. `ok(!X.test(s), m)` passes only when X is
//     absent -> absence claim. `ok(X.test(s), m)` passes only when X is
//     present -> presence claim.
//   `if (cond) fail(...)` fails (build stops) when cond is TRUE, so passing
//     (build continues) means cond is false — the INVERSE polarity of ok().
//     `if (!X.test(s)) fail(...)` — passing requires X PRESENT (fail on
//     missing) -> presence claim, not absence. `if (X.test(s)) fail(...)` —
//     passing requires X ABSENT (fail on found) -> absence claim.
// Conflating these two shapes was an early bug in this analyzer: it read
// EVERY `if (!X.test(...)) fail("missing Y")` — the single most common guard
// idiom in this repo, a PRESENCE requirement — as an unproven absence claim,
// which would have made the meta-guard reject nearly every existing guard.
function isAbsenceClaim(negated, calleeKind) {
  return calleeKind === "if-fail" ? !negated : negated;
}

export function unprovenAbsenceChecks(code) {
  const calls = findAssertionCalls(code);
  // Two file-wide fallback signals, both real evidence a probe is proven
  // reachable rather than assumed: (a) explicit prose naming the control,
  // matching this repo's own established idiom; (b) the pattern is ALSO
  // exercised, non-negated, against a STRING-LITERAL fixture anywhere in the
  // file — e.g. `ok(/pattern/.test("a literal example that should match"), ...)`.
  // (b) is deliberately file-wide rather than per-subject: CALL_ARG_RX only
  // captures identifier-shaped arguments (matching a regex literal's content
  // to find the "same" pattern used against both a real variable and a
  // literal risks the exact catastrophic-backtracking shape this file's
  // history section above already hit once), so a literal-fixture control
  // anywhere is treated as this file having demonstrated the discipline.
  const hasProseControl = /positive control|known[- ]good|sanity check|control fixture/i.test(code);
  const hasLiteralFixtureControl = /\.(?:test|includes)\(\s*["'`]/.test(code);
  const hasFileWideControl = hasProseControl || hasLiteralFixtureControl;
  // Scan each call's occurrences ONCE (not O(calls^2) regex re-scans).
  const perCall = calls.map((call) => ({ call, occ: scanOccurrences(call.argsText) }));
  const out = [];
  for (const { call, occ } of perCall) {
    let flagged = false;
    for (const o of occ) {
      if (flagged) break;
      if (!isAbsenceClaim(o.negated, call.callee)) continue;
      let hasSameFileControl = hasFileWideControl;
      for (const other of perCall) {
        if (other.call === call) continue;
        for (const oo of other.occ) {
          if (oo.subject !== o.subject) continue;
          if (!isAbsenceClaim(oo.negated, other.call.callee)) { hasSameFileControl = true; break; }
        }
        if (hasSameFileControl) break;
      }
      if (!hasSameFileControl) { out.push(call); flagged = true; }
    }
  }
  return out;
}

export function analyzeGuardFile(absPath) {
  const raw = readFileSync(absPath, "utf8");
  const caps = detectCapabilities(raw);
  const violations = [];
  if (!caps.canExecute && !caps.hasStructuralOnlyTag) {
    violations.push("no import of lib/ or app/, no render harness, no child-process exec — and no `// STRUCTURAL-ONLY: <reason>` declaration in the first 20 lines");
  }
  const unproven = unprovenAbsenceChecks(caps.code);
  if (unproven.length > 0) {
    violations.push(`${unproven.length} absence assertion(s) with no positive control in the same file (e.g. "${unproven[0].argsText.slice(0, 80).trim()}")`);
  }
  if (caps.canExecute && !hasAssertionOnReturnedValue(caps.code)) {
    violations.push("has a real import/render/exec capability but zero assertions whose subject is a value RETURNED by code — every check reads source text only");
  }
  return { path: absPath, raw, ...caps, unproven, violations, isClean: violations.length === 0 };
}
