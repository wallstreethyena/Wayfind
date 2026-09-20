// scripts/test-live-poster-art.mjs
//
// Owner directions 2026-09-18 and 2026-09-20: baseball uses "Catch a Game"
// and eligible music events use "Live Tonight." Only the tile picture changes.
//
// Proves, against the real shipped modules:
//   1. A real Ticketmaster baseball event (shape copied from the live
//      /api/events response for Tampa on 2026-09-18) gets the owner art.
//   2. Other sports and cross-bucket events keep provider artwork.
//   3. A team name alone is never guessed into a sport.
//   4. Every art file the map points at exists, is WebP, and is 9:16 like
//      the rail tile (lib/posterImageFit.js POSTER_RATIO), so it fills the
//      tile without cropping the headline.
//   5. The lazy live-poster worker wires it for the picture only: the owner-art
//      branch builds the tile through the same tileFor() as the fitted-art
//      branch, keeps the dest/name eligibility rule, and makes no fetch.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import {
  LIVE_POSTER_CONCERT_ART, LIVE_POSTER_SPORT_ART,
  isConcertEvent, sportOfEvent, livePosterArtFor,
} from "../lib/livePosterArt.js";
import { POSTER_RATIO } from "../lib/posterImageFit.js";

let n = 0;
const check = (label, fn) => { n++; fn(); console.log(`  OK  ${label}`); };

const RAYS = {
  id: "tm_Z7r9jZ1A7Q878", name: "Tampa Bay Rays vs. Boston Red Sox",
  genre: "Baseball", subGenre: "MLB", segment: "Sports", date: "2026-09-18",
  venue: "Tropicana Field", dest: "/events/saint-petersburg/tampa-bay-rays-vs-boston-red-sox--tm_Z7r9jZ1A7Q878",
};

const OWNER_ART_SHA256 = Object.freeze({
  baseball: "30617ef805fd94afdb4e4bd5da6074a68bec914bc3abf8095219a08277d20f76",
  concerts: "447444de0f8826017141ca423ca6dbe5b225bb09a38c81e4f59d6c0de20bf8d3",
});

check("a real Ticketmaster MLB game gets the baseball art on the sports poster", () => {
  assert.equal(sportOfEvent(RAYS), "baseball");
  assert.equal(livePosterArtFor("sports", RAYS), "/posters/live/baseball-owner-20260920.webp");
});

check("league-only and name-only baseball still match", () => {
  assert.equal(sportOfEvent({ subGenre: "MLB", name: "x" }), "baseball");
  assert.equal(sportOfEvent({ genre: "", name: "Spring Training Baseball: Pirates vs Orioles" }), "baseball");
});

check("an eligible music event gets concert art without crossing buckets", () => {
  const music = { name: "Live Tonight", segment: "Music", genre: "Rock" };
  assert.equal(isConcertEvent(music), true);
  assert.equal(livePosterArtFor("concerts", music), LIVE_POSTER_CONCERT_ART);
  assert.equal(livePosterArtFor("concerts", RAYS), null);
  assert.equal(livePosterArtFor("sports", music), null);
  assert.equal(isConcertEvent({ name: "Marching Band Concert", segment: "Sports", genre: "Football" }), false);
});

check("other sports and non-sports keep their Ticketmaster artwork", () => {
  assert.equal(livePosterArtFor("sports", { ...RAYS, name: "Tampa Bay Buccaneers vs. Saints", genre: "Football", subGenre: "NFL" }), null);
  assert.equal(livePosterArtFor("sports", { ...RAYS, name: "Baseball Night: Buccaneers vs Saints", genre: "Football", subGenre: "NFL" }), null);
  assert.equal(livePosterArtFor("sports", { ...RAYS, name: "Lightning vs Panthers", genre: "Hockey", subGenre: "NHL" }), null);
  assert.equal(livePosterArtFor("sports", { name: "Some Concert", genre: "Rock", segment: "Music" }), null);
  assert.equal(livePosterArtFor("sports", { name: "Baseball Live", genre: "Baseball", subGenre: "MLB", segment: "Music" }), null);
  assert.equal(livePosterArtFor("sports", { name: "Orlando City", genre: "Soccer", segment: "Sports" }), null);
});

check("a team name alone is never guessed into a sport", () => {
  assert.equal(sportOfEvent({ name: "Tampa Bay Rays Fan Fest", genre: "", subGenre: "" }), null);
  assert.equal(sportOfEvent({ name: "Baseballer Brewing trivia night" }), null);
});

check("junk input is safe", () => {
  for (const bad of [null, undefined, 3, "baseball", {}]) {
    assert.equal(livePosterArtFor("sports", bad), null);
    assert.equal(livePosterArtFor("concerts", bad), null);
  }
  assert.equal(livePosterArtFor("unknown", { segment: "Music" }), null);
});

check("every mapped art file exists, is WebP, and is 9:16 like the tile", () => {
  for (const [sport, url] of [...Object.entries(LIVE_POSTER_SPORT_ART), ["concerts", LIVE_POSTER_CONCERT_ART]]) {
    const file = `public${url}`;
    assert.ok(existsSync(file), `${sport}: ${file} is missing`);
    const b = readFileSync(file);
    assert.equal(b.toString("ascii", 0, 4), "RIFF", `${sport}: not a RIFF container`);
    assert.equal(b.toString("ascii", 8, 12), "WEBP", `${sport}: not WebP`);
    // VP8 (lossy) frame header: width/height are 14-bit LE at bytes 26 and 28.
    assert.equal(b.toString("ascii", 12, 16), "VP8 ", `${sport}: expected a lossy VP8 WebP`);
    const w = b.readUInt16LE(26) & 0x3fff, h = b.readUInt16LE(28) & 0x3fff;
    assert.ok(w >= 760, `${sport}: ${w}px wide is below the 760px rail-art standard`);
    assert.ok(Math.abs(w / h - POSTER_RATIO) < 0.01, `${sport}: ${w}x${h} is not 9:16`);
    assert.ok(b.length < 400 * 1024, `${sport}: ${b.length} bytes is too heavy for a rail tile`);
    assert.equal(createHash("sha256").update(b).digest("hex"), OWNER_ART_SHA256[sport], `${sport}: owner-approved pixels changed`);
  }
});

check("the tile hook changes the picture only", () => {
  const src = readFileSync("lib/livePosterSelection.js", "utf8");
  assert.match(src, /import \{ livePosterArtFor \} from "\.\/livePosterArt\.js";/);
  const branch = src.slice(src.indexOf("const ownerArt = livePosterArtFor(type, event);"), src.indexOf("let data = null;"));
  assert.ok(branch.length > 0, "owner-art branch not found before the fitted-art fetch");
  assert.match(branch, /if \(!event\.dest \|\| !event\.name\) continue;/, "owner art must keep the dest/name eligibility rule");
  assert.match(branch, /return tileFor\(type, config, event, ownerArt, "owner-art"\);/);
  assert.doesNotMatch(branch, /fetch\s*\(/, "owner art must not fetch anything");
  assert.match(src, /return tileFor\(type, config, data\.event \|\| \{\}, data\.dataUrl, data\.strategy \|\| null\);/, "fitted art must share the same tile builder");
  const builder = src.slice(src.indexOf("function tileFor("), src.indexOf("export async function resolveLivePosterTile("));
  assert.match(builder, /href: event\.dest \|\| null,/, "the tap destination stays the event's own dest");
  assert.match(builder, /opensPage: true,/);
});

console.log(`test-live-poster-art: ${n} checks passed`);
