#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };

async function harness({ get, info } = {}) {
  let now = 10_000_000;
  let timerId = 0;
  const timers = new Map();
  const logs = [];
  const writes = [];
  const waits = [];
  const cache = {
    get: get || (async () => null),
    set: async (...args) => { writes.push(args); },
  };
  const platform = {
    getCache: () => cache,
    waitUntil: (promise) => { waits.push(promise); },
  };
  const fakeConsole = {
    info: info || ((...args) => logs.push(args)),
  };
  const fakeSetTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  const fakeClearTimeout = (id) => timers.delete(id);
  const exports = {};
  const compiled = ts.transpileModule(readFileSync("lib/railFastCache.js", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const { instantiate } = await import("data:text/javascript;base64," + Buffer.from(
    "export function instantiate(require, exports, Date, console, setTimeout, clearTimeout) {\n" + compiled + "\n}").toString("base64"));
  instantiate(
    (id) => {
      if (id !== "@vercel/functions") throw new Error(`unmocked import: ${id}`);
      return platform;
    },
    exports,
    { now: () => now },
    fakeConsole,
    fakeSetTimeout,
    fakeClearTimeout,
  );
  return {
    ...exports,
    cache,
    logs,
    writes,
    waits,
    now: () => now,
    tick(ms) {
      now += ms;
      let ran;
      do {
        ran = false;
        for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
          if (timer.due > now) continue;
          timers.delete(id);
          timer.callback();
          ran = true;
        }
      } while (ran);
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const timing = (h, index = -1) => {
  const row = h.logs.at(index);
  ok(row?.[0] === "[rail-answer] timing" && row?.[1] && typeof row[1] === "object",
    "timing is emitted as the structured [rail-answer] timing event");
  return row[1];
};

{
  const h = await harness({ get: async () => ({ savedAt: 10_000_000, value: { rails: ["fresh"] } }) });
  const result = await h.fastCachedRail("secret:27.9506:-82.4572", () => assert.fail("hit loaded"), { name: "homepage-rails" });
  ok(result.state === "hit", "fresh cache answer remains a hit");
  assert.deepEqual(timing(h), {
    name: "homepage-rails", cacheState: "hit", outcome: "returned", elapsedMs: 0, usable: true,
  });
  checks++;
  ok(!JSON.stringify(h.logs).includes("secret") && !JSON.stringify(h.logs).includes("27.9506"),
    "timing never includes the cache key or coordinates");
}

{
  let refreshes = 0;
  const h = await harness({ get: async () => ({ savedAt: 10_000_000 - 3_600_001, value: { rails: ["stale"] } }) });
  const result = await h.fastCachedRail("stale-key", async () => { refreshes++; return { rails: ["new"] }; }, { name: "night-out-rails" });
  ok(result.state === "stale" && refreshes === 1, "stale answer still returns while refresh starts");
  const event = timing(h);
  ok(event.cacheState === "stale" && event.outcome === "returned" && event.elapsedMs === 0 && !("loaderMs" in event),
    "stale return is labeled without claiming an unfinished loader duration");
}

{
  const h = await harness();
  const result = await h.fastCachedRail("cold-key", async () => { h.tick(37); return { rails: ["built"] }; }, { name: "date-night-rails" });
  ok(result.state === "miss", "cold answer remains a miss");
  const event = timing(h);
  ok(event.cacheState === "miss" && event.outcome === "returned" && event.elapsedMs === 37
    && event.loaderMs === 37 && event.usable === true,
  "cold return reports request and actual loader duration");
}

{
  let resolveRead;
  let resolveLoad;
  const h = await harness({ get: () => new Promise((resolve) => { resolveRead = resolve; }) });
  const pending = h.fastCachedRail("private:25.7617:-80.1918", () => new Promise((resolve) => { resolveLoad = resolve; }), {
    name: "unsafe:25.7617:-80.1918",
  });
  await flush();
  h.tick(500);
  await flush();
  resolveRead({ savedAt: h.now(), value: { rails: ["late"] } });
  const result = await pending;
  ok(result.state === "late-hit", "slow exact-key read still wins the late-hit race");
  const event = timing(h);
  ok(event.name === "rail-answer" && event.cacheState === "late-hit" && event.elapsedMs === 500
    && !("loaderMs" in event), "late hit uses a safe label and omits the pending loader duration");
  ok(!JSON.stringify(h.logs).includes("25.7617") && !JSON.stringify(h.logs).includes("private"),
    "unsafe names and raw late-hit keys cannot leak into timing");
  resolveLoad(null);
  await flush();
}

{
  const h = await harness();
  await assert.rejects(h.fastCachedRail("failed-key", async () => { h.tick(19); throw new Error("database down"); }, {
    name: "birthday-rails",
  }), /database down/);
  const event = timing(h);
  ok(event.name === "birthday-rails" && event.cacheState === "miss" && event.outcome === "failed"
    && event.elapsedMs === 19 && event.loaderMs === 19 && !("usable" in event),
  "failed cold load keeps its label and reports only known timing");
}

{
  const h = await harness();
  let loads = 0;
  let release;
  const loader = () => { loads++; return new Promise((resolve) => { release = resolve; }); };
  const requests = Array.from({ length: 8 }, () => h.fastCachedRail("shared-cell", loader, { name: "intent-candidates" }));
  await flush();
  ok(loads === 1, "concurrent cold requests still share one loader");
  h.tick(23);
  release({ rails: ["shared"] });
  const results = await Promise.all(requests);
  ok(results.every((result) => result.state === "miss" && result.value.rails[0] === "shared"),
    "every shared caller receives the same cold result");
  ok(h.logs.length === 8 && h.logs.every(([, event]) => event.loaderMs === 23 && event.elapsedMs === 23),
    "each request logs the one actual shared loader duration");
}

{
  const legacy = { rails: ["old"] };
  const healthy = { rails: ["new"], degraded: false };
  const h = await harness({ get: async () => ({ savedAt: 10_000_000, value: legacy }) });
  const usable = h.completeAnswersOnly((value) => value.rails.length > 0);
  const rebuilt = await h.fastCachedRail("legacy-entry", async () => healthy, { name: "today-discovery", usable });
  ok(rebuilt.state === "miss" && rebuilt.value === healthy, "poisoned pre-degraded entry is rebuilt, not served");
  ok(timing(h).usable === true, "rebuilt healthy answer is labeled usable");

  h.cache.get = async () => null;
  const degraded = { rails: ["partial"], degraded: true };
  const served = await h.fastCachedRail("degraded-entry", async () => degraded, { name: "today-discovery", usable });
  ok(served.state === "miss" && served.value === degraded, "degraded result still reaches its requesting caller");
  ok(timing(h).usable === false, "degraded result is visibly labeled unusable");
  await flush();
  ok(h.writes.length === 1, "only the healthy rebuild is admitted to cache");
}

{
  const h = await harness({
    get: async () => ({ savedAt: 10_000_000, value: "answer" }),
    info: () => { throw new Error("logging unavailable"); },
  });
  const result = await h.fastCachedRail("telemetry-key", () => assert.fail("hit loaded"), { name: "homepage-rails" });
  ok(result.state === "hit" && result.value === "answer", "telemetry failure cannot change the cache response");
}

console.log(`test-poster-cache-timing: ${checks} deterministic assertions passed`);
