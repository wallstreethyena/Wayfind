#!/usr/bin/env node
// Compatibility guard for the shared rail/card CSS. The repository-wide law,
// renderer census, six-viewport matrix, and mutation control live in
// check-place-card-standard.mjs; this focused check keeps the original
// stretched-desktop regression readable at its smallest scope.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { PLACE_CARD_HEIGHT_PX, PLACE_CARD_MAX_WIDTH_PX, PLACE_CARD_PAGE_GUTTER_PX, PLACE_CARD_PHONE_PEEK, PLACE_CARD_GAP_PX } from "../lib/placeCardStandard.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { WF_PLACE_CARD_CSS } = await loadComponent(join(ROOT, "app/components/css.js"), ROOT);
const CSS = String(WF_PLACE_CARD_CSS || "");
let pass = 0; const fails = []; const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const compact = CSS.replace(/\s+/g, "");
ok(CSS.length > 2000 && CSS.includes(".wf-place-card"), `PROBE: shipped card stylesheet read (${CSS.length} chars)`);
ok(compact.includes(`--wf-card-h:${PLACE_CARD_HEIGHT_PX}px`) && compact.includes("height:var(--wf-card-h)"), "the card root consumes the canonical fixed height");
ok(compact.includes(`--wf-place-card-width:min(100%,${PLACE_CARD_MAX_WIDTH_PX}px`), "the card root owns the canonical viewport-responsive width capped at 440px");
ok(compact.includes(`100vw-${PLACE_CARD_PAGE_GUTTER_PX * 2}px`) && compact.includes(`${PLACE_CARD_PHONE_PEEK}`) && compact.includes(`${PLACE_CARD_GAP_PX}px`), "the width formula consumes the shared gutter, phone peek, and gap constants");
ok(!/\.wf-rail[^{}]*>[^{}]*\.wf-(?:place|rail)-card\{[^}]*flex:\s*0 0 100%/.test(compact), "no rail restores the stretched 100% desktop card");

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
let launchOpts = null;
if (chromium) {
  try { if (existsSync(chromium.executablePath())) launchOpts = {}; } catch {}
  if (!launchOpts && existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) launchOpts = { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" };
  if (!launchOpts && process.platform === "darwin") launchOpts = {};
}
let browserMeasured = false;
if (!launchOpts) console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; only source assertions ran");
else {
  const cards = Array.from({ length: 4 }, (_, i) => `<article class="wf-place-card wf-rail-card"><div class="wf-place-card-layout"><div class="wf-place-card-media"></div><div class="wf-place-card-content"><div class="wf-place-card-name">Card ${i}</div></div></div></article>`).join("");
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${CSS}</style><body style="margin:0;padding:0 13px"><div class="wf-rail">${cards}</div>`;
  const temp = mkdtempSync(join(ROOT, ".wf-rail-width-")); const file = join(temp, "fixture.html"); writeFileSync(file, html);
  const browser = await chromium.launch(launchOpts); browserMeasured = true;
  try {
    for (const width of [320, 390, 768, 900, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }); const page = await context.newPage(); await page.goto("file://" + file);
      const got = await page.evaluate(() => { const card = document.querySelector(".wf-place-card").getBoundingClientRect(); return { innerWidth, width: card.width, height: card.height, scrollWidth: document.documentElement.scrollWidth }; });
      await context.close();
      const expected = Math.min(PLACE_CARD_MAX_WIDTH_PX, (width - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK);
      ok(got.innerWidth === width, `${width}px: achieved viewport was measured`);
      ok(Math.abs(got.width - expected) <= 1, `${width}px: card width follows shared formula (${got.width} vs ${expected})`);
      ok(Math.abs(got.height - PLACE_CARD_HEIGHT_PX) <= .5, `${width}px: card height is canonical (${got.height})`);
      ok(got.scrollWidth <= width + 1, `${width}px: no page overflow`);
    }
  } finally { await browser.close(); rmSync(temp, { recursive: true, force: true }); }
}
if (fails.length) { console.error("check-rail-card-width-is-global: FAIL"); fails.forEach((f) => console.error("  ✗ " + f)); process.exit(1); }
console.log(browserMeasured ? `check-rail-card-width-is-global: OK — ${pass} assertions; canonical geometry measured at six viewports` : `check-rail-card-width-is-global: OK (SOURCE ONLY) — ${pass} assertions; no rendered measurement was performed`);
