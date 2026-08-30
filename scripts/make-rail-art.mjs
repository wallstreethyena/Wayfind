#!/usr/bin/env node
// make-rail-art — turn an owner-supplied poster into the rail tile ladder.
//
// NOT a guard. A tool, run by hand:
//
//     node scripts/make-rail-art.mjs <source.png> <rail-id> [--preserve-frame] [--pad-ladder]
//
// WHY IT EXISTS. The owner draws these tiles himself and hands them over as
// 9:16 PNGs, and the standing instruction since v8.16 is blunt: "when I give
// you a card for the amazon rail use it EXACTLY as I provided it." The v8.15
// tiles were REDRAWN approximations of his posters and shipped under the same
// filenames — he saw flat mocks of his own artwork and read it, correctly, as
// his art never being used. Every derivative this script writes is a resample
// of his pixels: a 1px edge trim (the export carries a hairline seam on some
// edges) and a cover-fit resize. No text, no crop beyond that, no redraw.
//
// --preserve-frame is the exception that Date Night needs. Its locked poster
// is 1086×1448 (3:4), not 9:16. Cover-fitting that into 760×1350 clipped the
// left-aligned type. The flag resamples to the requested width at the
// SOURCE aspect, with no trim and no cover crop. Other rails stay on the
// default cover-fit path.
//
// --pad-ladder (with --preserve-frame) is how Date Night FILLS the 9:16 tile
// without that cover crop. It scales the source to the canvas WIDTH, pads
// TOP and BOTTOM only with a color sampled from the poster's own dark edge,
// then preserve-frame writes the 760×1350 ladder. Contain-letterboxing a
// 3:4 encode inside the 9:16 tile is the live stamp-with-bars bug.
//
// The ladder it writes matches lib/rails.js RAIL_ART_WIDTHS exactly:
//   AVIF + WebP at 380w and 760w   what every current browser actually gets
//   JPEG at 760w only              the <img> fallback for a browser that
//                                  supports neither, which is not a browser
//                                  worth a second ladder for
//
// AFTER RUNNING: bump RAIL_ART_V in lib/rails.js (phones hold these for 30
// days under the same filename — that is the bug that made a swapped tile look
// ignored), then re-pin the rail in scripts/check-rail-art-matches-copy.mjs.
import { createRequire } from "node:module";
import { writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const sharp = createRequire(import.meta.url)("sharp");

const FLAGS = new Set(["--preserve-frame", "--pad-ladder"]);
const args = process.argv.slice(2).filter((a) => !FLAGS.has(a));
const preserveFrame = process.argv.includes("--preserve-frame");
const padLadder = process.argv.includes("--pad-ladder");
const [src, id] = args;
if (!src || !id) {
  console.error("usage: node scripts/make-rail-art.mjs <source.png> <rail-id> [--preserve-frame] [--pad-ladder]");
  process.exit(2);
}
if (padLadder && !preserveFrame) {
  console.error("--pad-ladder requires --preserve-frame (pad, then resample at source aspect)");
  process.exit(2);
}
if (!existsSync(src)) { console.error("source not found: " + src); process.exit(2); }

const OUT = "public/cards-v8";
const WIDTHS = [380, 760];
const RATIO = 1350 / 760;            // the ladder's own 9:16-ish shape
const TRIM = 1;                      // hairline edge seam on the exports

const meta = await sharp(src).metadata();
console.log(`source ${src} — ${meta.width}x${meta.height} ${meta.format}${preserveFrame ? " (preserve-frame: source aspect, no cover crop)" : ""}${padLadder ? " (pad-ladder: width-fit + top/bottom edge pad)" : ""}`);
if (meta.width < 760) console.warn("  ! narrower than 760px: the 760w tile will be upscaled");

let encodeSrc = src;
if (padLadder) {
  const canvasW = meta.width;
  const canvasH = Math.round(meta.width * RATIO);
  if (canvasH < meta.height) {
    console.error(`--pad-ladder would clip the source (${meta.width}x${meta.height} into ${canvasW}x${canvasH})`);
    process.exit(2);
  }
  const padTop = Math.floor((canvasH - meta.height) / 2);
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const edge = [];
  for (const y of [0, 1, 2, 3, info.height - 4, info.height - 3, info.height - 2, info.height - 1]) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (lum(i) < 55) edge.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!edge.length) {
    console.error("--pad-ladder: no dark edge pixels to sample");
    process.exit(2);
  }
  const med = (k) => edge.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(edge.length / 2)];
  const pad = { r: med(0), g: med(1), b: med(2) };
  encodeSrc = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: pad },
  }).composite([{ input: src, top: padTop, left: 0 }]).png().toBuffer();
  console.log(`  padded ${canvasW}x${canvasH} (pad-top ${padTop}, color rgb(${pad.r},${pad.g},${pad.b}))`);
}

const trimmed = preserveFrame ? sharp(encodeSrc) : sharp(encodeSrc).extract({
  left: TRIM, top: TRIM,
  width: meta.width - TRIM * 2,
  height: meta.height - TRIM * 2,
});
const paddedMeta = padLadder ? await sharp(encodeSrc).metadata() : meta;
const srcAspect = paddedMeta.height / paddedMeta.width;

const written = [];
for (const w of WIDTHS) {
  const h = preserveFrame ? Math.round(w * srcAspect) : Math.round(w * RATIO);
  const resized = () => trimmed.clone().resize(w, h, {
    fit: preserveFrame ? "fill" : "cover",
    position: "centre",
    kernel: "lanczos3",
  });
  // Quality settings carried over from the v8.16 tiles so a re-run of an
  // existing card lands in the same weight class it already ships at.
  const jobs = [
    [`${id}-${w}.avif`, resized().avif({ quality: 52, effort: 6 })],
    [`${id}-${w}.webp`, resized().webp({ quality: 78 })],
  ];
  if (w === 760) jobs.push([`${id}-${w}.jpg`, resized().jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: "4:4:4" })]);
  for (const [name, pipe] of jobs) {
    const buf = await pipe.toBuffer();
    writeFileSync(`${OUT}/${name}`, buf);
    written.push([name, w + "x" + h, buf.length, createHash("sha256").update(buf).digest("hex").slice(0, 16)]);
  }
}

console.log(`\nwrote ${written.length} file(s) to ${OUT}/`);
for (const [name, dim, bytes, hash] of written) {
  console.log(`  ${name.padEnd(20)} ${dim.padEnd(10)} ${String(bytes).padStart(7)} bytes  sha256:${hash}`);
}
console.log("\nnext: bump RAIL_ART_V in lib/rails.js, then re-pin " + id + " in scripts/check-rail-art-matches-copy.mjs");
