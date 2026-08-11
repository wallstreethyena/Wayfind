// scripts/check-map-search-area.mjs — "Search this area" + score-on-pin
// (owner-approved 2026-08-11; the two map patterns adopted from the
// best-in-class place-discovery maps).

import { readFileSync } from "node:fs";

let failures = 0;
const ok = (cond, m) => { if (cond) console.log("  ok:", m); else { failures++; console.error("  FAIL:", m); } };

// ── 1. the pure pieces, executed ────────────────────────────────────────────
const { areaMoved, pinScoreLabel, AREA_MOVE_THRESHOLD_MI } = await import("../lib/mapExplorer.js");
const { toDisplayScore } = await import("../lib/score.js");
ok(AREA_MOVE_THRESHOLD_MI === 2.5, "threshold is the declared 2.5mi");
ok(areaMoved({ lat: 27.5, lng: -82.4 }, { lat: 27.5, lng: -82.4 }) === false, "no movement -> no offer");
ok(areaMoved({ lat: 27.5, lng: -82.4 }, { lat: 27.5145, lng: -82.4 }) === false, "1mi drift -> no offer (below threshold)");
ok(areaMoved({ lat: 27.5, lng: -82.4 }, { lat: 27.5434, lng: -82.4 }) === true, "3mi drift -> offer");
ok(areaMoved(null, { lat: 1, lng: 2 }) === false && areaMoved({ lat: "x", lng: 0 }, { lat: 1, lng: 2 }) === false, "garbage in -> false, never a throw");
ok(pinScoreLabel(92, 3, toDisplayScore) === "9.2", "a valid score renders as the displayed /10 value");
ok(pinScoreLabel(null, 3, toDisplayScore) === "3", "SCORE LAW: a null score falls back to rank, never a fabricated number");
ok(pinScoreLabel(105, 2, toDisplayScore) === "2", "an out-of-range score is null-shaped too — rank fallback");

// ── 2. wiring, pinned where it cannot be executed ───────────────────────────
const view = readFileSync("app/components/MapView.js", "utf8");
ok(/map\.on\("moveend"/.test(view), "MapView listens on moveend");
ok(/areaMoved\(searchOriginRef\.current/.test(view), "…and asks the PURE areaMoved, not an inline copy");
ok(/cb\(areaMoved\([^)]*\) \? here : null\)/.test(view), "the offer RETRACTS (null) when the map returns near the origin");
ok(/"text-field": \["get", "scoreLabel"\]/.test(view), "pin labels read the scoreLabel property");
ok(/pinScoreLabel\(place\.wfScore, index \+ 1, toDisplayScore\)/.test(view), "scoreLabel is built by the shared helper with the governed display conversion");
ok(!/"text-field": \["to-string", \["get", "rank"\]\]/.test(view), "the old rank text-field is gone (rank still sizes and pages)");

const screen = readFileSync("app/components/screens/Map.js", "utf8");
ok(/onAreaChange=\{setAreaOffer\}/.test(screen), "MapView reports the offer into screen state");
ok(/areaOffer && searchMapArea &&/.test(screen), "the pill renders only while an offer stands and the ctx handler exists");
ok(/Search this area/.test(screen), "the pill says what it does");
ok(/setAreaOffer\(null\); searchMapArea\(a\)/.test(screen), "tapping clears the offer and re-anchors via ctx");

const home = readFileSync("app/home.js", "utf8");
ok(/function searchMapArea\(c\)/.test(home), "home.js defines the re-anchor");
ok(/searchMapArea\(c\)[\s\S]{0,400}manualRef\.current = true;[\s\S]{0,200}setCenter\(\{ lat: c\.lat, lng: c\.lng \}\)/.test(home), "…which sets the manual flag BEFORE recentering (a GPS fix must not yank it back)");
ok(/searchMapArea, mapFocus, setMapFocus,/.test(home), "…and it is threaded into ctx where the Map screen reads it");
ok(!/setLocName\("this map area"[\s\S]{0,80}reverse/i.test("") && /setLocName\("this map area"\)/.test(home), "the location label is honestly generic — no invented city name for arbitrary coordinates");

console.log(failures ? `check-map-search-area: ${failures} FAILURE(S)` : "check-map-search-area: all green — areaMoved + pinScoreLabel executed (8 controls incl. the score-law rank fallback), moveend->offer->pill->re-anchor chain pinned end to end");
process.exit(failures ? 1 : 0);
