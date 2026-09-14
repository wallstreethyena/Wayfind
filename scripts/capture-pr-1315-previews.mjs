#!/usr/bin/env node
// Clean, unlabeled review shots for PR #1315. Uses the real shared renderers.
// Writes docs/ui/previews/pr-1315/*.png and visual-contract-measured.json.
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  PLACE_CARD_GAP_PX,
  PLACE_CARD_HEIGHT_PX,
  PLACE_CARD_MAX_WIDTH_PX,
  PLACE_CARD_PAGE_GUTTER_PX,
  PLACE_CARD_PHONE_PEEK,
} from "../lib/placeCardStandard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/ui/previews/pr-1315");
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
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
function photoData(kind) {
  const fills = {
    cafe: ["#2a1810", "#b86a32", "#f0c27a"],
    taco: ["#3a140e", "#d35400", "#f6d08a"],
    park: ["#10281c", "#2f6b45", "#9dcc7a"],
    kayak: ["#0c2432", "#1c6f88", "#7fced0"],
  };
  const [a, b, c] = fills[kind];
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset=".52" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
      </linearGradient></defs>
      <rect width="640" height="860" fill="url(#g)"/>
    </svg>`
  );
}
const simple = { id: "eq-simple", name: "Hashtag Café", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574, photo: photoData("cafe") };
const cindy = { id: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café", city: "Sarasota", rating: 4.8, reviews: 214, types: ["cafe", "restaurant"], distMi: 1.4, governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574, photo: photoData("cafe") };
const ig = { id: "eq-ig", name: "Catrina's Tacos", city: "Tampa", rating: 4.7, reviews: 180, types: ["restaurant"], distMi: 2.2, governed_score: 91, wfScore: 91, lat: 27.96, lng: -82.48, photo: photoData("taco") };
const missing = { id: "eq-miss", name: "Plain Diner", rating: 4.2, reviews: 40, types: ["restaurant"], distMi: 0.8, governed_score: 80, wfScore: 80, lat: 27.4, lng: -82.4 };
const commerce = { id: "eq-book", name: "Robinson Preserve", rating: 4.8, reviews: 1141, types: ["park"], distMi: 4.1, governed_score: 92, wfScore: 92, lat: 27.4, lng: -82.4, photo: photoData("park") };
const longName = { ...simple, id: "eq-long", name: "Sarasota Guided Mangrove Tunnel Kayak Tour at Robinson Preserve" };

function stamp(key, markup) {
  return markup.replace(/class="wf-place-card/, `data-variant="${key}" class="wf-place-card`);
}

const cards = {
  simple: renderToStaticMarkup(React.createElement(HomePlaceCard, { p: simple, rank: 2, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" })),
  creator: renderToStaticMarkup(React.createElement(HomePlaceCard, { p: cindy, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: "A neighborhood cafe with a useful hook.", onBadge: noop, city: "Sarasota" })),
  instagram: renderToStaticMarkup(React.createElement(HomePlaceCard, { p: ig, rank: 3, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Tampa" })),
  long: renderToStaticMarkup(React.createElement(Iconic, { place: longName, rank: 2, href: "/p/long", onSave: noop, onLike: noop, onDislike: noop, onShare: noop })),
  missing: renderToStaticMarkup(React.createElement(Iconic, { place: missing, rank: 4, href: "/p/miss", onSave: noop, onLike: noop, onDislike: noop, onShare: noop })),
  commerce: renderToStaticMarkup(React.createElement(Iconic, { place: commerce, rank: 1, href: "/p/book", onSave: noop, onLike: noop, onDislike: noop, onShare: noop })),
};

const listStack = ["simple", "creator", "instagram"].map((key) => stamp(key, cards[key])).join("\n");
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${WF_PLACE_CARD_CSS}
/* Review-only: static markup has no React hydration, so FallbackImg never
   flips loaded→visible. Force the real <img> to paint. */
.wf-place-card-media img{opacity:1!important}
</style></head>
<body style="margin:0;background:#040810;color:#fff">
  <div id="stack" style="padding:16px ${PLACE_CARD_PAGE_GUTTER_PX}px 24px">
    <div class="wf-place-card-list" data-surface="list">${listStack}${stamp("skeleton", renderToStaticMarkup(React.createElement(Skel, { count: 1, as: "div" })))}</div>
  </div>
  <div id="pair" style="padding:16px ${PLACE_CARD_PAGE_GUTTER_PX}px 24px">
    <div class="wf-place-card-list">${stamp("simple", cards.simple)}${stamp("creator", cards.creator)}</div>
  </div>
  <div id="missing" style="padding:16px ${PLACE_CARD_PAGE_GUTTER_PX}px 24px">
    <div class="wf-place-card-list">${stamp("missing", cards.missing)}</div>
  </div>
  <div id="commerce" style="padding:16px ${PLACE_CARD_PAGE_GUTTER_PX}px 24px">
    <div class="wf-place-card-list">${stamp("commerce", cards.commerce)}</div>
  </div>
  <div id="rail" class="wf-rail" data-surface="rail" style="padding:16px ${PLACE_CARD_PAGE_GUTTER_PX}px 32px">
    ${renderToStaticMarkup(React.createElement(RailCard, { title: "Clear Kayak Glass Bottom Guided Tour", score: 9.2, rank: 1, href: "/p/rail", photo: photoData("kayak"), category: "Activities", distMi: 3.2 }))}
    ${renderToStaticMarkup(React.createElement(RailCard, { title: "Next Card Peek", score: 8.4, rank: 2, href: "/p/rail-2", photo: photoData("taco"), category: "Food", distMi: 1.1 }))}
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
  return null;
}

const browserConfig = await chromiumLaunchOptions();
if (!browserConfig) {
  console.error("capture-pr-1315-previews: Chromium is required");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(ROOT, ".wf-card-preview-"));
const file = path.join(tmp, "fixture.html");
writeFileSync(file, fixture);
const browser = await browserConfig.chromium.launch(browserConfig.options);
const measured = {};
try {
  for (const width of [390, 440]) {
    const context = await browser.newContext({ viewport: { width, height: 1600 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto("file://" + file, { waitUntil: "load" });
    await page.locator("#stack").screenshot({ path: path.join(OUT, `place-cards-${width}.png`) });
    if (width === 390) {
      await page.locator("#pair").screenshot({ path: path.join(OUT, "place-cards-390-simple-vs-creator.png") });
      await page.locator("#missing").screenshot({ path: path.join(OUT, "place-card-missing-image-390.png") });
      await page.evaluate(() => {
        const lane = document.querySelector("#commerce .wf-place-card-highlights");
        const ticket = document.querySelector("#commerce .wf-ticket-pill");
        if (lane && ticket) lane.scrollLeft = ticket.offsetLeft;
      });
      await page.locator("#commerce").screenshot({ path: path.join(OUT, "place-card-commerce-390.png") });
      await page.locator("#rail").screenshot({ path: path.join(OUT, "place-cards-rail-peek-390.png") });
    }
    measured[width] = await page.evaluate((pageGutter) => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const media = el.querySelector(".wf-place-card-media,.wf-place-card-sk-media,.wf-place-card-monogram");
        const actions = el.querySelector(".wf-place-card-actions,.wf-place-card-sk-actions");
        const content = el.querySelector(".wf-place-card-content");
        const name = el.querySelector(".wf-place-card-name");
        const mb = media && media.getBoundingClientRect();
        const ab = actions && actions.getBoundingClientRect();
        return {
          variant: el.getAttribute("data-variant"),
          h: +r.height.toFixed(2),
          w: +r.width.toFixed(2),
          x: +r.x.toFixed(2),
          rightGutter: +(innerWidth - r.right).toFixed(2),
          mediaPct: mb && r.width ? +(100 * mb.width / r.width).toFixed(2) : null,
          actionsY: ab ? +(ab.y - r.y).toFixed(2) : null,
          radius: parseFloat(cs.borderTopLeftRadius),
          pad: content ? getComputedStyle(content).padding : null,
          namePx: name ? parseFloat(getComputedStyle(name).fontSize) : null,
          actH: actions ? parseFloat(getComputedStyle(actions).getPropertyValue("--wf-act-h")) || actions.getBoundingClientRect().height : null,
        };
      };
      const list = [...document.querySelectorAll("#stack .wf-place-card")].map(box);
      const rail = [...document.querySelectorAll("#rail .wf-place-card")].map(box);
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        pageGutter,
        expectedH: 268,
        list,
        rail,
      };
    }, PLACE_CARD_PAGE_GUTTER_PX);
    await context.close();
  }
  writeFileSync(path.join(OUT, "visual-contract-measured.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    contract: {
      height: PLACE_CARD_HEIGHT_PX,
      maxWidth: PLACE_CARD_MAX_WIDTH_PX,
      peek: PLACE_CARD_PHONE_PEEK,
      gap: PLACE_CARD_GAP_PX,
      gutter: PLACE_CARD_PAGE_GUTTER_PX,
    },
    viewports: measured,
  }, null, 2));
  console.log(`capture-pr-1315-previews: wrote unlabeled shots to ${OUT}`);
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
