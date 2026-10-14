// scripts/test-image-health.mjs — every image slot ends in a verified photo or the
// deliberate fallback tile. Never blank, never a broken-image glyph, never an
// infinite skeleton, never another venue's photo, never a loop.
//
// Owner goal (2026-10-14): "every image slot on every Wayfind surface ends in either
// a verified relevant photo or a deliberate polished fallback."
//
// HERMETIC. It EXECUTES the shipped code, it does not grep it:
//   Part A (node)    lib/photoAnswers.getPlacePhoto + normalizePhotoAnswer, lib/cardPhotoRequest
//                    cardPhotoRequest/fetchCardPhoto/railPhotoSrc, run against a fake fetch for
//                    every outcome class (ok google+credit, ok owned, no-photo, spend-denied,
//                    quota-open, 503, 404, network throw, malformed JSON, non-Google ids).
//   Part B (node)    app/components/PhotoFallbackTile via react-dom/server (labels, decorative,
//                    pending, compact, category glyphs == kit.js CAT_ICONS).
//   Part C (Chromium) the REAL CardPhoto, SafeImg, PhotoFallbackTile and the REAL FallbackImg
//                    (sliced out of app/home.js and run) in a real browser, across the outcome
//                    matrix x surfaces (card 300x200, rail thumb 58px, detail hero 250px, plain
//                    <img>). page.route fakes the network; page.clock drives the delayed retry.
//                    The checker (classify) reads the achieved DOM: a loaded <img> with
//                    naturalWidth > 0, OR the tile with a non-empty aria-label (or aria-hidden
//                    when decorative); zero-size, blank, broken <img>, left-over skeleton all fail.
// The detail-sheet hero/rails mount the same FallbackImg -> CardPhoto pair exercised here;
// the full Detail sheet is not mounted (it needs the whole home context) — said out loud.
//
// Run: node scripts/test-image-health.mjs [--browser=/path/to/chrome] [--require-browser]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { getPlacePhoto, normalizePhotoAnswer, resetPhotoAnswers, photoAnswerStats, MAX_ATTEMPTS, RETRY_DELAY_MS } from "../lib/photoAnswers.js";
import { cardPhotoRequest, fetchCardPhoto, railPhotoSrc } from "../lib/cardPhotoRequest.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ════════════════════════════════════════════════════════════════════════════
// Part A — the data lane, executed
// ════════════════════════════════════════════════════════════════════════════
const GID = "ChIJHealthPlace00001";
const headersOf = (h) => ({ get: (k) => (String(k).toLowerCase() === "x-wayfind-photo-result" ? h || "" : null) });
const OUTCOMES = {
  "ok-google-credit": { retries: false, photo: true, fetch: () => ({ ok: true, status: 200, headers: headersOf(), json: async () => ({ src: "https://photo.test/g.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/x", authors: [{ name: "A" }] } }) }) },
  "ok-owned": { retries: false, photo: true, fetch: () => ({ ok: true, status: 200, headers: headersOf(), json: async () => ({ src: "/owned/o.jpg", source: "wayfind", credit: null }) }) },
  "no-photo": { retries: false, photo: false, fetch: () => ({ ok: true, status: 200, headers: headersOf("no-photo"), json: async () => ({ src: null, source: "none" }) }) },
  "http-404": { retries: false, photo: false, fetch: () => ({ ok: false, status: 404, headers: headersOf(), json: async () => ({}) }) },
  "spend-denied": { retries: true, photo: false, fetch: () => ({ ok: true, status: 200, headers: headersOf("spend-denied"), json: async () => ({ src: null, source: "none" }) }) },
  "quota-open": { retries: true, photo: false, fetch: () => ({ ok: true, status: 200, headers: headersOf("quota-open"), json: async () => ({ src: null, source: "none" }) }) },
  "http-503": { retries: true, photo: false, fetch: () => ({ ok: false, status: 503, headers: headersOf(), json: async () => ({}) }) },
  "network-throw": { retries: true, photo: false, fetch: () => { throw new TypeError("network down"); } },
  "malformed-json": { retries: true, photo: false, fetch: () => ({ ok: true, status: 200, headers: headersOf(), json: async () => { throw new SyntaxError("Unexpected token <"); } }) },
};
for (const [name, o] of Object.entries(OUTCOMES)) {
  resetPhotoAnswers();
  let calls = 0, t = 1_000_000;
  const fetchImpl = async () => { calls++; return o.fetch(); };
  const now = () => t;
  const first = await getPlacePhoto(GID, { surface: "card", fetchImpl, now });
  ok(calls === 1, `${name}: first ask makes exactly 1 request (got ${calls})`);
  if (o.photo) {
    ok(first && typeof first.src === "string" && first.src.length > 0, `${name}: resolves a photo with a src`);
    if (name === "ok-google-credit") ok(first.credit && /^https:\/\//.test(first.credit.mapsUri) && first.source === "google", `${name}: Google photo keeps its credit + Maps link (rights preserved)`);
    const again = await getPlacePhoto(GID, { surface: "card", fetchImpl, now });
    ok(again === first && calls === 1, `${name}: the answer is reused for the page session (no second purchase)`);
  } else {
    ok(first === null, `${name}: resolves null (the caller shows the tile), never throws`);
    await getPlacePhoto(GID, { fetchImpl, now });
    ok(calls === 1, `${name}: no re-ask inside the retry delay`);
    t += RETRY_DELAY_MS + 50;
    await getPlacePhoto(GID, { surface: "card", fetchImpl, now });
    t += RETRY_DELAY_MS + 50;
    await getPlacePhoto(GID, { surface: "card", fetchImpl, now });
    t += RETRY_DELAY_MS + 50;
    await getPlacePhoto(GID, { surface: "card", fetchImpl, now });
    ok(calls === (o.retries ? MAX_ATTEMPTS : 1), `${name}: ${o.retries ? "ONE delayed retry then final" : "definitive miss, never retried"} (calls=${calls})`);
    ok(photoAnswerStats().final === 1, `${name}: ends in a final state, so no loading state can outlive it`);
  }
}
// non-Google ids: ZERO network
for (const id of ["evt-123", "florida-fall-festivals-2026", "fsq:4b5f0c2af964a520", "", null, undefined, "bad id"]) {
  resetPhotoAnswers();
  let calls = 0;
  const r = await getPlacePhoto(id, { surface: "card", fetchImpl: async () => { calls++; return OUTCOMES["ok-google-credit"].fetch(); } });
  ok(r === null && calls === 0, `non-Google id ${JSON.stringify(id)}: no fetch, resolves null`);
}
eq(cardPhotoRequest("/api/photo?place=evt-123"), null, "cardPhotoRequest: an event id never becomes a request");
eq(cardPhotoRequest("/api/photo?place=" + GID).startsWith("/api/photo?place=" + GID), true, "cardPhotoRequest: a Google id becomes the credited card request");
{
  resetPhotoAnswers(); let calls = 0;
  const r = await fetchCardPhoto(cardPhotoRequest("/api/photo?place=evt-123") || undefined, async () => { calls++; return OUTCOMES["ok-owned"].fetch(); });
  ok(r === null && calls === 0, "fetchCardPhoto(null request) resolves null with zero fetches");
}
// railPhotoSrc: own photo first, own place id second, NEVER another venue's photo, null otherwise
eq(railPhotoSrc({ id: GID, photo: "/owned/a.jpg" }), "/owned/a.jpg", "railPhotoSrc: owned photo wins");
eq(railPhotoSrc({ id: GID }), "/api/photo?place=" + GID, "railPhotoSrc: a Google id asks for ITS OWN photo");
eq(railPhotoSrc({ id: "evt-123" }), null, "railPhotoSrc: event id -> null (tile, zero fetches)");
eq(railPhotoSrc({ id: "some-guide-slug" }), null, "railPhotoSrc: guide slug -> null");
eq(railPhotoSrc({ id: GID, photo: "   " }), "/api/photo?place=" + GID, "railPhotoSrc: a blank photo string does not blank the slot");
eq(railPhotoSrc(null), null, "railPhotoSrc: null place -> null");
eq(railPhotoSrc("ChIJHealthPlace00001"), null, "railPhotoSrc: a bare string is not a place");
// normalizePhotoAnswer: malformed / hostile answers are definitive misses, never a half photo
for (const [label, j] of [["null", null], ["no src", {}], ["source none", { src: "https://x/y.jpg", source: "none" }], ["javascript: url", { src: "javascript:alert(1)", source: "google" }], ["protocol-relative", { src: "//evil.example/a.jpg", source: "google" }], ["number src", { src: 5, source: "google" }]]) {
  ok(normalizePhotoAnswer(GID, j).definitiveMiss === true, `normalizePhotoAnswer: ${label} -> definitive miss`);
}
{
  const g = normalizePhotoAnswer(GID, { src: "https://photo.test/g.jpg", source: "google", credit: {} }).photo;
  ok(g && /^https:\/\/www\.google\.com\/maps\/.*ChIJHealthPlace00001/.test(g.credit.mapsUri) && g.placeId === GID, "normalizePhotoAnswer: a Google photo with no credit still carries THIS place's Maps link");
}

// ════════════════════════════════════════════════════════════════════════════
// Part B — the shared tile, executed (server render)
// ════════════════════════════════════════════════════════════════════════════
const tileMod = await loadComponent(path.join(REPO, "app/components/PhotoFallbackTile.js"), REPO);
const Tile = tileMod.default;
const html = (props) => renderToStaticMarkup(createElement(Tile, props));
{
  const a = html({ name: "Joe's Crab Shack", category: "food" });
  ok(/role="img"/.test(a) && /aria-label="Photo not available for Joe(&#x27;|')s Crab Shack"/.test(a), "tile: role=img with 'Photo not available for <name>'");
  ok(a.includes(tileMod.CAT_GLYPH.food) && /data-photo-fallback="unavailable"/.test(a), "tile: category glyph shown for a known category");
  ok(/Photo unavailable/.test(a), "tile: full-size tile carries the honest caption");
  const b = html({ name: "", compact: true });
  ok(/aria-label="Photo not available"/.test(b) && !/Photo unavailable/.test(b) && /<svg/.test(b), "tile: no name -> generic label; compact -> no caption; unknown category -> brand pin");
  ok(/aria-label="Loading photo"/.test(html({ pending: true })) && /data-photo-fallback="pending"/.test(html({ pending: true })), "tile: pending variant is a labelled quiet tile");
  const d = html({ decorative: true, name: "x" });
  ok(/aria-hidden="true"/.test(d) && !/role="img"/.test(d), "tile: decorative variant is aria-hidden, not a nameless img");
  ok(/min-height:40px/.test(html({ compact: true })) && /min-height:60px/.test(a), "tile: min-height is safe for a 58px thumb (40) and a full card (60)");
  ok(tileMod.categoryGlyph("Seafood Restaurant") === tileMod.CAT_GLYPH.food && tileMod.categoryGlyph("beach") === tileMod.CAT_GLYPH.beach && tileMod.categoryGlyph("") === "" && tileMod.categoryGlyph("zzz") === "", "tile: categoryGlyph maps real categories, and returns '' (brand pin) for unknown, never a wrong guess");
  const kitSrc = readFileSync(path.join(REPO, "app/components/kit.js"), "utf8");
  const kitIcons = Object.fromEntries([...(/export const CAT_ICONS = \{([^}]*)\}/.exec(kitSrc)?.[1] || "").matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  ok(Object.keys(kitIcons).length >= 6, "kit.js CAT_ICONS parsed (positive control)");
  for (const [k, v] of Object.entries(kitIcons)) ok(tileMod.CAT_GLYPH[k] === v, `tile glyph for "${k}" matches kit.js CAT_ICONS`);
}

// ════════════════════════════════════════════════════════════════════════════
// Part C — the achieved DOM, in Chromium
// ════════════════════════════════════════════════════════════════════════════
let browser;
try { browser = await chromium.launch({ headless: true, executablePath: process.argv.find((a) => a.startsWith("--browser="))?.slice(10) || undefined, args: ["--no-sandbox"] }); }
catch (e) {
  if (process.argv.includes("--require-browser")) throw e;
  console.log(`test-image-health: ${n} assertions passed (data lane + tile); browser unavailable, rendered behavior NOT verified`);
  process.exit(0);
}
const compile = (file) => ts.transpileModule(readFileSync(path.join(REPO, file), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const MODULES = {
  imageHostPolicy: "lib/imageHostPolicy.js", placePhoto: "lib/placePhoto.js", photoAnswers: "lib/photoAnswers.js", cardPhotoRequest: "lib/cardPhotoRequest.js",
  PhotoCreditLink: "app/components/PhotoCreditLink.js", PhotoFallbackTile: "app/components/PhotoFallbackTile.js", CardPhoto: "app/components/CardPhoto.js", SafeImg: "app/components/SafeImg.js",
};
const bundle = "window.__src={" + Object.entries(MODULES).map(([k, f]) => JSON.stringify(k) + ":function(exports,module,require){" + compile(f) + "\n}").join(",") + "};"
  + "window.__cache={};window.__req=function(id){if(id==='react')return React;if(id==='react-dom')return ReactDOM;var b=id.split('/').pop().replace(/\\.js$/,'');if(!__src[b])throw new Error('harness: unresolved '+id);if(__cache[b])return __cache[b].exports;var m={exports:{}};__cache[b]=m;__src[b](m.exports,m,__req);return m.exports;};";
// FallbackImg: the REAL function out of app/home.js (same slice test-shared-photo-lifecycle runs)
const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
const fs0 = home.indexOf("function FallbackImg("), fs1 = home.indexOf("\n// v3.9:", fs0);
assert.ok(fs0 > 0 && fs1 > fs0 && home.indexOf("function FallbackImg(", fs0 + 1) === -1, "exactly one FallbackImg in app/home.js"); n++;
const fallbackImgJs = ts.transpileModule(home.slice(fs0, fs1), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const imageStateJs = ts.transpileModule(readFileSync(path.join(REPO, "lib/imageState.js"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const kitSlice = (() => { const k = readFileSync(path.join(REPO, "app/components/kit.js"), "utf8"); const a = k.indexOf("export function BrandedImageFallback"); const b = k.indexOf("// Calm brand pin", a); assert.ok(a > 0 && b > a); return k.slice(a, b).replace("export function", "function"); })();
const brandedJs = ts.transpileModule(kitSlice, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const harness = bundle
  + "var __is={};(function(exports){" + imageStateJs + "})(__is);"
  + "var PhotoFallbackTile=__req('PhotoFallbackTile').default;"
  + "var BrandedImageFallback=(function(PhotoFallbackTile){" + brandedJs + ";return BrandedImageFallback;})(PhotoFallbackTile);"
  + "var FallbackImg=(function(React,useState,useRef,useEffect,imageDisplayState,BrandedImageFallback,cardPhotoRequest,CardPhoto){" + fallbackImgJs + ";return FallbackImg;})(React,React.useState,React.useRef,React.useEffect,__is.imageDisplayState,BrandedImageFallback,__req('cardPhotoRequest').cardPhotoRequest,__req('CardPhoto').default);"
  + "window.H={CardPhoto:__req('CardPhoto').default,SafeImg:__req('SafeImg').default,FallbackImg:FallbackImg,railPhotoSrc:__req('cardPhotoRequest').railPhotoSrc,answers:__req('photoAnswers'),Tile:PhotoFallbackTile};"
  + `window.__errs=[];window.addEventListener('error',function(e){if(e.target&&e.target.tagName==='IMG')__errs.push(e.target.getAttribute('src'));},true);`
  + `window.__seq=0;window.__mount=function(surface,src,id){
      var h=H,c=document.createElement('div');c.id='case'+(++__seq);document.getElementById('root').appendChild(c);
      var el,box={position:'relative',overflow:'hidden'};
      if(surface==='card'){c.style.cssText='position:relative;overflow:hidden;width:300px;height:200px';el=React.createElement(h.CardPhoto,{src:src,alt:'Health Place',style:{width:'100%',height:'100%',objectFit:'cover'}});}
      else if(surface==='rail58'){c.style.cssText='display:flex';el=React.createElement(h.FallbackImg,{src:src,icon:'📍',style:{width:58,height:58,borderRadius:10,objectFit:'cover',flexShrink:0}});}
      else if(surface==='hero250'){c.style.cssText='width:min(360px,100%)';el=React.createElement(h.FallbackImg,{src:src,category:'food',alt:'Health Place',style:{width:'100%',height:250,objectFit:'cover'}});}
      else if(surface==='fallbackimg-plain'){c.style.cssText='display:flex';el=React.createElement(h.FallbackImg,{src:src,alt:'Health Place',style:{width:120,height:90}});}
      else if(surface==='safeimg'){c.style.cssText='position:relative;width:200px;height:120px';el=React.createElement(h.SafeImg,{src:src,alt:'Health Place',style:{width:'100%',height:'100%',objectFit:'cover'}});}
      var root=ReactDOM.createRoot(c);root.render(el);return c.id;};`
  + `window.__classify=function(el){
      var v=[],r=el.getBoundingClientRect(),out={kind:'none',violations:v,box:[Math.round(r.width),Math.round(r.height)]};
      var tile=el.querySelector('[data-photo-fallback]');
      var imgs=[].slice.call(el.querySelectorAll('img')).filter(function(i){var s=getComputedStyle(i);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;});
      var sk=el.querySelector('.wf-skeleton');
      if(r.width<40||r.height<40)v.push('zero-size container '+out.box);
      if(imgs.length){out.kind='img';imgs.forEach(function(i){if(!i.getAttribute('src'))v.push('img without src');if(!i.complete||i.naturalWidth===0)v.push('broken img left visible: '+i.getAttribute('src'));var ir=i.getBoundingClientRect();if(ir.width<40||ir.height<40)v.push('zero-size img');});}
      if(tile){out.kind=imgs.length?'img+tile':(tile.getAttribute('data-photo-fallback')==='pending'?'pending':'tile');var tr=tile.getBoundingClientRect();out.tileBox=[Math.round(tr.width),Math.round(tr.height)];
        if(tr.width<40||tr.height<40)v.push('zero-size tile '+out.tileBox);
        var hidden=tile.getAttribute('aria-hidden')==='true',lab=tile.getAttribute('aria-label')||'';out.label=lab;out.hidden=hidden;
        if(!hidden&&(tile.getAttribute('role')!=='img'||!lab.trim()))v.push('tile without role=img + non-empty aria-label');
        if(imgs.length)v.push('tile AND visible img together');}
      if(sk)v.push('skeleton left over');
      if(out.kind==='none')v.push('blank: neither a loaded img nor the tile');
      if(out.kind==='pending')v.push('still pending (infinite placeholder)');
      return out;};`;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#446655"/></svg>';
// outcome class -> { mode, google id, expect: img|tile, calls (after retries) }
const CLASSES = [
  { name: "ok-google-credit", id: "ChIJHealthOkGoogle01", expect: "img", calls: 1 },
  { name: "ok-owned", id: "ChIJHealthOkOwned0001", expect: "img", calls: 1 },
  { name: "no-photo", id: "ChIJHealthNoPhoto001", expect: "tile", calls: 1 },
  { name: "spend-denied", id: "ChIJHealthSpendDen001", expect: "tile", calls: 2 },
  { name: "quota-open", id: "ChIJHealthQuotaOpen01", expect: "tile", calls: 2 },
  { name: "http-503", id: "ChIJHealthHttp503001", expect: "tile", calls: 2 },
  { name: "network-throw", id: "ChIJHealthNetThrow001", expect: "tile", calls: 2 },
  { name: "malformed-json", id: "ChIJHealthMalformed01", expect: "tile", calls: 2 },
  { name: "image-decode-error", id: "ChIJHealthDecodeErr01", expect: "tile", calls: 1, decode: true },
];
const NON_GOOGLE = ["evt-123", "florida-fall-festivals-2026", "fsq:4b5f0c2af964a520"];
const modeOf = (id) => CLASSES.find((c) => c.id === id)?.name;
let totalCases = 0;

try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(e.message));
    const calls = {}; let directImageCalls = 0, sinceAbort = 0;
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/photo") {
        if (u.searchParams.get("fmt") !== "json") { directImageCalls++; return route.fulfill({ status: 404, body: "no" }); }
        const id = u.searchParams.get("place"); calls[id] = (calls[id] || 0) + 1;
        const m = modeOf(id), j = (obj, headers) => route.fulfill({ json: obj, headers });
        if (m === "ok-google-credit") return j({ src: "https://photo.test/" + id + ".jpg", source: "google", credit: { mapsUri: "https://maps.google.com/photo/" + id, authors: [{ name: "Author of " + id, uri: "https://maps.google.com/contrib/x" }] } });
        if (m === "ok-owned") return j({ src: "/owned/" + id + ".jpg", source: "wayfind", credit: null });
        if (m === "no-photo") return j({ src: null, source: "none", credit: null }, { "x-wayfind-photo-result": "no-photo" });
        if (m === "spend-denied") return j({ src: null, source: "none", credit: null }, { "x-wayfind-photo-result": "spend-denied" });
        if (m === "quota-open") return j({ src: null, source: "none", credit: null }, { "x-wayfind-photo-result": "quota-open" });
        if (m === "http-503") return route.fulfill({ status: 503, body: "busy" });
        if (m === "network-throw") { sinceAbort++; return route.abort("failed"); }
        if (m === "malformed-json") return route.fulfill({ status: 200, contentType: "application/json", body: "<<not json" });
        if (m === "image-decode-error") return j({ src: "https://photo.test/broken-" + id + ".jpg", source: "google", credit: { mapsUri: "https://maps.google.com/photo/" + id, authors: [] } });
        return route.fulfill({ status: 404, body: "unknown" });
      }
      if (u.pathname.startsWith("/owned/") || (u.hostname === "photo.test" && !u.pathname.startsWith("/broken"))) return route.fulfill({ contentType: "image/svg+xml", body: SVG });
      if (u.pathname.startsWith("/broken") || u.pathname.includes("/broken-")) return route.fulfill({ status: 404, body: "gone" });
      return route.fulfill({ contentType: "text/html", body: '<style>body{margin:0}</style><div id="root"></div>' });
    });
    await page.goto("https://wayfind.test/");
    ok(await page.evaluate(() => window.innerWidth) === width, "achieved viewport matches the tested size");
    await page.clock.install();
    await page.addScriptTag({ path: path.join(REPO, "node_modules/react/umd/react.development.js") });
    await page.addScriptTag({ path: path.join(REPO, "node_modules/react-dom/umd/react-dom.development.js") });
    await page.addScriptTag({ content: harness });
    const settle = async (cid, until) => {
      let last;
      for (let i = 0; i < 60; i++) { last = await page.evaluate((id) => window.__classify(document.getElementById(id)), cid); if (until(last)) return last; await page.waitForTimeout(50); }
      return last;
    };
    const cleanup = (cid) => page.evaluate((id) => { document.getElementById(id)?.remove(); }, cid);

    // NEGATIVE CONTROLS — the classifier can fail. A blank box, a broken <img> and a nameless tile must all be reported.
    {
      const probe = async (markup) => page.evaluate((h) => { const d = document.createElement("div"); d.style.cssText = "width:200px;height:100px"; d.innerHTML = h; document.getElementById("root").appendChild(d); const r = window.__classify(d); d.remove(); return r; }, markup);
      const blank = await probe("");
      ok(blank.kind === "none" && blank.violations.some((v) => /blank/.test(v)), "control: an empty slot is classified blank (violation)");
      const brk = await page.evaluate(async () => { const d = document.createElement("div"); d.style.cssText = "width:200px;height:100px"; d.innerHTML = '<img src="https://wayfind.test/broken-control.jpg" alt="x" style="width:100%;height:100%">'; document.getElementById("root").appendChild(d); const im = d.firstChild; await new Promise((res) => { im.onerror = res; im.onload = res; }); const r = window.__classify(d); d.remove(); return r; });
      ok(brk.violations.some((v) => /broken img left visible/.test(v)), `control: a broken <img> that stayed visible is a violation (${JSON.stringify(brk)})`);
      const nameless = await probe('<div data-photo-fallback="unavailable" role="img" style="width:100%;height:100%"></div>');
      ok(nameless.violations.some((v) => /aria-label/.test(v)), "control: a tile with no aria-label is a violation");
      const good = await probe('<div data-photo-fallback="unavailable" role="img" aria-label="Photo not available for X" style="width:100%;height:100%"></div>');
      ok(good.violations.length === 0 && good.kind === "tile", "control: a well-formed tile passes (positive control)");
      const skel = await probe('<div class="wf-skeleton" style="width:100%;height:100%"></div>');
      ok(skel.violations.some((v) => /skeleton/.test(v)), "control: a left-over skeleton is a violation");
    }

    // THE MATRIX: outcome class x surface
    for (const surface of ["card", "rail58", "hero250"]) {
      for (const c of CLASSES) {
        const src = railPhotoSrc({ id: c.id });
        const errBefore = await page.evaluate(() => window.__errs.length);
        const cid = await page.evaluate(({ s, src }) => window.__mount(s, src), { s: surface, src });
        let r = await settle(cid, (x) => x.kind === (c.expect === "img" ? "img" : "tile") && !x.violations.length);
        const label = `[${width}px ${surface} / ${c.name}]`;
        eq(r.violations, [], `${label} achieved DOM violations: ${JSON.stringify(r)}`);
        ok(r.kind === c.expect, `${label} ends in ${c.expect} (got ${r.kind})`);
        if (c.expect === "tile") ok(r.hidden === false && r.label.startsWith("Photo not available"), `${label} tile aria-label is honest ('${r.label}')`);
        if (c.expect === "tile" && surface === "hero250") ok(r.tileBox[1] >= 200, `${label} tile fills the 250px hero (got ${r.tileBox})`);
        if (c.expect === "tile" && surface === "rail58") ok(r.tileBox[0] >= 56 && r.tileBox[0] <= 60, `${label} tile fits the 58px thumb (got ${r.tileBox})`);
        // drive the delayed retries; a final state must be stable and the request count bounded
        for (let k = 0; k < 3; k++) { await page.clock.fastForward(25000); await page.waitForTimeout(120); }
        r = await settle(cid, () => true);
        eq(r.violations, [], `${label} still clean after the delayed retry window: ${JSON.stringify(r)}`);
        ok(r.kind === c.expect, `${label} final state is ${c.expect} (got ${r.kind})`);
        if (c.expect === "img") ok(true === (await page.evaluate((id) => !!document.querySelector("#" + id + " img").naturalWidth, cid)), `${label} the <img> actually decoded`);
        if (c.name === "ok-google-credit" && surface === "card") ok(await page.locator("#" + cid + " [data-card-photo-credit] a").count() === 1, `${label} Google credit label preserved on the card`);
        if (c.decode) {
          const errs = await page.evaluate((b) => window.__errs.slice(b), errBefore);
          ok(errs.filter((s) => /broken-/.test(s)).length === 1, `${label} onError fired exactly ONCE for the broken image (got ${JSON.stringify(errs)})`);
          ok(r.kind === "tile" && (await page.locator("#" + cid + " img").count()) === 0, `${label} the broken <img> is gone, not left visible`);
        }
        await cleanup(cid); totalCases++;
      }
      // per-id request counts (page-wide, accumulated across surfaces): each surface asks once per place per page session
    }
    for (const c of CLASSES) {
      // 3 surfaces share one place id -> the session memo means the whole page made `calls` requests, not 3x
      ok(calls[c.id] === c.calls, `[${width}px] ${c.name}: the page made ${calls[c.id]} request(s) for 3 surfaces (expected ${c.calls}: 1/place/page + at most 1 delayed retry)`);
    }
    // non-Google ids: zero fetches, tile at once
    {
      const before = Object.values(calls).reduce((a, b) => a + b, 0), imgBefore = directImageCalls;
      for (const surface of ["card", "rail58", "hero250"]) for (const id of NON_GOOGLE) {
        const src = railPhotoSrc({ id });
        eq(src, null, `non-Google ${id}: railPhotoSrc is null`);
        const cid = await page.evaluate(({ s, src }) => window.__mount(s, src), { s: surface, src });
        const r = await settle(cid, (x) => x.kind === "tile");
        eq(r.violations, [], `[${width}px ${surface} / non-google ${id}] clean tile: ${JSON.stringify(r)}`);
        ok(r.kind === "tile" && r.label.startsWith("Photo not available"), `[${width}px ${surface} / non-google ${id}] honest tile`);
        await cleanup(cid); totalCases++;
      }
      await page.waitForTimeout(100);
      ok(Object.values(calls).reduce((a, b) => a + b, 0) === before && directImageCalls === imgBefore, `[${width}px] a non-Google id (event id, guide slug, fsq id) makes ZERO fetches (json + direct image)`);
    }
    // plain image slots (owned/partner art): ok, broken (swap exactly once), missing
    for (const surface of ["safeimg", "fallbackimg-plain"]) {
      const plain = [["ok", "https://photo.test/plain-ok.jpg", "img"], ["broken", "https://wayfind.test/broken-plain.jpg", "tile"], ["missing", null, "tile"], ["empty-string", "", "tile"]];
      for (const [name, src, expect] of plain) {
        const errBefore = await page.evaluate(() => window.__errs.length);
        const cid = await page.evaluate(({ s, src }) => window.__mount(s, src), { s: surface, src });
        const r = await settle(cid, (x) => x.kind === expect && !x.violations.length);
        eq(r.violations, [], `[${width}px ${surface} / plain-${name}] clean: ${JSON.stringify(r)}`);
        ok(r.kind === expect, `[${width}px ${surface} / plain-${name}] ends in ${expect} (got ${r.kind})`);
        if (name === "broken") {
          await page.waitForTimeout(150);
          const errs = await page.evaluate((b) => window.__errs.slice(b), errBefore);
          ok(errs.length === 1, `[${width}px ${surface} / plain-broken] onError fired exactly once, no loop (got ${errs.length})`);
        }
        await cleanup(cid); totalCases++;
      }
    }
    // IntersectionObserver unsupported: the request still starts and the slot still terminates
    {
      await page.evaluate(() => { window.__IO = window.IntersectionObserver; window.IntersectionObserver = undefined; });
      const id = "ChIJHealthNoIO0000001";
      const noPhotoBefore = calls[id] || 0;
      const cid = await page.evaluate(({ s, src }) => window.__mount(s, src), { s: "card", src: railPhotoSrc({ id }) });
      const r = await settle(cid, (x) => x.kind === "tile");
      eq(r.violations, [], `[${width}px no-IntersectionObserver] clean: ${JSON.stringify(r)}`);
      ok(r.kind === "tile" && (calls[id] || 0) === noPhotoBefore + 1, `[${width}px no-IntersectionObserver] the request starts immediately and the slot ends in the tile (unknown id -> 404 -> tile; calls=${calls[id]})`);
      await page.evaluate(() => { window.IntersectionObserver = window.__IO; });
      await cleanup(cid); totalCases++;
    }
    // Offscreen element: no request until it scrolls into view, a quiet pending tile (not whitespace) meanwhile, then it terminates.
    {
      const id = "ChIJHealthOffscreen01";
      const cid = await page.evaluate(({ src }) => { const c = document.createElement("div"); c.style.cssText = "height:3000px"; c.id = "spacer"; document.getElementById("root").appendChild(c); return window.__mount("card", src); }, { src: railPhotoSrc({ id }) });
      await page.waitForTimeout(150);
      const pend = await page.evaluate((i) => window.__classify(document.getElementById(i)), cid);
      ok((calls[id] || 0) === 0, `[${width}px offscreen] no request while offscreen`);
      ok(pend.kind === "pending" && pend.tileBox[0] >= 200 && pend.tileBox[1] >= 100, `[${width}px offscreen] the waiting state is a sized, labelled tile, not whitespace (${JSON.stringify(pend)})`);
      await page.evaluate((i) => document.getElementById(i).scrollIntoView(), cid);
      const r = await settle(cid, (x) => x.kind === "tile");
      eq(r.violations, [], `[${width}px offscreen->visible] clean: ${JSON.stringify(r)}`);
      ok(r.kind === "tile" && calls[id] >= 1, `[${width}px offscreen->visible] request starts on view and ends in the tile`);
      await cleanup(cid); await cleanup("spacer"); totalCases++;
    }
    eq(pageErrors, [], `[${width}px] no uncaught page errors`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(`test-image-health: OK — ${n} assertions; ${totalCases} browser cases (Chromium 390/1440: outcome classes ${CLASSES.length} x surfaces card/rail58/hero250, ${NON_GOOGLE.length} non-Google ids x 3 surfaces with zero fetches, plain <img> via SafeImg + FallbackImg, no-IntersectionObserver, offscreen->visible); 9 data-lane outcome classes executed through real getPlacePhoto; detail sheet not mounted (same FallbackImg->CardPhoto pair)`);
