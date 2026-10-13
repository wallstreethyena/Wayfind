#!/usr/bin/env node
// check-synthetic-map-contracts — 2026-10-13. Locks the two live contracts the
// synthetic monitor broke on after #1636 (8220647, 2026-10-05):
//
//  1. `event-apple-maps` ("no Google Maps link remains on the event page"):
//     owner rule 2026-09-08, Apple Maps PERMANENTLY on event pages. #1636 added
//     a "Google Maps" photo-credit link to app/florida-events/[slug]/page.js.
//     Assert: no event-page source (page files + the event components they
//     mount) can emit a google.com/maps | maps.google | goo.gl/maps URL.
//  2. `surface-parity-parrish-cafes` (window.__wfMapPins): #1636 made MapKit
//     (AppleExplorerMap) the default flat renderer; only the old MapLibre
//     MapView published the hook, so every Apple-rendered map lost it. Assert
//     by CALLING the Apple controller with a fake MapKit and reading the hook,
//     and statically that Map.js mounts only renderers that publish it.
//
// Controls: the Google-URL probe is proven on a known positive (app/components/
// kit.js builds Google Maps URLs) before the absence assertion is trusted.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const GOOGLE_MAPS = /google\.com\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/;
const walk = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((f) => {
  const rel = path.join(dir, f);
  return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : /\.(js|jsx|mjs)$/.test(f) ? [rel] : [];
});

// ---- 1. event pages emit no Google Maps URL -------------------------------
ok(GOOGLE_MAPS.test(read("app/components/kit.js")), "probe control: the Google Maps regex must find kit.js's known Google URL builder");
const eventFiles = [
  ...walk("app/florida-events"), ...walk("app/events"),
  ...readdirSync(path.join(ROOT, "app/components")).filter((f) => /^Event.*\.js$/.test(f)).map((f) => "app/components/" + f),
  "lib/eventMapPlaces.js",
];
let scanned = 0;
for (const f of eventFiles) {
  let src; try { src = read(f); } catch { continue; }
  scanned++;
  ok(!GOOGLE_MAPS.test(strip(src)), `${f} emits a Google Maps URL — event pages use Apple Maps permanently (owner, 2026-09-08)`);
}
ok(scanned >= 8, `event-page scan covered too few files (${scanned})`);
const evPage = strip(read("app/florida-events/[slug]/page.js"));
ok(!/(^|[^A-Za-z])directionsUrl\s*\(/.test(evPage), "florida-events page calls the Google directionsUrl() — use appleDirectionsUrl");
ok(/appleDirectionsUrl\(e\)/.test(evPage), "florida-events page must build its outbound directions with appleDirectionsUrl");

// ---- 2. every flat-map renderer publishes window.__wfMapPins --------------
const mapScreen = strip(read("app/components/screens/Map.js"));
const mounted = [...mapScreen.matchAll(/<(MapView|AppleExplorerMap)[\s/>]/g)].map((m) => m[1]);
ok(mounted.includes("AppleExplorerMap") && mounted.includes("MapView"), `Map.js mounts ${JSON.stringify(mounted)}; this guard expects both renderers — update it if one was removed`);
ok(/window\.__wfMapPins\s*=/.test(strip(read("app/components/MapView.js"))), "MapView no longer publishes window.__wfMapPins");
ok(/window\.__wfMapPins\s*=/.test(strip(read("lib/appleExplorerMap.js"))), "lib/appleExplorerMap.js (the DEFAULT flat map) no longer publishes window.__wfMapPins");

// Call it: fake MapKit, real controller, read the hook.
const { createAppleExplorerController } = await import("../lib/appleExplorerMap.js");
class Coord { constructor(a, b) { this.latitude = a; this.longitude = b; } }
class Ann { constructor(c, o) { this.coordinate = c; Object.assign(this, o); } }
class FakeMap { constructor() { this.annotations = []; } addAnnotations(a) { this.annotations.push(...a); } removeAnnotations() {} addOverlays() {} removeOverlays() {} addEventListener() {} removeEventListener() {} destroy() {} }
const mapkit = { Map: FakeMap, Coordinate: Coord, ImageAnnotation: Ann, Annotation: Ann, Padding: class {} };
globalThis.window = globalThis.window || {};
delete globalThis.window.__wfMapPins;
const places = [
  { id: "ChIJ-ryans", name: "Ryan's Coffee House", lat: 27.58, lng: -82.43, category: "food" },
  { id: "ChIJ-other", name: "Other Cafe", lat: 27.59, lng: -82.44, category: "food" },
  { id: "ChIJ-nocoords", name: "No coords" },
];
const ctl = createAppleExplorerController({ mapkit, container: {}, center: { lat: 27.58, lng: -82.43 }, places, category: "food" });
const hook = globalThis.window.__wfMapPins;
ok(hook && Array.isArray(hook.ids), "createAppleExplorerController did not set window.__wfMapPins");
ok(hook && hook.ids.length === 2 && hook.ids.includes("ChIJ-ryans") && !hook.ids.includes("ChIJ-nocoords"), `hook ids must equal the pinned places exactly (got ${JSON.stringify(hook && hook.ids)})`);
ctl.update({ places: [places[1]], center: { lat: 27.58, lng: -82.43 }, category: "food" });
const hook2 = globalThis.window.__wfMapPins;
ok(!!hook2 && hook2.ids.length === 1 && hook2.ids[0] === "ChIJ-other", "hook must follow update() (streamed/filtered results)");
ctl.destroy();

if (bad.length) { console.error(`check-synthetic-map-contracts: FAIL — ${bad.length}/${n}`); bad.forEach((b) => console.error("  - " + b)); process.exit(1); }
console.log(`check-synthetic-map-contracts: OK — ${n} assertions (${scanned} event-page files scanned for Google Maps URLs against a proven probe; Apple controller called with fake MapKit publishes window.__wfMapPins)`);
