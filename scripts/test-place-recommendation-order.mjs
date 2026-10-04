#!/usr/bin/env node
// Execute the real event/guide nearby and shared hotel card chains against the
// reported score inversions. Sorting is presentation-only: identity, admission,
// slot labels, practical hotel selection, and the existing score formula stay.
import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const script = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(script));
const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const defaultJsLoader = Module._extensions[".js"];
const defaultModuleLoad = Module._load;
const mutation = process.argv.includes("--mutation-preserve-order");
const orderPath = path.join(root, "lib/placeRecommendationOrder.js");
const stayCardsPath = path.join(root, "app/components/EventStayCards.js");
const mapContextPath = path.join(root, "app/components/EventMapPlaces.js");
const staysPath = path.join(root, "app/components/EventStays.js");
const mapLoaderPath = path.join(root, "app/components/EventVenueMapLoader.js");
let nearbyPins = [];
let stayPins = [];

// Next's real compiler and real card components; only async/browser leaves
// are doubled. Run EventStayCards' real publish effect with a local sink so
// the test observes the actual hotel pins, not a second reconstructed list.
Module._extensions[".js"] = (module, filename) => {
  const relative = path.relative(root, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("node_modules")) return defaultJsLoader(module, filename);
  let source = fs.readFileSync(filename, "utf8");
  if (mutation && filename === orderPath) {
    const comparator = ".sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.index - b.index)";
    assert.ok(source.includes(comparator), "negative-control mutation targets the shipped score comparator");
    source = source.replace(comparator, ".sort((a, b) => a.index - b.index)");
  }
  const transformed = transformSync(source, {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  module._compile(transformed.code, filename);
};
Module._load = function load(request, parent, isMain) {
  let resolved = "";
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch {}
  if (request === "react" && parent?.filename === stayCardsPath) return { ...React, useEffect: (effect) => { effect(); } };
  if (resolved === mapContextPath && parent?.filename === stayCardsPath) return {
    __esModule: true,
    useEventMapPlaces: () => ({ setStays: (pins) => { stayPins = pins; } }),
    eventStayMapPins: require("../lib/eventMapPlaces.js").eventStayMapPins,
  };
  if (resolved === staysPath) return { __esModule: true, default: () => null };
  if (resolved === mapLoaderPath) return { __esModule: true, default: ({ picks }) => { nearbyPins = picks; return null; } };
  return defaultModuleLoad.call(this, request, parent, isMain);
};

const { orderPlaceRecommendations, placeRecommendationDisplayScore } = require("../lib/placeRecommendationOrder.js");
const { wayfindScore } = require("../lib/wayfindScore.js");
const { toDisplayScore } = require("../lib/score.js");
const { eventNearbyPlaces, default: EventWhere } = require("../app/components/EventWhere.js");
const EventNearbyCards = require("../app/components/EventNearbyCards.js").default;
const EventStayCards = require("../app/components/EventStayCards.js").default;
const { chooseEventPlanPlaces } = require("../app/events/[city]/[slug]/EventPlan.js");
const { selectEventStays, venueStayRank } = require("../lib/eventStays.js");
const ids = (rows) => rows.map((row) => row.id);
const htmlIds = (html) => [...html.matchAll(/data-place-id="([^"]+)"/g)].map((match) => match[1]);
const htmlBadgeScores = (html) => [...html.matchAll(/aria-label="Wayfind Score ([\d.]+) out of 10/g)].map((match) => Number(match[1]));
const assertDescending = (rows) => {
  assert.ok(rows.length > 1, "the order probe exercises a nonempty multi-card list");
  for (let i = 1; i < rows.length; i++) {
    assert.ok((placeRecommendationDisplayScore(rows[i - 1]) ?? -Infinity) >= (placeRecommendationDisplayScore(rows[i]) ?? -Infinity), "recommendation order must descend by its displayed score");
  }
};

const row = (index, score, extra = {}) => Object.freeze({
  id: `ChIJRecommendationFixture${index}`, name: `Fixture Place ${index}`,
  href: `/p/ChIJRecommendationFixture${index}`, detailHref: `/p/ChIJRecommendationFixture${index}`,
  lat: 27.945 + index / 10000, lng: -82.47, distMi: 0.2 + index / 10,
  rating: 4.5, reviews: 3000, wfScore: score, governed_score: score,
  types: ["restaurant"], primaryType: "restaurant", category: "Restaurant",
  outing: { railTitle: "After you've had your fill", railNote: "Useful stops near the festival.", slotKey: `slot-${index}`, slotLabel: `Slot ${index}`, timing: index % 2 ? "before" : "after" },
  rankingNote: `Slot ${index} · 0.5 mi from the venue`, ...extra,
});

// Original Hyde Park guide symptom and stable hotel tie, supplied as they
// reached the shared components. Frozen rows detect accidental score edits.
const nearby = Object.freeze([row(1, 82), row(2, 92), row(3, 84), row(4, 80), row(5, 90)]);
const lodging = { types: ["hotel"], primaryType: "hotel", category: "hotels" };
const hotels = Object.freeze([row(11, 90, lodging), row(12, 83, lodging), row(13, 78, lodging), row(14, 90, lodging)]);
assert.throws(() => assertDescending(nearby), /recommendation order/, "the reported nearby control genuinely violates the invariant");
assert.throws(() => assertDescending(hotels), /recommendation order/, "the reported hotel control genuinely violates the invariant");
const orderedNearby = orderPlaceRecommendations(nearby);
assert.deepEqual(ids(orderedNearby), ids([nearby[1], nearby[4], nearby[2], nearby[0], nearby[3]]), "recommendation order must repair the reported nearby inversion");
assertDescending(orderedNearby);
assert.deepEqual(ids(orderPlaceRecommendations(hotels)), ids([hotels[0], hotels[3], hotels[1], hotels[2]]), "equal 9.0 hotel badges keep their incoming order");
assert.deepEqual(nearby.map((p) => p.wfScore), [82, 92, 84, 80, 90], "ordering never changes the input array or score values");
assert.ok(orderedNearby.every((p) => nearby.includes(p)), "ordering retains original row objects and slot metadata");

// Same contract as IconicPlaceCard: governed number beats a different stored
// number, otherwise stored numeric strings, otherwise the canonical formula.
const governed = row(20, 96, { governed_score: 85, affinity: 999999, _fit: 999999 });
const stored = row(21, "92", { governed_score: undefined });
const formula = row(22, undefined, { governed_score: undefined, rating: 4.8, reviews: 4000 });
const pending = row(23, null, { governed_score: undefined, rating: 0, reviews: 0 });
assert.equal(placeRecommendationDisplayScore(governed), 8.5, "the authoritative governed score is the badge contract");
assert.equal(placeRecommendationDisplayScore(stored), 9.2, "stored numeric strings retain the existing display contract");
assert.equal(placeRecommendationDisplayScore(formula), toDisplayScore(wayfindScore(4.8, 4000)), "rating-only rows use the existing canonical formula");
assert.equal(placeRecommendationDisplayScore(pending), null, "unrated rows do not acquire a score");
assert.deepEqual(ids(orderPlaceRecommendations([governed, pending, stored, formula])), ids([formula, stored, governed, pending]), "affinity cannot outrank a higher displayed badge and pending stays last");
const contractHtml = renderToStaticMarkup(React.createElement(EventNearbyCards, { places: [governed, stored, formula] }));
assert.deepEqual(htmlBadgeScores(contractHtml), [formula, stored, governed].map(placeRecommendationDisplayScore), "the ordering reader matches the actual IconicPlaceCard badge across governed, stored and formula rows");
const roundedTies = [row(24, 90.1), row(25, 90.4), row(26, 90.2)];
assert.deepEqual(ids(orderPlaceRecommendations(roundedTies)), ids(roundedTies), "equal displayed tenths keep stable order despite different hidden precision");
assert.deepEqual(orderPlaceRecommendations(null), [], "an absent recommendation array is a total empty result");

// Execute the real shared event/guide map and card admission. The map leaf
// receives the exact ordered rows that the real IconicPlaceCard chain renders.
const invalid = row(30, 100, { lat: NaN });
const admitted = eventNearbyPlaces([...nearby, invalid], true);
assert.deepEqual(ids(admitted), ids(orderedNearby), "admission remains intact and the surviving recommendations descend");
assert.deepEqual(eventNearbyPlaces(nearby, false), [], "address-only events still cannot claim nearby pins");
const nearbyHtml = renderToStaticMarkup(React.createElement(EventWhere, { venue: "Hyde Park fixture", address: "1 Fixture St", lat: 27.945, lng: -82.47, picks: [...nearby, invalid] }));
assert.deepEqual(htmlIds(nearbyHtml), ids(orderedNearby), "real shared event/guide cards display descending score");
assert.deepEqual(htmlBadgeScores(nearbyHtml), [9.2, 9, 8.4, 8.2, 8], "the real rendered nearby badges descend, not merely a separately computed sort key");
assert.deepEqual(ids(nearbyPins), htmlIds(nearbyHtml), "nearby map pins and cards share the exact ordered identity list");
assert.ok(!nearbyHtml.includes(invalid.name), "invalid map/card rows remain excluded");
for (const place of nearby) assert.ok(nearbyHtml.includes(place.rankingNote), "sorting retains each place's own outing slot note");
const directNearbyHtml = renderToStaticMarkup(React.createElement(EventNearbyCards, { places: nearby }));
assert.deepEqual(htmlIds(directNearbyHtml), ids(orderedNearby), "a direct nearby renderer also repairs an old unordered cache list");

// The shared hotel renderer serves events, destination posters and Fall hotel
// recommendations. Its actual publish effect must send the displayed order.
const hotelHtml = renderToStaticMarkup(React.createElement(EventStayCards, { places: hotels }));
const orderedHotels = orderPlaceRecommendations(hotels);
assert.deepEqual(htmlIds(hotelHtml), ids(orderedHotels), "real hotel cards sort the reported hotel inversion");
assert.deepEqual(htmlBadgeScores(hotelHtml), [9, 9, 8.3, 7.8], "the shared hotel's actual rendered badges descend with stable ties");
assert.deepEqual(ids(stayPins), htmlIds(hotelHtml), "the real hotel publish effect keeps map/card identity and rank parity");
assert.deepEqual(stayPins.map((p) => p.mapRank), [1, 2, 3, 4], "hotel pins carry the displayed ranks after sorting");
assertDescending(stayPins);
const origin = { lat: 27.945, lng: -82.47 };
const practical = [row(31, 83, { types: ["hotel"], distMi: 0.2 }), row(32, 92, { types: ["hotel"], distMi: 6 })];
assert.deepEqual(ids(venueStayRank(practical, 1)), [practical[0].id], "a bounded practical stay selection still favors the room close to the event");
assert.deepEqual(ids(venueStayRank(practical, 2)), [practical[1].id, practical[0].id], "once selected, venue stays display descending score");
const selectedHotels = selectEventStays([...hotels, hotels[0], row(33, 100, { types: ["cafe"] }), row(34, 100, { ...lodging, lat: 28.9 }), row(35, 100, { ...lodging, status: "CLOSED_PERMANENTLY" })], origin);
assert.deepEqual(ids(selectedHotels), ids(orderedHotels), "hotel lodging, radius, dedupe, and operational filters remain unchanged");
const equallyScoredHotels = [row(39, 90, { ...lodging, lat: origin.lat + 0.04 }), row(40, 90, { ...lodging, lat: origin.lat + 0.001 })];
assert.deepEqual(ids(selectEventStays(equallyScoredHotels, origin)), ids([equallyScoredHotels[1], equallyScoredHotels[0]]), "the hotel selector retains its existing nearest-first tie for equal raw scores");
assert.deepEqual(ids(orderPlaceRecommendations(equallyScoredHotels)), ids(equallyScoredHotels), "the shared renderer retains incoming equal-score order without applying its own proximity sort");

// The live-event Complete the Plan rails formerly used an independent rating
// + review-volume rank. Execute their actual selector with raw/legacy shapes.
const plan = chooseEventPlanPlaces([governed, stored, formula, row(36, 100, { name: "Event Hall" }), row(37, 100), row(38, 100, { lat: 28.9 })], origin, "Event Hall", new Set(["ChIJRecommendationFixture37"]), 8);
assert.deepEqual(ids(plan), ids([formula, stored, governed]), "the live-event plan preserves exclusions/radius and follows its own rendered badges");
assertDescending(plan);
const legacy = chooseEventPlanPlaces([{ id: "legacy", displayName: { text: "Legacy Hotel" }, score: 95, rating: 4.7, userRatingCount: 3000 }], origin, "");
assert.equal(legacy[0].name, "Legacy Hotel", "raw display names remain usable");
assert.equal(placeRecommendationDisplayScore(legacy[0]), 9.5, "the legacy score field is normalized onto the same displayed contract");
assert.equal(legacy[0].reviews, 3000, "raw review counts reach the canonical fallback scorer");

// Exercise the real producer as well: useful before/after picks are selected
// by the outing engine, then the chosen rows must follow the visible badges.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
const { eventPairings } = require("../lib/eventPairings.js");
const inventoryRow = (id, type, rating, extra = {}) => ({
  place_id: id, name: id, lat: origin.lat + 0.001, lng: origin.lng,
  primary_type: type, google_types: [type], category: /bar/.test(type) ? "nightlife" : "food",
  signals: { rating, reviews: 4000, priceNum: 2 }, status: "OPERATIONAL",
  photo_ref: `places/${id}/photos/fixture`, ...extra,
});
const foodRows = [inventoryRow("dinner-low", "restaurant", 4.2), inventoryRow("dinner-good", "seafood_restaurant", 4.5)];
const drinkRows = [inventoryRow("nightcap-high", "cocktail_bar", 4.9), inventoryRow("wine-high", "wine_bar", 4.8)];
const produced = await eventPairings({ ...origin, city: "Tampa", name: "Indie Rock Night", segment: "Music", genre: "Rock", time: "20:00", place_id: "event-hall" }, { fetchImpl: async (url) => ({ ok: true, json: async () => String(url).includes("category=eq.food") ? foodRows : String(url).includes("category=eq.nightlife") ? drinkRows : [] }) });
assert.equal(produced.length, 4, "all four useful selected places survive presentation ordering");
assert.ok(produced.some((p) => p.outing.timing === "before") && produced.some((p) => p.outing.timing === "after"), "producer sorting preserves useful before/after slot coverage");
assertDescending(produced);
assert.ok(produced.every((p) => p.wfScore === p.governed_score), "producer map/detail and card scores remain identical");

if (!mutation) {
  const negative = spawnSync(process.execPath, [script, "--mutation-preserve-order"], { cwd: root, encoding: "utf8" });
  assert.equal(negative.status, 1, "reintroducing unsorted presentation must fail the actual guard process");
  assert.match(negative.stderr, /recommendation order must repair/, "the negative process fails specifically on the original ordering defect");
}
console.log("test-place-recommendation-order: OK — displayed-score contract, stable ties, real nearby/hotel map-card parity, outing selection and live-event plan; unsorted mutation exits 1");
