#!/usr/bin/env node
// scripts/check-trend-pulse.mjs — the trending pulse on place cards
// (owner, 2026-10-08: "anything that is trending i want a pulse behind the
// place card"). Locks four things:
//   1. The rule (lib/trendPulse.js): pulse ⇔ trending === true AND a
//      non-empty trend_reason. Positive and negative controls.
//   2. Both place card renderers wire it on the card ROOT: RailCard and
//      IconicPlaceCard call trendPulseClass(place) inside the root className.
//   3. A REAL RailCard render: a trending row gets "is-trending" and the
//      reason in its accessible name; a quiet row, a reasonless row and a
//      non-place card get neither (the probe is proven to find the positive
//      first, so the negatives cannot pass vacuously).
//   4. The CSS: the keyframes exist, the card class runs them, and reduced
//      motion turns the animation off (a still glow instead).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { isTrendingPlace, trendPulseClass, trendPulseLabel } from "../lib/trendPulse.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };
// Code only: comments and string contents out, so a guard can never be
// satisfied by its own explanatory comment.
const code = (rel) => readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ---- 1. the rule ------------------------------------------------------------
const hot = { id: "a", name: "Hot", trending: true, trend_reason: "Filmed by 2 local creators" };
ok(isTrendingPlace(hot) && trendPulseClass(hot) === " is-trending", "POSITIVE: trending + reason pulses");
ok(trendPulseLabel("Hot", hot) === "Hot. Trending: Filmed by 2 local creators", "POSITIVE: accessible name carries the reason");
ok(trendPulseLabel("", hot) === "Trending: Filmed by 2 local creators", "POSITIVE: reason alone when there is no base label");
for (const [why, row] of [
  ["null row", null], ["undefined row", undefined], ["empty row", {}],
  ["trending false", { trending: false, trend_reason: "x" }],
  ["truthy non-boolean trending", { trending: "yes", trend_reason: "x" }],
  ["trending 1", { trending: 1, trend_reason: "x" }],
  ["no reason", { trending: true }], ["null reason", { trending: true, trend_reason: null }],
  ["blank reason", { trending: true, trend_reason: "   " }], ["non-string reason", { trending: true, trend_reason: 7 }],
]) {
  ok(!isTrendingPlace(row) && trendPulseClass(row) === "", `NEGATIVE: ${why} never pulses`);
  ok(trendPulseLabel("Quiet", row) === "Quiet", `NEGATIVE: ${why} leaves the accessible name alone`);
}

// ---- 2. wiring on both card roots --------------------------------------------
const rail = code("app/components/RailCard.js");
const iconic = code("app/components/IconicPlaceCard.js");
ok(/import\s*\{[^}]*\btrendPulseClass\b[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/trendPulse\.js"/.test(rail), "RailCard imports trendPulseClass from lib/trendPulse.js");
ok(/import\s*\{[^}]*\btrendPulseClass\b[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/trendPulse\.js"/.test(iconic), "IconicPlaceCard imports trendPulseClass from lib/trendPulse.js");
ok(/className=\{`wf-place-card wf-rail-card[^`]*\$\{trendPulseClass\(place\)\}[^`]*`\}/.test(rail), "RailCard root className includes ${trendPulseClass(place)}");
ok(/className=\{`wf-place-card\$\{[^`]*\$\{trendPulseClass\(place\)\}[^`]*`\}/.test(iconic), "IconicPlaceCard root className includes ${trendPulseClass(place)}");
ok((rail.match(/trendPulseClass\(/g) || []).length === 1 && (iconic.match(/trendPulseClass\(/g) || []).length === 1, "exactly one trendPulseClass( call per card file (the root, nowhere else)");
ok(/aria-label=\{trendPulseLabel\(ariaLabel \|\| title, place\)\}/.test(rail), "RailCard's accessible name goes through trendPulseLabel");

// ---- 3. a real RailCard render -------------------------------------------------
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const noop = () => {};
const common = { photo: "/x.webp", onSave: noop, onLike: noop, onDislike: noop, onShare: noop, href: "/p/x", eyebrow: "Arts", facts: ["St. Petersburg"] };
const row = (extra) => ({ id: "ChIJtrendPulseProbe", name: "Probe", lat: 27.76, lng: -82.66, ...extra });
const html = (props) => renderToStaticMarkup(React.createElement(RailCard, { ...common, ...props }));
const rootClass = (h) => ((h.match(/<article[^>]*class="([^"]*)"/) || [])[1] || "");
const rootLabel = (h) => ((h.match(/<article[^>]*aria-label="([^"]*)"/) || [])[1] || "");
const hotHtml = html({ title: "Hot Place", place: row({ trending: true, trend_reason: "Popular with locals right now" }) });
ok(/\bwf-place-card\b/.test(rootClass(hotHtml)), "PROBE: the render produced a card root the probe can read");
ok(/(^|\s)is-trending(\s|$)/.test(rootClass(hotHtml)), "RENDER: a trending row's card root carries is-trending");
ok(rootLabel(hotHtml) === "Hot Place. Trending: Popular with locals right now", `RENDER: trending card's accessible name carries the reason (got "${rootLabel(hotHtml)}")`);
for (const [why, props] of [
  ["quiet row", { title: "Quiet", place: row({ trending: false, trend_reason: null }) }],
  ["reasonless row", { title: "Quiet", place: row({ trending: true, trend_reason: "" }) }],
  ["no place (event / tour card)", { title: "Quiet", place: null }],
]) {
  const h = html(props);
  ok(/\bwf-place-card\b/.test(rootClass(h)), `PROBE: ${why} rendered a card root`);
  ok(!/(^|\s)is-trending(\s|$)/.test(rootClass(h)), `RENDER: ${why} does not pulse`);
  ok(rootLabel(h) === "Quiet", `RENDER: ${why} keeps its plain accessible name`);
}

// ---- 4. the CSS --------------------------------------------------------------
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const css = String(WF_PLACE_CARD_CSS || "");
ok(css.length > 1000, "PROBE: WF_PLACE_CARD_CSS loaded");
ok(/@keyframes wfTrendPulse\{/.test(css), "CSS: @keyframes wfTrendPulse exists in the place card CSS");
ok(/\.wf-place-card\.is-trending\{[^}]*animation:wfTrendPulse [^;}]*infinite/.test(css), "CSS: .wf-place-card.is-trending runs wfTrendPulse");
ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\.wf-place-card\.is-trending\{animation:none;outline:[^;]+;outline-offset:[^;]+;box-shadow:[^}]+\}/.test(css), "CSS: reduced motion stops the pulse and shows a still glow");
ok(!/\.is-trending[^{]*\{[^}]*(?:transform|width|height|margin|padding)\s*:/.test(css), "CSS: the pulse never changes the card's size or position (box-shadow / border only)");
// The place-card rail paint-contains its cards (railMenuCss.js), which clips any
// box-shadow to the card box. A trending card must opt out, at a specificity
// that beats ".wf8-pcrail>.wf-place-card" whichever stylesheet loads last.
const rail8 = readFileSync(path.join(ROOT, "app/components/railMenuCss.js"), "utf8");
ok(/\.wf8-pcrail>\.wf-place-card\{[^}]*contain:paint/.test(rail8), "PROBE: the rail still paint-contains its cards (if this changes, revisit the override below)");
ok(/\.wf8-pcrail>\.wf-place-card\.is-trending\{contain:style;content-visibility:visible\}/.test(css), "CSS: trending cards in .wf8-pcrail drop paint containment so the ring is not clipped");
const offs = [...css.matchAll(/outline-offset:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
const pulseBlock = (css.match(/@keyframes wfTrendPulse\{[\s\S]*?\n\}/) || [""])[0];
const pulseOffs = [...pulseBlock.matchAll(/outline-offset:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
ok(offs.length > 0 && pulseOffs.length >= 1, "PROBE: the pulse keyframes carry an outline-offset the check can read");
ok(Math.max(...pulseOffs) + 1.5 <= 4, `CSS: the outward ring (offset + 1.5px outline) stays inside the rails' 4px top padding (got ${pulseOffs.join(",")}px)`);
// Christmas, Halloween, Fall and award cards pin box-shadow with !important, which an
// animation cannot override. The ring is drawn with OUTLINE so it shows on every skin:
// the keyframes must animate outline, and no skin may pin the card root's outline.
ok(/outline-color:/.test(pulseBlock) && /outline-offset:/.test(pulseBlock), "CSS: the pulse animates the outline ring (visible on skinned cards whose box-shadow is !important)");
ok(!/\.wf-place-card[^{,]*\{[^}]*\boutline(?:-color|-offset)?:[^;}]*!important/.test(css), "CSS: no card skin pins the card root's outline with !important (that would hide the pulse)");
ok(/\.wf-place-card\.is-trending:focus-visible\{animation:none;outline:2px/.test(css), "CSS: keyboard focus on a trending card shows the normal focus ring, not the pulse");

if (failures.length) {
  console.error(`check-trend-pulse: FAIL (${failures.length} of ${pass})`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-trend-pulse: OK — ${pass} assertions (rule, both card roots, real RailCard render with positive + negative controls, CSS + reduced motion)`);
