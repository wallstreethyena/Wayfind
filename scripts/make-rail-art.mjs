#!/usr/bin/env node
// make-rail-art — turn an owner-supplied poster into the rail tile ladder.
//
// NOT a guard. A tool, run by hand:
//
//     node scripts/make-rail-art.mjs <source.png> <rail-id> [--preserve-frame]
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
// --preserve-frame is the exception that Date Night needs. Its owner poster
// is 1024×1536 (2:3), not 9:16. Cover-fitting that into 760×1350 clipped the
// left-aligned wordmark. The flag resamples to the requested width at the
// SOURCE aspect, with no trim and no cover crop. Other rails stay on the
// default cover-fit path.
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

const args = process.argv.slice(2).filter((a) => a !== "--preserve-frame");
const preserveFrame = process.argv.includes("--preserve-frame");
const [src, id] = args;
if (!src || !id) {
  console.error("usage: node scripts/make-rail-art.mjs <source.png> <rail-id> [--preserve-frame]");
  process.exit(2);
}
if (!existsSync(src)) { console.error("source not found: " + src); process.exit(2); }

const OUT = "public/cards-v8";
const WIDTHS = [380, 760];
const RATIO = 1350 / 760;            // the ladder's own 9:16-ish shape
const TRIM = 1;                      // hairline edge seam on the exports

const meta = await sharp(src).metadata();
console.log(`source ${src} — ${meta.width}x${meta.height} ${meta.format}${preserveFrame ? " (preserve-frame: source aspect, no cover crop)" : ""}`);
if (meta.width < 760) console.warn("  ! narrower than 760px: the 760w tile will be upscaled");

const trimmed = preserveFrame ? sharp(src) : sharp(src).extract({
  left: TRIM, top: TRIM,
  width: meta.width - TRIM * 2,
  height: meta.height - TRIM * 2,
});
const srcAspect = meta.height / meta.width;

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
