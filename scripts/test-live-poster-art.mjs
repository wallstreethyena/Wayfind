// Owner direction 2026-10-15: sports postcards show their own team's/provider's
// artwork with the complete logo, superseding the fixed "Catch a Game" image.
// Fixtures are generated locally; no provider requests are made.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { preservesSportsArtwork, eventMayHaveUsableProviderArt, livePosterSourceCanPossiblyFit } from "../lib/livePosterCandidate.js";
import { buildEventPoster } from "../lib/eventPoster.js";
import { fitPosterImage, POSTER_RATIO } from "../lib/posterImageFit.js";
import { LIVE_POSTER_TYPE_CONFIG } from "../lib/liveEventPosterTypes.js";

let n = 0;
async function check(label, fn) { n++; await fn(); console.log(`  OK  ${label}`); }
const RAYS = {
  id: "tm_Z7r9jZ1A7Q878", name: "Tampa Bay Rays vs. Boston Red Sox",
  genre: "Baseball", subGenre: "MLB", segment: "Sports", date: "2026-09-18", time: "19:10:00",
  venue: "Tropicana Field", city: "Saint Petersburg", source: "Ticketmaster",
  dest: "/events/saint-petersburg/tampa-bay-rays-vs-boston-red-sox--tm_Z7r9jZ1A7Q878",
  destKind: "internal", url: "https://www.ticketmaster.com/event/rays",
  image: "https://s1.ticketm.net/dam/a/rays/team-logo.png",
};

// Colored pieces touch every edge of this broad team mark. A portrait crop
// necessarily removes the left/right pieces. Count their pixels in the real
// output instead of repeating the fitter's resize/position calculations.
async function logoFixture(width = 1024, height = 576, background = "#234b73", logoColor = "#ffffff") {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${background}"/>
    <rect x="0" y="${height * 0.22}" width="${width * 0.09}" height="${height * 0.56}" fill="#f02020"/>
    <rect x="${width * 0.91}" y="${height * 0.22}" width="${width * 0.09}" height="${height * 0.56}" fill="#20e040"/>
    <rect x="${width * 0.4}" y="0" width="${width * 0.2}" height="${height * 0.1}" fill="#f0d020"/>
    <rect x="${width * 0.4}" y="${height * 0.9}" width="${width * 0.2}" height="${height * 0.1}" fill="#d020e0"/>
    <path d="M ${width * 0.24} ${height * 0.25} H ${width * 0.76} V ${height * 0.4} H ${width * 0.57} V ${height * 0.78} H ${width * 0.43} V ${height * 0.4} H ${width * 0.24} Z" fill="${logoColor}"/>
  </svg>`)).png().toBuffer();
}
async function colorCensus(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = { left: 0, right: 0, top: 0, bottom: 0, logo: 0 };
  let minLeftX = info.width, maxRightX = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g < 90 && b < 90) { counts.left++; minLeftX = Math.min(minLeftX, x); }
    if (r < 90 && g > 160 && b < 110) { counts.right++; maxRightX = Math.max(maxRightX, x); }
    if (r > 180 && g > 150 && b < 90) counts.top++;
    if (r > 150 && g < 90 && b > 160) counts.bottom++;
    if (r > 220 && g > 220 && b > 220) counts.logo++;
  }
  return { counts, minLeftX, maxRightX, info, data };
}

await check("only normalized sports classifications preserve complete artwork", () => {
  for (const event of [RAYS, { ...RAYS, genre: "Football", subGenre: "NFL" }, { ...RAYS, genre: "Hockey", subGenre: "NHL" }]) assert.equal(preservesSportsArtwork(event), true);
  for (const event of [{ ...RAYS, segment: "Music" }, { name: "Tampa Bay Rays Fan Fest" }, { name: "MLB Baseball", genre: "Baseball", subGenre: "MLB" }, null, undefined, 3, "Sports", {}]) {
    assert.equal(preservesSportsArtwork(event), false, "names and leagues must not invent the sports segment");
  }
});

await check("1024px team art is eligible without weakening generic crop sharpness", () => {
  const source = { url: RAYS.image, width: 1024, height: 576, ratio: "16_9" };
  assert.equal(livePosterSourceCanPossiblyFit(source), false);
  assert.equal(livePosterSourceCanPossiblyFit(source, { preserveArtwork: true }), true);
  assert.equal(eventMayHaveUsableProviderArt({ ...RAYS, imageVariants: [source] }), true);
  assert.equal(eventMayHaveUsableProviderArt({ ...RAYS, segment: "Music", imageVariants: [source] }), false);
  assert.equal(livePosterSourceCanPossiblyFit({ ...source, width: 639 }, { preserveArtwork: true }), false, "the source still needs 640px of detail");
  assert.equal(eventMayHaveUsableProviderArt({ ...RAYS, imageVariants: [{ ...source, width: 639 }] }), false, "dimensionless duplicates must not bypass known undersized art");
});

await check("the sports poster preserves all four edges of the team's image", async () => {
  const source = await logoFixture();
  const requested = [];
  const result = await buildEventPoster(RAYS, { fetchImage: async (url) => { requested.push(url); return source; } });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "contained-art");
  assert.equal(result.sourceUrl, RAYS.image);
  assert.deepEqual(requested, [RAYS.image], "the logo must come from this exact event's image");
  const output = await colorCensus(result.buffer);
  assert.equal(output.info.width, 760);
  assert.equal(output.info.height, Math.round(760 / POSTER_RATIO));
  for (const [edge, pixels] of Object.entries(output.counts)) assert.ok(pixels > 2000, `${edge}: source feature disappeared (${pixels} pixels)`);
  assert.ok(output.minLeftX < 5, "left source edge must remain visible");
  assert.ok(output.maxRightX >= output.info.width - 5, "right source edge must remain visible");
  const corner = Array.from(output.data.subarray(0, 3));
  const end = ((output.info.height - 1) * output.info.width + output.info.width - 1) * output.info.channels;
  assert.deepEqual(Array.from(output.data.subarray(end, end + 3)), corner, "portrait space uses a solid background");
  assert.ok(Math.abs(corner[0] - 35) < 20 && Math.abs(corner[1] - 75) < 20 && Math.abs(corner[2] - 115) < 20, "background must use the source's dominant team color");
  for (const key of ["id", "name", "date", "time", "venue", "city", "source", "dest", "destKind", "url", "segment", "genre"]) assert.equal(result.event[key], RAYS[key], `${key} must pass through unchanged`);
});

await check("the marker check detects a cropped logo as a negative control", async () => {
  const wide = await logoFixture(2048, 1152);
  const crop = await fitPosterImage([{ url: RAYS.image }], { fetchImage: async () => wide });
  assert.equal(crop.ok, true, "ordinary crop behavior remains a healthy control");
  assert.equal(crop.strategy, "attention");
  const output = await colorCensus(crop.buffer);
  assert.ok(output.counts.left < 100 || output.counts.right < 100, "negative control must lose an edge marker");
});

await check("different teams retain distinct provider images and destination metadata", async () => {
  const teams = [RAYS, { ...RAYS, id: "tm_marlins", name: "Miami Marlins vs. New York Mets", venue: "loanDepot park", city: "Miami", image: "https://s1.ticketm.net/dam/a/marlins/team-logo.png", dest: "/events/miami/marlins-vs-mets" }];
  const sources = new Map([[teams[0].image, await logoFixture()], [teams[1].image, await logoFixture(1024, 576, "#557d43")]]);
  const results = [];
  for (const event of teams) {
    const result = await buildEventPoster(event, { fetchImage: async (url) => sources.get(url) || null });
    assert.equal(result.ok, true);
    for (const key of ["id", "dest", "name"]) assert.equal(result.event[key], event[key]);
    assert.equal(result.sourceUrl, event.image);
    results.push(result);
  }
  assert.notEqual(results[0].sourceUrl, results[1].sourceUrl);
  assert.equal(results[0].buffer.equals(results[1].buffer), false, "teams must not share one fixed baseball poster");
});

await check("missing, unrelated, unreadable and undersized art never substitutes a poster", async () => {
  let fetches = 0;
  const fetchImage = async () => { fetches++; return logoFixture(); };
  for (const image of [null, "https://s1.ticketm.net/dam/c/rays/generic.jpg", "/api/photo?place=venue&w=800", "/api/stock-photo?u=stock"]) {
    const event = { ...RAYS, image, thumb: null, imageVariants: [] };
    assert.equal(eventMayHaveUsableProviderArt(event), false);
    assert.equal((await buildEventPoster(event, { fetchImage })).ok, false);
  }
  assert.equal(fetches, 0, "missing/unrelated art must fail before downloading");
  assert.equal((await buildEventPoster(RAYS, { fetchImage: async () => Buffer.from("not an image") })).ok, false);
  assert.equal((await buildEventPoster(RAYS, { fetchImage: async () => logoFixture(400, 225) })).ok, false);
});

await check("featureless artwork fails closed while a logo on white remains usable", async () => {
  for (const background of ["#040404", "#ffffff"]) {
    const blank = await sharp({ create: { width: 1024, height: 576, channels: 3, background } }).png().toBuffer();
    const result = await buildEventPoster(RAYS, { fetchImage: async () => blank });
    assert.equal(result.ok, false, `${background}: a uniform source contains no team identity`);
    assert.equal(result.attempts?.[0]?.reason, "featureless_image");
  }
  const whiteLogo = await logoFixture(1024, 576, "#ffffff", "#121212");
  const result = await buildEventPoster(RAYS, { fetchImage: async () => whiteLogo });
  assert.equal(result.ok, true, "a valid logo must not be rejected merely for its white background");
  assert.equal(result.strategy, "contained-art");
  const output = await colorCensus(result.buffer);
  for (const edge of ["left", "right", "top", "bottom"]) assert.ok(output.counts[edge] > 2000, `${edge}: the white-background logo must remain complete`);
});

await check("transparent monochrome logos retain visible contrast; invisible noise is rejected", async () => {
  const width = 1024, height = 576;
  for (const color of [0, 255]) for (const grayscale of [false, true]) {
    // RGB is uniform: the complete T-shaped team mark exists only in alpha.
    const rgba = Buffer.alloc(width * height * 4, color);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const inMark = (x >= 250 && x < 774 && y >= 100 && y < 220)
        || (x >= 450 && x < 574 && y >= 220 && y < 500);
      rgba[(y * width + x) * 4 + 3] = inMark ? 255 : 0;
    }
    let image = sharp(rgba, { raw: { width, height, channels: 4 } });
    if (grayscale) image = image.toColourspace("b-w");
    const source = await image.png().toBuffer();
    const result = await buildEventPoster(RAYS, { fetchImage: async () => source });
    assert.equal(result.ok, true, `${color}/${grayscale}: alpha-only logo must be usable`);
    assert.equal(result.strategy, "contained-art");
    assert.equal((await sharp(result.buffer).stats()).isOpaque, true, "the complete mark must have a visible solid field");
    const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const center = ((Math.floor(info.height / 2) * info.width) + Math.floor(info.width / 2)) * info.channels;
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(data[center + channel] - color) < 5, "the monochrome mark must retain its source color");
      assert.ok(Math.abs(data[center + channel] - data[channel]) > 180, "the mark must contrast with the portrait field");
    }
  }
  const invisible = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    invisible[pixel * 4] = pixel % 256;
    invisible[pixel * 4 + 1] = (pixel * 17) % 256;
    invisible[pixel * 4 + 2] = (pixel * 53) % 256;
  }
  const source = await sharp(invisible, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await buildEventPoster(RAYS, { fetchImage: async () => source });
  assert.equal(result.ok, false, "hidden RGB variation is not visible team artwork");
  assert.equal(result.attempts?.[0]?.reason, "featureless_image");
});

await check("no fixed baseball override or removed concert poster can reach the worker", () => {
  assert.deepEqual(Object.keys(LIVE_POSTER_TYPE_CONFIG), ["sports"]);
  assert.ok(!existsSync("public/posters/live/concerts-owner-20260920.webp"), "concert art must stay deleted");
  for (const file of ["lib/liveEventPosterTypes.js", "lib/livePosterSelection.js", "app/components/useLivePosterTiles.js"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /LIVE_POSTER_CONCERT_ART|isConcertEvent|concerts-owner|useOneLivePoster\("concerts"/, `${file}: removed concerts poster must not return`);
    assert.doesNotMatch(source, /livePosterArtFor|baseball-owner|["']owner-art["']/, `${file}: baseball must not override its team's image`);
  }
});

console.log(`test-live-poster-art: ${n} checks passed`);
