#!/usr/bin/env node
// Permanent lock: two standard place cards may not render at different heights.
//
// #1313 made stacked Food list cards `height:auto`. A simple diner painted
// 162–225px, a creator-video cafe 266px, the skeleton 235px, and rails 268px.
// Action rows sat at different Y positions. This file renders the richest
// legitimate states next to the simplest ones and FAILS if outer heights
// differ by more than 1px.
//
// KEEP from #1313 (asserted here, not reverted): stacked lists fill the 13px
// gutters, PHONE_PEEK stays rail-only, stacked photo is 36% (32–38%), rails
// still peek/swipe at 96px media.
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  PLACE_CARD_GAP_PX,
  PLACE_CARD_HEIGHT_PX,
  PLACE_CARD_LIST_MEDIA_MAX_PCT,
  PLACE_CARD_LIST_MEDIA_MIN_PCT,
  PLACE_CARD_LIST_MEDIA_PCT,
  PLACE_CARD_MAX_WIDTH_PX,
  PLACE_CARD_PAGE_GUTTER_PX,
  PLACE_CARD_PHONE_PEEK,
} from "../lib/placeCardStandard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
const MUTATION = process.argv.includes("--mutation-control-child");
const SOURCE_MUTATION = process.argv.includes("--source-mutation-child");
let pass = 0;
const failures = [];
const ok = (condition, message) => { pass++; if (!condition) failures.push(message); };

const stdSrc = readFileSync(path.join(ROOT, "lib/placeCardStandard.js"), "utf8");
ok(/(?:export const)\s+PLACE_CARD_HEIGHT_PX\s*=\s*268/.test(stdSrc),
  "PLACE_CARD_HEIGHT_PX is declared as the one 268px contract");
ok(!/PLACE_CARD_LIST_RESERVE|PLACE_CARD_LIST_HEIGHT|PLACE_CARD_CREATOR_HEIGHT|PLACE_CARD_TALL_HEIGHT/.test(stdSrc),
  "no second height token exists beside PLACE_CARD_HEIGHT_PX");

const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
let compact = String(WF_PLACE_CARD_CSS).replace(/\s+/g, "");
if (SOURCE_MUTATION) {
  compact = compact.replace(/\.wf-place-card\{([^}]*?)height:var\(--wf-card-h\)/, ".wf-place-card{$1height:auto");
}
ok(/\.wf-place-card\{[^}]*height:var\(--wf-card-h\)/.test(compact),
  "the base .wf-place-card rule sets height:var(--wf-card-h) — a rail-only lock is not enough");
ok(!/\.wf-place-card\{[^}]*height:auto/.test(compact),
  "the base .wf-place-card rule is not height:auto");
ok(compact.includes(`--wf-place-card-media:${PLACE_CARD_LIST_MEDIA_PCT}%`),
  "stacked lists still consume the 36% photo-column constant");
ok(!/\.wf-place-card-list[^{]*\{[^}]*1\.08/.test(compact) && !/\.wf-place-card-list,\.wf-rail/.test(compact),
  "1.08 peek is not declared on .wf-place-card-list");
ok(compact.includes(`.wf-rail,.wf8-pcrail,.wf-rail .wf-place-card`) || /\.wf-rail[^{]*\{[^}]*--wf-place-card-width:min\(100%,440px,calc\(\(100vw/.test(compact),
  "horizontal rails still own the peek width formula");

if (SOURCE_MUTATION) {
  if (failures.length) {
    console.error("check-place-card-equal-height: FAIL");
    failures.forEach((failure) => console.error("  ✗ " + failure));
    process.exit(1);
  }
  process.exit(0);
}

const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const Skel = (await loadComponent(path.join(ROOT, "app/components/PlaceCardSkeleton.js"), ROOT)).default;
const homeEntry = path.join(ROOT, "app/home.js");
const HomeMod = await loadComponent(homeEntry, ROOT, { onGraph(graph) {
  const compiled = graph.get(homeEntry);
  writeFileSync(compiled, `${readFileSync(compiled, "utf8")}\nexport { PlaceCard };\n`);
} });
ok(typeof HomeMod.PlaceCard === "function", "PROBE: actual home PlaceCard compiled");
const HomePlaceCard = HomeMod.PlaceCard;
const noop = () => {};

const simple = { id: "eq-simple", name: "Hashtag Café", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574 };
const longName = { ...simple, id: "eq-long", name: "Sarasota Guided Mangrove Tunnel Kayak Tour at Robinson Preserve" };
const cindy = { id: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café", city: "Sarasota", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574 };
const ig = { id: "eq-ig", name: "Catrina's Tacos", city: "Tampa", rating: 4.7, reviews: 180, types: ["restaurant"], distMi: 2.2, governed_score: 91, wfScore: 91, lat: 27.96, lng: -82.48 };
const tags = { id: "eq-tags", name: "Scenic Rooftop Museum Cafe", rating: 4.5, reviews: 120, types: ["museum", "cafe", "restaurant", "park"], distMi: 3.1, governed_score: 88, wfScore: 88, priceLevel: 2, lat: 27.4, lng: -82.4 };
const missing = { id: "eq-miss", name: "Plain Diner", rating: 4.2, reviews: 40, types: ["restaurant"], distMi: 0.8, governed_score: 80, wfScore: 80, lat: 27.4, lng: -82.4 };
const commerce = { id: "eq-book", name: "Robinson Preserve", rating: 4.8, reviews: 1141, types: ["park", "tourist_attraction"], distMi: 4.1, governed_score: 92, wfScore: 92, lat: 27.4, lng: -82.4 };

function stamp(key, markup) {
  const next = markup.replace(/class="wf-place-card/, `data-variant="${key}" class="wf-place-card`);
  ok(next !== markup && next.includes(`data-variant="${key}"`), `PROBE: stamped data-variant=${key} onto the card root`);
  return next;
}

const listMarkup = [
  ["simple", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: simple, rank: 2, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }))],
  ["long-name", renderToStaticMarkup(React.createElement(Iconic, { place: longName, rank: 2, href: "/p/long", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["creator-video", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: cindy, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: "A neighborhood cafe with a useful hook.", onBadge: noop, city: "Sarasota" }))],
  ["instagram", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: ig, rank: 3, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Tampa" }))],
  ["multi-tag", renderToStaticMarkup(React.createElement(Iconic, { place: tags, rank: 1, href: "/p/tags", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["missing-image", renderToStaticMarkup(React.createElement(Iconic, { place: missing, rank: 4, href: "/p/miss", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["commerce", renderToStaticMarkup(React.createElement(Iconic, { place: commerce, rank: 1, href: "/p/book", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
].map(([key, html]) => stamp(key, html)).join("\n");

const REQUIRED = ["simple", "long-name", "creator-video", "instagram", "multi-tag", "missing-image", "commerce"];
ok(REQUIRED.every((key) => listMarkup.includes(`data-variant="${key}"`)),
  `PROBE: fixture includes every required variant (${REQUIRED.join(", ")})`);
ok(/wf-place-card-credit/.test(listMarkup), "PROBE: at least one card rendered creator attribution");
ok(/wf-place-card-monogram/.test(listMarkup), "PROBE: missing-image fallback monogram rendered");
ok(/wf-ticket-pill|wf-place-card-book/.test(listMarkup), "PROBE: commerce CTA rendered");

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${WF_PLACE_CARD_CSS}</style>
${MUTATION ? '<style>.wf-place-card-list .wf-place-card[data-variant="simple"]{height:300px!important}</style>' : ""}
</head>
<body style="margin:0;background:#040810;color:#fff;font:12px sans-serif">
  <div style="padding:0 ${PLACE_CARD_PAGE_GUTTER_PX}px">
    <div class="wf-place-card-list" data-surface="list">${listMarkup}${stamp("skeleton", renderToStaticMarkup(React.createElement(Skel, { count: 1, as: "div" })))}</div>
  </div>
  <div class="wf-rail" data-surface="rail" style="padding:0 ${PLACE_CARD_PAGE_GUTTER_PX}px;margin-top:16px">
    ${renderToStaticMarkup(React.createElement(RailCard, { title: "Clear Kayak Glass Bottom Guided Tour", score: 9.2, rank: 1, href: "/p/rail", photo: "", category: "Activities", distMi: 3.2, creatorVideos: [{ creator: "horrornightsorl", platform: "instagram" }] }))}
    ${renderToStaticMarkup(React.createElement(Skel, { count: 1, as: "div" }))}
    ${renderToStaticMarkup(React.createElement(RailCard, { title: "Next Card Peek", score: 8.4, rank: 2, href: "/p/rail-2", photo: "", category: "Food", distMi: 1.1 }))}
  </div>
</body></html>`;

async function chromiumLaunchOptions() {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
  if (!chromium) return null;
  try {
    const executable = chromium.executablePath();
    if (executable && existsSync(executable)) return { chromium, options: {} };
  } catch {}
  for (const cloud of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/google/chrome/chrome", "/usr/local/bin/chrome"]) {
    if (existsSync(cloud)) return { chromium, options: { executablePath: cloud } };
  }
  if (process.platform === "darwin") return { chromium, options: {} };
  return null;
}

const browserConfig = await chromiumLaunchOptions();
let rendered = false;
const measuredByWidth = {};
if (!browserConfig) {
  ok(!REQUIRE_BROWSER, "Chromium is REQUIRED for this invocation (--require-browser) but no executable is available");
  if (!REQUIRE_BROWSER) console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; source assertions ran");
} else {
  const tmp = mkdtempSync(path.join(ROOT, ".wf-card-eqh-"));
  const file = path.join(tmp, "fixture.html");
  writeFileSync(file, fixture);
  let browser;
  try {
    browser = await browserConfig.chromium.launch(browserConfig.options);
    rendered = true;
    for (const width of [320, 390, 440]) {
      const context = await browser.newContext({ viewport: { width, height: 1600 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto("file://" + file, { waitUntil: "load" });
      const got = await page.evaluate(() => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const media = el.querySelector(".wf-place-card-media,.wf-place-card-sk-media");
          const actions = el.querySelector(".wf-place-card-actions,.wf-place-card-sk-actions");
          const score = el.querySelector(".wf-place-card-score");
          const mb = media ? media.getBoundingClientRect() : null;
          const ab = actions ? actions.getBoundingClientRect() : null;
          const sb = score ? score.getBoundingClientRect() : null;
          return {
            h: r.height, w: r.width, x: r.x, right: r.right, bottom: r.bottom,
            mediaW: mb ? mb.width : 0, mediaH: mb ? mb.height : 0,
            mediaY: mb ? mb.y - r.y : null,
            actionsY: ab ? ab.y - r.y : null,
            scoreY: sb ? sb.y - r.y : null,
            scrollWidth: el.scrollWidth,
          };
        };
        const list = [...document.querySelectorAll('[data-surface="list"] .wf-place-card')].map((el) => ({
          variant: el.getAttribute("data-variant") || (el.classList.contains("wf-place-card-sk") ? "skeleton" : "unknown"),
          skel: el.classList.contains("wf-place-card-sk"),
          ...box(el),
        }));
        const rail = [...document.querySelectorAll('[data-surface="rail"] .wf-place-card')].map((el, i) => ({
          i, skel: el.classList.contains("wf-place-card-sk"), ...box(el),
        }));
        return { innerWidth, scrollWidth: document.documentElement.scrollWidth, list, rail };
      });
      await context.close();
      measuredByWidth[width] = got;
      ok(got.innerWidth === width, `PROBE ${width}px: achieved viewport equals requested (got ${got.innerWidth})`);
      ok(got.scrollWidth <= width + 1, `${width}px: no horizontal page overflow (scrollWidth ${got.scrollWidth})`);
      const live = got.list.filter((c) => !c.skel);
      const skels = got.list.filter((c) => c.skel);
      ok(REQUIRED.every((key) => live.some((c) => c.variant === key)),
        `PROBE ${width}px: all seven required live variants rendered`);
      ok(skels.length === 1, `PROBE ${width}px: list skeleton rendered (got ${skels.length})`);
      const heights = [...live, ...skels].map((c) => c.h);
      const spread = Math.max(...heights) - Math.min(...heights);
      ok(spread <= 1, `${width}px: every standard list card shares one outer height (spread ${spread.toFixed(2)}px; ${[...live, ...skels].map((c) => `${c.variant}:${c.h.toFixed(1)}`).join(" ")}${MUTATION ? " — RENDER mutation caught" : ""})`);
      for (const card of [...live, ...skels]) {
        ok(Math.abs(card.h - PLACE_CARD_HEIGHT_PX) <= 1,
          `${width}px ${card.variant}: outer height is ${PLACE_CARD_HEIGHT_PX}px (got ${card.h.toFixed(2)})`);
        const expectedList = Math.min(PLACE_CARD_MAX_WIDTH_PX, width - PLACE_CARD_PAGE_GUTTER_PX * 2);
        ok(Math.abs(card.w - expectedList) <= 1, `${width}px ${card.variant}: fills the 13px-gutter column (got ${card.w.toFixed(1)}, expected ${expectedList.toFixed(1)})`);
        ok(card.x <= PLACE_CARD_PAGE_GUTTER_PX + 1, `${width}px ${card.variant}: left gutter is 13px (x=${card.x.toFixed(1)})`);
        ok(width - card.right <= PLACE_CARD_PAGE_GUTTER_PX + 2, `${width}px ${card.variant}: no peek dead-strip (right gutter ${(width - card.right).toFixed(1)}px)`);
        ok(card.scrollWidth <= card.w + 1, `${width}px ${card.variant}: no horizontal overflow`);
        if (card.mediaW > 0 && card.w > 0) {
          const pct = 100 * card.mediaW / card.w;
          ok(pct >= PLACE_CARD_LIST_MEDIA_MIN_PCT - 0.6 && pct <= PLACE_CARD_LIST_MEDIA_MAX_PCT + 0.6,
            `${width}px ${card.variant}: stacked photo is 32–38% (got ${pct.toFixed(1)}%)`);
        }
        ok(Math.abs(card.mediaH - card.h) <= 2, `${width}px ${card.variant}: photo column matches card height (media ${card.mediaH.toFixed(1)} vs card ${card.h.toFixed(1)})`);
      }
      const actionYs = live.map((c) => c.actionsY).filter((y) => y != null);
      ok(actionYs.length === live.length, `PROBE ${width}px: every live card has an action row`);
      ok(Math.max(...actionYs) - Math.min(...actionYs) <= 1,
        `${width}px: action rows align (Y-from-top spread ${(Math.max(...actionYs) - Math.min(...actionYs)).toFixed(2)}px)`);
      const mediaYs = [...live, ...skels].map((c) => c.mediaY).filter((y) => y != null);
      ok(mediaYs.length === live.length + skels.length && Math.max(...mediaYs) - Math.min(...mediaYs) <= 1,
        `${width}px: image regions start at the same card-top offset`);
      ok(skels.length && Math.abs(skels[0].h - live[0].h) <= 1,
        `${width}px: skeleton height equals hydrated card height (skel ${skels[0].h.toFixed(1)} vs live ${live[0].h.toFixed(1)})`);

      const expectedPeek = Math.min(PLACE_CARD_MAX_WIDTH_PX, (width - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK);
      ok(got.rail.length >= 2, `PROBE ${width}px: rail still rendered cards (got ${got.rail.length})`);
      for (const card of got.rail) {
        ok(Math.abs(card.h - PLACE_CARD_HEIGHT_PX) <= 1, `${width}px rail[${card.i}]: still ${PLACE_CARD_HEIGHT_PX}px (got ${card.h.toFixed(1)})`);
        ok(Math.abs(card.w - expectedPeek) <= 1, `${width}px rail[${card.i}]: still uses 1.08 peek (got ${card.w.toFixed(1)}, expected ${expectedPeek.toFixed(1)})`);
        if (!card.skel) ok(Math.abs(card.mediaW - 96) <= 2, `${width}px rail[${card.i}]: still 96px media (got ${card.mediaW.toFixed(1)})`);
      }
      if (got.rail.length >= 2) {
        ok(got.rail[1].x > got.rail[0].right - 1, `${width}px: next rail card still sits to the right for swipe/peek`);
      }
    }
  } catch (error) {
    ok(false, `Chromium launch or rendered measurement failed: ${error.message}`);
  } finally {
    if (browser) await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (!MUTATION && !SOURCE_MUTATION) {
  const sourceChild = spawnSync(process.execPath, [SELF, "--source-mutation-child"], { cwd: ROOT, encoding: "utf8", env: { ...process.env } });
  const sourceOut = `${sourceChild.stdout || ""}\n${sourceChild.stderr || ""}`;
  ok(sourceChild.status !== 0, `SOURCE MUTATION CONTROL: height:auto on the base .wf-place-card rule must fail this guard (got status ${sourceChild.status})`);
  ok(sourceOut.includes("the base .wf-place-card rule sets height:var(--wf-card-h)"),
    "SOURCE MUTATION CONTROL: the source evaluator names the height-token failure");

  if (browserConfig || REQUIRE_BROWSER) {
    const args = [SELF, "--mutation-control-child"];
    if (REQUIRE_BROWSER) args.push("--require-browser");
    const child = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env } });
    const out = `${child.stdout || ""}\n${child.stderr || ""}`;
    ok(child.status !== 0, `MUTATION CONTROL: a 300px simple-card override must fail this guard (got status ${child.status})`);
    ok(out.includes("RENDER mutation caught"), "MUTATION CONTROL: the rendered evaluator names the unequal-height failure");
  }
}

if (REQUIRE_BROWSER && !rendered && !MUTATION && !SOURCE_MUTATION) {
  ok(false, "Chromium is REQUIRED for this invocation (--require-browser) but the rendered contract did not execute");
}

if (failures.length) {
  console.error("check-place-card-equal-height: FAIL");
  failures.forEach((failure) => console.error("  ✗ " + failure));
  process.exit(1);
}
if (rendered) {
  console.log(`check-place-card-equal-height: OK — ${pass} assertions; rendered contract executed; seven live variants + skeleton share ${PLACE_CARD_HEIGHT_PX}px at 320/390/440; 300px height mutation goes RED`);
} else {
  console.log("SOURCE CONTRACT PASSED — RENDERED CONTRACT NOT EXECUTED");
  console.log(`check-place-card-equal-height: OK (SOURCE ONLY) — ${pass} assertions; Chromium is unavailable so rendered equal-height and the 300px mutation were not run`);
}
