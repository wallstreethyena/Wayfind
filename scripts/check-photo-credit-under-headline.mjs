#!/usr/bin/env node
// scripts/check-photo-credit-under-headline.mjs
//
// Owner rule (Gabe, 2026-11-04, GLOBAL): a photo credit on a card, hero, or
// gallery is a tiny line pinned to the bottom left of the photo. White at
// about 60%, soft shadow, no pill, badge, or background. The Google Maps
// attribution stays a link. The lightbox and full photo viewer keep a readable
// static line, and a caller cannot pin THAT line or put a box behind it.
//
// RENDER: compiles the REAL app/components/PhotoCredit.js. The viewer path
// drops absolute/background. The onPhoto path is the bottom-left line.
// SOURCE: the place detail sheet renders that line inside the hero photo,
// not in the text column under the headline.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const abs = (p) => path.join(ROOT, p);
let pass = 0;
const ok = (cond, msg) => { if (!cond) { console.error("check-photo-credit-under-headline: FAIL — " + msg); process.exit(1); } pass++; };

const code = ts.transpileModule(readFileSync(abs("app/components/PhotoCredit.js"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, require }, { filename: abs("app/components/PhotoCredit.js") });
const PhotoCredit = mod.exports.default;

const credit = { source: "google", name: "Sarasota Fairgrounds", uri: "https://maps.google.com/contrib/1", mapsUri: "https://maps.google.com/?cid=1" };
const pinned = { position: "absolute", top: 60, left: 12, right: 64, bottom: "auto", zIndex: 7, background: "rgba(13,17,23,.72)", backgroundColor: "#000", color: "#999", marginTop: -6 };
const html = renderToStaticMarkup(React.createElement(PhotoCredit, { credit, style: pinned }));

ok(html.includes("Photo: ") && html.includes("Sarasota Fairgrounds") && html.includes("Google Maps"), "the credit still renders its full visible text (positive control)");
ok(/href="https:\/\/maps\.google\.com\/\?cid=1"/.test(html) && /target="_blank"/.test(html), "the Google Maps attribution stays a working link");
ok(html.includes("position:static"), "the viewer credit stays in normal flow even when a caller asks for absolute");
ok(!/position:absolute|position:fixed/.test(html), "the viewer credit cannot be pinned");
ok(!/(^|[;"])\s*(top|bottom|left|right|inset|z-index):/.test(html.replace(/margin-top/g, "")), "the viewer credit has no offsets or z-index");
ok(!/background/.test(html), "the viewer credit has no background, pill, or dark box");
ok(!/border-radius|padding:/.test(html), "the viewer credit has no pill shape");
ok(html.includes("color:#999") && html.includes("margin-top:-6px"), "non-layout caller styles (colour, spacing) still pass through");
ok(renderToStaticMarkup(React.createElement(PhotoCredit, { credit: null })) === "", "no credit renders nothing");

const onPhoto = renderToStaticMarkup(React.createElement(PhotoCredit, { credit, onPhoto: true, style: pinned }));
ok(onPhoto.includes("Photo: ") && onPhoto.includes("Google Maps") && /href="https:\/\/maps\.google\.com\/\?cid=1"/.test(onPhoto), "onPhoto keeps the Google Maps attribution link");
ok(onPhoto.includes("position:absolute") && onPhoto.includes("left:6px") && onPhoto.includes("bottom:6px"), "onPhoto pins the credit to the bottom left of the photo");
ok(onPhoto.includes("font-size:9.5px") && onPhoto.includes("rgba(255,255,255,.6)"), "onPhoto is the tiny muted line");
ok(onPhoto.includes("background:transparent") && !/#000|rgba\(13,17,23/.test(onPhoto), "onPhoto drops a caller background or pill");
ok(!/border-radius/.test(onPhoto), "onPhoto has no rounded chip");

const detail = readFileSync(abs("app/components/sheets/Detail.js"), "utf8");
const uses = detail.split("<PhotoCredit").length - 1;
ok(uses === 1, "the place detail sheet renders exactly one photo credit (found " + uses + ")");
ok(!/creditStyle/.test(detail), "the old over-the-photo creditStyle is gone");
ok(/<PhotoCredit onPhoto /.test(detail), "the detail credit uses the on-photo line");
const media = detail.indexOf("data-detail-photo-media");
const body = detail.indexOf("data-detail-body");
const at = detail.indexOf("<PhotoCredit");
ok(media > 0 && body > media, "detail sheet still has its hero photo before the text column");
ok(at > media && at < body, "the credit renders inside the hero photo, not in the text column");
ok(!detail.slice(body).includes("<PhotoCredit"), "the text column under the headline has no photo credit");

console.log(`check-photo-credit-under-headline: OK — ${pass} assertions; viewer credit stays plain text, onPhoto credit is the tiny bottom-left line`);
