// scripts/test-prominence.mjs — locks the split between QUALITY and PROMINENCE.
//
// wayfindScore answers "is this good?"; prominenceScore answers "is this one of
// the biggest things here?". Conflating them is a real, measured production bug:
// ordering Orlando by the displayed Wayfind Score alone returned four escape
// rooms and a day spa above Magic Kingdom (251,175 reviews) and Walt Disney
// World (270,237). Every fixture below is a real Orlando row from wf_place_ids.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-prominence: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// wayfindScore is no longer MIRRORED here (2026-08-06). It moved to
// lib/wayfindScore.js — zero imports, node-loadable — so this guard imports the
// real function instead of a fourth handwritten copy of it. A mirror asserted
// against source TEXT is what let three divergent implementations coexist:
// lib/landing.js used the same constants in a different expression, on a 0–50
// scale, and every text-matching check in the repo stayed green.
//
// prominenceScore is still mirrored, because it lives in lib/google.js and that
// module cannot be loaded outside the Next runtime.
const src = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const { wayfindScore } = await import(new URL("../lib/wayfindScore.js", import.meta.url).href);
// Imported AND re-exported, deliberately: a bare `export { x } from "./y"`
// creates no local binding, and prominenceScore() in this file calls
// wayfindScore — check-lib-call-imports caught exactly that before it shipped.
ok(/import \{ wayfindScore \} from "\.\/wayfindScore\.js"/.test(src), "lib/google.js imports wayfindScore from the one shared module (a local binding, because prominenceScore calls it)");
ok(/export \{ wayfindScore \};/.test(src), "lib/google.js still re-exports wayfindScore for its existing importers");
ok(/export function prominenceScore\(rating, reviews\)/.test(src), "prominenceScore is exported");
ok(wayfindScore(4.6, 3000) === 92, "the REAL wayfindScore still returns 92 for 4.6/3000 — the displayed score is unchanged by the move");
ok(wayfindScore(null, 0) === null, "the REAL wayfindScore returns null for an unrated place");
ok(/0\.6 \* quality \+ 0\.4 \* volume/.test(src), "prominence weights quality 0.6 / volume 0.4");
ok(/Math\.log10\(1 \+ \(reviews \|\| 0\)\) \/ 6/.test(src), "prominence uses log10 volume over 6 decades");

const prominenceScore = (rating, reviews) => {
  if (!rating) return null;
  const quality = wayfindScore(rating, reviews) / 100;
  const volume = Math.min(1, Math.log10(1 + (reviews || 0)) / 6);
  return Math.round(100 * (0.6 * quality + 0.4 * volume));
};

// Real Orlando rows.
const WDW      = ["Walt Disney World® Resort", 4.7, 270237];
const MK       = ["Magic Kingdom Park", 4.6, 251175];
const SPRINGS  = ["Disney Springs", 4.7, 238113];
const UNIVERSAL= ["Universal Orlando Resort", 4.7, 191986];
const ESCAPE   = ["The Escape Game Orlando", 5.0, 26460];
const LOCKBUST = ["Lockbusters Escape Game", 5.0, 8657];
const SPA      = ["The Salt Room Orlando Day Spa", 4.8, 751];
const DORA     = ["Dora Queen", 4.9, 273];
const prom = ([, r, v]) => prominenceScore(r, v);
const qual = ([, r, v]) => wayfindScore(r, v);

// --- the bug, stated as tests -------------------------------------------
// Under the OLD behaviour these all failed.
for (const anchor of [WDW, MK, SPRINGS, UNIVERSAL]) {
  ok(prom(anchor) > prom(ESCAPE), `${anchor[0]} outranks an escape room on prominence`);
  ok(prom(anchor) > prom(SPA), `${anchor[0]} outranks a day spa on prominence`);
  ok(prom(anchor) > prom(DORA), `${anchor[0]} outranks a 273-review bar on prominence`);
}
ok(prom(ESCAPE) > prom(LOCKBUST), "between two 5.0 escape rooms, the busier one leads");

// --- but quality is NOT prominence, and must stay honest ------------------
ok(qual(ESCAPE) > qual(MK), "the displayed Wayfind Score still rates the escape room higher");
ok(qual(ESCAPE) === 100 && qual(MK) === 92, "displayed scores are unchanged (100 vs 92)");
ok(prominenceScore(null, 999999) === null, "no rating -> no prominence (never a fake 0)");
ok(prominenceScore(0, 100) === null, "a zero rating yields null, matching wayfindScore");

// --- a big mediocre place must not buy the top slot ----------------------
const MEDIOCRE = ["Busy But Mediocre", 3.4, 400000];
ok(prom(MEDIOCRE) < prom(MK), "volume alone cannot outrank a well-rated anchor");
ok(prom(MEDIOCRE) < prom(WDW), "quality still leads the blend");

// --- ordering sanity over the whole sample -------------------------------
const ranked = [WDW, MK, SPRINGS, UNIVERSAL, ESCAPE, LOCKBUST, SPA, DORA]
  .map((p) => [p[0], prom(p)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
const ANCHORS = new Set([WDW[0], MK[0], SPRINGS[0], UNIVERSAL[0]]);
ok(ranked.slice(0, 4).every((n) => ANCHORS.has(n)),
  `the four anchors take the top four slots (got ${JSON.stringify(ranked.slice(0, 4))})`);
ok(ranked[ranked.length - 1] === "Dora Queen", "the 273-review bar ranks last");

// --- the wiring: prominence must actually reach the feed -----------------
const g = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
ok(/wfProm: prominenceScore\(/.test(g), "google.js emits wfProm on every place");
const s = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
ok(/fp\.wfProm = prominenceScore\(/.test(s), "sources.js emits wfProm");
ok(/fp\.wfScore = null; fp\.wfProm = null;/.test(s), "an unrated row gets NO prominence, not a fake 0");
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/const promOf = \(p\) =>/.test(h), "home.js has a single promOf helper");
ok(/wfProm != null \? p\.wfProm : \(p && p\.wfScore != null \? p\.wfScore : 0\)/.test(h),
  "promOf falls back to wfScore when a source has no prominence");
ok((h.match(/sort\(\(a, b\) => promOf\(b\) - promOf\(a\)\)/g) || []).length >= 3,
  "the top-of-city orderings sort by prominence");

console.log(`test-prominence: OK — ${pass} assertions (quality != prominence, anchors rank first)`);
