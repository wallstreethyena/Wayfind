#!/usr/bin/env node
// Permanent visual-contract lock for the shared place card.
//
// Dimensions alone are not enough: #1313 kept 268 on rails and still replaced
// the #1302 compact hierarchy with oversized list padding and 38px thumbs.
// This guard asserts the founder-locked premium language AND the #1313
// geometry that is allowed to stay (full-width 13px gutters, 36% stacked
// photo, rail-only 1.08 peek).
//
// Source checks always run. Rendered checks run only when Chromium exists.
// --require-browser (GitHub merge CI) fails if Chromium is missing.
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
  PLACE_CARD_MOBILE_ACT_H_PX,
  PLACE_CARD_MOBILE_ACT_PAD_TOP_PX,
  PLACE_CARD_MOBILE_ACTION_GAP_PX,
  PLACE_CARD_MOBILE_ACTION_GRID,
  PLACE_CARD_MOBILE_AWARD_MIN_H_PX,
  PLACE_CARD_MOBILE_BP_PX,
  PLACE_CARD_MOBILE_CONTENT_PAD,
  PLACE_CARD_MOBILE_HIGHLIGHT_MIN_H_PX,
  PLACE_CARD_MOBILE_HIGHLIGHT_PAD,
  PLACE_CARD_MOBILE_META_MARGIN,
  PLACE_CARD_MOBILE_META_PX,
  PLACE_CARD_MOBILE_NAME_PX,
  PLACE_CARD_PAGE_GUTTER_PX,
  PLACE_CARD_PHONE_PEEK,
  PLACE_CARD_RADIUS_PX,
} from "../lib/placeCardStandard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
const SOURCE_MUTATION = process.argv.includes("--source-mutation-child");
const mutationFlag = process.argv.find((arg) => arg.startsWith("--mutation="));
const MUTATION = mutationFlag ? mutationFlag.slice("--mutation=".length) : "";
let pass = 0;
const failures = [];
const ok = (condition, message) => { pass++; if (!condition) failures.push(message); };

const stdSrc = readFileSync(path.join(ROOT, "lib/placeCardStandard.js"), "utf8");
ok(/(?:export const)\s+PLACE_CARD_HEIGHT_PX\s*=\s*268/.test(stdSrc), "height token is 268");
ok(/(?:export const)\s+PLACE_CARD_RADIUS_PX\s*=\s*17/.test(stdSrc), "radius token is 17");
ok(/(?:export const)\s+PLACE_CARD_MOBILE_BP_PX\s*=\s*430/.test(stdSrc), "compact breakpoint token is 430");
ok(stdSrc.includes('PLACE_CARD_MOBILE_CONTENT_PAD = "10px 10px 8px"'), "compact content pad token is 10/10/8");
ok(stdSrc.includes('PLACE_CARD_MOBILE_ACTION_GRID = "44px 26px 26px minmax(0,1fr)"'), "compact action grid token is 44/26/26");
ok(/(?:export const)\s+PLACE_CARD_MOBILE_ACT_H_PX\s*=\s*34/.test(stdSrc), "compact action height token is 34");

const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
let compact = String(WF_PLACE_CARD_CSS).replace(/\s+/g, "");
if (SOURCE_MUTATION) {
  compact = compact.replace("padding:10px10px8px!important", "padding:16px16px16px!important");
}

const mobileBlock = compact.match(/@media\(max-width:430px\)\{([\s\S]*?)\}\s*@media\(min-width/) || compact.match(/@media\(max-width:430px\)\{([\s\S]*)/);
ok(!!mobileBlock, "PROBE: compact @media(max-width:430px) block exists");
const mobile = mobileBlock ? mobileBlock[1] : "";
ok(mobile.includes(`padding:${PLACE_CARD_MOBILE_CONTENT_PAD.replace(/\s+/g, "")}!important`),
  "430px content padding is the #1302 10px 10px 8px contract");
ok(mobile.includes(`font-size:${PLACE_CARD_MOBILE_NAME_PX}px!important`), "430px title is 15px");
ok(mobile.includes(`margin:${PLACE_CARD_MOBILE_META_MARGIN.replace(/\s+/g, "")}!important`), "430px meta margin is 3px 0 2px");
ok(mobile.includes(`font-size:${PLACE_CARD_MOBILE_META_PX}px!important`), "430px meta text is 9.75px");
ok(mobile.includes(`min-height:${PLACE_CARD_MOBILE_AWARD_MIN_H_PX}px`) && mobile.includes("padding:2px7px2px4px"),
  "430px award is 22px min-height with 2/7/2/4 padding");
ok(mobile.includes("margin-bottom:2px!important") && mobile.includes(`min-height:${PLACE_CARD_MOBILE_HIGHLIGHT_MIN_H_PX}px`)
  && mobile.includes(`padding:${PLACE_CARD_MOBILE_HIGHLIGHT_PAD.replace(/\s+/g, "")}!important`),
  "430px highlights are 21px / 1px 7px / 2px bottom margin");
ok(mobile.includes(`--wf-act-h:${PLACE_CARD_MOBILE_ACT_H_PX}px`) && mobile.includes(`padding-top:${PLACE_CARD_MOBILE_ACT_PAD_TOP_PX}px`),
  "430px action row is 34px / padding-top 4px on every card, not rails only");
ok(mobile.includes(`grid-template-columns:${PLACE_CARD_MOBILE_ACTION_GRID.replace(/\s+/g, "")}`)
  && mobile.includes(`gap:${PLACE_CARD_MOBILE_ACTION_GAP_PX}px!important`),
  "430px action grid is 44px 26px 26px minmax(0,1fr) / 4px");
ok(!mobile.includes("--wf-place-card-media:88px") && !mobile.includes("width:88px!important"),
  "430px compact block does not restore the 88px stacked-photo sliver");
ok(!/\.wf-rail \.wf-place-card-actions/.test(mobile) || mobile.includes(".wf-place-card-actions{--wf-act-h:34px"),
  "compact action height is not rail-scoped");
ok(compact.includes(`border-radius:${PLACE_CARD_RADIUS_PX}px!important`), "card radius is 17px");
ok(compact.includes("border-color:rgba(159,177,203,.25)!important"), "canonical subtle border remains");
ok(compact.includes("background:linear-gradient(145deg,rgba(255,255,255,.035),transparent36%),#111824!important"),
  "canonical dark layered background remains");
ok(compact.includes("box-shadow:014px36pxrgba(0,0,0,.27),inset01pxrgba(255,255,255,.035)"),
  "canonical card shadow remains");
ok(compact.includes("background:linear-gradient(90deg,transparent,#F97316,transparent)"),
  "canonical orange top accent remains");
ok(compact.includes(`--wf-place-card-media:${PLACE_CARD_LIST_MEDIA_PCT}%`), "stacked lists still use 36% media");
ok(compact.includes(".wf-place-card,.wf-place-card-slot,.wf-place-card-list{--wf-place-card-width:min(100%,440px)}"),
  "stacked lists fill the column — peek is not on .wf-place-card-list");
ok(compact.includes("height:var(--wf-card-h)") && !/\.wf-place-card\{[^}]*height:auto/.test(compact),
  "outer height is the shared token, not content-sized");

if (SOURCE_MUTATION) {
  if (failures.length) {
    console.error("check-place-card-visual-contract: FAIL");
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
const HomePlaceCard = HomeMod.PlaceCard;
const noop = () => {};
const simple = { id: "eq-simple", name: "Hashtag Café", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574 };
const longName = { ...simple, id: "eq-long", name: "Sarasota Guided Mangrove Tunnel Kayak Tour at Robinson Preserve" };
const cindy = { id: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café", city: "Sarasota", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574 };
const ig = { id: "eq-ig", name: "Catrina's Tacos", city: "Tampa", rating: 4.7, reviews: 180, types: ["restaurant"], distMi: 2.2, governed_score: 91, wfScore: 91, lat: 27.96, lng: -82.48 };
const tags = { id: "eq-tags", name: "Scenic Rooftop Museum Cafe", rating: 4.5, reviews: 120, types: ["museum", "cafe", "restaurant", "park"], distMi: 3.1, governed_score: 88, wfScore: 88, priceLevel: 2, lat: 27.4, lng: -82.4 };
const missing = { id: "eq-miss", name: "Plain Diner", rating: 4.2, reviews: 40, types: ["restaurant"], distMi: 0.8, governed_score: 80, wfScore: 80, lat: 27.4, lng: -82.4 };
const commerce = { id: "eq-book", name: "Robinson Preserve", rating: 4.8, reviews: 1141, types: ["park", "tourist_attraction"], distMi: 4.1, governed_score: 92, wfScore: 92, lat: 27.4, lng: -82.4 };
const ordinary = { ...simple, id: "eq-ord", name: "Neighborhood Grill", governed_score: 81, wfScore: 81, rating: 4.3, reviews: 64 };

function stamp(key, markup) {
  return markup.replace(/class="wf-place-card/, `data-variant="${key}" class="wf-place-card`);
}

const listMarkup = [
  ["simple", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: simple, rank: 2, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }))],
  ["perfect-score", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: { ...simple, id: "eq-perf", governed_score: 100, wfScore: 100 }, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }))],
  ["ordinary-score", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: ordinary, rank: 4, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }))],
  ["long-name", renderToStaticMarkup(React.createElement(Iconic, { place: longName, rank: 2, href: "/p/long", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["creator-video", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: cindy, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: "A neighborhood cafe with a useful hook.", onBadge: noop, city: "Sarasota" }))],
  ["instagram", renderToStaticMarkup(React.createElement(HomePlaceCard, { p: ig, rank: 3, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Tampa" }))],
  ["multi-tag", renderToStaticMarkup(React.createElement(Iconic, { place: tags, rank: 1, href: "/p/tags", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["missing-image", renderToStaticMarkup(React.createElement(Iconic, { place: missing, rank: 4, href: "/p/miss", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
  ["commerce", renderToStaticMarkup(React.createElement(Iconic, { place: commerce, rank: 1, href: "/p/book", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }))],
].map(([key, html]) => stamp(key, html)).join("\n");

const MUTATION_CSS = {
  "height-300": ".wf-place-card-list .wf-place-card{height:300px!important}",
  "pad-16": ".wf-place-card-content{padding:16px!important}",
  "act-44": ".wf-place-card-actions{--wf-act-h:44px!important}.wf-place-card-actions>a,.wf-place-card-actions>button,.wf-place-card-actions>span{height:44px!important;min-height:44px!important}",
  "like-oversized": ".wf-place-card-like,.wf-place-card-dislike{width:38px!important;min-width:38px!important;flex:0 0 38px!important}",
  "media-20": ".wf-place-card-list .wf-place-card{--wf-place-card-media:20%!important}",
  "radius-4": ".wf-place-card{border-radius:4px!important}",
  "list-peek": `.wf-place-card-list,.wf-place-card-list .wf-place-card{--wf-place-card-width:min(100%,${PLACE_CARD_MAX_WIDTH_PX}px,calc((100vw - ${PLACE_CARD_PAGE_GUTTER_PX * 2}px - (${PLACE_CARD_PHONE_PEEK} - 1) * ${PLACE_CARD_GAP_PX}px) / ${PLACE_CARD_PHONE_PEEK}))!important;flex:0 0 var(--wf-place-card-width)!important}`,
};

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${WF_PLACE_CARD_CSS}</style>
${MUTATION && MUTATION_CSS[MUTATION] ? `<style>${MUTATION_CSS[MUTATION]}</style>` : ""}
</head>
<body style="margin:0;background:#040810;color:#fff;font:12px sans-serif">
  <div style="padding:0 ${PLACE_CARD_PAGE_GUTTER_PX}px">
    <div class="wf-place-card-list" data-surface="list">${listMarkup}${stamp("skeleton", renderToStaticMarkup(React.createElement(Skel, { count: 1, as: "div" })))}</div>
  </div>
  <div class="wf-rail" data-surface="rail" style="padding:0 ${PLACE_CARD_PAGE_GUTTER_PX}px;margin-top:16px">
    ${renderToStaticMarkup(React.createElement(RailCard, { title: "Clear Kayak Glass Bottom Guided Tour", score: 9.2, rank: 1, href: "/p/rail", photo: "", category: "Activities", distMi: 3.2 }))}
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
if (!browserConfig) {
  ok(!REQUIRE_BROWSER, "Chromium is REQUIRED for this invocation (--require-browser) but no executable is available");
  if (!REQUIRE_BROWSER) console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; source visual-contract assertions ran");
} else {
  const tmp = mkdtempSync(path.join(ROOT, ".wf-card-vis-"));
  const file = path.join(tmp, "fixture.html");
  writeFileSync(file, fixture);
  let browser;
  try {
    browser = await browserConfig.chromium.launch(browserConfig.options);
    rendered = true;
    const widths = MUTATION ? [390] : [320, 390, 440];
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 2400 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto("file://" + file, { waitUntil: "load" });
      const got = await page.evaluate(() => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const media = el.querySelector(".wf-place-card-media,.wf-place-card-sk-media");
          const actions = el.querySelector(".wf-place-card-actions,.wf-place-card-sk-actions");
          const content = el.querySelector(".wf-place-card-content");
          const name = el.querySelector(".wf-place-card-name");
          const meta = el.querySelector(".wf-place-card-meta");
          const award = el.querySelector(".wf-place-card-award");
          const highs = el.querySelector(".wf-place-card-highlights");
          const like = el.querySelector(".wf-place-card-like");
          const score = el.querySelector(".wf-place-card-score");
          const credit = el.querySelector(".wf-place-card-credit");
          const mb = media && media.getBoundingClientRect();
          const ab = actions && actions.getBoundingClientRect();
          const acs = actions ? getComputedStyle(actions) : null;
          const ccs = content ? getComputedStyle(content) : null;
          return {
            h: r.height, w: r.width, x: r.x, right: r.right,
            radius: parseFloat(cs.borderTopLeftRadius),
            bg: cs.backgroundColor,
            border: cs.borderTopColor,
            shadow: cs.boxShadow,
            padT: ccs ? parseFloat(ccs.paddingTop) : null,
            padR: ccs ? parseFloat(ccs.paddingRight) : null,
            padB: ccs ? parseFloat(ccs.paddingBottom) : null,
            padL: ccs ? parseFloat(ccs.paddingLeft) : null,
            namePx: name ? parseFloat(getComputedStyle(name).fontSize) : null,
            nameWeight: name ? getComputedStyle(name).fontWeight : null,
            metaM: meta ? getComputedStyle(meta).margin : null,
            metaPx: meta ? parseFloat(getComputedStyle(meta.querySelector("span") || meta).fontSize) : null,
            awardH: award ? award.getBoundingClientRect().height : null,
            awardPad: award ? getComputedStyle(award).padding : null,
            highH: highs ? (() => {
              const chip = highs.querySelector("button,span");
              if (!chip) return null;
              const minH = parseFloat(getComputedStyle(chip).minHeight);
              return Number.isFinite(minH) && minH > 0 ? minH : chip.getBoundingClientRect().height;
            })() : null,
            highPad: highs ? (() => {
              const chip = highs.querySelector("button,span");
              return chip ? getComputedStyle(chip).padding : null;
            })() : null,
            actH: acs ? parseFloat(acs.getPropertyValue("--wf-act-h")) || (ab ? ab.height : null) : null,
            actPadT: acs ? parseFloat(acs.paddingTop) : null,
            grid: acs ? acs.gridTemplateColumns : null,
            likeW: like ? like.getBoundingClientRect().width : null,
            mediaW: mb ? mb.width : 0,
            mediaH: mb ? mb.height : 0,
            actionsY: ab ? ab.y - r.y : null,
            scoreY: score ? score.getBoundingClientRect().y - r.y : null,
            creditY: credit ? credit.getBoundingClientRect().y - r.y : null,
            scrollWidth: el.scrollWidth,
          };
        };
        const list = [...document.querySelectorAll('[data-surface="list"] .wf-place-card')].map((el) => ({
          variant: el.getAttribute("data-variant") || (el.classList.contains("wf-place-card-sk") ? "skeleton" : "unknown"),
          skel: el.classList.contains("wf-place-card-sk"),
          ...box(el),
        }));
        const rail = [...document.querySelectorAll('[data-surface="rail"] .wf-place-card')].map((el, i) => ({ i, ...box(el) }));
        return { innerWidth, scrollWidth: document.documentElement.scrollWidth, list, rail };
      });
      await context.close();
      ok(got.innerWidth === width, `PROBE ${width}px: achieved viewport ${got.innerWidth}`);
      ok(got.scrollWidth <= width + 1, `${width}px: no horizontal overflow`);
      const live = got.list.filter((c) => !c.skel);
      const compactViewport = width <= PLACE_CARD_MOBILE_BP_PX;
      const heights = got.list.map((c) => c.h);
      const spread = Math.max(...heights) - Math.min(...heights);
      ok(spread <= 1, `${width}px: one outer height (spread ${spread.toFixed(2)}px)${MUTATION === "height-300" ? " — RENDER mutation caught" : ""}`);
      for (const card of got.list) {
        ok(Math.abs(card.h - PLACE_CARD_HEIGHT_PX) <= 1,
          `${width}px ${card.variant}: height ${PLACE_CARD_HEIGHT_PX} (got ${card.h.toFixed(2)})${MUTATION === "height-300" ? " — RENDER mutation caught" : ""}`);
        const expectedList = Math.min(PLACE_CARD_MAX_WIDTH_PX, width - PLACE_CARD_PAGE_GUTTER_PX * 2);
        ok(Math.abs(card.w - expectedList) <= 1,
          `${width}px ${card.variant}: 13px gutters / full column (w=${card.w.toFixed(1)})${MUTATION === "list-peek" ? " — RENDER mutation caught" : ""}`);
        ok(card.x <= PLACE_CARD_PAGE_GUTTER_PX + 1, `${width}px ${card.variant}: left gutter 13`);
        ok(width - card.right <= PLACE_CARD_PAGE_GUTTER_PX + 2, `${width}px ${card.variant}: no peek dead-strip`);
        if (card.mediaW > 0 && card.w > 0) {
          const pct = 100 * card.mediaW / card.w;
          ok(pct >= PLACE_CARD_LIST_MEDIA_MIN_PCT - 0.6 && pct <= PLACE_CARD_LIST_MEDIA_MAX_PCT + 0.6,
            `${width}px ${card.variant}: stacked photo 32–38% (got ${pct.toFixed(1)}%)${MUTATION === "media-20" ? " — RENDER mutation caught" : ""}`);
        }
        ok(Math.abs(card.radius - PLACE_CARD_RADIUS_PX) <= 0.5,
          `${width}px ${card.variant}: radius ${PLACE_CARD_RADIUS_PX} (got ${card.radius})${MUTATION === "radius-4" ? " — RENDER mutation caught" : ""}`);
        ok(/rgb\(\s*17,\s*24,\s*36\s*\)/.test(card.bg || ""),
          `${width}px ${card.variant}: canonical #111824 card background (got ${card.bg})`);
        ok(/rgba\(\s*159,\s*177,\s*203/.test(card.border || ""),
          `${width}px ${card.variant}: canonical rgba(159,177,203) border (got ${card.border})`);
        ok(/14px|36px/.test(card.shadow || ""),
          `${width}px ${card.variant}: canonical 14px/36px shadow remains (got ${card.shadow})`);
        if (card.scoreY != null) {
          ok(card.scoreY >= 0 && card.scoreY <= 18, `${width}px ${card.variant}: score badge stays top-right (y=${card.scoreY.toFixed(1)})`);
        }
        if (card.creditY != null && card.actionsY != null) {
          ok(card.creditY <= card.actionsY + 1, `${width}px ${card.variant}: creator attribution sits above the action row`);
        }
        if (compactViewport && card.padT != null) {
          ok(Math.abs(card.padT - 10) <= 0.5 && Math.abs(card.padR - 10) <= 0.5 && Math.abs(card.padB - 8) <= 0.5,
            `${width}px ${card.variant}: content pad 10/10/8 (got ${card.padT}/${card.padR}/${card.padB})${MUTATION === "pad-16" ? " — RENDER mutation caught" : ""}`);
          if (card.namePx != null) ok(Math.abs(card.namePx - PLACE_CARD_MOBILE_NAME_PX) <= 0.5, `${width}px ${card.variant}: title 15px`);
          if (card.metaM) ok(/3px/.test(card.metaM) && /2px/.test(card.metaM), `${width}px ${card.variant}: meta margin 3px 0 2px (got ${card.metaM})`);
          if (card.metaPx != null) ok(Math.abs(card.metaPx - PLACE_CARD_MOBILE_META_PX) <= 0.6, `${width}px ${card.variant}: meta text 9.75px`);
          if (card.awardH != null) ok(card.awardH >= 21 && card.awardH <= 28, `${width}px ${card.variant}: award chip ~22px (got ${card.awardH.toFixed(1)})`);
          if (card.awardPad) ok(/2px/.test(card.awardPad) && /7px/.test(card.awardPad), `${width}px ${card.variant}: award padding 2/7/2/4`);
          if (card.highH != null) ok(card.highH >= 20 && card.highH <= 24, `${width}px ${card.variant}: highlight chip ~21px (got ${card.highH})`);
          if (card.highPad) ok(/1px/.test(card.highPad) && /7px/.test(card.highPad), `${width}px ${card.variant}: highlight padding 1px 7px`);
          if (card.actH != null) ok(Math.abs(card.actH - PLACE_CARD_MOBILE_ACT_H_PX) <= 1,
            `${width}px ${card.variant}: action height 34 (got ${card.actH})${MUTATION === "act-44" ? " — RENDER mutation caught" : ""}`);
          if (card.actPadT != null) ok(Math.abs(card.actPadT - PLACE_CARD_MOBILE_ACT_PAD_TOP_PX) <= 0.5, `${width}px ${card.variant}: action pad-top 4`);
          if (card.grid) {
            ok(/44px/.test(card.grid) && (card.grid.match(/26px/g) || []).length >= 2,
              `${width}px ${card.variant}: action grid 44/26/26 (got ${card.grid})`);
          }
          if (card.likeW != null && !card.skel) {
            ok(card.likeW <= 30,
              `${width}px ${card.variant}: like/dislike stay compact (got ${card.likeW.toFixed(1)}px)${MUTATION === "like-oversized" ? " — RENDER mutation caught" : ""}`);
          }
        } else if (!compactViewport && card.padT != null) {
          ok(Math.abs(card.padT - 13) <= 0.5 && Math.abs(card.padR - 13) <= 0.5 && Math.abs(card.padB - 11) <= 0.5,
            `${width}px ${card.variant}: default content pad 13/13/11 (got ${card.padT}/${card.padR}/${card.padB})${MUTATION === "pad-16" ? " — RENDER mutation caught" : ""}`);
          if (card.namePx != null) ok(Math.abs(card.namePx - 16) <= 0.5, `${width}px ${card.variant}: default title 16px`);
          if (card.actH != null) ok(Math.abs(card.actH - 38) <= 1,
            `${width}px ${card.variant}: default action height 38 (got ${card.actH})${MUTATION === "act-44" ? " — RENDER mutation caught" : ""}`);
        }
      }
      const actionYs = live.map((c) => c.actionsY).filter((y) => y != null);
      if (actionYs.length === live.length) {
        ok(Math.max(...actionYs) - Math.min(...actionYs) <= 1, `${width}px: action rows align`);
      }
      const expectedPeek = Math.min(PLACE_CARD_MAX_WIDTH_PX, (width - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK);
      for (const card of got.rail) {
        ok(Math.abs(card.h - PLACE_CARD_HEIGHT_PX) <= 1, `${width}px rail[${card.i}]: 268`);
        ok(Math.abs(card.w - expectedPeek) <= 1, `${width}px rail[${card.i}]: 1.08 peek`);
        if (card.mediaW) ok(Math.abs(card.mediaW - 96) <= 2, `${width}px rail[${card.i}]: 96px media`);
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
  ok(sourceChild.status !== 0, `SOURCE MUTATION CONTROL: 16px content padding must fail this guard (got ${sourceChild.status})`);
  ok(sourceOut.includes("430px content padding is the #1302 10px 10px 8px contract"),
    "SOURCE MUTATION CONTROL: names the compact padding failure");

  if (browserConfig || REQUIRE_BROWSER) {
    for (const name of Object.keys(MUTATION_CSS)) {
      const args = [SELF, `--mutation=${name}`];
      if (REQUIRE_BROWSER) args.push("--require-browser");
      const child = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env } });
      const out = `${child.stdout || ""}\n${child.stderr || ""}`;
      ok(child.status !== 0, `MUTATION CONTROL ${name}: must fail this guard (got ${child.status})`);
      ok(out.includes("RENDER mutation caught"), `MUTATION CONTROL ${name}: rendered evaluator names the visual regression`);
    }
  }
}

if (REQUIRE_BROWSER && !rendered && !MUTATION && !SOURCE_MUTATION) {
  ok(false, "Chromium is REQUIRED for this invocation (--require-browser) but the rendered contract did not execute");
}

if (failures.length) {
  console.error("check-place-card-visual-contract: FAIL");
  failures.forEach((failure) => console.error("  ✗ " + failure));
  process.exit(1);
}
if (rendered) {
  console.log(`check-place-card-visual-contract: OK — ${pass} assertions; rendered contract executed at 320/390/440; compact #1302 hierarchy + 36%/13px geometry locked; visual mutations went red`);
} else {
  console.log("SOURCE CONTRACT PASSED — RENDERED CONTRACT NOT EXECUTED");
  console.log(`check-place-card-visual-contract: OK (SOURCE ONLY) — ${pass} assertions; Chromium is unavailable so rendered visual measurements were not run`);
}
