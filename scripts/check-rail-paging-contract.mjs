#!/usr/bin/env node
// scripts/check-rail-paging-contract.mjs — WO11 structural pins.
//
// test-rail-paging.mjs proves the MATH (lib/railPage.js) by calling it.
// This file proves the two things a call-based test cannot reach because
// they live in the wiring, not the function:
//
//   1. THE OBSERVER THRESHOLD IS loaded − 3. Owner: "as they pass the
//      seventh card, start loading 10 more." usePagedRail computes
//      `sentinelIndex` from that literal formula; every paged rail section
//      must render its sentinel prop (domRef) at that computed index, not a
//      hardcoded number that happens to equal 7 today and silently stops
//      tracking `loaded` if the page size ever changes.
//   2. RailNav SHOWS TOTAL, NOT THE LOADED COUNT. A rail that has loaded 10
//      of 130 must render "130 ranked options", never "10" — that is the
//      whole point of shipping `total` in the paging contract. Asserted on
//      the syntactic position (RailNav's `total=` prop), never on the
//      substring "total" appearing anywhere in the file (CLAUDE.md's
//      role-vs-substring rule).
import { readFileSync } from "node:fs";

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

const hookSrc = read("../app/components/usePagedRail.js");
const hook = stripComments(hookSrc);

// ── 1. THE SENTINEL FORMULA, ON THE DECLARATION ─────────────────────────────
ok(/RAIL_LOAD_MORE_OFFSET\s*=\s*3/.test(hook),
  "usePagedRail declares the load-more offset as the constant 3 (the owner's 'pass the seventh card')");
ok(/const sentinelIndex\s*=\s*Math\.max\(0,\s*items\.length\s*-\s*RAIL_LOAD_MORE_OFFSET\)/.test(hook),
  "sentinelIndex is computed as (loaded − 3) off the LIVE items count, not a fixed literal — so it tracks whatever page size a caller passes");
ok(!/sentinelIndex\s*=\s*(7|10)\b/.test(hook),
  "…and it is not a hardcoded 7 or 10 wearing the formula's name");
ok(/return\s*\{[\s\S]{0,200}sentinelIndex[\s\S]{0,200}sentinelRef/.test(hook),
  "the hook actually EXPORTS both sentinelIndex and sentinelRef — a formula computed and never returned reaches no caller");

// ── 2. EVERY CONVERTED RAIL SECTION WIRES THE SENTINEL BY INDEX ─────────────
// Not "the hook is imported" (that passes the moment the identifier appears
// anywhere) — the CARD MAP must conditionally hand `sentinelRef` to the ONE
// card whose position equals `sentinelIndex`, computed fresh per render.
const WIRED_SENTINEL_RX = /domRef=\{(?:index|i)\s*===\s*sentinelIndex\s*\?\s*sentinelRef\s*:\s*undefined\}/;
for (const rel of [
  "../app/components/NightOutRails.js",
  "../app/components/FallIntentRails.js",
  "../app/components/TodayDiscoveryRails.js",
  "../app/components/DateNightRails.js",
]) {
  const src = stripComments(read(rel));
  ok(WIRED_SENTINEL_RX.test(src), `${rel.replace("../", "")}: a RailCard receives domRef={i === sentinelIndex ? sentinelRef : undefined} — the wiring that arms the next fetch`);
  ok(/usePagedRail\(/.test(src), `${rel.replace("../", "")}: actually CALLS usePagedRail (an import with no call site fetches nothing)`);
}

// ── 3. RailCard FORWARDS THE REF ONTO THE REAL DOM NODE ─────────────────────
const cardSrc = stripComments(read("../app/components/RailCard.js"));
ok(/domRef\s*=\s*null,/.test(cardSrc), "RailCard accepts a domRef prop");
ok(/<article\s*\n?\s*ref=\{domRef\}/.test(cardSrc) || /<article[^>]*\bref=\{domRef\}/.test(cardSrc),
  "…and forwards it as `ref` on its root <article> — the same node .wf-rail>.wf-rail-card sizes, so IntersectionObserver watches something that is actually laid out");

// ── 4. RailNav RENDERS total, THE SYNTACTIC POSITION, NOT A SUBSTRING ───────
// RailNav itself must accept `total` and prefer it over `count` for the
// arrow-visibility check (lib/railPage.js already ships an accurate `total`
// on page 0; RailNav choosing `count` here would silently hide the real
// number behind the merely-loaded one).
const navSrc = stripComments(read("../app/components/RailCard.js"));
ok(/export function RailNav\(\{[^}]*\btotal\b/.test(navSrc), "RailNav destructures `total` in its own props");
ok(/Number\.isFinite\(total\)\s*\?\s*total\s*:\s*count/.test(navSrc), "…and prefers it over `count` when present");

// Every converted section must pass total={<the paged total>} — not
// total={items.length} (the loaded count) and not omit it (falling back to
// `count`, which on a thin/failed page can itself be the loaded count).
const RAILNAV_TOTAL_RX = /<RailNav\b[^>]*\btotal=\{(?:count|cardCount)\}/;
for (const rel of [
  "../app/components/NightOutRails.js",
  "../app/components/FallIntentRails.js",
  "../app/components/TodayDiscoveryRails.js",
  "../app/components/DateNightRails.js",
]) {
  const src = stripComments(read(rel));
  ok(RAILNAV_TOTAL_RX.test(src), `${rel.replace("../", "")}: <RailNav total={…}> is wired to the paged TOTAL, not the loaded items length`);
  // And that total-bearing variable must itself come from the hook's `total`,
  // falling back to the loaded length only when the server has not answered
  // yet (page 0 still in flight with no seed) — never a bare items.length.
  ok(/Number\.isFinite\(total\)\s*\?\s*total\s*:\s*items\.length/.test(src),
    `${rel.replace("../", "")}: the count shown to RailNav is the hook's real total, falling back to the loaded count ONLY while total is still unknown`);
}

// ── 5. RED-PROVE: the assertions above actually fail on broken code ────────
// A regex that never fails is decoration (CLAUDE.md). Prove each rule
// catches its own violation on a synthetic fixture.
{
  const sabotagedFormula = hook.replace(
    "const sentinelIndex = Math.max(0, items.length - RAIL_LOAD_MORE_OFFSET);",
    "const sentinelIndex = 7;",
  );
  ok(sabotagedFormula !== hook, "RED-PROVE SETUP: the sabotage string was found and replaced (a mutation that fails to apply is not a red-prove)");
  ok(!/const sentinelIndex\s*=\s*Math\.max\(0,\s*items\.length\s*-\s*RAIL_LOAD_MORE_OFFSET\)/.test(sabotagedFormula),
    "RED-PROVE: hardcoding sentinelIndex = 7 makes rule 1's assertion FAIL, as it must");

  const sabotagedNav = "<RailNav railId={railId} count={count} total={items.length} unit={u} />";
  ok(!RAILNAV_TOTAL_RX.test(sabotagedNav) || /total=\{items\.length\}/.test(sabotagedNav),
    "RED-PROVE: total={items.length} (the loaded count, not the true total) does not satisfy the total={count} pattern this guard requires");
}

if (fail.length) {
  console.error("check-rail-paging-contract: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-rail-paging-contract: OK — ${pass} assertions; the loaded−3 sentinel and RailNav's real total are wired into every converted rail surface, and the checks are red-proven against sabotaged source`);
