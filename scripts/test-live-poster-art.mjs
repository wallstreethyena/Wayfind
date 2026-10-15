// Owner direction 2026-10-15: sports postcards show their own team's/provider's
// artwork with a prominent complete logo in a filled 9:16 composition,
// superseding the fixed "Catch a Game" image and a letterboxed landscape band.
// Fixtures are generated locally; no provider requests are made.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { preservesSportsArtwork, eventMayHaveUsableProviderArt, livePosterSourceCanPossiblyFit, isNotEventArtwork } from "../lib/livePosterCandidate.js";
import { buildEventPoster } from "../lib/eventPoster.js";
import { attemptAttentionCrop, fitPosterImage, POSTER_RATIO } from "../lib/posterImageFit.js";
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
const SPORT_KINDS = ["Baseball", "Football", "Basketball", "Hockey", "Soccer", "Tennis", "Motorsports/Racing", "Wrestling", "Other Sports"];
const RETIRED_SPORTS_ART = [
  "/posters/live/baseball-760.webp",
  "/posters/live/baseball-owner-20260920.webp",
  "https://gowayfind.com/posters/live/baseball-760.webp?old=1",
  "https://gowayfind.com/posters/live/baseball-owner-20260920.webp?old=1#art",
  "//gowayfind.com/posters/live/baseball-owner-20260920.webp?old=1",
];

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
// The real provider image has a centered white mark occupying about 30% of
// a broad navy field. Its low-contrast diagonals belong across the portrait;
// containing the whole source makes the actual logo tiny inside a wide band.
const TEAM_FIELD = [[9, 34, 70], [11, 44, 86]];
async function centeredTeamFixture({ detachedDetail = false } = {}) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576">
    <defs><pattern id="diagonal" width="256" height="256" patternUnits="userSpaceOnUse">
      <rect width="256" height="256" fill="rgb(${TEAM_FIELD[0]})"/>
      <path d="M -128 0 H 0 L 256 256 H 128 Z M 128 0 H 256 L 512 256 H 384 Z" fill="rgb(${TEAM_FIELD[1]})"/>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#diagonal)"/>
    <path d="M 358 138 H 666 V 216 H 552 V 438 H 472 V 216 H 358 Z" fill="#ffffff"/>
    ${detachedDetail ? '<rect x="420" y="500" width="184" height="44" fill="rgb(40,65,100)"/>' : ""}
  </svg>`)).png().toBuffer();
}

async function assertProminentPortraitArtwork(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 900, "sports art must use the full portrait output width");
  assert.equal(info.height, 1600, "sports art must be exactly 9:16");
  assert.equal(info.width / info.height, POSTER_RATIO);
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  const fieldCounts = { upper: [0, 0], lower: [0, 0] };
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * info.channels;
    const rgb = [data[offset], data[offset + 1], data[offset + 2]];
    if (rgb.every((value) => value > 235)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const region = y < info.height / 3 ? fieldCounts.upper : y >= info.height * 2 / 3 ? fieldCounts.lower : null;
    if (region) for (let color = 0; color < TEAM_FIELD.length; color++) {
      if (rgb.every((value, channel) => Math.abs(value - TEAM_FIELD[color][channel]) <= 3)) region[color]++;
    }
  }
  const markWidth = maxX - minX + 1, markHeight = maxY - minY + 1;
  assert.ok(markWidth >= info.width * 0.75 && markWidth <= info.width * 0.90, `team mark must occupy 75–90% of the portrait width, got ${markWidth}/${info.width}`);
  assert.ok(markHeight >= info.height * 0.35 && markHeight <= info.height * 0.65, `team mark must have substantial portrait height, got ${markHeight}/${info.height}`);
  assert.ok(minX > 0 && maxX < info.width - 1 && minY > 0 && maxY < info.height - 1, "the complete mark must remain inside the frame");
  for (const [region, counts] of Object.entries(fieldCounts)) for (const [color, count] of counts.entries()) {
    assert.ok(count > 4000, `${region} portrait field must retain source pattern color ${color}; found ${count} pixels`);
  }
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
  for (const genre of SPORT_KINDS) assert.equal(preservesSportsArtwork({ ...RAYS, genre }), true, `${genre} must share the sports artwork policy`);
  for (const event of [{ ...RAYS, segment: "Music" }, { name: "Tampa Bay Rays Fan Fest" }, { name: "MLB Baseball", genre: "Baseball", subGenre: "MLB" }, null, undefined, 3, "Sports", {}]) {
    assert.equal(preservesSportsArtwork(event), false, "names and leagues must not invent the sports segment");
  }
});

await check("every sporting kind uses its own provider image and never substitutes a fixed poster", async () => {
  const source = await centeredTeamFixture();
  for (const genre of SPORT_KINDS) {
    const slug = genre.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const event = { ...RAYS, id: `sport-${slug}`, name: `${genre} fixture`, genre, image: `https://provider.example/${slug}.png`, dest: `/events/sport-${slug}` };
    const requested = [];
    const result = await buildEventPoster(event, { fetchImage: async (url) => { requested.push(url); return source; } });
    assert.equal(result.ok, true, `${genre} must produce usable event artwork`);
    assert.equal(result.strategy, "portrait-art");
    assert.equal(result.sourceUrl, event.image);
    assert.deepEqual(requested, [event.image], `${genre} must download this event's own art`);
    for (const key of ["id", "name", "genre", "segment", "dest"]) assert.equal(result.event[key], event[key], `${genre}: ${key} must retain its identity`);
    const output = await sharp(result.buffer).metadata();
    assert.equal(output.width, 900);
    assert.equal(output.height, 1600);
    let invalidFetches = 0;
    for (const image of [null, ...RETIRED_SPORTS_ART]) {
      const invalid = { ...event, image, thumb: null, imageVariants: [] };
      assert.equal(eventMayHaveUsableProviderArt(invalid), false, `${genre} must reject missing/retired imagery before requesting a poster`);
      assert.equal((await buildEventPoster(invalid, { fetchImage: async () => { invalidFetches++; return source; } })).ok, false, `${genre} cannot revive a generic sports poster`);
    }
    assert.equal(invalidFetches, 0, `${genre}: no retired artwork may be downloaded`);
  }
});

await check("retired sports URLs are rejected without excluding real provider photos", () => {
  for (const image of RETIRED_SPORTS_ART) assert.equal(isNotEventArtwork(image), true, image);
  for (const image of [RAYS.image, "https://provider.example/photos/game.jpg?team=rays", "/events/verified-team-photo.webp", "https://provider.example/photo.jpg?reference=/posters/live/"]) {
    assert.equal(isNotEventArtwork(image), false, `${image}: an unrelated query value cannot replace the actual image path`);
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

await check("the team's logo fills a true 9:16 composition over its own patterned field", async () => {
  const source = await centeredTeamFixture();
  const requested = [];
  const result = await buildEventPoster(RAYS, { fetchImage: async (url) => { requested.push(url); return source; } });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "portrait-art");
  assert.equal(result.sourceUrl, RAYS.image);
  assert.deepEqual(requested, [RAYS.image], "the logo must come from this exact event's image");
  await assertProminentPortraitArtwork(result.buffer);
  for (const key of ["id", "name", "date", "time", "venue", "city", "source", "dest", "destKind", "url", "segment", "genre"]) assert.equal(result.event[key], RAYS[key], `${key} must pass through unchanged`);
});

await check("the composition check rejects the old landscape band even in a 9:16 file", async () => {
  const source = await centeredTeamFixture();
  const oldContained = await sharp(source).resize({ width: 900, height: 1600, fit: "contain", background: { r: 9, g: 34, b: 70 } }).png().toBuffer();
  await assert.rejects(() => assertProminentPortraitArtwork(oldContained), /team mark must occupy 75–90%/, "9:16 file dimensions alone must not make a small letterboxed logo pass");
});

await check("a broad team mark retains all four colored pieces inside the portrait", async () => {
  const source = await logoFixture();
  const result = await buildEventPoster(RAYS, { fetchImage: async () => source });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "portrait-art");
  const output = await colorCensus(result.buffer);
  assert.equal(output.info.width, 900);
  assert.equal(output.info.height, 1600);
  for (const [edge, pixels] of Object.entries(output.counts)) assert.ok(pixels > 2000, `${edge}: source feature disappeared (${pixels} pixels)`);
  assert.ok(output.minLeftX > 0 && output.maxRightX < output.info.width - 1, "both ends of the mark must fit inside the portrait");
});

await check("detached colored logo details must not disappear during mark extraction", async () => {
  const complete = await buildEventPoster(RAYS, { fetchImage: async () => centeredTeamFixture({ detachedDetail: true }) });
  const missingDetail = await buildEventPoster(RAYS, { fetchImage: async () => centeredTeamFixture() });
  assert.equal(complete.ok, true);
  assert.equal(missingDetail.ok, true);
  assert.equal(complete.buffer.equals(missingDetail.buffer), false, "a visible team detail outside the white mark must not be silently removed");
});

await check("faint complete team marks remain usable and prominent on light or dark fields", async () => {
  for (const [background, markColor] of [["#ffffff", "#e6e6e6"], ["#ffffff", "#dddddd"], ["#092246", "#19325a"]]) {
    const source = await sharp(Buffer.from(`<svg width="1024" height="576">
      <rect width="1024" height="576" fill="${background}"/>
      <path d="M 250 100 H 774 V 220 H 574 V 500 H 450 V 220 H 250 Z" fill="${markColor}"/>
    </svg>`)).png().toBuffer();
    const result = await buildEventPoster(RAYS, { fetchImage: async () => source });
    assert.equal(result.ok, true, `${markColor} on ${background}: readable artwork must not fall into the undersized photo crop`);
    assert.equal(result.strategy, "portrait-art");
    const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 900);
    assert.equal(info.height, 1600);
    const rgb = [1, 3, 5].map((offset) => parseInt(markColor.slice(offset, offset + 2), 16));
    let left = info.width, right = -1, top = info.height, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (rgb.every((value, channel) => Math.abs(data[offset + channel] - value) <= 2)) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    const width = right - left + 1, height = bottom - top + 1;
    assert.ok(width >= 700 && height >= 530, "the full faint mark must be enlarged, rather than disappearing or remaining a small inset");
    assert.ok(Math.abs(width / height - 524 / 400) < 0.025, "the complete T mark must retain its source proportions");
    assert.ok(left > 0 && right < info.width - 1 && top > 0 && bottom < info.height - 1, "no part of the faint mark may be clipped");
  }
});

await check("a photographic panel on a flat team field keeps the existing photo crop", async () => {
  const photograph = await sharp("public/events/community-kids.jpg").resize(580, 700, { fit: "cover" })
    .modulate({ brightness: 0.45 }).png().toBuffer();
  const source = await sharp({ create: { width: 2048, height: 1152, channels: 3, background: { r: 9, g: 34, b: 70 } } })
    .composite([{ input: photograph, left: 734, top: 226 }]).png().toBuffer();
  assert.ok((await sharp(source).stats()).entropy < 4.5, "the whole frame must exercise the misleading low-entropy case");
  assert.ok((await sharp(photograph).stats()).entropy > 4.5, "the panel must contain real photographic texture");
  const crop = await attemptAttentionCrop(source);
  assert.equal(crop.ok, true, "the same source must have a healthy ordinary crop");
  const expected = await sharp(crop.buffer).resize(900, 1600, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const result = await buildEventPoster(RAYS, { fetchImage: async () => source });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, "portrait-art");
  const { data, info } = await sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 900);
  assert.equal(info.height, 1600);
  assert.equal(data.equals(expected), true, "a photograph must not be masked or enlarged as a team logo");
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
  assert.equal(result.strategy, "portrait-art");
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
    assert.equal(result.strategy, "portrait-art");
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

await check("no fixed sports override or removed concert poster can reach the worker", () => {
  assert.deepEqual(Object.keys(LIVE_POSTER_TYPE_CONFIG), ["sports"]);
  assert.ok(!existsSync("public/posters/live/concerts-owner-20260920.webp"), "concert art must stay deleted");
  for (const image of RETIRED_SPORTS_ART.slice(0, 2)) assert.ok(!existsSync(`public${image}`), `${image}: retired sports art must stay deleted`);
  for (const file of ["lib/liveEventPosterTypes.js", "lib/livePosterSelection.js", "app/components/useLivePosterTiles.js"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /LIVE_POSTER_CONCERT_ART|isConcertEvent|concerts-owner|useOneLivePoster\("concerts"/, `${file}: removed concerts poster must not return`);
    assert.doesNotMatch(source, /livePosterArtFor|baseball-owner|["']owner-art["']/, `${file}: sporting events must not override their own team's image`);
  }
});

console.log(`test-live-poster-art: ${n} checks passed`);
