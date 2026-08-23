#!/usr/bin/env node
// scripts/preview-sponsored-card.mjs — HAND-RUN, not a guard.
//
// Renders the real SponsoredPlaceCard at phone and narrow-phone widths over the
// advertiser's real photograph and writes PNGs to /tmp. A paid card is the one
// surface where "it probably looks fine" is not good enough, and the layout
// guards measure boxes, not taste.
//
//   node scripts/preview-sponsored-card.mjs
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { sponsoredPlaceById, hydrateSponsoredPlace } from "../lib/sponsoredPlaces.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await loadComponent(join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT);
const Card = mod.default || mod;

const rio = sponsoredPlaceById("rio-body-wax-gastonia");
const pick = hydrateSponsoredPlace(rio, { lat: 35.2621, lng: -81.1873 });
// The proxy needs a running server; point the preview straight at the Google
// media endpoint with the local server key so the art is the real art.
const key = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
const local = { ...pick, photo: key ? `https://places.googleapis.com/v1/${rio.photoRef}/media?maxWidthPx=760&key=${key}` : pick.photo };
const html = renderToStaticMarkup(React.createElement(Card, { pick: local }));

const page = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{margin:0;background:#040810;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#F1F5F9}
  .wrap{padding:14px}
</style><div class="wrap">${html}</div>`;

const { chromium } = await import("playwright");
const launchOpts = (() => {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  return {};
})();
const browser = await chromium.launch(launchOpts);
for (const w of [390, 340, 430]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(page, { waitUntil: "networkidle" });
  const el = await p.$("section");
  await el.screenshot({ path: `/tmp/sponsored-card-${w}.png` });
  const box = await el.boundingBox();
  console.log(`${w}px -> /tmp/sponsored-card-${w}.png  (card ${Math.round(box.width)}x${Math.round(box.height)})`);
  await ctx.close();
}
await browser.close();
