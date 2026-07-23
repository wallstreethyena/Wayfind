// scripts/test-searched-location.mjs — locks "a searched location persists across
// remounts" (back from a hero-card page must NOT snap back to the device location
// and force a re-search).
import { readFileSync } from "fs";
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// persist carries the manual flag + timestamp
ok(/setItem\("wf_center", JSON\.stringify\(\{ lat: center\.lat, lng: center\.lng, loc: locName, manual: !!manualRef\.current, ts: Date\.now\(\) \}\)\)/.test(h), "wf_center persists whether the location was a MANUAL search + when");

// mount restore: only a fresh MANUAL search, and it marks manualRef so GPS stands down
ok(/const raw = localStorage\.getItem\("wf_center"\);/.test(h), "on mount it reads back the last location");
ok(/c\.manual && isFinite\(c\.lat\) && isFinite\(c\.lng\) && \(!c\.ts \|\| Date\.now\(\) - c\.ts < 6 \* 3600 \* 1000\)/.test(h), "restores ONLY a manual search, and only if recent (<6h)");
ok(/manualRef\.current = true;\s*\n\s*setCenter\(\{ lat: c\.lat, lng: c\.lng \}\);/.test(h), "restoring a search marks manualRef so the geolocation effect won't override it");

// geolocation still stands down on a manual search
ok(/if \(manualRef\.current\) return;/.test(h), "the geolocation effect still yields to a manual search (the guard that now fires on restore too)");

// Clear × is a real revert-to-device
ok(/manualRef\.current = false; try \{ localStorage\.removeItem\("wf_center"\)/.test(h), "Clear × resets manual mode + forgets the searched location");
ok(/if \(deviceLoc && isFinite\(deviceLoc\.lat\)\) \{ setCenter\(\{ lat: deviceLoc\.lat, lng: deviceLoc\.lng \}\);/.test(h), "Clear × recenters to the device location");

console.log(`test-searched-location: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
