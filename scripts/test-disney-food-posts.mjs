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

const dir = "app/guides/disney-world-holiday-food-guide-2026/";
const { default: FoodStop } = await loadComponent(path.resolve(dir + "FoodStop.js"), process.cwd());
const { default: FestivalBooths } = await loadComponent(path.resolve(dir + "FestivalBooths.js"), process.cwd());
const { default: CheckedCreatorPost, isInstagramRendered, CREATOR_POST_TIMEOUT_MS } = await loadComponent(path.resolve("app/components/CheckedCreatorPost.js"), process.cwd());
const { disneyFoodSpots, disneyMapPins } = await loadComponent(path.resolve(dir + "DisneyFoodMap.js"), process.cwd());

let count = 0;
for (const stop of [...DISNEY_FOOD_STOPS, CALIFORNIA_BONUS]) {
  const html = renderToStaticMarkup(React.createElement(FoodStop, { stop }));
  assert.equal((html.match(/data-creator-tile=/g) || []).length, stop.posts.length, stop.id + ": one rail tile per post");
  assert.ok(/role="region"/.test(html), stop.id + ": posts sit in the shared horizontal rail");
  assert.ok(!html.includes("<iframe"), stop.id + ": no provider player before a tap");
  for (const post of stop.posts) {
    assert.ok(html.includes('href="' + post.url + '"'), "direct source link: " + post.url);
    assert.ok(html.includes("@" + post.creator), "creator credited: " + post.creator);
    assert.ok(html.includes("Instagram controls playback"));
    count++;
  }
  assert.ok(!html.includes("/place-photos/"), "food media never substitutes a park photo");
  assert.ok(!html.includes("Food illustration"), "food media never substitutes generated dish art");
}
assert.equal(count, 9);
const missingHtml = renderToStaticMarkup(React.createElement(FoodStop, { stop: { ...CALIFORNIA_BONUS, posts: [] } }));
assert.equal((missingHtml.match(/data-creator-tile=/g) || []).length, 0, "negative control detects a removed source");

// Festival of the Holidays: the post, all 16 booths, numbered after EPCOT's other stops.
const epcotStops = DISNEY_FOOD_STOPS.filter((stop) => stop.parkId === "epcot").length;
const fest = renderToStaticMarkup(React.createElement(FestivalBooths, { festival: EPCOT_FESTIVAL, firstNumber: epcotStops + 1 }));
assert.equal(EPCOT_FESTIVAL.booths.length, 16, "every booth shown in the post is listed");
assert.ok(fest.includes('href="' + EPCOT_FESTIVAL.post.url + '"') && fest.includes("@disneyfoodblog"), "festival post is attributed and linked");
assert.ok(fest.includes('start="' + (epcotStops + 1) + '"'), "booth numbers continue after EPCOT's other stops");
for (const booth of EPCOT_FESTIVAL.booths) {
  assert.ok(fest.includes('id="booth-' + booth.id + '"'), "booth anchor: " + booth.id);
  assert.ok(booth.items.length && booth.items.every((item) => fest.includes(item.replace(/&/g, "&amp;"))), "booth items: " + booth.id);
  assert.ok(DISNEY_FOOD_PINS.epcot[booth.id], "booth pinned on the EPCOT map: " + booth.id);
}
assert.ok(/November 27 to December 30, 2026/.test(fest), "festival dates shown");
assert.ok(!/\$\d/.test(fest), "no invented prices for festival items");

// Map: every EPCOT card has a pin, pin numbers equal card ranks, booth cards open their list entry.
const spots = disneyFoodSpots(DISNEY_FOOD_STOPS, EPCOT_FESTIVAL);
const epcot = spots.filter((spot) => spot.groups[0] === "epcot");
assert.equal(epcot.length, epcotStops + 16);
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
console.log("test-disney-food-posts: OK — 9 attributed food posts in the shared creator rail (California included), festival post + 16 booths numbered and pinned, nothing loads before a tap, removed-source and invented-pin negative controls");
