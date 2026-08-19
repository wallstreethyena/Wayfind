#!/usr/bin/env node
// scripts/test-place-card-layout.mjs — THE CARD LAYOUT CONTRACT, measured.
//
// v8.22 (owner, 2026-08-19, fourth pill/button breakage in a week: "the place
// cards need a standard and a global rule everywhere on the site — this
// cannot happen anymore"). Every prior card guard read SOURCE; none of them
// could see a 22px overlap, because overlap is a LAYOUT fact that only exists
// after CSS resolves against a real viewport. This guard renders the REAL
// IconicPlaceCard (jsxLoad — never a hand-copied lookalike that drifts) into
// real Chromium at 390x844 with WF_PLACE_CARD_CSS **and nothing else** — the
// exact embed condition of a guide page, which is precisely where the
// box-sizing bug lived: the app's global border-box reset papered over a
// 42px-wide button that rendered 70px everywhere the reset didn't follow.
//
// The contract, asserted on BOUNDING BOXES:
//   1. No two action-row controls overlap (>1px intersection both axes).
//   2. Every action-row control fits inside the card's box.
//   3. Every highlights-lane pill sits fully inside the lane's VERTICAL box
//      (horizontal overflow is the swipe lane, by design; a vertically
//      cropped pill is the "sliver" bug).
//   4. No horizontal page overflow at 390px.
//   5. Positive controls: the probe found the row, the controls, the pills —
//      a selector miss must read as broken, never as clean.
//
// Fixtures exercise the shapes that have actually broken: wired buttons AND
// anchor fallbacks, a long water chip, several experience pills, a partner
// ticket link (real placePartnerPicks row, so the <a> path renders).
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
// css.js imports extensionless local modules (lib/railCollapse), which plain
// node cannot resolve — jsxLoad rewrites specifiers, so it loads this too.
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const mod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const Card = mod.default;

const basePlace = {
  id: "layout-fixture-1",
  // A real placePartnerPicks alias, so the partner ticket <a> renders and the
  // lane's anchor child is part of the measured contract.
  name: "TreeUmph! Adventure Course",
  rating: 4.8, reviews: 1141, priceLevel: "PRICE_LEVEL_MODERATE",
  types: ["amusement_park", "tourist_attraction"], distMi: 14.1,
  governed_score: 92, lat: 27.4, lng: -82.4,
};
const noop = () => {};
const waterChip = React.createElement(React.Fragment, null,
  React.createElement("span", { style: { color: "#FBBF24", fontWeight: 700 } }, "🌊 Fair for a swim"),
  React.createElement("span", { style: { color: "#7DD3FC", fontWeight: 700 } }, "water 89°"),
  React.createElement("span", { style: { color: "#7DD3FC", fontWeight: 700 } }, "wind 12 mph SE"),
);
const variants = [
  { key: "wired-buttons", props: { place: basePlace, rank: 1, href: "/p/x", badge: waterChip, saved: false, liked: false, disliked: false, onSave: noop, onLike: noop, onDislike: noop } },
  { key: "anchor-fallbacks", props: { place: { ...basePlace, id: "layout-fixture-2" }, rank: 2, href: "/p/y", badge: waterChip } },
];

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WF_PLACE_CARD_CSS}</style></head>
<body style="margin:0;background:#0B0E1A"><ul style="margin:0;padding:12px;list-style:none">
${variants.map((v) => `<!-- ${v.key} -->` + renderToStaticMarkup(React.createElement(Card, v.props))).join("\n")}
</ul></body></html>`;

const tmp = mkdtempSync(path.join(ROOT, ".wf-cardlayout-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const page = path.join(tmp, "card.html");
writeFileSync(page, html);

const { chromium } = await import("playwright");
const exe = process.platform === "darwin" ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto("file://" + page, { waitUntil: "load" });
const m = await p.evaluate(() => {
  const out = { pageScrollX: document.documentElement.scrollWidth, viewport: innerWidth, cards: [] };
  document.querySelectorAll(".wf-place-card").forEach((card) => {
    const cb = card.getBoundingClientRect();
    const row = card.querySelector(".wf-place-card-actions");
    const lane = card.querySelector(".wf-place-card-highlights");
    const kids = row ? [...row.children].map((k) => { const r = k.getBoundingClientRect(); return { cls: k.className.split(" ")[0] || k.tagName, x: r.x, y: r.y, w: r.width, h: r.height }; }) : [];
    const pills = lane ? [...lane.children].map((k) => { const r = k.getBoundingClientRect(); return { cls: k.className || k.tagName, y: r.y, h: r.height }; }) : [];
    const laneBox = lane ? lane.getBoundingClientRect() : null;
    out.cards.push({ card: { x: cb.x, w: cb.width }, kids, pills, laneBox: laneBox ? { y: laneBox.y, h: laneBox.h || laneBox.height } : null });
  });
  return out;
});
await browser.close();

ok(m.cards.length === variants.length, `positive control: ${variants.length} cards rendered and found (got ${m.cards.length})`);
ok(m.pageScrollX <= m.viewport + 1, `no horizontal page overflow at 390px (scrollWidth ${m.pageScrollX})`);
m.cards.forEach((c, ci) => {
  const tag = variants[ci] ? variants[ci].key : "card" + ci;
  ok(c.kids.length >= 4, `${tag}: positive control — action row has >=4 controls (got ${c.kids.length})`);
  for (let i = 0; i < c.kids.length; i++) for (let j = i + 1; j < c.kids.length; j++) {
    const a = c.kids[i], b = c.kids[j];
    const oxv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oyv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    ok(!(oxv > 1 && oyv > 1), `${tag}: ${a.cls} overlaps ${b.cls} by ${Math.round(oxv)}x${Math.round(oyv)}px — the owner's screenshot bug, measured`);
  }
  for (const k of c.kids) ok(k.x >= c.card.x - 1 && k.x + k.w <= c.card.x + c.card.w + 1,
    `${tag}: ${k.cls} stays inside the card box`);
  ok(c.pills.length >= 3, `${tag}: positive control — highlights lane has >=3 pills (got ${c.pills.length})`);
  if (c.laneBox) for (const pl of c.pills) {
    ok(pl.y >= c.laneBox.y - 1 && pl.y + pl.h <= c.laneBox.y + (c.laneBox.h || 0) + 1.5,
      `${tag}: pill fully inside the lane's vertical box (no cropped sliver) — ${String(pl.cls).slice(0, 30)}`);
  }
});

console.log(`\ntest-place-card-layout: ${fail ? "FAIL" : "OK"} — ${pass} layout assertions on real Chromium boxes at 390px, card CSS alone (the embed condition)`);
process.exit(fail ? 1 : 0);
