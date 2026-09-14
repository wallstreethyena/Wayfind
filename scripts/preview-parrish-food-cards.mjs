#!/usr/bin/env node
// Review screenshots for the 268px restoration. Renders the REAL IconicPlaceCard
// + WF_PLACE_CARD_CSS (the production Food renderer) with live Parrish rails
// rows plus the named Food-surface venues. Not a guard and not in guards.txt.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  PLACE_CARD_HEIGHT_PX,
  PLACE_CARD_LIST_MEDIA_MIN_PCT,
  PLACE_CARD_LIST_MEDIA_MAX_PCT,
  PLACE_CARD_PAGE_GUTTER_PX,
} from "../lib/placeCardStandard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/ui/previews/pr-restore-268");
mkdirSync(OUT, { recursive: true });

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { WF_PLACE_CARD_CSS, WF_LAYOUT_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const Skel = (await loadComponent(path.join(ROOT, "app/components/PlaceCardSkeleton.js"), ROOT)).default;

const PHOTO = "https://www.gowayfind.com/api/photo";
async function resolvePhoto(place) {
  const qs = place.photoRef
    ? "ref=" + encodeURIComponent(place.photoRef) + "&w=640"
    : place.id ? "place=" + encodeURIComponent(place.id) + "&w=640" : "";
  if (!qs) return "";
  try {
    const res = await fetch(PHOTO + "?" + qs, { redirect: "follow" });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/") || buf.length < 80) return "";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {}
  return "";
}

const live = [
  {
    id: "ChIJv28NsOUVw4gR9GIkUomVMIU",
    name: "S.O.B. Burgers",
    governed_score: 91, rating: 4.6, reviews: 1840,
    types: ["hamburger_restaurant", "restaurant", "food"],
    primaryType: "hamburger_restaurant",
    lat: 27.4489, lng: -82.5754, city: "Bradenton", distMi: 12.4,
    editorial: "Smash burgers and a loud lunch counter — the Bradenton name people still argue about.",
  },
  {
    id: "preview-barnyard-parrish",
    name: "The Barnyard",
    governed_score: 88, rating: 4.4, reviews: 612,
    types: ["restaurant", "fast_food_restaurant", "food", "point_of_interest"],
    primaryType: "restaurant",
    lat: 27.5859, lng: -82.4254, city: "Parrish", distMi: 2.2,
    editorial: "A neighborhood plate that fills the card — height must stay 268 even without a photo.",
  },
];

const rails = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(OUT, "parrish-food-live.json"), "utf8"));
const byName = Object.fromEntries(rails.map((p) => [p.name, p]));
const ordered = [
  live.find((p) => p.name === "The Barnyard"),
  live.find((p) => p.name === "S.O.B. Burgers"),
  byName["Cold Stone Creamery"],
  byName["Pomegranate Frozen Yogurt"],
  byName["Ryan's Coffee House"],
  {
    id: "preview-missing-photo",
    name: "Photoless Parrish Counter",
    governed_score: 84, rating: 4.3, reviews: 96,
    types: ["cafe", "food"], primaryType: "cafe",
    lat: 27.5859, lng: -82.4254, city: "Parrish", distMi: 1.8,
  },
  byName["C & K Smokehouse BBQ"],
].filter(Boolean);

for (const place of ordered) {
  if (place.id === "preview-barnyard-parrish" || place.id === "preview-missing-photo") {
    place.photo = "";
    continue;
  }
  place.photo = await resolvePhoto(place);
}

const noop = () => {};
const cardsHtml = ordered.map((place, i) => renderToStaticMarkup(React.createElement(Iconic, {
  place,
  rank: i + 1,
  href: "/p/" + encodeURIComponent(place.id),
  editorial: place.editorial || undefined,
  onSave: noop, onLike: noop, onDislike: noop, onShare: noop,
  eagerMedia: true,
}))).join("\n");
const skelHtml = renderToStaticMarkup(React.createElement(Skel, { count: 2, as: "div" }));
const railHtml = ordered.slice(0, 3).map((place, i) => renderToStaticMarkup(React.createElement(Iconic, {
  place, rank: i + 1, href: "/p/" + encodeURIComponent(place.id),
  editorial: place.editorial || undefined,
  onSave: noop, onLike: noop, onDislike: noop, onShare: noop, eagerMedia: true,
}))).join("\n");

function pageHtml({ width, showRail }) {
  const pad = PLACE_CARD_PAGE_GUTTER_PX;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${WF_LAYOUT_CSS}${WF_PLACE_CARD_CSS}
body{margin:0;background:#040810;color:#E6EDF3;font:13px/1.35 ui-sans-serif,system-ui}
.wf-preview-chrome{padding:16px ${pad}px 28px;${width >= 900 ? "max-width:760px;" : ""}}
.wf-preview-kicker{margin:0 0 4px;color:#F97316;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.wf-preview-h{margin:0 0 4px;font-size:${width >= 900 ? 28 : 22}px;font-weight:800;color:#fff}
.wf-preview-sub{margin:0 0 16px;color:#9AA6B8}
</style></head>
<body>
  <div class="wf-preview-chrome">
    <p class="wf-preview-kicker">Parrish, FL · live Food surface</p>
    <h1 class="wf-preview-h">Food</h1>
    <p class="wf-preview-sub">Production IconicPlaceCard · restored 268×440 standard · 13px gutters · 36% stacked photo</p>
    ${showRail ? `<div class="wf-rail" data-surface="rail">${railHtml}</div><div style="height:18px"></div>` : ""}
    <ul class="wf-place-card-list" data-surface="food">${cardsHtml}</ul>
    <div style="height:18px"></div>
    <p class="wf-preview-kicker">Skeletons</p>
    <div class="wf-place-card-list" data-surface="skeleton">${skelHtml}</div>
  </div>
</body></html>`;
}

const { chromium } = await import("@playwright/test");
function launchOpts() {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch {}
  if (existsSync("/usr/local/bin/google-chrome")) return { executablePath: "/usr/local/bin/google-chrome" };
  return {};
}
const browser = await chromium.launch(launchOpts());
const viewports = [
  { name: "390", width: 390, height: 1400, showRail: false },
  { name: "440", width: 440, height: 1400, showRail: false },
  { name: "desktop", width: 1440, height: 1600, showRail: true },
];
const report = { standard: { height: PLACE_CARD_HEIGHT_PX, maxWidth: 440, gutter: PLACE_CARD_PAGE_GUTTER_PX }, viewports: {} };

for (const vp of viewports) {
  const html = pageHtml(vp);
  const file = path.join(OUT, `parrish-food-${vp.name}.html`);
  writeFileSync(file, html);
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("file://" + file, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map((img) => img.complete ? null : new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
      setTimeout(resolve, 4000);
    })));
  });
  const measured = await page.evaluate((gutter) => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1) }; };
    const food = [...document.querySelectorAll('[data-surface="food"] .wf-place-card')].map((card) => {
      const media = card.querySelector(".wf-place-card-media,.wf-place-card-monogram");
      const actions = [...card.querySelectorAll(".wf-place-card-actions > *")].map((el) => ({ cls: el.className.split(" ")[0], ...box(el) }));
      const name = (card.querySelector(".wf-place-card-name") || {}).textContent || "";
      const mb = media ? box(media) : null;
      const cb = box(card);
      return {
        name, ...cb,
        mediaW: mb ? mb.w : null, mediaH: mb ? mb.h : null,
        mediaPct: mb && cb.w ? +(100 * mb.w / cb.w).toFixed(1) : null,
        leftGutter: cb.x, rightGutter: +(innerWidth - cb.right).toFixed(1),
        actions,
      };
    });
    const skels = [...document.querySelectorAll('[data-surface="skeleton"] .wf-place-card')].map((card) => box(card));
    const rails = [...document.querySelectorAll('[data-surface="rail"] .wf-place-card')].map((card) => {
      const media = card.querySelector(".wf-place-card-media,.wf-place-card-monogram");
      return { name: (card.querySelector(".wf-place-card-name") || {}).textContent || "", ...box(card), mediaW: media ? media.getBoundingClientRect().width : null };
    });
    return {
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      food, skels, rails, gutter,
    };
  }, PLACE_CARD_PAGE_GUTTER_PX);
  const shot = path.join(OUT, `parrish-food-${vp.name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  if (vp.name === "390") {
    const first = page.locator('[data-surface="food"] .wf-place-card').first();
    await first.screenshot({ path: path.join(OUT, "parrish-food-390-first-card.png") });
  }
  await context.close();
  report.viewports[vp.name] = measured;
  report.viewports[vp.name].screenshot = path.relative(ROOT, shot);
}

await browser.close();

const fails = [];
for (const [name, vp] of Object.entries(report.viewports)) {
  if (vp.innerWidth !== (name === "desktop" ? 1440 : Number(name))) fails.push(`${name}: viewport ${vp.innerWidth}`);
  if (vp.scrollWidth > vp.innerWidth + 1) fails.push(`${name}: horizontal scroll ${vp.scrollWidth}`);
  for (const card of vp.food) {
    if (Math.abs(card.h - PLACE_CARD_HEIGHT_PX) > 0.5) fails.push(`${name} ${card.name}: height ${card.h}`);
    if (card.mediaPct != null && (card.mediaPct < PLACE_CARD_LIST_MEDIA_MIN_PCT - 0.6 || card.mediaPct > PLACE_CARD_LIST_MEDIA_MAX_PCT + 0.6)) {
      fails.push(`${name} ${card.name}: media ${card.mediaPct}%`);
    }
    if (card.mediaH != null && Math.abs(card.mediaH - card.h) > 2.5) fails.push(`${name} ${card.name}: media height ${card.mediaH}`);
    if (name !== "desktop") {
      if (card.leftGutter > PLACE_CARD_PAGE_GUTTER_PX + 1) fails.push(`${name} ${card.name}: left gutter ${card.leftGutter}`);
      if (card.rightGutter > PLACE_CARD_PAGE_GUTTER_PX + 2) fails.push(`${name} ${card.name}: right gutter ${card.rightGutter}`);
    }
  }
  for (const sk of vp.skels) {
    if (Math.abs(sk.h - PLACE_CARD_HEIGHT_PX) > 0.5) fails.push(`${name} skeleton: height ${sk.h}`);
  }
}
writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify({ fails, ...report }, null, 2));
if (fails.length) {
  console.error("preview-parrish-food-cards: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`preview-parrish-food-cards: OK — ${ordered.length} Food cards at 390/440/desktop are ${PLACE_CARD_HEIGHT_PX}px`);
for (const [name, vp] of Object.entries(report.viewports)) {
  console.log(`  ${name} (${vp.innerWidth}px): ` + vp.food.map((c) => `${c.name}=${c.h} media=${c.mediaPct}%`).join(" · "));
}
