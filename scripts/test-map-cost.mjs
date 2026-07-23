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
// Visual Release 01 intentionally removes the desktop map sidebar: it made the
// primary discovery surface feel stitched together and the map is still one tap
// away in its dedicated screen. The hard requirement is no auto-mounted paid map,
// not a permanent preview sidebar. MapPreview remains available to other surfaces.
ok(!/<MapView places=\{_pins\}/.test(home), "home does NOT auto-mount the real map (the July bill)");
ok(!/<MapPreview places=\{_pins\}/.test(home), "Visual Release 01 keeps the desktop discovery surface map-free");
ok(/id: "map"[\s\S]*?label: "Map"/.test(home) && /setScreen\(s\.id\)/.test(home), "the Map navigation still opens the real map screen on explicit user intent");

ok(existsSync(new URL("../app/components/MapPreview.js", import.meta.url)), "MapPreview component exists");
const prev = readFileSync(new URL("../app/components/MapPreview.js", import.meta.url), "utf8");
ok(!/googlemaps|google\.maps|importLibrary|js-api-loader/.test(prev), "MapPreview touches NO Google SDK — zero billed loads");

const gg = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
ok(/wf_revgeo\|/.test(gg), "reverseGeocode caches by rounded coordinate cell");
ok(/_reverseGeocodeUncached/.test(gg), "reverseGeocode wraps the paid call behind the cache");
ok(/30 \* 86400000/.test(gg), "reverse-geocode cache holds for 30 days");

console.log(`test-map-cost: OK — ${pass} assertions (no billed map loads without user intent; geocoding cached)`);
