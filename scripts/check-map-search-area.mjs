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
ok(/fitSettleRef\.current\.afterMove\(here, searchOriginRef\.current, !!\(e && e\.originalEvent\)\)/.test(view), "…and asks the PURE fit-aware tracker (lib/mapExplorer.js createFitSettleTracker), not an inline copy");
ok(/fitSettleRef\.current\.beginFit\(\); map\.fitBounds\(/.test(view) && /if \(!fit\) fitSettleRef\.current\.endFit\(\);/.test(view), "…and marks every programmatic fitBounds, and clears it outside fit mode");
// EXECUTED (2026-11-05, #2121 for the MapLibre renderer): a list fit is not a pan.
{
  const { createFitSettleTracker } = await import("../lib/mapExplorer.js");
  const origin = { lat: 27.3, lng: -82.5 }, fitted = { lat: 27.9, lng: -82.9 };
  const t = createFitSettleTracker();
  ok(t.afterMove(fitted, origin, true) && t.afterMove(fitted, origin, false), "control: without a fit, a 40mi move offers (user or not) — the probe can say yes");
  t.beginFit();
  ok(t.afterMove(fitted, origin, false) === null, "the settle of a programmatic fit far from the origin never offers (the unpinned note stays)");
  ok(t.afterMove({ lat: 27.905, lng: -82.905 }, origin, true) === null, "a sub-threshold user nudge after the fit does not offer (measured from the FITTED center)");
  const far = t.afterMove({ lat: 28.4, lng: -82.9 }, origin, true);
  ok(far && far.lat === 28.4, "a real user pan away from the fitted center still offers the area search");
  t.endFit();
  ok(t.afterMove(fitted, origin, true)?.lat === 27.9, "leaving fit mode measures pans from the search origin again");
  t.beginFit();
  ok(t.afterMove(fitted, origin, true)?.lat === 27.9, "a user gesture that lands while a fit is pending is a real move, never swallowed");
  ok(t.afterMove(origin, origin, true) === null, "the offer RETRACTS (null) when the map returns near the origin");
}
// v7.16 (owner): pins carry NO score text — they are tip-anchored teardrop
// sprites, and the score renders in the bottom card as the full Wayfind
// badge. What must hold now is the inverse: no score-text layer sneaks back
// onto the map where it cannot carry the governed display conversion.
ok(!/scoreLabel/.test(view), "no pin score-text path remains — the score belongs to the bottom card (v7.16)");
ok(/"icon-anchor": "bottom"/.test(view), "pins stay tip-anchored on the exact coordinate");
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
