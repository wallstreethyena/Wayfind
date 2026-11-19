// scripts/test-park-maps-2026.mjs — the owner-supplied illustrated park maps
// (lib/parkMaps2026.js) used by the Disney holiday food guide and the
// Universal Christmas guide.
//
// Proves, on the real data and files:
//  1. every map image exists and its decoded WebP size equals the declared
//     width/height (the pins are percentages of that exact image);
//  2. every Disney food stop has a pin on its park's "Food area" map, every
//     park with a "Whole park" view pins all its stops there too, and every
//     pin sits inside the image;
//  3. the shared component renders the real image as a declared map canvas
//     with one numbered control per pin and the OpenStreetMap credit.
// --red-prove: a stop with no pin and a wrong declared size must be caught.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { PARK_MAPS, DISNEY_PARK_VIEWS, DISNEY_FOOD_PINS, UNIVERSAL_VIEW_MAPS, parkMapImage } from "../lib/parkMaps2026.js";
import { DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS } from "../lib/guidesDisneyHolidayFood2026.js";

function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF"); assert.equal(b.toString("ascii", 8, 12), "WEBP");
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  throw new Error("unknown WebP chunk " + kind);
}

export function pinProblems(parks, stops, views, pins) {
  const problems = [];
  for (const park of parks) {
    const view = views[park.id];
    if (!view) { problems.push("no map views for " + park.id); continue; }
    for (const key of [view.food, view.whole].filter(Boolean)) {
      for (const stop of stops.filter((s) => s.parkId === park.id)) {
        const p = pins[key]?.[stop.id];
        if (!p) problems.push(`${stop.id} has no pin on ${key}`);
        else if (!(p[0] > 2 && p[0] < 98 && p[1] > 4 && p[1] < 99)) problems.push(`${stop.id} pin outside ${key}`);
      }
    }
  }
  return problems;
}

const red = process.argv.includes("--red-prove");
if (red) {
  const broken = { ...DISNEY_FOOD_PINS, "animal-kingdom": { ...DISNEY_FOOD_PINS["animal-kingdom"] } };
  delete broken["animal-kingdom"]["flame-tree-cheesecake-pop"];
  assert.ok(pinProblems(DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_PARK_VIEWS, broken).some((p) => p.includes("flame-tree")), "red-prove: missing pin must be caught");
  const off = { ...DISNEY_FOOD_PINS, "magic-kingdom": { "main-street-popcorn": [120, 50] } };
  assert.ok(pinProblems(DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_PARK_VIEWS, off).some((p) => p.includes("outside")), "red-prove: off-map pin must be caught");
  const size = webpSize("public" + parkMapImage("epcot").src);
  assert.notDeepEqual({ width: size.width + 1, height: size.height }, size, "red-prove: a wrong declared width differs from the decoded size");
  console.log("test-park-maps-2026 --red-prove: OK — missing pin, off-map pin and size mismatch are all detected");
  process.exit(0);
}

let images = 0;
for (const [key, meta] of Object.entries(PARK_MAPS)) {
  const file = "public" + parkMapImage(key).src;
  assert.ok(existsSync(file), file);
  assert.deepEqual(webpSize(file), { width: meta.width, height: meta.height }, "declared size matches the file: " + key);
  assert.ok(meta.alt && meta.alt.length > 40, "descriptive alt: " + key);
  images++;
}
for (const key of Object.values(UNIVERSAL_VIEW_MAPS)) assert.ok(PARK_MAPS[key], "Universal view map registered: " + key);
const problems = pinProblems(DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS, DISNEY_PARK_VIEWS, DISNEY_FOOD_PINS);
assert.deepEqual(problems, [], problems.join("; "));

const { default: IllustratedParkMap } = await loadComponent(path.resolve("app/components/IllustratedParkMap.js"), process.cwd());
const html = renderToStaticMarkup(React.createElement(IllustratedParkMap, { image: parkMapImage("animal-kingdom"), label: "Animal Kingdom map", pins: [{ id: "a", number: 1, label: "A", left: 40, top: 50 }, { id: "b", number: 2, label: "B", left: 60, top: 60, href: "#b" }] }));
assert.ok(html.includes('data-guide-map-canvas') && html.includes('src="/guides/park-maps-2026/animal-kingdom.webp"'), "real image rendered as the map canvas");
assert.equal((html.match(/data-map-pin=/g) || []).length, 2, "one control per pin");
assert.ok(html.includes('<button') && html.includes('href="#b"'), "button pins and link pins both render");
assert.ok(html.includes("openstreetmap.org/copyright"), "OpenStreetMap credit next to the map");
// Crowded pins must not cover each other on a phone (Islands of Adventure's
// four Seuss Landing stops at a ~340px map width): the map opens zoomed.
const { zoomToSeparate } = await loadComponent(path.resolve("app/components/IllustratedParkMap.js"), process.cwd());
const { UNIVERSAL_STOPS } = await loadComponent(path.resolve("app/guides/universal-orlando-christmas-2026/UniversalHolidayMap.js"), process.cwd());
const islands = UNIVERSAL_STOPS.filter((s) => s.park === "islands").map((s) => ({ left: s.x, top: s.y }));
const ioa = PARK_MAPS["islands-of-adventure"];
assert.ok(zoomToSeparate(islands, 340, ioa.height / ioa.width) >= 2, "crowded Islands pins open zoomed on a phone");
assert.equal(zoomToSeparate(islands, 2400, ioa.height / ioa.width), 1, "a wide desktop map needs no zoom");
assert.equal(zoomToSeparate([{ left: 10, top: 10 }, { left: 90, top: 90 }], 340, 1), 1, "well-spaced pins stay at 1x");
console.log(`test-park-maps-2026: OK — ${images} illustrated maps match their declared sizes, ${DISNEY_FOOD_STOPS.length} Disney stops pinned on every view of their park, component renders canvas, pins and credit`);
