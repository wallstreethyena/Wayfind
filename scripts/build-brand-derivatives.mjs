// scripts/build-brand-derivatives.mjs — modern derivatives for the two STATIC
// brand images that sit on the critical path of the home page.
//
//   node scripts/build-brand-derivatives.mjs        (needs: npm i --no-save sharp)
//
// RUN BY HAND, AND THE OUTPUT IS COMMITTED. Deliberately not a package.json
// dependency and deliberately not next/image:
//
//   * These are STATIC brand assets. They change when a designer changes them,
//     which is roughly never — paying an image-optimisation request on every
//     visit, forever, to re-derive a file that is byte-identical every time is
//     the v6.41 rule ("nothing billable on the critical path of every visit").
//   * sharp is ~30MB of platform-specific binaries. As a devDependency it lands
//     in every CI install and every fresh checkout to serve a command nobody
//     runs in a normal week.
//
// So: install it when you change the art, run this, commit what falls out.
//
// WHY THESE WIDTHS AND NOT "a nice ladder". Each one is a width the element
// actually paints at, times a device pixel ratio that exists:
//   hero — 93% of the feed column. Phone ~363css (x2 = 726), the 900-tier
//     column is 800 so 744css (x2 = 1488), the wide-tier column tops out at
//     960 so 893css. The source is 1600px, so 1600 is the ceiling and asking
//     for more would upscale.
//   wordmark — a CSS background sprite painted at 180x46.5 at most (see
//     .wf-wordmark-text / .wf-wordmark-pin). 400px covers 2x with room.
import { mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

const JOBS = [
  { src: "public/brand/wayfind-default-hero-adobestock-289023289.jpeg", out: "public/brand/opt/hero", widths: [460, 760, 1120, 1600] },
  { src: "public/brand/wayfind-wordmark-transparent-v2.png", out: "public/brand/opt/wordmark", widths: [400] },
];

// AVIF first because it wins on photographs by a wide margin; WebP is the
// universal fallback and the ONLY format the <img srcSet> is allowed to carry
// (see the note at the DiscoveryHeroCard render site — the preload React hoists
// for fetchPriority="high" reads the img, so the img must never name the
// original).
const FORMATS = [
  { ext: "avif", opts: { quality: 52, effort: 6 } },
  { ext: "webp", opts: { quality: 74, effort: 6 } },
];

mkdirSync(p("public/brand/opt"), { recursive: true });

let before = 0;
let after = 0;
for (const job of JOBS) {
  before += statSync(p(job.src)).size;
  for (const w of job.widths) {
    for (const f of FORMATS) {
      const dest = `${job.out}-${w}.${f.ext}`;
      await sharp(p(job.src))
        .resize({ width: w, withoutEnlargement: true })
        .toFormat(f.ext, f.opts)
        .toFile(p(dest));
      const n = statSync(p(dest)).size;
      after += n;
      console.log(`${(n / 1024).toFixed(1).padStart(7)}KB  ${dest}`);
    }
  }
}
console.log(`\noriginals ${(before / 1024).toFixed(1)}KB -> ${(after / 1024).toFixed(1)}KB across every derivative`);
console.log("the number that matters is the SMALLEST candidate a real viewport picks, not this total.");
