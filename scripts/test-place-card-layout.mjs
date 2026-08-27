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
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
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
// v8.61 — the score chip is drawn by FOUR renderers off one CSS rule. Placement
// is (rule x parent), so the rule is measured here on two of them and the
// parent is locked for all four by the source-order invariant at the bottom.
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;

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
  // The rail draws the same chip from its own file. If its media wrapper ever
  // drifts, the score lands somewhere else on a surface nobody screenshots.
  { key: "rail-card", Component: RailCard, props: { title: "TreeUmph! Adventure Course", score: 9.2, rank: 1, href: "/p/z", photo: "", category: "Activities", distMi: 14.1 } },
  // v8.72 — THE WIDEST BADGE THAT EXISTS, which is the one that broke.
  // A perfect score is the only badge that gains BOTH a fourth digit ("10.0")
  // and the flame span, and it is ~21px wider than every fixture above. The
  // owner's screenshot (2026-08-27, the "Make a day of it" card) showed it
  // sitting on top of the title; every assertion in this file was green,
  // because no fixture had ever rendered a 10.0. governed_score 100 →
  // toDisplayScore → 10.0 → isPerfectScore → the flame.
  { key: "perfect-score", props: { place: { ...basePlace, id: "layout-fixture-3", name: "Sarasota Guided Mangrove Tunnel Kayak Tour", governed_score: 100 }, rank: 3, href: "/p/perfect", badge: waterChip } },
  // The when-pill borrows the SAME corner slot, so it needs the same clearance.
  // Before v8.72 the slot reserved 86px and this pill was 98px wide.
  { key: "rail-when", Component: RailCard, props: { title: "Möbius Sarasota Night Market", rank: 1, href: "/p/w", photo: "", category: "Events", when: { label: "Tonight", value: "6:00 PM", tone: "now" } } },
];

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WF_PLACE_CARD_CSS}</style></head>
<body style="margin:0;background:#0B0E1A"><ul style="margin:0;padding:12px;list-style:none">
${variants.map((v) => `<!-- ${v.key} -->` + renderToStaticMarkup(React.createElement(v.Component || Card, v.props))).join("\n")}
</ul></body></html>`;

const tmp = mkdtempSync(path.join(ROOT, ".wf-cardlayout-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const page = path.join(tmp, "card.html");
writeFileSync(page, html);

const { chromium } = await import("playwright");
// v8.22.1 — RESOLVE THE BROWSER, NEVER ASSUME IT (this exact line failed the
// v8.22 production deploy: the cloud container's hardcoded chromium path does
// not exist on Vercel's build image, so a fully green change was blocked by
// the guard's own environment assumption). Resolution order:
// playwright's own registry -> the cloud container path -> darwin default
// (no env override — check-guard-hermeticity forbids env-dependent verdicts). If NO chromium exists on this machine, the guard SKIPS LOUDLY with
// exit 0 — a layout contract must gate the machines that can measure it
// (cloud dev + the Mac merge pipeline, both of which have a browser), not
// turn a green main red on a build image that ships none. The merge pipeline
// still runs it for real before every ship.
function resolveChromium() {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {}; // playwright's default resolution
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log("test-place-card-layout: SKIPPED — no Chromium on this machine (build image); the layout contract is enforced on cloud dev and the Mac merge pipeline, both of which run it with a real browser");
  process.exit(0);
}
const browser = await chromium.launch(launchOpts);
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
    const media = card.querySelector(".wf-place-card-media");
    const score = card.querySelector(".wf-place-card-score");
    const title = card.querySelector(".wf-place-card-title-row");
    const name = card.querySelector(".wf-place-card-name");
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    // v8.72 — TEXT lines, not the padded block. The name's BOX ends at the
    // heading's padding edge, so a box-vs-box test can read clean while the
    // glyphs run under the badge. A Range over the text nodes returns one
    // rect per rendered LINE, which is what the reader actually sees.
    const lineRects = (el) => {
      if (!el) return [];
      const r = document.createRange(); r.selectNodeContents(el);
      return [...r.getClientRects()].map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height }));
    };
    const heading = card.querySelector(".wf-place-card-heading");
    // The gutter is padding INSIDE the heading's box, so the box's own right
    // edge is the card's — it is the CONTENT edge that has to clear the badge.
    const headingContentRight = heading ? heading.getBoundingClientRect().right - parseFloat(getComputedStyle(heading).paddingRight || "0") : null;
    const category = card.querySelector(".wf-place-card-category");
    out.cards.push({
      card: { x: cb.x, y: cb.y, w: cb.width, h: cb.height }, kids, pills,
      laneBox: laneBox ? { y: laneBox.y, h: laneBox.h || laneBox.height } : null,
      media: box(media), score: box(score), title: box(title), name: box(name),
      heading: box(heading), headingContentRight,
      nameLines: lineRects(name), categoryLines: lineRects(category),
      scoreInTitle: !!(score && title && title.contains(score)),
      scoreInMedia: !!(score && media && media.contains(score)),
    });
  });
  return out;
});
await browser.close();

ok(m.cards.length === variants.length, `positive control: ${variants.length} cards rendered and found (got ${m.cards.length})`);
ok(m.pageScrollX <= m.viewport + 1, `no horizontal page overflow at 390px (scrollWidth ${m.pageScrollX})`);
m.cards.forEach((c, ci) => {
  const tag = variants[ci] ? variants[ci].key : "card" + ci;
  const isRail = tag.startsWith("rail");
  if (!isRail) ok(c.kids.length >= 4, `${tag}: positive control — action row has >=4 controls (got ${c.kids.length})`);
  // v8.62 — OWNER'S PLACEMENT, verbatim (2026-08-26, live): "the score goes
  // in the top right hand corner of the card, not in front of the image."
  // Supersedes v8.61/#965/#966 (top of photo) and #958 (photo floor). Four
  // assertions, all on real boxes: out of the title row, OFF the photo, in
  // the card's top-right corner, and clear of the action row.
  if (c.score && c.media && c.name) {
    ok(!c.scoreInTitle, `${tag}: the score is never inside the title row`);
    ok(!c.scoreInMedia, `${tag}: the score is NOT a child of the photo — it belongs to the card (owner: "not in front of the image")`);
    const mediaRight = c.media.x + c.media.w;
    ok(c.score.x >= mediaRight - 1, `${tag}: the score sits clear of the photo (score x ${c.score.x.toFixed(0)} vs media right ${mediaRight.toFixed(0)})`);
    ok(c.score.y - c.card.y <= 24, `${tag}: the score hugs the card's TOP edge (offset ${(c.score.y - c.card.y).toFixed(0)}px)`);
    const cardRight = c.card.x + c.card.w;
    const scoreRight = c.score.x + c.score.w;
    ok(cardRight - scoreRight <= 24 && cardRight - scoreRight >= 0, `${tag}: the score hugs the card's RIGHT edge (gap ${(cardRight - scoreRight).toFixed(0)}px)`);
    const rowTop = c.kids.length ? Math.min(...c.kids.map((k) => k.y)) : Infinity;
    ok(c.score.y + c.score.h < rowTop, `${tag}: the score clears the action row entirely (score bottom ${(c.score.y + c.score.h).toFixed(0)} vs actions top ${rowTop.toFixed(0)})`);
  }
  for (let i = 0; i < c.kids.length; i++) for (let j = i + 1; j < c.kids.length; j++) {
    const a = c.kids[i], b = c.kids[j];
    const oxv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oyv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    ok(!(oxv > 1 && oyv > 1), `${tag}: ${a.cls} overlaps ${b.cls} by ${Math.round(oxv)}x${Math.round(oyv)}px — the owner's screenshot bug, measured`);
  }
  for (const k of c.kids) ok(k.x >= c.card.x - 1 && k.x + k.w <= c.card.x + c.card.w + 1,
    `${tag}: ${k.cls} stays inside the card box`);
  if (!isRail) ok(c.pills.length >= 3, `${tag}: positive control — highlights lane has >=3 pills (got ${c.pills.length})`);
  ok(c.media && c.media.w > 40 && c.media.h > 80, `${tag}: positive control — media column is the tall photo`);
  ok(c.score && c.score.w > 20 && c.score.h > 20, `${tag}: positive control — score overlay rendered`);
  ok(!c.scoreInTitle, `${tag}: score overlay is not a child of the title row`);
  if (c.score) {
    // v8.62: the badge lives on the CARD (top-right corner), so its box must
    // stay inside the card's box — never outside it, never on the photo.
    ok(c.score.x >= c.card.x - 1 && c.score.x + c.score.w <= c.card.x + c.card.w + 1,
      `${tag}: score stays inside the card box horizontally (got score.x=${Math.round(c.score.x)} w=${Math.round(c.score.w)} card.x=${Math.round(c.card.x)} w=${Math.round(c.card.w)})`);
    ok(c.score.y >= c.card.y - 1 && c.score.y + c.score.h <= c.card.y + c.card.h + 1,
      `${tag}: score stays inside the card box vertically`);
  }
  if (c.score && c.name) {
    const oxv = Math.min(c.score.x + c.score.w, c.name.x + c.name.w) - Math.max(c.score.x, c.name.x);
    const oyv = Math.min(c.score.y + c.score.h, c.name.y + c.name.h) - Math.max(c.score.y, c.name.y);
    ok(!(oxv > 1 && oyv > 1), `${tag}: score overlaps the place name by ${Math.round(oxv)}x${Math.round(oyv)}px — the Parrish screenshot bug`);
  }
  // v8.72 — THE CLEARANCE IS MEASURED ON GLYPHS, AND ON EVERY LINE.
  // The gutter the badge sits in is `padding-right` on the heading; the
  // heading's box therefore always ends before the badge, and a box test
  // cannot see the failure the owner photographed. These two assertions run
  // over the rendered LINE rects of the title and the eyebrow, and only for
  // the lines that actually share vertical space with the badge.
  if (c.score) {
    const scoreBottom = c.score.y + c.score.h, scoreRight = c.score.x + c.score.w;
    const clashes = (lines) => lines.filter((l) => l.y < scoreBottom - 1 && l.y + l.h > c.score.y + 1 && l.x + l.w > c.score.x + 1 && l.x < scoreRight - 1);
    ok(c.nameLines.length >= 1, `${tag}: positive control — the title rendered at least one line box`);
    const nameClash = clashes(c.nameLines);
    ok(nameClash.length === 0, `${tag}: no title LINE runs under the badge (worst overlap ${nameClash.length ? Math.round(Math.max(...nameClash.map((l) => l.x + l.w - c.score.x))) : 0}px) — the "Make a day of it" screenshot bug`);
    const catClash = clashes(c.categoryLines);
    ok(catClash.length === 0, `${tag}: no eyebrow LINE runs under the badge (worst overlap ${catClash.length ? Math.round(Math.max(...catClash.map((l) => l.x + l.w - c.score.x))) : 0}px)`);
    // And the gutter is not merely big enough by luck: the heading's padded
    // box must clear the badge's left edge outright.
    if (c.headingContentRight != null) ok(c.headingContentRight <= c.score.x + 1,
      `${tag}: the heading's reserved gutter clears the badge (text may reach ${Math.round(c.headingContentRight)}, badge starts ${Math.round(c.score.x)}) — the reserve is derived from --wf-card-badge-w, never a hardcoded px`);
  }
  if (c.laneBox) for (const pl of c.pills) {
    ok(pl.y >= c.laneBox.y - 1 && pl.y + pl.h <= c.laneBox.y + (c.laneBox.h || 0) + 1.5,
      `${tag}: pill fully inside the lane's vertical box (no cropped sliver) — ${String(pl.cls).slice(0, 30)}`);
  }
});

// ── v8.62 — THE SCORE CHIP IS GLOBAL, SO THE LOCK HAS TO BE. ───────────────
// #966's version of this block locked the chip INSIDE the media. The owner
// then said, verbatim (2026-08-26, live): "the score goes in the top right
// hand corner of the card, not in front of the image" — so the lock flips
// with the law, not against it. Placement is (one CSS rule) x (the parent it
// is absolute against). The rule is measured above on real boxes; the parent
// is locked structurally in all four renderers: every JSX score chip renders
// as a DIRECT CHILD of the card, BEFORE the .wf-place-card-layout wrapper
// opens — never inside the media block, never inside the content block.
const SCORE_RENDERERS = [
  "app/components/IconicPlaceCard.js",
  "app/components/RailCard.js",
  "app/components/ThingsToDoList.js",
  "app/home.js",
];
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
for (const rel of SCORE_RENDERERS) {
  const src = stripJs(readFileSync(path.join(ROOT, rel), "utf8"));
  // The chip renders before the layout wrapper — card-corner position.
  ok(/className=["']wf-place-card-score["'][\s\S]{0,1400}wf-place-card-layout/.test(src),
    `${rel}: the score chip is a direct child of the card, rendered BEFORE wf-place-card-layout`);
  // And the media block holds no score — the owner's "not in front of the image".
  const mediaBlocks = [...src.matchAll(/wf-place-card-media["'][\s\S]{0,900}/g)];
  ok(mediaBlocks.length >= 1, `${rel}: positive control — media block found`);
  for (const m2 of mediaBlocks) ok(!/wf-place-card-score/.test(m2[0]),
    `${rel}: no score chip inside the media block (owner: "not in front of the image")`);
}

// ── v8.72 — ONE NUMBER, DECLARED ONCE. ─────────────────────────────────────
// The corner gutter and the badges that sit in it are the same measurement.
// When they were two literals (86px reserved, a badge that grew to 97px on a
// perfect score, a when-pill that was always 98px) they drifted, and the drift
// was invisible to every source guard. They now both read --wf-card-badge-w;
// this asserts the property is declared and that neither consumer has quietly
// gone back to a literal.
{
  const css = readFileSync(path.join(ROOT, "app/components/css.js"), "utf8");
  ok(/--wf-card-badge-w:\s*\d+px/.test(css), "css.js declares --wf-card-badge-w (the corner slot's one measurement)");
  const gutter = css.match(/\.wf-place-card-score~\.wf-place-card-layout \.wf-place-card-heading\{([^}]*)\}/);
  ok(!!gutter, "positive control: the heading's score gutter rule is still in css.js under its known selector");
  ok(!!gutter && /var\(--wf-card-badge-w\)/.test(gutter[1]),
    `the heading gutter is derived from --wf-card-badge-w, not a literal (got: ${gutter ? gutter[1] : "rule missing"})`);
  const railWhen = css.match(/\.wf-place-card-score \.wf-rail-when\{([^}]*)\}/);
  ok(!!railWhen && /var\(--wf-card-badge-w\)/.test(railWhen[1]),
    `the when-pill in the score slot is sized from --wf-card-badge-w (got: ${railWhen ? railWhen[1] : "rule missing"})`);
  const badge = css.match(/\.wf-place-card-score \.wayfind-score-badge\{([^}]*)\}/);
  ok(!!badge && /var\(--wf-card-badge-w\)/.test(badge[1]),
    "the score badge in the slot is sized from --wf-card-badge-w");
}

console.log(`\ntest-place-card-layout: ${fail ? "FAIL" : "OK"} — ${pass} layout assertions on real Chromium boxes at 390px, card CSS alone (the embed condition)`);
process.exit(fail ? 1 : 0);
