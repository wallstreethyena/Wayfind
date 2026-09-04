#!/usr/bin/env node
/**
 * Owner law (2026-09-04): every visible rail description is one immediate,
 * benefit-led read. Long qualification belongs in ranking code and detail
 * surfaces, not between a rail title and its cards.
 *
 * This scans every literal `deck` in app/ and lib/, so a new rail file is
 * covered automatically. Dynamic collection-page headers are intentionally
 * separate: they describe the whole page, not an individual card rail.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// The law itself lives in lib/railDeckCopy.js so this guard CALLS shared code
// rather than re-encoding the rules it is supposed to be checking.
import { deckProblems, deckWordCount } from "../lib/railDeckCopy.js";

let assertions = 0;
const failures = [];
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};

function sourceFiles(root) {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const allFiles = [...sourceFiles("app"), ...sourceFiles("lib")];
const files = allFiles.filter((file) => /\bdeck\s*:/.test(readFileSync(file, "utf8")));
const wordCount = deckWordCount;

// ── CONTROLS: prove the rules discriminate BEFORE trusting them on real files ──
const GOOD = "Late tables with room to talk.";
ok(deckProblems(GOOD, "Night Out").length === 0,
  `POSITIVE CONTROL: a compliant deck yields zero problems (got ${JSON.stringify(deckProblems(GOOD, "Night Out"))}) — without this, every "no problems" below is equally consistent with rules that catch nothing`);
for (const [bad, expect, why] of [
  ["Too short here.", "length-words", "under five words"],
  ["A deck that simply keeps going and going well past the ceiling.", "length-words", "over eight words"],
  ["Late tables — room to talk.", "clause-punctuation", "an em dash"],
  ["Not the usual tourist traps.", "disclaimer", "a disclaimer"],
  ["Late tables with room. Two sentences.", "not-one-sentence", "two sentences"],
  ["Late tables for 12 hungry people.", "states-a-count", "a count"],
  ["Night out with room to talk.", "repeats-title", "repeating its own title"],
]) ok(deckProblems(bad, "Night out").some((x) => x === expect || x.startsWith(expect + ":")),
  `NEGATIVE CONTROL: ${why} is caught as ${expect} (got ${JSON.stringify(deckProblems(bad, "Night out"))})`);
ok(deckProblems("A".repeat(70) + " b c d e.", "x").some((x) => x.startsWith("length-chars")),
  "NEGATIVE CONTROL: an over-58-character deck is caught");

let decks = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/deck:\s*"([^"]+)"/g)) {
    decks += 1;
    const deck = match[1].trim();
    const label = `${file}: \"${deck}\"`;
    const problems = deckProblems(deck, null);
    ok(problems.length === 0, `${label} breaks the rail-deck copy law: ${problems.join(", ")}`);
  }

  for (const match of source.matchAll(/\{[^{}]*title:\s*"([^"]+)"[^{}]*deck:\s*"([^"]+)"[^{}]*\}/gs)) {
    const title = match[1].trim().toLowerCase();
    const deck = match[2].trim().toLowerCase();
    ok(!deckProblems(match[2], match[1]).includes("repeats-title"), `${file}: deck repeats its rail title: \"${match[2]}\"`);
  }
}

ok(decks >= 70, `only ${decks} literal rail decks found; the governed surface unexpectedly shrank`);

const components = sourceFiles("app").filter((file) => /\{(?:rail\.)?deck\}/.test(readFileSync(file, "utf8")));
for (const file of components) {
  const source = readFileSync(file, "utf8");
  for (const line of source.split(/\r?\n/).filter((value) => /\{(?:rail\.)?deck\}/.test(value))) {
    ok(/className="wf-rail-deck"/.test(line), `${file}: visible rail deck is missing the one-line wf-rail-deck contract`);
  }
}

const css = readFileSync("app/components/css.js", "utf8");
ok(/\.wf-rail-deck\{[^}]*white-space:nowrap[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*\}/s.test(css),
  "wf-rail-deck must stay one visual line with a safe narrow-screen fallback");

if (failures.length) {
  console.error(`check-rail-deck-copy: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`check-rail-deck-copy: OK (${assertions} assertions across ${decks} rail decks)`);
