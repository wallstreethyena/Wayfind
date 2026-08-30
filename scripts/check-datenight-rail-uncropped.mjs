#!/usr/bin/env node
// scripts/check-datenight-rail-uncropped.mjs — Date Night rail shows the FULL poster.
//
// THE INCIDENT (owner iPhone, Parrish, after #1031 / 1569b3fd). The new
// BEST NIGHT. / EVERY DETAIL. art shipped, and the left edge was gone:
// "wayfind" clipped, SPEAKEASIES → "…AKEASIES", "WE'LL TAKE YOU UP TO" →
// "LL TAKE YOU UP TO 27 MILES".
//
// Cause, measured: the owner PNG is 1024×1536 (2:3). make-rail-art.mjs
// cover-fit that into the ladder's 760×1350 (~9:16) box, and .wf8-tim
// object-fit:cover + object-position:50% 0% did the same crop again in the
// tile. Cover-fitting 2:3 into 9:16 drops ~15% of the width — exactly the
// left-aligned type.
//
// THE FIX is Date Night only. Other posters stay 9:16 + cover. This guard
// executes the sizes it can (source PNG, 760.jpg, railArtSize) and pins the
// CSS/JS positions that keep the tile from covering. A comment that mentions
// "contain" does not pass.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { railArtSize, RAIL_ART_DEFAULT_SIZE, RAIL_ART_V } from "../lib/rails.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error("  FAIL:", m)); };

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

const SRC = "art/rail-sources/datenight.png";
const OWNER = "public/cards/date-night-owner.png";
const JPG = "public/cards-v8/datenight-760.jpg";

ok(existsSync(join(ROOT, SRC)), `positive control: ${SRC} is present`);
ok(existsSync(join(ROOT, OWNER)), `positive control: ${OWNER} is present`);
ok(existsSync(join(ROOT, JPG)), `positive control: ${JPG} is present`);

const srcBuf = readFileSync(join(ROOT, SRC));
const ownerBuf = readFileSync(join(ROOT, OWNER));
const jpgBuf = readFileSync(join(ROOT, JPG));
const src = pngSize(srcBuf);
const owner = pngSize(ownerBuf);
const jpg = jpegSize(jpgBuf);

ok(src.width === 1024 && src.height === 1536,
  `Date Night source is the 1024×1536 owner poster (got ${src.width}×${src.height})`);
ok(owner.width === src.width && owner.height === src.height,
  `/date-night hero PNG must stay the same full frame as the rail source (got ${owner.width}×${owner.height})`);
ok(createHash("sha256").update(srcBuf).digest("hex") === createHash("sha256").update(ownerBuf).digest("hex"),
  "art/rail-sources/datenight.png and public/cards/date-night-owner.png are the same original bytes");

const srcAspect = src.width / src.height;
const jpgAspect = jpg.width / jpg.height;
ok(Math.abs(jpgAspect - srcAspect) < 0.01,
  `datenight-760.jpg must keep the source aspect ${srcAspect.toFixed(4)} — cover-fit to 9:16 is the crop (got ${jpg.width}×${jpg.height} = ${jpgAspect.toFixed(4)})`);
ok(jpg.height !== 1350,
  "datenight-760.jpg is no longer the 760×1350 cover-crop that clipped the left type");
ok(jpg.width === 760,
  `the 760w rung is still 760 wide so RAIL_ART_WIDTHS stay honest (got ${jpg.width})`);

const box = railArtSize("datenight");
ok(box.width === 760 && box.height === 1140,
  `railArtSize("datenight") is 760×1140 (2:3) — executed, got ${box.width}×${box.height}`);
ok(Math.abs(box.width / box.height - srcAspect) < 0.01,
  "railArtSize Date Night matches the source aspect, not the 9:16 default");
ok(RAIL_ART_DEFAULT_SIZE.width === 760 && RAIL_ART_DEFAULT_SIZE.height === 1350,
  "the default ladder is still 760×1350 — Date Night is the exception, not a global restyle");
ok(railArtSize("tonight").height === 1350 && railArtSize("events").height === 1350
  && railArtSize("drive").height === 1350 && railArtSize("family").height === 1350,
  "Tonight, Events, Worth the Drive, and Family stay on the default box");

const css = strip(read("app/components/railMenuCss.js"));
const dnTile = css.match(/\.wf8-tile\[data-id="datenight"\]\{[^}]+\}/);
ok(!!dnTile, "positive control: the Date Night tile rule is a real selector, not a mention");
ok(!!dnTile && /--wf8-ratio:0\.666667/.test(dnTile[0]),
  `Date Night tile --wf8-ratio is 2:3 (0.666667), matching the source (got ${dnTile ? dnTile[0] : "missing"})`);
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

const rail = strip(read("app/components/DaypartRail.js"));
ok(/railArtSize\(id\)/.test(rail),
  "DaypartRail CALLS railArtSize(id) — a string in a comment is not a reserved box");
ok(/width=\{artBox\.width\}/.test(rail) && /height=\{artBox\.height\}/.test(rail),
  "the tile <img> uses the size railArtSize returned, in the width/height props");

const railsSrc = strip(read("lib/rails.js"));
ok(/(?:export const)\s+RAIL_ART_V\s*=\s*"13"/.test(railsSrc) && RAIL_ART_V === "13",
  `RAIL_ART_V is 13 so cached 9:16 crops cannot survive (declared + executed, got ${RAIL_ART_V})`);

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
  `/date-night hero still uses the original owner PNG, full frame (got ${JSON.stringify(dnArt)})`);

if (fail) {
  console.error(`check-datenight-rail-uncropped: FAIL — ${fail} assertion(s), ${pass} passed`);
  process.exit(1);
}
console.log(`check-datenight-rail-uncropped: OK — ${pass} assertions (source 1024×1536 executed, 760.jpg aspect matches, railArtSize 2:3, tile contain + 0.666667, default posters still 9:16, RAIL_ART_V 13)`);
