#!/usr/bin/env node

import assert from "node:assert/strict";
import { composeCreatorPicksRails, creatorPageAttemptKey, shouldAutoLoadCreatorPage } from "../lib/creatorPicksRails.js";

const places = [
  { id: "next", name: "Next Place", governed_score: 91, creatorSources: [{ handle: "@cindy.selects", platform: "tiktok" }] },
  { id: "top", name: "Top Place", governed_score: 94, creatorSources: [
    { handle: "cindy.selects", platform: "tiktok", url: "https://example.test/cindy" },
    { handle: "second.creator", platform: "instagram", url: "https://example.test/second" },
  ] },
  { id: "ignored", name: "Ignored", governed_score: 99, creatorSources: [] },
];

const rails = composeCreatorPicksRails(places);
assert.deepEqual(rails.map((rail) => rail.handle), ["cindy.selects", "second.creator"], "one rail is created for every explicit creator handle");
assert.deepEqual(rails[0].places.map((place) => place.id), ["top", "next"], "each creator rail sorts by governed Wayfind Score even when input is unsorted");
assert.deepEqual(rails[1].places.map((place) => place.id), ["top"], "a place credited to two creators appears in both creators' rails");
assert.equal(composeCreatorPicksRails([{ id: "name-only", name: "Cindy's Cafe" }]).length, 0, "place names never infer a creator");
assert.equal(composeCreatorPicksRails([{ id: "url-only", creatorSources: [{ url: "https://tiktok.com/@invented/video/1" }] }]).length, 0, "social URLs never infer a creator");
assert.equal(composeCreatorPicksRails([]).length, 0, "empty input produces no empty rails");

const page0 = creatorPageAttemptKey("locals|tampa|afternoon", 12);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page0, lastAttemptKey: "" }), true, "a new page offset gets one automatic attempt");
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page0, lastAttemptKey: page0 }), false, "an unchanged page cannot automatically retry forever");
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: true, attemptKey: page0, lastAttemptKey: page0 }), false, "a failed offset waits for the manual retry control");
const page1 = creatorPageAttemptKey("locals|tampa|afternoon", 36);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page1, lastAttemptKey: page0 }), true, "a successful retry that advances the loaded count resumes automatic paging");
const moved = creatorPageAttemptKey("locals|orlando|afternoon", 12);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: moved, lastAttemptKey: page0 }), true, "a new location scope gets its own first attempt");

console.log("creator picks rails: 11 assertions passed");
