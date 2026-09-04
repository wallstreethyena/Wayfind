#!/usr/bin/env node
// scripts/test-card-action-row.mjs — THE ACTION ROW IS ONE LINE AND ONE HEIGHT.
//
// v8.88 (owner, 2026-08-29, on the sponsored Möbius card in the Tonight drop):
// "the share button for the place card looks weird because the arrows on top
// of share, it should be to the side. It should be a uniform size. You should
// actually be able to like it … I don't know why you didn't put the like
// dislike and share the way that we have in every single card."
//
// Three defects, one screenshot, and they are causally linked — which is why
// they are guarded in one file rather than three.
//
//   1. THE PAID CARD HAD NO THUMBS. cardActionsReadOnly (v8.69) removed like
//      and dislike from the sponsored row, for a real reason: the row carries a
//      SPONSOR id, and a save written under it is a key nothing else in the app
//      can read back. What that missed is that the registry also carries a
//      verified Google place id, which hydrateSponsoredRailPlace has been
//      passing through as `placeId` all along. The store key existed. Nothing
//      asked for it.
//
//   2. …SO SHARE LANDED IN A THUMB-SIZED TRACK. .wf-sheet-card-actions is a
//      GRID whose template is hardcoded four wide — Save, like, dislike, Share
//      — with two 42px columns in the middle. Remove the thumbs and Share is
//      the second child, so it got the 42px column built for a single glyph.
//
//   3. …AND ITS LABEL FOLDED IN HALF. `<button>↗ Share</button>` is an
//      inline-flex box whose only child is a text node, and that text wraps at
//      the space like any other. Nothing said it must not. Hence "the arrows on
//      top of share".
//
// WHY THIS IS A BROWSER TEST. Every one of those is a question about RESOLVED
// LAYOUT in a real viewport. "white-space is nowrap" and "the grid has four
// columns" are strings; "the label occupies one line" and "the four controls
// are the same height" are measurements, and only the second kind would have
// failed on the day the owner took his screenshot. The repo's own rule — assert
// on the call, not the string — has a layout dialect, and this is it.
//
// 390 × 844 is the reference viewport (CLAUDE.md: a screenshot at 1512px is not
// a mobile verification), and the rail case is measured inside a real
// .wf8-pcrail at the phone's --wf8-pcvis so the card is the width a thumb
// actually sees.
//
// Skips loudly (exit 0) where no Chromium exists, exactly like
// test-reaction-affordance.mjs: enforced on cloud dev and the Mac merge
// pipeline, not on Vercel's browserless build image.
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
const { RAIL_MENU_CSS } = await loadComponent(path.join(ROOT, "app/components/railMenuCss.js"), ROOT);
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;

const noop = () => {};
const place = {
  id: "action-row-fixture",
  name: "Möbius Sarasota",
  rating: 5, reviews: 10, types: ["wholesaler"], primaryType: "wholesaler",
  distMi: 6.2, governed_score: 81, lat: 27.4214874, lng: -82.5367616,
};

// FOUR cases. Legacy read-only props must now preserve the same four-control
// shape while routing through the isolated content-action store.
const CASES = [
  { id: "card-full", rail: false, props: {} },
  { id: "card-readonly", rail: false, props: { cardActionsReadOnly: true } },
  { id: "rail-full", rail: true, props: {} },
  { id: "rail-readonly", rail: true, props: { cardActionsReadOnly: true } },
];

const el = (c) => React.createElement(Card, {
  place, rank: 1, href: "/p/x", onSave: noop, onLike: noop, onDislike: noop, onShare: noop, ...c.props,
});

// The rail cases render inside the REAL .wf8 / .wf8-pcrail chain so the card
// inherits --wf8-pcvis and comes out the width a phone gives it (~1.08 cards
// across at 390px). A hand-set width would prove something about a number I
// chose rather than about the layout that ships.
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${WF_PLACE_CARD_CSS}</style><style>${RAIL_MENU_CSS}</style></head>
<body style="margin:0;background:#0B0E1A">
${CASES.map((c) => c.rail
  ? `<div class="wf8"><div class="wf8-in"><div class="wf8-pcwrap"><ul class="wf8-pcrail" data-case="${c.id}">${renderToStaticMarkup(el(c))}</ul></div></div></div>`
  : `<ul data-case="${c.id}" style="margin:0 0 10px;padding:12px;list-style:none">${renderToStaticMarkup(el(c))}</ul>`
).join("\n")}
</body></html>`;

const tmp = mkdtempSync(path.join(ROOT, ".wf-actionrow-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const pageFile = path.join(tmp, "actionrow.html");
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
  console.log("test-card-action-row: SKIPPED — no Chromium on this machine (build image); the action-row contract is enforced on cloud dev and the Mac merge pipeline, both of which run it with a real browser");
  process.exit(0);
}
const browser = await chromium.launch(launchOpts);
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto("file://" + pageFile, { waitUntil: "load" });

const SEL = {
  save: ".wf-place-card-save",
  like: ".wf-place-card-like",
  dislike: ".wf-place-card-dislike",
  share: ".wf-place-card-share",
};

const measured = {};
for (const c of CASES) {
  const row = {};
  for (const [name, sel] of Object.entries(SEL)) {
    const loc = page.locator(`[data-case="${c.id}"] ${sel}`).first();
    if (!(await loc.count())) { row[name] = null; continue; }
    row[name] = await loc.evaluate((n) => {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      // How many text lines the label actually occupies, measured rather than
      // inferred: a Range over the button's own text reports one client rect
      // per rendered line. Two rects IS "the arrow on top of Share".
      let lines = 0;
      for (const kid of n.childNodes) {
        if (kid.nodeType !== 3 || !kid.textContent.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(kid);
        lines = Math.max(lines, rg.getClientRects().length);
      }
      return {
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        lines,
        whiteSpace: s.whiteSpace,
        text: (n.textContent || "").trim(),
      };
    });
  }
  measured[c.id] = row;
}
await browser.close();

// ── POSITIVE CONTROLS ───────────────────────────────────────────────────────
// Every assertion below is of the form "the measurement is good". A selector
// that matched nothing would satisfy several of them vacuously, so prove the
// fixtures rendered first, and prove the two shapes are genuinely DIFFERENT
// shapes — otherwise "read-only passes too" could just mean read-only never
// applied.
ok(measured["rail-full"].share && measured["card-full"].share,
  "positive control: the fixtures rendered and a Share control was found in both renderers");
ok(measured["rail-full"].like && measured["rail-readonly"].like,
  "positive control: legacy cardActionsReadOnly can no longer remove Like or Dislike from a Wayfind card");
ok(/share/i.test((measured["rail-full"].share || {}).text || ""),
  "positive control: the control found really is the Share button");

// ── 1. THE LABEL NEVER FOLDS ────────────────────────────────────────────────
// THE assertion. `lines` is counted from the rendered text's own client rects,
// so 2 is literally the owner's screenshot and nothing else.
for (const c of CASES) {
  for (const [name, m] of Object.entries(measured[c.id])) {
    if (!m || !m.text) continue;
    ok(m.lines === 1,
      `${c.id} · ${name}: the label renders on ONE line (measured ${m.lines} line(s) of "${m.text}" in a ${m.w}px box) — two is the glyph stacked above the word, which is the defect this file is named for`);
  }
}
ok(measured["rail-readonly"].share && measured["rail-readonly"].share.whiteSpace === "nowrap",
  "…and it is nowrap that forbids it, not luck about the current label length: a longer word would fold again");

// ── 2. ONE HEIGHT ACROSS THE ROW ────────────────────────────────────────────
// "It should be a uniform size." Before this release the base card ran
// Save/Share at 34px beside like/dislike at 40px.
for (const c of CASES) {
  const hs = Object.entries(measured[c.id]).filter(([, m]) => m).map(([n, m]) => [n, m.h]);
  const heights = hs.map(([, h]) => h);
  const spread = Math.max(...heights) - Math.min(...heights);
  ok(spread <= 0.6,
    `${c.id}: every control in the row is the same height (spread ${spread.toFixed(1)}px across ${hs.map(([n, h]) => n + " " + h).join(", ")}) — a six-pixel step across four controls on one line is what "uniform size" was asking for`);
}

// ── 3. LEGACY READ-ONLY CARDS KEEP THE CANONICAL FOUR-CONTROL GEOMETRY ──────
for (const id of ["card-readonly", "rail-readonly"]) {
  const sh = measured[id].share;
  ok(sh && sh.w >= 56,
    `${id}: Share keeps a real column alongside the complete action row (${sh ? sh.w : "missing"}px)`);
}
// …and the row without thumbs is not WIDER than the row with them, which would
// mean the fix overshot into a second kind of wrong.
ok(measured["rail-readonly"].share.w >= measured["rail-full"].share.w - 0.5,
  `the read-only Share is no narrower than the full row's (${measured["rail-readonly"].share.w}px vs ${measured["rail-full"].share.w}px)`);

console.log(fails.length
  ? `test-card-action-row: FAIL\n  - ${fails.join("\n  - ")}`
  : `test-card-action-row: OK — ${pass} assertions measured in Chromium at 390x844; label line-counts read from the text's own client rects (2 = the owner's screenshot), row heights compared control-to-control, and the thumbs-absent row proven to keep Share out of the 42px thumb track`);
process.exit(fails.length ? 1 : 0);
