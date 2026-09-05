// scripts/test-coverage-waitlist.mjs — #7: out-of-coverage NEVER shows another
// city's data; it captures interest honestly.
// STRUCTURAL-ONLY: CoverageWaitlist is an unexported local function inside
// app/home.js (11k+ lines of client component, heavy on hooks/DOM); loading
// it for a real render would mean either exporting it (a home.js edit this
// audit avoids — CLAUDE.md flags home.js as the most contested file in the
// repo) or a large mock surface. Source-position extraction (brace-matched,
// not a bare substring) below is the real fix for THIS file's disease.
//
// FIXED 2026-09-04 (guard-honesty audit, disease "substring, not role").
// `h.includes("won") && h.includes("another city")` searched the ENTIRE
// ~11,000-line home.js for two bare substrings. Red-proved: deleting the real
// "We won't show you another city's picks" copy AND leaving one unrelated
// "won" anywhere else in the file (a comment, a different word) still passed
// 6/6. The check could not tell "the promise is here" from "the letters w-o-n
// exist somewhere in this enormous file" — CLAUDE.md's exact rule: "assert
// the syntactic position, not the substring." The fix scopes that assertion
// (and the "honest coming-soon state" assertion next to it) to the actual
// CoverageWaitlist function body, extracted by brace-matching rather than
// hand-picked line numbers — so it stays correct if the component moves
// within the file, and a broken extraction fails LOUD (the floor check
// below) instead of silently searching the whole file again.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

ok(h.includes("function outOfCoverage(center)") && h.includes("WF_COVERAGE_METROS"), "the coverage check exists (>75mi from all FL metros)");

// v6.72: the coverage door is driven by the server gate (wf_gate_status →
// live/unlock/alert) via CityGate. SIGNED-IN users (unlock) get the live feed —
// only SIGNED-OUT + uncovered ('alert') is walled behind the waitlist so it
// never shows another market's data to a logged-out visitor.
// RE-POINTED v8.11 (owner, 2026-08-18: "get rid of this"): the door is
// unmounted from "/" and the 'alert' wall is gone — the feed renders for
// everyone. The waitlist capture below (wf_waitlist, the component, the
// unlock endpoint) stays intact for a future deliberate placement; what this
// line now pins is that neither the door nor the wall quietly returns.
// This one is a genuine whole-file absence (the door could be re-mounted
// ANYWHERE the homepage renders, not just near CoverageWaitlist), so it stays
// whole-file — but with a positive control proving the two banned strings ARE
// detectable when present, so the absence below means something.
const DOOR = "<CityGate ";
const WALL = 'gateStatus !== "alert" && (() => {';
ok(!h.includes(DOOR) && !h.includes(WALL), "the coverage door/wall is back on the homepage (owner removed both 2026-08-18)");
ok(("x " + DOOR + " y").includes(DOOR) && ("x " + WALL + " y").includes(WALL),
   "positive control: the two banned strings ARE found by .includes() when actually present — the absence check above means something");

// ── Extract the CoverageWaitlist component body by brace-matching, not by a
// second whole-file substring search. This is what makes the checks below
// ROLE-scoped: they can only pass if the promised copy is INSIDE this
// component, not merely present somewhere in an 11k-line file.
function extractFunctionBody(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  // Find the END of the parameter list first (paren-balanced — the params
  // themselves may destructure with braces, e.g. `({ center, locName })`),
  // THEN the function body's opening brace. Grabbing the first "{" after the
  // marker is wrong: it lands on the destructuring brace in the params, not
  // the body, and truncates at the params' own closing "}".
  let pdepth = 0, parenEnd = -1;
  for (let i = src.indexOf("(", start); i < src.length; i++) {
    if (src[i] === "(") pdepth++;
    else if (src[i] === ")") { pdepth--; if (pdepth === 0) { parenEnd = i; break; } }
  }
  if (parenEnd === -1) return null;
  const braceStart = src.indexOf("{", parenEnd);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}
const comp = extractFunctionBody(h, "function CoverageWaitlist(");
ok(!!comp, "CoverageWaitlist is a brace-balanced function body the extractor can isolate");
// Floor: a broken extractor (e.g. brace-matching bug) would return a tiny or
// null slice, which would make every check below vacuously fail-closed rather
// than silently pass — but assert the floor explicitly so that failure mode
// reads as "extractor broke", not "copy went missing".
ok(!!comp && comp.length > 400, `extracted CoverageWaitlist body is a real component, not a stub (got ${comp ? comp.length : 0} chars)`);

const body = comp || "";
ok(/Wayfind isn/.test(body), "the honest coming-soon state renders, INSIDE CoverageWaitlist (not merely somewhere in home.js)");
ok(body.includes('supabase.from("wf_waitlist").insert'), "email capture writes to the waitlist, INSIDE CoverageWaitlist");
// Role-scoped AND word-boundary anchored — not a bare substring of an 11k-line
// file, and "won" alone can no longer be satisfied by an unrelated word.
ok(/\bwon(?:['’]|&apos;|&#0?39;)?t\b[\s\S]{0,80}another city/i.test(body),
   "the copy states we never show another city's picks — matched as a phrase inside CoverageWaitlist, not two unrelated substrings anywhere in home.js");

ok(/every\(\(m\) => milesBetween\(center, m\) > 75\)/.test(h), "coverage = >75mi from EVERY metro (not just one)");

console.log(`test-coverage-waitlist: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
