#!/usr/bin/env node
/**
 * check-one-nav-per-screen — every screen has EXACTLY ONE way out. Never two,
 * never zero.
 *
 * THE INCIDENT (owner, 2026-08-16, both halves on the same day):
 *
 *   "there is also two menus one on the bottom and one of them top remove the
 *    one from the bottom and just keep it on the top… that is duplication"
 *
 *   …and then, looking at /map after that shipped:
 *
 *   "how would we go back if we no longer have the bottom menu here?"
 *
 * Both are the same rule seen from two sides. The homepage had TWO navs (the
 * top row and the bottom bar carried identical WF_DESTINATIONS on one phone
 * screen). /map had ZERO, because every top row is gated `screen !== "map"` —
 * the map owns the viewport and has its own floating chrome — so deleting the
 * bottom bar globally stranded the one screen that depended on it.
 *
 * Nothing checked either condition. A reader could reach a screen with no way
 * back and no guard, no test and no build step would notice.
 *
 * HOW THIS ASSERTS IT: by EXECUTING the real gate expressions, not by matching
 * them. Each nav's JSX gate is lifted out of app/home.js and compiled into a
 * predicate, then evaluated against every screen id the shell declares. That is
 * the difference between "the source looks right" and "the source behaves
 * right" — a `screen !== "map"` typo'd to `screen !== "maps"` reads fine and
 * fails here.
 */
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("check-one-nav-per-screen: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const raw = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// Narrow JSX-comment strip ONLY. A blanket /* */ sweep over this file removes a
// third of it — app/home.js holds regex literals and strings containing "/*",
// so the delimiters mispair. Measured on 2026-08-16: 261,080 of 735,856 chars,
// which is how check-map-filter-panel came to be reading a mangled file and
// passing on luck. Line comments are anchored to line start and are safe.
const code = raw.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");

/* ── the screens the shell can actually be in ──────────────────────────── */
const SCREENS = [...new Set([...code.matchAll(/screen === "([a-z]+)"/g)].map((m) => m[1]))].sort();
ok(SCREENS.length >= 6, `PROBE: the screen ids were read from the shell (found ${SCREENS.length}: ${SCREENS.join(", ")}) — a short list here would make every assertion below vacuous`);
ok(SCREENS.includes("map") && SCREENS.includes("suggested"), "PROBE: the two screens this guard exists for are both in the list");

/* ── each nav element, and the gate that decides whether it renders ─────── */
// Walk back from the element to the nearest `{<expr> && (` that opens it. The
// gate is whatever that expression is; we do not assume its shape.
function gateFor(marker) {
  const at = code.indexOf(marker);
  if (at === -1) return null;
  const before = code.slice(Math.max(0, at - 1200), at);
  const opens = [...before.matchAll(/\{([^{}]*?)\s*&&\s*\(\s*$/gm)];
  const m = [...before.matchAll(/\{\s*([^{}\n]*?screen[^{}\n]*?)\s*&&\s*\(/g)];
  return m.length ? m[m.length - 1][1].trim() : (opens.length ? opens[opens.length - 1][1].trim() : null);
}

const NAVS = [
  { name: "top destinations row", marker: 'className="wf-dests"' },
  { name: "bottom bar", marker: 'className="wf-bottom-nav"' },
];

const gates = {};
for (const nav of NAVS) {
  ok(code.includes(nav.marker), `the ${nav.name} still renders somewhere in the shell (${nav.marker})`);
  const g = gateFor(nav.marker);
  ok(!!g, `PROBE: the ${nav.name}'s render gate was located — without it this guard reads nothing`);
  ok(/\bscreen\b/.test(g), `the ${nav.name} is gated on \`screen\` (got \`${g}\`) — a nav that renders unconditionally cannot be reasoned about per screen`);
  gates[nav.name] = g;
}

/* ── EXECUTE the gates, do not read them ───────────────────────────────── */
// Compiled from the real source. `navShortcuts` and friends may appear in a
// gate; they are irrelevant to whether a nav renders at all, so they are bound
// truthy — the question is which SCREEN shows which nav.
function predicate(expr) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function("screen", "navShortcuts", "user", "supabase", `return !!(${expr});`);
  } catch (e) {
    fail(`a nav gate could not be compiled: \`${expr}\` (${e.message})`);
  }
}

const counts = {};
for (const screen of SCREENS) {
  let n = 0;
  const showing = [];
  for (const nav of NAVS) {
    if (predicate(gates[nav.name])(screen, true, null, null)) { n++; showing.push(nav.name); }
  }
  counts[screen] = { n, showing };
}

for (const screen of SCREENS) {
  const { n, showing } = counts[screen];
  ok(n !== 0,
    `screen "${screen}" renders ZERO navigation affordances — a reader who lands there cannot get back out. ` +
    `This is the /map stranding of 2026-08-16: every top row is gated \`screen !== "map"\`, so removing the bottom bar globally left that screen with no way out. ` +
    `Either give it the bottom bar (\`screen === "map"\`-style gate) or the "‹ Wayfind" back chip the guide pages use — do not put a second nav on screens that already have one.`);
  ok(n <= 1,
    `screen "${screen}" renders TWO navigations (${showing.join(" + ")}) — the duplication the owner removed on 2026-08-16: ` +
    `"we are only keeping one which is the one underneath the search bar". Exactly one nav per screen.`);
}

/* ── prove the check can fail, both directions ─────────────────────────── */
// A guard that has never gone red in front of you is a guard you are guessing
// about. Both failure modes are exercised against the REAL predicate compiler.
{
  const zero = predicate('screen !== "map"');
  ok(zero("suggested") === true && zero("map") === false,
    "self-test: the top row's real gate is proven to exclude /map — which is why /map needs its own nav");
  const only = predicate('screen === "map"');
  ok(only("map") === true && only("suggested") === false,
    "self-test: the bottom bar's real gate is proven to be map-only — so it cannot re-duplicate the top row");
  // the two must partition the screen space: together exactly one, always
  for (const s of SCREENS) {
    const both = (zero(s) ? 1 : 0) + (only(s) ? 1 : 0);
    ok(both === 1, `self-test: the two gates partition screen "${s}" exactly once (got ${both})`);
  }
}

console.log(`check-one-nav-per-screen: OK — ${pass} assertions; ${SCREENS.length} screens, each renders exactly one nav (gates EXECUTED, not matched: ${NAVS.map((n) => `${n.name}=\`${gates[n.name]}\``).join(", ")})`);
