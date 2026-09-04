#!/usr/bin/env node
// scripts/check-card-action-parity.mjs — EVERY RAIL CARD CARRIES THE FOUR.
//
// THE OWNER'S REPORT (2026-09-03, verbatim): "Audit all of the place cards to
// make sure they are all looking the same. Every rail card, regardless of
// what it is, should have the like, dislike, share and save button — even if
// it is an event card. They all need to have that as a global rule, and the
// guardrails that have been created are not catching that. It keeps
// happening on the site."
//
// PR #1097 ("Unify premium cards and upgrade event planning", landed the same
// day) already did most of this: RailCard.js and IconicPlaceCard.js resolve
// every non-place subject (event / tour / a sponsor row with no store key)
// through lib/contentCardActions.js, a shared non-place signal store that
// never touches place ranking — and scripts/check-card-actions.mjs (Section
// 5) pins that architecture with static-source assertions. What #1097 did
// NOT reach: two components that draw their OWN action row from scratch
// rather than going through RailCard/IconicPlaceCard —
// SponsoredPlaceCard.js shipped with ZERO of the four controls, and
// ThingsToDoList.js's inline tour Card had only Book and a conditional
// Share. Neither is a render-SITE problem check-card-actions.mjs's regexes
// were built to catch — nothing wires an onSave prop into a component that
// resolves its own subject internally from a registry row or a list item.
//
// THIS GUARD closes that class of gap the only way that survives a THIRD
// (now fourth, fifth, ...) hand-rolled card nobody remembers to add to a list:
//
//   1. ENUMERATE rail-card components FROM THE FILESYSTEM. A "renderer" is any
//      file under app/components/ whose JSX itself sets all four action
//      classNames (wf-place-card-save/like/dislike/share) — i.e. it draws its
//      own action row rather than merely delegating to one. No hand-typed
//      file list: a sixth hand-rolled card is discovered the same way the
//      first four were.
//   2. FAIL on any discovered renderer this guard has no render adapter for.
//      Coverage is enforced by DISCOVERY, not by an author remembering to
//      wire a new file in — the exact failure mode this file exists to end.
//   3. RENDER each covered component, through scripts/lib/jsxLoad.mjs (the
//      real component compiled from real JSX, never a hand-copied
//      lookalike), against every SUBJECT SHAPE it plausibly carries (place /
//      event / sponsored / tour), and assert all four controls appear in the
//      rendered output.
//   4. RED-PROVE the assertion, not just run it: delete the Share control
//      from a scratch copy of a real renderer, confirm the deletion actually
//      applied (CLAUDE.md: "a mutation that silently fails to apply is
//      indistinguishable from a guard that correctly passed"), and confirm
//      THIS GUARD'S OWN CHECK goes red on it.
//
// Wrapper components (a rail like FallIntentRails.js that imports RailCard or
// IconicPlaceCard and hands it props) are enumerated too, for the false-
// positive-surface count, but are not independently re-rendered here — their
// four controls are RailCard's/IconicPlaceCard's own render, which this guard
// already renders directly. A wrapper that reimplements its own action row
// instead of delegating is, by definition, a RENDERER (rule 1) and falls
// under rule 2's coverage-or-fail net regardless of what it imports.
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { hydrateSponsoredPlace, sponsoredPlaceById } from "../lib/sponsoredPlaces.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { c ? pass++ : fails.push(m); };

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTION_CLASS = ["save", "like", "dislike", "share"];

// ── 1. ENUMERATE — filesystem, never a hand-typed list ─────────────────────
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" || n === ".vercel" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});

// A file "draws its own action row" when its OWN source sets all four action
// classNames as JSX className values. Checked against className=…, never a
// bare substring — css.js defines the identical four names as CSS SELECTORS
// (".wf-place-card-save{…}"), which a bare-substring check would misread as a
// fifth "renderer" every single run.
function isRenderer(strippedSrc) {
  return ACTION_CLASS.every((k) =>
    new RegExp(`className=[^\\n]{0,80}\\bwf-place-card-${k}\\b`).test(strippedSrc));
}
function usesSharedCard(strippedSrc) {
  return /from\s+["'][^"']*\/(RailCard|IconicPlaceCard)(\.js)?["']/.test(strippedSrc);
}

const COMPONENTS_DIR = join(ROOT, "app/components");
const renderers = [];
const wrappers = [];
for (const abs of walk(COMPONENTS_DIR)) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (/__redprove_scratch/.test(rel)) continue; // this guard's own red-prove leftover, if a prior run died mid-write
  const src = strip(readFileSync(abs, "utf8"));
  if (isRenderer(src)) renderers.push(rel);
  else if (usesSharedCard(src)) wrappers.push(rel);
}
ok(renderers.length >= 3,
  `PROBE: discovery found rail-card renderer components (got ${renderers.length}: ${renderers.join(", ") || "none"}) — this guard has lost its subject if this count drops`);
ok(wrappers.length >= 5,
  `PROBE: discovery found rail-card WRAPPER components that delegate to RailCard/IconicPlaceCard (got ${wrappers.length}) — proves the discovery regex actually distinguishes the two shapes rather than finding nothing`);

// ── 2. COVER — every discovered renderer must have a render adapter ────────
const NOOP = () => {};
const FIXTURE_PLACE = {
  id: "parity-fixture-place", name: "Parity Fixture Place",
  rating: 4.6, reviews: 120, types: ["restaurant"], primaryType: "restaurant",
  lat: 27.4214874, lng: -82.5367616, distMi: 3.1, governed_score: 80,
};
const FIXTURE_PLACE_ROW = { id: "parity-fixture-place-row", kind: "place", title: "Parity Fixture Place Row", rating: 4.5, reviews: 88, governed_score: 75 };
const FIXTURE_TOUR_ROW = {
  id: "parity-fixture-tour", kind: "experience", title: "Parity Fixture Kayak Tour",
  rating: 4.8, reviews: 240, price_from: 59, duration_min: 120,
};
// A REAL registry row (scripts/check-sponsored-places.mjs uses the same one)
// — never an invented fixture for the sponsored card, since its own guard
// already proves this id is live.
const rio = sponsoredPlaceById("rio-body-wax-gastonia");
ok(!!rio, "PROBE: the real sponsored-place registry fixture (rio-body-wax-gastonia) exists — the sponsored-card shapes below need a real row");
const pickWithPlace = rio ? hydrateSponsoredPlace(rio, { lat: rio.lat, lng: rio.lng }) : null;
// The defensive floor: SPONSORED_PLACES REQUIRES placeId on every real entry
// (scripts/check-sponsored-places.mjs), so a placeId-less pick never ships —
// this shape exists to prove the content-store branch still renders all four
// IF that invariant were ever violated, not to describe a real row.
const pickNoPlace = rio ? hydrateSponsoredPlace({ ...rio, placeId: undefined }, { lat: rio.lat, lng: rio.lng }) : null;

const ADAPTERS = {
  "app/components/RailCard.js": {
    async load() { return (await loadComponent(join(ROOT, "app/components/RailCard.js"), ROOT)).default; },
    shapes(Comp) {
      return [
        { shape: "place", el: React.createElement(Comp, { title: "Parity Place", place: FIXTURE_PLACE, rank: 1, href: "/p/x", onSave: NOOP, onLike: NOOP, onDislike: NOOP, onShare: NOOP, saved: false, liked: false, disliked: false }) },
        { shape: "event", el: React.createElement(Comp, { title: "Parity Event", actionItem: { id: "parity-fixture-event", type: "event", title: "Parity Event", image: null, url: "/florida-events/parity-fixture-event" }, rank: 1, href: "/florida-events/x" }) },
        { shape: "tour", el: React.createElement(Comp, { title: "Parity Tour", actionItem: { id: "parity-fixture-tour", type: "experience", title: "Parity Tour", image: null, url: "https://viator.example/x", provider: "viator" } }) },
      ];
    },
  },
  "app/components/IconicPlaceCard.js": {
    async load() { return (await loadComponent(join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default; },
    shapes(Comp) {
      return [
        { shape: "place", el: React.createElement(Comp, { place: FIXTURE_PLACE, rank: 1, href: "/p/x", onSave: NOOP, onLike: NOOP, onDislike: NOOP, onShare: NOOP }) },
        // cardActionsReadOnly: a placement whose signals must not enter the
        // place-ranking store — routed through lib/contentCardActions.js,
        // keyed by the place's own id, per PR #1097.
        { shape: "sponsored", el: React.createElement(Comp, { place: FIXTURE_PLACE, rank: 1, href: "/p/x", cardActionsReadOnly: true }) },
      ];
    },
  },
  "app/components/SponsoredPlaceCard.js": {
    async load() { return (await loadComponent(join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT)).default; },
    shapes(Comp) {
      return [
        pickWithPlace ? { shape: "place", el: React.createElement(Comp, { pick: pickWithPlace }) } : null,
        pickNoPlace ? { shape: "sponsored", el: React.createElement(Comp, { pick: pickNoPlace }) } : null,
      ].filter(Boolean);
    },
  },
  "app/components/ThingsToDoList.js": {
    async load() { return (await loadComponent(join(ROOT, "app/components/ThingsToDoList.js"), ROOT)).Card; },
    shapes(Comp) {
      return [
        { shape: "tour", el: React.createElement(Comp, { r: FIXTURE_TOUR_ROW, rank: 1, city: "Sarasota" }) },
        // isTour false delegates entirely to IconicPlaceCard — rendered here
        // too, for defense in depth, not because the logic differs.
        { shape: "place", el: React.createElement(Comp, { r: FIXTURE_PLACE_ROW, rank: 1, city: "Sarasota", onSave: NOOP, onLike: NOOP, onDislike: NOOP, onShare: NOOP }) },
      ];
    },
  },
};

for (const rel of renderers) {
  ok(!!ADAPTERS[rel],
    `${rel}: DISCOVERED as a rail-card component that draws its own action row (all four wf-place-card-* classNames appear in its own source), but this guard has no render adapter for it. A new hand-rolled card can ship with all four controls missing and nothing here would catch it — add an ADAPTERS entry for ${rel} in scripts/check-card-action-parity.mjs.`);
}

// ── 3. RENDER — real component, real subject shape, assert all four ───────
function hasControl(html, k) {
  return new RegExp(`class="[^"]*\\bwf-place-card-${k}\\b`).test(html);
}
function missingControls(html) {
  return ACTION_CLASS.filter((k) => !hasControl(html, k));
}

let renderCount = 0;
const shapesSeen = new Set();
for (const rel of renderers) {
  const adapter = ADAPTERS[rel];
  if (!adapter) continue; // already failed above; do not compound the noise
  let Comp;
  try { Comp = await adapter.load(); }
  catch (e) { ok(false, `${rel}: failed to load through jsxLoad — ${e.constructor.name}: ${e.message}`); continue; }
  ok(typeof Comp === "function" || (Comp && typeof Comp === "object" && Comp.$$typeof),
    `${rel}: PROBE the exported component actually loaded (got ${typeof Comp})`);
  if (!Comp) continue;
  const cases = adapter.shapes(Comp);
  ok(cases.length > 0, `${rel}: PROBE at least one subject shape is exercised`);
  for (const c of cases) {
    shapesSeen.add(c.shape);
    let html = "";
    let threw = null;
    try { html = renderToStaticMarkup(c.el); }
    catch (e) { threw = e; }
    ok(!threw, `${rel} × ${c.shape}: rendering threw — ${threw ? threw.constructor.name + ": " + threw.message : ""}`);
    if (threw) continue;
    renderCount++;
    const missing = missingControls(html);
    ok(missing.length === 0,
      `${rel} × ${c.shape}: missing ${missing.join(", ")} in the rendered output — WO-B requires all four controls to render`);
  }
}
ok(renderers.length === 0 || ["place", "event", "sponsored", "tour"].every((s) => shapesSeen.has(s)),
  `PROBE: the render matrix covers all four subject shapes across renderers (got: ${[...shapesSeen].join(", ") || "none"})`);

// ── 4. RED-PROVE — the assertion catches the mutation it exists to catch ──
// Deletes the Share control's className from a SCRATCH COPY of a real
// renderer (IconicPlaceCard.js — the file the owner named), inside
// app/components/ so relative imports (../../lib/cardActions etc.) still
// resolve the same as the original. Two things are proven, not assumed:
//   (a) the mutation actually landed in the file jsxLoad compiles — printed
//       and asserted, per CLAUDE.md's "a mutation that silently fails to
//       apply is indistinguishable from a guard that correctly passed";
//   (b) THIS guard's own missingControls() check reports "share" missing.
async function redProveShareRemoval() {
  const srcPath = join(ROOT, "app/components/IconicPlaceCard.js");
  const original = readFileSync(srcPath, "utf8");
  const target = 'className="wf-place-card-share"';
  const targetCount = original.split(target).length - 1;
  if (targetCount < 1) {
    return { setupOk: false, reason: `red-prove setup failed: ${JSON.stringify(target)} was not found in IconicPlaceCard.js at all — the mutation would have nothing to delete and a "red" result would prove nothing` };
  }
  // Full replacement, not a suffix appended to the original token: a class
  // name that still CONTAINS "wf-place-card-share" as a substring (even with
  // a trailing "-something") still satisfies \bwf-place-card-share\b, because
  // "-" is a non-word character and therefore itself a word boundary. Proven
  // the hard way while writing this guard — appending "-DELETED" to the
  // token left a class name that still matched, and the red-prove came back
  // green. The replacement below shares no substring with the original token.
  const mutated = original.split(target).join('className="wf-parity-redprove-axed"');
  const mutatedCount = (mutated.match(/wf-parity-redprove-axed/g) || []).length;
  console.log(`  red-prove: replacing ${targetCount} occurrence(s) of ${JSON.stringify(target)} in a scratch copy of IconicPlaceCard.js — ${mutatedCount} replacement(s) actually landed`);
  const scratchPath = join(ROOT, "app/components/__redprove_scratch_IconicPlaceCard.js");
  writeFileSync(scratchPath, mutated);
  try {
    const mod = await loadComponent(scratchPath, ROOT);
    const Comp = mod.default;
    const html = renderToStaticMarkup(React.createElement(Comp, {
      place: FIXTURE_PLACE, rank: 1, href: "/p/x", onSave: NOOP, onLike: NOOP, onDislike: NOOP, onShare: NOOP,
    }));
    const missing = missingControls(html);
    console.log(`  red-prove: sabotaged render is missing [${missing.join(", ")}] — expected exactly ["share"]`);
    return { setupOk: true, mutationApplied: mutatedCount === targetCount, caughtRed: missing.includes("share") && missing.length === 1 };
  } finally {
    try { unlinkSync(scratchPath); } catch (e) {}
  }
}

const rp = await redProveShareRemoval();
ok(rp.setupOk, rp.reason || "red-prove: setup found its mutation target");
if (rp.setupOk) {
  ok(rp.mutationApplied, "red-prove: the sabotage actually applied to the scratch copy — every targeted occurrence was replaced (not a silent no-op)");
  ok(rp.caughtRed, "red-prove: deleting Share's className from a real renderer makes THIS GUARD'S OWN missingControls() check report exactly [\"share\"] missing — the assertion is not decoration, it catches the exact mutation it exists to catch");
}

// ── report ──────────────────────────────────────────────────────────────
if (fails.length) {
  console.error("check-card-action-parity: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-card-action-parity: OK — ${pass} assertions; enumerated ${renderers.length} rail-card renderer component(s) (${renderers.join(", ")}) from the filesystem and ${wrappers.length} wrapper(s) that delegate to them; ${renderCount} component × subject-shape render(s) checked for all four controls; red-prove confirmed both the mutation applied and this guard's own check went red on it. False-positive surface: ${renderers.length} rail-card component(s) × ${shapesSeen.size} subject shape(s) = ${renderCount} render(s) actually asserted.`);
