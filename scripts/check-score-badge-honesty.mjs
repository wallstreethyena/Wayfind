#!/usr/bin/env node
/**
 * check-score-badge-honesty — a badge labelled WAYFIND shows the WAYFIND SCORE.
 *
 * THE BUG (live and indexed until 2026-08-16). lib/landing.js rendered
 *
 *     {p.rating != null ? p.rating : "—"}   …   WAYFIND
 *
 * i.e. Google's raw 5-star number under our own brand name, with no
 * denominator, on /things-to-do/[city] and /restaurants/[city] — pages whose
 * own copy says "verified and ranked from live review data". The homepage
 * showed 9.6/10 for the same venue. One place rendered "5 WAYFIND", which
 * reads as a perfect Wayfind Score and was a 5.0 Google rating on 12 reviews
 * (governed: 8.2/10).
 *
 * This is the governing law of lib/wayfindScore.js — "shown == sorted", one
 * displayed score everywhere — violated at the point of display.
 *
 * HOW THIS ASSERTS IT, in two layers, because either alone is weak:
 *
 *   1. EXECUTED. It runs the real pipeline and proves a 4.8 becomes 9.6, not
 *      4.8. A structural check alone would pass on a badge that called the
 *      right functions and printed the wrong variable.
 *   2. STRUCTURAL. It proves no template puts a bare `.rating` in the badge,
 *      because the arithmetic being right does not stop someone rendering the
 *      other number next to it.
 */
import { readFileSync } from "node:fs";
import { wayfindScore, governedWayfindScore } from "../lib/wayfindScore.js";
import { toDisplayScore } from "../lib/score.js";

let pass = 0;
const fail = (m) => { console.error("check-score-badge-honesty: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

/* ── 1. EXECUTE the pipeline ───────────────────────────────────────────── */
const shown = (rating, reviews) => {
  const q = wayfindScore(rating, reviews);
  return q == null ? null : toDisplayScore(governedWayfindScore(q, { hasCreatorVideo: false, distanceMi: null, trending: false }));
};

const four8 = shown(4.8, 3200);
ok(four8 != null && four8 > 5,
  `a 4.8-star place must display a WAYFIND SCORE on the 0-10 scale, not the star (got ${four8}). This is the exact number the live page printed as "4.8 WAYFIND".`);
ok(Math.abs(four8 - 4.8) > 1,
  `the displayed score (${four8}) must not equal the raw star rating (4.8) — if these coincide the badge is unfalsifiable and the bug is undetectable`);

// Thin review volume must pull a perfect star DOWN. "5 WAYFIND" was the worst
// instance of the bug precisely because 5.0 reads as a perfect score.
const five = shown(5.0, 12);
ok(five != null && five < 10,
  `a 5.0-star place on 12 reviews must not display as a perfect score (got ${five}) — review depth is part of the governed score`);
ok(five < shown(4.8, 3200),
  `12 reviews at 5.0 (${five}) must rank BELOW 3200 reviews at 4.8 (${four8}) — otherwise the badge rewards thin evidence`);

// A null base score stays null. Coercing to 0 renders a fake red 0.1/10.
ok(shown(null, 0) === null, "an unrated place yields null, never 0 — a coerced zero prints a fake 0.1/10 (CLAUDE.md)");

/* ── 2. STRUCTURAL: no template prints the raw star in the badge ───────── */
const SURFACES = ["lib/landing.js", "app/components/PaidLanding.js", "app/components/IconicPlaceCard.js", "app/components/RankedExperiencePage.js"];
let checked = 0;
for (const rel of SURFACES) {
  let src;
  try { src = readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { continue; }
  checked++;
  // Find every WAYFIND badge and look at the 400 chars before it — the value
  // it prints. A bare `p.rating`/`place.rating` there is the bug.
  for (const m of src.matchAll(/>WAYFIND</g)) {
    const before = src.slice(Math.max(0, m.index - 700), m.index);
    const bareRating = /\{\s*\w+\.rating\s*!=\s*null\s*\?\s*\w+\.rating\s*:/.test(before);
    ok(!bareRating,
      `${rel} renders a bare .rating inside a badge labelled WAYFIND — that is Google's 5-star number under our brand. Route it through toDisplayScore(governedWayfindScore(wayfindScore(...))) as the homepage does.`);
    ok(/toDisplayScore|governedWayfindScore|_shown/.test(before),
      `${rel}'s WAYFIND badge does not reach the governed score — whatever it prints, it is not the Wayfind Score`);
  }
}
ok(checked >= 2, `PROBE: at least two score-bearing surfaces were read (got ${checked}) — a zero here would make every assertion above vacuous`);

/* ── 3. the scale must be legible ──────────────────────────────────────── */
{
  const landing = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
  ok(/\/10/.test(landing),
    'the landing badge must print its denominator — "9.6" alone is ambiguous against a 5-star world, and the live page shipped zero occurrences of "/10"');
}

/* ── 4. prove the check can fail ───────────────────────────────────────── */
{
  const bug = '<div>{p.rating != null ? p.rating : "—"}<div>WAYFIND</div></div>';
  const before = bug.slice(0, bug.indexOf(">WAYFIND<"));
  ok(/\{\s*\w+\.rating\s*!=\s*null\s*\?\s*\w+\.rating\s*:/.test(before),
    "self-test: the structural probe MUST match the exact shipped bug string, or it is decoration");
  const fixed = '<div>{(() => { const _shown = toDisplayScore(x); return _shown; })()}<div>WAYFIND</div></div>';
  ok(!/\{\s*\w+\.rating\s*!=\s*null\s*\?\s*\w+\.rating\s*:/.test(fixed.slice(0, fixed.indexOf(">WAYFIND<"))),
    "self-test: …and must NOT match the fixed shape, or it fires on correct code");
}

console.log(`check-score-badge-honesty: OK — ${pass} assertions across ${checked} surfaces; EXECUTED: 4.8★/3200 -> ${four8}/10, 5.0★/12 -> ${five}/10, unrated -> Score pending`);
