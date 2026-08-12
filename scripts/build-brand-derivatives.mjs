#!/usr/bin/env node
/**
 * scripts/build-brand-derivatives.mjs — regenerate the optimized AVIF/WebP
 * copies of the STATIC brand art in public/.
 *
 * WHY THIS EXISTS. Measured on production 2026-08-12: the homepage's LCP
 * element was `/brand/wayfind-default-hero-adobestock-289023289.jpeg` — a
 * 1600x1066, 473KB JPEG, preloaded at fetchPriority="high" — rendered into a
 * card that is at most ~447 CSS px wide on a phone. The top-bar wordmark was a
 * 1707x441, 167KB PNG painted at 151x39. Together that is 640KB of critical-path
 * image bytes for roughly 40KB worth of pixels.
 *
 * WHY NOT next/image. These are static brand assets that never change per
 * request, and this repo has a standing rule about not putting billable
 * per-request work on the critical path of every visit (see app/page.js and
 * scripts/test-map-cost.mjs — the v6.41 "billed loads on every page view"
 * incident). Pre-generating derivatives at authoring time costs nothing at
 * runtime, ships from the same immutable-cached /public path (next.config.js
 * already sends max-age=2592000 for jpg|png|webp|avif), and cannot regress into
 * a bill. The originals stay in the repo as the <picture> fallback, so no
 * browser is ever worse off than it is today.
 *
 * WHY IT IS NOT WIRED INTO THE BUILD. `sharp` is a native dependency; adding it
 * to package.json would put a platform-specific binary into every Vercel
 * install for work that only happens when someone adds a new brand image.
 * Outputs are committed instead. To regenerate:
 *
 *     npm i --no-save sharp && node scripts/build-brand-derivatives.mjs
 *
 * Then commit whatever changed under public/brand/opt/ and public/opt/.
 */
import { mkdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("build-brand-derivatives: sharp is not installed.\n  npm i --no-save sharp && node scripts/build-brand-derivatives.mjs");
  process.exit(1);
}

// Each job: one source, the widths to emit, and where they land. Widths are
// chosen from the REAL rendered size of the element times a 2-3x DPR headroom —
// not from the source's native size, which is what made these files heavy.
const JOBS = [
  {
    src: "public/brand/wayfind-default-hero-adobestock-289023289.jpeg",
    out: "public/brand/opt",
    base: "wayfind-default-hero",
    // Card is 93% of a column that is <=480px on phones and <=800px on desktop.
    widths: [480, 768, 1152, 1600],
    formats: { avif: { quality: 52 }, webp: { quality: 76 } },
  },
  {
    // Sprite sheet for .wf-wordmark-text / .wf-wordmark-pin. Painted at
    // 151x39 (mobile) and 180x47 (desktop); 720 wide is ~4x the largest.
    src: "public/brand/wayfind-wordmark-transparent-v2.png",
    out: "public/brand/opt",
    base: "wayfind-wordmark",
    widths: [720],
    formats: { avif: { quality: 60 }, webp: { quality: 82, alphaQuality: 90 } },
  },
  {
    // The World Cup player, painted 74px tall (so 142 native is already ~2x).
    src: "public/wf-player.png",
    out: "public/opt",
    base: "wf-player",
    widths: [142],
    formats: { avif: { quality: 58 }, webp: { quality: 82, alphaQuality: 90 } },
  },
];

const kb = (n) => (n / 1024).toFixed(1) + "KB";
let before = 0;
let after = 0;

for (const job of JOBS) {
  if (!existsSync(job.src)) {
    console.error(`build-brand-derivatives: missing source ${job.src}`);
    process.exit(1);
  }
  mkdirSync(job.out, { recursive: true });
  const srcBytes = statSync(job.src).size;
  before += srcBytes;
  const meta = await sharp(job.src).metadata();
  console.log(`\n${job.src}  ${meta.width}x${meta.height}  ${kb(srcBytes)}`);

  for (const w of job.widths) {
    if (w > meta.width) continue;
    for (const [fmt, opts] of Object.entries(job.formats)) {
      const dest = path.join(job.out, `${job.base}-${w}.${fmt}`);
      await sharp(job.src)
        .resize({ width: w, withoutEnlargement: true })
        [fmt](opts)
        .toFile(dest);
      const bytes = statSync(dest).size;
      // Only the smallest width of each format counts toward the "after"
      // figure, because that is what a phone actually downloads.
      if (w === job.widths[0]) after += fmt === "avif" ? bytes : 0;
      console.log(`  -> ${dest}  ${kb(bytes)}`);
    }
  }
}

console.log(`\nsources ${kb(before)} -> phone-width AVIF ${kb(after)}`);
