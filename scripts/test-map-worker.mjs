// scripts/test-map-worker.mjs — v6.43 THE BLANK MAP guardrail.
//
// THE LESSON (July 2026, owner-reported "the maps is gone from the maps tab"):
// maplibre-gl v6 is ESM-only and derives its Web Worker URL from
// `import.meta.url`. Next 14's client webpack output replaces that with a
// build-time `file://` literal, maplibre's `/^https?:/` guard rejects it and
// returns "", and `new Worker("")` loads the HTML document as the worker.
// Tile decoding happens entirely in that worker, so the map drew nothing —
// and since no network request failed, MapView's error handler never fired
// and the user got a silent blank panel instead of the fallback card.
//
// Proven by A/B in a headless browser against the real maplibre dist: with the
// webpack-rewritten `import.meta.url`, worker URL = the document and
// `styleLoaded` stayed false; with setWorkerUrl() pointing at a real
// same-origin file, worker URL = the worker and `styleLoaded` went true.
//
// These asserts make regressing that a build failure.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("test-map-worker: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const WORKER_PATH = "/maplibre/maplibre-gl-worker.mjs";
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

// 1. MapView must hand maplibre an explicit same-origin worker URL.
const view = readFileSync(p("app/components/MapView.js"), "utf8");
ok(/\bsetWorkerUrl\b/.test(view), "MapView imports and calls setWorkerUrl — without it maplibre resolves the worker from import.meta.url, which webpack turns into a file:// literal and maplibre discards");
ok(view.includes(`setWorkerUrl("${WORKER_PATH}")`), `MapView calls setWorkerUrl("${WORKER_PATH}") — the path must be same-origin and root-relative or maplibre falls back to a cross-origin blob shim`);

// 2. The vendored worker files must exist and be byte-identical to the
//    installed maplibre. A maplibre upgrade that changes them without a
//    `npm run sync:maplibre` fails here rather than in the browser.
ok(existsSync(p("node_modules/maplibre-gl/package.json")), "maplibre-gl is installed");
const version = JSON.parse(readFileSync(p("node_modules/maplibre-gl/package.json"), "utf8")).version;
for (const f of FILES) {
  const src = p("node_modules/maplibre-gl/dist/" + f);
  const dest = p("public/maplibre/" + f);
  ok(existsSync(src), `maplibre-gl@${version} ships dist/${f}`);
  ok(existsSync(dest), `public/maplibre/${f} exists — run: npm run sync:maplibre`);
  ok(readFileSync(src).equals(readFileSync(dest)), `public/maplibre/${f} is byte-identical to maplibre-gl@${version} — run: npm run sync:maplibre`);
}

// 3. The worker's own relative import must resolve inside public/maplibre/,
//    which is only true while both files are siblings there.
const worker = readFileSync(p("public/maplibre/maplibre-gl-worker.mjs"), "utf8");
const rel = [...worker.matchAll(/from\s*["'](\.\/[^"']+)["']/g)].map((m) => m[1]);
ok(rel.length > 0, "the vendored worker still has a relative import (sanity check that we vendored the real file)");
for (const r of rel) {
  ok(FILES.includes(r.replace("./", "")), `the worker's relative import ${r} is vendored alongside it — otherwise the worker throws on import and the map goes blank`);
}

// 4. public/ must not be served with a long cache for these — next.config.js
//    only long-caches image extensions, so .mjs falls through to Next's
//    max-age=0 default. Assert the image rule has not grown to swallow .mjs.
const cfg = readFileSync(p("next.config.js"), "utf8");
const imgRule = cfg.match(/source:\s*"\/:all\*\(([^)]*)\)"/);
ok(imgRule, "next.config.js still has the public/ image cache rule (this assert needs updating if it moved)");
ok(!/\bmjs\b|\bjs\b/.test(imgRule[1]), "the long-lived public/ cache rule does NOT cover .mjs — a 30-day-cached stale worker would survive a maplibre upgrade");

console.log(`test-map-worker: OK — ${pass} assertions (maplibre worker vendored and wired; the blank map cannot come back silently)`);
