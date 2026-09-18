// lib/posterImageFit.js
//
// Pure image-fit engine for the live event poster tile (9:16, ratio .5625,
// matching lib/rails.js --wf8-ratio, the 941x1672 poster asset box). Takes
// already-downloaded image buffers and produces either an attention-aware
// 9:16 crop, or a blurred full-bleed extension of the SAME image. It never
// fetches an event, never ranks an event, never invents or borrows an image
// from anywhere else.
//
// Owner-locked rule (2026-09-16):
//   1. Attention-aware crop first.
//   2. Reject when the subject is badly cut -> caller tries the event's
//      other image variant next (this file only judges ONE image at a time).
//   3. Still failing on every variant -> blurred extension of the same
//      event's own image, never a different event's image.
//   4. No usable image at all -> caller fails closed. This file has no
//      concept of "the fallback UI" -- that already exists elsewhere
//      (RailCard's monogram tile) and is reused by returning ok:false.
//
// The "attention" here is a small, deterministic, testable heuristic (edge
// magnitude / saliency proxy on a low-res greyscale downsample), not a
// black-box ML model and not sharp's opaque built-in attention strategy --
// chosen specifically so every claim below is provable with fixtures, not
// asserted on faith.

import sharp from "sharp";

export const POSTER_RATIO = 0.5625; // 9:16, matches lib/rails.js --wf8-ratio
const MIN_CROP_WIDTH = 640;         // below this the crop reads soft at 2x DPR
// A 9:16 crop of a 16:9 source keeps only ~32% OF THE WIDTH -- that is the
// fixed geometry, not a defect. The first version of this demanded 70% of the
// salient mass survive that crop, which is close to impossible for an
// ordinary landscape photo: Zac Brown Band's own 2048x1152 tour art scored
// 0.44 and was rejected, so the poster fell back to blurred-extend and showed
// the real photo as a band in the middle of blurry filler. The owner wants a
// FULL poster (2026-09-17), and a full-bleed crop of real event art is better
// than a letterboxed one every time.
//
// 0.38 is set just above the measured split-subject failure (two subjects
// pinned to opposite edges, which no single crop can contain -- the fixture in
// scripts/test-event-poster.mjs) and well below a normal centred or
// off-centre photo. So the check still catches the case it was written for and
// stops rejecting the case it should never have rejected.
const MIN_SALIENT_SURVIVAL = 0.38;
const TEXT_BAND_COVERAGE = 0.60;    // banner-text heuristic threshold
const LUMA_MIN = 0.12;
const LUMA_MAX = 0.85;
const DOWNSAMPLE_W = 160;

// Ticketmaster serves generic classification stock art under /dam/c/ and the
// real, event-specific photo under /dam/a/. A stock placeholder is honest
// (there is no real photo) and must never be treated as this event's image.
// NOT EVENT ARTWORK (2026-09-17). A poster for a game or a concert has to
// show THAT event. Several Wayfind image URLs are photographs of a VENUE or
// generic stock, not art for the event itself:
//
//   /api/photo?ref=places%2F...  a Google Places photo of the venue
//   /api/photo?place=...         same, addressed by place id
//   /api/stock-photo?u=...       generic stock imagery
//
// Wayfind CURATED events carry exactly these, because a curated event's
// picture is normally rendered as a place card where a venue photo is the
// correct, honest choice. On an event poster it is not: it produced a
// playground photo as the "Concerts near you" poster, because that curated
// concert happens in a park. Failing closed and letting the next event win
// is strictly better than a poster that misrepresents what it links to.
export function isNotEventArtwork(url) {
  if (typeof url !== "string" || !url) return true;
  return /\/api\/photo\?(?:[^#]*&)?(?:ref=places(?:%2F|\/)|place=)/i.test(url)
    || /\/api\/stock-photo\b/i.test(url);
}

export function isPlaceholderTmUrl(url) {
  return typeof url === "string" && /\/dam\/c\//i.test(url);
}

async function readMeta(buffer) {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  return meta;
}

// One downsample pass produces BOTH the greyscale luma field and its edge
// (Sobel-style) magnitude field, so luma and "interestingness" share exactly
// the same coordinate space and no second decode is needed.
async function downsampleFields(buffer, targetW = DOWNSAMPLE_W) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .greyscale()
    .resize({ width: targetW, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = data[i - 1] - data[i + 1];
      const gy = data[i - w] - data[i + w];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { luma: data, mag, w, h };
}

function rectInDownsample(w, h, rx0, ry0, rx1, ry1) {
  return {
    x0: Math.max(0, Math.floor(rx0 * w)), x1: Math.min(w, Math.ceil(rx1 * w)),
    y0: Math.max(0, Math.floor(ry0 * h)), y1: Math.min(h, Math.ceil(ry1 * h)),
  };
}

function sumMagInRect(mag, w, rect) {
  let s = 0;
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) s += mag[y * w + x];
  return s;
}

// Where is the salient mass concentrated, left to right, as a fraction of
// width? Positions the crop window ON the subject instead of the geometric
// middle -- this is what makes the crop "attention aware" rather than a
// blind center crop.
function salientCenterX(mag, w, h) {
  let total = 0, moment = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = mag[y * w + x];
    total += v; moment += v * (x + 0.5);
  }
  return total > 0 ? moment / total / w : 0.5;
}

function meanStd(arr) {
  let sum = 0; for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let sq = 0; for (let i = 0; i < arr.length; i++) sq += (arr[i] - mean) ** 2;
  return { mean, std: Math.sqrt(sq / arr.length) };
}

// A wide, high-contrast horizontal band in the top or bottom third of the
// CROPPED region reads as chopped headline text once the tile clips it --
// a very different failure than "subject cut off," so it gets its own check
// and its own rejection reason.
//
// This runs its OWN, higher-resolution downsample (TEXT_DOWNSAMPLE_W),
// separate from the coarse saliency pass above. That is not incidental:
// measured directly, a repeating stripe/letterform pattern at a real
// Ticketmaster photo's width (2048px) washes out to near-nothing at the
// coarse 160px saliency resolution (a real banner and a plain photo both
// measured near the same low reading there) but separates cleanly at 480px
// (a real repeating band measured roughly 60% of its rows "hot" against
// a normal photo boundary's 6%). Root cause was resolution, not threshold.
//
// Per-row signal is a per-pixel COVERAGE FRACTION (how much of the row
// individually clears the threshold), not a row-mean: two ordinary
// vertical silhouette edges passing through a row give it a nonzero mean
// even though only 2 of ~150 pixels are actually "hot" -- coverage
// fraction correctly reads that as boring, the way a real dense repeating
// band never is.
const TEXT_DOWNSAMPLE_W = 480;
const TEXT_ROW_COVERAGE = 0.50;      // share of ONE row's pixels that must be "hot"
const TEXT_BAND_ROW_FRACTION = 0.40; // share of rows in the band that must qualify
async function bannerTextInBand(buffer, rectFrac) {
  let fields;
  try { fields = await downsampleFields(buffer, TEXT_DOWNSAMPLE_W); } catch { return false; }
  const { mag, w, h } = fields;
  const { mean: globalMean } = meanStd(mag);
  const threshold = globalMean * 3;
  const rect = rectInDownsample(w, h, rectFrac.rx0, rectFrac.ry0, rectFrac.rx1, rectFrac.ry1);
  const bandH = Math.max(2, Math.round((rect.y1 - rect.y0) / 3));
  const bands = [
    { y0: rect.y0, y1: Math.min(rect.y1, rect.y0 + bandH) },
    { y0: Math.max(rect.y0, rect.y1 - bandH), y1: rect.y1 },
  ];
  const rectWidth = Math.max(1, rect.x1 - rect.x0);
  for (const band of bands) {
    const rows = Math.max(1, band.y1 - band.y0);
    let qualifyingRows = 0;
    for (let y = band.y0; y < band.y1; y++) {
      let hits = 0;
      for (let x = rect.x0; x < rect.x1; x++) if (mag[y * w + x] > threshold) hits++;
      if (hits / rectWidth >= TEXT_ROW_COVERAGE) qualifyingRows++;
    }
    if (qualifyingRows / rows >= TEXT_BAND_ROW_FRACTION) return true;
  }
  return false;
}

function meanLumaInRect(luma, w, rect) {
  let s = 0, n = 0;
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) { s += luma[y * w + x]; n++; }
  return n ? (s / n) / 255 : 0;
}

/**
 * Attention-aware 9:16 crop attempt on ONE image buffer.
 * Returns { ok:true, strategy:"attention", buffer, survivalRatio, left, top }
 *      or { ok:false, reason, survivalRatio? }
 */
export async function attemptAttentionCrop(buffer, { ratio = POSTER_RATIO } = {}) {
  let meta;
  try { meta = await readMeta(buffer); } catch { return { ok: false, reason: "unreadable_image" }; }
  const W = meta.width || 0, H = meta.height || 0;
  if (!W || !H) return { ok: false, reason: "unreadable_image" };

  const wider = W / H >= ratio;
  const cropW = wider ? Math.round(H * ratio) : W;
  const cropH = wider ? H : Math.round(W / ratio);
  if (cropW < MIN_CROP_WIDTH) return { ok: false, reason: "too_small_after_crop", cropW };

  let fields;
  try { fields = await downsampleFields(buffer); } catch { return { ok: false, reason: "unreadable_image" }; }
  const { luma, mag, w: sw, h: sh } = fields;

  const cropFracW = cropW / W, cropFracH = cropH / H;
  let rx0, ry0;
  if (wider) {
    const cx = salientCenterX(mag, sw, sh);
    rx0 = Math.min(Math.max(cx - cropFracW / 2, 0), 1 - cropFracW);
    ry0 = 0;
  } else {
    rx0 = 0;
    ry0 = Math.max(0, Math.min(1 - cropFracH, (1 - cropFracH) / 2));
  }
  const rx1 = rx0 + cropFracW, ry1 = ry0 + cropFracH;
  const rect = rectInDownsample(sw, sh, rx0, ry0, rx1, ry1);

  const totalMass = sumMagInRect(mag, sw, { x0: 0, y0: 0, x1: sw, y1: sh });
  const keptMass = sumMagInRect(mag, sw, rect);
  // A genuinely flat/featureless source (no edges anywhere -- effectively
  // never a real photo, but a real edge case) has nothing salient to lose,
  // so there is nothing for a crop to "cut off." Do not reject on
  // survival here; a flat image is still a bad poster, but for a
  // different, more accurate reason -- let the exposure check below judge
  // it instead of a meaningless 0/0 verdict.
  const NEAR_ZERO_MASS = 1;
  const survivalRatio = totalMass < NEAR_ZERO_MASS ? 1 : keptMass / totalMass;
  if (totalMass >= NEAR_ZERO_MASS && survivalRatio < MIN_SALIENT_SURVIVAL) return { ok: false, reason: "subject_cut", survivalRatio };

  if (await bannerTextInBand(buffer, { rx0, ry0, rx1, ry1 })) return { ok: false, reason: "banner_text", survivalRatio };

  const luminance = meanLumaInRect(luma, sw, rect);
  if (luminance < LUMA_MIN || luminance > LUMA_MAX) return { ok: false, reason: "bad_exposure", survivalRatio, luminance };

  const extractLeft = Math.round(rx0 * W), extractTop = Math.round(ry0 * H);
  const extractW = Math.min(W - extractLeft, Math.round(cropFracW * W));
  const extractH = Math.min(H - extractTop, Math.round(cropFracH * H));
  let cropped;
  try {
    cropped = await sharp(buffer, { failOn: "none" })
      .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
      .toBuffer();
  } catch { return { ok: false, reason: "crop_failed" }; }

  return { ok: true, strategy: "attention", buffer: cropped, survivalRatio, left: rx0, top: ry0 };
}

/**
 * Last-resort fallback: the FULL image, uncropped, contained inside the 9:16
 * frame, with a blurred and darkened copy of the SAME image filling the rest
 * of the frame. Never a different image, never invented scenery.
 */
export async function blurredExtend(buffer, { ratio = POSTER_RATIO, outWidth = 760 } = {}) {
  let meta;
  try { meta = await readMeta(buffer); } catch { return { ok: false, reason: "unreadable_image" }; }
  const W = meta.width || 0, H = meta.height || 0;
  if (!W || !H) return { ok: false, reason: "unreadable_image" };

  const outHeight = Math.round(outWidth / ratio);
  let bg, fg;
  try {
    bg = await sharp(buffer, { failOn: "none" })
      .resize({ width: outWidth, height: outHeight, fit: "cover" })
      .modulate({ brightness: 0.55 })
      .blur(24)
      .toBuffer();
    const fgHeight = Math.round(outWidth * (H / W));
    fg = await sharp(buffer, { failOn: "none" }).resize({ width: outWidth, height: fgHeight }).toBuffer();
    const top = Math.max(0, Math.round((outHeight - fgHeight) / 2));
    const composed = await sharp(bg).composite([{ input: fg, left: 0, top }]).toBuffer();
    return { ok: true, strategy: "blurred-extend", buffer: composed };
  } catch { return { ok: false, reason: "extend_failed" }; }
}

/**
 * Walk the reject/retry chain across an ORDERED list of the SAME event's
 * image candidates: { url }[]. candidates[0] is treated as this event's
 * primary/best image; later entries are its other legitimate variants.
 *
 *   1. attention crop of candidates[0]
 *   2. reject -> try candidates[1], candidates[2], ...
 *   3. every candidate rejected -> blurred-extend of candidates[0]
 *   4. no candidates at all, or the fetch itself fails for all of them
 *      -> ok:false, caller fails closed
 */
export async function fitPosterImage(candidates, { ratio = POSTER_RATIO, fetchImage } = {}) {
  const fetcher = fetchImage;
  const attempts = [];
  let firstBuffer = null, firstUrl = null;
  for (const c of candidates || []) {
    const url = c?.url;
    if (!url) continue;
    if (isPlaceholderTmUrl(url)) { attempts.push({ url, reason: "placeholder_stock_art" }); continue; }
    if (isNotEventArtwork(url)) { attempts.push({ url, reason: "not_event_artwork" }); continue; }
    let buf;
    try { buf = await fetcher(url); } catch { attempts.push({ url, reason: "fetch_failed" }); continue; }
    if (!buf) { attempts.push({ url, reason: "fetch_failed" }); continue; }
    if (!firstBuffer) { firstBuffer = buf; firstUrl = url; }
    const res = await attemptAttentionCrop(buf, { ratio });
    if (res.ok) return { ok: true, strategy: "attention", sourceUrl: url, buffer: res.buffer, survivalRatio: res.survivalRatio, attempts: [...attempts, { url, accepted: true }] };
    attempts.push({ url, reason: res.reason, survivalRatio: res.survivalRatio });
  }
  if (firstBuffer) {
    const ext = await blurredExtend(firstBuffer, { ratio });
    if (ext.ok) return { ok: true, strategy: "blurred-extend", sourceUrl: firstUrl, buffer: ext.buffer, attempts };
    attempts.push({ url: firstUrl, reason: ext.reason });
  }
  return { ok: false, reason: attempts.length ? "all_candidates_rejected" : "no_candidates", attempts };
}
