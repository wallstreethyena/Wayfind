// scripts/test-map-cost.mjs — v6.41 THE MAP BILL guardrails.
//
// THE LESSON (July 2026 Google bill, owner-reported): the desktop sidebar
// mounted the REAL Google Map on every home visit — one billed Dynamic Maps
// load per visitor who never asked for a map — and reverse geocoding paid a
// call per visit for a city name that never changes. Paid SDK surfaces must
// be (1) mounted only on explicit user intent and (2) cached when the answer
// is stable. These asserts make regressing that a build failure.
import { readFileSync, existsSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-map-cost: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/<MapPreview places=\{_pins\}/.test(home), "desktop sidebar renders the FREE MapPreview");
ok(!/<MapView places=\{_pins\}/.test(home), "desktop sidebar does NOT mount the billed Google Map (the July bill)");
ok(/import MapPreview from "\.\/components\/MapPreview"/.test(home), "home.js imports MapPreview");
ok(/setScreen\("map"\)/.test(home), "the Full map button still opens the real map screen (paid loads = real usage)");

ok(existsSync(new URL("../app/components/MapPreview.js", import.meta.url)), "MapPreview component exists");
const prev = readFileSync(new URL("../app/components/MapPreview.js", import.meta.url), "utf8");
ok(!/googlemaps|google\.maps|importLibrary|js-api-loader/.test(prev), "MapPreview touches NO Google SDK — zero billed loads");

const gg = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
ok(/wf_revgeo\|/.test(gg), "reverseGeocode caches by rounded coordinate cell");
ok(/_reverseGeocodeUncached/.test(gg), "reverseGeocode wraps the paid call behind the cache");
ok(/30 \* 86400000/.test(gg), "reverse-geocode cache holds for 30 days");

console.log(`test-map-cost: OK — ${pass} assertions (no billed map loads without user intent; geocoding cached)`);
