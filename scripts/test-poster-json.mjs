import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fetchPosterJson } from "../lib/posterJson.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body: { cancel: async () => {} },
  json: async () => structuredClone(payload),
});
const healthy = (id = "p1") => ({
  rails: [{ id: "one", places: [{ id }], total: 1, page: 0, hasMore: false }],
  degraded: false,
  sourceFailures: 0,
});

const realFetch = globalThis.fetch;
const realNow = Date.now;
const realWindow = globalThis.window;
let now = 1_000_000;
Date.now = () => now;
const events = [];
globalThis.window = { posthog: { capture: (name, props) => events.push({ name, props }) } };

try {
  // Concurrent callers share one read and every delivery is isolated from
  // both the cache snapshot and every other caller.
  let calls = 0;
  let release;
  let selectedInit;
  globalThis.fetch = (_url, init) => { calls++; selectedInit = init; return new Promise((resolve) => { release = resolve; }); };
  const sharedUrl = "/api/night-out?lat=27.5001&lng=-82.4001&case=shared";
  const first = fetchPosterJson(sharedUrl, { timeoutMs: 500, retries: 1 });
  const second = fetchPosterJson(sharedUrl, { timeoutMs: 500, retries: 1 });
  eq(calls, 1, "concurrent exact requests issue one fetch");
  release(response(healthy("original")));
  const [a, b] = await Promise.all([first, second]);
  eq(selectedInit.priority, "high", "an allowlisted selected GET defaults its actual network fetch to high priority");
  a.rails[0].places[0].id = "caller-a";
  b.rails.push({ id: "caller-b", places: [] });
  const cached = await fetchPosterJson(sharedUrl, { timeoutMs: 500, retries: 1 });
  eq(calls, 1, "a healthy response is reused");
  eq(cached, healthy("original"), "caller mutation cannot alter the stored response");

  // Exact URL means exact coordinates, precision, query values and order.
  globalThis.fetch = async (url) => { calls++; return response(healthy(String(url))); };
  const beforeExact = calls;
  await fetchPosterJson("/api/birthday?lat=27.5&lng=-82.4&case=exact", { timeoutMs: 501, retries: 0 });
  await fetchPosterJson("/api/birthday?lat=27.50&lng=-82.4&case=exact", { timeoutMs: 501, retries: 0 });
  await fetchPosterJson("/api/birthday?lng=-82.4&lat=27.5&case=exact", { timeoutMs: 501, retries: 0 });
  eq(calls - beforeExact, 3, "coordinate precision and parameter order are never rounded or dropped");

  // Timeout and retry count are request identity, including their exact value.
  const identityUrl = "/api/date-night?lat=1&lng=2&case=identity";
  const beforeIdentity = calls;
  await fetchPosterJson(identityUrl, { timeoutMs: 502, retries: 0 });
  await fetchPosterJson(identityUrl, { timeoutMs: 503, retries: 0 });
  await fetchPosterJson(identityUrl, { timeoutMs: 503, retries: 1 });
  await fetchPosterJson(identityUrl, { timeoutMs: 503, retries: 1 });
  eq(calls - beforeIdentity, 3, "timeout/retry changes do not share, while an exact retry identity does");
  const priorityUrl = "/api/date-night?lat=1&lng=2&case=priority";
  const beforePriority = calls;
  await fetchPosterJson(priorityUrl, { timeoutMs: 503, priority: "low" });
  await fetchPosterJson(priorityUrl, { timeoutMs: 503, priority: "high" });
  await fetchPosterJson(priorityUrl, { timeoutMs: 503 });
  eq(calls - beforePriority, 2, "explicit low priority is isolated while default and explicit high share identity");
  const numericIdentityUrl = "/api/date-night?lat=1&lng=2&case=numeric-identity";
  const beforeNumericIdentity = calls;
  await fetchPosterJson(numericIdentityUrl, { timeoutMs: -0 });
  await fetchPosterJson(numericIdentityUrl, { timeoutMs: 0 });
  eq(calls - beforeNumericIdentity, 2, "exact timeout identity distinguishes negative zero without JSON coercion");

  // TTL is measured from completion and expires at the 30-second boundary.
  const ttlUrl = "/api/today-discovery?lat=1&lng=2&case=ttl";
  const beforeTtl = calls;
  await fetchPosterJson(ttlUrl, { timeoutMs: 504 });
  now += 29_999;
  await fetchPosterJson(ttlUrl, { timeoutMs: 504 });
  eq(calls - beforeTtl, 1, "a healthy entry is reusable before 30 seconds");
  now += 1;
  await fetchPosterJson(ttlUrl, { timeoutMs: 504 });
  eq(calls - beforeTtl, 2, "an entry is expired at 30 seconds, never retained beyond it");

  // Every unhealthy shape is served to its caller but never retained.
  const unhealthy = [
    ["degraded", { ...healthy(), degraded: true }],
    ["error", { error: "temporarily unavailable" }],
    ["malformed", { rails: [{ id: "bad" }] }],
    ["empty", { rails: [{ id: "empty", places: [], total: 0, page: 0, hasMore: false }], degraded: false }],
    ["source-failure", { ...healthy(), sourceFailures: 1 }],
    ["partial", { ...healthy(), partial: true }],
    ["truncated-stats", { ...healthy(), sourceStats: { truncated: true } }],
  ];
  for (const [name, payload] of unhealthy) {
    const url = `/api/events/fall?lat=1&lng=2&case=${name}`;
    const before = calls;
    globalThis.fetch = async () => { calls++; return response(payload); };
    await fetchPosterJson(url, { timeoutMs: 505 });
    await fetchPosterJson(url, { timeoutMs: 505 });
    eq(calls - before, 2, `${name} responses are never reused`);
  }

  // Admission follows the exact health fields emitted by the live routes.
  globalThis.fetch = async (url) => {
    calls++;
    const path = new URL(String(url), "https://wayfind.invalid").pathname;
    if (path === "/api/rails") return response({
      covered: true,
      data: { covered: true, failed: false, places: { best: ["rail-place"] }, placeIndex: { "rail-place": { id: "rail-place" } }, railTotals: { best: 1 } },
    });
    if (path === "/api/events/fall") return response({ ...healthy("fall"), sourceFailures: 0 });
    if (path === "/api/summer/places") return response({ places: [{ id: "summer" }] });
    return response(healthy("specialized"));
  };
  for (const [path, suffix] of [["/api/rails", "rails"], ["/api/events/fall", "fall"], ["/api/summer/places", "summer"]]) {
    const url = `${path}?lat=1&lng=2&case=live-${suffix}`;
    const before = calls;
    await fetchPosterJson(url, { timeoutMs: 505 });
    await fetchPosterJson(url, { timeoutMs: 505 });
    eq(calls - before, 1, `${suffix} live healthy response shape is retained`);
  }
  for (const [path, body, suffix] of [
    ["/api/night-out", { rail: "bars", id: "bars", places: [{ id: "p" }], total: 1, page: 0, hasMore: false }, "specialized-page"],
    ["/api/events/fall", { rail: "pumpkins", id: "pumpkins", cards: [{ id: "e" }], total: 1, page: 0, hasMore: false }, "fall-page"],
  ]) {
    globalThis.fetch = async () => { calls++; return response(body); };
    const url = `${path}?lat=1&lng=2&rail=x&case=${suffix}`;
    const before = calls;
    await fetchPosterJson(url, { timeoutMs: 505 });
    await fetchPosterJson(url, { timeoutMs: 505 });
    eq(calls - before, 2, `${suffix} without an explicit source-health marker is not retained`);
  }

  // A thrown/non-OK read also leaves no reusable entry.
  let failOnce = true;
  const errorUrl = "/api/birthday?lat=1&lng=2&case=throw";
  globalThis.fetch = async () => {
    calls++;
    if (failOnce) { failOnce = false; return response({}, 500); }
    return response(healthy("recovered"));
  };
  await assert.rejects(fetchPosterJson(errorUrl, { timeoutMs: 506 }), /Request returned 500/); assertions++;
  eq((await fetchPosterJson(errorUrl, { timeoutMs: 506 })).rails[0].places[0].id, "recovered", "a failure is retried by the next caller");

  // Request semantics outside the narrow GET contract bypass both coalescing
  // and the response cache. Each pair must make two underlying calls.
  const bypasses = [
    ["headers", { headers: { accept: "application/json" } }],
    ["body", { body: "x" }],
    ["credentials", { credentials: "include" }],
    ["signal", { signal: new AbortController().signal }],
    ["no-store", { cache: "no-store" }],
    ["non-get", { method: "POST" }],
    ["unknown-init", { redirect: "manual" }],
  ];
  globalThis.fetch = async () => { calls++; return response({ places: [{ id: "flat" }], degraded: false }); };
  for (const [name, options] of bypasses) {
    const url = `/api/lunch-break?lat=1&lng=2&case=bypass-${name}`;
    const before = calls;
    await fetchPosterJson(url, options);
    await fetchPosterJson(url, options);
    eq(calls - before, 2, `${name} requests bypass reuse`);
  }
  const unrelatedBefore = calls;
  await fetchPosterJson("/api/experiences?case=unrelated");
  await fetchPosterJson("/api/experiences?case=unrelated");
  eq(calls - unrelatedBefore, 2, "an unrelated poster path bypasses reuse");

  // Sixteen entries is a hard bound: the oldest of seventeen healthy entries
  // must fetch again.
  globalThis.fetch = async (url) => { calls++; return response({ places: [{ id: String(url) }] }); };
  const boundedBase = calls;
  for (let i = 0; i < 17; i++) await fetchPosterJson(`/api/summer/places?lat=1&lng=2&slot=${i}`, { timeoutMs: 507 });
  await fetchPosterJson("/api/summer/places?lat=1&lng=2&slot=0", { timeoutMs: 507 });
  eq(calls - boundedBase, 18, "the seventeenth entry evicts the oldest reusable response");

  // If fetch ignores abort, the reuse cell still evicts at its own deadline;
  // the late first writer cannot replace the newer healthy answer.
  let oldRelease;
  let hungCalls = 0;
  globalThis.fetch = async () => {
    hungCalls++;
    if (hungCalls === 1) return new Promise((resolve) => { oldRelease = resolve; });
    return response(healthy("new"));
  };
  const hungUrl = "/api/night-out?lat=1&lng=2&case=hung";
  const old = fetchPosterJson(hungUrl, { timeoutMs: 15 });
  await new Promise((resolve) => setTimeout(resolve, 25));
  eq((await fetchPosterJson(hungUrl, { timeoutMs: 15 })).rails[0].places[0].id, "new", "a hung entry is evicted at the deadline");
  oldRelease(response(healthy("old")));
  eq((await old).rails[0].places[0].id, "old", "the original caller still receives its late response");
  eq((await fetchPosterJson(hungUrl, { timeoutMs: 15 })).rails[0].places[0].id, "new", "a late writer cannot overwrite the newer cache entry");
  eq(hungCalls, 2, "the late-writer proof used exactly the hung and replacement fetches");

  ok(events.length > 0 && events.every((event) => event.name === "poster_json_request_timing"), "every timing event uses the request timing name");
  ok(events.every(({ props }) => ["endpoint", "cacheState", "elapsedMs", "failure"].every((key) => Object.hasOwn(props, key))), "timing includes endpoint, cache state, elapsedMs and failure");
  ok(events.every(({ props }) => !JSON.stringify(props).includes("lat=") && !Object.hasOwn(props, "url")), "telemetry never includes raw URLs or coordinates");
  ok(events.some(({ props }) => props.cacheState === "hit") && events.some(({ props }) => props.cacheState === "shared") && events.some(({ props }) => props.failure), "hit, shared and failure timing lanes executed");

  // Red proof: run a real mutated copy with reuse disabled. The positive
  // concurrent-sharing assertion above must fail in that process.
  const root = new URL("..", import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), "poster-json-red-"));
  try {
    const client = readFileSync(new URL("lib/clientJson.js", root), "utf8");
    const source = readFileSync(new URL("lib/posterJson.js", root), "utf8");
    const reuseGate = 'if (!endpoint || !POSTER_PATHS.has(endpoint)) return false;';
    ok(source.includes(reuseGate), "red proof found the allowlist reuse gate it will mutate");
    writeFileSync(join(dir, "clientJson.mjs"), client);
    writeFileSync(join(dir, "posterJson.mjs"), source
      .replace('"./clientJson.js"', '"./clientJson.mjs"')
      .replace(reuseGate, "return false;"));
    writeFileSync(join(dir, "probe.mjs"), `
      import { fetchPosterJson } from './posterJson.mjs';
      let calls = 0, releases = [];
      globalThis.fetch = () => { calls++; return new Promise(r => releases.push(r)); };
      const u = '/api/night-out?lat=1&lng=2&red=1';
      const a = fetchPosterJson(u, { timeoutMs: 100 });
      const b = fetchPosterJson(u, { timeoutMs: 100 });
      if (calls !== 1) { console.error('RED: disabled reuse issued ' + calls + ' fetches'); process.exit(23); }
      const response = { ok:true, status:200, json:async()=>({rails:[{id:'x',places:[{id:'p'}]}],degraded:false}) };
      releases[0](response); await Promise.all([a,b]);
    `);
    const red = spawnSync(process.execPath, [join(dir, "probe.mjs")], { encoding: "utf8" });
    eq(red.status, 23, "the test goes red when reuse is disabled");
    ok(red.stderr.includes("RED: disabled reuse issued 2 fetches"), "the red proof failed for the intended duplicate-fetch reason");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  globalThis.fetch = realFetch;
  Date.now = realNow;
  if (realWindow === undefined) delete globalThis.window;
  else globalThis.window = realWindow;
}

console.log(`test-poster-json: OK — ${assertions} assertions; runtime proved exact coalescing, healthy TTL reuse, identity isolation, rejection of unhealthy answers, mutation isolation, bounded entries/hangs, bypass semantics and timing privacy; a reuse-disabled mutation exited red for the intended duplicate-fetch reason.`);
