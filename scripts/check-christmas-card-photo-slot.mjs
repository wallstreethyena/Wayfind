#!/usr/bin/env node
// scripts/check-christmas-card-photo-slot.mjs: a Christmas card never shows an
// empty photo panel, and never a credit badge on a photo that did not load.
//
// Live 2026-10-14 (owner screenshot): the "Very Merry" card painted an empty
// dark panel with only the round "©". main #1764 made every CardPhoto outcome
// end in the ONE shared PhotoFallbackTile; this guard locks the Christmas cards
// onto it:
//   A. Server render (jsxLoad + react-dom/server) of the REAL browse card
//      (ChristmasBrowseCard) and the real RailCard with the rails' props, for
//      all 8 Christmas rails:
//        no photo       -> the designed event tile (main's EventPlaceholderTile)
//        credited photo -> PhotoFallbackTile (data-photo-fallback) while pending
//        no credit badge on either, even when a credit label was passed
//        a direct licensed photo keeps its required credit
//   B. Chromium mounts the REAL CardPhoto + PhotoFallbackTile with the Christmas
//      fallbackCategory and answers its photo request with a miss, a 500, a
//      network failure and an undecodable image: each ends in the tile
//      (data-photo-fallback="unavailable", the Christmas glyph), no <img>, no
//      credit. A good Google photo replaces the tile (positive control).
import { readFileSync, readdirSync as readdirSyncFs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";
import { CHRISTMAS_INTENT_RAIL_DEFS, christmasEventRail } from "../lib/christmasIntentRails.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const TODAY = "2026-10-14";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { CAT_GLYPH } = await loadComponent(path.join(ROOT, "app/components/PhotoFallbackTile.js"), ROOT);
ok(CAT_GLYPH.christmas === "🎄", "PhotoFallbackTile has the Christmas glyph");
const kitIcons = Object.fromEntries([...(/export const CAT_ICONS = \{([^}]*)\}/.exec(read("app/components/kit.js"))?.[1] || "").matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
ok(Object.keys(kitIcons).length >= 6 && Object.entries(kitIcons).every(([k, v]) => CAT_GLYPH[k] === v), "CAT_GLYPH stays in parity with kit.js CAT_ICONS");
// One tile: only PhotoFallbackTile emits the fallback marker (as a JSX
// attribute) anywhere in app/ and lib/.
const walk = (d) => readdirSyncFs(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(?:js|jsx|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []);
const markerFiles = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].filter((f) => /data-photo-fallback=\{/.test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
ok(markerFiles.length === 1 && markerFiles[0] === "app/components/PhotoFallbackTile.js", `PhotoFallbackTile is the one fallback tile (marker emitted only by: ${markerFiles.join(", ")})`);

// ── A. Server render ────────────────────────────────────────────────────────
const { default: RailCard } = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
const { ChristmasBrowseCard } = await loadComponent(path.join(ROOT, "app/components/ChristmasBrowse.js"), ROOT);
const cards = mergeChristmasResearch([]).filter((e) => christmasEventRail(e)).map((e) => christmasEventCard(enrichChristmasEvent(e, new Map()), { today: TODAY }));
ok(cards.length >= 400 && cards.filter((c) => !c.image).every((c) => c.placeholder), `every photoless Christmas card carries main's event tile (${cards.length} cards)`);

const mediaOf = (html) => { const i = html.indexOf('class="wf-place-card-media"'); const j = html.indexOf('class="wf-place-card-content"', i); return i < 0 ? "" : html.slice(i, j < 0 ? undefined : j); };
const BADGE = /wf-place-card-photo-attr|data-card-photo-credit/;
const EMPTY_SPAN = /data-card-photo-request="[^"]*"[^>]*>\s*<\/span>/;
const railProps = (card) => ({
  // The props ChristmasIntentRails passes (wiring asserted statically below).
  photo: card.image || null, placeholder: !card.image ? card.placeholder || null : null, photoFallbackCategory: "christmas",
  visitFacts: card, photoAttr: card.photoAttr || null, photoAttrHref: card.photoAttrHref || null,
  title: card.title || card.name, eyebrow: "CHRISTMAS", rank: 1, when: card.when, facts: [card.city], take: card.hook, href: card.detailHref || card.url || null,
});
const VARIANTS = [
  ["no photo", null, null],
  ["credited photo, pending", "/api/photo?place=ChIJChristmasSlotTest01&w=640", null],
  ["credited photo with a credit label passed", "/api/photo?place=ChIJChristmasSlotTest02&w=640", "Google Maps"],
  ["direct licensed photo", "/guides/verified/test-photo.webp", "Photographer, CC BY 4.0"],
];
let rendered = 0;
for (const def of CHRISTMAS_INTENT_RAIL_DEFS) {
  const base = cards.find((c) => c.christmasRail === def.id && !c.image) || cards.find((c) => c.christmasRail === def.id);
  ok(!!base?.placeholder || !!base, `${def.id}: a real card exists for this rail`);
  if (!base) continue;
  const tile = base.placeholder || cards.find((c) => c.placeholder)?.placeholder;
  for (const [label, image, attr] of VARIANTS) {
    const card = { ...base, image, placeholder: image ? null : tile, photoAttr: attr, photoAttrHref: attr ? "https://example.org/credit" : null };
    for (const [surface, html] of [
      ["rail", renderToStaticMarkup(React.createElement(RailCard, railProps(card)))],
      ["browse", renderToStaticMarkup(React.createElement(ChristmasBrowseCard, { card, rank: 1, today: TODAY }))],
    ]) {
      rendered++;
      const media = mediaOf(html);
      const where = `${def.id} ${surface}, ${label}`;
      ok(media.length > 0, `${where}: the media slot rendered`);
      if (!image) ok(/data-artwork="illustration"/.test(media) && media.includes(tile.label) && !/<img/.test(media), `${where}: the designed event tile, no image`);
      else if (image.startsWith("/api/photo")) ok(/data-card-photo-request=/.test(media) && /data-photo-fallback="pending"/.test(media) && /role="img"/.test(media), `${where}: PhotoFallbackTile holds the slot while the photo loads`);
      else ok(/<img[^>]+src="\/guides\/verified\/test-photo\.webp"/.test(media), `${where}: the direct photo renders`);
      ok(!EMPTY_SPAN.test(media), `${where}: never an empty photo span`);
      if (image && !image.startsWith("/api/photo")) ok(BADGE.test(media), `${where}: a direct licensed photo keeps its required credit`);
      else ok(!BADGE.test(media), `${where}: no credit badge without a loaded photo`);
    }
  }
}
ok(BADGE.test('<a class="wf-place-card-photo-attr">©</a>') && EMPTY_SPAN.test('<span data-card-photo-request="/api/photo?x"></span>'), "positive control: the badge and empty span probes match their markup");

const rails = strip(read("app/components/ChristmasIntentRails.js")), browse = strip(read("app/components/ChristmasBrowse.js")), railCard = strip(read("app/components/RailCard.js"));
ok(/photoFallbackCategory="christmas"/.test(rails) && /photoFallbackCategory="christmas"/.test(browse), "the rails and the browse pass the Christmas tile category (static)");
ok(/fallbackCategory=\{photoFallbackCategory\}/.test(railCard), "RailCard hands that category to CardPhoto (static)");
ok(/\{photoAttr && shownPhoto && !creditedLane && imgFailed !== shownPhoto\s*\?/.test(railCard), "RailCard adds no credit on the credited lane and drops it when a direct photo fails (static)");

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
  const MODULES = { imageHostPolicy: "lib/imageHostPolicy.js", placePhoto: "lib/placePhoto.js", photoAnswers: "lib/photoAnswers.js", cardPhotoRequest: "lib/cardPhotoRequest.js", PhotoCreditLink: "app/components/PhotoCreditLink.js", PhotoFallbackTile: "app/components/PhotoFallbackTile.js", CardPhoto: "app/components/CardPhoto.js" };
  const harness = "window.__src={" + Object.entries(MODULES).map(([k, f]) => JSON.stringify(k) + ":function(exports,module,require){" + compile(f) + "\n}").join(",") + "};"
    + "window.__cache={};window.__req=function(id){if(id==='react')return React;if(id==='react-dom')return ReactDOM;var b=id.split('/').pop().replace(/\\.js$/,'');if(!__src[b])throw new Error('harness: unresolved '+id);if(__cache[b])return __cache[b].exports;var m={exports:{}};__cache[b]=m;__src[b](m.exports,m,__req);return m.exports;};"
    + "window.__seq=0;window.__mount=function(id){var c=document.createElement('div');c.id='case'+(++__seq);c.className='wf-place-card-media';c.style.cssText='position:relative;overflow:hidden;width:140px;height:176px';document.getElementById('root').appendChild(c);ReactDOM.createRoot(c).render(React.createElement(__req('CardPhoto').default,{src:'/api/photo?place='+id+'&w=640',alt:'',fallbackCategory:'christmas',style:{width:'100%',height:'100%',objectFit:'cover'}}));return c.id;};";
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const mode = new Map();
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/photo") {
        const m = mode.get(u.searchParams.get("place")) || "miss";
        if (m === "500") return route.fulfill({ status: 500, body: "x" });
        if (m === "abort") return route.abort("failed");
        if (m === "miss") return route.fulfill({ json: { src: null, source: "none", credit: null } });
        if (m === "decode") return route.fulfill({ json: { src: "https://photo.test/broken.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x" } } });
        return route.fulfill({ json: { src: "https://photo.test/good.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x" } } });
      }
      if (u.hostname === "photo.test" && u.pathname === "/broken.jpg") return route.fulfill({ status: 404, body: "no" });
      if (u.hostname === "photo.test") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#335544"/></svg>' });
      return route.fulfill({ contentType: "text/html", body: '<meta charset="utf-8"><div id="root"></div>' });
    });
    await page.goto("https://wayfind.test/");
    await page.clock.install();
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react/umd/react.development.js") });
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react-dom/umd/react-dom.development.js") });
    await page.addScriptTag({ content: harness });
    const state = (cid) => page.evaluate((id) => {
      const el = document.getElementById(id), tile = el.querySelector("[data-photo-fallback]");
      const imgs = [...el.querySelectorAll("img")];
      return { tile: tile?.getAttribute("data-photo-fallback") || null, label: tile?.getAttribute("aria-label") || "", glyph: tile?.textContent || "", img: imgs.length, painted: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, credit: !!el.querySelector("[data-card-photo-credit], .wf-place-card-photo-attr"), h: Math.round(el.getBoundingClientRect().height) };
    }, cid);
    const settle = async (cid, done) => { let s; for (let i = 0; i < 40; i++) { await page.clock.fastForward(20000); await page.waitForTimeout(60); s = await state(cid); if (done(s)) break; } return s; };
    let k = 0;
    for (const m of ["miss", "500", "abort", "decode"]) {
      const id = "ChIJChristmasSlotFail" + String(++k).padStart(2, "0");
      mode.set(id, m);
      const cid = await page.evaluate((id) => window.__mount(id), id);
      const s = await settle(cid, (x) => x.tile === "unavailable");
      ok(s.tile === "unavailable" && s.img === 0 && !s.credit && s.glyph.includes("🎄") && /Photo not available/.test(s.label) && s.h >= 100, `credited photo ${m}: PhotoFallbackTile with the Christmas glyph, no image, no credit (${JSON.stringify(s)})`);
    }
    const goodId = "ChIJChristmasSlotGood01";
    mode.set(goodId, "good");
    const gcid = await page.evaluate((id) => window.__mount(id), goodId);
    const g = await settle(gcid, (x) => x.painted === 1);
    ok(g.painted === 1 && !g.tile, `positive control: a loaded photo replaces the tile (${JSON.stringify(g)})`);
    ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
    await page.close();
  } finally { await browser.close(); }
}

console.log(`\ncheck-christmas-card-photo-slot: ${fail ? "FAIL" : "OK"}: ${pass} assertions (${rendered} server renders of ${CHRISTMAS_INTENT_RAIL_DEFS.length} rails x ${VARIANTS.length} photo states x 2 surfaces${browser ? "; Chromium: miss, 500, network failure, undecodable image, good photo" : ""})`);
process.exit(fail ? 1 : 0);
