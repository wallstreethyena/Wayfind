import assert from "node:assert/strict";
import { PRIME_DEADLINE_MS, primeConsolidatedInventoryReads } from "../lib/inventoryBoxBatch.js";

const config = { url: "https://fixture.invalid", key: "fixture" };
const cities = [{ lat: 27.34, lng: -82.55 }, { lat: 27.45, lng: -82.48 }];
const jobsFor = (catSlug = "restaurants") => cities.map((city) => ({ catSlug, city }));
const allJobs = ["restaurants", "nightlife", "beaches", "things-to-do"]
  .flatMap((catSlug) => jobsFor(catSlug));
const row = (place_id, category = "food") => ({
  place_id, name: place_id, lat: 27.34, lng: -82.55,
  signals: { rating: 4.8, reviews: 100 }, category,
});
function cacheHarness() {
  const stored = new Map();
  return {
    stored,
    cache: { get(key, load) { const value = load(); stored.set(key, value); return value; } },
  };
}
const response = (body, status = 200, range = null) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => String(name).toLowerCase() === "content-range" ? range : null },
  json: async () => body,
});
async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run(); } finally { globalThis.fetch = original; }
}
async function runDefault(fetchImpl) {
  const harness = cacheHarness();
  await withFetch(fetchImpl, () => primeConsolidatedInventoryReads(jobsFor(), harness.cache, { config }));
  return harness.stored;
}
function pagedFixture(source, cap, count = true) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      const [from, to] = init.headers.Range.split("-").map(Number);
      const page = source.slice(from, Math.min(to + 1, from + cap));
      calls.push({ url: String(url), init, from, to, length: page.length });
      const total = count ? source.length : "*";
      const range = page.length ? `${from}-${from + page.length - 1}/${total}` : `*/${total}`;
      return response(page, 200, range);
    },
  };
}

// Explicit complete-answer contract, four-group concurrency, exact keys and
// isolation of one failed category.
{
  const harness = cacheHarness();
  const starts = [];
  const releases = [];
  let active = 0;
  let peak = 0;
  const pending = primeConsolidatedInventoryReads(allJobs, harness.cache, {
    config,
    readUnion: async (_config, category, box, limit, deadlineMs, deadlineAt) => {
      starts.push({ category, box, limit, deadlineMs, deadlineAt });
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => releases.push(resolve));
      active--;
      return { rows: [row(`ChIJFixture-${category}`, category)], complete: true };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts.length, 4, "all four physical groups start before any release");
  assert.equal(peak, 4);
  assert.equal(harness.stored.size, 0);
  releases.forEach((release) => release());
  await pending;
  assert.equal(harness.stored.size, 16, "two radii x two cities x four groups");
  assert.ok(starts.every((x) => x.limit === 2000));
  assert.ok(starts.every((x) => x.deadlineMs === PRIME_DEADLINE_MS));
  assert.ok(starts.every((x) => Number.isFinite(x.deadlineAt)));
  assert.equal(active, 0);

  const isolated = cacheHarness();
  await primeConsolidatedInventoryReads(allJobs, isolated.cache, {
    config,
    readUnion: async (_config, category) => {
      if (category === "food") throw new Error("fixture outage");
      return { rows: [row(`ChIJFixture-${category}`, category)], complete: true };
    },
  });
  assert.equal(isolated.stored.size, 12, "one failed category does not cancel siblings");
  for (const [key, value] of isolated.stored) assert.deepEqual(value, harness.stored.get(key));

  for (const answer of [
    [row("ChIJLegacyArray")],
    { rows: [row("ChIJIncomplete")], complete: false },
    { rows: "bad-shape", complete: true },
  ]) {
    const rejected = cacheHarness();
    await primeConsolidatedInventoryReads(jobsFor(), rejected.cache, {
      config,
      readUnion: async () => answer,
    });
    assert.equal(rejected.stored.size, 0, "only {rows, complete:true} may prime");
  }
}

// Dense 1,503-row boxes remain complete behind both relevant server caps.
// Offsets advance by actual returned length and the first request is large.
for (const cap of [1000, 137]) {
  const source = Array.from({ length: 1503 }, (_, i) => row(`ChIJ${String(i).padStart(5, "0")}`));
  source.at(-1).signals = { rating: 5, reviews: 10_000 };
  const fixture = pagedFixture(source, cap);
  const stored = await runDefault(fixture.fetch);
  assert.equal(stored.size, 4, `cap ${cap} primes all four keys`);
  for (const cached of stored.values()) {
    assert.equal(cached.length, 80, `cap ${cap} preserves the ranked candidate count`);
    assert.ok(cached.some((candidate) => candidate.id === source.at(-1).place_id),
      `cap ${cap} preserves a candidate from the final page`);
  }
  assert.equal(fixture.calls[0].init.headers.Range, "0-2000");
  assert.equal(fixture.calls[0].init.headers.Prefer, "count=exact");
  assert.equal(fixture.calls[0].init.headers["Range-Unit"], "items");
  assert.match(fixture.calls[0].url, /[?&]order=place_id\.asc(?:&|$)/);
  assert.deepEqual(
    fixture.calls.map((x) => x.from),
    Array.from({ length: Math.ceil(source.length / cap) }, (_, i) => i * cap),
  );
  assert.ok(fixture.calls.length <= 11, "large first Range avoids naive 31-call paging");
}

// Without a count, a full ceiling needs an explicit +1 empty-terminal probe.
{
  const source = Array.from({ length: 2000 }, (_, i) => row(`ChIJProbe${String(i).padStart(4, "0")}`));
  const fixture = pagedFixture(source, 1000, false);
  const stored = await runDefault(fixture.fetch);
  assert.equal(stored.size, 4);
  assert.deepEqual(fixture.calls.map((x) => x.init.headers.Range), [
    "0-2000", "1000-2000", "2000-2000",
  ]);
  assert.equal(fixture.calls.at(-1).length, 0);
}

// PostgreSQL collation may differ from JavaScript ordering. These valid IDs
// exercise database order without a client-side lexical comparison.
{
  const fixture = pagedFixture(
    ["ChIJ_A", "ChIJ-a", "ChIJa", "ChIJz", "ChIJZ"].map((id) => row(id)),
    137,
  );
  const stored = await runDefault(fixture.fetch);
  assert.equal(stored.size, 4);
  assert.equal(fixture.calls.length, 1);
}

// Only SQL 42703 on the first secondary-category page may fall back to the
// primary-category query.
{
  const calls = [];
  const stored = await runDefault(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return response({
      code: "42703",
      message: "column wf_inventory.secondary_categories does not exist",
    }, 400);
    return response([row("ChIJPrimary")], 200, "0-0/1");
  });
  assert.equal(stored.size, 4);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /[?&]or=\(category\.eq\.food,secondary_categories/);
  assert.doesNotMatch(calls[1].url, /[?&]or=/);
  assert.match(calls[1].url, /category=eq\.food/);
  assert.equal(calls[1].init.headers.Range, "0-2000");
}

// Failures never prime: generic/later errors, malformed bodies or ranges,
// offset/count drift, duplicate IDs, and a total beyond the ceiling.
{
  const cases = [
    ["generic 500", 1, async () => response({ code: "XX000" }, 500)],
    ["other SQL code", 1, async () => response({ code: "42883" }, 400)],
    ["unrelated 42703", 1, async () => response({
      code: "42703", message: "column wf_inventory.unrelated_column does not exist",
    }, 400)],
    ["later 42703", 2, async (_url, init) => init.headers.Range === "0-2000"
      ? response([row("ChIJFirst")], 200, "0-0/2")
      : response({ code: "42703" }, 400)],
    ["malformed body", 1, async () => response({ rows: [] }, 200, "*/0")],
    ["malformed range", 1, async () => response([row("ChIJRange")], 200, "bad")],
    ["wrong offset", 1, async () => response([row("ChIJOffset")], 200, "1-1/1")],
    ["count drift", 2, async (_url, init) => init.headers.Range === "0-2000"
      ? response([row("ChIJCountA")], 200, "0-0/2")
      : response([row("ChIJCountB")], 200, "1-1/3")],
    ["duplicate ID", 2, async (_url, init) => init.headers.Range === "0-2000"
      ? response([row("ChIJDup")], 200, "0-0/2")
      : response([row("ChIJDup")], 200, "1-1/2")],
    ["ceiling exceeded", 1, async () => response(
      Array.from({ length: 1000 }, (_, i) => row(`ChIJCeiling${i}`)),
      200,
      "0-999/2001",
    )],
  ];
  for (const [name, expectedCalls, fetchCase] of cases) {
    let calls = 0;
    const stored = await runDefault(async (...args) => { calls++; return fetchCase(...args); });
    assert.equal(stored.size, 0, `${name} must not prime`);
    assert.equal(calls, expectedCalls, `${name} request count`);
  }
}

// A read or response body that ignores AbortSignal still cannot hold the batch
// open, and a late settlement cannot write cache entries afterward.
for (const mode of ["read", "json"]) {
  const harness = cacheHarness();
  let settle;
  const hanging = new Promise((resolve) => { settle = resolve; });
  const startedAt = Date.now();
  if (mode === "read") {
    await primeConsolidatedInventoryReads(jobsFor(), harness.cache, {
      config,
      readUnion: async () => hanging,
    });
  } else {
    await withFetch(
      async () => ({ ok: true, status: 200, headers: { get: () => "0-0/1" }, json: () => hanging }),
      () => primeConsolidatedInventoryReads(jobsFor(), harness.cache, { config }),
    );
  }
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= PRIME_DEADLINE_MS - 25, `${mode} deadline fired after ${elapsed}ms`);
  assert.ok(elapsed < PRIME_DEADLINE_MS + 500, `${mode} remained bounded at ${elapsed}ms`);
  assert.equal(harness.stored.size, 0);
  settle(mode === "read"
    ? { rows: [row("ChIJTooLate")], complete: true }
    : [row("ChIJTooLate")]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.stored.size, 0, `late ${mode} settlement cannot prime`);
}

console.log("test-inventory-batch-concurrency: OK - complete paged unions, exact fallback, four-way concurrency, and absolute deadlines");
