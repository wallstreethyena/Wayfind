#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RAIL_FAILURE_KIND,
  classifyRailFailure,
  fetchRailJson,
  isRailCancelled,
  railDegradedEvent,
  railDeveloperFailure,
} from "../lib/railFailure.js";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// Classification is policy, not presentation. 408/429 and every 5xx are
// transient service trouble; other 4xx means our caller/contract is wrong.
for (const status of [408, 429, 500, 502, 503, 504, 599]) {
  const verdict = classifyRailFailure({ status });
  ok(verdict.kind === RAIL_FAILURE_KIND.DEGRADED && verdict.retryable === true,
    `${status} is retryable degraded service trouble`);
}
for (const status of [400, 401, 403, 404, 409, 422]) {
  const verdict = classifyRailFailure({ status });
  ok(verdict.kind === RAIL_FAILURE_KIND.DEVELOPER && verdict.retryable === false,
    `${status} is a non-retryable Wayfind/caller defect`);
}
ok(classifyRailFailure({ network: true }).reason === "network", "network errors are classified explicitly");
ok(classifyRailFailure({ timeout: true }).reason === "timeout", "timeouts are classified explicitly");
ok(classifyRailFailure({ cancelled: true }).kind === RAIL_FAILURE_KIND.CANCELLED, "caller cancellation is never an outage");

// Exactly one recovery attempt. Sleep is injected away here so the guard is
// deterministic; production still uses the bounded jitter implementation.
let calls = 0;
let result = await fetchRailJson("/api/night-out?lat=1&lng=2", {
  fetchImpl: async () => ++calls === 1 ? new Response("", { status: 503 }) : Response.json({ rails: [{ id: "live" }] }),
  random: () => 0,
  sleepImpl: async () => {},
});
ok(calls === 2 && result.rails[0].id === "live", "503 retries exactly once and a healthy retry wins");

calls = 0;
result = await fetchRailJson("/api/today-discovery", {
  fetchImpl: async () => ++calls === 1 ? new Response("", { status: 429 }) : Response.json({ rails: [] }),
  random: () => 0,
  sleepImpl: async () => {},
});
ok(calls === 2 && Array.isArray(result.rails), "429 retries once and preserves a healthy empty response");

calls = 0;
result = await fetchRailJson("/api/birthday", {
  fetchImpl: async () => { calls++; if (calls === 1) throw new TypeError("network down"); return Response.json({ rails: [] }); },
  random: () => 0,
  sleepImpl: async () => {},
});
ok(calls === 2 && Array.isArray(result.rails), "network failure retries exactly once");

calls = 0;
await assert.rejects(
  fetchRailJson("/api/events/fall", {
    fetchImpl: async () => { calls++; return new Response("", { status: 503 }); },
    random: () => 0,
    sleepImpl: async () => {},
  }),
  (error) => error?.kind === RAIL_FAILURE_KIND.DEGRADED && error?.reason === "http_503" && error?.retryAttempts === 1,
);
checks++;
ok(calls === 2, "persistent 503 stops after one retry, never loops");

for (const status of [400, 401, 403, 404]) {
  calls = 0;
  await assert.rejects(
    fetchRailJson("/api/fixture", {
      fetchImpl: async () => { calls++; return new Response("", { status }); },
      random: () => 0,
      sleepImpl: async () => {},
    }),
    (error) => error?.kind === RAIL_FAILURE_KIND.DEVELOPER && error?.reason === `http_${status}` && error?.retryAttempts === 0,
  );
  checks++;
  ok(calls === 1, `${status} is never auto-retried`);
}

calls = 0;
await assert.rejects(
  fetchRailJson("/api/fixture", {
    fetchImpl: async () => { calls++; return new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }); },
  }),
  (error) => error?.kind === RAIL_FAILURE_KIND.DEVELOPER && error?.reason === "invalid_json",
);
checks++;
ok(calls === 1, "invalid JSON is a developer state and is never retried");

// Caller navigation actually aborts the in-flight fetch, rather than merely
// preventing setState after an obsolete request finally settles.
calls = 0;
const inFlight = new AbortController();
const hanging = fetchRailJson("/api/fixture", {
  signal: inFlight.signal,
  fetchImpl: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason || new Error("aborted")), { once: true }));
  },
});
setTimeout(() => inFlight.abort(new Error("navigated")), 5);
await assert.rejects(hanging, (error) => isRailCancelled(error));
checks++;
ok(calls === 1, "navigation aborts the active request without starting a retry");

// Cancellation during jitter/backoff also prevents attempt two.
calls = 0;
const duringBackoff = new AbortController();
const backingOff = fetchRailJson("/api/fixture", {
  signal: duringBackoff.signal,
  fetchImpl: async () => { calls++; return new Response("", { status: 503 }); },
  random: () => 0,
});
setTimeout(() => duringBackoff.abort(new Error("navigated")), 5);
await assert.rejects(backingOff, (error) => isRailCancelled(error));
checks++;
ok(calls === 1, "navigation during backoff cancels before the second network call");

const dev = railDeveloperFailure("invalid_payload", { route: "/api/night-out", requestId: "req-dev" });
ok(dev.kind === RAIL_FAILURE_KIND.DEVELOPER && dev.reason === "invalid_payload", "malformed payloads are explicit developer failures");

// Telemetry is deliberately tiny and attributable. A future field addition is
// a review decision, not silent analytics drift.
const telemetry = railDegradedEvent({
  kind: RAIL_FAILURE_KIND.DEGRADED,
  reason: "http_503",
  retryAttempts: 1,
  requestId: "req-123",
  route: "/api/night-out",
}, { rail: "night-out" });
ok(telemetry.name === "discovery_rail_degraded", "degraded rails use the canonical PostHog event name");
same(Object.keys(telemetry.properties).sort(), ["rail", "reason", "request_id", "retry_attempts", "route"].sort(), "telemetry has exactly the five approved fields");
same(telemetry.properties, {
  rail: "night-out",
  reason: "http_503",
  retry_attempts: 1,
  request_id: "req-123",
  route: "/api/night-out",
}, "telemetry maps rail failure evidence without losing attribution");

// Source wiring: all six target surfaces use the same real helper and an actual
// AbortController. Date Night and generic paging are intentionally out of this
// change and keep clientJson.
const targets = [
  "app/components/FallIntentRails.js",
  "app/components/NightOutRails.js",
  "app/components/SummerIntentRails.js",
  "app/components/TodayDiscoveryRails.js",
  "app/components/BirthdayRails.js",
  "app/summer-picks/client.js",
];
for (const path of targets) {
  const src = readFileSync(path, "utf8");
  ok(src.includes("fetchRailJson"), `${path}: uses the classified rail helper`);
  ok(!src.includes("fetchJsonWithDeadline"), `${path}: old unclassified helper is gone from this surface`);
  ok(src.includes("new AbortController()"), `${path}: owns a real cancellation controller`);
  ok(src.includes("controller.abort()"), `${path}: cleanup actively cancels network work`);
  ok(src.includes("RailMascotBusy"), `${path}: transient failure has branded degraded UI`);
  ok(src.includes("RailDevError"), `${path}: developer failure has a separate unbranded state`);
  ok(src.includes("emitRailDegraded"), `${path}: mascot entry is observable`);
}

const kit = readFileSync("app/components/kit.js", "utf8");
ok(kit.includes("export function RailMascotBusy"), "shared kit owns one mascot outage state");
ok(kit.includes("export function RailDevError"), "shared kit owns one developer-error state");
ok(kit.includes("This rail isn’t available right now."), "developer state uses direct JSX text, not an HTML entity");
const devStart = kit.indexOf("export function RailDevError");
const devRegion = kit.slice(devStart, devStart + 1200);
ok(devStart >= 0 && !devRegion.includes("RailCritter"), "developer errors never get the mascot");
const mascotStart = kit.indexOf("export function RailMascotBusy");
const mascotRegion = kit.slice(mascotStart, mascotStart + 1800);
ok(mascotStart >= 0 && mascotRegion.includes("RailCritter"), "degraded state uses the existing Wayfind Critter");

const summerPage = readFileSync("app/summer-picks/client.js", "utf8");
ok(summerPage.includes("No summer picks are available yet for this area. Try another location or come back soon."), "healthy empty Summer Picks is not mislabeled as an outage");
const night = readFileSync("app/components/NightOutRails.js", "utf8");
ok(/failure && !payload\.rails\.some/.test(night), "Night Out keeps usable local fallback ahead of outage UI");

console.log(`test-rail-failure: ${checks} assertions passed`);
