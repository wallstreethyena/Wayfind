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
const wordCount = (value) => (value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
let decks = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/deck:\s*"([^"]+)"/g)) {
    decks += 1;
    const deck = match[1].trim();
    const words = wordCount(deck);
    const label = `${file}: \"${deck}\"`;
    ok(words >= 5 && words <= 8, `${label} has ${words} words; rail decks require 5–8`);
    ok(deck.length <= 58, `${label} has ${deck.length} characters; maximum is 58`);
    ok(!/[—;:]/.test(deck), `${label} uses clause/list punctuation; keep one simple read`);
    ok(!/\b(?:not|never|no)\b/i.test(deck), `${label} is a disclaimer; state the positive promise`);
    ok((deck.match(/[.!?]/g) || []).length === 1 && /[.!?]$/.test(deck), `${label} must be exactly one sentence`);
    ok(!/\d/.test(deck), `${label} states a count; rail navigation owns counts`);
  }

  for (const match of source.matchAll(/\{[^{}]*title:\s*"([^"]+)"[^{}]*deck:\s*"([^"]+)"[^{}]*\}/gs)) {
    const title = match[1].trim().toLowerCase();
    const deck = match[2].trim().toLowerCase();
    ok(title !== deck && !deck.includes(title), `${file}: deck repeats its rail title: \"${match[2]}\"`);
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
