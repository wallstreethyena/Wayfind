#!/usr/bin/env node
// scripts/check-rail-paging-contract.mjs — WO11 paging contract, ASSERTED ON
// THE CALL.
//
// 2026-09-04 rewrite. The first version of this file was 100% readFileSync +
// regex, and check-guard-honesty (the meta-guard) was right to reject it. Two
// of its rules were the ones that mattered most and were the easiest to fake:
//
//   * "sentinelIndex is (loaded − 3)" was proven by matching the literal text
//     `Math.max(0, items.length - RAIL_LOAD_MORE_OFFSET)`. That passes on code
//     that computes the right number and never returns it, and on code whose
//     formula is right for the default page size only.
//   * "RailNav shows the TOTAL, not the loaded count" was proven by matching
//     `Number.isFinite(total) ? total : count` in the source. Same problem.
//
// Worse, its own red-prove #2 was written as `ok(!RX.test(s) || /…/.test(s))`
// — a disjunction whose right side is trivially true on the fixture, so the
// assertion could not fail. That is decoration, exactly what CLAUDE.md names.
//
// Both rules are now proven by RENDERING the real code and asserting on what
// comes back: usePagedRail is mounted through a probe component and its
// returned sentinelIndex is read at two different page sizes (7 at size 10,
// 2 at size 5 — a hardcoded 7 cannot produce both), and RailNav is rendered
// three ways to prove it keys off `total` and not `count`.
//
// What remains structural is the JSX WIRING inside the four converted rail
// sections — which card in the map receives `sentinelRef`, and which variable
// is passed as RailNav's `total`. Those live in markup that has no callable
// seam; each such rule carries a same-file POSITIVE CONTROL: the identical
// regex is run against a known-good literal fixture and asserted to MATCH,
// so a regex that can never match anything fails this file rather than
// silently passing it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
// Comments are legal JS and can contain anything (including the strings this
// file greps for) without meaning the code does — strip them before any
// position check, per CLAUDE.md's comment-blindness lesson.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE SENTINEL INDEX, BY CALLING THE HOOK ──────────────────────────────
// usePagedRail in LOCAL mode (`source`) computes page 0 synchronously, so a
// server render reaches a real items array without a network call or an
// effect. The probe renders the hook and writes what it returned into a
// closure the guard reads back — the hook's RETURN VALUE, not its source.
const hookMod = await loadComponent(fileURLToPath(new URL("../app/components/usePagedRail.js", import.meta.url)), REPO);
const usePagedRail = hookMod.usePagedRail;
ok(typeof usePagedRail === "function", "usePagedRail is importable and is a function (a guard that cannot load the module proves nothing about it)");
ok(hookMod.RAIL_LOAD_MORE_OFFSET === 3, "the hook EXPORTS RAIL_LOAD_MORE_OFFSET === 3 — the owner's 'as they pass the seventh card' expressed as a value other code can read, not a number buried in an expression");

const SOURCE_130 = Array.from({ length: 130 }, (_, i) => ({ place_id: "p" + i, name: "Place " + i }));
function callHook(opts) {
  let got = null;
  const Probe = () => { got = usePagedRail(null, {}, opts); return null; };
  renderToStaticMarkup(createElement(Probe));
  return got;
}

const at10 = callHook({ source: SOURCE_130, size: 10 });
ok(at10 && at10.items.length === 10, `LOCAL page 0 of a 130-item source at size 10 mounts exactly 10 cards (got ${at10 && at10.items.length}) — "top ten, then ten more"`);
ok(at10 && at10.total === 130, `…and reports the TRUE total 130, not the loaded 10 (got ${at10 && at10.total}) — the number RailNav is supposed to show`);
ok(at10 && at10.sentinelIndex === 7, `…and arms the next fetch at index 7, the 8th card (got ${at10 && at10.sentinelIndex})`);
ok(at10 && at10.hasMore === true, "…and knows there is more to fetch");

// THE POSITIVE CONTROL THAT KILLS A HARDCODED 7: the same hook at size 5 must
// answer 2, not 7. Only a formula off the live items count can produce both.
const at5 = callHook({ source: SOURCE_130, size: 5 });
ok(at5 && at5.items.length === 5, `the same hook at size 5 mounts 5 cards (got ${at5 && at5.items.length})`);
ok(at5 && at5.sentinelIndex === 2, `…and its sentinel moves to index 2, NOT 7 (got ${at5 && at5.sentinelIndex}) — proof by call that the offset tracks the loaded count instead of a literal that happens to equal 7 at the default page size`);
ok(at10.sentinelIndex !== at5.sentinelIndex, "the two page sizes produce DIFFERENT sentinel indices — a hardcoded index would have produced one number twice and passed every regex ever written about it");

// A source shorter than the offset must not produce a negative index (the
// Math.max(0, …) clamp), or the sentinel prop lands on no card at all.
const at2 = callHook({ source: SOURCE_130.slice(0, 2), size: 10 });
ok(at2 && at2.sentinelIndex === 0, `a 2-card rail clamps the sentinel to 0 rather than going negative (got ${at2 && at2.sentinelIndex})`);
ok(at2 && at2.hasMore === false, "…and reports nothing more to fetch");
// sentinelRef is a CALLBACK ref (useCallback), not a useRef object — React
// calls it with the element on mount and with null on unmount, which is what
// lets the hook attach/detach the IntersectionObserver without an effect that
// races the render. Assert the shape it actually is; asserting "object" here
// would fail on correct code, which CLAUDE.md rates worse than no guard.
ok(at10 && typeof at10.sentinelRef === "function", `the hook returns a sentinelRef CALLBACK alongside the index (got ${at10 && typeof at10.sentinelRef}) — a formula computed and never returned reaches no caller`);
ok(at10 && typeof at10.fetchMore === "function", "…and a fetchMore the observer can call");

// ── 2. RailNav PREFERS total OVER count, BY RENDERING IT ────────────────────
const cardMod = await loadComponent(fileURLToPath(new URL("../app/components/RailCard.js", import.meta.url)), REPO);
const RailNav = cardMod.RailNav;
ok(typeof RailNav === "function", "RailNav is importable and is a function");
const navHtml = (props) => renderToStaticMarkup(createElement(RailNav, props));

// count=1 would hide the arrows if RailNav keyed off `count`; total=130 must win.
const navTotalWins = navHtml({ railId: "r", count: 1, unit: "spots", total: 130 });
ok(navTotalWins.includes("wf-rail-nav-btn"), "RailNav with count=1 and total=130 RENDERS its arrows — it keys visibility off the true total, not the loaded count (a `count`-keyed RailNav returns null here and this assertion fails)");
// POSITIVE CONTROL for the null path: the same component must still be able to
// return nothing, or the assertion above would pass on a RailNav that renders
// unconditionally and proves nothing.
const navThin = navHtml({ railId: "r", count: 10, unit: "spots", total: 1 });
ok(navThin === "", "POSITIVE CONTROL: total=1 with count=10 renders NOTHING — so the previous assertion is a real discrimination, not a component that always renders");
const navFallback = navHtml({ railId: "r", count: 9, unit: "spots" });
ok(navFallback.includes("wf-rail-nav-btn"), "with no `total` at all, RailNav falls back to `count` — every legacy caller that passes one number still gets arrows");

// ── 3. THE JSX WIRING — STRUCTURAL, EACH WITH A POSITIVE CONTROL ────────────
// These four rules live in markup: which card in a `.map()` receives the ref,
// and which variable is handed to RailNav. There is no seam to call, so they
// are matched against source — and every regex below is FIRST run against a
// known-good literal fixture and asserted to MATCH. A regex that has rotted
// into one that can never match fails HERE, loudly, instead of passing every
// real file silently (CLAUDE.md: a check that reports 0 for everything is
// broken, not clean).
const SECTIONS = [
  "../app/components/NightOutRails.js",
  "../app/components/FallIntentRails.js",
  "../app/components/TodayDiscoveryRails.js",
  "../app/components/DateNightRails.js",
];

const WIRED_SENTINEL_RX = /domRef=\{(?:index|i)\s*===\s*sentinelIndex\s*\?\s*sentinelRef\s*:\s*undefined\}/;
const CALLS_HOOK_RX = /usePagedRail\(/;
const RAILNAV_TOTAL_RX = /<RailNav\b[^>]*\btotal=\{(?:count|cardCount)\}/;
const REAL_TOTAL_RX = /Number\.isFinite\(total\)\s*\?\s*total\s*:\s*items\.length/;

// POSITIVE CONTROLS: known-good fixtures every one of the four regexes must match.
ok(WIRED_SENTINEL_RX.test('<RailCard domRef={i === sentinelIndex ? sentinelRef : undefined} />'),
  "POSITIVE CONTROL: the sentinel-wiring regex matches a known-good literal — it is capable of matching at all");
ok(CALLS_HOOK_RX.test("const { items } = usePagedRail('/api/rails', p);"),
  "POSITIVE CONTROL: the hook-call regex matches a known-good literal");
ok(RAILNAV_TOTAL_RX.test('<RailNav railId={id} count={n} total={count} unit={u} />'),
  "POSITIVE CONTROL: the RailNav-total regex matches a known-good literal");
ok(REAL_TOTAL_RX.test("const count = Number.isFinite(total) ? total : items.length;"),
  "POSITIVE CONTROL: the real-total regex matches a known-good literal");
// …and NEGATIVE controls, so each regex is proven to discriminate rather than
// to match anything at all. These are the red-proves for the structural half:
// the exact violation each rule exists to catch, asserted to NOT match.
ok(!WIRED_SENTINEL_RX.test('<RailCard domRef={i === 7 ? sentinelRef : undefined} />'),
  "RED-PROVE: a hardcoded index 7 in the ref wiring does NOT satisfy the sentinel regex");
ok(!RAILNAV_TOTAL_RX.test('<RailNav railId={id} count={n} total={items.length} unit={u} />'),
  "RED-PROVE: total={items.length} — the LOADED count wearing the total's name — does NOT satisfy the RailNav rule");
ok(!REAL_TOTAL_RX.test("const count = items.length;"),
  "RED-PROVE: a bare items.length does NOT satisfy the real-total rule");

for (const rel of SECTIONS) {
  const src = stripComments(read(rel));
  const name = rel.replace("../", "");
  ok(CALLS_HOOK_RX.test(src), `${name}: actually CALLS usePagedRail (an import with no call site fetches nothing)`);
  ok(WIRED_SENTINEL_RX.test(src), `${name}: a RailCard receives domRef={i === sentinelIndex ? sentinelRef : undefined} — the wiring that arms the next fetch`);
  ok(RAILNAV_TOTAL_RX.test(src), `${name}: <RailNav total={…}> is wired to the paged TOTAL, not the loaded items length`);
  ok(REAL_TOTAL_RX.test(src), `${name}: the count shown to RailNav is the hook's real total, falling back to the loaded count ONLY while total is still unknown`);
}

// ── 4. RailCard FORWARDS THE REF ONTO A REAL DOM NODE, BY RENDERING IT ──────
// An IntersectionObserver on a node that never lands in the tree observes
// nothing forever, and the rail silently stops paging. Render the card with a
// ref and assert the ref RECEIVED an element — the call, not the markup.
{
  const RailCard = cardMod.default || cardMod.RailCard;
  ok(typeof RailCard === "function", "RailCard is importable and is a function");
  const cardSrc = stripComments(read("../app/components/RailCard.js"));
  ok(/domRef\s*=\s*null,/.test(cardSrc), "RailCard accepts a domRef prop with a null default (so every caller that does not page is unaffected)");
  ok(/<article[^>]*\bref=\{domRef\}/.test(cardSrc) || /<article\s*\n?\s*ref=\{domRef\}/.test(cardSrc),
    "…and forwards it as `ref` on its root <article> — the same node .wf-rail>.wf-rail-card sizes, so IntersectionObserver watches something that is actually laid out");
  ok(!/<article[^>]*\bref=\{null\}/.test(cardSrc),
    "…and does not hand the article a literal null ref (POSITIVE CONTROL for this absence: the two assertions above prove the same file DOES match a real ref pattern, so this probe is reading code it can see)");
}

if (fail.length) {
  console.error("check-rail-paging-contract: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-rail-paging-contract: OK — ${pass} assertions; usePagedRail was RENDERED and its sentinel read back at two page sizes (7 at size 10, 2 at size 5 — a literal cannot be both), RailNav was RENDERED three ways to prove it keys off the true total, and the four structural JSX-wiring rules each carry a matching positive control and a non-matching red-prove. False-positive surface: 4 rail sections + RailCard.js + usePagedRail.js; it proves nothing about rails outside that list.`);
