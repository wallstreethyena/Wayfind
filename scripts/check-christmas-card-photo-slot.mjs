#!/usr/bin/env node
// scripts/check-christmas-card-photo-slot.mjs: a Christmas card never shows an
// empty photo panel, and a credit badge only ever sits on a photo that loaded.
//
// THE BUG (owner screenshot, live 2026-10-14): the "Very Merry" card (Mickey's
// Very Merry Christmas Party, Theme Parks rail) painted an empty dark panel
// with only the round "©" badge. Two defects, both in the render path:
//   1. CardPhoto's credited lane (/api/photo?…&fmt=json) painted an empty
//      "Loading photo" span until its answer came, and a "Photo unavailable"
//      panel whenever the answer brought no photo (no Google photo, a ledger
//      denial, the quota breaker, a crawler read) or the image failed. It never
//      told the card, so the designed tile never replaced it.
//   2. RailCard printed the "©" from eventPhotoCredit() for every /api/photo
//      src at render time, whether or not any image ever arrived.
//
// EXECUTED, two layers:
//   A. Server render (jsxLoad + react-dom/server) of the REAL browse card
//      (ChristmasBrowseCard) and the real RailCard with the rails' props, for
//      every Christmas rail, with no photo, with a pending credited photo and
//      with a direct photo: the slot holds the illustration tile (or the img),
//      never an empty panel, and no credit badge before any image loaded.
//   B. Chromium (when available) mounts the real CardPhoto with the card's
//      tile as `fallback` and answers its photo request with: a miss, a 500,
//      a network failure, a broken image, then a good Google photo and a
//      licensed photo. Every failure keeps the tile and shows no credit; a
//      credit appears only after the image painted.
// The RailCard direct-image failure (onError -> imgFailed) renders the same
// branch as "no photo", which layer A executes; check-card-photo-error-fallback
// locks the gate expression itself.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { CHRISTMAS_PUBLISHED_RESEARCH, mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";
import { CHRISTMAS_INTENT_RAIL_DEFS, christmasEventRail } from "../lib/christmasIntentRails.js";
import { christmasBrowseCardJson } from "../lib/christmasBrowse.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const TODAY = "2026-10-14";

// ── A. Server render ────────────────────────────────────────────────────────
const { default: RailCard } = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
const { ChristmasBrowseCard } = await loadComponent(path.join(ROOT, "app/components/ChristmasBrowse.js"), ROOT);

const cards = mergeChristmasResearch([]).filter((e) => christmasEventRail(e)).map((e) => christmasEventCard(enrichChristmasEvent(e, new Map()), { today: TODAY }));
ok(cards.length >= 400 && cards.every((c) => c.tile && c.tile.label && c.tile.tint && c.tile.icon), `every Christmas card carries its illustration tile (${cards.length} cards)`);
ok(cards.every((c) => (c.image ? c.placeholder === null : c.placeholder === c.tile)), "the no photo placeholder is that same tile; a card with a photo keeps the tile as its fallback");
ok(cards.every((c) => christmasBrowseCardJson(c).tile === c.tile), "the browse JSON sends the tile with every card");

const MEDIA = /<div class="wf-place-card-media"[^>]*>([\s\S]*?)<\/div><div class="wf-place-card-body"|<div class="wf-place-card-media"[^>]*>([\s\S]*)/;
const mediaOf = (html) => { const m = MEDIA.exec(html); return m ? (m[1] ?? m[2]) : ""; };
const BADGE = /wf-place-card-photo-attr|data-card-photo-credit|data-card-photo-licensed-credit/;
const EMPTY = /Loading photo|Photo unavailable/;
const railProps = (card) => ({
  // The same props ChristmasIntentRails passes (asserted statically below).
  photo: card.image || null,
  placeholder: !card.image ? card.placeholder || null : null,
  photoTile: card.tile || null,
  visitFacts: card,
  photoAttr: card.photoAttr || null, photoAttrHref: card.photoAttrHref || null,
  title: card.title || card.name, eyebrow: "CHRISTMAS", rank: 1, when: card.when, facts: [card.city], take: card.hook, href: card.detailHref || card.url || null,
});
const VARIANTS = [
  ["no photo", null, null],
  ["credited photo, pending", "/api/photo?place=ChIJChristmasSlotTest01&w=640", null],
  ["credited photo with a stale credit label", "/api/photo?place=ChIJChristmasSlotTest02&w=640", "Google Maps"],
  ["direct licensed photo with its credit", "/guides/verified/test-photo.webp", "Photographer, CC BY 4.0"],
];
let rendered = 0;
for (const def of CHRISTMAS_INTENT_RAIL_DEFS) {
  const base = cards.find((c) => c.christmasRail === def.id);
  ok(!!base, `${def.id}: a real card exists for this rail`);
  if (!base) continue;
  for (const [label, image, attr] of VARIANTS) {
    const card = { ...base, image, placeholder: image ? null : base.tile, photoAttr: attr, photoAttrHref: attr ? "https://example.org/credit" : null };
    for (const [surface, html] of [
      ["rail", renderToStaticMarkup(React.createElement(RailCard, railProps(card)))],
      ["browse", renderToStaticMarkup(React.createElement(ChristmasBrowseCard, { card, rank: 1, today: TODAY }))],
    ]) {
      rendered++;
      const media = mediaOf(html);
      const tileShown = /data-artwork="illustration"/.test(media) && media.includes(base.tile.label);
      if (!image) ok(tileShown && !/<img/.test(media), `${def.id} ${surface}, ${label}: the slot shows the ${base.tile.label} illustration tile`);
      else if (image.startsWith("/api/photo")) ok(tileShown && /data-card-photo-request=/.test(media) && /data-card-photo-fallback="pending"/.test(media), `${def.id} ${surface}, ${label}: the tile stands in while the credited photo loads`);
      else ok(new RegExp('<img[^>]+src="' + image.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + '"').test(media) && tileShown && /data-card-photo-fallback="loading"/.test(media), `${def.id} ${surface}, ${label}: the direct photo renders over the tile until it paints`);
      ok(!EMPTY.test(media), `${def.id} ${surface}, ${label}: no empty "Loading photo" or "Photo unavailable" panel`);
      if (image && !image.startsWith("/api/photo")) ok(/wf-place-card-photo-attr/.test(html), `${def.id} ${surface}, ${label}: a direct licensed photo keeps its required credit`);
      else ok(!BADGE.test(html), `${def.id} ${surface}, ${label}: no credit badge without a loaded photo`);
    }
  }
}
// Positive control: the probe finds a tile and a badge where they exist.
const ctlTile = renderToStaticMarkup(React.createElement(RailCard, { title: "Control", photo: null, placeholder: cards[0].tile }));
ok(/data-artwork="illustration"/.test(mediaOf(ctlTile)), "positive control: the media probe finds a tile");
ok(BADGE.test('<a class="wf-place-card-photo-attr">©</a>') && EMPTY.test('<span aria-label="Loading photo">'), "positive control: the badge and empty panel probes match their markup");

// The wiring both surfaces use (static, comments stripped).
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/photoTile=\{isEvent \? card\.tile \|\| null : null\}/.test(strip(read("app/components/ChristmasIntentRails.js"))), "the rails pass the tile to every event card (static)");
ok(/photoTile=\{card\.tile \|\| null\}/.test(strip(read("app/components/ChristmasBrowse.js"))), "the browse passes the tile to every card (static)");
const rail = strip(read("app/components/RailCard.js"));
ok(/fallback=\{photoFallbackNode\}/.test(rail) && /placeholder = placeholder \|\| photoTile;/.test(rail), "RailCard hands the tile to CardPhoto and keeps it as the last rung (static)");
ok(/\{photoAttr && shownPhoto && !creditedLane && imgFailed !== shownPhoto\s*\?/.test(rail), "RailCard adds no credit on the credited lane and drops it when a direct photo fails (static)");

// ── B. Chromium: the credited lane's failures ───────────────────────────────
let chromium = null;
try { ({ chromium } = await import("@playwright/test")); } catch { chromium = null; }
const exe = process.argv.find((a) => a.startsWith("--browser="))?.slice(10) || undefined;
let browser = null;
if (chromium) { try { browser = await chromium.launch({ headless: true, executablePath: exe, args: ["--no-sandbox"] }); } catch { browser = null; } }
if (!browser) {
  if (process.argv.includes("--require-browser")) { console.log("  FAIL: browser required"); process.exit(1); }
  console.log("  note: Chromium unavailable, layer B (credited lane failures) NOT executed");
} else {
  const compile = (file) => ts.transpileModule(read(file), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const helper = compile("lib/cardPhotoRequest.js"), component = compile("app/components/CardPhoto.js"), creditLink = compile("app/components/PhotoCreditLink.js");
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let mode = "miss", calls = 0;
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/photo") {
        calls++;
        if (mode === "500") return route.fulfill({ status: 500, body: "x" });
        if (mode === "abort") return route.abort();
        if (mode === "miss") return route.fulfill({ json: { src: null, source: "none", credit: null } });
        if (mode === "broken") return route.fulfill({ json: { src: "https://photo.test/broken.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x" } } });
        if (mode === "slow") return route.fulfill({ json: { src: "https://photo.test/slow.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x" } } });
        if (mode === "licensed") return route.fulfill({ json: { src: "https://photo.test/licensed.jpg", source: "licensed", credit: { name: "A Photographer", uri: "https://commons.wikimedia.org/x", license: "CC BY 4.0" } } });
        return route.fulfill({ json: { src: "https://photo.test/good.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x" } } });
      }
      if (u.pathname === "/broken.jpg") return route.fulfill({ status: 404, body: "no" });
      if (u.hostname === "photo.test" && u.pathname === "/slow.jpg") await new Promise((r) => setTimeout(r, 1500));
      if (u.hostname === "photo.test") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#335544"/></svg>' });
      return route.fulfill({ contentType: "text/html", body: '<div class="wf-place-card-media" style="position:relative;width:140px;height:176px;background:#1b1f24"><div id="root" style="position:relative;width:100%;height:100%"></div></div>' });
    });
    await page.goto("https://wayfind.test/");
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react/umd/react.development.js") });
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react-dom/umd/react-dom.development.js") });
    await page.addScriptTag({ content: `window.photoHelpers={};(function(exports){${helper}})(photoHelpers);window.creditLinkModule={};(function(exports){${creditLink}})(creditLinkModule);window.photoModule={};(function(exports,require){${component}})(photoModule,id=>id==='react'?React:id==='react-dom'?ReactDOM:id==='./PhotoCreditLink.js'?creditLinkModule:photoHelpers);window.root=ReactDOM.createRoot(document.getElementById('root'));` });
    const mount = (id) => page.evaluate((id) => {
      const tile = React.createElement("div", { "data-artwork": "illustration", role: "img", "aria-label": "Theme parks illustration", style: { width: "100%", height: "100%", background: "#7a2e2e" } }, "THEME PARKS");
      root.render(React.createElement(photoModule.default, { src: "/api/photo?place=" + id + "&w=640", alt: "", fallback: tile, creditBadge: true, style: { width: "100%", height: "100%", objectFit: "cover" } }));
    }, id);
    const state = () => page.evaluate(() => ({
      tile: !!document.querySelector("#root [data-artwork='illustration']"),
      img: [...document.querySelectorAll("#root img")].filter((i) => i.complete && i.naturalWidth > 0).length,
      anyImg: document.querySelectorAll("#root img").length,
      badge: !!document.querySelector("#root [data-card-photo-credit], #root [data-card-photo-licensed-credit], #root .wf-place-card-photo-attr"),
      empty: /Loading photo|Photo unavailable/.test(document.getElementById("root").innerHTML),
      phase: document.querySelector("#root [data-card-photo-fallback]")?.getAttribute("data-card-photo-fallback") || null,
    }));
    let n = 0;
    for (const m of ["miss", "500", "abort", "broken"]) {
      mode = m;
      await mount("ChIJChristmasSlotFail" + String(++n).padStart(2, "0"));
      await page.waitForFunction(() => document.querySelector("#root [data-card-photo-fallback='failed']"), null, { timeout: 5000 }).catch(() => {});
      const s = await state();
      ok(s.tile && s.phase === "failed" && s.anyImg === 0 && !s.badge && !s.empty, `credited photo ${m}: the tile stays, no credit badge, no empty panel (${JSON.stringify(s)})`);
    }
    mode = "good";
    await mount("ChIJChristmasSlotGood01");
    await page.waitForFunction(() => { const i = document.querySelector("#root img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    let s = await state();
    ok(s.img === 1 && !s.tile && s.badge, `positive control: a loaded Google photo replaces the tile and carries its credit (${JSON.stringify(s)})`);
    mode = "slow";
    await mount("ChIJChristmasSlotSlow01");
    await page.waitForFunction(() => document.querySelector("#root img"), null, { timeout: 5000 }).catch(() => {});
    const mid = await state();
    ok(mid.anyImg === 1 && mid.img === 0 && !mid.badge, `a Google photo still loading shows no credit yet (${JSON.stringify(mid)})`);
    ok(mid.tile && mid.phase === "loading", `while its bytes load, the tile sits under it, so the slot is never empty (${JSON.stringify(mid)})`);
    await page.waitForFunction(() => { const i = document.querySelector("#root img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    const after = await state();
    ok(after.img === 1 && after.badge, `once it painted, its credit shows (${JSON.stringify(after)})`);
    mode = "licensed";
    await mount("ChIJChristmasSlotLic001");
    await page.waitForFunction(() => { const i = document.querySelector("#root img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    s = await state();
    const licensed = await page.evaluate(() => document.querySelector("#root [data-card-photo-licensed-credit]")?.getAttribute("href") || null);
    ok(s.img === 1 && licensed === "https://commons.wikimedia.org/x", `a loaded licensed photo shows its own credit link (${licensed})`);
    ok(calls === 7 && errors.length === 0, `one photo request per card, no retries, no page errors (${calls} requests; ${errors.join(" | ")})`);
    await page.close();
  } finally { await browser.close(); }
}

console.log(`\ncheck-christmas-card-photo-slot: ${fail ? "FAIL" : "OK"}: ${pass} assertions (${rendered} server renders of ${CHRISTMAS_INTENT_RAIL_DEFS.length} rails x ${VARIANTS.length} photo states x 2 surfaces${browser ? "; Chromium: miss, 500, network failure, broken image, Google and licensed photo" : ""})`);
process.exit(fail ? 1 : 0);
