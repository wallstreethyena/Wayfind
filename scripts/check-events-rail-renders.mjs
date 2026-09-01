#!/usr/bin/env node
// scripts/check-events-rail-renders.mjs — A VALUE THAT IS COMPUTED AND NEVER
// USED IS A FEATURE THAT DOES NOT EXIST.
//
// v8.87 (owner, 2026-08-28, by voice): "we don't even have an events, uh,
// rail. Like, we gotta develop an events rail. for, like, concerts and
// tickets."
//
// He was right about the surface and wrong only about the cause. Every part of
// the events rail existed and had for a year — the nine-provider feed, the
// owner's own bestFirst ranking ("I want to display the best events"),
// EventRailCard with save/like/dislike/share/category wiring, and
// EV_RAIL_MIN_H reserving its measured height so the skeleton swap moves
// nothing. What did not exist was one JSX reference. `eventsRailSlot` appeared
// exactly TWICE in 12,000 lines: its own declaration, and a comment claiming
// it renders "as section nine of BestNearby". It rendered in no section.
//
// The same one-line sweep found a second one immediately: `picksHook`, a
// fallback Wayfind Picks entry, also computed and also never referenced.
//
// WHY NOTHING CAUGHT IT. This is CLAUDE.md's "reachability is transitive" trap
// in its purest form, and every existing layer is blind to it by design:
//   · `next build` bundles it — an unrendered expression is legal JavaScript.
//   · `tsc --noEmit --allowJs` type-checks it — an unused local is not an error.
//   · check-lib-call-imports asks whether a called name is IN SCOPE; this name
//     was in scope and simply never called for.
//   · every source guard in the repo asserts a thing EXISTS. This is the
//     inverse: the thing existed perfectly and was wired to nothing.
//
// So this guard asserts USE, and it does it generally rather than only for the
// rail that prompted it — the whole point is the NEXT one.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// COMMENTS ARE NOT CODE, and stripping them is load-bearing here rather than
// hygiene: `eventsRailSlot`'s two occurrences were its declaration and a
// comment asserting "the real events rail is `eventsRailSlot` — section nine
// of BestNearby". Counted raw, that tombstone reads as a live reference and
// this guard goes green on the exact bug it exists for.
//
// String literals are deliberately NOT blanked. The obvious blanker (a regex
// for backtick templates) cannot see nested `${...}` braces, so on a 12k-line
// file full of them it swallows whole regions and the positive control below
// went to zero the first time it was tried — a guard that scans nothing. An
// identifier of this shape appearing inside a string is not a failure mode
// this file has; a mangled scan is.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const homeRaw = readFileSync(join(ROOT, "app/home.js"), "utf8");
const home = stripComments(homeRaw);
const railRaw = readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8");
const rail = stripComments(railRaw);

// ── 1. THE GENERAL RULE ─────────────────────────────────────────────────────
// Every component-depth const in app/home.js that RETURNS MARKUP must be
// referenced somewhere other than its own declaration. That is the shape both
// dead surfaces had, and an unreferenced one is, definitionally, a surface
// built for nobody.
//
// Three deliberate narrowings, each one a false positive this guard would
// otherwise have: component depth only (a helper declared inside a `.map`
// callback is read inside that closure); JSX-returning only (an unused pure
// helper is lint's job, not a missing surface); and reference COUNT rather
// than any judgment about where the reference is, because that question has
// exactly one right answer and a regex can get it right.
{
  const decls = [];
  const lines = home.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Both shapes this file uses to build a value it means to render: the
    // immediately-invoked `(() => { … })()` and the thunk `() => { … }` the
    // events rail became when it had to stop allocating for a closed drop.
    // Scoped to component depth (two spaces) so a nested helper inside a map
    // callback is not swept — a name declared inside a closure is read there
    // and this file has thousands of them.
    const m = /^  const ([A-Za-z_$][\w$]*) = (?:\(\(\) => \{|\(\) => \{)\s*$/.exec(lines[i]);
    if (!m) continue;
    // …and only the ones that build MARKUP. An unused pure helper is lint's
    // job; a JSX-returning value that nothing reads is a surface the reader
    // was promised and never got, which is the defect this file is about.
    let j = i + 1;
    while (j < lines.length && lines[j] !== "  };" && lines[j] !== "  })();") j++;
    if (!/return \(\s*\n\s*<\/?/.test(lines.slice(i, j).join("\n"))) continue;
    decls.push({ name: m[1], line: i + 1 });
  }
  ok(decls.length >= 2,
    `positive control: app/home.js still builds markup this way (found ${decls.length} JSX-returning const(s) at component depth; a 0 here means the shape moved and this guard has quietly stopped asking anything — which is the failure mode it exists to catch, so it is an assertion, not a note)`);
  for (const d of decls) {
    const refs = (home.match(new RegExp(`\\b${d.name}\\b`, "g")) || []).length;
    ok(refs >= 2,
      `app/home.js:${d.line} \`${d.name}\` is computed and then USED (${refs} reference(s) with comments stripped — 1 means it is declared and rendered for nobody, which is how the events rail was missing for a year while every part of it existed)`);
  }
}

// ── 2. THE EVENTS RAIL, SPECIFICALLY, ALL THE WAY TO THE COMPONENT ──────────
// Rule 1 alone would go green if `eventsRailSlot` were referenced by anything
// at all — a console.log, a dead variable. These pin the actual chain:
// declared in home.js -> handed to <DaypartRail> -> DESTRUCTURED there ->
// RENDERED there. Every hop is where the last one broke.
{
  ok((home.match(/const eventsRailSlot\s*=/g) || []).length === 1,
    "eventsRailSlot is declared exactly once in app/home.js");
  ok(/eventsSlot=\{eventsRailSlot\}/.test(home),
    "…and is PASSED to <DaypartRail> as eventsSlot — the hop that did not exist: the value was computed inside the `screen === \"suggested\"` IIFE and handed to nothing");

  // A prop that a component accepts and ignores is the same dead end one file
  // over, so both halves are asserted in DaypartRail: the parameter, and a JSX
  // expression container that actually paints it.
  ok(/^\s*eventsSlot\s*=\s*null,\s*$/m.test(rail),
    "DaypartRail DESTRUCTURES eventsSlot in its props (defaulting to null, so /v8 and an empty feed keep the old behaviour)");
  ok(/\{eventsSlot\(\)\}/.test(rail),
    "…and CALLS it inside a JSX expression container — accepting a prop is not showing it, and the thunk is not a node until it is invoked");

  // The tile must open the drop when there is one, and keep the hand-off when
  // there is not. Both directions, because a guard that only pinned the new
  // branch would go green on a version that navigated away every time.
  ok(/if \(id === "events" && \(!eventsSlot \|\| !eventsSlot\(\)\) && onOpenEvents\)/.test(rail),
    "the events tile navigates away when the slot has NOTHING to show — testing the prop alone would always be truthy (it is a function), so a reader with no events near them would meet a shelf of bars under a rail that promises dates (weaker check, source: DaypartRail imports next/dynamic and cannot be loaded into node)");
  ok(/selRail\.id === "events" && eventsSlot/.test(rail),
    "…and the drop paints the slot when the open rail IS events — the negative half: a slot rendered under every rail would be worse than none");
  ok(/selRail\.id === "datenight" \|\| selRail\.id === "birthday" \|\| selRail\.id === "breakfast" \|\| selRail\.id === "events"/.test(rail),
    "Date Night, Birthday, Breakfast, and Events own their answers and cannot fall through into generic venue place cards");
}

// ── 3. THE RAIL'S PROMISE MATCHES WHAT IS BEHIND IT ─────────────────────────
// lib/rails.js declares this rail's axis as "the date — it happens once, then
// it is gone". That claim is only honest if the drop carries dated events, so
// the ranking that produces them is asserted to be the owner's, by name.
{
  ok(/\bbestFirst\(/.test(home),
    "the events drop ranks with lib/frontEvents bestFirst (owner, v6.69: \"I want to display the best events\") — not by whatever the providers returned first");
  ok(/<EventRailCard\b/.test(home),
    "…and paints EventRailCard, the card that carries the ticket destination — a place card cannot keep this rail's date promise");
}

console.log(`\ncheck-events-rail-renders: ${fail ? "FAIL" : "OK"} — ${pass} assertions; every JSX-returning const at component depth in app/home.js proven to be READ (the sweep that found both dead surfaces), plus the events chain pinned hop by hop from the declaration to the JSX that paints it. False-positive surface: a component-depth const that returns JSX and is deliberately never rendered would fail rule 1 — that is the defect, not an exception.`);
process.exit(fail ? 1 : 0);
