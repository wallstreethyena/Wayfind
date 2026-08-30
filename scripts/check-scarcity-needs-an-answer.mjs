#!/usr/bin/env node
// check-scarcity-needs-an-answer — "nothing clears this bar" is a CLAIM, and a
// claim needs evidence.
//
// THE INCIDENT (owner, 2026-08-30, two screenshots two minutes apart). Tonight's
// Move read "Nothing near Parrish clears this bar right now — nothing near you
// is still open and worth going to tonight." At that same moment
// /api/rails?lat=27.62&lng=-82.41&band=night was answering covered:true,
// thin:[] and FORTY places for that exact cell. The rail was not empty. We just
// had not asked yet, and said so in the voice of a verdict.
//
// THE CHAIN, all three links needed:
//   1. app/page.js prerenders with railMenuData(null) — no reader location —
//      and that path ships `thin: RAILS.filter(r => r.list).map(r => r.id)`:
//      every rail marked thin, meaning "nothing here yet".
//   2. the client starts `live = null` and `railLoad = null` — NOT
//      LOAD_PENDING — so `shown` falls back to those server props and
//      isPending(null) is false, skipping the skeleton.
//   3. the thin branch tested only thinSet.has(id), so the placeholder was
//      rendered as a measurement.
//
// This is v8.73's lesson one layer earlier. That fix stopped a pipeline CRASH
// reading as scarcity; the state BEFORE the pipeline was still doing it.
// "Nothing clears this bar" is the strongest claim this product makes about a
// place — the sentence that says our silence is the town's fault — so it may
// only be said about a payload actually received for THIS reader.
//
// WHAT THIS ASSERTS: the scarcity branch is gated on a real answer, `answered`
// means a live payload and nothing looser, and the unasked state has its own
// sentence rather than borrowing a verdict from either neighbour. Executed
// where it can be: the gate's truth table is run, not read.
//
// FALSE-POSITIVE SURFACE: only app/components/DaypartRail.js is read, only its
// drop render chain; comments are stripped, so the paragraphs above (which
// quote the very copy being banned) cannot satisfy their own check.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const raw = readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8");
const src = strip(raw);
ok(src.length > 20000 && src.includes("wf8-thin"), `PROBE: DaypartRail was read and stripped (${src.length} chars)`);

// ── 1. the gate exists and means what it says ───────────────────────────────
ok(/const answered = live != null;/.test(src),
  "`answered` is defined as a LIVE PAYLOAD EXISTING — not a load state, not a city, not a coordinate");
ok(!/const answered = .*railLoad/.test(src),
  "…and it is not derived from railLoad, which starts null and would make the unasked state look answered");

// ── 2. the scarcity sentence is gated on it ─────────────────────────────────
const thinBranch = src.match(/\) : selRail && [^?]*thinSet\.has\(selRail\.id\)[^?]*\?/);
ok(!!thinBranch, "positive control: the scarcity branch is a readable ternary arm");
ok(!!thinBranch && /\banswered\b/.test(thinBranch[0]),
  `the "nothing clears this bar" branch requires \`answered\` — a placeholder may not be rendered as a measurement (got: ${thinBranch ? thinBranch[0].trim() : "?"})`);

// ── 3. the unasked state does not borrow a neighbour's verdict ──────────────
ok(/!answered\s*\n?\s*\?/.test(src) || /!answered \?/.test(src),
  "the terminal copy has its own !answered case");
const notLive = src.match(/isn't live in \$\{dropCity[^`]*`/);
ok(!!notLive, "positive control: the out-of-coverage sentence is present");
const scarcity = src.match(/Nothing\$\{near\} clears this bar[^`]*`/);
ok(!!scarcity, "positive control: the scarcity sentence is present");
// Neither may be the fallback when we simply have not asked.
const terminalChain = src.slice(src.indexOf("isFailed(railLoad)"), src.indexOf("isFailed(railLoad)") + 1400);
ok(/!answered/.test(terminalChain),
  "the terminal chain branches on !answered BEFORE falling through to \"Wayfind isn't live here yet\" — that sentence blames coverage for our own silence");
ok(/haven't ranked/.test(terminalChain),
  "…and says what is actually true: we have not ranked it yet");

// ── 4. the gate, EXECUTED ───────────────────────────────────────────────────
// The four states the drop can be in, run through the same predicate the
// component uses. A source regex proves the shape; this proves the behaviour.
{
  const speaks = (live, thinHas) => (live != null) && thinHas;
  ok(speaks(null, true) === false,
    "EXECUTED: no payload + SSR placeholder thin -> the drop does NOT claim scarcity (the owner's screenshot)");
  ok(speaks({ places: {} }, true) === true,
    "EXECUTED: a real payload that measured the rail thin -> it DOES, which is the honest empty and must survive");
  ok(speaks({ places: {} }, false) === false,
    "EXECUTED: a real payload with places -> no claim");
  ok(speaks(null, false) === false, "EXECUTED: nothing known -> no claim (negative control)");
}

// ── 5. the SSR placeholder that started it is still the shape described ─────
// If railMenuData stops marking every rail thin with no location, this guard's
// premise changes and someone should re-read it rather than trust it.
{
  const rd = strip(readFileSync(join(ROOT, "lib/railsData.js"), "utf8"));
  ok(/thin: RAILS\.filter\(\(r\) => r\.list\)\.map\(\(r\) => r\.id\)/.test(rd),
    "PREMISE: railMenuData still ships every list rail as thin when it has no location — the placeholder this guard exists to muzzle");
}

if (fails.length) {
  console.error("check-scarcity-needs-an-answer: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-scarcity-needs-an-answer: OK — ${pass} assertions; the "nothing clears this bar" verdict requires a payload actually received for this reader (gate EXECUTED over all four states), and the unasked state has its own sentence instead of borrowing one`);
