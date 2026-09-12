#!/usr/bin/env node
// Runtime guard for the 2026-09-10 anchor-pools timeout. The consolidated
// inventory prime is only an accelerator: if it is slow, the authoritative
// per-city reads must get the remaining request budget rather than waiting the
// normal DB ceiling. This guard calls the real prime function and captures the
// deadline handed to its read transport; it does not infer behavior from text.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { primeConsolidatedInventoryReads, PRIME_DEADLINE_MS } from "../lib/inventoryBoxBatch.js";
import { DB_DEADLINE_MS } from "../lib/fetchDeadline.js";
import { makeReadCache } from "../lib/inventoryReadCache.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

function deadlineIsSafe(ms) {
  return Number.isFinite(ms) && ms > 0 && ms <= 1500 && ms < DB_DEADLINE_MS;
}

ok(deadlineIsSafe(PRIME_DEADLINE_MS), `prime deadline ${PRIME_DEADLINE_MS}ms must be <=1500ms and strictly below DB deadline ${DB_DEADLINE_MS}ms`);
ok(!deadlineIsSafe(DB_DEADLINE_MS), "NEGATIVE CONTROL: the historical ordinary DB deadline must fail the accelerator-budget rule");

const cache = makeReadCache();
const seen = [];
const cities = [
  { lat: 27.4989, lng: -82.5748 },
  { lat: 27.3364, lng: -82.5307 },
];
await primeConsolidatedInventoryReads(
  cities.map((city) => ({ catSlug: "restaurants", city })),
  cache,
  {
    config: { url: "https://example.invalid", key: "test" },
    readUnion: async (_s, _physical, _box, _limit, deadlineMs) => {
      seen.push(deadlineMs);
      return [];
    },
  },
);
ok(seen.length === 1, `CONTROL: expected one overlapping restaurant union read, saw ${seen.length}`);
ok(seen[0] === PRIME_DEADLINE_MS, `real prime transport received ${seen[0]}ms, expected exported PRIME_DEADLINE_MS=${PRIME_DEADLINE_MS}`);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const railsSource = readFileSync(join(ROOT, "lib/railsData.js"), "utf8");
const loadStart = railsSource.indexOf("export async function loadPools");
const loadEnd = railsSource.indexOf("async function buildIdentityPool", loadStart);
const loadBody = loadStart >= 0 && loadEnd > loadStart ? railsSource.slice(loadStart, loadEnd) : "";
const primePos = loadBody.indexOf("await primeReads(");
const jointMark = loadBody.indexOf('readerOrigin ? "ranked-nearby" : "ranked"');
const jointWave = loadBody.indexOf("const taskResults = await runPoolReadTasks(tasks)");
const stageOrderSafe = loadBody.length > 1000
  && primePos >= 0 && primePos < jointMark && jointMark < jointWave
  && (loadBody.match(/"ranked-nearby"/g) || []).length === 1;
ok(cache.size() === 0 && stageOrderSafe,
  "empty/failed prime stays fail-soft AND loadPools records one joint ranked-nearby boundary after the prime");

if (fails) {
  console.error(`rail-prime-budget-regression: ${fails} failure(s)`);
  process.exit(1);
}
console.log(`rail-prime-budget-regression: OK — optional prime is capped at ${PRIME_DEADLINE_MS}ms (< DB ${DB_DEADLINE_MS}ms); historical ${DB_DEADLINE_MS}ms value is red-proved unsafe`);
