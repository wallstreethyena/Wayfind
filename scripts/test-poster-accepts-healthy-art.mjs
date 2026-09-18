// scripts/test-poster-accepts-healthy-art.mjs
//
// THE REGRESSION THIS EXISTS TO PREVENT (owner, 2026-09-17: "please make sure
// you fix the code so that it does not reject a healthy picture in the
// future").
//
// Twice in one night the fit chain refused artwork that was completely fine:
//
//   1. MIN_SALIENT_SURVIVAL was 0.70. A 9:16 crop of a 16:9 source keeps only
//      ~32% of the WIDTH, so that bar was close to unreachable by geometry
//      alone. Zac Brown Band's real 2048x1152 tour art measured 0.44 and was
//      rejected, and the poster letterboxed it inside blurry filler.
//   2. The banner-text heuristic fired on a single strong photographic edge.
//
// A unit test with synthetic fixtures did not catch either, because a fixture
// is drawn to exercise one code path. This file asserts the OPPOSITE property:
// that ordinary, healthy photographs in the shapes Ticketmaster and Wayfind
// actually serve are ACCEPTED and FILL the tile. If a future composition rule
// starts refusing them, this is red.
//
// HERMETIC: every image is generated here with sharp. No network, no fixtures
// on disk, no environment read.
import assert from "node:assert/strict";
import sharp from "sharp";
import { fitPosterImage, attemptAttentionCrop, POSTER_RATIO } from "../lib/posterImageFit.js";

let n = 0;

// A plausible photograph: a lit subject somewhere in frame, a gradient
// background, and texture everywhere -- i.e. edges distributed the way a real
// photo distributes them, not a synthetic block.
async function photo({ width, height, subjectX = 0.5, subjectY = 0.5 }) {
  const cx = Math.round(width * subjectX), cy = Math.round(height * subjectY);
  const r = Math.round(Math.min(width, height) * 0.22);
  const stripes = [];
  for (let i = 0; i < 40; i++) {
    const y = Math.round((i / 40) * height);
    stripes.push(`<rect x="0" y="${y}" width="${width}" height="${Math.max(1, Math.round(height / 90))}" fill="rgba(255,255,255,0.05)"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3c4a63"/><stop offset="100%" stop-color="#6b5340"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    ${stripes.join("")}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8dfc8"/>
    <rect x="${cx - r}" y="${cy + r * 0.6}" width="${r * 2}" height="${r * 1.4}" fill="#2b2f3a"/>
    <circle cx="${cx - r * 0.35}" cy="${cy - r * 0.15}" r="${Math.max(2, r * 0.09)}" fill="#1b1e26"/>
    <circle cx="${cx + r * 0.35}" cy="${cy - r * 0.15}" r="${Math.max(2, r * 0.09)}" fill="#1b1e26"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// The shapes real providers actually serve, at sizes large enough that a 9:16
// crop still clears MIN_CROP_WIDTH. Ticketmaster's 16_9 at 2048x1152 is the
// exact variant that was being rejected in production.
const SHAPES = [
  { label: "TM 16_9 2048x1152 (the rejected Zac Brown shape)", width: 2048, height: 1152 },
  { label: "TM 3_2 1920x1280", width: 1920, height: 1280 },
  { label: "4:3 1600x1200", width: 1600, height: 1200 },
  { label: "square 1400x1400", width: 1400, height: 1400 },
  { label: "already-tall 1200x2133", width: 1200, height: 2133 },
];

// Subject placement must not matter. Off-centre and edge-weighted subjects are
// normal photography, and each one is a composition a survival rule would have
// punished.
const PLACEMENTS = [
  { label: "centred", subjectX: 0.5 },
  { label: "left third", subjectX: 0.28 },
  { label: "right third", subjectX: 0.72 },
  { label: "far left", subjectX: 0.14 },
  { label: "far right", subjectX: 0.86 },
];

for (const shape of SHAPES) {
  for (const place of PLACEMENTS) {
    n++;
    const buf = await photo({ width: shape.width, height: shape.height, subjectX: place.subjectX });
    const res = await attemptAttentionCrop(buf, { ratio: POSTER_RATIO });
    assert.equal(
      res.ok, true,
      `HEALTHY ART REJECTED: ${shape.label}, subject ${place.label} -> ${res.reason} (survival ${res.survivalRatio})`
    );
    assert.equal(res.strategy, "attention", "a healthy photo must FILL via the attention crop");
  }
}

// And end to end through the real chain: a healthy candidate is accepted on
// the FIRST attempt, with no fallback strategy and nothing skipped.
{
  n++;
  const buf = await photo({ width: 2048, height: 1152, subjectX: 0.62 });
  const res = await fitPosterImage([{ url: "https://s1.ticketm.net/dam/a/abc/real_16_9.jpg" }], { fetchImage: async () => buf });
  assert.equal(res.ok, true, "a healthy Ticketmaster candidate must be accepted by the chain");
  assert.equal(res.strategy, "attention");
  assert.ok(!/blurred/.test(String(res.strategy)), "no blurred-extend may appear for healthy art");
  assert.equal(res.attempts.filter((a) => a.reason).length, 0, "a healthy candidate must not accumulate rejections");
}

// The sharpness floor is NOT a composition rule and must stay. A 1136x639
// source can only yield a 359px-wide 9:16 crop, which is genuinely soft at 2x
// DPR on a 281px tile -- so it is refused and the chain moves to a larger
// variant of the SAME event (Ticketmaster serves 2048x1152 alongside it).
// Refusing this is correct; refusing 2048x1152 was the bug.
{
  n++;
  const soft = await photo({ width: 1136, height: 639 });
  const big = await photo({ width: 2048, height: 1152 });
  const res = await fitPosterImage(
    [{ url: "small_16_9.jpg" }, { url: "large_16_9.jpg" }],
    { fetchImage: async (u) => (u === "small_16_9.jpg" ? soft : big) }
  );
  assert.equal(res.ok, true, "the chain must fall through to the larger variant of the same event");
  assert.equal(res.sourceUrl, "large_16_9.jpg");
  assert.equal(res.attempts[0].reason, "too_small_after_crop");
}

// The floor that remains real: a crop too small to render sharp is still
// refused, so this file cannot be read as "accept everything".
{
  n++;
  const small = await photo({ width: 400, height: 225 });
  const res = await attemptAttentionCrop(small, { ratio: POSTER_RATIO });
  assert.equal(res.ok, false, "a too-small source must still be refused");
  assert.equal(res.reason, "too_small_after_crop");
}

console.log(`test-poster-accepts-healthy-art: OK — ${n} checks; every real-world shape and subject placement FILLS the tile, and the sharpness floor still refuses an undersized source`);
