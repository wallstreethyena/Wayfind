#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const defaultJsLoader = Module._extensions[".js"];
const defaultModuleLoad = Module._load;
const staysPath = path.join(root, "app/components/EventStays.js");

// Compile the real JSX graph with Next's own compiler. EventStays is a server
// data boundary covered by its own executable test; stub only that leaf so a
// synchronous React renderer can inspect EventWhere without querying storage.
Module._extensions[".js"] = (module, filename) => {
  const relative = path.relative(root, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("node_modules")) return defaultJsLoader(module, filename);
  const transformed = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  module._compile(transformed.code, filename);
};
Module._load = function load(request, parent, isMain) {
  let resolved = "";
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch {}
  if (resolved === staysPath) return { __esModule: true, default: () => createElement("section", { id: "event-stays" }, "Fixture stays") };
  if (request === "next/dynamic") return { __esModule: true, default: () => () => null };
  return defaultModuleLoad.call(this, request, parent, isMain);
};

const whereModule = require("../app/components/EventWhere.js");
const nearbyModule = require("../app/components/EventNearbyCards.js");
const EventWhere = whereModule.default;
const EventNearbyCards = nearbyModule.default;

const place = (id, name, rank) => ({
  id,
  name,
  href: `/p/${id}`,
  lat: 27.34 + rank / 100,
  lng: -82.55 - rank / 100,
  rating: 4.8,
  reviews: 1200 + rank,
  wfScore: 94 - rank,
  governed_score: 94 - rank,
  distMi: rank + 0.2,
  primaryType: "restaurant",
  types: ["restaurant", "food"],
  cat: "Restaurant",
  category: "Restaurant",
});

const valid = [
  place("ChIJFixtureAlpha0001", "Alpha Kitchen", 1),
  place("ChIJFixtureBravo0002", "Bravo Museum", 2),
  place("ChIJFixtureCharlie003", "Charlie Bar", 3),
];

// Positive control: execute the real rail and the real IconicPlaceCard chain.
const railHtml = renderToStaticMarkup(createElement(EventNearbyCards, { places: valid }));
assert.match(railHtml, /class="wf-rail wf-event-nearby-rail"/, "nearby results render in the canonical horizontal rail");
assert.equal((railHtml.match(/data-iconic-place-card/g) || []).length, 3, "every nearby result renders through IconicPlaceCard");
assert.ok(railHtml.indexOf("Alpha Kitchen") < railHtml.indexOf("Bravo Museum") && railHtml.indexOf("Bravo Museum") < railHtml.indexOf("Charlie Bar"), "the card rail preserves map order");
for (let rank = 1; rank <= 3; rank++) assert.match(railHtml, new RegExp(`aria-label="Rank ${rank}"`), `card ${rank} carries pin rank ${rank}`);
for (const actionClass of ["wf-place-card-save", "wf-place-card-like", "wf-place-card-dislike", "wf-place-card-share"]) {
  assert.equal((railHtml.match(new RegExp(actionClass, "g")) || []).length, 3, `all three house cards carry shared ${actionClass} behavior`);
}
assert.equal((railHtml.match(/wf-place-card-score/g) || []).length, 3, "every card displays a real supplied Wayfind Score");
assert.equal((railHtml.match(/loading="eager"/g) || []).length, 3, "every nearby image loads eagerly so horizontal scrolling cannot strand a lazy request");
assert.doesNotMatch(railHtml, /wfw-p|wfw-th/, "the retired standalone thumbnail card does not render");

// One ordered admission result feeds both map and rail. Reject every row that
// would create a false pin, an unscored card, a dead card, or a fake distance.
const invalid = [
  { ...place("ChIJNoScore00000004", "No Score", 4), wfScore: null },
  { ...place("ChIJNoPoint00000005", "No Point", 5), lat: NaN },
  { ...place("ChIJNoLink000000006", "No Link", 6), href: "" },
  { ...place("ChIJNoDistance000007", "No Distance", 7), distMi: NaN },
];
const admitted = whereModule.eventNearbyPlaces([valid[0], invalid[0], valid[1], invalid[1], valid[2], invalid[2], invalid[3]], true);
assert.deepEqual(admitted.map(({ id }) => id), valid.map(({ id }) => id), "pin/card admission removes invalid rows without changing surviving rank order");
assert.deepEqual(whereModule.eventNearbyPlaces(valid, false), [], "without a truthful event point there are no nearby pins or cards");

const whereHtml = renderToStaticMarkup(createElement(EventWhere, {
  venue: "Fixture Event Hall",
  address: "1 Test Way, Sarasota, FL",
  directionsHref: "https://maps.apple.com/?daddr=27.34,-82.55",
  lat: 27.34,
  lng: -82.55,
  picks: [...valid, ...invalid],
}));
assert.match(whereHtml, /id="event-location" data-event-section="Map &amp; directions" tabindex="-1"/, "the real map section exposes a keyboard-focusable navigation target");
assert.match(whereHtml, /id="event-nearby" data-event-section="Nearby places" tabindex="-1"/, "the real nearby region exposes its own keyboard-focusable navigation target inside the map section");
assert.match(whereHtml, /aria-label="Other places near Fixture Event Hall — not the venue itself"/, "nearby businesses retain their accessible distinction from the ticketed venue");
for (const item of valid) assert.match(whereHtml, new RegExp(item.name), `${item.name} renders in EventWhere`);
for (const item of invalid) assert.doesNotMatch(whereHtml, new RegExp(item.name), `${item.name} cannot render as a mismatched pin/card`);
assert.ok(whereHtml.indexOf('id="event-location"') < whereHtml.indexOf('id="event-nearby"'), "the nearby region is housed inside the outer map section");
assert.match(whereHtml, /Open in Apple Maps/, "the Apple Maps route remains available");
// Inspect rendered ancestry, not source position: both rails belong to the same card.
function ancestorTagsForId(html, id) {
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)([^>]*)>/gi)) {
    const [tag, name, attributes] = match;
    if (tag.startsWith("</")) { if (stack.at(-1)?.name === name) stack.pop(); continue; }
    if (attributes.includes(`id="${id}"`)) return stack;
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(name) && !tag.endsWith("/>")) stack.push({ name, attributes });
  }
  return [];
}
for (const id of ["event-nearby", "event-stays"]) {
  assert.ok(ancestorTagsForId(whereHtml, id).some(({ attributes }) => attributes.includes('class="wfw-card"')), `${id} is inside the Where it is card`);
}



const noPointHtml = renderToStaticMarkup(createElement(EventWhere, {
  venue: "Address-only Hall",
  address: "2 Test Way, Sarasota, FL",
  directionsHref: "https://maps.apple.com/?daddr=2+Test+Way",
  lat: NaN,
  lng: NaN,
  picks: valid,
}));
assert.doesNotMatch(noPointHtml, /id="event-nearby"|data-iconic-place-card/, "address-only events do not claim nearby map results");
assert.doesNotMatch(noPointHtml, /id="event-stays"/, "address-only events do not render an ungrounded hotel rail");
assert.match(noPointHtml, /Get directions/, "address-only events retain the Apple Maps fallback");

// Shared poster controls must target their own rail when Nearby and Stays coexist.
const EventPlaceRail = require("../app/components/EventPlaceRail.js").default;
const pairedRails = renderToStaticMarkup(createElement("div", null,
  createElement(EventPlaceRail, { title: "Nearby places", description: "Nearby picks by Wayfind Score.", label: "Nearby", count: 3 }, createElement("li", null, "Nearby fixture")),
  createElement(EventPlaceRail, { title: "Stay near this event", label: "Stays", count: 2 }, createElement("li", null, "Stay fixture")),
));
const railIds = [...pairedRails.matchAll(/data-rail="([^"]+)"/g)].map(m => m[1]);
assert.equal(railIds.length, 2, "both rails expose control targets");
assert.equal(new Set(railIds).size, 2, "multiple rails cannot share a paging target");
assert.equal((pairedRails.match(/class="wf-rail-heading"/g) || []).length, 2, "both use the home poster heading");
assert.equal((pairedRails.match(/aria-label="Next places"/g) || []).length, 2, "both offer shared forward paging");
assert.match(railHtml, /Nearby picks by Wayfind Score/, "compact copy retains the map relationship");
assert.doesNotMatch(whereHtml, /Worth a stop near|Separate places, not part/, "verbose duplicate heading does not return");
assert.equal(renderToStaticMarkup(createElement(EventPlaceRail, { title: "Empty", count: 0 })), "", "empty rails are hidden");

console.log("test-event-nearby-cards: OK — 38 assertions across the real EventWhere, EventNearbyCards, and IconicPlaceCard render chain; positive rail/actions and negative pin-card admission verified");

Module._extensions[".js"] = defaultJsLoader;
Module._load = defaultModuleLoad;
