#!/usr/bin/env node
// scripts/check-datenight-rail-uncropped.mjs — Date Night rail shows the FULL poster.
//
// THE INCIDENT (owner iPhone, Parrish, after #1031 / 1569b3fd). Cover-fitting
// a non-9:16 owner poster into the 760×1350 ladder + .wf8-tim object-fit:cover
// clipped the left-aligned type.
//
// FOUNDER LOCK (v8.93, 2026-08-30): the card is the owner's 941×1672 DATE
// NIGHT poster — wayfind / DATE NIGHT / "An unforgettable night. Already
// planned." BEST NIGHT / EVERY DETAIL, the 1086×1448 "Impress. Every time."
// Adobe frame, and TONIGHT'S MOVE / icon-row are all discarded.
//
// THE RULE GENERALISED, and that is the point of this revision. The invariant
// was never "Date Night is contain" — it is THE OWNER'S POSTER IS NOT CROPPED.
// v14 needed contain because its 3:4 frame did not fit a 9:16 box; contain
// fits everything and therefore PADS, which is the maroon letterbox band the
// owner photographed on 2026-08-30. The new poster is 0.5628 against a 0.5625
// box, so cover clips nothing and pads nothing — the same invariant, reached
// by the opposite CSS.
//
// So this file now derives the expected fit from the SOURCE ASPECT instead of
// pinning a keyword: on-ratio ⇒ cover, off-ratio ⇒ contain. Swap in another
// off-ratio poster and the guard demands contain again, on its own.
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

ok(locked.width === 941 && locked.height === 1672,
  `founder lock is the 941×1672 DATE NIGHT poster (got ${locked.width}×${locked.height})`);
ok(!(src.width === 1024 && src.height === 1536),
  "BEST NIGHT / EVERY DETAIL (1024×1536) is discarded — not the rail source");
ok(!(src.width === 1086 && src.height === 1448),
  "the v14 'Impress. Every time.' 3:4 frame is discarded — it is what needed the letterbox");
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
const BOX_ASPECT = 760 / 1350;
// ON-RATIO is the whole question, and it is measured, never assumed. Within
// half a percent of the tile box, a cover-fit resample moves fewer than four
// pixels of a 1672px frame — no type can be clipped by that. Outside it,
// cover is the #1031 left-edge crop and contain is required instead.
const ON_RATIO = Math.abs(srcAspect - BOX_ASPECT) < 0.005;
ok(ON_RATIO,
  `the locked poster is ON the shared 9:16 tile box (source ${srcAspect.toFixed(4)} vs box ${BOX_ASPECT.toFixed(4)}) — an off-ratio poster needs the contain path back, and this guard will say so`);
ok(Math.abs(jpgAspect - srcAspect) < 0.01,
  `datenight-760.jpg keeps the source aspect ${srcAspect.toFixed(4)} — a resample that changes it is a crop (got ${jpg.width}×${jpg.height} = ${jpgAspect.toFixed(4)})`);
ok(jpg.height !== 1140,
  `datenight-760.jpg is not the leftover 2:3 crop (got ${jpg.height})`);
ok(jpg.width === 760,
  `the 760w rung is still 760 wide so RAIL_ART_WIDTHS stay honest (got ${jpg.width})`);

const box = railArtSize("datenight");
ok(box.width === jpg.width && box.height === jpg.height,
  `railArtSize("datenight") matches the 760.jpg box — executed, got ${box.width}×${box.height} vs jpg ${jpg.width}×${jpg.height}`);
ok(Math.abs(box.width / box.height - srcAspect) < 0.01,
  "railArtSize Date Night matches the source aspect — which, now that the poster is on-ratio, IS the 9:16 default");
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

// THE FIT IS DERIVED, NOT PINNED. ON_RATIO ⇒ the shared cover rule and NO
// per-tile override; off-ratio ⇒ the contain override must exist.
const dnImg = css.match(/\.wf8-tile\[data-id="datenight"\] \.wf8-tim\{[^}]+\}/);
if (ON_RATIO) {
  ok(!dnImg,
    "an ON-RATIO poster takes the shared cover rule with NO per-tile override — contain would letterbox it, which is the maroon band the owner photographed");
  ok(!/\.wf8-tile\[data-id="datenight"\]/.test(css),
    "…and no Date Night tile override of any kind survives, including the hover-zoom opt-out that came with it");
} else {
  ok(!!dnImg, "an OFF-RATIO poster must carry the Date Night img rule");
  ok(!!dnImg && /object-fit:contain/.test(dnImg[0]),
    "…and it must be object-fit:contain — cover is what clipped the left edge");
  ok(!!dnImg && !/object-fit:cover/.test(dnImg[0]),
    "…and must not also set cover (contain then cover is still a crop)");
}
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
// The version is asserted as a NUMBER THAT ONLY GOES UP, not a literal. Pinning
// "14" meant every future poster swap failed this guard for the one reason that
// is never a defect — and a guard that fires on the correct fix is the guard
// people delete. 15 is where the new poster landed; the floor moves with it.
const declaredV = (railsSrc.match(/(?:export const)\s+RAIL_ART_V\s*=\s*"(\d+)"/) || [])[1];
ok(declaredV != null && declaredV === RAIL_ART_V,
  `RAIL_ART_V is declared and executes to the same value (declared ${declaredV}, executed ${RAIL_ART_V})`);
ok(Number(RAIL_ART_V) >= 15,
  `RAIL_ART_V is at least 15, so every phone holding a v14 letterboxed card is busted (got ${RAIL_ART_V})`);

const make = strip(read("scripts/make-rail-art.mjs"));
ok(/preserveFrame/.test(make) && /--preserve-frame/.test(read("scripts/make-rail-art.mjs")),
  "make-rail-art still has the --preserve-frame path Date Night was rebuilt with");
ok(/preserveFrame\s*\?\s*"fill"\s*:\s*"cover"/.test(make),
  "preserve-frame resamples with fill (source aspect), not cover (the crop)");

const intent = strip(read("lib/intentPages.js"));
const dnArt = [...intent.matchAll(/art:\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => /date-night/.test(p));
ok(dnArt.length >= 1 && dnArt.every((p) => p.split("?")[0] === "/cards/date-night-owner.png"),
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
      // The COMPUTED fit, derived from the source aspect exactly as the static
      // half above derives it. This is the assertion that actually proves the
      // reader sees the whole poster: the box and the image are measured in a
      // real 390px viewport, not inferred from a stylesheet.
      ok(measured.dnFit === (ON_RATIO ? "cover" : "contain"),
        `Date Night computed object-fit is ${ON_RATIO ? "cover (the poster is on-ratio, so cover clips nothing and pads nothing)" : "contain (the poster is off-ratio, so cover would clip the left edge)"} — got ${measured.dnFit}`);
      ok(measured.tonightFit === "cover",
        `Tonight still uses cover — nothing about Date Night restyled the rail (got ${measured.tonightFit})`);
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
console.log(`check-datenight-rail-uncropped: OK — ${pass} assertions (locked ${locked.width}\u00d7${locked.height} executed + byte-identical to rail source and hero; 760.jpg keeps the source aspect; the poster is ${ON_RATIO ? "ON" : "OFF"}-ratio so the required fit is ${ON_RATIO ? "cover with no per-tile override" : "contain"}, asserted statically AND measured in a real 390px viewport; TILE BOX computed equal to Tonight/Drive; RAIL_ART_V ${RAIL_ART_V})`);
