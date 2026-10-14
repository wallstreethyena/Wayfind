#!/usr/bin/env node
// scripts/check-photo-credit-under-headline.mjs
//
// Owner rule (Gabe, 2026-10-13, GLOBAL): the "Photo: <author> · Google Maps"
// credit must never sit on top of the picture and must never have a black/dark
// pill behind it. It shows as plain text directly UNDER the headline (the
// place name). Before this, the place detail sheet pinned the credit to the
// top of the hero photo in a dark rounded pill (PhotoCredit + creditStyle).
//
// RENDER: compiles the REAL app/components/PhotoCredit.js and renders it with a
// caller style that tries to pin it over a photo with a dark background; the
// output must still be static, background-free text.
// SOURCE: the detail sheet renders the credit after the hero closes (under the
// headline), never inside the hero photo block.

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
ok(html.includes("position:static"), "the credit is forced into normal page flow (position:static) even when a caller asks for absolute");
ok(!/position:absolute|position:fixed/.test(html), "the credit can never be pinned over a photo");
ok(!/(^|[;"])\s*(top|bottom|left|right|inset|z-index):/.test(html.replace(/margin-top/g, "")), "no offsets/z-index that would place it over the photo");
ok(!/background/.test(html), "no background, pill or dark box behind the credit");
ok(!/border-radius|padding:/.test(html), "no pill shape (rounded box / padding)");
ok(html.includes("color:#999") && html.includes("margin-top:-6px"), "non-layout caller styles (colour, spacing) still pass through");
ok(renderToStaticMarkup(React.createElement(PhotoCredit, { credit: null })) === "", "no credit renders nothing");

const detail = readFileSync(abs("app/components/sheets/Detail.js"), "utf8");
const uses = detail.split("<PhotoCredit").length - 1;
ok(uses === 1, "the place detail sheet renders exactly one photo credit (found " + uses + ")");
ok(!/creditStyle/.test(detail), "the old over-the-photo creditStyle is gone");
const headline = detail.indexOf("{detail.name}</div>");
const basics = detail.indexOf("{/* 1. Basics */}");
const at = detail.indexOf("<PhotoCredit");
ok(headline > 0 && basics > headline, "detail sheet still has its hero headline followed by the content area");
ok(at > headline && at < basics, "the credit renders after the hero headline, at the top of the content area — directly under the headline, not on the photo");

console.log(`check-photo-credit-under-headline: OK — ${pass} assertions; real PhotoCredit RENDERED as plain text under the headline, never over the photo`);
