// scripts/test-og-every-path.mjs — 2026-11-27 (owner: "custom OpenGraph images
// for every path … rich, viral previews … without degrading page load").
//
//   1. A page with no image of its own gets a card with ITS OWN headline
//      (/api/og?t=…), never the one shared generic card.
//   2. The share card RENDERS (real Satori, real fonts) with the owner's logo
//      file: the PNG with the logo differs from the PNG without it, so the logo
//      is genuinely painted, and both are real images (> 5 KB).
//   3. The card is cached at the edge, not built per page view.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (label, fn) => Promise.resolve().then(fn).then(() => { n++; }, (e) => { console.error(`test-og-every-path: FAIL - ${label}\n  ${e.message}`); process.exit(1); });

const sm = await loadComponent(path.join(ROOT, "lib/socialMeta.js"), ROOT);

await ok("a page with no image gets a card with its own headline", () => {
  const m = sm.socialMeta({ title: "Best Things to Do in Tampa, FL (2026) | Real Reviews", description: "d", url: "u" });
  const img = m.openGraph.images[0];
  assert.equal(img.url, "https://www.gowayfind.com/api/og?t=" + encodeURIComponent("Best Things to Do in Tampa, FL"));
  assert.equal(m.twitter.images[0], img.url);
  assert.equal(img.width, 1200);
  assert.equal(img.height, 630);
});
await ok("headline cleanup drops the brand tail and the year tag only", () => {
  assert.equal(sm.cardHeadline("Big Show at Amalie Arena · Wayfind Events"), "Big Show at Amalie Arena");
  assert.equal(sm.cardHeadline("Trending in Bradenton | Wayfind"), "Trending in Bradenton");
  assert.equal(sm.cardHeadline("Wayfind"), "");
  assert.ok(sm.cardHeadline("x ".repeat(80)).length <= 90);
});
await ok("an explicit image still wins; no title falls back to the brand card", () => {
  assert.equal(sm.socialMeta({ title: "T", image: "https://www.gowayfind.com/api/og/hero?kind=place&id=1" }).openGraph.images[0].url, "https://www.gowayfind.com/api/og/hero?kind=place&id=1");
  assert.equal(sm.socialMeta({ title: "" }).openGraph.images[0].url, "https://www.gowayfind.com/api/og");
});

// ── 2. real render with the owner's logo ────────────────────────────────────
const cardPath = path.join(ROOT, "app/api/og/card.jsx");
// next/og resolves only through Next's bundler; plain node needs the .js file.
const card = await loadComponent(cardPath, ROOT, { sourceOverrides: new Map([[cardPath, readFileSync(cardPath, "utf8").replace('from "next/og"', 'from "next/og.js"')]]) });
const copy = await loadComponent(path.join(ROOT, "lib/shareCardCopy.js"), ROOT);
const buf = (p) => { const b = readFileSync(path.join(ROOT, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const fontBuffers = ["600", "700", "900"].map((w) => buf(`app/api/og/fonts/Archivo-${w}-Latin.ttf`));
const logoBuffer = buf("public/brand/wayfind/derived/wayfind-logo-white-og.png");
const render = async (model, logo) => {
  const res = await card.shareCardResponse(model, { fontBuffers, logoBuffer: logo });
  return { bytes: Buffer.from(await res.arrayBuffer()), cache: res.headers.get("cache-control"), type: res.headers.get("content-type") };
};
const model = () => copy.listModel({ title: "Best Things to Do in Tampa, FL", loc: "", n: "" });
const withLogo = await render(model(), logoBuffer);
await ok("the card renders a real PNG with the logo", () => {
  assert.ok(withLogo.bytes.length > 5000, `only ${withLogo.bytes.length} bytes`);
  assert.equal(withLogo.bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(withLogo.type, "image/png");
});
await ok("the card is edge-cached, not rebuilt per page view", () => {
  assert.match(withLogo.cache, /s-maxage=\d+/);
  assert.match(withLogo.cache, /stale-while-revalidate=\d+/);
});
// LOGO_BYTES is kept for the life of the module, so the no-logo control loads a
// fresh copy of the card module.
const bare = await loadComponent(cardPath, ROOT, { sourceOverrides: new Map([[cardPath, readFileSync(cardPath, "utf8").replace('from "next/og"', 'from "next/og.js"').replace(/new URL\("[^"]+\.png", import\.meta\.url\)/, 'new URL("file:///nonexistent-logo.png")')]]) });
const noLogo = await (async () => { const res = await bare.shareCardResponse(model(), { fontBuffers, logoBuffer: null }); return Buffer.from(await res.arrayBuffer()); })();
await ok("the logo is actually painted (the card differs without it), and a missing logo still renders", () => {
  assert.ok(noLogo.length > 5000, "a card without logo bytes must still render, never a blank image");
  const h = (b) => createHash("sha256").update(b).digest("hex");
  assert.notEqual(h(withLogo.bytes), h(noLogo), "the logo bytes changed nothing in the rendered card");
});

console.log(`test-og-every-path: OK - ${n} checks (titled fallback card for every page without its own image; real render with the owner's logo, ${withLogo.bytes.length} bytes; edge cache header)`);
