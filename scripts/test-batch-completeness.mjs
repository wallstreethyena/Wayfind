#!/usr/bin/env node
import assert from "node:assert/strict";
import { primeConsolidatedInventoryReads } from "../lib/inventoryBoxBatch.js";

const cities = [
  { lat: 27.40, lng: -82.52 },
  { lat: 27.45, lng: -82.48 },
];
const jobs = cities.map((city) => ({ catSlug: "restaurants", city }));

function row(i) {
  return {
    place_id: `ChIJBatch${String(i).padStart(5, "0")}`,
    name: `Batch fixture ${i}`,
    lat: 27.42 + (i % 10) * 0.00001,
    lng: -82.50 + (i % 10) * 0.00001,
    category: "food",
    status: "OPERATIONAL",
    excluded: false,
    signals: { rating: 4.5, reviews: 100 },
  };
}

function prepareScenario({ rows, contentRange, ok = true }) {
  const originalFetch = globalThis.fetch;
  const cached = new Map();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok,
      status: ok ? 200 : 500,
      headers: {
        get: (name) => String(name).toLowerCase() === "content-range" ? contentRange : null,
      },
      json: async () => rows,
    };
  };
  return {
    cached,
    calls,
    readCache: { get: (key, load) => { const value = load(); cached.set(key, value); return value; } },
    config: { url: "https://fixture.invalid", key: "fixture" },
    restore: () => { globalThis.fetch = originalFetch; },
    result: () => ({ cached, calls, values: [...cached.values()] }),
  };
}

const cappedRows = Array.from({ length: 1000 }, (_, i) => row(i));
const cappedFixture = prepareScenario({ rows: cappedRows, contentRange: "0-999/1500" });
const cappedPending = primeConsolidatedInventoryReads(jobs, cappedFixture.readCache, { config: cappedFixture.config });
const capped = await cappedPending.then(cappedFixture.result).finally(cappedFixture.restore);
assert.equal(capped.calls[0].init.headers.Range, "0-2000",
  "control: the two-city union requests its 2,000-row ceiling plus one through an item Range");
assert.equal(capped.calls[0].init.headers.Prefer, "count=exact",
  "the real union transport requests a trustworthy total");
assert.equal(capped.cached.size, 0,
  "a server-capped short response must not prime an incomplete universe");

const completeFixture = prepareScenario({ rows: [row(1), row(2), row(3)], contentRange: "0-2/3" });
const completePending = primeConsolidatedInventoryReads(jobs, completeFixture.readCache, { config: completeFixture.config });
const complete = await completePending.then(completeFixture.result).finally(completeFixture.restore);
assert.equal(complete.cached.size, 4,
  "a proved-complete union primes two cities at both supported radii");
assert.ok(complete.values.every((value) => Array.isArray(value) && value.length === 3
    && value.every((place) => place.id && place.displayName?.text && Number.isFinite(place.location?.latitude))),
  "every primed cache value is the real ranked production return, with all complete rows mapped for serving");

for (const contentRange of [null, "0-2/*", "malformed"]) {
  const unknownFixture = prepareScenario({ rows: [row(1), row(2), row(3)], contentRange });
  const unknownPending = primeConsolidatedInventoryReads(jobs, unknownFixture.readCache, { config: unknownFixture.config });
  const unknown = await unknownPending.then(unknownFixture.result).finally(unknownFixture.restore);
  assert.equal(unknown.cached.size, 0,
    `missing or malformed completeness proof (${String(contentRange)}) leaves the cache unprimed`);
}

const failedFixture = prepareScenario({ rows: [], contentRange: null, ok: false });
const failedPending = primeConsolidatedInventoryReads(jobs, failedFixture.readCache, { config: failedFixture.config });
const failed = await failedPending.then(failedFixture.result).finally(failedFixture.restore);
assert.equal(failed.calls.length, 1,
  "a failed optional OR read does not retry a narrower primary-only universe or spend a second deadline");
assert.equal(failed.cached.size, 0, "a failed union read leaves the cache unprimed");

console.log("test-batch-completeness: OK — exact count accepts complete unions; server-capped, unproved, malformed and failed unions prime nothing");
