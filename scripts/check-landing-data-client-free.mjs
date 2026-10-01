#!/usr/bin/env node
// check-landing-data-client-free — the landing DATA module must not drag the
// landing RENDER components into every route that only wants ranking data.
//
// Found 2026-10-01 tracing route "/" (check-bundle 509,653 gz bytes, 299 B of
// headroom, production builds failing at 498.0-498.2KB): app/page.js imports
// rankedFor/whyLine from lib/landing.js, and lib/landing.js also held
// LandingPage, so it imported five "use client" components. Next's flight
// client-entry loader makes every client module reachable from a route's
// SERVER module graph an eager client entry of that route, so IconicPlaceCard
// (+ its ~34KB-gz creator-video registry), IntentPartnerPick, TourStrip and
// ThemeParkRail (plus PremiumIntentHero's client imports) shipped in the homepage's initial JS —
// although the home page itself only loads IconicPlaceCard lazily
// (DaypartRail's next/dynamic). Splitting LandingPage into lib/landingPage.js
// took route "/" from 509,653 to 449,596 gz bytes (-60,057).
//
// This walks the REAL import graph (ts.preProcessFile: static imports,
// re-exports and dynamic import()), stopping at "use client" boundaries the
// way the flight loader does, and asserts:
//   A. lib/landing.js reaches NO "use client" module.
//   B. app/page.js's server graph reaches none of the landing render
//      components, nor lib/creatorVideos.js through them.
//   C. lib/landingPage.js is imported only by the four category routes.
// Positive control: lib/landingPage.js's graph DOES reach all four components,
// so a walker that resolved nothing cannot pass A/B.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
let fails = 0, asserts = 0;
const ok = (c, m) => { asserts++; if (!c) { fails++; console.error("  FAIL: " + m); } };

// The landing render half's "use client" components (PremiumIntentHero is a
// SERVER component; assertion A covers whatever it imports).
const RENDER = ["IconicPlaceCard", "IntentPartnerPick", "TourStrip", "ThemeParkRail"]
  .map((n) => `app/components/${n}.js`);
const ROUTES = ["things-to-do", "restaurants", "beaches", "nightlife"].map((c) => `app/${c}/[city]/page.js`);

function resolve(from, spec) {
  if (!spec.startsWith(".")) return null; // packages: not part of this invariant
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".js", base + ".mjs", base + ".jsx", path.join(base, "index.js")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const isClient = (src) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s)*["']use client["']/.test(src);
const cache = new Map();
function edges(file) {
  if (!cache.has(file)) {
    const src = readFileSync(file, "utf8");
    const info = ts.preProcessFile(src, true, true);
    cache.set(file, { client: isClient(src), deps: info.importedFiles.map((x) => resolve(file, x.fileName)).filter(Boolean) });
  }
  return cache.get(file);
}
// The flight loader's view: walk server modules; a "use client" module is a
// boundary — it is recorded as a client entry and not walked further.
function clientEntries(entry) {
  const seen = new Set(), clients = new Set(), stack = [path.join(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const e = edges(f);
    if (e.client && f !== path.join(ROOT, entry)) { clients.add(rel(f)); continue; }
    stack.push(...e.deps);
  }
  return { clients, walked: seen.size };
}
// Everything a set of client entries pulls into the client bundle.
function clientClosure(files) {
  const seen = new Set(), stack = files.map((f) => path.join(ROOT, f));
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); stack.push(...edges(f).deps); }
  return new Set([...seen].map(rel));
}

// Positive control first: the walker must see the render half's components.
const page = clientEntries("lib/landingPage.js");
for (const r of RENDER) ok(page.clients.has(r), `CONTROL: lib/landingPage.js reaches ${r} (walker resolved ${page.walked} modules)`);
ok(clientClosure([...page.clients]).has("lib/creatorVideos.js"), "CONTROL: the render half's client closure contains lib/creatorVideos.js");

// A. the data module reaches no client module at all.
const data = clientEntries("lib/landing.js");
ok(data.clients.size === 0, `lib/landing.js reaches ${data.clients.size} "use client" module(s): ${[...data.clients].join(", ")} — every route importing ranking data would ship them eagerly`);
ok(data.walked > 20, `lib/landing.js walk is real (${data.walked} modules)`);

// B. the homepage's server graph reaches none of the render components.
const home = clientEntries("app/page.js");
for (const r of RENDER) ok(!home.clients.has(r), `app/page.js's server graph reaches ${r} — it becomes an eager client entry on "/"`);
ok(home.clients.has("app/home.js"), "CONTROL: app/page.js's server graph reaches its client root app/home.js");
const viaServer = clientClosure([...home.clients].filter((c) => c !== "app/home.js"));
ok(!RENDER.some((r) => viaServer.has(r)), `a client entry app/page.js reaches through its server graph pulls a landing render component: ${RENDER.filter((r) => viaServer.has(r)).join(", ")}`);

// C. only the four category routes import the render half.
const importers = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|jsx)$/.test(n) && edges(p).deps.includes(path.join(ROOT, "lib/landingPage.js"))) importers.push(rel(p));
  }
};
walk(path.join(ROOT, "app")); walk(path.join(ROOT, "lib"));
ok(JSON.stringify(importers.sort()) === JSON.stringify([...ROUTES].sort()), `lib/landingPage.js is imported by exactly the four category routes (got: ${importers.join(", ")})`);

if (fails) { console.error(`check-landing-data-client-free: FAIL (${fails}/${asserts})`); process.exit(1); }
console.log(`check-landing-data-client-free: OK (${asserts} assertions — lib/landing.js walk ${data.walked} modules, 0 client; app/page.js walk ${home.walked} modules, client entries: ${[...home.clients].sort().join(", ")})`);
