import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { chromium } from "@playwright/test";
import { cardPhotoRequest, fetchCardPhoto } from "../lib/cardPhotoRequest.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const { WF_PLACE_CARD_CSS } = await loadComponent(new URL("../app/components/css.js", import.meta.url).pathname, new URL("../", import.meta.url).pathname);
// Match the home card's hit-testing contract, including FallbackImg's extra
// wrapper. Its content passes clicks through to a sibling Open button;
// individual photo controls must explicitly opt back into pointer events.
const homeSource = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
assert.match(homeSource, /className="wf-place-card-layout" style=\{\{ position: "relative", zIndex: 1, pointerEvents: "none" \}\}/);
assert.match(homeSource, /className="wf-place-card-open"[^\n]+zIndex: 0/);
assert.match(homeSource, /if \(cardPhotoRequest\(activeSrc\)\) return <div[^\n]+position: "relative", overflow: "hidden"[^\n]+<CardPhoto/);

const source = "/api/photo?place=ChIJCardPhotoTest0001";
const request = cardPhotoRequest(source);
assert.match(request, /s=card&fmt=json/);
assert.match(cardPhotoRequest(source + "&nospend=1"), /nospend=1/);
assert.equal(cardPhotoRequest("https://other.example" + source), null);
assert.equal(cardPhotoRequest("/api/photo?place=bad"), null);
let calls = 0, release;
const wait = new Promise((r) => { release = r; });
const fake = async () => { calls++; await wait; return { ok: true, json: async () => ({ src: "https://photo.test/a.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/photo/a" } }) }; };
const one = fetchCardPhoto(request, fake), two = fetchCardPhoto(request, fake);
assert.equal(one, two);
release(); await one;
assert.equal(calls, 1);
await fetchCardPhoto(request, fake);
assert.equal(calls, 2, "completed results are not retained in a cache");
assert.equal(await fetchCardPhoto(request, async () => ({ ok: true, json: async () => ({ src: "https://photo.test/a.jpg", source: "google", credit: {} }) })), null);
assert.equal((await fetchCardPhoto(request, async () => ({ ok: true, json: async () => ({ src: "/images/owned.jpg", source: "wayfind", credit: null }) }))).src, "/images/owned.jpg", "local owned images remain available");

let browser;
try { browser = await chromium.launch({ headless: true, executablePath: process.argv.find((a) => a.startsWith("--browser="))?.slice(10) || undefined, args: ["--no-sandbox"] }); }
catch (e) {
  if (process.argv.includes("--require-browser")) throw e;
  console.log("test-card-photo-viewer: request tests passed; browser unavailable, rendered behavior NOT verified");
  process.exit(0);
}
const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const helper = compile("../lib/cardPhotoRequest.js"), component = compile("../app/components/CardPhoto.js"), creditLink = compile("../app/components/PhotoCreditLink.js");
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let photoCalls = 0, responseMode = "success";
    const photo = { src: "https://photo.test/exact.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/photo/exact", authors: [{ name: "First Author", uri: "https://maps.google.com/contrib/first", photoUri: "https://photo.test/avatar.jpg" }, { name: "Second Author", uri: "https://maps.google.com/contrib/second" }] } };
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/photo") {
        photoCalls++;
        assert.equal(u.searchParams.get("s"), "card");
        assert.equal(u.searchParams.get("fmt"), "json");
        return route.fulfill({ json: responseMode === "miss" ? { src: null, source: "none", credit: null } : responseMode === "broken" ? { ...photo, src: "https://photo.test/broken.jpg" } : photo });
      }
      if (u.pathname === "/broken.jpg") return route.fulfill({ status: 404, body: "Unavailable" });
      if (u.hostname === "photo.test") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#446655"/></svg>' });
      return route.fulfill({ contentType: "text/html", body: `<style>${WF_PLACE_CARD_CSS}</style><div style="height:1400px"></div><article class="wf-place-card" style="position:relative"><button type="button" class="wf-place-card-open" aria-label="Open test venue" style="position:absolute;inset:0;z-index:0;width:100%;height:100%;opacity:0;border:0;padding:0;cursor:pointer;background:transparent"></button><div class="wf-place-card-layout" style="position:relative;z-index:1;pointer-events:none"><div class="wf-place-card-media"><div id="root" style="position:relative;overflow:hidden"></div></div><div id="card-content">Test venue</div></div></article>` });
    });
    await page.goto("https://wayfind.test/");
    assert.equal(await page.evaluate(() => window.innerWidth), width, "achieved viewport matches the tested size");
    await page.addScriptTag({ path: new URL("../node_modules/react/umd/react.development.js", import.meta.url).pathname });
    await page.addScriptTag({ path: new URL("../node_modules/react-dom/umd/react-dom.development.js", import.meta.url).pathname });
    await page.addScriptTag({ content: `window.photoHelpers={};(function(exports){${helper}})(photoHelpers);window.creditLinkModule={};(function(exports){${creditLink}})(creditLinkModule);window.photoModule={};(function(exports,require){${component}})(photoModule,id=>id==='react'?React:id==='react-dom'?ReactDOM:id==='./PhotoCreditLink.js'?creditLinkModule:photoHelpers);window.root=ReactDOM.createRoot(document.getElementById('root'));root.render(React.createElement(photoModule.default,{src:${JSON.stringify(source)},alt:'Test venue',style:{width:'100%',height:'100%',objectFit:'cover'}}));` });
    await page.waitForTimeout(100);
    assert.equal(photoCalls, 0, "offscreen card makes no request");
    await page.locator("#root").scrollIntoViewIfNeeded();
    const button = page.getByRole("button", { name: "View larger photo of Test venue and photographer credit" });
    await button.waitFor();
    assert.equal(await button.evaluate((el) => el.tagName), "IMG", "photo itself opens the viewer");
    assert.equal(await page.getByText("View photo", { exact: true }).count(), 0, "no visible View photo button");
    assert.equal(photoCalls, 1);
    const thumb = await page.locator("#root > img").getAttribute("src");
    await page.evaluate(() => {
      window.parentKeyActivations = 0;
      window.parentClickActivations = 0;
      window.placeOpenActivations = 0;
      document.querySelector(".wf-place-card-open").addEventListener("click", () => window.placeOpenActivations++);
      document.body.addEventListener("click", () => window.parentClickActivations++);
      document.body.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.parentKeyActivations++; }
      });
    });
    const photoCenter = await button.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(photoCenter.x, photoCenter.y);
    assert.equal(await page.evaluate(() => window.placeOpenActivations), 0, "photo pointer click must not pass through to the home card Open button");
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await button.evaluate((el) => getComputedStyle(el).pointerEvents), "auto", "credited photo opts into pointer events inside the home layout");
    assert.ok(await button.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; }), "photo receives hits above the sibling Open button");
    await button.focus();
    assert.notEqual(await button.evaluate((el) => getComputedStyle(el).outlineStyle), "none", "keyboard focus is visible on the photo");
    await page.keyboard.press("Enter");
    await page.locator("dialog[open]").waitFor();
    assert.equal(await page.locator("dialog > img").getAttribute("src"), thumb);
    assert.ok(await page.getByRole("link", { name: "First Author (opens in a new tab)", exact: true }).isVisible());
    assert.ok(await page.getByRole("link", { name: "Second Author (opens in a new tab)", exact: true }).isVisible());
    assert.equal(await page.locator("dialog a[translate=no]").getAttribute("href"), photo.credit.mapsUri);
    assert.equal(photoCalls, 1, "viewer never purchases another photo");
    assert.equal(await page.evaluate(() => window.parentKeyActivations), 0, "viewer controls do not activate the enclosing card");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").count(), 0);
    assert.ok(await button.evaluate((el) => document.activeElement === el), "closing restores focus to photo");
    await page.keyboard.press("Space");
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await button.click();
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.parentKeyActivations), 0);
    assert.equal(await page.evaluate(() => window.parentClickActivations), 0, "photo click does not open enclosing card");
    assert.equal(await page.evaluate(() => window.placeOpenActivations), 0, "all photo activation paths leave home place details closed");
    assert.equal(photoCalls, 1, "reopening keeps the same photo without extra API calls");
    const badge = await page.locator("[data-card-photo-credit] a").boundingBox();
    const bounds = await page.locator("#root").boundingBox();
    assert.ok(badge.x >= bounds.x && badge.x + badge.width <= bounds.x + bounds.width);
    assert.ok(badge.height <= 18, "credit remains a compact single line");
    assert.equal(await page.locator("[data-card-photo-credit] a").evaluate((el) => getComputedStyle(el).fontSize), "12px", "credit preserves Google's minimum text size");
    const content = await page.locator("#card-content").boundingBox();
    await page.mouse.click(content.x + content.width / 2, content.y + content.height / 2);
    assert.equal(await page.evaluate(() => window.placeOpenActivations), 1, "ordinary card content still opens place details");
    assert.equal(await page.locator("dialog").count(), 0, "ordinary card click does not open the photo viewer");
    const render = (id, alt) => page.evaluate(({ id, alt }) => {
      root.render(React.createElement(photoModule.default, { src: "/api/photo?place=" + id, alt, style: { width: "100%", height: "100%", objectFit: "cover" } }));
    }, { id, alt });
    responseMode = "miss";
    await render("ChIJCardPhotoFail0001", "Missing photo");
    await page.getByText("Photo unavailable", { exact: true }).waitFor();
    assert.equal(await page.locator("#root > img").count(), 0);
    assert.equal(await page.locator("[data-card-photo-credit]").count(), 0);
    responseMode = "success";
    await render("ChIJCardPhotoGood0002", "Other photo");
    await page.locator('#root > img[alt="Other photo"]').waitFor();
    await render("ChIJCardPhotoFail0001", "Recovered photo");
    await page.locator('#root > img[alt="Recovered photo"]').waitFor();
    assert.equal(await page.getByText("Photo unavailable", { exact: true }).count(), 0, "a previous failure cannot hide a later successful response");
    responseMode = "broken";
    await render("ChIJCardPhotoBroken03", "Broken photo");
    await page.getByText("Photo unavailable", { exact: true }).waitFor();
    assert.equal(await page.locator("#root > img").count(), 0);
    assert.equal(await page.locator("[data-card-photo-credit]").count(), 0);
    await page.waitForTimeout(100);
    assert.equal(photoCalls, 5, "misses and image failures never retry the paid photo request");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("test-card-photo-viewer: Chromium 390/768/1440 passed: home overlay hit testing, ordinary card click, photo click/Enter/Space, visible focus and restoration, compact credit, same image, all authors, source link, visible failures, no paid retries");
} finally { await browser.close(); }
