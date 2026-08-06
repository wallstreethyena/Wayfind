#!/usr/bin/env node
/**
 * check-home-location — the visitor can always read WHERE "near you" is.
 *
 * THE BUG THIS PINS, measured on production at a real 390px viewport (not a
 * resized desktop window — see CLAUDE.md on why that distinction is load-bearing):
 *
 *     .wf-topbar-row width            362px
 *     .wf-wordmark   (fixed sprite)   154px   flex-shrink:0
 *     weather button                   71px   flex-shrink:0
 *     Sign in pill                     86px   flex-shrink:0
 *     -> left for "· Parrish, FL"      23px   of the 72px it needs
 *
 * So the header rendered a bare "· …" and the app never told anyone which town
 * it was answering for. Still clipped at 430px (63/72), i.e. on every phone
 * sold. The owner's report that produced the Near-me button was "I got stuck
 * looking around and had no idea where I was" — that button shipped while the
 * label naming the place stayed invisible.
 *
 * IT IS NOT A TUNING PROBLEM, which is the reason this guard asserts STRUCTURE
 * rather than a pixel budget. Measured on the live DOM: trimming the weather to
 * icon+temp freed 16px (39/72), and additionally shrinking the brand sprite 20%
 * reached only 69/72 — still short, for a SHORT name. "St. Petersburg, FL"
 * needs 118px and "Lakewood Ranch, FL" more. A variable-length city name cannot
 * share a row with a fixed 154px sprite and two fixed controls in 362px, at any
 * setting. The fix is the only one that scales: its own full-width line.
 *
 * WHY A LAYOUT BUG GETS A STRUCTURAL GUARD. Node cannot lay out CSS — jsdom has
 * no layout engine, so no assertion here can measure a width honestly. Rather
 * than fake it with a regex over pixel values and call that proof, this asserts
 * the one thing that actually caused the failure and that a future edit could
 * plausibly undo: the location is NOT a child of the constrained top row. That
 * is falsifiable and it is the real invariant. The pixel evidence above came
 * from the browser and is recorded here as evidence, not re-derived as a test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
let pass = 0;
const fail = (m) => { console.error("check-home-location: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const HOME = read("app/home.js");

/* Comments are stripped before every position check. A guard that reads raw
   source fails on its own explanatory prose — five separate guards hit exactly
   that on 2026-07-30 (CLAUDE.md), and the comment added above this fix names
   `locName` and `.wf-topbar-row` repeatedly, so this one would have too. */
const CODE = HOME
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ");

/* ── 1. Extract the top row, and PROVE the extraction found something ──────
   Without this control the "locName is absent from the row" assertion below
   would pass vacuously the moment the class name changed — the check would run,
   read nothing, and report a truthful answer to the wrong question. */
const rowStart = CODE.indexOf('className="wf-topbar-row"');
ok(rowStart !== -1,
   'the .wf-topbar-row element still exists in app/home.js — if it was renamed, every assertion below is reading nothing and this guard must be re-pointed rather than deleted');

// Walk braces from the row's opening tag to its matching close, so the slice is
// the row's real subtree rather than a fixed number of lines.
const sliceFrom = CODE.lastIndexOf("<div", rowStart);
let depth = 0, end = -1;
for (let i = sliceFrom; i < CODE.length; i++) {
  if (CODE.startsWith("<div", i)) depth++;
  else if (CODE.startsWith("</div>", i)) { depth--; if (depth === 0) { end = i; break; } }
}
ok(end > sliceFrom, "the top row's subtree could be delimited — the brace walk found its closing tag");
const ROW = CODE.slice(sliceFrom, end);
ok(ROW.length > 400,
   `the extracted top row is substantial (${ROW.length} chars), not an empty or truncated slice`);

/* POSITIVE CONTROL: the slice really is the header row. If this fails the slice
   is wrong and the negative assertion below proves nothing. */
ok(/wf-wordmark/.test(ROW),
   "the extracted slice contains the wordmark — confirming it IS the top row and not some other div");
ok(/wf-signin-button|aria-label="Account"/.test(ROW),
   "the extracted slice contains the right-hand control cluster — the other half of the width budget");

/* ── 2. THE INVARIANT: the location does not live in the row that cannot hold it ── */
ok(!/\blocName\b/.test(ROW),
   "the location label is NOT rendered inside .wf-topbar-row. That row is a fixed 154px sprite plus two flex-shrink:0 controls in 362px at 390px, which left the city 23px of the 72px it needed and rendered it as a bare ellipsis. Moving it back here re-breaks it on every phone");

/* ── 3. …and it does still render, on its own line, gated on having a name ── */
const AFTER = CODE.slice(end);
ok(/\blocName\b/.test(AFTER),
   "the location still renders somewhere after the top row — asserting only its ABSENCE would be satisfied by deleting it outright, which is the opposite of the fix");
ok(/screen !== "map" && locName &&/.test(AFTER),
   'the location line is gated on `locName` being present (no empty pin row before geolocation resolves) and hidden on the map screen, which has its own chrome');

/* The whole point is that a long name fits. Anything that re-introduces a
   shared, shrinking row would need one of these; none may appear on this line. */
const locLine = (AFTER.match(/screen !== "map" && locName &&[\s\S]{0,900}/) || [""])[0];
ok(locLine.length > 200, "the location line's JSX was located for inspection");
ok(!/flexShrink:\s*0[\s\S]{0,120}wordmark/.test(locLine),
   "the location line does not share a flex row with the fixed-width wordmark sprite");
ok(/whiteSpace: "nowrap"[\s\S]*textOverflow: "ellipsis"/.test(locLine),
   "an over-long name still degrades gracefully with an ellipsis rather than wrapping the header to two lines — the line is full-width, so this is now a last resort instead of the normal case");

console.log(`check-home-location: OK — ${pass} assertions; the location renders on its own full-width line and is proven ABSENT from the ${ROW.length}-char top row whose 362px budget is fully consumed by a 154px sprite and two flex-shrink:0 controls (measured on production at 390px, not resized desktop)`);
