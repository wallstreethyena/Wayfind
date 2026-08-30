#!/usr/bin/env node
// scripts/check-datenight-rail-uncropped.mjs — Date Night rail shows the FULL poster.
//
// THE INCIDENT (owner iPhone, Parrish, after #1031 / 1569b3fd). Cover-fitting
// a non-9:16 owner poster into the 760×1350 ladder + .wf8-tim object-fit:cover
// clipped the left-aligned type.
//
// FOUNDER LOCK (2026-08-30): the card is the 1086×1448 Adobe DATE NIGHT
// poster (wayfind / DATE NIGHT / within 27 miles / Impress. Every time.).
// BEST NIGHT / EVERY DETAIL and TONIGHT'S MOVE / icon-row are discarded.
//
// THE FIX is Date Night only. Other posters stay 9:16 + cover. This guard
// executes the sizes it can (locked PNG, 760.jpg, railArtSize) and pins the
// CSS/JS positions that keep the tile from covering. A comment that mentions
// "contain" does not pass.
//
// #1032 set a Date Night-only --wf8-ratio:0.75 so the tile BOX matched the
// 3:4 poster. Same width + shorter aspect = a shorter card than Tonight /
// Worth the Drive. The TILE BOX is now the shared 9:16; contain letterboxes
// the poster inside it. This file COMPUTES both boxes and requires them
// equal. Grepping "0.75 is gone" is not that proof.

import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { railArtSize, RAIL_ART_DEFAULT_SIZE, RAIL_ART_V } from "../lib/rails.js";
import { WF_RAIL_MENU_CSS } from "../app/components/railMenuCss.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error("  FAIL:", m)); };
const sha = (b) => createHash("sha256").update(b).digest("hex");

function pngSize(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error("not a PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error("not a JPEG");
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  throw new Error("JPEG has no SOF");
}

const LOCKED = "tmp/datenight-final-adobe.png";
const SRC = "art/rail-sources/datenight.png";
const OWNER = "public/cards/date-night-owner.png";
const JPG = "public/cards-v8/datenight-760.jpg";

ok(existsSync(join(ROOT, LOCKED)), `positive control: ${LOCKED} is present`);
ok(existsSync(join(ROOT, SRC)), `positive control: ${SRC} is present`);
ok(existsSync(join(ROOT, OWNER)), `positive control: ${OWNER} is present`);
ok(existsSync(join(ROOT, JPG)), `positive control: ${JPG} is present`);

const lockedBuf = readFileSync(join(ROOT, LOCKED));
const srcBuf = readFileSync(join(ROOT, SRC));
const ownerBuf = readFileSync(join(ROOT, OWNER));
const jpgBuf = readFileSync(join(ROOT, JPG));
const locked = pngSize(lockedBuf);
const src = pngSize(srcBuf);
const owner = pngSize(ownerBuf);
const jpg = jpegSize(jpgBuf);

ok(locked.width === 1086 && locked.height === 1448,
  `founder lock is the 1086×1448 DATE NIGHT Adobe poster (got ${locked.width}×${locked.height})`);
ok(!(src.width === 1024 && src.height === 1536),
  "BEST NIGHT / EVERY DETAIL (1024×1536) is discarded — not the rail source");
ok(src.width === locked.width && src.height === locked.height,
  `rail source is the locked frame (got ${src.width}×${src.height})`);
ok(owner.width === locked.width && owner.height === locked.height,
  `/date-night hero PNG is the same full frame (got ${owner.width}×${owner.height})`);
ok(sha(srcBuf) === sha(lockedBuf),
  "art/rail-sources/datenight.png is byte-identical to the locked Adobe PNG");
ok(sha(ownerBuf) === sha(lockedBuf),
  "public/cards/date-night-owner.png is byte-identical to the locked Adobe PNG");

const srcAspect = src.width / src.height;
const jpgAspect = jpg.width / jpg.height;
ok(Math.abs(jpgAspect - srcAspect) < 0.01,
  `datenight-760.jpg must keep the source aspect ${srcAspect.toFixed(4)} — cover-fit to 9:16 is the crop (got ${jpg.width}×${jpg.height} = ${jpgAspect.toFixed(4)})`);
ok(jpg.height !== 1350 && jpg.height !== 1140,
  `datenight-760.jpg is not a 9:16 (1350) or leftover 2:3 (1140) crop (got ${jpg.height})`);
ok(jpg.width === 760,
  `the 760w rung is still 760 wide so RAIL_ART_WIDTHS stay honest (got ${jpg.width})`);

const box = railArtSize("datenight");
ok(box.width === jpg.width && box.height === jpg.height,
  `railArtSize("datenight") matches the 760.jpg box — executed, got ${box.width}×${box.height} vs jpg ${jpg.width}×${jpg.height}`);
ok(Math.abs(box.width / box.height - srcAspect) < 0.01,
  "railArtSize Date Night matches the source aspect, not the 9:16 default");
ok(RAIL_ART_DEFAULT_SIZE.width === 760 && RAIL_ART_DEFAULT_SIZE.height === 1350,
  "the default ladder is still 760×1350 — Date Night is the exception, not a global restyle");
ok(railArtSize("tonight").height === 1350 && railArtSize("events").height === 1350
  && railArtSize("drive").height === 1350 && railArtSize("family").height === 1350,
  "Tonight, Events, Worth the Drive, and Family stay on the default box");

const css = strip(read("app/components/railMenuCss.js"));
ok(typeof WF_RAIL_MENU_CSS === "string" && WF_RAIL_MENU_CSS.includes(".wf8-tile") && /--wf8-ratio:/.test(WF_RAIL_MENU_CSS),
  "PROBE: WF_RAIL_MENU_CSS exported the shipped rail stylesheet");

function sharedRatio(src) {
  const m = src.match(/\.wf8\{[^}]*--wf8-ratio:([0-9.]+)/);
  return m ? Number(m[1]) : null;
}
function tileRatioOverride(src, id) {
  const m = src.match(new RegExp(`\\.wf8-tile\\[data-id="${id}"\\]\\{([^}]+)\\}`));
  if (!m) return null;
  const r = m[1].match(/--wf8-ratio:([0-9.]+)/);
  return r ? Number(r[1]) : null;
}
function tileBox(twPx, ratio) {
  return { width: twPx, height: twPx / ratio };
}

const SHARED_RATIO = sharedRatio(WF_RAIL_MENU_CSS);
ok(SHARED_RATIO === 0.5625,
  `the shared --wf8-ratio is still 9:16 (0.5625) — got ${SHARED_RATIO}`);
ok(/\.wf8-tile\{[^}]*width:var\(--wf8-tw\)[^}]*height:calc\(var\(--wf8-tw\) \/ var\(--wf8-ratio\)\)/.test(WF_RAIL_MENU_CSS.replace(/\n\s*/g, "")),
  "PROBE: tile height is computed from --wf8-tw / --wf8-ratio — the formula this file executes");

const dnRatio = tileRatioOverride(WF_RAIL_MENU_CSS, "datenight") ?? SHARED_RATIO;
ok(tileRatioOverride(WF_RAIL_MENU_CSS, "datenight") == null,
  "Date Night does not override --wf8-ratio — that shorter aspect is the live size bug");
ok(dnRatio === SHARED_RATIO,
  `Date Night tile ratio equals the shared ${SHARED_RATIO} (got ${dnRatio})`);
ok(tileRatioOverride(WF_RAIL_MENU_CSS, "tonight") == null && tileRatioOverride(WF_RAIL_MENU_CSS, "drive") == null
  && tileRatioOverride(WF_RAIL_MENU_CSS, "events") == null && tileRatioOverride(WF_RAIL_MENU_CSS, "family") == null,
  "Tonight / Worth the Drive / Events / Family do not carry a Date Night ratio override");

for (const tw of [300, 340, 440]) {
  const shared = tileBox(tw, SHARED_RATIO);
  const dn = tileBox(tw, dnRatio);
  const tonight = tileBox(tw, tileRatioOverride(WF_RAIL_MENU_CSS, "tonight") ?? SHARED_RATIO);
  const drive = tileBox(tw, tileRatioOverride(WF_RAIL_MENU_CSS, "drive") ?? SHARED_RATIO);
  ok(shared.width > 0 && dn.width > 0 && shared.height > 0 && dn.height > 0,
    `PROBE: both sides of the ${tw}px box comparison are non-empty`);
  ok(dn.width === tonight.width && dn.height === tonight.height,
    `at ${tw}px tile width, Date Night ${dn.width}×${dn.height} must match Tonight ${tonight.width}×${tonight.height}`);
  ok(dn.width === drive.width && dn.height === drive.height,
    `at ${tw}px tile width, Date Night ${dn.width}×${dn.height} must match Worth the Drive ${drive.width}×${drive.height}`);
  ok(dn.width === shared.width && dn.height === shared.height,
    `at ${tw}px tile width, Date Night uses the shared box ${shared.width}×${shared.height} (got ${dn.width}×${dn.height})`);
}

const dnImg = css.match(/\.wf8-tile\[data-id="datenight"\] \.wf8-tim\{[^}]+\}/);
ok(!!dnImg, "positive control: the Date Night img rule is a real selector");
ok(!!dnImg && /object-fit:contain/.test(dnImg[0]),
  "Date Night img is object-fit:contain — cover is what clipped the left edge");
ok(!!dnImg && !/object-fit:cover/.test(dnImg[0]),
  "Date Night img must not also set cover (contain then cover is still a crop)");
ok(/\.wf8-tim\{[^}]*object-fit:cover/.test(css),
  "the shared .wf8-tim rule is still cover — other posters are unchanged");
ok(!/\.wf8-tile\[data-id="(?:tonight|events|drive|family)"\]/.test(css),
  "no other named poster received a Date Night aspect/contain override");
ok(!/--wf8-ratio:0\.75/.test(css) && !/--wf8-ratio:0\.666667/.test(css),
  "neither the #1032 3:4 ratio nor the leftover 2:3 ratio is on any rail tile");

const rail = strip(read("app/components/DaypartRail.js"));
ok(/railArtSize\(id\)/.test(rail),
  "DaypartRail CALLS railArtSize(id) — a string in a comment is not a reserved box");
ok(/width=\{artBox\.width\}/.test(rail) && /height=\{artBox\.height\}/.test(rail),
  "the tile <img> uses the size railArtSize returned, in the width/height props");

const railsSrc = strip(read("lib/rails.js"));
ok(/(?:export const)\s+RAIL_ART_V\s*=\s*"14"/.test(railsSrc) && RAIL_ART_V === "14",
  `RAIL_ART_V is 14 so cached BEST NIGHT crops cannot survive (declared + executed, got ${RAIL_ART_V})`);

const make = strip(read("scripts/make-rail-art.mjs"));
ok(/preserveFrame/.test(make) && /--preserve-frame/.test(read("scripts/make-rail-art.mjs")),
  "make-rail-art still has the --preserve-frame path Date Night was rebuilt with");
ok(/preserveFrame\s*\?\s*"fill"\s*:\s*"cover"/.test(make),
  "preserve-frame resamples with fill (source aspect), not cover (the crop)");

const intent = strip(read("lib/intentPages.js"));
const dnArt = [...intent.matchAll(/art:\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => /date-night/.test(p));
ok(dnArt.length >= 1 && dnArt.every((p) => p === "/cards/date-night-owner.png"),
  `/date-night hero uses date-night-owner.png (the locked poster), not the AdobeStock jpeg (got ${JSON.stringify(dnArt)})`);
ok(!/date-night-adobestock-190984224/.test(intent),
  "/date-night does not point at the old AdobeStock jpeg");

// Layout: inject the shipped CSS and measure the boxes the browser computes.
// Formula equality above is the always-on lock. This is the same question
// asked of getBoundingClientRect at the 390px phone the founder used.
{
  let chromium = null;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    try { ({ chromium } = await import("@playwright/test")); } catch { chromium = null; }
  }
  function resolveChromium() {
    if (!chromium) return null;
    try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
    const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    if (existsSync(cloud)) return { executablePath: cloud };
    if (process.platform === "darwin") return {};
    return null;
  }
  const launchOpts = resolveChromium();
  if (!launchOpts) {
    console.log("  (Chromium layout measure skipped — no browser; formula boxes above still ran)");
  } else {
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${WF_RAIL_MENU_CSS}</style></head>
<body style="margin:0;background:#040810">
<div class="wf8" style="width:390px">
  <div class="wf8-track">
    <div class="wf8-tile" data-id="tonight"><img class="wf8-tim" alt="" width="760" height="1350"></div>
    <div class="wf8-tile" data-id="datenight"><img class="wf8-tim" alt="" width="760" height="1013"></div>
    <div class="wf8-tile" data-id="drive"><img class="wf8-tim" alt="" width="760" height="1350"></div>
  </div>
</div>
</body></html>`;
    const tmp = mkdtempSync(join(ROOT, ".wf-dn-tile-"));
    const pagePath = join(tmp, "tiles.html");
    writeFileSync(pagePath, fixture);
    const browser = await chromium.launch(launchOpts);
    try {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
      await page.goto("file://" + pagePath, { waitUntil: "load" });
      const innerWidth = await page.evaluate(() => window.innerWidth);
      ok(innerWidth === 390, `PROBE: measured viewport is 390px, not a clamped request (got ${innerWidth})`);
      const measured = await page.evaluate(() => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        };
        const fit = (el) => el ? getComputedStyle(el).objectFit : null;
        return {
          tonight: box(document.querySelector('.wf8-tile[data-id="tonight"]')),
          datenight: box(document.querySelector('.wf8-tile[data-id="datenight"]')),
          drive: box(document.querySelector('.wf8-tile[data-id="drive"]')),
          dnFit: fit(document.querySelector('.wf8-tile[data-id="datenight"] .wf8-tim')),
          tonightFit: fit(document.querySelector('.wf8-tile[data-id="tonight"] .wf8-tim')),
        };
      });
      ok(measured.tonight && measured.datenight && measured.drive,
        "PROBE: Tonight, Date Night, and Worth the Drive tiles all rendered");
      ok(measured.tonight.w > 0 && measured.datenight.w > 0 && measured.drive.w > 0
        && measured.tonight.h > 0 && measured.datenight.h > 0 && measured.drive.h > 0,
        `PROBE: measured boxes are non-empty (dn ${measured.datenight.w}×${measured.datenight.h})`);
      ok(Math.abs(measured.datenight.w - measured.tonight.w) < 0.5
        && Math.abs(measured.datenight.h - measured.tonight.h) < 0.5,
        `Date Night measured box ${measured.datenight.w}×${measured.datenight.h} must match Tonight ${measured.tonight.w}×${measured.tonight.h}`);
      ok(Math.abs(measured.datenight.w - measured.drive.w) < 0.5
        && Math.abs(measured.datenight.h - measured.drive.h) < 0.5,
        `Date Night measured box ${measured.datenight.w}×${measured.datenight.h} must match Worth the Drive ${measured.drive.w}×${measured.drive.h}`);
      ok(measured.dnFit === "contain",
        `Date Night computed object-fit is contain, not cover (got ${measured.dnFit})`);
      ok(measured.tonightFit === "cover",
        `Tonight still uses cover — Date Night contain did not restyle the rail (got ${measured.tonightFit})`);
    } finally {
      await browser.close();
      try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

if (fail) {
  console.error(`check-datenight-rail-uncropped: FAIL — ${fail} assertion(s), ${pass} passed`);
  process.exit(1);
}
console.log(`check-datenight-rail-uncropped: OK — ${pass} assertions (locked 1086×1448 executed + byte-identical to rail source and hero, 760.jpg aspect matches, railArtSize 3:4 intrinsic, TILE BOX computed equal to Tonight/Drive at 9:16, contain still on, RAIL_ART_V 14)`);
