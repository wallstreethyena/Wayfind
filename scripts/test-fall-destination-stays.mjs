import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { FALL_DESTINATION_NAME_DEDUPE_MI, fallStayDestinations } from "../lib/fallStayDestinations.js";
import { completePoolPlace, hotelMarketName, selectEventStays, completeEventStays, readCompleteStayPool } from "../lib/eventStays.js";
import { tripConnections } from "../lib/tripConnections.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const orlando = { lat: 28.474, lng: -81.468 };
const rails = [{ id: "theme-parks", cards: [
  { kind: "event", id: "event-1", place_id: "venue-1", title: "Halloween Night", venue: "Actual Event Gate", city: "Orlando", lat: 28.474, lng: -81.468 },
  { kind: "event", id: "event-2", place_id: "venue-1", title: "Second Date", venue: "Actual Event Gate", city: "Orlando", lat: 28.474, lng: -81.468 },
  { kind: "place", id: "venue-2", title: "Other Orlando Action", metro: "orlando", lat: 28.62, lng: -81.51 },
  { kind: "place", id: "outside", title: "Outside Florida", lat: 40.7, lng: -74 },
  { kind: "place", id: "partial", title: "Missing longitude", lat: 28.4 },
] }, { id: "farms", cards: [
  { kind: "event", id: "coordinate-only", title: "Farm Fall Night", venue: "Farm Fall Night", city: "Dade City", lat: 28.36, lng: -82.19 },
] }];

const destinations = fallStayDestinations(rails);
assert.deepEqual(destinations.map(({ name }) => name), ["Actual Event Gate", "Other Orlando Action", "Farm Fall Night"], "all valid full-answer destinations survive while repeated venues dedupe");
assert.deepEqual({ lat: destinations[0].lat, lng: destinations[0].lng }, orlando, "the default anchor is the displayed destination point, never reader coordinates");
assert.notEqual(destinations[0].id, destinations[1].id, "same-city destinations remain separate because one 12-mile hotel pool cannot stand in for another");

const seaworldDestinations = fallStayDestinations([{ id: "theme-parks", cards: [
  { kind: "event", id: "spooktacular", venue: "SeaWorld Orlando", city: "Orlando", lat: 28.4114, lng: -81.4633 },
  { kind: "place", id: "ChIJfyPWjCh-54gR1SvWozmef5k", title: "SeaWorld Orlando!", metro: "orlando", lat: 28.4110418, lng: -81.4612275 },
  { kind: "place", id: "same-name-distant", title: "SeaWorld Orlando", metro: "orlando", lat: 28.62, lng: -81.51 },
  { kind: "place", id: "neighbor", title: "Different Venue", metro: "orlando", lat: 28.4115, lng: -81.4632 },
] }]);
assert.equal(FALL_DESTINATION_NAME_DEDUPE_MI, 0.15, "the identity-repair radius stays campus-tight");
assert.deepEqual(seaworldDestinations.map(({ id }) => id), [
  "point:28.41140,-81.46330", "place:same-name-distant", "place:neighbor",
], "a nearby normalized-name event/place pair dedupes while same-name distant and differently named nearby destinations remain separate");

const stay = (id, score, extra = {}) => ({ id, name: id, types: ["hotel", "lodging"], lat: 28.48, lng: -81.47, address: "1 Hotel Way, Orlando, FL", wfScore: score, rating: 4.8, reviews: 1000, ...extra });
const selected = selectEventStays([stay("lower", 88), stay("higher", 97), stay("higher", 97), stay("wrong-city", 100, { lat: 27.3, lng: -82.5 })], orlando);
assert.deepEqual(selected.map(({ id }) => id), ["higher", "lower"], "hotel results dedupe, reject wrong-city rows, and remain Wayfind Score descending");

let staysOrigin = null;
let exactReads = 0;
const direct = await tripConnections({ mode: "stays", ...orlando }, {
  readExact: async () => { exactReads++; return []; },
  readDestinationStays: async (origin) => { staysOrigin = origin; return { places: selected, unavailable: false }; },
});
assert.equal(direct.kind, "stays");
assert.deepEqual(staysOrigin, orlando, "destination-stays mode uses the selected destination coordinates as its origin");
assert.equal(exactReads, 0, "destination mode does not reinterpret the visitor or destination as an inventory identity lookup");
assert.equal((await tripConnections({ mode: "stays", lat: 0, lng: 0 }, { readStays: async () => { throw new Error("must not read"); } })).invalid, true);

const strictFailure = await completeEventStays(orlando, {
  readOwned: async () => [stay("partial", 99)],
  readInventory: async () => { throw new Error("offline"); },
});
assert.deepEqual(strictFailure, { places: [], unavailable: true }, "strict poster mode exposes a partial-source failure instead of rendering an incomplete top list");

const poolRow = {
  place_id: "inventory-orlando", name: "Inventory Orlando Hotel", lat: 28.48, lng: -81.47,
  category: "hotels", primary_type: "hotel", google_types: ["hotel", "lodging"], status: "OPERATIONAL", excluded: false, metro: "orlando",
  signals: { rating: 4.9, reviews: 2500 }, editorial: "A verified inventory stay.",
};
let poolReadUrl = "";
const inventoryFetch = async (url) => {
  if (String(url).includes("select=place_id,photo_ref")) return Response.json([{ place_id: poolRow.place_id, photo_ref: "places/inventory-orlando/photos/hero" }]);
  poolReadUrl = String(url);
  return Response.json([poolRow]);
};
const completePool = await readCompleteStayPool(orlando, { env: { url: "https://inventory.test", key: "test-key" }, fetchImpl: inventoryFetch });
assert.match(poolReadUrl, /select=[^&]*metro/, "only the exhaustive hotel pool requests the stored metro needed by booking controls");
assert.equal(completePool.length, 1, "the exhaustive owned-pool adapter retains a real Orlando hotel");
assert.equal(completePool[0].name, poolRow.name);
assert.equal(completePool[0].wfScore, 98, "the exhaustive adapter stamps the same displayed score that orders the rail");
assert.match(completePool[0].photo, /^\/api\/photo\?ref=/, "selected inventory hotels retain their hydrated place-bound photo");
assert.equal(completePool[0].address, "", "a stored market is not invented into a street address");
assert.equal(completePool[0].city, "Orlando, Florida", "the hotel row's own verified metro becomes its booking-search region");
const completeSelected = selectEventStays(completePool, orlando);
assert.deepEqual([
  hotelMarketName("orlando"), hotelMarketName("tampa"), hotelMarketName("st-pete"), hotelMarketName("miami-dade"),
  hotelMarketName("broward"), hotelMarketName("palm-beach"), hotelMarketName("keys"), hotelMarketName("manatee-sarasota"),
], [
  "Orlando, Florida", "Tampa Bay, Florida", "St. Petersburg, Florida", "Miami-Dade County, Florida",
  "Broward County, Florida", "Palm Beach County, Florida", "Florida Keys", "Manatee and Sarasota Counties, Florida",
], "only known stored Florida markets map to honest booking-search regions");
assert.equal(hotelMarketName("florida"), "", "a generic Florida label cannot become booking location evidence");
assert.equal(hotelMarketName("unknown-market"), "", "an unknown stored market fails closed");
assert.equal(hotelMarketName("constructor"), "", "prototype property names cannot escape the market allowlist");
const streetMapped = completePoolPlace({ ...poolRow, signals: { ...poolRow.signals, address: "1 Hotel Way, Orlando, FL" } });
assert.equal(streetMapped.address, "1 Hotel Way, Orlando, FL", "the hotel's own street address remains stronger than its market fallback");

const repo = fileURLToPath(new URL("..", import.meta.url));
const componentModule = await loadComponent(fileURLToPath(new URL("../app/components/DestinationStays.js", import.meta.url)), repo);
const { DestinationStaysContent, destinationStaysParams } = componentModule;
assert.equal(destinationStaysParams(destinations[0]).get("lat"), String(orlando.lat));
assert.equal(destinationStaysParams({ lat: 0, lng: 0 }), null);

const readyHtml = renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "ready", places: selected }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
}));
assert.match(readyHtml, /Stay Near the Action/);
assert.match(readyHtml, /Hotels within 12 miles of Actual Event Gate, ordered by Wayfind Score/);
assert.equal((readyHtml.match(/data-iconic-place-card/g) || []).length, 2, "the mounted rail uses the two canonical IconicPlaceCard instances");
assert.equal((readyHtml.match(/Check rates/g) || []).length, 2, "every stay receives the shared verified hotel booking control");
assert.match(readyHtml, /commission/, "the matching booking disclosure renders with the earning control");
const ownMarketHtml = renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "ready", places: completeSelected }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
}));
assert.match(ownMarketHtml, /Check rates/);
assert.match(ownMarketHtml, /commission/, "a real-shape hotel with its own known market retains the matching booking disclosure");
const ownMarketHref = ownMarketHtml.match(/href="(\/api\/hotels\/go\?[^\"]+)"/)?.[1]?.replaceAll("&amp;", "&");
assert.ok(ownMarketHref, "the real-shape market hotel renders through the tracked hotel route");
const ownMarketQuery = new URL(ownMarketHref, "https://wayfind.test").searchParams;
assert.equal(ownMarketQuery.get("name"), poolRow.name);
assert.equal(ownMarketQuery.get("address"), "Orlando, Florida", "the booking query uses the hotel's own market, never the selected event city");
const noAddressHtml = renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "ready", places: [{ ...selected[0], address: "" }] }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
}));
assert.doesNotMatch(noAddressHtml, /Check rates|commission/, "a destination city cannot substitute for the hotel card's own verified address evidence");
const unknownMarketHtml = renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "ready", places: selectEventStays([completePoolPlace({ ...poolRow, metro: "florida" })], orlando) }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
}));
assert.doesNotMatch(unknownMarketHtml, /Check rates|commission/, "an unknown or generic hotel market stays unbookable even when the selected venue has a known city");

const failureHtml = renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "failed", places: [] }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
}));
assert.match(failureHtml, /couldn&#x27;t load/);
assert.match(failureHtml, /Try again/);
assert.match(renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "selected", status: "ready", places: [] }, currentKey: "selected", destination: destinations[0], onRetry: () => {},
})), /No stays found within 12 miles of Actual Event Gate/, "a legitimate empty state stays distinct and names its selected destination");
assert.equal(renderToStaticMarkup(createElement(DestinationStaysContent, {
  state: { key: "old", status: "ready", places: selected }, currentKey: "new", destination: destinations[1], onRetry: () => {},
})), "", "a late hotel response cannot flash under the newly selected destination");

const fallSource = fs.readFileSync(new URL("../app/components/FallIntentRails.js", import.meta.url), "utf8");
assert.match(fallSource, /firstPopulatedRail[\s\S]*index === firstPopulatedRail \? <DestinationStays/, "the automatic stays rail mounts after the first populated Fall rail");
assert.doesNotMatch(fallSource, /<DestinationStays[^>]*(?:center|lat|lng)=/, "the visitor center is never passed as the hotel destination");
const fallRoute = fs.readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
assert.match(fallRoute, /cached = \{ \.\.\.cached, value: \{ \.\.\.cached\.value, stayDestinations: fallStayDestinations\(cached\.value\.rails\) \} \}/, "a request-local clone derives destination metadata from full cached rails, so pre-deploy cache entries gain it without mutating shared cache state");
assert.match(fallRoute, /windowRailAnswer\(cached\.value, full\)/, "wire pagination retains the full-answer destination metadata through the established cache-value envelope");

const { GET } = await import("../app/api/trip-connections/route.js");
for (const url of [
  "https://wayfind.test/api/trip-connections?mode=stays",
  "https://wayfind.test/api/trip-connections?mode=stays&lat=28",
  "https://wayfind.test/api/trip-connections?mode=stays&lat=bad&lng=-81",
]) assert.equal((await GET(new Request(url))).status, 400, `invalid destination coordinates fail before inventory: ${url}`);

console.log("fall-destination-stays PASS: full-payload destination choices, geo isolation, score/dedupe, strict source errors, stale reset, iconic cards and verified booking controls");
