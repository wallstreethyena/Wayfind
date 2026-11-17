#!/usr/bin/env node
// The address contract: a full street line, a Google Maps search URL, and a
// null when the ZIP or the street is missing. Proves the failure, not only the pass.
import assert from "node:assert/strict";
import { guideMapsUrl, guideWhereForRecord, isFullStreetAddress } from "../lib/guidePlaceAddress.js";

const FULL = "615 Channelside Dr, Tampa, FL 33602";
assert.equal(isFullStreetAddress(FULL), true);
assert.equal(isFullStreetAddress("615 Channelside Dr, Tampa"), false);
assert.equal(isFullStreetAddress("Tampa, FL 33602"), false);
assert.equal(isFullStreetAddress("Near University Town Center, Sarasota"), false);
assert.equal(isFullStreetAddress(""), false);
assert.equal(isFullStreetAddress("14501 S. Orange Blossom Trail, Orlando, Florida 32837"), true);

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

console.log("test-guide-place-addresses: OK — full address required, partial address refused, maps URL carries the name, address, and place id");
