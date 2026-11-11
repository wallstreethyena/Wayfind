#!/usr/bin/env node
// scripts/test-intent-location-fallback.mjs — an intent page with no place in
// the URL is never a dead end.
//
// 2026-11-11: /date-night, /family and /tonight opened from a shared link or a
// search (no ?lat/?lng, no saved homepage location) printed "Choose a location
// to build your date night." with nothing to choose. Landings bounced 90%.
// lib/intentLocationFallback.js adds the free IP location and a one-tap city
// chooser. This guard runs the helpers (no network: fetch and storage are
// injected) and checks that each page wires them.
//
// Hermetic: no env, no network, no file writes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readStoredCenter, fetchIpCenter, chooserHref,
  INTENT_CHOOSER_SLUGS, INTENT_CHOOSER_CITIES,
} from "../lib/intentLocationFallback.js";
import { COVERED_CITIES } from "../lib/landingCities.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// ── readStoredCenter ────────────────────────────────────────────────────────
const store = (value) => ({ getItem: () => value });
eq(readStoredCenter(store(JSON.stringify({ lat: 27.9, lng: -82.4, loc: "Tampa, FL" }))),
  { lat: 27.9, lng: -82.4, loc: "Tampa, FL" }, "A1 a saved homepage location is read");
eq(readStoredCenter(store(JSON.stringify({ lat: "27.9", lng: "-82.4" }))),
  { lat: 27.9, lng: -82.4, loc: "" }, "A2 string coordinates are numbers; a missing label is empty");
eq(readStoredCenter(store(null)), null, "A3 nothing saved -> null");
eq(readStoredCenter(store("{bad json")), null, "A4 corrupt JSON -> null, no throw");
eq(readStoredCenter(store(JSON.stringify({ lat: "x", lng: 1 }))), null, "A5 non-numeric coordinates -> null");
eq(readStoredCenter({ getItem() { throw new Error("SecurityError"); } }), null, "A6 blocked storage -> null, no throw");

// ── fetchIpCenter ───────────────────────────────────────────────────────────
const reply = (body, okStatus = true) => async (url) => {
  assert.equal(url, "/api/geo", "the IP location comes only from the owned /api/geo route");
  return { ok: okStatus, json: async () => body };
};
eq(await fetchIpCenter({ fetchImpl: reply({ ok: true, lat: 27.86, lng: -82.33, name: "Riverview, FL" }) }),
  { lat: 27.86, lng: -82.33, loc: "Riverview, FL", source: "ip" }, "B1 a Florida IP point becomes the ranking origin with its city");
eq(await fetchIpCenter({ fetchImpl: reply({ ok: true, lat: 27.86, lng: -82.33, name: "Riverview" }) }),
  { lat: 27.86, lng: -82.33, loc: "", source: "ip" }, "B2 a name without ', FL' is dropped (coordinates kept, no guessed city)");
eq(await fetchIpCenter({ fetchImpl: reply({ ok: false, outsideFlorida: true }) }), null, "B3 outside Florida -> null (chooser shows)");
eq(await fetchIpCenter({ fetchImpl: reply({ ok: false, lat: 39.96, lng: -83.0, name: "Columbus, OH" }) }), null, "B3b a refused answer is refused even if it carries coordinates");
eq(await fetchIpCenter({ fetchImpl: reply({ ok: true, lat: "nope", lng: 1 }) }), null, "B4 bad coordinates -> null");
eq(await fetchIpCenter({ fetchImpl: reply({}, false) }), null, "B5 HTTP failure -> null");
eq(await fetchIpCenter({ fetchImpl: async () => { throw new Error("offline"); } }), null, "B6 network error -> null, no throw");
const aborted = new AbortController(); aborted.abort();
eq(await fetchIpCenter({ fetchImpl: reply({ ok: true, lat: 1, lng: 1, name: "X, FL" }), signal: aborted.signal }), null, "B7 an already-aborted caller gets null");

// ── chooser cities and links ────────────────────────────────────────────────
eq(INTENT_CHOOSER_CITIES.length, INTENT_CHOOSER_SLUGS.length, "C1 every chooser slug is a covered city (none silently dropped)");
for (const city of INTENT_CHOOSER_CITIES) {
  const covered = COVERED_CITIES[city.slug];
  ok(covered && covered.state === "FL", `C2 ${city.slug} is a covered Florida city`);
  eq([city.lat, city.lng, city.name], [covered.lat, covered.lng, covered.name], `C3 ${city.slug} uses the covered-city coordinates`);
}
ok(INTENT_CHOOSER_CITIES.length >= 8, "C4 the chooser offers at least 8 cities");
const tampa = INTENT_CHOOSER_CITIES.find((c) => c.slug === "tampa");
const href = chooserHref("/date-night", "hour=19&lat=1&lng=2&city=Nowhere&utm_source=ig", tampa);
const url = new URL(href, "https://www.gowayfind.com");
eq(url.pathname, "/date-night", "C5 the link stays on the same page");
eq([url.searchParams.get("lat"), url.searchParams.get("lng"), url.searchParams.get("city")],
  [String(tampa.lat), String(tampa.lng), "Tampa"], "C6 the link replaces lat, lng and city");
eq([url.searchParams.get("hour"), url.searchParams.get("utm_source")], ["19", "ig"], "C7 other parameters (hour, utm) survive");
eq(url.searchParams.getAll("lat").length, 1, "C8 lat is replaced, never duplicated");

// ── wiring on each page ─────────────────────────────────────────────────────
const code = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pages = [
  ["app/components/DateNightIntentPage.js", "date-night"],
  ["app/components/NightOutIntentPage.js", "tonight"],
  ["app/components/FamilyDayPage.js", "family"],
];
for (const [path, intent] of pages) {
  const src = code(path);
  ok(/import\s*\{[^}]*\bfetchIpCenter\b[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/intentLocationFallback\.js"/.test(src), `D1 ${path} imports fetchIpCenter`);
  ok(/\bfetchIpCenter\(\)\.then\(/.test(src), `D2 ${path} calls fetchIpCenter when the URL and storage have no point`);
  ok(/\breadStoredCenter\(\)/.test(src), `D3 ${path} reads the saved location through readStoredCenter`);
  ok(new RegExp(`<IntentLocationChooser\\s+intent="${intent}"\\s+locating=\\{locating\\}`).test(src), `D4 ${path} renders the chooser for "${intent}"`);
  ok(!/localStorage\.getItem\("wf_center"\)/.test(src), `D5 ${path} has no second hand-rolled wf_center reader`);
}
for (const path of ["app/components/DateNightRails.js", "app/components/NightOutRails.js"]) {
  const src = code(path);
  ok(/\bemptyLocation\s*=\s*null\b/.test(src), `E1 ${path} accepts an emptyLocation prop`);
  ok(/if\s*\(!key\)\s*return\s+emptyLocation\s*\|\|/.test(src), `E2 ${path} renders emptyLocation when it has no point`);
}
const chooser = code("app/components/IntentLocationChooser.js");
ok(/<a\s+key=\{city\.slug\}\s+href=\{city\.href\}/.test(chooser), "F1 each city is a real link (works before hydration)");
ok(!/setItem\(\s*"wf_center"/.test(chooser), "F2 the chooser never writes the homepage location");

console.log(`test-intent-location-fallback: OK — ${n} assertions (storage 6, IP location 8, ${INTENT_CHOOSER_CITIES.length} chooser cities, 3 pages + 2 rails wired)`);
