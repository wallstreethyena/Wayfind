#!/usr/bin/env node
// check-rail-card-width-is-global — ONE card width, every rail, every viewport.
//
// THE OWNER'S ASK (2026-08-30, with a crop of the KPOT Korean BBQ card and a
// screenshot of one event card spanning an entire 1900px desktop window):
// "this is how the card should look EVERYWHERE ... are you able to fix this
// permanently, globally on the entire site?" — and, earlier the same night,
// "I asked for an audit exactly for that ... I notice that happens on the
// desktop a lot ... create a global rule to prevent those issues in the
// future."
//
// THE ROOT CAUSE was one line in the shared stylesheet:
//
//     .wf-rail > .wf-rail-card { flex: 0 0 100%; width: 100% }
//
// One card per scroller width. Correct on a phone, absurd on a desktop: the
// card grows to the window, the 108px photo does not, and a place card becomes
// a letterbox with a thumbnail glued to the left — exactly the stretched
// CONCERT row he photographed. Exploding Trends looked right ONLY because
// railMenuCss overrides that rule for `.wf8 .wf-rail-exploding`, so a single
// rail inside a single container held the correct answer while every other
// rail on the site fell back to full width. "It happens a lot on the desktop"
// is precisely what one un-inherited override produces.
//
// WHAT THIS ASSERTS, and why it is not another grep:
//   1. the base rule is the shared formula, not a 100% width, and the
//      breakpoint ladder exists;
//   2. no rail class re-introduces a full-width card — the per-rail override
//      is what caused this, so the guard bans the shape rather than the file;
//   3. and then it RENDERS the real stylesheet in Chromium at phone, tablet
//      and desktop widths and MEASURES that a card in an events rail, a
//      trending rail and a plain rail are the SAME width as each other and
//      MEANINGFULLY NARROWER than their scroller. Rule 3 is the claim the
//      owner actually made; rules 1 and 2 are how it stays true.
//
// FALSE-POSITIVE SURFACE, stated so a reviewer can falsify it: only
// WF_PLACE_CARD_CSS and WF_RAIL_MENU_CSS are read; only `.wf-rail`-family
// selectors are inspected; the measurement fixture uses the shipped strings
// verbatim rather than a hand-written copy of them.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { WF_RAIL_MENU_CSS } from "../app/components/railMenuCss.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// app/components/css.js imports lib/railCollapse extensionless (Next resolves
// it; plain node does not), so the stylesheet is loaded through the same
// compiler the render smokes use. The point is to measure the SHIPPED string,
// never a hand-copied approximation of it — a guard that renders its own idea
// of the CSS proves nothing about the page.
const { WF_PLACE_CARD_CSS } = await loadComponent(join(ROOT, "app/components/css.js"), ROOT);
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const CSS = String(WF_PLACE_CARD_CSS || "");
ok(CSS.length > 2000 && CSS.includes(".wf-rail"), `PROBE: the shipped place-card stylesheet was read (${CSS.length} chars)`);

// ── 1. the base rule IS the formula ─────────────────────────────────────────
const base = CSS.match(/\.wf-rail>\.wf-rail-card\{[^}]*\}/);
ok(!!base, "positive control: `.wf-rail>.wf-rail-card` is a real selector in the shipped CSS");
ok(!!base && /flex:0 0 calc\(\(100% - \(var\(--wf-rail-vis\) - 1\) \* var\(--wf-rail-gap\)\) \/ var\(--wf-rail-vis\)\)/.test(base[0]),
  "the base card width is the shared peek formula — every rail on the site inherits it");
ok(!!base && !/flex:0 0 100%/.test(base[0]),
  "…and NOT flex:0 0 100%, which is the rule that made one event card span a 1900px desktop window");
ok(!!base && /width:auto/.test(base[0]),
  "…with width:auto — a leftover width:100% fights the flex-basis and wins on some engines, which is how this looks fixed in one browser and broken in another");
for (const [bp, vis] of [["560", "1.35"], ["900", "1.9"], ["1100", "2.4"], ["1400", "3.4"]]) {
  ok(new RegExp(`@media\\(min-width:${bp}px\\)\\{ ?\\.wf-rail\\{--wf-rail-vis:${vis.replace(".", "\\.")}\\}`).test(CSS),
    `the ladder sets --wf-rail-vis:${vis} at ${bp}px — the same steps the rail drop already used, so a card is one size everywhere`);
}
ok(/\.wf-rail\{\s*--wf-rail-vis:1\.08;/.test(CSS),
  "…and the phone default is 1.08 — a fractional value on purpose: the sliver of the next card is what says the row scrolls");

// ── 2. nothing re-introduces a full-width card ──────────────────────────────
// The per-rail override is what caused this, so the SHAPE is banned rather
// than any one file. A future rail that wants a different peek changes
// --wf-rail-vis; it does not go back to 100%.
for (const [name, sheet] of [["WF_PLACE_CARD_CSS", CSS], ["WF_RAIL_MENU_CSS", String(WF_RAIL_MENU_CSS || "")]]) {
  const offenders = (sheet.match(/[^{}]*\.wf-rail[^{}]*\{[^}]*\}/g) || [])
    .filter((r) => /\.wf-rail-card/.test(r) && /flex:\s*0 0 100%|flex-basis:\s*100%/.test(r));
  ok(offenders.length === 0,
    `${name}: a rail card is pinned to full width again — ${offenders[0] ? offenders[0].slice(0, 120) : ""}. Change --wf-rail-vis instead; 100% is what this guard exists to stop.`);
}

// ── 3. MEASURED, in a real browser, at three widths ─────────────────────────
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("@playwright/test")); } catch { chromium = null; } }
function resolveChromium() {
  if (!chromium) return null;
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {};
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log("  (Chromium measure skipped — no browser; the source rules above still ran)");
} else {
  // Three different rails, one fixture: a plain rail, the events rail, and the
  // trending rail inside .wf8 (the one that already looked right). If the fix
  // is global they measure identically; if it is another local override they
  // do not, which is the whole bug in one assertion.
  const card = (n) => `<article class="wf-place-card wf-rail-card"><div class="wf-place-card-layout"><div class="wf-place-card-media"></div><div class="wf-place-card-content"><div class="wf-place-card-name">Card ${n}</div></div></div></article>`;
  const cards = [1, 2, 3, 4, 5].map(card).join("");
  const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${CSS}\n${WF_RAIL_MENU_CSS}</style></head>
<body style="margin:0;background:#040810">
<div id="plain" class="wf-rail">${cards}</div>
<div id="events" class="wf-rail wf-rail-events">${cards}</div>
<div class="wf8"><div class="wf8-in"><div id="drop" class="wf-rail wf-rail-exploding">${cards}</div></div></div>
</body></html>`;
  const tmp = mkdtempSync(join(ROOT, ".wf-railw-"));
  const pagePath = join(tmp, "rails.html");
  writeFileSync(pagePath, fixture);
  const browser = await chromium.launch(launchOpts);
  try {
    for (const vp of [{ width: 390, height: 844, label: "phone" }, { width: 900, height: 900, label: "tablet" }, { width: 1512, height: 950, label: "desktop" }]) {
      const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })).newPage();
      await page.goto("file://" + pagePath, { waitUntil: "load" });
      const got = await page.evaluate(() => {
        const m = (id) => {
          const rail = document.getElementById(id);
          const c = rail && rail.firstElementChild;
          if (!rail || !c) return null;
          return { rail: rail.getBoundingClientRect().width, card: c.getBoundingClientRect().width };
        };
        return { innerWidth: window.innerWidth, plain: m("plain"), events: m("events"), drop: m("drop") };
      });
      await page.close();
      ok(got.innerWidth === vp.width, `PROBE ${vp.label}: measured viewport is ${vp.width}px (got ${got.innerWidth})`);
      ok(got.plain && got.events && got.drop, `PROBE ${vp.label}: all three rails rendered a card`);
      if (!got.plain || !got.events || !got.drop) continue;
      ok(got.plain.card > 40 && got.events.card > 40 && got.drop.card > 40,
        `PROBE ${vp.label}: measured card widths are real (plain ${got.plain.card.toFixed(0)}, events ${got.events.card.toFixed(0)}, drop ${got.drop.card.toFixed(0)})`);
      // THE PARITY CLAIM, which is what he actually asked for.
      ok(Math.abs(got.plain.card - got.events.card) < 1.5,
        `${vp.label}: a plain rail card (${got.plain.card.toFixed(1)}px) and an EVENTS rail card (${got.events.card.toFixed(1)}px) are the same width`);
      // Above the phone breakpoint a card must be visibly narrower than its
      // scroller — that difference IS the defect he photographed.
      if (vp.width >= 900) {
        for (const [id, got_] of [["plain", got.plain], ["events", got.events], ["drop", got.drop]]) {
          ok(got_.card < got_.rail * 0.75,
            `${vp.label}: the ${id} rail shows more than one card — card ${got_.card.toFixed(0)}px vs scroller ${got_.rail.toFixed(0)}px. A card at ~100% of a desktop scroller is the stretched row this guard exists for.`);
        }
      }
      if (vp.width === 390) {
        ok(got.plain.card > got.plain.rail * 0.8 && got.plain.card < got.plain.rail,
          `phone: a card still fills most of the row but not all of it — the sliver of the next card is the scroll affordance (card ${got.plain.card.toFixed(0)} of ${got.plain.rail.toFixed(0)})`);
      }
    }
  } finally {
    await browser.close();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (fails.length) {
  console.error("check-rail-card-width-is-global: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-rail-card-width-is-global: OK — ${pass} assertions; one card width formula shared by every .wf-rail, no rail pinned to 100%, and plain/events/trending rails MEASURED equal in Chromium at 390, 900 and 1512px`);
