#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { makeReadCache } from "../lib/inventoryReadCache.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  loadPools,
  poolCitiesFor,
  POOL_READ_CONCURRENCY,
} = await loadComponent(join(ROOT, "lib/railsData.js"), ROOT);

// The ranked categories documented by railsData; only the first four have a
// reader-nearby replacement. `drive` remains city-ranked at this stage.
// Keeping this reference implementation independent of loadPools is what lets
// it detect output drift in the implementation under test.
const CATS = ["things-to-do", "beaches", "restaurants", "nightlife", "drive"];
const NEARBY_CAT_SET = new Set(["things-to-do", "restaurants", "beaches", "nightlife"]);
const NEARBY_STANDALONE_MIN = 20;

function rankedFixture(cat, city) {
  if (cat === "nightlife") throw new Error("ranked rejection control");
  return [
    { id: `${cat}-${city}-anchor`, name: `${cat} ${city}`, _s: 90, reviews: 100 },
    { id: `${cat}-${city}-trend`, name: `${cat} trend`, _s: 80, reviews: 80, trending: true },
  ];
}

function nearbyFixture(cat) {
  const count = cat === "restaurants" ? NEARBY_STANDALONE_MIN : 1;
  return Array.from({ length: count }, (_, i) => ({
    id: `${cat}-near-${i}`,
    name: `${cat} near ${i}`,
    _s: 100 - i,
    reviews: 200 - i,
  }));
}

// The pre-change algorithm, retained here only as an executable parity and
// negative control: all ranked reads settle before nearby reads begin.
async function oldSerialLoadPools(citySlug, { origin, rankedFor, buildNearbyPool }) {
  const cities = poolCitiesFor(citySlug);
  const jobs = [];
  for (const cat of CATS) for (const city of cities) jobs.push({ cat, city });
  const ranked = await Promise.all(jobs.map(({ cat, city }) =>
    Promise.resolve().then(() => rankedFor(cat, city)).then((rows) => rows || []).catch(() => [])));

  const pools = Object.fromEntries(CATS.map((cat) => [cat, []]));
  const seen = Object.fromEntries(CATS.map((cat) => [cat, new Set()]));
  jobs.forEach(({ cat, city }, i) => {
    for (const row of ranked[i]) {
      if (!row || !row.id || seen[cat].has(row.id)) continue;
      seen[cat].add(row.id);
      pools[cat].push(city === cities[0] ? row : { ...row, _neighbour: city });
    }
  });

  if (origin) {
    const nearbyCats = CATS.filter((cat) => NEARBY_CAT_SET.has(cat));
    const nearby = await Promise.all(nearbyCats.map((cat) =>
      Promise.resolve().then(() => buildNearbyPool(origin, cat)).then((rows) => rows || []).catch(() => [])));
    nearbyCats.forEach((cat, i) => {
      const near = nearby[i];
      if (near.length < NEARBY_STANDALONE_MIN) return;
      const ids = new Set(near.map((row) => row.id));
      pools[cat] = [...near, ...pools[cat].filter((row) => row?.trending === true && !ids.has(row.id))];
    });
  }
  return { pools, cities, primaryCity: cities[0] };
}

const origin = { lat: 27.3364, lng: -82.5307 };
const expected = await oldSerialLoadPools("sarasota", {
  origin,
  rankedFor: rankedFixture,
  buildNearbyPool: (_origin, cat) => nearbyFixture(cat),
});
const stages = [];
let primeCalls = 0;
const cache = { get() { throw new Error("fixtures must not perform a cache read"); } };
const actual = await loadPools("sarasota", {
  origin,
  readCache: cache,
  onStage: (stage) => stages.push(stage),
  deps: {
    primeConsolidatedInventoryReads: async (_jobs, receivedCache) => {
      primeCalls++;
      assert.equal(receivedCache, cache, "prime receives the same per-compute cache as both read paths");
    },
    rankedFor: async (cat, city, options) => {
      assert.equal(options.readCache, cache, "ranked read receives the primed cache");
      return rankedFixture(cat, city);
    },
    buildNearbyPool: async (_origin, cat, options) => {
      assert.equal(options.readCache, cache, "nearby read receives the primed cache");
      assert.equal(options.includeStatus, true, "nearby read keeps the completeness signal required for cache admission");
      return { rows: nearbyFixture(cat), degraded: false };
    },
  },
});
assert.deepEqual(actual, expected, "parallel execution preserves the old deterministic merge, fallback, trend tail, and rejection output");
assert.equal(primeCalls, 1, "the consolidated prime runs exactly once");
assert.deepEqual(stages, ["ranked-nearby"], "overlapping reads report one honest joint stage");
assert.equal(actual.pools.restaurants.length, NEARBY_STANDALONE_MIN + 4,
  "full nearby restaurants replace anchors and retain one distinct trend per metro city");
assert.equal(actual.pools["things-to-do"].length, 8,
  "a thin nearby result preserves the complete four-city ranked fallback");
assert.equal(actual.pools.nightlife.length, 0, "a rejected ranked source remains fail-soft");
assert.equal(actual.pools.beaches.length, 8, "a thin complete nearby source preserves the ranked fallback");

await assert.rejects(() => loadPools("tampa", {
  origin,
  deps: {
    primeConsolidatedInventoryReads: async () => {},
    rankedFor: async () => [],
    buildNearbyPool: async (_origin, cat) => ({ rows: [], degraded: cat === "nightlife" }),
  },
}), /Nearby inventory reads incomplete/,
"an incomplete nearby ladder rejects the whole compute instead of admitting a partial candidate universe to cache");

let readsAfterRejectedPrime = 0;
await loadPools("tampa", {
  origin,
  readCache: {},
  deps: {
    primeConsolidatedInventoryReads: async () => { throw new Error("prime rejection control"); },
    rankedFor: async () => { readsAfterRejectedPrime++; return []; },
    buildNearbyPool: async () => { readsAfterRejectedPrime++; return { rows: [], degraded: false }; },
  },
});
assert.equal(readsAfterRejectedPrime, CATS.length + NEARBY_CAT_SET.size,
  "a rejected optional prime still runs every authoritative ranked and nearby read");

function tracker() {
  let active = 0;
  let rankedActive = 0;
  let nearbyActive = 0;
  return {
    peak: 0,
    overlap: false,
    async run(kind) {
      active++;
      if (kind === "ranked") rankedActive++;
      else nearbyActive++;
      this.peak = Math.max(this.peak, active);
      this.overlap ||= rankedActive > 0 && nearbyActive > 0;
      await delay(15);
      active--;
      if (kind === "ranked") rankedActive--;
      else nearbyActive--;
      return [];
    },
  };
}

// Negative control: the historical two-wave shape cannot overlap the two read
// kinds, even though each individual Promise.all has internal concurrency.
const serial = tracker();
await oldSerialLoadPools("sarasota", {
  origin,
  rankedFor: () => serial.run("ranked"),
  buildNearbyPool: () => serial.run("nearby"),
});
assert.equal(serial.overlap, false, "NEGATIVE CONTROL: the old serial shape fails the ranked/nearby overlap requirement");

const parallel = tracker();
let primeDone = false;
let startedBeforePrime = false;
const parallelCache = {};
await loadPools("sarasota", {
  origin,
  readCache: parallelCache,
  deps: {
    primeConsolidatedInventoryReads: async (_jobs, receivedCache) => {
      assert.equal(receivedCache, parallelCache);
      await delay(5);
      primeDone = true;
    },
    rankedFor: async (_cat, _city, options) => {
      startedBeforePrime ||= !primeDone;
      assert.equal(options.readCache, parallelCache);
      return parallel.run("ranked");
    },
    buildNearbyPool: async (_origin, _cat, options) => {
      startedBeforePrime ||= !primeDone;
      assert.equal(options.readCache, parallelCache);
      return { rows: await parallel.run("nearby"), degraded: false };
    },
  },
});
assert.equal(startedBeforePrime, false, "no authoritative read starts before the single prime settles");
assert.equal(parallel.overlap, true, "ranked and nearby reads overlap after priming");
assert.equal(parallel.peak, POOL_READ_CONCURRENCY,
  `the shared queue reaches, but never exceeds, its ${POOL_READ_CONCURRENCY}-read bound`);

const sharedCache = makeReadCache();
let physicalReads = 0;
const sharedRead = async () => {
  physicalReads++;
  await delay(10);
  return [];
};
await loadPools("miami", {
  origin,
  readCache: sharedCache,
  deps: {
    primeConsolidatedInventoryReads: async () => {},
    rankedFor: async (_cat, _city, options) => options.readCache.get("shared-proof", sharedRead),
    buildNearbyPool: async (_origin, _cat, options) => ({
      rows: await options.readCache.get("shared-proof", sharedRead), degraded: false,
    }),
  },
});
assert.equal(physicalReads, 1,
  "overlapping ranked and nearby callers share one in-flight cache promise instead of duplicating the request");

// Red-prove the guard against the real implementation in a fresh process.
// A one-worker mutation serializes the nearby-leading queue and must make this
// same runtime overlap assertion fail. Always restore the source byte-for-byte.
if (!process.argv.includes("--red-child")) {
  const sourcePath = join(ROOT, "lib/railsData.js");
  const original = readFileSync(sourcePath, "utf8");
  const target = "export const POOL_READ_CONCURRENCY = 8;";
  assert.equal(original.split(target).length - 1, 1, "red-prove mutation target exists exactly once");
  const mutated = original.replace(target, "export const POOL_READ_CONCURRENCY = 1;");
  assert.notEqual(mutated, original, "red-prove mutation changed the real source");
  let child;
  try {
    writeFileSync(sourcePath, mutated);
    assert.match(readFileSync(sourcePath, "utf8"), /export const POOL_READ_CONCURRENCY = 1;/,
      "red-prove mutation was read back from disk");
    child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--red-child"], {
      cwd: ROOT,
      encoding: "utf8",
    });
  } finally {
    writeFileSync(sourcePath, original);
  }
  assert.equal(readFileSync(sourcePath, "utf8"), original, "red-prove restored railsData.js byte-for-byte");
  assert.notEqual(child?.status, 0, "one-worker real-source mutation makes the runtime guard fail");
  assert.match(`${child?.stdout || ""}\n${child?.stderr || ""}`, /ranked and nearby reads overlap after priming/,
    "the mutation fails the intended overlap assertion");
}

console.log(`test-poster-pool-parallel: OK — output parity, complete-only admission, one optional prime, shared in-flight cache, ranked/nearby overlap, and peak ${parallel.peak}/${POOL_READ_CONCURRENCY}; old serial overlap=${serial.overlap}${process.argv.includes("--red-child") ? "" : "; cap=1 real-source mutation went red and restored"}`);
