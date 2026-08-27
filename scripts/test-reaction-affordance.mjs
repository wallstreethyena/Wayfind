#!/usr/bin/env node
// scripts/test-reaction-affordance.mjs — A PRESS MUST BE VISIBLE. Measured.
//
// THE COMPLAINT (owner, 2026-08-27, on a fall-skinned card): "I just clicked
// on it. It does register. It says that it's been added to my taste or
// whatever, but I don't see the button showing like it was activated. If a
// user is clicking on it and doesn't see the button respond, it's gonna look
// like it's broken." He is right, and it is a trust failure rather than a data
// failure: the like WAS recorded, the taste profile DID update, the toast DID
// fire. The only part the user can see did nothing.
//
// ROOT CAUSE, for the record: the fall skin carried a blanket
// `.wf-fall .wf-place-card button { background/border/color !important }`.
// At (0,2,1) it outranked `.wf-place-card-like.is-active` at (0,2,0) — same
// !important, and it came first in source. Every control on a fall card was
// painted the same cream whether it was carrying state or not. The active
// treatment underneath it was an 8% tint, which would have been a whisper even
// if it had won.
//
// WHY THIS FILE IS A BROWSER TEST AND NOT A GREP. "The class is applied" was
// always true here — `is-active` went on, `aria-pressed` flipped, the data
// saved. A source guard would have passed every day this bug was live. The
// only honest question is whether the rendered control CHANGES, and that is a
// question about resolved CSS in a real viewport. So this renders the REAL
// IconicPlaceCard and RailCard (jsxLoad, never a hand-copied lookalike) with
// the REAL WF_PLACE_CARD_CSS, in both skins, in both states, and asserts:
//
//   1. The control's screenshot is not byte-identical between off and on.
//      Byte-identical is the bug, stated exactly.
//   2. At least two of {background, border-color, color} actually change.
//      One property is one skin override away from silence.
//   3. The ON background is effectively OPAQUE (alpha >= .85). This is the
//      rule that makes the fix general: an opaque fill cannot be washed out
//      by whatever we paint behind it in the next season's skin.
//   4. Positive controls — the fixtures rendered, the controls were found,
//      and the OFF states of the two skins are genuinely different (so a
//      "both skins pass" result cannot come from the skin never applying).
//
// Skips loudly (exit 0) where no Chromium exists, exactly like
// test-place-card-layout.mjs: the contract gates the machines that can measure
// it — cloud dev and the Mac merge pipeline — not Vercel's browserless image.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { c ? pass++ : fails.push(m); };

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;

const noop = () => {};
const place = {
  id: "affordance-fixture",
  name: "Gasparilla Distillery & Tasting Room",
  rating: 4.7, reviews: 217, priceLevel: "PRICE_LEVEL_MODERATE",
  types: ["bar", "tourist_attraction"], distMi: 9.4,
  governed_score: 92, lat: 27.4, lng: -82.4,
};

// Every case is one card carrying exactly one control state, so a control can
// be compared against its own OFF twin in the same skin and the same renderer.
const CASES = [];
for (const skin of ["dark", "fall"]) {
  for (const [state, props] of [
    ["off", { saved: false, liked: false, disliked: false }],
    ["like", { saved: false, liked: true, disliked: false }],
    ["dislike", { saved: false, liked: false, disliked: true }],
    ["save", { saved: true, liked: false, disliked: false }],
  ]) {
    CASES.push({ renderer: "card", skin, state, props });
  }
}
for (const state of ["off", "like"]) {
  CASES.push({ renderer: "rail", skin: "dark", state, props: state === "like" ? { liked: true } : { liked: false } });
}

const cardEl = (c) => React.createElement(Card, {
  place, rank: 1, href: "/p/x", onSave: noop, onLike: noop, onDislike: noop, onShare: noop, ...c.props,
});
const railEl = (c) => React.createElement(RailCard, {
  title: place.name, score: 9.2, rank: 1, href: "/p/x", photo: "", category: "Night out", distMi: 9.4,
  onSave: noop, onLike: noop, onDislike: noop, saved: false, disliked: false, ...c.props,
});

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WF_PLACE_CARD_CSS}</style></head>
<body style="margin:0;background:#0B0E1A"><div style="padding:12px">
${CASES.map((c, i) => `<ul data-case="${i}" style="margin:0 0 10px;padding:0;list-style:none"${c.skin === "fall" ? ' class="wf-fall"' : ""}>` +
  renderToStaticMarkup(c.renderer === "rail" ? railEl(c) : cardEl(c)) + `</ul>`).join("\n")}
</div></body></html>`;
// The wrapper is a <ul>, not a <li>: IconicPlaceCard renders its own <li>, and
// an <li> inside an <li> is auto-closed by the HTML parser — which quietly made
// every card a SIBLING of its wrapper, so the probe found nothing and the skin
// class never reached the card. Cost: one confused test run.

const tmp = mkdtempSync(path.join(ROOT, ".wf-affordance-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const pageFile = path.join(tmp, "affordance.html");
writeFileSync(pageFile, html);

const { chromium } = await import("playwright");
function resolveChromium() {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {};
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log("test-reaction-affordance: SKIPPED — no Chromium on this machine (build image); the affordance contract is enforced on cloud dev and the Mac merge pipeline, both of which run it with a real browser");
  process.exit(0);
}
const browser = await chromium.launch(launchOpts);
const p = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
await p.goto("file://" + pageFile, { waitUntil: "load" });

const SEL = { like: ".wf-place-card-like", dislike: ".wf-place-card-dislike", save: ".wf-place-card-save" };
const shots = {};   // "case|control" -> Buffer
const styles = {};  // "case|control" -> { background, border, color }

for (let i = 0; i < CASES.length; i++) {
  for (const control of Object.keys(SEL)) {
    const el = p.locator(`[data-case="${i}"] ${SEL[control]}`).first();
    if (!(await el.count())) continue;
    const key = `${i}|${control}`;
    try { shots[key] = await el.screenshot(); } catch (e) { shots[key] = null; }
    styles[key] = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return { background: s.backgroundColor, border: s.borderTopColor, color: s.color };
    });
  }
}
await browser.close();

const idxOf = (renderer, skin, state) => CASES.findIndex((c) => c.renderer === renderer && c.skin === skin && c.state === state);
const alpha = (rgb) => { const m = /rgba?\(([^)]+)\)/.exec(rgb || ""); if (!m) return 1; const parts = m[1].split(",").map((x) => parseFloat(x)); return parts.length > 3 ? parts[3] : 1; };

// --- positive controls: the fixtures and the skin both actually exist -------
ok(Object.keys(styles).length >= 20, `positive control: found the controls to measure (got ${Object.keys(styles).length} control renderings)`);
{
  const darkOff = styles[`${idxOf("card", "dark", "off")}|like`];
  const fallOff = styles[`${idxOf("card", "fall", "off")}|like`];
  ok(darkOff && fallOff && darkOff.background !== fallOff.background,
    `positive control: the fall skin really is applied to the resting control (dark ${darkOff && darkOff.background} vs fall ${fallOff && fallOff.background}) — otherwise "both skins pass" would mean nothing`);
}

// --- the contract ------------------------------------------------------------
const CHECKS = [
  { renderer: "card", skin: "dark", state: "like", control: "like" },
  { renderer: "card", skin: "dark", state: "dislike", control: "dislike" },
  { renderer: "card", skin: "dark", state: "save", control: "save" },
  { renderer: "card", skin: "fall", state: "like", control: "like" },
  { renderer: "card", skin: "fall", state: "dislike", control: "dislike" },
  { renderer: "card", skin: "fall", state: "save", control: "save" },
  { renderer: "rail", skin: "dark", state: "like", control: "like" },
];

console.log("  renderer  skin  control   off -> on");
for (const c of CHECKS) {
  const on = `${idxOf(c.renderer, c.skin, c.state)}|${c.control}`;
  const off = `${idxOf(c.renderer, c.skin, "off")}|${c.control}`;
  const tag = `${c.renderer}/${c.skin}/${c.control}`;
  const a = styles[off], b = styles[on];
  if (!a || !b) { ok(false, `${tag}: could not find both the off and on rendering of this control`); continue; }

  console.log(`  ${c.renderer.padEnd(8)}  ${c.skin.padEnd(4)}  ${c.control.padEnd(8)}  ${a.background} -> ${b.background}`);

  // 1. the pixels move at all
  ok(shots[off] && shots[on] && !shots[off].equals(shots[on]),
    `${tag}: pressing it must not render BYTE-IDENTICAL pixels — that is exactly the bug the owner reported`);

  // 2. more than one property carries the state
  const changed = ["background", "border", "color"].filter((k) => a[k] !== b[k]);
  ok(changed.length >= 2,
    `${tag}: at least two of {background, border, color} must change (changed: ${changed.join(", ") || "none"}) — a single property is one skin override away from silence`);

  // 3. the ON fill is opaque, so no future skin can wash it out
  ok(alpha(b.background) >= 0.85,
    `${tag}: the ON background must be effectively opaque (alpha ${alpha(b.background)}) — a tint is at the mercy of whatever is painted behind it`);
}

if (fails.length) {
  console.error(`\ntest-reaction-affordance: FAIL — ${fails.length} of ${fails.length + pass}`);
  for (const f of fails) console.error("  - " + f);
  console.error("\nA control that records the tap and shows the user nothing reads as broken. See app/components/css.js (.is-active) and scripts/check-state-affordance.mjs.");
  process.exit(1);
}
console.log(`\ntest-reaction-affordance: OK — ${pass} assertions (pixels move, two properties carry it, the ON fill is opaque, on both skins and both renderers)`);
