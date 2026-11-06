#!/usr/bin/env node
// Execute Page's blocking events dependency through the installed Next cache
// and Supabase SDK. Only unrelated presentation/ranking imports are stubbed;
// the transport and incremental-cache store are controlled, with no network.
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const React = require("react");
const read = name => readFileSync(path.join(root, name), "utf8");
let pass = 0, fails = 0;
const ok = (value, message) => { if (value) pass++; else { fails++; console.error("FAIL: " + message); } };

// Set placeholders before importing the real SDK client. Never use production
// credentials, and never let a build-phase skip stand in for the runtime read.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://homepage-control.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "homepage-control-anon-key-not-real";
delete process.env.NEXT_PHASE;
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const entries = new Map(), writes = [], requests = [];
let mode = "stall", fixture = [];
globalThis.__incrementalCache = {
  generateSimpleCacheKey: async key => key,
  get: async key => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
  set: async (key, value, options) => { writes.push({ value, options }); entries.set(key, value); },
};
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), signal: init.signal, cache: init.cache });
  if (new URL(url).origin !== "https://homepage-control.supabase.co") throw new Error("Unexpected upstream");
  if (mode === "healthy") return new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } });
  return new Promise((_, reject) => {
    const abort = () => reject(init.signal.reason);
    if (init.signal.aborted) abort();
    else init.signal.addEventListener("abort", abort, { once: true });
  });
};

// Node needs explicit file extensions where Next's bundler supplies them.
// Keep the real unstable_cache implementation and the server module's code.
const serverSource = read("lib/thisWeekEventsServer.js")
  .replace('"next/cache"', JSON.stringify(pathToFileURL(require.resolve("next/cache.js")).href))
  .replace(/from "(\.\/[^\"]+)"/g, (_, spec) => "from " + JSON.stringify(new URL(spec, pathToFileURL(path.join(root, "lib/thisWeekEventsServer.js"))).href));
const server = await import("data:text/javascript;base64," + Buffer.from(serverSource).toString("base64"));
const siteTime = await import("../lib/siteTime.js");
const { addDaysStr } = await import("../lib/thisWeekEvents.js");
const { resolveRailCity } = await import("../lib/locationHonesty.js");
const railCalls = [];
function Home() {}
const deps = {
  react: React,
  "./home": { default: Home },
  "./components/SiteDaySeed": { default: function SiteDaySeed() {} },
  "../lib/siteTime": siteTime,
  "./components/ProofVeil": { default: function ProofVeil() {} },
  "../lib/locationHonesty": { homeProofCopy: () => ({}) },
  "../lib/landing": { rankedFor: () => Promise.resolve([]), whyLine: () => "" },
  "../lib/cultureNotes": { TOWN_PROFILES: {} },
  "../lib/cultureHubs": { TOWN_HUBS: {} },
  "../lib/guides": { GUIDES: [] },
  "../lib/guideLifecycle": { currentGuides: rows => rows },
  "../lib/localEdit": { localEditIndex: rows => rows },
  "../lib/thisWeekEventsServer": server,
  "../lib/railsData": { railMenuData: async slug => {
    railCalls.push(slug);
    if (resolveRailCity(slug, {}) !== null) throw new Error("Unexpected location-specific homepage work");
    return { covered: false, places: {} };
  } },
};
const compiled = ts.transpileModule(read("app/page.js"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: "React.createElement", target: ts.ScriptTarget.ES2022,
} }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", "React", compiled)(name => {
  if (!(name in deps)) throw new Error("Unmodelled homepage dependency: " + name);
  return deps[name];
}, module, module.exports, React);
const Page = module.exports.default;
const homeProps = tree => React.Children.toArray(tree.props.children).find(child => child.type === Home)?.props;

// AbortSignal.timeout is unref'd; the real server keeps the event loop alive.
const keepAlive = setInterval(() => {}, 1000);
try {
  const started = Date.now();
  const stalled = homeProps(await Page());
  const elapsed = Date.now() - started;
  ok(stalled && Array.isArray(stalled.thisWeekEvents) && stalled.thisWeekEvents.length === 0,
    "the cold stalled optional strip settles into the existing empty fallback");
  ok(elapsed < 6000, `the actual cold Page settles before the unchanged 6s homepage probe (observed ${elapsed}ms)`);
  ok(requests.length > 0 && requests.every(request => request.url.includes("/rest/v1/wf_events?") && request.cache === "no-store"),
    "the cold Page executes real SDK live reads instead of skipping its dependency");
  ok(new Set(requests.map(request => request.signal)).size === 1 && requests[0]?.signal.aborted,
    "all SDK attempts share the expired overall signal; retries cannot reset the deadline");
  ok(writes.length === 0 && entries.size === 0, "an unavailable read never populates the hourly data cache with an empty success");

  const today = siteTime.siteTodayStr();
  fixture = [1, 2].map(i => ({
    event_id: "homepage-control-" + i, slug: "homepage-control-" + i, event_name: "Control event " + i,
    event_status: "scheduled", source_tier: 2, verification_confidence: "high", card_hook: "Verified control.",
    city: "Sarasota", state: "FL", lat: 27.3, lng: -82.5,
    start_date: addDaysStr(today, i), end_date: addDaysStr(today, i), select_nights: false, hero_image: "/control.webp",
  }));
  const beforeHealthy = requests.length;
  mode = "healthy";
  const healthy = homeProps(await Page());
  ok(requests.length === beforeHealthy + 1, "a healthy cold read requires exactly one SDK fetch");
  ok(healthy?.thisWeekEvents.length === 2 && healthy.thisWeekEvents.every((card, i) => card.slug === fixture[i].slug),
    "the actual healthy Page receives both verified event cards, never an empty-success strip");
  ok(writes.length === 1 && writes[0].value.revalidate === 3600 && writes[0].options.tags.includes("curated-events"),
    "healthy rows retain the existing hourly tagged cache");
  const beforeWarm = requests.length;
  mode = "stall";
  const warm = homeProps(await Page());
  ok(requests.length === beforeWarm && JSON.stringify(warm?.thisWeekEvents) === JSON.stringify(healthy.thisWeekEvents),
    "warm cached event cards survive unavailable transport without another upstream call");
  ok(railCalls.length === 3 && railCalls.every(slug => slug === null), "all three actual Page calls retain the city-neutral rail path");
} finally { clearInterval(keepAlive); }

if (fails) { console.error(`check-homepage-events-deadline: FAIL (${fails}/${pass + fails})`); process.exit(1); }
console.log(`check-homepage-events-deadline: OK (${pass} assertions; actual Page, Next cache, SDK, deadline and healthy content)`);
