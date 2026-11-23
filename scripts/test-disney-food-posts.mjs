// scripts/test-disney-food-posts.mjs — the Disney food guide's creator posts
// render through the shared guide creator rail (CreatorPostRail), every source
// stays attributed (California included), nothing loads before a tap, and the
// EPCOT Festival of the Holidays post and all 16 booths render with the numbers
// their map pins use. Renders the REAL components (jsxLoad), not source strings.
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { DISNEY_FOOD_STOPS, CALIFORNIA_BONUS, EPCOT_FESTIVAL } from "../lib/guidesDisneyHolidayFood2026.js";
import { DISNEY_FOOD_PINS } from "../lib/parkMaps2026.js";
import { embedSrc } from "../lib/videoEmbed.js";
// Owner 2026-11-20: only posts Instagram plays inside Wayfind render; never a link out.
const plays = (post) => Boolean(embedSrc("instagram", post.url));

const dir = "app/guides/disney-world-holiday-food-guide-2026/";
const { default: FoodStop } = await loadComponent(path.resolve(dir + "FoodStop.js"), process.cwd());
const { default: FestivalBooths } = await loadComponent(path.resolve(dir + "FestivalBooths.js"), process.cwd());
const { default: CheckedCreatorPost, isInstagramRendered, CREATOR_POST_TIMEOUT_MS } = await loadComponent(path.resolve("app/components/CheckedCreatorPost.js"), process.cwd());
const { disneyFoodSpots, disneyMapPins } = await loadComponent(path.resolve(dir + "DisneyFoodMap.js"), process.cwd());

let count = 0;
for (const stop of [...DISNEY_FOOD_STOPS, CALIFORNIA_BONUS]) {
  const html = renderToStaticMarkup(React.createElement(FoodStop, { stop }));
  const playing = stop.posts.filter(plays);
  assert.equal((html.match(/data-creator-tile=/g) || []).length, playing.length, stop.id + ": one rail tile per post that plays here");
  if (playing.length) assert.ok(/role="region"/.test(html), stop.id + ": posts sit in the shared horizontal rail");
  assert.ok(!html.includes("<iframe"), stop.id + ": no provider player before a tap");
  assert.ok(!/<a\b[^>]*instagram\.com/.test(html), stop.id + ": no link out to Instagram");
  for (const post of playing) {
    assert.ok(html.includes("@" + post.creator), "creator credited: " + post.creator);
    assert.ok(html.includes("Instagram controls playback"));
    count++;
  }
  assert.ok(!html.includes("/place-photos/"), "food media never substitutes a park photo");
  assert.ok(!html.includes("Food illustration"), "food media never substitutes generated dish art");
}
assert.equal(count, [...DISNEY_FOOD_STOPS, CALIFORNIA_BONUS].flatMap((s) => s.posts).filter(plays).length);
assert.ok(count > 0, "at least one food post still plays inside Wayfind");
const missingHtml = renderToStaticMarkup(React.createElement(FoodStop, { stop: { ...CALIFORNIA_BONUS, posts: [] } }));
assert.equal((missingHtml.match(/data-creator-tile=/g) || []).length, 0, "negative control detects a removed source");

// Festival of the Holidays: the post, all 16 booths, numbered after EPCOT's other stops.
const epcotStops = DISNEY_FOOD_STOPS.filter((stop) => stop.parkId === "epcot").length;
const fest = renderToStaticMarkup(React.createElement(FestivalBooths, { festival: EPCOT_FESTIVAL, firstNumber: epcotStops + 1 }));
assert.equal(EPCOT_FESTIVAL.booths.length, 16, "every booth shown in the post is listed");
assert.ok(plays(EPCOT_FESTIVAL.post) && fest.includes("data-creator-tile") && fest.includes("@disneyfoodblog") && !/<a\b[^>]*instagram\.com/.test(fest), "festival post plays here, credited, with no link out");
assert.ok(fest.includes('start="' + (epcotStops + 1) + '"'), "booth numbers continue after EPCOT's other stops");
for (const booth of EPCOT_FESTIVAL.booths) {
  assert.ok(fest.includes('id="booth-' + booth.id + '"'), "booth anchor: " + booth.id);
  assert.ok(booth.items.length && booth.items.every((item) => fest.includes(item.replace(/&/g, "&amp;"))), "booth items: " + booth.id);
  assert.ok(DISNEY_FOOD_PINS.epcot[booth.id], "booth pinned on the EPCOT map: " + booth.id);
}
assert.ok(/November 27 to December 30, 2026/.test(fest), "festival dates shown");
assert.ok(!/\$\d/.test(fest), "no invented prices for festival items");

// Map: treat stops without a registered photo stay off the rail; festival
// booths still appear. Every visible EPCOT card has a pin, pin numbers equal
// card ranks, and booth cards open their list entry.
const spotsBare = disneyFoodSpots(DISNEY_FOOD_STOPS, EPCOT_FESTIVAL);
const epcotBare = spotsBare.filter((spot) => spot.groups[0] === "epcot");
assert.equal(epcotBare.length, 16, "photoless treat stops stay off the map; all 16 booths remain");
assert.ok(!epcotBare.some((s) => s.id === "san-angel-margarita"), "San Angel stays off the map until it has a photo of the drink");
const withPhoto = { "san-angel-margarita": { src: "/test-san-angel.jpg", credit: "Walt Disney World", creditHref: "https://disneyparksblog.com/" } };
const spots = disneyFoodSpots(DISNEY_FOOD_STOPS, EPCOT_FESTIVAL, withPhoto);
const epcot = spots.filter((spot) => spot.groups[0] === "epcot");
assert.equal(epcot.length, 1 + 16);
assert.equal(epcot[0].id, "san-angel-margarita");
assert.equal(epcot[0].image, "/test-san-angel.jpg");
assert.equal(epcot[0].photoAttr, "Walt Disney World");
const pins = disneyMapPins("epcot", epcot);
assert.equal(pins.length, epcot.length, "every EPCOT card has a pin");
pins.forEach((pin, i) => assert.equal(pin.number, i + 1, "pin number matches card rank"));
for (const booth of EPCOT_FESTIVAL.booths) assert.equal(epcot.find((s) => s.id === booth.id).href, "#booth-" + booth.id);
const noPin = disneyMapPins("epcot", [...epcot, { id: "not-a-booth", name: "x" }]);
assert.equal(noPin.length, epcot.length, "negative control: a card without a known spot gets no invented pin");

// Black-box fix (2026-11-19): only Instagram's own render signal reveals the player.
assert.equal(isInstagramRendered('{"details":{},"type":"MOUNTED"}'), true);
assert.equal(isInstagramRendered({ type: "MEASURE", details: { height: 651 } }), true);
assert.equal(isInstagramRendered('{"details":{},"type":"LOADING"}'), false, "loading ping is not a rendered post");
assert.equal(isInstagramRendered({ type: "MEASURE", details: { height: 0 } }), false, "zero-height measure is not a rendered post");
assert.equal(isInstagramRendered("not json"), false);
assert.equal(isInstagramRendered(null), false);
assert.ok(CREATOR_POST_TIMEOUT_MS >= 5000 && CREATOR_POST_TIMEOUT_MS <= 12000, "fallback waits long enough for a slow embed, not forever");
const firstPaint = renderToStaticMarkup(React.createElement(CheckedCreatorPost, { post: DISNEY_FOOD_STOPS[0].posts[0] }));
assert.ok(firstPaint.includes('data-creator-post-state="idle"') && !firstPaint.includes("<iframe"), "no player (and no black frame) before the tap");
console.log("test-disney-food-posts: OK — every playable food post in the shared creator rail with no link out (California included), festival post + 16 booths numbered and pinned, nothing loads before a tap, removed-source and invented-pin negative controls");
