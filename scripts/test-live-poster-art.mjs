// scripts/test-live-poster-art.mjs
//
// Owner direction 2026-09-18: when the Sporting Events poster advertises a
// baseball game, the TILE shows Wayfind's own "Catch a Game" artwork. Only
// the picture changes; the event, its label and where a tap goes do not.
//
// Proves, against the real shipped modules:
//   1. A real Ticketmaster baseball event (shape copied from the live
//      /api/events response for Tampa on 2026-09-18) gets the owner art.
//   2. Other sports, concerts, and unclassified events keep their
//      Ticketmaster artwork (null = "use the existing fitted-art path").
//   3. A team name alone is never guessed into a sport.
//   4. Every art file the map points at exists, is WebP, and is 9:16 like
//      the rail tile (lib/posterImageFit.js POSTER_RATIO), so it fills the
//      tile without cropping the headline.
//   5. useLivePosterTiles.js wires it for the picture only: the owner-art
//      branch builds the tile through the same tileFor() as the fitted-art
//      branch, keeps the dest/name eligibility rule, and makes no fetch.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { LIVE_POSTER_SPORT_ART, sportOfEvent, livePosterArtFor } from "../lib/livePosterArt.js";
import { POSTER_RATIO } from "../lib/posterImageFit.js";

let n = 0;
const check = (label, fn) => { n++; fn(); console.log(`  OK  ${label}`); };

const RAYS = {
  id: "tm_Z7r9jZ1A7Q878", name: "Tampa Bay Rays vs. Boston Red Sox",
  genre: "Baseball", subGenre: "MLB", segment: "Sports", date: "2026-09-18",
  venue: "Tropicana Field", dest: "/events/saint-petersburg/tampa-bay-rays-vs-boston-red-sox--tm_Z7r9jZ1A7Q878",
};

check("a real Ticketmaster MLB game gets the baseball art on the sports poster", () => {
  assert.equal(sportOfEvent(RAYS), "baseball");
  assert.equal(livePosterArtFor("sports", RAYS), "/posters/live/baseball-760.webp");
});

check("league-only and name-only baseball still match", () => {
  assert.equal(sportOfEvent({ subGenre: "MLB", name: "x" }), "baseball");
  assert.equal(sportOfEvent({ genre: "", name: "Spring Training Baseball: Pirates vs Orioles" }), "baseball");
});

check("the concerts poster never takes sports art, even for a baseball event", () => {
  assert.equal(livePosterArtFor("concerts", RAYS), null);
});

check("other sports and non-sports keep their Ticketmaster artwork", () => {
  assert.equal(livePosterArtFor("sports", { ...RAYS, name: "Tampa Bay Buccaneers vs. Saints", genre: "Football", subGenre: "NFL" }), null);
  assert.equal(livePosterArtFor("sports", { ...RAYS, name: "Lightning vs Panthers", genre: "Hockey", subGenre: "NHL" }), null);
  assert.equal(livePosterArtFor("sports", { name: "Some Concert", genre: "Rock", segment: "Music" }), null);
});

check("a team name alone is never guessed into a sport", () => {
  assert.equal(sportOfEvent({ name: "Tampa Bay Rays Fan Fest", genre: "", subGenre: "" }), null);
  assert.equal(sportOfEvent({ name: "Baseballer Brewing trivia night" }), null);
});

check("junk input is safe", () => {
  for (const bad of [null, undefined, 3, "baseball", {}]) {
    assert.equal(livePosterArtFor("sports", bad), null);
  }
});

check("every mapped art file exists, is WebP, and is 9:16 like the tile", () => {
  for (const [sport, url] of Object.entries(LIVE_POSTER_SPORT_ART)) {
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
  }
});

check("the tile hook changes the picture only", () => {
  const src = readFileSync("app/components/useLivePosterTiles.js", "utf8");
  assert.match(src, /import \{ livePosterArtFor \} from "\.\.\/\.\.\/lib\/livePosterArt\.js";/);
  const branch = src.slice(src.indexOf("const ownerArt = livePosterArtFor(type, event);"), src.indexOf("let data = null;"));
  assert.ok(branch.length > 0, "owner-art branch not found before the fitted-art fetch");
  assert.match(branch, /if \(!event\.dest \|\| !event\.name\) continue;/, "owner art must keep the dest/name eligibility rule");
  assert.match(branch, /setTile\(\{ candidateKey, tile: tileFor\(type, config, event, ownerArt, "owner-art"\) \}\);/);
  assert.doesNotMatch(branch, /fetch\s*\(/, "owner art must not fetch anything");
  assert.match(src, /setTile\(\{ candidateKey, tile: tileFor\(type, config, data\.event \|\| \{\}, data\.dataUrl, data\.strategy \|\| null\) \}\);/, "fitted art must share the same tile builder and current-candidate identity");
  const builder = src.slice(src.indexOf("function tileFor("), src.indexOf("function useOneLivePoster("));
  assert.match(builder, /href: e\.dest \|\| null,/, "the tap destination stays the event's own dest");
  assert.match(builder, /opensPage: true,/);
});

console.log(`test-live-poster-art: ${n} checks passed`);
