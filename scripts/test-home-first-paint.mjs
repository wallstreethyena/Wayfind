#!/usr/bin/env node
/**
 * test-home-first-paint — the 2026-08-20 audit pair, asserted by CALL and
 * (when Chromium exists) by LAYOUT.
 *
 *   1. Mobile search. Live copy is "Search a place or city". At 390px the
 *      visible text was "Search a place (" — overflow on the field, not a
 *      shorter official string. This file measures the placeholder against
 *      the input's content box at a real 390×844 viewport.
 *   2. Homepage card flash. First paint used blank color slabs (a single
 *      rounded wf-sk / railTint rectangle) while cards hydrated. Poster tiles
 *      now paint the real <img class="wf8-tim"> (Tonight JPG is in the SSR
 *      document) — a PlaceCardSkeleton overlay on that image is the iPhone
 *      stuck-skeleton look. The drop still paints place-card skeletons
 *      while ranking. Rails and stacked Food lists are both 268px; stacked
 *      lists keep the 36% photo column. The skeleton must match that surface,
 *      not a 235px list ladder or a 96px bar.
 *
 * Ranking, scores, Atlas, affiliates, CSP, ads, and geolocation defaults are
 * not this file's job. toHookLine / isUsableCardHook are not imported.
 */
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = (m) => { console.error("test-home-first-paint: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const HOME = read("app/home.js");
const HOME_CODE = strip(HOME);
const RAIL = read("app/components/DaypartRail.js");
const RAIL_CODE = strip(RAIL);
const INTENT = read("app/components/IntentRail.js");
const INTENT_CODE = strip(INTENT);
const SKEL = read("app/components/PlaceCardSkeleton.js");
const SKEL_CODE = strip(SKEL);
const CSS = read("app/components/css.js");

const PLACEHOLDER = "Search a place or city";

/* ── 1. Official search string is unchanged (do not invent a brand line) ── */
ok(HOME.includes(`placeholder="${PLACEHOLDER}"`) && HOME.includes(`aria-label="${PLACEHOLDER}"`),
  `home.js still ships the official placeholder/aria-label "${PLACEHOLDER}"`);
ok((HOME.match(new RegExp(PLACEHOLDER, "g")) || []).length >= 2,
  "the official string appears at both the placeholder and the aria-label (count, not a lone mention)");

/* ── 2. Narrow-viewport CSS actually sizes the field (role, not a mention) ── */
const searchCss = CSS.slice(CSS.indexOf("export const WF_SEARCH_CSS"));
ok(/@media\(max-width:430px\)/.test(searchCss),
  "WF_SEARCH_CSS declares a max-width:430px rule — the 390px phone band");
ok(/\.wf-search-input\{[^}]*font-size:14px!important/.test(searchCss.replace(/\s/g, "")) ||
   /max-width:430px\)\{[^}]*\.wf-search-input\{[^}]*font-size:14px!important/.test(searchCss.replace(/\s/g, "")),
  "at ≤430px the search input is 14px — 16px plus the location chip clipped the official string");
ok(/\.wf-search-icon\{display:none!important\}/.test(searchCss.replace(/\s/g, "")),
  "at ≤430px the decorative magnifying-glass is hidden so the official string keeps the gutter");
ok(/\.wf-search-field\{flex:1;min-width:0/.test(searchCss.replace(/\s/g, "")),
  ".wf-search-field is the flex child that may shrink (min-width:0) — without it the input cannot yield");
ok(/className="wf-search-field"/.test(HOME_CODE),
  "the input wrapper in home.js USES .wf-search-field — a CSS class nothing mounts is decoration");
ok(/className="wf-scope-city"/.test(HOME_CODE) && /\{cityNow \|\| "Location"\}/.test(HOME_CODE),
  "the location chip still names the city (check-home-location) via .wf-scope-city");

/* ── 3. First paint is a place-card skeleton, not a color slab ─────────── */
ok(/export default function PlaceCardSkeleton\s*\(/.test(SKEL_CODE),
  "PlaceCardSkeleton is DECLARED (declaration position, not a mention)");
ok(/className="wf-place-card wf-place-card-sk"/.test(SKEL_CODE),
  "the skeleton wears the live card class plus .wf-place-card-sk");
ok(/className="wf-place-card-layout"/.test(SKEL_CODE),
  "the skeleton USES .wf-place-card-layout — that is the two-column card shape");
ok(/wf-place-card-sk-media/.test(SKEL_CODE) && /wf-place-card-sk-actions/.test(SKEL_CODE),
  "the skeleton has a media column AND an action row — a single rounded slab has neither");
ok(/className="wf8-tim"/.test(RAIL_CODE) && /<picture>/.test(RAIL_CODE),
  "DaypartRail poster tiles paint the real <img class=\"wf8-tim\"> — Tonight JPG is already in the document");
ok(!/className="wf8-tile-sk"/.test(RAIL_CODE),
  "a present poster img is not covered by wf8-tile-sk — that overlay is the iPhone stuck-skeleton look");
ok(!/<PlaceCardSkeleton count=\{1\} as="div" \/>/.test(RAIL_CODE),
  "the tile-level PlaceCardSkeleton overlay is gone — first paint is the poster, not a grey card");
ok(/loading:\s*\(\)\s*=>\s*<PlaceCardSkeleton/.test(RAIL_CODE),
  "the lazy IconicPlaceCard drop paints PlaceCardSkeleton while the chunk loads");
ok(/aria-label="Ranking places"/.test(RAIL_CODE) && /<PlaceCardSkeleton count=\{3\} \/>/.test(RAIL_CODE),
  "an open rail with no places yet paints three card skeletons, not an empty colored menu");
ok(/<PlaceCardSkeleton count=\{2\} as="div" \/>/.test(INTENT_CODE),
  "IntentRail loading uses place-card skeletons, not a full-width color slab");
ok(!/width:\s*"100%",\s*height:\s*INTENT_RAIL_CARD_H/.test(INTENT_CODE),
  "the IntentRail full-width wf-sk slab is gone — that was the colored block");
ok(/<PlaceCardSkeleton count=\{5\} as="div" \/>/.test(HOME_CODE),
  "the browse-category loading state is five place-card skeletons, not 96px color bars");
ok(/className="wf-place-card-list"[\s\S]{0,180}<PlaceCardSkeleton count=\{5\}/.test(HOME_CODE),
  "browse-category skeletons mount inside .wf-place-card-list — list first-paint, not rail peek");

/* ── 4. MEASURE at 390px when Chromium exists ──────────────────────────── */
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const {
  PLACE_CARD_GAP_PX,
  PLACE_CARD_HEIGHT_PX,
  PLACE_CARD_LIST_MEDIA_MIN_PCT,
  PLACE_CARD_LIST_MEDIA_MAX_PCT,
  PLACE_CARD_PAGE_GUTTER_PX,
  PLACE_CARD_PHONE_PEEK,
} = await import("../lib/placeCardStandard.js");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { WF_LAYOUT_CSS, WF_SEARCH_CSS, WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
ok(!String(WF_PLACE_CARD_CSS).includes("--wf-place-card-list-reserve")
  && /height:var\(--wf-card-h\)/.test(String(WF_PLACE_CARD_CSS).replace(/\s+/g, "")),
  "list skeletons inherit the shared 268px card height — no 235px reserve ladder");
const SkelMod = await loadComponent(path.join(ROOT, "app/components/PlaceCardSkeleton.js"), ROOT);
const Skel = SkelMod.default;
const skelHtml = renderToStaticMarkup(React.createElement(Skel, { count: 2, as: "div" }));
const homeEntry = path.join(ROOT, "app/home.js");
const HomeMod = await loadComponent(homeEntry, ROOT, { onGraph(graph) {
  const compiled = graph.get(homeEntry);
  writeFileSync(compiled, readFileSync(compiled, "utf8") + "\nexport { PlaceCard };\n");
} });
ok(typeof HomeMod.PlaceCard === "function", "PROBE: actual home PlaceCard compiled for the list hydrate jump");
const livePlace = {
  id: "first-paint-live", name: "Hashtag Café", rating: 4.8, reviews: 214,
  priceLevel: "PRICE_LEVEL_MODERATE", types: ["cafe", "restaurant"], distMi: 1.4,
  governed_score: 99, wfScore: 99, lat: 27.498, lng: -82.574,
};
const noop = () => {};
const liveHtml = renderToStaticMarkup(React.createElement(HomeMod.PlaceCard, {
  p: livePlace, rank: 1, saved: false, liked: false, disliked: false,
  onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop,
  line: "A neighborhood cafe with a useful hook.", onBadge: noop, city: "Bradenton",
}));
ok(/wf-place-card-sk/.test(skelHtml) && /wf-place-card-layout/.test(skelHtml),
  "PROBE: PlaceCardSkeleton RENDERS the card layout (a missing export would have thrown or painted nothing)");
ok((skelHtml.match(/wf-place-card-sk-line/g) || []).length >= 4,
  "PROBE: a rendered skeleton has multiple copy lines — a single slab cannot");

const { chromium } = await import("playwright");
function resolveChromium() {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (existsSync("/usr/local/bin/google-chrome")) return { executablePath: "/usr/local/bin/google-chrome" };
  if (process.platform === "darwin") return {};
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log(`test-home-first-paint: OK — ${pass} structural assertions; Chromium layout measure SKIPPED (no browser on this machine)`);
  process.exit(0);
}

const searchFixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${WF_LAYOUT_CSS}${WF_SEARCH_CSS}${WF_PLACE_CARD_CSS}</style></head>
<body style="margin:0;background:#040810">
<div class="wf-topbar" style="padding:12px 14px;width:390px">
  <div class="wf-search-row has-scope" style="display:flex;gap:0;position:relative">
    <div class="wf-scope-wrap">
      <button type="button" class="wf-scope" aria-label="Location: Sarasota">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s-6.6-5.4-6.6-10.2A6.6 6.6 0 0 1 12 4.2a6.6 6.6 0 0 1 6.6 6.6C18.6 15.6 12 21 12 21Z"/></svg>
        <span class="wf-scope-city">Sarasota</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
    <div class="wf-search-field">
      <span class="wf-search-icon" style="position:absolute;left:13px;top:50%;transform:translateY(-50%)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg></span>
      <input class="wf-search-input" value="" placeholder="${PLACEHOLDER}" aria-label="${PLACEHOLDER}"
        style="width:100%;box-sizing:border-box;height:48px;padding:0 14px 0 38px;font-size:16px;border:1.5px solid #30363D;border-right:none;color:#E6EDF3"/>
    </div>
    <button class="wf-search-submit" aria-label="Search" style="flex-shrink:0;width:54px;height:48px;border:none">→</button>
  </div>
</div>
<div id="skels" style="padding:0 ${PLACE_CARD_PAGE_GUTTER_PX}px">
  <div class="wf-rail" data-skel="rail">${skelHtml}</div>
  <div class="wf-place-card-list" data-skel="list">${skelHtml}${liveHtml}</div>
</div>
</body></html>`;

const tmp = mkdtempSync(path.join(ROOT, ".wf-firstpaint-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
const pagePath = path.join(tmp, "paint.html");
writeFileSync(pagePath, searchFixture);

const browser = await chromium.launch(launchOpts);
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
await page.goto("file://" + pagePath, { waitUntil: "load" });
const innerWidth = await page.evaluate(() => window.innerWidth);
ok(innerWidth === 390, `PROBE: the measured viewport is 390px, not the requested-but-clamped width (got ${innerWidth})`);

const measured = await page.evaluate((official) => {
  const input = document.querySelector(".wf-search-input");
  const cs = getComputedStyle(input);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const inner = input.clientWidth - padL - padR;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const textW = ctx.measureText(official).width;
  const icon = document.querySelector(".wf-search-icon");
  const iconShown = !!(icon && getComputedStyle(icon).display !== "none");
  const measure = (card) => {
    const layout = card.querySelector(".wf-place-card-layout");
    const media = card.querySelector(".wf-place-card-sk-media");
    const lines = card.querySelectorAll(".wf-place-card-sk-line");
    const actions = card.querySelectorAll(".wf-place-card-sk-actions > .wf-sk");
    const cb = card.getBoundingClientRect();
    const lb = layout ? layout.getBoundingClientRect() : null;
    const mb = media ? media.getBoundingClientRect() : null;
    return {
      w: cb.width, h: cb.height, x: cb.x, right: cb.right,
      cols: layout ? getComputedStyle(layout).gridTemplateColumns : "",
      mediaW: mb ? mb.width : 0,
      lineCount: lines.length,
      actionCount: actions.length,
      layoutH: lb ? lb.height : 0,
    };
  };
  return {
    placeholder: input.getAttribute("placeholder"),
    inner, textW, fontSize: cs.fontSize, padL, iconShown,
    pageW: document.documentElement.scrollWidth, viewport: innerWidth,
    rail: [...document.querySelectorAll('[data-skel="rail"] .wf-place-card-sk')].map(measure),
    list: [...document.querySelectorAll('[data-skel="list"] .wf-place-card-sk')].map(measure),
    live: [...document.querySelectorAll('[data-skel="list"] .wf-place-card:not(.wf-place-card-sk)')].map(measure),
  };
}, PLACEHOLDER);
await page.close();

ok(measured.placeholder === PLACEHOLDER, `measured input still has the official placeholder (got ${JSON.stringify(measured.placeholder)})`);
ok(measured.inner > 0 && measured.textW > 0,
  `PROBE: both sides of the fit comparison are non-empty (inner=${measured.inner}, textW=${measured.textW})`);
ok(measured.textW <= measured.inner + 0.5,
  `at 390px the official placeholder (${measured.textW.toFixed(1)}px) fits the input content box (${measured.inner.toFixed(1)}px) at ${measured.fontSize} / padL ${measured.padL}`);
ok(measured.iconShown === false, "at 390px the decorative search icon is not taking a gutter the official string needs");
ok(measured.pageW <= measured.viewport + 1, `no horizontal overflow at 390px (scrollWidth ${measured.pageW})`);

ok(measured.rail.length === 2 && measured.list.length === 2 && measured.live.length === 1,
  `PROBE: two rail skeletons, two list skeletons, and one live list card (got rail=${measured.rail.length} list=${measured.list.length} live=${measured.live.length})`);
const expectedPeek = (measured.viewport - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK;
const expectedList = measured.viewport - PLACE_CARD_PAGE_GUTTER_PX * 2;
for (const [i, c] of measured.rail.entries()) {
  ok(c.lineCount >= 3, `rail skeleton ${i}: ${c.lineCount} copy lines — a color slab has zero`);
  ok(c.actionCount >= 4, `rail skeleton ${i}: ${c.actionCount} action stubs — the live card's four-control row`);
  ok(Math.abs(c.mediaW - 96) <= 2, `rail skeleton ${i}: media column is 96px (got ${c.mediaW.toFixed(1)})`);
  ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5,
    `rail skeleton ${i}: height ${c.h.toFixed(0)}px matches the 268px rail card (a 96px bar is the old flash)`);
  ok(Math.abs(c.w - expectedPeek) <= 1, `rail skeleton ${i}: width follows the 1.08 peek (expected ${expectedPeek.toFixed(1)}, got ${c.w.toFixed(1)})`);
  ok(/^\s*\d+(\.\d+)?px\s+\S+/.test(c.cols), `rail skeleton ${i}: layout is a two-track grid (got ${JSON.stringify(c.cols)})`);
}
for (const [i, c] of measured.list.entries()) {
  ok(c.lineCount >= 3, `list skeleton ${i}: ${c.lineCount} copy lines — a color slab has zero`);
  ok(c.actionCount >= 4, `list skeleton ${i}: ${c.actionCount} action stubs — the live card's four-control row`);
  ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5,
    `list skeleton ${i}: height ${c.h.toFixed(0)}px matches the shared 268px card — 235px is the #1313 collapse`);
  ok(Math.abs(c.w - expectedList) <= 1, `list skeleton ${i}: full list width, no 1.08 peek (expected ${expectedList.toFixed(1)}, got ${c.w.toFixed(1)})`);
  ok(Math.abs(c.x - PLACE_CARD_PAGE_GUTTER_PX) <= 1 && Math.abs(measured.viewport - c.right - PLACE_CARD_PAGE_GUTTER_PX) <= 2,
    `list skeleton ${i}: ~13px gutters, not a 40–44px peek strip (x=${c.x.toFixed(1)}, right gutter ${(measured.viewport - c.right).toFixed(1)})`);
  const pct = c.w > 0 ? 100 * c.mediaW / c.w : 0;
  ok(pct >= PLACE_CARD_LIST_MEDIA_MIN_PCT - 0.6 && pct <= PLACE_CARD_LIST_MEDIA_MAX_PCT + 0.6,
    `list skeleton ${i}: photo column is 32–38% of card width (got ${pct.toFixed(1)}%)`);
  ok(/^\s*\S+\s+\S+/.test(c.cols), `list skeleton ${i}: layout is a two-track grid (got ${JSON.stringify(c.cols)})`);
}
const live = measured.live[0];
ok(live && live.h > 0, "PROBE: live stacked PlaceCard rendered for the hydrate-jump comparison");
ok(Math.abs(live.w - expectedList) <= 1, `live stacked card fills the list column (got ${live.w.toFixed(1)})`);
ok(Math.abs(live.x - PLACE_CARD_PAGE_GUTTER_PX) <= 1 && Math.abs(measured.viewport - live.right - PLACE_CARD_PAGE_GUTTER_PX) <= 2,
  `live stacked card shares the 13px gutters (right gutter ${(measured.viewport - live.right).toFixed(1)})`);
for (const [i, c] of measured.list.entries()) {
  ok(Math.abs(c.h - live.h) <= 0.5 && Math.abs(live.h - PLACE_CARD_HEIGHT_PX) <= 0.5,
    `390 list skeleton ${i} and live card are both 268px (skel ${c.h.toFixed(0)} vs live ${live.h.toFixed(0)}) — content-height jump is the forbidden shift`);
}

const page440 = await (await browser.newContext({ viewport: { width: 440, height: 844 }, deviceScaleFactor: 1 })).newPage();
await page440.goto("file://" + pagePath, { waitUntil: "load" });
const wide = await page440.evaluate(() => {
  const measure = (card) => {
    const media = card.querySelector(".wf-place-card-sk-media,.wf-place-card-media");
    const cb = card.getBoundingClientRect();
    const mb = media ? media.getBoundingClientRect() : null;
    return { w: cb.width, h: cb.height, x: cb.x, right: cb.right, mediaW: mb ? mb.width : 0 };
  };
  return {
    innerWidth,
    pageW: document.documentElement.scrollWidth,
    rail: [...document.querySelectorAll('[data-skel="rail"] .wf-place-card-sk')].map(measure),
    list: [...document.querySelectorAll('[data-skel="list"] .wf-place-card-sk')].map(measure),
    live: [...document.querySelectorAll('[data-skel="list"] .wf-place-card:not(.wf-place-card-sk)')].map(measure),
  };
});
await page440.close();
ok(wide.innerWidth === 440, `PROBE: 440px viewport was measured (got ${wide.innerWidth})`);
ok(wide.pageW <= 440 + 1, `no horizontal overflow at 440px (scrollWidth ${wide.pageW})`);
const widePeek = (440 - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK;
const wideList = 440 - PLACE_CARD_PAGE_GUTTER_PX * 2;
ok(wide.rail.length === 2 && wide.list.length === 2 && wide.live.length === 1, "PROBE: 440px still rendered rail + list + live cards");
for (const [i, c] of wide.rail.entries()) {
  ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `440 rail skeleton ${i}: still 268px (got ${c.h.toFixed(0)})`);
  ok(Math.abs(c.w - widePeek) <= 1, `440 rail skeleton ${i}: still uses 1.08 peek (got ${c.w.toFixed(1)})`);
  ok(Math.abs(c.mediaW - 96) <= 2, `440 rail skeleton ${i}: still 96px media (got ${c.mediaW.toFixed(1)})`);
}
const wideLive = wide.live[0];
for (const [i, c] of wide.list.entries()) {
  ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `440 list skeleton ${i}: still 268px (got ${c.h.toFixed(0)})`);
  ok(Math.abs(c.w - wideList) <= 1, `440 list skeleton ${i}: full list width, no peek (got ${c.w.toFixed(1)})`);
  ok(Math.abs(440 - c.right - PLACE_CARD_PAGE_GUTTER_PX) <= 2, `440 list skeleton ${i}: ~13px right gutter, not 40–44px (got ${(440 - c.right).toFixed(1)})`);
  const pct = c.w > 0 ? 100 * c.mediaW / c.w : 0;
  ok(pct >= PLACE_CARD_LIST_MEDIA_MIN_PCT - 0.6 && pct <= PLACE_CARD_LIST_MEDIA_MAX_PCT + 0.6,
    `440 list skeleton ${i}: photo column is 32–38% (got ${pct.toFixed(1)}%)`);
  ok(Math.abs(c.h - wideLive.h) <= 0.5 && Math.abs(wideLive.h - PLACE_CARD_HEIGHT_PX) <= 0.5,
    `440 list skeleton ${i} and live card are both 268px (skel ${c.h.toFixed(0)} vs live ${wideLive.h.toFixed(0)})`);
}
await browser.close();

console.log(`test-home-first-paint: OK — ${pass} assertions (official search string fits at measured ${innerWidth}px; rail + list 268px at 390/440)`);
