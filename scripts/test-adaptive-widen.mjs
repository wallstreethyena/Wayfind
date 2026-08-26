#!/usr/bin/env node
// scripts/test-adaptive-widen.mjs — THE LADDER COUNTS WHAT THE FEED CAN SHOW.
//
// Live incident (owner, Parrish > Activities > Beaches, 2026-08-26): the
// inventory serve returned 32 real beaches and the page rendered ONE, under
// "That's all 1 activities spot near Parrish." The serve's distance gate is
// radius*1.15 on a server radius that snaps UP the cost ladder (27359 ->
// 32000m -> a 22.9mi gate), but the browse view admits only
// `distMi <= sliderMi` (17 default) — and every real Gulf beach near inland
// Parrish sits at 17.5–20mi. The auto-widen ladder compared ADAPT_MIN
// against the RAW fetch (32 >= 8), declared the feed full, and never
// widened. v8.48's law, again: a count and its list must come from ONE
// array.
//
// Two layers, per the extraction-guard doctrine (CLAUDE.md):
//   1. EXECUTE lib/score.js displayableAt against the reproduced live shape —
//      the defect (raw count says full, displayable count says starving) and
//      the cure (widening admits the shelf) both run for real.
//   2. Pin the WIRE: home.js's ladder break must call displayableAt on the
//      radius in use, and the raw `.length >= ADAPT_MIN` break must be gone
//      from that loop — asserted in syntactic position, not as a substring.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const { displayableAt, cardComplete } = await import(path.join(ROOT, "lib/score.js"));

// ── 1. The reproduced live shape, executed ─────────────────────────────────
// 32 beaches the serve really returned for Parrish: one inside the default
// display cut (Bahia Beach, 8.5mi), the rest 17.5–20mi out — inside the
// serve's 22.9mi gate, outside the 17mi display cut.
const mk = (i, distMi) => ({ id: "b" + i, name: "Beach " + i, rating: 4.5, reviews: 200, distMi });
const live = [mk(0, 8.5), ...Array.from({ length: 31 }, (_, i) => mk(i + 1, 17.5 + (i % 6) * 0.5))];

ok(live.every(cardComplete), "positive control: every fixture row is renderable (cardComplete)");
ok(live.length === 32, "positive control: fixture reproduces the 32-row serve");

const at17 = displayableAt(live, 27359);
ok(at17 === 1, `THE DEFECT, reproduced: at the 17mi default only ONE of 32 served beaches is displayable (got ${at17})`);
ok(at17 < 8, "…which is under ADAPT_MIN, so the ladder MUST widen (raw length 32 said it was full)");

const at30 = displayableAt(live, 48280);
ok(at30 === 32, `THE CURE, executed: widening to 30mi makes all 32 displayable (got ${at30})`);

// The admission rule matches the view's, edge by edge.
ok(displayableAt([mk(9, null)], 27359) === 1, "distMi == null is admitted (the view has always admitted unknown distance)");
ok(displayableAt(live, 96560) === 32, "the >=60mi slider escape admits everything, like the view");
ok(displayableAt([{ id: "x", name: "No Signal", distMi: 2 }], 27359) === 0, "a row with no rating signal never counts — it cannot render (v8.48)");
ok(displayableAt(null, 27359) === 0, "null list counts zero, never throws");

// ── 2. The wire in app/home.js, in syntactic position ──────────────────────
const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
// Strip line comments so prose cannot satisfy (or trip) a position check.
const code = home.replace(/^\s*\/\/.*$/gm, "");

const loopStart = code.indexOf("for (const _m of RADIUS_LADDER_M)");
ok(loopStart > -1, "positive control: the adaptive-radius ladder loop exists");
const loop = loopStart > -1 ? code.slice(loopStart, loopStart + 700) : "";

ok(/if\s*\(\s*displayableAt\s*\(\s*results\s*,\s*_usedM\s*\)\s*>=\s*ADAPT_MIN\s*\)\s*break/.test(loop),
  "the ladder breaks on displayableAt(results, _usedM) — the view's own admission rule at the radius in use");
ok(!/\(\s*results\s*\|\|\s*\[\]\s*\)\.length\s*>=\s*ADAPT_MIN/.test(loop),
  "the raw-fetch `.length >= ADAPT_MIN` break is gone from the ladder — it is what declared a 1-card shelf full");
ok(/import\s*\{[^}]*\bdisplayableAt\b[^}]*\}\s*from\s*["']\.\.\/lib\/score["']/.test(code),
  "home.js imports displayableAt from lib/score (named import, real binding)");

console.log(`\ntest-adaptive-widen: ${fail ? "FAIL" : "OK"} — ${pass} assertions; the ladder counts displayable cards, and the 32-served/1-shown Beaches shape widens instead of starving`);
process.exit(fail ? 1 : 0);
