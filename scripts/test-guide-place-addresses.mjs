#!/usr/bin/env node
// The address contract: a full street line, a Google Maps search URL, and a
// null when the ZIP or the street is missing. Proves the failure, not only the pass.
import assert from "node:assert/strict";
import { guideAreaMapUrl, guideMapsUrl, guidePlaceMapUrl, guideWhereForRecord, isFullStreetAddress, postalLine } from "../lib/guidePlaceAddress.js";

const FULL = "615 Channelside Dr, Tampa, FL 33602";
assert.equal(isFullStreetAddress(FULL), true);
assert.equal(isFullStreetAddress("615 Channelside Dr, Tampa"), false);
assert.equal(isFullStreetAddress("Tampa, FL 33602"), false);
assert.equal(isFullStreetAddress("Near University Town Center, Sarasota"), false);
assert.equal(isFullStreetAddress(""), false);
assert.equal(isFullStreetAddress("14501 S. Orange Blossom Trail, Orlando, Florida 32837"), true);
assert.equal(isFullStreetAddress("29th Ave S & Miriam St S, Gulfport, FL 33711"), true);
assert.equal(isFullStreetAddress("1340C State Road A1A, St. Augustine, FL 32080"), true);
assert.equal(postalLine("Bean Point Beach, 793 N Shore Dr, Anna Maria, FL 34216"), "793 N Shore Dr, Anna Maria, FL 34216");
assert.equal(isFullStreetAddress("Sarasota, FL 34241"), false);
assert.equal(isFullStreetAddress("Bay Lake, FL 32836"), false);

const url = guideMapsUrl({ name: "Sparkman Wharf", address: FULL, placeId: "ChIJD0N73GTFwogRuJTf5jAk5B8" });
assert.ok(url.startsWith("https://www.google.com/maps/search/?api=1&query="));
assert.ok(url.includes(encodeURIComponent("Sparkman Wharf " + FULL)));
assert.ok(url.includes("query_place_id=" + encodeURIComponent("ChIJD0N73GTFwogRuJTf5jAk5B8")));
assert.equal(guideMapsUrl({ name: "Sparkman Wharf", address: "615 Channelside Dr, Tampa", placeId: "ChIJD0N73GTFwogRuJTf5jAk5B8" }), null);
assert.equal(guideMapsUrl({ name: "Sparkman Wharf", address: FULL, placeId: "wfadd_not_google" }).includes("query_place_id"), false);

const catalog = { byPlaceId: { ChIJtest: { address: FULL, source: "test" } }, byPickKey: {} };
const hit = guideWhereForRecord({ name: "Sparkman Wharf", placeId: "ChIJtest" }, { catalog });
assert.equal(hit.address, FULL);
assert.equal(hit.mapsUrl, guideMapsUrl({ name: "Sparkman Wharf", address: FULL, placeId: "ChIJtest" }));
assert.equal(guideWhereForRecord({ name: "Sparkman Wharf", placeId: "ChIJmissing" }, { catalog }), null);

const inline = guideWhereForRecord({ name: "Fruitville Grove", address: "7410 Fruitville Rd, Sarasota, FL 34240" }, { catalog: { byPlaceId: {}, byPickKey: {} } });
assert.equal(inline.source, "record");
const broken = { ...inline, address: "7410 Fruitville Rd, Sarasota" };
assert.equal(isFullStreetAddress(broken.address), false);

const placeId = "ChIJEfuXNVcA2YgRtSS3Jo9Jsw0";
const mapLink = guidePlaceMapUrl("Riverwalk Fort Lauderdale", placeId);
const reviewed = guideWhereForRecord(
  { name: "Riverwalk Fort Lauderdale", placeId },
  { catalog: { byPlaceId: { [placeId]: { reviewed: true, placeVerified: true, mapLink, source: "google-place-id" } }, byPickKey: {} } },
);
assert.equal(reviewed.address, "");
assert.equal(reviewed.reviewed, true);
assert.equal(reviewed.mapsUrl, mapLink);
assert.equal(guideWhereForRecord(
  { name: "Riverwalk Fort Lauderdale", placeId },
  { catalog: { byPlaceId: { [placeId]: { reviewed: false, placeVerified: true, source: "google-place-id" } }, byPickKey: {} } },
), null);

const areaQuery = "Ybor City, Tampa, Florida";
const areaLink = guideAreaMapUrl(areaQuery);
const areaReason = "A district, not one street door.";
const area = guideWhereForRecord(
  { name: "Ybor City" },
  { catalog: { byPlaceId: {}, byPickKey: { "tampa\tYbor City": { area: true, reviewed: true, reason: areaReason, mapQuery: areaQuery, mapLink: areaLink } } }, slug: "tampa" },
);
assert.equal(area.address, "");
assert.equal(area.area, true);
assert.equal(area.reviewed, true);
assert.equal(area.reason, areaReason);
assert.equal(area.mapsUrl, areaLink);
assert.equal(guideWhereForRecord(
  { name: "Ybor City" },
  { catalog: { byPlaceId: {}, byPickKey: { "tampa\tYbor City": { area: true, reviewed: true, reason: "", mapQuery: areaQuery, mapLink: areaLink } } }, slug: "tampa" },
), null);
assert.equal(guideWhereForRecord(
  { name: "Ybor City" },
  { catalog: { byPlaceId: {}, byPickKey: { "tampa\tYbor City": { area: true, reviewed: false, reason: areaReason, mapQuery: areaQuery, mapLink: areaLink } } }, slug: "tampa" },
), null);
assert.equal(guideWhereForRecord(
  { name: "Pier Park" },
  { catalog: { byPlaceId: {}, byPickKey: { "pcb\tPier Park": { area: false, reviewed: true, reason: areaReason, mapQuery: "Pier Park", mapLink: guideAreaMapUrl("Pier Park") } } }, slug: "pcb" },
), null);

const parkStreet = "6000 Universal Blvd, Orlando, FL 32819";
const louieLabel = "Louie's Italian Restaurant, inside Universal Studios Florida, 6000 Universal Blvd, Orlando, FL 32819";
const louie = guideWhereForRecord(
  { name: "Rigatoni Ritual Pie" },
  { catalog: { byPlaceId: {}, byPickKey: { "orlando\tRigatoni Ritual Pie": { address: parkStreet, label: louieLabel, mapsName: "Universal Studios Florida", source: "two-public-sources" } } }, slug: "orlando" },
);
assert.equal(louie.address, louieLabel);
assert.equal(postalLine(louie.address), parkStreet);
assert.equal(louie.mapsName, "Universal Studios Florida");
assert.equal(louie.mapsUrl, guideMapsUrl({ name: "Universal Studios Florida", address: parkStreet }));
assert.ok(louie.mapsUrl.includes(encodeURIComponent("Universal Studios Florida " + parkStreet)));
const mismatched = guideWhereForRecord(
  { name: "Rigatoni Ritual Pie" },
  { catalog: { byPlaceId: {}, byPickKey: { "orlando\tRigatoni Ritual Pie": { address: parkStreet, label: "Louie's, inside the park", mapsName: "Universal Studios Florida" } } }, slug: "orlando" },
);
assert.equal(mismatched.address, parkStreet);
assert.equal(mismatched.mapsName, "Universal Studios Florida");

console.log("test-guide-place-addresses: OK — full address required, partial address refused, area map needs a reviewed reason, maps URL carries the name, address, and place id");
