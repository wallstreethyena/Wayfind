#!/usr/bin/env node
// scripts/check-datenight-rail-uncropped.mjs — Date Night rail shows the FULL poster,
// filling the same 9:16 tile as Tonight / Worth the Drive.
//
// THE INCIDENTS
//   #1031 cover-fit the 1086×1448 Adobe poster into 760×1350 → clipped DATE/NIGHT.
//   #1032 preserved the 3:4 frame + object-fit:contain → full type, but a stamp
//         inside a taller tile (founder iPhone, maroon letterbox bars).
//   #1034 kept the shared 9:16 tile box. Correct box, still the 3:4 contain encode.
//
// THE FIX pads the locked 3:4 onto the 9:16 ladder (scale to WIDTH, pad TOP and
// BOTTOM only, color from the poster's own dark edge) so .wf8-tim cover fills
// the tile without cropping DATE / NIGHT.
//
// This file EXECUTES sizes, SHA, railArtSize, the CSS tile formula, and — when
// Chromium is present — the measured boxes plus a canvas pixel compare of the
// DATE/NIGHT edge columns. A comment that mentions "contain" or "9:16" does
// not pass.

import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
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

const LOCKED_SHA = "43c40558299064d94dbb299422e2ffaa57bf76ac0b51cd1737cdaf67ed5a9355";
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
ok(sha(lockedBuf) === LOCKED_SHA,
  `locked Adobe PNG is the known 1086×1448 blob (got ${sha(lockedBuf)})`);
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

ok(jpg.width === 760 && jpg.height === 1350,
  `datenight-760.jpg is the 9:16 ladder 760×1350 (got ${jpg.width}×${jpg.height})`);
ok(jpg.height !== 1013 && jpg.height !== 1140,
  `datenight-760.jpg is not the leftover 3:4 (1013) or 2:3 (1140) encode (got ${jpg.height})`);

const fitH = Math.round(locked.height * 760 / locked.width);
ok(fitH === 1013,
  `width-fit of 1086×1448 onto 760 is 1013 tall — pad top/bottom from there (got ${fitH})`);
ok(fitH < jpg.height,
  `760 encode is taller than the width-fit poster (${jpg.height} > ${fitH}) — top/bottom pad, not a side crop`);
const padTop = Math.floor((jpg.height - fitH) / 2);
ok(padTop > 0 && padTop + fitH <= jpg.height,
  `poster band is y=${padTop}..${padTop + fitH} inside the 1350 frame`);

const box = railArtSize("datenight");
ok(box.width === jpg.width && box.height === jpg.height,
  `railArtSize("datenight") matches the 760.jpg box — executed, got ${box.width}×${box.height} vs jpg ${jpg.width}×${jpg.height}`);
ok(box.width === RAIL_ART_DEFAULT_SIZE.width && box.height === RAIL_ART_DEFAULT_SIZE.height,
  `railArtSize Date Night is the same 9:16 intrinsic as default (${RAIL_ART_DEFAULT_SIZE.width}×${RAIL_ART_DEFAULT_SIZE.height}), not 760×1013`);
ok(RAIL_ART_DEFAULT_SIZE.width === 760 && RAIL_ART_DEFAULT_SIZE.height === 1350,
  "the default ladder is still 760×1350");
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

ok(!/\.wf8-tile\[data-id="datenight"\] \.wf8-tim\{/.test(css),
  "Date Night has no img override — the shared .wf8-tim cover fills the 9:16 pad");
ok(!/\.wf8-tile\[data-id="datenight"\][^\{]*\{[^}]*object-fit:contain/.test(css),
  "Date Night does not letterbox with object-fit:contain");
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
ok(/(?:export const)\s+RAIL_ART_V\s*=\s*"15"/.test(railsSrc) && RAIL_ART_V === "15",
  `RAIL_ART_V is 15 so cached 3:4 contain encodes cannot survive (declared + executed, got ${RAIL_ART_V})`);

const make = strip(read("scripts/make-rail-art.mjs"));
ok(/preserveFrame/.test(make) && /--preserve-frame/.test(read("scripts/make-rail-art.mjs")),
  "make-rail-art still has the --preserve-frame path Date Night was rebuilt with");
ok(/padLadder/.test(make) && /--pad-ladder/.test(read("scripts/make-rail-art.mjs")),
  "make-rail-art still has the --pad-ladder path that width-fits and pads top/bottom");
ok(/preserveFrame\s*\?\s*"fill"\s*:\s*"cover"/.test(make),
  "preserve-frame resamples with fill (source aspect), not cover (the crop)");
ok(/padLadder && !preserveFrame/.test(make),
  "pad-ladder cannot run without preserve-frame — cover-after-pad is not this recipe");

const intent = strip(read("lib/intentPages.js"));
const dnArt = [...intent.matchAll(/art:\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => /date-night/.test(p));
ok(dnArt.length >= 1 && dnArt.every((p) => p === "/cards/date-night-owner.png"),
  `/date-night hero uses date-night-owner.png (the locked poster), not the AdobeStock jpeg (got ${JSON.stringify(dnArt)})`);
ok(!/date-night-adobestock-190984224/.test(intent),
  "/date-night does not point at the old AdobeStock jpeg");

// Layout + glyph pixels: inject the shipped CSS and the real 760 encode.
// Formula equality above is the always-on lock. This asks getBoundingClientRect
// and canvas ImageData at the 390px phone the founder used.
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
    const candidates = [
      "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
      "/opt/google/chrome/chrome",
      "/usr/local/bin/chrome",
    ];
    for (const p of candidates) {
      if (existsSync(p)) return { executablePath: p };
    }
    if (process.platform === "darwin") return {};
    return null;
  }
  const launchOpts = resolveChromium();
  if (!launchOpts) {
    console.log("  (Chromium layout/pixel measure skipped — no browser; formula boxes + jpeg size above still ran)");
  } else {
    const tmp = mkdtempSync(join(ROOT, ".wf-dn-tile-"));
    copyFileSync(join(ROOT, JPG), join(tmp, "datenight-760.jpg"));
    copyFileSync(join(ROOT, LOCKED), join(tmp, "locked.png"));
    const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${WF_RAIL_MENU_CSS}</style></head>
<body style="margin:0;background:#040810">
<div class="wf8" style="width:390px">
  <div class="wf8-track">
    <div class="wf8-tile" data-id="tonight"><img class="wf8-tim" alt="" width="760" height="1350"></div>
    <div class="wf8-tile" data-id="datenight"><img class="wf8-tim" alt="" src="datenight-760.jpg" width="760" height="1350"></div>
    <div class="wf8-tile" data-id="drive"><img class="wf8-tim" alt="" width="760" height="1350"></div>
  </div>
</div>
<img id="locked" src="locked.png" width="1086" height="1448" style="position:absolute;left:-9999px">
<img id="encode" src="datenight-760.jpg" width="760" height="1350" style="position:absolute;left:-9999px">
</body></html>`;
    const pagePath = join(tmp, "tiles.html");
    writeFileSync(pagePath, fixture);
    const browser = await chromium.launch({
      ...launchOpts,
      args: ["--allow-file-access-from-files", "--disable-web-security", "--no-sandbox"],
    });
    try {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
      await page.goto("file://" + pagePath, { waitUntil: "load" });
      await page.evaluate(() => Promise.all([
        document.getElementById("locked").decode(),
        document.getElementById("encode").decode(),
        document.querySelector('.wf8-tile[data-id="datenight"] .wf8-tim').decode(),
      ]));
      const innerWidth = await page.evaluate(() => window.innerWidth);
      ok(innerWidth === 390, `PROBE: measured viewport is 390px, not a clamped request (got ${innerWidth})`);
      const measured = await page.evaluate(({ fitH, padTop }) => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        };
        const fit = (el) => el ? getComputedStyle(el).objectFit : null;
        const locked = document.getElementById("locked");
        const encode = document.getElementById("encode");
        const srcC = document.createElement("canvas");
        srcC.width = 760; srcC.height = fitH;
        srcC.getContext("2d").drawImage(locked, 0, 0, 760, fitH);
        const encC = document.createElement("canvas");
        encC.width = 760; encC.height = 1350;
        encC.getContext("2d").drawImage(encode, 0, 0, 760, 1350);
        const src = srcC.getContext("2d").getImageData(0, 0, 760, fitH).data;
        const enc = encC.getContext("2d").getImageData(0, padTop, 760, fitH).data;
        let posterMae = 0, posterN = 0;
        for (let i = 0; i < src.length; i += 4) {
          posterMae += Math.abs(src[i] - enc[i]) + Math.abs(src[i + 1] - enc[i + 1]) + Math.abs(src[i + 2] - enc[i + 2]);
          posterN += 3;
        }
        posterMae /= posterN;
        const stripMae = (x0, cols) => {
          let s = 0, n = 0;
          for (let y = 0; y < fitH; y++) {
            for (let x = x0; x < x0 + cols; x++) {
              const i = (y * 760 + x) * 4;
              s += Math.abs(src[i] - enc[i]) + Math.abs(src[i + 1] - enc[i + 1]) + Math.abs(src[i + 2] - enc[i + 2]);
              n += 3;
            }
          }
          return s / n;
        };
        // DATE sits ~18–38% down the 3:4 poster; NIGHT ~38–56%. The letters
        // touch the left/right edges. A 9:16 cover crop insets ~94px at 760
        // and those edge columns go dark. A different 9:16 card (Tonight)
        // matches neither the full-band MAE nor these edge glyphs.
        const cream = (r, g, b) => r > 170 && g > 140 && b > 90 && r > b + 20;
        const rose = (r, g, b) => r > 130 && r < 210 && g > 70 && g < 160 && b > 70 && b < 150 && r > g + 10;
        const glyphs = (y0f, y1f, pred) => {
          const y0 = Math.round(fitH * y0f), y1 = Math.round(fitH * y1f);
          let all = 0, minX = 760, maxX = -1;
          for (let y = y0; y < y1; y++) {
            for (let x = 0; x < 760; x++) {
              const i = (y * 760 + x) * 4;
              if (pred(enc[i], enc[i + 1], enc[i + 2])) {
                all++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
              }
            }
          }
          return { all, minX, maxX, y0, y1 };
        };
        return {
          tonight: box(document.querySelector('.wf8-tile[data-id="tonight"]')),
          datenight: box(document.querySelector('.wf8-tile[data-id="datenight"]')),
          drive: box(document.querySelector('.wf8-tile[data-id="drive"]')),
          dnFit: fit(document.querySelector('.wf8-tile[data-id="datenight"] .wf8-tim')),
          tonightFit: fit(document.querySelector('.wf8-tile[data-id="tonight"] .wf8-tim')),
          posterMae,
          leftMae: stripMae(0, 8),
          rightMae: stripMae(752, 8),
          dateBand: glyphs(0.18, 0.38, cream),
          nightBand: glyphs(0.38, 0.56, rose),
        };
      }, { fitH, padTop });
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
      ok(measured.dnFit === "cover",
        `Date Night computed object-fit is cover — contain is the letterbox (got ${measured.dnFit})`);
      ok(measured.tonightFit === "cover",
        `Tonight still uses cover — Date Night did not restyle the rail (got ${measured.tonightFit})`);
      ok(measured.posterMae < 16,
        `760 poster band matches the width-fit locked source (MAE ${measured.posterMae.toFixed(2)} < 16) — a different 9:16 card or a cover crop fails this`);
      ok(measured.leftMae < 18,
        `DATE/NIGHT left-edge columns match the width-fit source (MAE ${measured.leftMae.toFixed(2)} < 18) — a cover crop would replace them`);
      ok(measured.rightMae < 18,
        `DATE/NIGHT right-edge columns match the width-fit source (MAE ${measured.rightMae.toFixed(2)} < 18) — a cover crop would replace them`);
      ok(measured.dateBand.all > 2000 && measured.dateBand.minX < 200 && measured.dateBand.maxX > 550,
        `DATE cream glyphs are fully inside the 760 frame (n=${measured.dateBand.all} x=${measured.dateBand.minX}..${measured.dateBand.maxX} y=${measured.dateBand.y0}..${measured.dateBand.y1})`);
      ok(measured.nightBand.all > 2000 && measured.nightBand.minX < 140 && measured.nightBand.maxX > 720,
        `NIGHT dusty-rose glyphs are fully inside the 760 frame — the T is the cover-crop casualty (n=${measured.nightBand.all} x=${measured.nightBand.minX}..${measured.nightBand.maxX} y=${measured.nightBand.y0}..${measured.nightBand.y1})`);
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
console.log(`check-datenight-rail-uncropped: OK — ${pass} assertions (locked 1086×1448 SHA executed + byte-identical to rail source and hero, 760.jpg is 9:16, railArtSize matches default, TILE BOX equals Tonight/Drive, no contain letterbox, DATE/NIGHT edges inside frame, RAIL_ART_V 15)`);
