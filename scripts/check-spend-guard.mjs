// scripts/check-spend-guard.mjs — THE $1,878 GUARD (2026-08-25).
//
// August 1-25, 2026: $1,878.92 of Google Places spend. Root causes, so they are
// never rediscovered the hard way:
//   (a) `editorialSummary` in the Place Details field mask billed EVERY call at
//       the Enterprise + Atmosphere SKU (~$25/1k) — $1,198 of the bill — for a
//       field the product does not display (v6.61).
//   (b) The same Text Search query was bought at two radii (27359m AND 32000m):
//       Google support case 74703052 measured a 10–86% duplicate rate.
//   (c) Background pipelines re-bought cached places on a schedule.
//
// This guard pins the fixes:
//   1. No atmosphere-tier field (editorialSummary, reviews, serves*, allowsDogs)
//      may appear in a server-side Places field mask. lib/google.js (the client
//      detail sheet) is the ONE allowlisted exception — an owner spend decision;
//      volume is a handful of detail-opens a day and the project quota cap
//      bounds it. atlas-build lost the field with the rest.
//   2. Every metered server call site must import the spend gate (lib/spendGate.js)
//      or define the identical local gate (search route), so WAYFIND_GATE=shut
//      always means ZERO paid Google calls.
//   3. The radius ladder must stay in /api/places/search.
import { readFileSync } from "node:fs";

let failed = 0;
const die = (msg) => { console.error("check-spend-guard: FAIL — " + msg); failed++; };
const read = (p) => readFileSync(p, "utf8");

const ATMOSPHERE = /editorialSummary|\breviews\b|serves[A-Z]|allowsDogs/;

// 1 — masks that must stay lean (file → mask const name, for the error message)
const MASK_FILES = [
  "lib/placeDetails.js",
  "lib/landing.js",
  "lib/nightlifeCensus.js",
  "app/api/places/search/route.js",
  "app/api/places/refresh/route.js",
  "app/api/city/unlock/route.js",
  "app/api/cron/atlas-build/route.js",
];
for (const f of MASK_FILES) {
  const src = read(f);
  // Only inspect mask-bearing lines: const *FIELDS*/MASK* strings and FieldMask headers.
  const maskLines = src.split("\n").filter((l) =>
    /X-Goog-FieldMask|FIELDS\s*=|FIELD_MASK\s*=|_MASK\s*=|PLACE_FIELDS\s*=/.test(l) && /"/.test(l) && !l.trim().startsWith("//")
  );
  for (const l of maskLines) {
    if (ATMOSPHERE.test(l)) die(`${f} carries an atmosphere-tier field in a mask line: ${l.trim().slice(0, 120)} — this re-creates the August 2026 bill. Owner spend decision required.`);
  }
}

// 2 — every metered call site is gated
const GATED_FILES = [
  "lib/placeDetails.js",
  "app/api/photo/route.js",
  "app/api/places/refresh/route.js",
  "app/api/cron/scout/route.js",
  "app/api/cron/promote-index/route.js",
  "app/api/cron/inventory-refresh/route.js",
  "app/api/cron/atlas-build/route.js",
  "app/api/city/unlock/route.js",
];
for (const f of GATED_FILES) {
  const src = read(f);
  if (!/spendGate/.test(src)) die(`${f} calls Google but does not import lib/spendGate.js — WAYFIND_GATE=shut would leak spend here.`);
  if (!/gateShut\(\)/.test(src)) die(`${f} imports the gate but never calls gateShut().`);
}
const search = read("app/api/places/search/route.js");
if (!/WAYFIND_GATE/.test(search)) die("search route lost its WAYFIND_GATE kill switch.");

// 3 — the radius ladder stays
if (!/RADIUS_LADDER/.test(search)) die("search route lost the radius ladder — duplicate paid searches return (Google case 74703052).");

// red-prove ourselves: the atmosphere regex must actually catch the original sin
if (!ATMOSPHERE.test('const FIELDS = "id,editorialSummary";')) die("self-test: atmosphere regex is broken");

if (failed) { console.error(`check-spend-guard: ${failed} failure(s)`); process.exit(1); }
console.log("check-spend-guard: OK — masks lean, every metered call site gated, radius ladder present");
