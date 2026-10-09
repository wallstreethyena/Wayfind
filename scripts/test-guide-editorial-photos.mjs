import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { guidePlaceFigureImage, findEditorialPhotoCredit, findCreditedEditorialCache } from "../lib/guidePlaceFigureImage.js";

const place = { id: "ChIJsampleVenue123456", name: "Sample Venue" };
let freeCalls = 0;
const free = { url: "https://photos.example.org/venue.webp", attributionText: "Venue photographer", attributionUrl: "https://example.org/credit", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
// 2026-10-08 (Maps Terms 3.2.3): guide figures have NO Google lane. The legacy Google deps below are traps:
// if guidePlaceFigureImage ever calls one again (cached photo| rows, wf_photo_credit credits), the guard throws.
const googleTrap = (n) => async () => { throw new Error("RED-PROOF TRIPPED: guidePlaceFigureImage used the retired Google lane dep " + n); };
const legacyGoogleDeps = {
  findCredit: googleTrap("findCredit"),
  findAlternative: googleTrap("findAlternative"),
  findSamePlaceCachedPhoto: googleTrap("findSamePlaceCachedPhoto"),
};
const deps = {
  ...legacyGoogleDeps,
  findFreePhoto: async ({ placeId, width }) => {
    assert.equal(placeId, place.id);
    assert.equal(width, 1200);
    freeCalls++;
    return free;
  },
};
assert.equal(await guidePlaceFigureImage(null, deps), null);
const media = await guidePlaceFigureImage(place, deps);
assert.equal(media.src, free.url);
assert.equal(media.credit, free.attributionText);
assert.equal(media.creditHref, free.attributionUrl);
assert.equal(media.license, free.license);
assert.equal(media.licenseUrl, free.licenseUrl);
assert.equal(freeCalls, 1);
// A venue with no free/owned photo is an honest miss: no cached Google photo, no credit lookup, no /api/photo src.
for (const [label, d] of [["no free photo", { ...legacyGoogleDeps, findFreePhoto: async () => null }], ["free source throws", { ...legacyGoogleDeps, findFreePhoto: async () => { throw Error("offline"); } }], ["no deps at all", {}]]) {
  assert.equal(await guidePlaceFigureImage(place, d), null, "missing venue photo stays absent (" + label + ")");
}
// CONTROL for the trap: the retired exports are inert stubs, so a caller still importing them gets null, not Google data.
assert.equal(await findEditorialPhotoCredit(`places/${place.id}/photos/exact`, place.id, { env: { SUPABASE_URL: "https://test.example", SUPABASE_SERVICE_ROLE_KEY: "x" }, fetchImpl: async () => { throw new Error("RED-PROOF TRIPPED: network"); } }), null);
assert.equal(await findCreditedEditorialCache(place.id, { env: { SUPABASE_URL: "https://test.example", SUPABASE_SERVICE_ROLE_KEY: "x" }, fetchImpl: async () => { throw new Error("RED-PROOF TRIPPED: network"); } }), null);
// A Google-hosted URL on the place record is never an editorial photo, whatever credit text rides along.
assert.equal(await guidePlaceFigureImage({ ...place, photo: "https://lh3.googleusercontent.com/venue", photoAttr: "Owner" }, { findFreePhoto: async () => null }), null, "a Google-hosted place.photo is refused even with a credit");
const credited = await guidePlaceFigureImage({ ...place, photo: free.url, photoAttr: "Owner", photoAttrHref: free.attributionUrl }, deps);
assert.equal(credited.credit, "Owner");
assert.equal(freeCalls, 1, "credited explicit asset requires no lookup");
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
function photoOnlyArticle(source) { return !/<GuidePlaceCard\b/.test(source) && /<GuideFigure\s+role="pick"/.test(source); }
assert.ok(photoOnlyArticle(page), "article recommendations render figures, not discovery cards");
assert.ok(!photoOnlyArticle(page + '<GuidePlaceCard place={place} />'), "red proof: reintroducing the rejected card fails acceptance");
assert.ok(!photoOnlyArticle(page.replaceAll('<GuideFigure role="pick"', '<RemovedFigure role="pick"')), "red proof: dropping the photos fails acceptance");
assert.ok(page.indexOf('<GuideFigure role="pick" image={pickImage}') < page.indexOf('<p style={S.p}>{pick.blurb}</p>'), "recommendation photo precedes prose");


console.log("test-guide-editorial-photos: OK — same-place free/owned media only (no Google lane), honest misses, and photo-first article contract");

// Execute the real figure and photo components, including their actual credit
// markup. Source checks above cover placement; these verify what readers get.
const require = createRequire(import.meta.url);
const caption = await import("../lib/guideCaption.js");
const googlePhotoSrc = await import("../lib/googlePhotoSrc.js");
function compileComponent(file, overrides = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => overrides[name] || require(name) });
  return module.exports;
}
const photoComponent = compileComponent("../app/components/GuidePhoto.js");
const figureComponent = compileComponent("../app/components/GuideFigure.js", {
  "./GuidePhoto": photoComponent,
  "./PhotoCreditLink": compileComponent("../app/components/PhotoCreditLink.js"),
  "../../lib/guideCaption.js": caption,
  "../../lib/googlePhotoSrc.js": googlePhotoSrc,
  "./GuideFigure.module.css": { __esModule: true, default: new Proxy({}, { get: (_t, name) => String(name) }) },
});
const html = renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: media }));
assert.equal((html.match(/<img /g) || []).length, 1);
assert.ok(html.includes('data-guide-figure="pick"'));
assert.ok(html.includes('alt="Sample Venue"'));
assert.ok(html.includes('href="https://example.org/credit"'));
assert.ok(html.includes('Photo: Venue photographer'));
assert.ok(/<a[^>]*href="https:\/\/example\.org\/credit"[^>]*target="_blank"[^>]*rel="[^"]*noopener/.test(html), 'credit opens in a new tab (#1601)');
assert.ok(!html.includes('wf-place-card'));
assert.ok(!/googleusercontent|\/api\/photo/.test(html), "the rendered guide figure carries no Google photo URL and no /api/photo src");
assert.equal(renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: null })), "");
// The figure still refuses an uncredited place-photo proxy (component-level contract, unchanged).
assert.equal(renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: { src: "/api/photo?ref=x&g=2&w=1200", alt: "x" } })), "", "a plain uncredited /api/photo image (no no-spend marker) is still refused");
assert.equal(renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: { src: "/api/photo?ref=x&w=1200", noSpendCached: true, alt: "x" } })), "", "the marker alone, without nospend=1 in the URL, never unlocks the figure");
console.log("test-guide-editorial-photos: real render OK — one venue photo, linked author/provider credits, no place card, and no fake image on a miss");

const freeHtml = renderToStaticMarkup(React.createElement(figureComponent.default, { image: media }));
assert.ok(freeHtml.includes("CC BY-SA 4.0") && freeHtml.includes(free.licenseUrl), "free-photo license and rights link survive into visible attribution");
console.log("test-guide-editorial-photos: free-license rendering OK");
