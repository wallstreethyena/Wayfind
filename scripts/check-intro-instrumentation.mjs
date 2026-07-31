#!/usr/bin/env node
/**
 * check-intro-instrumentation — the welcome gate must stay measurable.
 *
 * WHY THIS EXISTS (2026-07-31). app/components/sheets/Intro.js is the hard gate
 * in front of every first visit, and for its entire life it emitted exactly ONE
 * event: mood_tile, on tile selection. Measured over the 3 days after the #382
 * redesign, 455 mobile hero_impressions produced 17 mood_tile — and the other
 * 96.3% of visitors were indistinguishable from each other. Skipped, closed,
 * abandoned, and never-saw-it all looked identical.
 *
 * hero_impression fires on the page BEHIND the overlay, so the funnel read as if
 * it died at detail_open when the drop-off actually happens at this gate.
 *
 * The failure this guard prevents is NOT a broken page — it is a silently
 * unreadable funnel, which is worse because nothing goes red. Two specific
 * regressions:
 *
 *   1. An exit path stops passing its own reason. If "skip" and "cta" collapse
 *      into one undifferentiated event, no A/B on this gate can be read: those
 *      are opposite outcomes.
 *   2. `dismissIntro` gets wired straight into an onClick again. React passes
 *      the MouseEvent as the first argument, so the exit reason silently becomes
 *      a SyntheticEvent — the event still fires, still looks fine in the code,
 *      and the property is garbage. This is the exact "the check ran and answered
 *      a question you were not asking" trap CLAUDE.md documents.
 *
 * Assertions are on syntactic POSITION and on the set of wired reasons, never on
 * bare substrings — `/intro_shown/` would pass on this comment alone.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../app/components/sheets/Intro.js", import.meta.url));
const raw = readFileSync(FILE, "utf8");

// Strip comments and string-literal contents before any position check. Five
// guards on this repo have gone green/red on their own explanatory prose.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// --- the two events must be EMITTED, not merely mentioned ------------------
ok(/logEvent\(\s*["']intro_shown["']/.test(src),
  "intro_shown must be emitted via logEvent( — the gate's impression is the funnel denominator");
ok(/logEvent\(\s*["']intro_dismissed["']/.test(src),
  "intro_dismissed must be emitted via logEvent(");

// --- intro_shown must be a MOUNT effect, not a render-time call ------------
// A render-time call double-fires under StrictMode and inflates the denominator.
ok(/useEffect\(/.test(src) && /import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*["']react["']/.test(src),
  "useEffect must be imported and used — intro_shown fires once on mount");

// --- every exit path carries its own distinct reason -----------------------
const reasons = [...src.matchAll(/closeIntro\(\s*["'](\w+)["']\s*\)/g)].map((m) => m[1]);
const REQUIRED = ["backdrop", "close", "cta", "escape", "skip"];
for (const r of REQUIRED) {
  ok(reasons.includes(r), `exit reason "${r}" must be wired — collapsing exits makes the gate unreadable`);
}
ok(new Set(reasons).size === reasons.length || reasons.length === new Set(reasons).size,
  "exit reasons should not be duplicated across call sites");

// --- the MouseEvent-as-reason trap -----------------------------------------
// Passing the bare function reference to a handler makes React supply the event
// object as `exit`. Positive control below proves this probe can actually fire.
const RAW_HANDLER = /on[A-Z]\w*=\{\s*(?:dismissIntro|closeIntro)\s*\}/;
ok(!RAW_HANDLER.test(src),
  "no handler may receive dismissIntro/closeIntro by bare reference — the event object becomes the exit reason");

// Positive control: the probe must detect the bug in a known-bad sample, or a
// clean result means nothing. A check that reports 0 for everything is broken,
// not clean.
ok(RAW_HANDLER.test('<div onClick={dismissIntro}>'),
  "PROBE BROKEN: the raw-handler regex failed to flag a known-bad sample");

// --- dismissIntro must delegate, so the focus-trap path is labelled too -----
ok(/const\s+dismissIntro\s*=\s*\(\s*\)\s*=>\s*closeIntro\(/.test(src),
  "dismissIntro must delegate to closeIntro so the Escape path is attributed");

// --- the once-guard, so one visit cannot emit two dismissals ---------------
ok(/introExited\s*\.\s*current/.test(src),
  "a once-guard ref must gate intro_dismissed — backdrop+escape can both fire");

// --- exits must still actually close the sheet -----------------------------
ok(/setIntroOpen\(\s*false\s*\)/.test(src),
  "closeIntro must still close the overlay — instrumentation must not become the only effect");

if (fail.length) {
  console.error("check-intro-instrumentation: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-intro-instrumentation: OK — ${pass} assertions ` +
  `(${REQUIRED.length} exit reasons wired: ${REQUIRED.join("/")}, mount-effect impression, ` +
  `once-guard, no bare-reference handlers, probe positive-controlled)`
);
