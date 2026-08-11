#!/usr/bin/env node
// scripts/check-weather-code-plumbed.mjs — v6.97.
//
// THE BUG THIS PREVENTS. app/home.js builds the app-wide `weather` state in
// the ranking shape ({ temp, rain, wet, label, ... }). lib/nowContext.js's
// normalizeWeather reads that shape for the outdoor gate — and for weeks the
// shape carried NO `code` and normalizeWeather dropped `wet`, so the gate was
// blind to the LIVE condition: an active storm with a sub-50% daily rain
// probability kept beaches on every rail with "clear" copy while the weather
// chip beside them said Rain. Server was healthy; every suite was green —
// nothing asserted the two shapes actually meet.
//
// The behavioural half lives in scripts/test-now-context.mjs (it CALLS
// normalizeWeather/weatherFlags with wet/code inputs). This file is the
// WIRING half: the client state must keep carrying the signals the gate now
// reads. Syntactic-position assertions, not bare substrings (CLAUDE.md: the
// identifier must play its ROLE), with a positive control first.
import { readFileSync } from "node:fs";
const fail = (m) => { console.error("check-weather-code-plumbed: FAIL — " + m); process.exit(1); };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// Positive control: the probe must find the setWeather block it claims to
// scan. If this known-positive is absent, the check is broken — not clean.
const at = home.indexOf("setWeather({");
if (at < 0) fail("positive control failed: no setWeather({ in app/home.js — the probe is scanning the wrong file/shape");
const block = home.slice(at, at + 3000);

// 1. The live condition CODE rides in the state object (property position,
//    sourced from the current-conditions payload, not a re-derived label).
if (!/code:\s*cur\.weather_code\s*!=\s*null\s*\?\s*Number\(cur\.weather_code\)\s*:\s*null,/.test(block))
  fail("setWeather no longer carries `code: cur.weather_code …` — nowContext's WET_CODES/SEVERE_CODES go blind to live rain/storms (the wet-drop bug returns)");
// 2. The derived wet boolean still rides along beside it.
if (!/wet:\s*w\.wet,/.test(block))
  fail("setWeather no longer carries `wet: w.wet` — the ranking shape loses its live-wet signal");

// 3. And the consumer still reads both: normalizeWeather's ranking branch
//    must pass `wet` through, and weatherFlags must consult it.
const now = readFileSync(new URL("../lib/nowContext.js", import.meta.url), "utf8");
if (!/wet:\s*w\.wet\s*===\s*true\s*\?\s*true\s*:\s*null,/.test(now))
  fail("normalizeWeather's ranking branch no longer passes the explicit wet report through");
if (!/severe\s*\|\|\s*nw\.wet\s*===\s*true/.test(now))
  fail("weatherFlags no longer consults the explicit wet report — isWet is rain%-only again");

console.log("check-weather-code-plumbed: OK — setWeather carries code+wet and nowContext consumes both (1 positive control, 4 role-position assertions)");
