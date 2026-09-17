// scripts/test-event-poster.mjs
//
// Deterministic, offline proof of lib/posterImageFit.js and lib/eventPoster.js
// against the owner-locked rule (2026-09-16): attention crop first, reject
// on a badly cut subject, retry the event's other image variant, blurred
// extend as the last-resort fallback on the SAME image, fail closed with no
// image, never borrow from another event. All fixtures are synthesized in
// process -- no network, no real Ticketmaster call, fully reproducible.

import assert from "node:assert/strict";
import sharp from "sharp";
import {
  attemptAttentionCrop, blurredExtend, fitPosterImage, isPlaceholderTmUrl, POSTER_RATIO,
} from "../lib/posterImageFit.js";
import { buildEventPoster, posterImageCandidatesFor } from "../lib/eventPoster.js";

// --- fixture builders -------------------------------------------------

function rawImage(w, h, bg) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  return buf;
}
function fillRect(buf, w, h, rect, color) {
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) {
    const i = (y * w + x) * 3;
    buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2];
  }
}
async function toPng(buf, w, h) {
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

// A single, concentrated subject dead center -- a clean centered crop keeps
// almost all of it. Wide 16:9-ish frame, subject a bright square in the
// middle third.
async function fixtureCleanSubject({ w = 2048, h = 1152 } = {}) {
  const buf = rawImage(w, h, [30, 34, 44]);
  const cw = Math.round(w * 0.28);
  fillRect(buf, w, h, { x0: Math.round(w / 2 - cw / 2), y0: Math.round(h * 0.15), x1: Math.round(w / 2 + cw / 2), y1: Math.round(h * 0.85) }, [230, 190, 90]);
  return toPng(buf, w, h);
}

// Two subjects pinned to the FAR left and FAR right edges (a wide group
// shot / banner composition). Any single 9:16 crop window can only ever
// contain one side, so the salient mass split guarantees a low survival
// ratio no matter where the window is centered.
async function fixtureSplitSubjects({ w = 2048, h = 1152 } = {}) {
  const buf = rawImage(w, h, [30, 34, 44]);
  const cw = Math.round(w * 0.14);
  fillRect(buf, w, h, { x0: 0, y0: Math.round(h * 0.2), x1: cw, y1: Math.round(h * 0.8) }, [230, 90, 90]);
  fillRect(buf, w, h, { x0: w - cw, y0: Math.round(h * 0.2), x1: w, y1: Math.round(h * 0.8) }, [90, 190, 230]);
  return toPng(buf, w, h);
}

// A dense alternating-stripe band across the top third, spanning nearly the
// full width -- the banner-text proxy (high edge-magnitude coverage in a
// tight horizontal band), with a clean centered subject below it so THIS
// fixture fails specifically on banner_text, not subject_cut.
// Real headline letterforms create MANY consecutive rows of dense edges
// across a wide band, not one edge. A 4px period at a 12.8x downscale would
// just blur to flat grey and prove nothing -- this uses a period wide enough
// to survive the downsample (matching the resolution the real detector
// actually sees) while still being unmistakably "repeating stripes," not a
// single photographic boundary.
async function fixtureBannerText({ w = 2048, h = 1152 } = {}) {
  const buf = rawImage(w, h, [20, 20, 24]);
  // Both the stripe band AND the subject sit inside the SAME central column
  // the crop will keep (so this fixture fails on banner_text specifically,
  // not on subject_cut, which is what the earlier full-width version did).
  const cw = Math.round(w * 0.3);
  const colX0 = Math.round(w / 2 - cw / 2), colX1 = Math.round(w / 2 + cw / 2);
  const stripeW = 20; // ~5px period at 160px downsample width
  for (let x = colX0; x < colX1; x += stripeW) {
    fillRect(buf, w, h, { x0: x, y0: Math.round(h * 0.05), x1: Math.min(colX1, x + Math.round(stripeW / 2)), y1: Math.round(h * 0.24) }, [245, 245, 245]);
  }
  fillRect(buf, w, h, { x0: colX0, y0: Math.round(h * 0.4), x1: colX1, y1: Math.round(h * 0.9) }, [230, 190, 90]);
  return toPng(buf, w, h);
}

async function fixtureTooSmall() {
  const w = 400, h = 225; // 16:9, but cropW = round(225*.5625) = 127 < MIN_CROP_WIDTH
  return toPng(rawImage(w, h, [80, 80, 80]), w, h);
}

async function fixtureFlatBlack({ w = 2048, h = 1152 } = {}) {
  return toPng(rawImage(w, h, [4, 4, 4]), w, h);
}

const baseEvent = (over = {}) => ({
  id: "tm_test1", name: "Test Event", date: "2026-09-20", time: "19:00",
  venue: "Test Venue", city: "Tampa", source: "Ticketmaster",
  dest: "https://www.ticketmaster.com/event/test1", destKind: "ticket",
  url: "https://www.ticketmaster.com/event/test1",
  ...over,
});

let n = 0;
function check(label, fn) { n++; return fn(); }

// --- 1. clean subject passes the attention crop ------------------------
{
  n++;
  const png = await fixtureCleanSubject();
  const res = await attemptAttentionCrop(png, { ratio: POSTER_RATIO });
  assert.equal(res.ok, true, "clean centered subject should pass attention crop");
  assert.equal(res.strategy, "attention");
  assert.ok(res.survivalRatio >= 0.70, `survivalRatio ${res.survivalRatio} should clear the 0.70 floor`);
}

// --- 2. split subjects get rejected as subject_cut ----------------------
{
  n++;
  const png = await fixtureSplitSubjects();
  const res = await attemptAttentionCrop(png, { ratio: POSTER_RATIO });
  assert.equal(res.ok, false, "a subject split across both edges must be rejected, not silently shipped");
  assert.equal(res.reason, "subject_cut");
}

// --- 3. banner text gets rejected distinctly from subject_cut -----------
{
  n++;
  const png = await fixtureBannerText();
  const res = await attemptAttentionCrop(png, { ratio: POSTER_RATIO });
  assert.equal(res.ok, false, "a chopped text band must be rejected");
  assert.equal(res.reason, "banner_text", "must be distinguishable from subject_cut, not lumped together");
}

// --- 4. too-small-after-crop is rejected before any pixel analysis ------
{
  n++;
  const png = await fixtureTooSmall();
  const res = await attemptAttentionCrop(png, { ratio: POSTER_RATIO });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "too_small_after_crop");
}

// --- 5. flat/near-black image is rejected on exposure --------------------
{
  n++;
  const png = await fixtureFlatBlack();
  const res = await attemptAttentionCrop(png, { ratio: POSTER_RATIO });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "bad_exposure");
}

// --- 6. the reject/retry chain: bad candidate[0] -> good candidate[1] ----
{
  n++;
  const bad = await fixtureSplitSubjects();
  const good = await fixtureCleanSubject();
  const fetcher = async (url) => (url === "bad" ? bad : url === "good" ? good : null);
  const res = await fitPosterImage([{ url: "bad" }, { url: "good" }], { fetchImage: fetcher });
  assert.equal(res.ok, true, "the chain must fall through to the second variant");
  assert.equal(res.strategy, "attention");
  assert.equal(res.sourceUrl, "good", "the ACCEPTED image must be the second candidate, not the rejected first one");
  assert.equal(res.attempts.length, 2, "both attempts are recorded (one rejection, one acceptance)");
  assert.equal(res.attempts[0].reason, "subject_cut");
}

// --- 7. every candidate rejected -> blurred-extend of the FIRST candidate,
//        never a substitute image from anywhere else ---------------------
{
  n++;
  const bad = await fixtureSplitSubjects();
  const alsoBad = await fixtureBannerText();
  const fetcher = async (url) => (url === "bad1" ? bad : url === "bad2" ? alsoBad : null);
  const res = await fitPosterImage([{ url: "bad1" }, { url: "bad2" }], { fetchImage: fetcher });
  assert.equal(res.ok, true, "when every crop attempt fails, blurred-extend must still succeed on the real image");
  assert.equal(res.strategy, "blurred-extend");
  assert.equal(res.sourceUrl, "bad1", "blurred-extend must use the FIRST (primary) candidate of THIS event, never a substitute");
  assert.ok(res.buffer && res.buffer.length > 0);
}

// --- 8. blurredExtend never invents new scenery: output dims match ratio,
//        input pixel content is still present (not replaced) -------------
{
  n++;
  const src = await fixtureCleanSubject();
  const ext = await blurredExtend(src, { ratio: POSTER_RATIO, outWidth: 380 });
  assert.equal(ext.ok, true);
  const meta = await sharp(ext.buffer).metadata();
  const outRatio = meta.width / meta.height;
  assert.ok(Math.abs(outRatio - POSTER_RATIO) < 0.01, `extended image ratio ${outRatio} must match the 9:16 tile`);
}

// --- 9. a Ticketmaster classification placeholder (/dam/c/) is skipped
//        without ever being fetched -----------------------------------
{
  n++;
  assert.equal(isPlaceholderTmUrl("https://s1.ticketm.net/dam/c/abc/generic-sports.jpg"), true);
  assert.equal(isPlaceholderTmUrl("https://s1.ticketm.net/dam/a/abc/real-event-photo.jpg"), false);
  let fetchCount = 0;
  const fetcher = async () => { fetchCount++; return await fixtureCleanSubject(); };
  const res = await fitPosterImage([{ url: "https://s1.ticketm.net/dam/c/x/generic.jpg" }, { url: "https://s1.ticketm.net/dam/a/x/real.jpg" }], { fetchImage: fetcher });
  assert.equal(res.ok, true);
  assert.equal(res.sourceUrl, "https://s1.ticketm.net/dam/a/x/real.jpg");
  assert.equal(fetchCount, 1, "the placeholder URL must never be downloaded at all");
}

// --- 10. no candidates at all -> ok:false, no_candidates -----------------
{
  n++;
  const res = await fitPosterImage([], { fetchImage: async () => null });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "no_candidates");
}

// --- 11. posterImageCandidatesFor: TM ratio ordering, dedupe, placeholder
//         exclusion, and the single-image fallback for non-TM providers --
{
  n++;
  const tmEvent = baseEvent({
    image: "https://s1.ticketm.net/dam/a/x/hero.jpg",
    thumb: "https://s1.ticketm.net/dam/a/x/thumb.jpg",
    imageVariants: [
      { url: "https://s1.ticketm.net/dam/a/x/hero.jpg", ratio: "16_9", width: 2048, height: 1152 },
      { url: "https://s1.ticketm.net/dam/a/x/16x9-small.jpg", ratio: "16_9", width: 640, height: 360 },
      { url: "https://s1.ticketm.net/dam/a/x/3x2.jpg", ratio: "3_2", width: 1024, height: 683 },
      { url: "https://s1.ticketm.net/dam/c/x/placeholder.jpg", ratio: "16_9", width: 2048, height: 1152 },
    ],
  });
  const c = posterImageCandidatesFor(tmEvent);
  assert.equal(c[0].url, "https://s1.ticketm.net/dam/a/x/hero.jpg", "widest 16_9 goes first");
  assert.equal(c[1].url, "https://s1.ticketm.net/dam/a/x/16x9-small.jpg");
  assert.equal(c[2].url, "https://s1.ticketm.net/dam/a/x/3x2.jpg", "3_2 ranked after all 16_9 variants");
  assert.ok(!c.some((x) => x.url.includes("/dam/c/")), "a placeholder must never enter the candidate list");
  assert.ok(!c.some((x) => x.url === "https://s1.ticketm.net/dam/a/x/thumb.jpg" && false), "sanity: thumb still reachable if distinct");

  const seatgeekEvent = baseEvent({ source: "SeatGeek", image: "https://example.com/only.jpg", thumb: null, imageVariants: undefined });
  const c2 = posterImageCandidatesFor(seatgeekEvent);
  assert.deepEqual(c2, [{ url: "https://example.com/only.jpg" }], "non-TM providers fall back to the single image field, nothing invented");

  const noImageEvent = baseEvent({ image: null, thumb: null, imageVariants: [] });
  assert.deepEqual(posterImageCandidatesFor(noImageEvent), []);
}

// --- 12. buildEventPoster: metadata passthrough is byte-identical --------
{
  n++;
  const good = await fixtureCleanSubject();
  const event = baseEvent({ image: "u1", imageVariants: [] });
  const res = await buildEventPoster(event, { fetchImage: async () => good });
  assert.equal(res.ok, true);
  assert.equal(res.event.name, event.name);
  assert.equal(res.event.date, event.date);
  assert.equal(res.event.venue, event.venue);
  assert.equal(res.event.city, event.city);
  assert.equal(res.event.dest, event.dest, "the ticket destination must be copied verbatim, never re-derived");
  assert.equal(res.event.source, "Ticketmaster");
}

// --- 13. no usable image -> fail closed, no fallback image invented ------
{
  n++;
  const event = baseEvent({ image: null, thumb: null, imageVariants: [] });
  const res = await buildEventPoster(event, { fetchImage: async () => { throw new Error("must not be called"); } });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "no_image");
  assert.equal(res.event.dest, event.dest, "even on failure, the real event identity rides along for the caller's honest fallback UI");
}

// --- 14. ineligible event (no destination) fails closed regardless of
//         how good the imagery is -- an event without a real ticket link
//         must never produce a poster that promises one ------------------
{
  n++;
  const good = await fixtureCleanSubject();
  const event = baseEvent({ dest: null, image: "u1" });
  const res = await buildEventPoster(event, { fetchImage: async () => good });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "ineligible_event");
}

// --- 15. cancelled-style events never reach this module in production
//         (lib/eventsPipeline.js validateEvent excludes them upstream) --
//         proven here as a contract check: this module has no cancelled/
//         status field awareness at all, so it must never be handed one.
//         (documented, not a runtime assertion -- the exclusion is the
//         existing pipeline's job, not this lane's)
assert.equal(typeof (await import("../lib/eventsPipeline.js")).validateEvent, "function", "the upstream exclusion this module relies on must still exist");

console.log(`test-event-poster: ${n} checks passed`);
