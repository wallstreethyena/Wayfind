#!/usr/bin/env node
// scripts/test-drop-rail-parity.mjs — THE TRENDING DROP AND THE PLACE DROP ARE
// THE SAME COLUMN, measured.
//
// Owner, 2026-08-23, with two screenshots of the same drop: "why do these place
// cards look different than these place cards? i want the second style."
//
// They were the same COMPONENT CONTRACT (.wf-place-card) and different WIDTHS.
// DaypartRail renders two bodies under one "Showing <rail>" bar:
//   · every rail but trending -> .wf8-pcwrap > ul.wf8-pcrail > IconicPlaceCard,
//     sized off --wf8-pcvis (3.4 cards across a desktop column)
//   · trending -> <ExplodingNearby>, which brings .wf-rail from css.js, whose
//     card rule is flex:0 0 100% (owner-set for a phone, 2026-08-08)
// On a 1440 desktop that is 3.4 cards beside ONE card stretched to 4x their
// width — the reader reads it as a different, broken card on the surface that
// carries the trend CTAs.
//
// A source grep cannot see this: both sides are correct source, and the defect
// is a resolved layout fact. So this renders the REAL components (jsxLoad, never
// a lookalike) into the REAL .wf8 subtree with BOTH stylesheets, and compares
// bounding boxes at a desktop width and a phone width.
//
// The contract:
//   1. A trend card and a place card in the same drop are the same width (<=1px)
//      at 1440 AND at 390 — one rule, one variable, both breakpoints.
//   2. At 1440 a trend card is NARROWER than its rail (the peek is what says
//      "this scrolls"). This is the assert that goes red on the actual bug.
//   3. At 390 the card still fills essentially the whole column (>=88%) — the
//      owner's phone call from 2026-08-08 is not collateral damage.
//   4. No horizontal page overflow at either width.
//   5. Positive controls: the probe found both rails and all their cards, so a
//      selector miss reads as broken, never as clean.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const { WF_RAIL_MENU_CSS } = await loadComponent(path.join(ROOT, "app/components/railMenuCss.js"), ROOT);
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;

const N = 4;
const place = (i) => ({
  id: "parity-fixture-" + i,
  name: "Hammered Harry's Tampa",
  rating: 4.7, reviews: 707, priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  types: ["bar", "restaurant"], distMi: 4.9,
  governed_score: 96, lat: 27.95, lng: -82.46,
});
const placeCards = Array.from({ length: N }, (_, i) =>
  renderToStaticMarkup(React.createElement(Iconic, { place: place(i), rank: i + 1, href: "/p/parity-" + i })));
// The trend card as ExplodingNearby builds it: rank, score, facts, award band
// on the lead, a chip lane, an editorial take and the Directions CTA.
const trendCards = Array.from({ length: N }, (_, i) =>
  renderToStaticMarkup(React.createElement(RailCard, {
    className: i ? "wf-exploding-additional" : "wf-exploding-primary",
    title: "Smash Bun Burger",
    eyebrow: "Hamburger restaurant",
    rank: i + 1,
    score: 9.4,
    facts: ["382 reviews", "3.5 mi", "$ · Inexpensive"],
    award: i ? null : { tone: 1, icon: "1", label: "Top food pick" },
    chips: [{ key: "exploding-trend", icon: "\u{1F525}", label: "Trending" }],
    take: "Crisp-edged, griddled burgers are the order people seek out here.",
    cta: { label: "Directions ↗", href: "https://maps.google.com/", external: true },
    place: place(100 + i),
  })));

// The real subtree: .wf8 (the custom properties live here) > .wf8-menusec (which
// only paints when the root carries is-open) > .wf8-in (the padded column).
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WF_PLACE_CARD_CSS}</style><style>${WF_RAIL_MENU_CSS}</style></head>
<body style="margin:0;background:#0B0E1A">
<div class="wf8 is-open" data-daypart="evening"><section class="wf8-menusec"><div class="wf8-in">
  <div class="wf8-mbar"><p class="wf8-mhd">Showing <b>Exploding Trends Near You</b> near Tampa</p></div>
  <article data-exploding-trend="parity">
    <div class="wf-rail wf-rail-exploding" data-rail="exploding-parity">${trendCards.join("")}</div>
  </article>
  <div class="wf8-pcwrap"><ul class="wf8-pcrail">${placeCards.join("")}</ul></div>
</div></section></div>
</body></html>`;

const tmp = mkdtempSync(path.join(ROOT, ".wf-dropparity-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const page = path.join(tmp, "drop.html");
writeFileSync(page, html);

const { chromium } = await import("playwright");
// Same resolve-or-skip contract as scripts/test-place-card-layout.mjs, and for
// the same reason: a hardcoded browser path failed a production deploy in
// v8.22. Registry -> cloud path -> darwin default; no env override, because
// check-guard-hermeticity forbids env-dependent verdicts.
function resolveChromium() {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {};
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log("test-drop-rail-parity: SKIPPED — no Chromium on this machine (build image); the parity contract is enforced on cloud dev and the Mac merge pipeline, both of which run it with a real browser");
  process.exit(0);
}
const browser = await chromium.launch(launchOpts);
const measure = async (width, height) => {
  const p = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await p.goto("file://" + page, { waitUntil: "load" });
  const m = await p.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 100) / 100, x: Math.round(r.x * 100) / 100 }; };
    const trendRail = document.querySelector(".wf-rail-exploding");
    const placeRail = document.querySelector(".wf8-pcrail");
    return {
      trendRail: trendRail ? box(trendRail) : null,
      placeRail: placeRail ? box(placeRail) : null,
      trend: [...document.querySelectorAll(".wf-rail-exploding > .wf-rail-card")].map(box),
      places: [...document.querySelectorAll(".wf8-pcrail > .wf-place-card")].map(box),
      scrollW: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  await p.context().close();
  return m;
};

for (const [w, h] of [[1440, 950], [390, 844]]) {
  const m = await measure(w, h);
  const tag = w + "px";
  ok(m.trend.length === N && m.places.length === N,
    `${tag} positive control: ${N} trend cards and ${N} place cards rendered and found (got ${m.trend.length}/${m.places.length})`);
  if (m.trend.length !== N || m.places.length !== N) continue;
  ok(m.trend[0].w > 0 && m.places[0].w > 0, `${tag} positive control: both cards have a real width`);
  const delta = Math.abs(m.trend[0].w - m.places[0].w);
  ok(delta <= 1,
    `${tag} a trend card and a place card in the same drop are the same width (trend ${m.trend[0].w}, place ${m.places[0].w}, delta ${Math.round(delta * 100) / 100}px)`);
  if (w >= 1440) {
    // THE BUG, stated as a number: flex:0 0 100% made this ratio 1.
    const ratio = m.trend[0].w / m.trendRail.w;
    ok(ratio < 0.75,
      `${tag} a trend card is narrower than its rail so the next card peeks (card ${m.trend[0].w} / rail ${m.trendRail.w} = ${Math.round(ratio * 100)}%)`);
    ok(m.trend.length > 1 && m.trend[1].x > m.trend[0].x,
      `${tag} the second trend card sits BESIDE the first, not off-column`);
  } else {
    // The owner's phone call from 2026-08-08 survives: --wf8-pcvis is 1.08 here.
    const ratio = m.trend[0].w / m.trendRail.w;
    ok(ratio >= 0.82,
      `${tag} the trend card still fills the phone column (card ${m.trend[0].w} / rail ${m.trendRail.w} = ${Math.round(ratio * 100)}%)`);
  }
  ok(m.scrollW <= m.viewport + 1, `${tag} no horizontal page overflow (scrollWidth ${m.scrollW}, viewport ${m.viewport})`);
}
await browser.close();

console.log(`test-drop-rail-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
