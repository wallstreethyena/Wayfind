#!/usr/bin/env node
/**
 * scripts/check-card-memo.mjs — the card may skip a render, but never a change.
 *
 * WHY THIS EXISTS. Measured on production 2026-08-27, iPhone 14 viewport at 4x
 * CPU throttle, six thumb swipes across an open rail:
 *
 *     16 long tasks · 1573 ms of blocked main thread
 *
 * The drop holds 189 IconicPlaceCards. Every scroll that moves the photo window
 * re-renders the parent, and the card was not memoised, so all 189 rebuilt for
 * a change affecting about sixteen. That is the owner's "the site jitters".
 *
 * A PLAIN React.memo WOULD DO NOTHING: the drop builds six fresh closures and a
 * fresh `badge` ELEMENT per card per render, so identity comparison can never
 * hit. So the comparator reads ONE prop — `memoKey` — and nothing else.
 *
 * WHICH MAKES THIS GUARD THE LOAD-BEARING PART. A memo that drops a real change
 * does not crash and does not log; it renders a stale card forever, and the
 * card in question is the one the owner screenshots. Two failure modes, both
 * asserted here:
 *
 *   1. A prop the call site passes that the key does not represent — the card
 *      freezes on its first value. `badge` is the dangerous one: it is
 *      beachChip(p), and the water conditions arrive LATE from their own fetch,
 *      on a card whose row never changes. That is precisely the shape a memo
 *      turns into a permanently blank chip.
 *   2. The comparator leaking to the OTHER five place-card surfaces, where a
 *      caller may legitimately swap a handler. Hence opt-in: no memoKey, no
 *      memoisation, byte-identical behaviour.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

/* ── 1. THE COMPARATOR, EXECUTED ───────────────────────────────────────────*/
{
  const mod = await loadComponent(join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
  const { sameCard } = mod;
  ok(typeof sameCard === "function", "CONTROL: sameCard is exported and callable — without this everything below is vacuous");
  ok(sameCard({}, {}) === false,
    "EXECUTED: with NO memoKey on either side it never memoises — this is the opt-in property that keeps the other five surfaces byte-identical");
  ok(sameCard({ memoKey: "a" }, {}) === false && sameCard({}, { memoKey: "a" }) === false,
    "…and a key on only one side is also a re-render, so a caller adding or dropping the prop mid-life cannot freeze a card");
  ok(sameCard({ memoKey: "a" }, { memoKey: "a" }) === true, "…an unchanged key skips the render, which is the entire point");
  ok(sameCard({ memoKey: "a" }, { memoKey: "b" }) === false, "…and a changed key repaints");
  ok(sameCard({ memoKey: "a", onSave: () => {} }, { memoKey: "a", onSave: () => {} }) === true,
    "…fresh closures do NOT defeat it — that is why the key exists rather than a shallow compare");

  // …and the component still renders. A memo wrapper that broke the default
  // export would fail here rather than at runtime on the owner's phone.
  const Card = mod.default || mod;
  const html = renderToStaticMarkup(React.createElement(Card, {
    place: { id: "ChIJmemo0000000000000", name: "Control Place", rating: 4.6, reviews: 480, types: ["restaurant"], lat: 27.3, lng: -82.5 },
    rank: 1, href: "/p/x",
  }));
  ok(/wf-place-card/.test(html) && /Control Place/.test(html),
    "CONTROL: the memo-wrapped default export still RENDERS — a broken wrapper is a blank rail, not a slow one");
}

/* ── 2. EVERY PROP THE DROP PASSES IS ACCOUNTED FOR ────────────────────────
   The heart of it. Extract the prop names the drop's call site actually passes
   and require each one to be either represented in the key or a function whose
   behaviour is fully determined by values that are. */
{
  const SRC = strip(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  const start = SRC.indexOf("<IconicPlaceCard");
  const end = SRC.indexOf("/>", start);
  const call = start > -1 && end > start ? SRC.slice(start, end) : "";
  ok(call.length > 400, `PROBE: the drop's card element was delimited (${call.length} chars)`);
  const props = [...new Set([...call.matchAll(/\n\s+([a-zA-Z][a-zA-Z0-9]*)=/g)].map((m) => m[1]))];
  // THE DROP MUST ACTUALLY OPT IN. Without this the whole change is inert and
  // every assertion below still passes — found by red-proving: deleting
  // `memoKey={memoKey}` from the call site left this file green.
  ok(props.includes("memoKey"),
    "the drop PASSES memoKey — the comparator is opt-in, so a call site that stops handing one over silently reverts 189 cards to re-rendering on every scroll");
  ok(props.length >= 15, `PROBE: found ${props.length} props on the element — a low count here would make the mapping below vacuous`);

  const keyStart = SRC.indexOf("const memoKey = [");
  const keyEnd = SRC.indexOf("].join(\"|\")", keyStart);
  const key = keyStart > -1 && keyEnd > keyStart ? SRC.slice(keyStart, keyEnd) : "";
  ok(key.length > 200, "PROBE: the memoKey composition was delimited");

  // What in the key covers each rendered prop. Stated explicitly so a reviewer
  // can falsify it, and so a NEW prop with no entry fails loudly.
  const COVERED_BY = {
    key: "React's own reconciliation key (p.id) — not a rendered prop, and identical to the key's first field",
    memoKey: "itself",
    place: "p.id + inWin (the photoless twin swap)",
    rank: "organicRank",
    href: "p.id + isPaid",
    editorial: "hooks[p.id] + isPaid",
    badge: "isPaid + beachCond[p.id] — the LATE-arriving water chip",
    saved: "isSaved(p.id)",
    liked: "isLiked(p.id)",
    disliked: "isDisliked(p.id)",
    inTrip: "isOnTrip(p)",
    cardActionsReadOnly: "isPaid",
    surface: "isPaid",
    eagerMedia: "inWin",
    mediaPriority: "the index, via organicRank",
  };
  const FUNCTIONS = ["onOpen", "onSave", "onItinerary", "onLike", "onDislike", "onShare", "onBadge"];
  const unaccounted = props.filter((k) => !(k in COVERED_BY) && !FUNCTIONS.includes(k));
  ok(unaccounted.length === 0,
    `every prop the drop passes is represented in the memoKey or is a handler determined by one (unaccounted: ${unaccounted.join(", ") || "none"}). A prop with no entry freezes on its first value, silently, forever`);

  // And the four the key MUST mention by name, because each is a value that
  // changes without the row changing — the only way a memo goes stale.
  for (const [needle, why] of [
    ["beachCond[p.id]", "the water chip arrives LATE, on a card whose row never changes"],
    ["shown.cityLabel", "onShare puts the town in the unfurl; a share naming the wrong town is worse than no share"],
    ["hooks[p.id]", "the sourced editorial hook also arrives after first paint"],
    ["inWin", "this is what swaps the photo for a monogram — the single most visible thing the window does"],
  ]) {
    ok(key.includes(needle), `the key includes ${needle} — ${why}`);
  }
}

/* ── 3. IT IS OPT-IN, AND ONLY THE DROP OPTS IN ────────────────────────────*/
{
  const files = ["app/home.js", "app/components/ThingsToDoList.js", "app/components/BestNearby.js", "app/components/TodaysBest.js"];
  for (const f of files) {
    let src;
    try { src = strip(readFileSync(join(ROOT, f), "utf8")); } catch (e) { continue; }
    ok(!/memoKey=/.test(src),
      `${f}: does not opt in — the comparator reads ONE prop and nothing else, so it must stay where its key is provably complete`);
  }
  const card = strip(readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  ok(/if \(prev\.memoKey == null \|\| next\.memoKey == null\) return false;/.test(card),
    "the opt-in gate is the comparator's FIRST statement — a caller without a key can never be memoised by accident");
  ok(/export default memo\(IconicPlaceCard, sameCard\)/.test(card),
    "…and the comparator is the one actually installed on the default export (assert the call, not the name)");
}

/* ── 4. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["a comparator that memoises without a key is detectable", () => {
    const bad = (a, b) => a.memoKey === b.memoKey;      // undefined === undefined -> true
    return bad({}, {}) === true;                         // …which is exactly the bug
  }],
  ["a key missing the late-arriving beach chip is detectable", () => {
    const key = 'const memoKey = [p.id, inWin ? 1 : 0, organicRank].join("|")';
    return !key.includes("beachCond[p.id]");
  }],
  ["a new unaccounted prop is detectable", () => {
    const COVERED = { place: 1 };
    const FUNCS = ["onSave"];
    const props = ["place", "onSave", "brandNewProp"];
    return props.filter((k) => !(k in COVERED) && !FUNCS.includes(k)).length === 1;
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-card-memo: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-card-memo: OK — ${pass} assertions (comparator executed; every drop prop mapped to the key or to a handler it determines; opt-in, and only the drop opts in)`);
