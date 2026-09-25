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
let cacheCalls = 0;
const free = { url: "https://photos.example.org/venue.webp", attributionText: "Venue photographer", attributionUrl: "https://example.org/credit", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
const deps = {
  findCredit: async () => ({ author_name: "Actual photographer", author_uri: "https://example.org/author", maps_uri: "https://maps.google.com/photo" }),
  findFreePhoto: async ({ placeId, width }) => {
    assert.equal(placeId, place.id);
    assert.equal(width, 1200);
    freeCalls++;
    return free;
  },
  findSamePlaceCachedPhoto: async () => { cacheCalls++; return { uri: "https://lh3.googleusercontent.com/venue", ttlSeconds: 3600, ref: `places/${place.id}/photos/exact` }; },
};
assert.equal(await guidePlaceFigureImage(null, deps), null);
const media = await guidePlaceFigureImage(place, deps);
assert.equal(media.src, free.url);
assert.equal(media.credit, free.attributionText);
assert.equal(media.creditHref, free.attributionUrl);
assert.equal(media.license, free.license);
assert.equal(media.licenseUrl, free.licenseUrl);
assert.equal(cacheCalls, 0, "credited permanent photo wins over expiring Google cache");
assert.equal(freeCalls, 1);
const cached = await guidePlaceFigureImage(place, { ...deps, findFreePhoto: async () => null });
assert.equal(cached.src, "https://lh3.googleusercontent.com/venue");
assert.equal(cached.credit, "Actual photographer");
assert.equal(cached.providerHref, "https://maps.google.com/photo");
assert.equal(await guidePlaceFigureImage(place, { findFreePhoto: async () => null, findSamePlaceCachedPhoto: async () => null }), null, "missing venue photo stays absent");
assert.equal(await guidePlaceFigureImage(place, { findFreePhoto: async () => { throw Error("offline"); } }), null);
assert.equal(await guidePlaceFigureImage(place, { findSamePlaceCachedPhoto: async () => ({ uri: "https://lh3.googleusercontent.com/expired", ttlSeconds: 899 }) }), null, "reject a photo expiring before article refresh");
assert.equal((await guidePlaceFigureImage(place, { ...deps, findFreePhoto: async () => { throw Error("free source unavailable"); } } )).credit, "Actual photographer", "one unavailable free source must not disable an independent cached source");
const credited = await guidePlaceFigureImage({ ...place, photo: free.url, photoAttr: "Owner", photoAttrHref: free.attributionUrl }, deps);
assert.equal(credited.credit, "Owner");
assert.equal(freeCalls, 1, "credited explicit asset requires no lookup");
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
function photoOnlyArticle(source) { return !/<GuidePlaceCard\b/.test(source) && /<GuideFigure\s+role="pick"/.test(source); }
assert.ok(photoOnlyArticle(page), "article recommendations render figures, not discovery cards");
assert.ok(!photoOnlyArticle(page + '<GuidePlaceCard place={place} />'), "red proof: reintroducing the rejected card fails acceptance");
assert.ok(!photoOnlyArticle(page.replaceAll('<GuideFigure role="pick"', '<RemovedFigure role="pick"')), "red proof: dropping the photos fails acceptance");
assert.ok(page.indexOf('<GuideFigure role="pick" image={pickImage}') < page.indexOf('<p style={S.p}>{pick.blurb}</p>'), "recommendation photo precedes prose");


const ref = `places/${place.id}/photos/exact`;
const creditRow = { photo_name: ref, place_id: place.id, author_name: "Photographer", author_uri: "https://example.org/author", maps_uri: "https://maps.google.com/photo", expires_at: new Date(3600000).toISOString() };
const creditDeps = { now: 0, env: { SUPABASE_URL: "https://test.example", SUPABASE_SERVICE_ROLE_KEY: "test-only" }, fetchImpl: async () => ({ ok: true, json: async () => [creditRow] }) };
assert.equal((await findEditorialPhotoCredit(ref, place.id, creditDeps)).author_name, "Photographer");
assert.equal(await findEditorialPhotoCredit(ref, "AnotherPlace", creditDeps), null);
assert.equal(await findEditorialPhotoCredit(ref, place.id, { ...creditDeps, fetchImpl: async () => ({ ok: true, json: async () => [{ ...creditRow, photo_name: ref + "different" }] }) }), null);
assert.equal(await findEditorialPhotoCredit(ref, place.id, { ...creditDeps, now: 3600000 }), null);
assert.equal(await guidePlaceFigureImage(place, { ...deps, findFreePhoto: async () => null, findCredit: async () => null }), null, "missing exact photographer credit fails closed");

console.log("test-guide-editorial-photos: OK — same-place free/cache media, exact photographer credits, expiry, honest misses, and photo-first article contract");

// Execute the real figure and photo components, including their actual credit
// markup. Source checks above cover placement; these verify what readers get.
const require = createRequire(import.meta.url);
const caption = await import("../lib/guideCaption.js");
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
  "../../lib/guideCaption.js": caption,
  "./GuideFigure.module.css": { __esModule: true, default: new Proxy({}, { get: (_t, name) => String(name) }) },
});
const html = renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: cached }));
assert.equal((html.match(/<img /g) || []).length, 1);
assert.ok(html.includes('data-guide-figure="pick"'));
assert.ok(html.includes('alt="Sample Venue"'));
assert.ok(html.includes('href="https://example.org/author"'));
assert.ok(html.includes('Photo: Actual photographer'));
assert.ok(html.includes('href="https://maps.google.com/photo"'));
assert.ok(!html.includes('wf-place-card'));
assert.equal(renderToStaticMarkup(React.createElement(figureComponent.default, { role: "pick", image: null })), "");
console.log("test-guide-editorial-photos: real render OK — one venue photo, linked author/provider credits, no place card, and no fake image on a miss");

const olderRef = `places/${place.id}/photos/older`;
const newerRef = `places/${place.id}/photos/newer`;
const olderCredit = { ...creditRow, photo_name: olderRef };
const cacheRows = [
  { k: `photo|${newerRef}|1200`, v: { uri: "https://lh3.googleusercontent.com/newer" }, exp: new Date(7200000).toISOString(), wrote_at: new Date(0).toISOString() },
  { k: `photo|${olderRef}|1200`, v: { uri: "https://lh3.googleusercontent.com/older" }, exp: new Date(3600000).toISOString(), wrote_at: new Date(0).toISOString() },
];
let boundedReads = 0;
const fallbackDeps = { ...creditDeps, probeUri: async () => "alive", fetchImpl: async (input, options) => {
  boundedReads++;
  assert.ok(!options.method || options.method === "GET", "alternate selection is read-only");
  const url = String(input);
  return { ok: true, json: async () => url.includes("wf_photo_credit") ? [olderCredit] : cacheRows };
} };
const alternate = await findCreditedEditorialCache(place.id, fallbackDeps);
assert.equal(alternate.src, "https://lh3.googleusercontent.com/older", "newer uncredited cache row cannot mask older credited photo");
assert.equal(alternate.credit, olderCredit.author_name);
assert.equal(boundedReads, 2, "one bounded credit query and one bounded cache query, no retry loop");
const viaArticle = await guidePlaceFigureImage(place, { findSamePlaceCachedPhoto: async () => ({ ref: newerRef, uri: "https://lh3.googleusercontent.com/newer", ttlSeconds: 7200 }), findCredit: async () => null, findAlternative: async (id) => findCreditedEditorialCache(id, fallbackDeps) });
assert.equal(viaArticle.src, alternate.src);
const freeHtml = renderToStaticMarkup(React.createElement(figureComponent.default, { image: media }));
assert.ok(freeHtml.includes("CC BY-SA 4.0") && freeHtml.includes(free.licenseUrl), "free-photo license and rights link survive into visible attribution");
console.log("test-guide-editorial-photos: alternative credited cache and free-license rendering OK");
