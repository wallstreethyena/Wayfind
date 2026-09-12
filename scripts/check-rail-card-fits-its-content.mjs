#!/usr/bin/env node
// Focused content-fit compatibility check. The global geometry census and
// mandatory viewport matrix live in check-place-card-standard.mjs. This keeps
// the original long-tour-title and price-clipping regression explicit.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { PLACE_CARD_HEIGHT_PX, PLACE_CARD_MAX_WIDTH_PX } from "../lib/placeCardStandard.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const ok = (condition, message) => { pass++; if (!condition) failures.push(message); };
const { WF_PLACE_CARD_CSS } = await loadComponent(join(ROOT, "app/components/css.js"), ROOT);
const CSS = String(WF_PLACE_CARD_CSS || "");
const compact = CSS.replace(/\s+/g, "");
ok(compact.includes(`--wf-card-h:${PLACE_CARD_HEIGHT_PX}px`), "shared card height comes from the canonical constant");
ok(compact.includes(`${PLACE_CARD_MAX_WIDTH_PX}px`), "shared card width carries the canonical cap");
ok(!/\.wf-rail-card:not\(:has\([^}]*--wf-card-h/.test(compact), "missing furniture cannot select a second card height");
ok(!/\.wf-rail-events[^{}]*\{[^}]*(?:height|min-height):/.test(compact), "event state cannot select a second card height");

let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
let options = null;
if (chromium) {
  try { if (existsSync(chromium.executablePath())) options = {}; } catch {}
  if (!options && existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) options = { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" };
  if (!options && process.platform === "darwin") options = {};
}
let measured = false;
if (!options) {
  console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; only source assertions ran");
} else {
  const Rail = (await loadComponent(join(ROOT, "app/components/HomeAffiliateActivityRail.js"), ROOT)).default;
  const items = [
    { code: "median", title: "Clear Kayak Glass Bottom Guided Tour in St. Pete" },
    { code: "long", title: "Clear Kayak Glass Bottom LED Night Guided Eco Tour of Shell Key Preserve" },
  ].map((item) => ({ ...item, image: "", city: "St. Petersburg", reviews: 6571, duration: "2 hours", fromPrice: 59, rating: 5, chips: [{ key: "k", icon: "🛶", label: "Kayaking" }] }));
  const markup = renderToStaticMarkup(React.createElement(Rail, { items, contentId: "guard" }));
  const temp = mkdtempSync(join(ROOT, ".wf-card-fit-"));
  const file = join(temp, "fixture.html");
  writeFileSync(file, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${CSS}</style><body style="margin:0;padding:0 13px">${markup}`);
  const browser = await chromium.launch(options);
  measured = true;
  try {
    for (const width of [320, 390, 768, 900, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 950 } });
      const page = await context.newPage();
      await page.goto("file://" + file);
      const cards = await page.evaluate(() => [...document.querySelectorAll(".wf-place-card")].map((card) => {
        const name = card.querySelector(".wf-place-card-name");
        const meta = card.querySelector(".wf-place-card-meta");
        return {
          height: card.getBoundingClientRect().height,
          width: card.getBoundingClientRect().width,
          overflow: card.scrollWidth > card.clientWidth + 1,
          controls: ["save", "like", "dislike", "share"].filter((key) => card.querySelector(".wf-place-card-" + key)).length,
          titleClipped: name.scrollHeight > name.clientHeight + 1,
          titleClamp: getComputedStyle(name).webkitLineClamp,
          metaOverflow: meta.scrollWidth - meta.clientWidth,
          metaText: meta.textContent || "",
        };
      }));
      await context.close();
      ok(cards.length === 2, `${width}px: real activity rail rendered two cards`);
      cards.forEach((card) => {
        ok(Math.abs(card.height - PLACE_CARD_HEIGHT_PX) <= .5, `${width}px: content keeps canonical height`);
        ok(!card.overflow, `${width}px: card box does not overflow`);
        ok(card.controls === 4, `${width}px: all four actions remain`);
        ok(card.titleClamp === "3", `${width}px: long tour titles retain the deliberate three-line clamp`);
        ok(/from \$59/.test(card.metaText), `${width}px: price fact is present in the measured row`);
      });
      if (width >= 900) {
        ok(cards.every((card) => !card.titleClipped), `${width}px: median and long real tour titles are fully readable`);
        ok(cards.every((card) => card.metaOverflow <= 1), `${width}px: facts row keeps the price visible without clipping`);
        ok(cards.every((card) => card.width >= 430), `${width}px: desktop cards keep the furniture-safe width floor`);
      }
    }
  } finally {
    await browser.close();
    rmSync(temp, { recursive: true, force: true });
  }
}
if (failures.length) {
  console.error("check-rail-card-fits-its-content: FAIL");
  failures.forEach((failure) => console.error("  ✗ " + failure));
  process.exit(1);
}
console.log(measured
  ? `check-rail-card-fits-its-content: OK — ${pass} assertions; real long-title activity cards measured at six viewports`
  : `check-rail-card-fits-its-content: OK (SOURCE ONLY) — ${pass} assertions; no rendered measurement was performed`);
