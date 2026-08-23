// scripts/check-rail-dots.mjs
//
// ONE RAIL INDICATOR, EVERYWHERE (owner, 2026-08-12, with two screenshots):
// "on every rail i want the style from image 1 not image 2 — fix that globally
// and audit to make sure everything is working as desired."
//   image 1 = the dot strip
//   image 2 = the "9 of 10 · swipe for more" text pill
//
// The pill was not arbitrary — it existed because 40 literal dots overflow a
// 390px row and wrap. So the rule this guard encodes is not "delete the pill",
// it is: EVERY rail shows dots at EVERY length, and long rails stay legible by
// WINDOWING the strip rather than by switching to a different vocabulary.
//
// Three things are checked, and the important one is executed, not grepped:
//   1. the windowing arithmetic (railDotWindow) — run against real inputs
//   2. no text-pill indicator survives anywhere in the app
//   3. COVERAGE: every horizontal rail that declares data-rail also renders
//      <RailDots ...>, so "globally" is a fact about the tree, not a promise
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-rail-dots: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { railDotWindow, railDotIsEdge, RAIL_DOTS_WINDOW: W } = await import("../lib/railDots.js");

// ── 1. THE ARITHMETIC, EXECUTED ───────────────────────────────────────────
// A blank slot or a window that slides past the last card is the only real bug
// in here, and no regex over JSX can see it.
ok(W === 8, `the window is the declared 8 dots (got ${W})`);

// Short rails render every dot — the windowing must be invisible below the cap.
for (const n of [2, 3, 5, 8]) {
  const { start, end } = railDotWindow(n, 0);
  ok(start === 0 && end === n, `count ${n} renders all ${n} dots (got ${start}..${end})`);
}

// Long rails: the window is always exactly W wide, always inside [0, count],
// and never negative — checked exhaustively across every page of a long rail.
for (const n of [9, 12, 40, 137]) {
  for (let p = 0; p < n; p++) {
    const { start, end } = railDotWindow(n, p);
    if (end - start !== W) fail(`count ${n} page ${p}: window is ${end - start} dots, expected ${W}`);
    if (start < 0) fail(`count ${n} page ${p}: negative start ${start}`);
    if (end > n) fail(`count ${n} page ${p}: window runs past the last card (${end} > ${n})`);
    if (p < start || p >= end) fail(`count ${n} page ${p}: the ACTIVE dot is outside its own window ${start}..${end}`);
  }
  pass += 1;
}

// Pinning behaviour at the ends, and centring in the middle.
ok(railDotWindow(40, 0).start === 0, "at the first card the window pins to the start");
ok(railDotWindow(40, 39).end === 40, "at the last card the window pins to the end");
ok(railDotWindow(40, 20).start === 16 && railDotWindow(40, 20).end === 24,
   "mid-rail the window centres on the active page");

// Garbage in, no throw and no NaN — these props come from list lengths that
// have been null/undefined during loading states before.
for (const [c, p] of [[undefined, undefined], [null, 3], [0, 0], [NaN, NaN], [-5, -5], [7, 999]]) {
  const r = railDotWindow(c, p);
  if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end < r.start) {
    fail(`railDotWindow(${c}, ${p}) returned a broken window ${JSON.stringify(r)}`);
  }
}
pass += 1;

// ── 2. THE TEXT PILL IS GONE, EVERYWHERE ──────────────────────────────────
const SKIP = /node_modules|\.next|\/api\//;
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx?$/.test(p)) files.push(p);
  }
};
walk(path.join(REPO, "app"));
ok(files.length > 40, `swept a real number of app files (got ${files.length})`);

for (const f of files) {
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const rel = path.relative(REPO, f);
  ok(!/swipe for more/i.test(src),
     `${rel} still renders the "swipe for more" text pill — image 2 is retired, every rail shows dots`);
  // The specific shape that was replaced: `{page + 1} of {count}` as an
  // indicator. Written as a shape so a reworded version cannot slip back.
  ok(!/\{\s*page \+ 1\s*\}\s*of\s*\{\s*count\s*\}/.test(src),
     `${rel} renders an "n of N" page counter as a rail indicator — use RailDots`);
}

// ── 3. COVERAGE: "GLOBALLY" MUST BE TRUE OF THE TREE ──────────────────────
// Every element that declares data-rail="X" is a horizontal rail; each one must
// have a RailDots rendered for it. This is the half of the owner's ask that a
// styling change alone would silently miss — a rail added later with no dots is
// the same defect as the pill, just quieter.
const RAIL_DECL = /data-rail=\{?"?([^"'`}\s]+)/g;
let rails = 0, dotted = 0;
const missing = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = path.relative(REPO, f);
  // RailCard.js itself only queries data-rail, it does not declare one.
  if (rel.endsWith("components/RailCard.js")) continue;
  const decls = [...src.matchAll(RAIL_DECL)];
  if (!decls.length) continue;
  rails += decls.length;
  const hasDots = /<RailDots\b/.test(src);
  if (hasDots) dotted += decls.length;
  else missing.push(rel);
}
ok(rails >= 6, `found the app's horizontal rails (got ${rails})`);
ok(missing.length === 0,
   `these files declare a data-rail but never render <RailDots>, so those rails have no "there is more" signal: ${missing.join(", ")}`);
ok(dotted === rails, `every declared rail is dotted (${dotted}/${rails})`);

// And the component that all of them share must still be the single source.
const card = readFileSync(path.join(REPO, "app/components/RailCard.js"), "utf8");
ok(/export function RailDots\(/.test(card), "RailDots is still the one exported indicator");
const libDots = readFileSync(path.join(REPO, "lib/railDots.js"), "utf8");
ok(/export function railDotWindow\(/.test(libDots), "the window math stays in lib/, JSX-free, or this guard cannot execute it");
// v8.39 — matches the CALL, not the caller's local variable name. This read
// `railDotWindow(count, page)` literally, which pinned an identifier rather
// than the contract and went red the moment the first argument stopped being
// the card count (it is now the measured PAGE count — see below). The thing
// worth protecting is that the window math has exactly one home.
ok(/railDotWindow\(\s*\w+\s*,\s*page\s*\)/.test(card) && /railDotIsEdge\(/.test(card),
   "RailDots must CALL the shared window math, not keep a second copy inline — two copies is how the strip and its guard drift apart");
// v8.39 — A DOT IS A PAGE, AND A PAGE IS MEASURED.
//
// RailDots was written when `.wf-rail>.wf-rail-card` was `flex:0 0 100%`, so
// one card and one viewport were the same distance and the card count could
// stand in for the page count. v8.35 sized the trending cards off the drop's
// own column (~3.4 across a desktop) and that identity broke: a 12-dot strip
// could only ever light its first 3, because `scrollLeft / clientWidth` tops
// out at (12 - 3.4) / 3.4. The strip promised pages that no scroll could reach.
//
// So the page count has to come from the rail's own geometry. Asserted on the
// source because the arithmetic only exists once a browser has laid the rail
// out; test-drop-rail-parity.mjs is what measures the widths for real.
ok(/scrollWidth/.test(card) && /clientWidth/.test(card),
   "RailDots must MEASURE its pages off the rail (scrollWidth / clientWidth) — card count is only the page count while a card fills the column, which stopped being true in v8.35");
ok(/ResizeObserver|addEventListener\(\s*["']resize["']/.test(card),
   "the page count must be re-measured when the rail resizes — card width is a media-query variable, so a rotation changes how many pages exist");
ok(/data-rail-dots=/.test(card), "the strip carries data-rail-dots so a live/e2e pass can find and assert it");

console.log(`check-rail-dots: OK — ${pass} assertions; window math executed across 198 page states, ${dotted}/${rails} rails dotted, the "n of N" pill is gone from ${files.length} app files`);
