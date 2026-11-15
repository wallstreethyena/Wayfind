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
import { fileURLToPath, pathToFileURL } from "node:url";
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

// Owner (Gabe, 2026-11-10): on the place detail sheet the photo credit and the
// commission line are ONE in-flow line directly under the photos. Cards and
// other heroes keep the on-photo line above.
const inline = renderToStaticMarkup(React.createElement(PhotoCredit, { credit, inline: true, style: pinned }));
ok(inline.startsWith("<span data-photo-credit") && inline.includes("Photo: ") && /href="https:\/\/maps\.google\.com\/\?cid=1"/.test(inline), "inline credit is the bare words with the Google Maps link kept");
ok(!/position|background|border-radius|nowrap/.test(inline), "inline credit carries no pin, box, or truncation");

const disclosure = await import(pathToFileURL(abs("lib/affiliateDisclosure.js")).href);
const fh = disclosure.detailCreditCommissionLine("fareharbor");
ok(fh === "Wayfind may earn a commission when you book through FareHarbor, and that never changes our rankings.", "FareHarbor commission line is the exact approved sentence (got: " + fh + ")");
ok(disclosure.detailCreditCommissionLine("VIATOR").includes("through Viator,"), "a known provider is named, case-insensitively");
for (const odd of ["", null, "booking", "constructor", "__proto__", "not-a-partner"]) {
  ok(disclosure.detailCreditCommissionLine(odd).includes("through a partner link,"), "an unknown provider (" + String(odd) + ") gets the generic wording, never a guessed name");
}
ok(!/[\u2013\u2014]/.test(fh) && (fh.match(/[.!?](\s|$)/g) || []).length === 1, "the commission line is one sentence with no dashes");

const detailRaw = readFileSync(abs("app/components/sheets/Detail.js"), "utf8");
// Comments stripped so the position checks cannot match their own explanations.
const detail = detailRaw.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const uses = detail.split("<PhotoCredit").length - 1;
ok(uses === 1, "the place detail sheet renders exactly one photo credit (found " + uses + ")");
ok(!/creditStyle/.test(detail), "the old over-the-photo creditStyle is gone");
ok(/<PhotoCredit inline credit=\{heroCredit\}/.test(detail), "the detail credit is the inline credit inside the combined line");
const media = detail.indexOf("data-detail-photo-media");
const lineAt = detail.indexOf("data-detail-credit-line");
const headline = detail.indexOf("data-detail-headline");
const body = detail.indexOf("data-detail-body");
const at = detail.indexOf("<PhotoCredit");
ok(media > 0 && headline > media && body > headline, "detail sheet still has its hero photo, then the headline, then the text column");
ok(detail.split("data-detail-credit-line").length - 1 === 1, "the detail sheet has exactly one combined credit line");
ok(lineAt > media && lineAt < headline, "the combined credit line sits right under the photos, above the headline");
ok(at > lineAt && at < headline && detail.indexOf("{creditCommission}", lineAt) > at && detail.indexOf("{creditCommission}", lineAt) < headline, "photo credit and commission sentence render inside that one line");
ok(!detail.slice(body).includes("<PhotoCredit"), "the text column under the headline has no photo credit");
ok(/const creditCommission = ftcNearPrimary \? detailCreditCommissionLine\(primaryCta\.provider\) : null;/.test(detail), "the commission sentence reads the same predicate as the near-button disclosure and this sheet's own provider");
ok(/\{ftcNearPrimary && !\(expandedHero && creditCommission\) && <FTCDisclosure \/>\}/.test(detail), "one disclosure per sheet: the near-button line shows only when the credit line is not carrying it (no photo)");
const lineTag = detail.slice(detail.lastIndexOf("<div", lineAt), detail.indexOf(">", lineAt));
ok(!/position|background|borderRadius|nowrap|ellipsis/.test(lineTag) && /fontSize: 12\b/.test(lineTag), "the combined line is plain readable in-flow text: no pin, pill, or truncation");

console.log(`check-photo-credit-under-headline: OK — ${pass} assertions; viewer credit stays plain text, onPhoto credit is the tiny bottom-left line, detail sheet has one credit + commission line under the photos`);
