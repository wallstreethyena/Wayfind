// scripts/sync-maplibre-worker.mjs — vendor maplibre's worker into public/.
//
// THE BUG THIS EXISTS FOR (v6.43): the Map tab rendered nothing — no tiles, no
// error, no fallback. maplibre-gl v6 is ESM-only and resolves its Web Worker
// script from `import.meta.url`. Next 14's webpack rewrites `import.meta.url`
// in client output to a build-time `file:///vercel/path0/...` literal, which
// fails maplibre's own `/^https?:/` guard, so its worker URL resolved to the
// empty string. `new Worker("")` resolves against the document base — the
// worker script became the HTML page itself. Every vector tile is decoded in
// that worker, so nothing ever drew, and because no request failed, MapView's
// error handler never fired and the "map could not load" fallback never showed.
//
// The fix is to hand maplibre an explicit same-origin worker URL
// (`setWorkerUrl` in app/components/MapView.js). That URL has to point at a
// real file, which is what this script puts there.
//
// maplibre-gl-worker.mjs does `import ... from "./maplibre-gl-shared.mjs"`, so
// BOTH files must sit in the same directory or the worker dies on import.
//
// The copies are committed so `next dev` works without a prebuild, and
// scripts/test-map-worker.mjs asserts byte-identity in prebuild — so a
// maplibre upgrade that renames or changes these files fails the build loudly
// instead of silently shipping a dead map again.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const SRC_DIR = "node_modules/maplibre-gl/dist/";
const DEST_DIR = "public/maplibre/";

const fail = (m) => { console.error("sync-maplibre-worker: FAIL — " + m); process.exit(1); };
const p = (rel) => fileURLToPath(new URL(rel, root));

if (!existsSync(p("node_modules/maplibre-gl/package.json"))) {
  fail("maplibre-gl is not installed — run npm install first");
}
const version = JSON.parse(readFileSync(p("node_modules/maplibre-gl/package.json"), "utf8")).version;

mkdirSync(p(DEST_DIR), { recursive: true });
for (const f of FILES) {
  const src = p(SRC_DIR + f);
  if (!existsSync(src)) {
    fail(`${SRC_DIR}${f} is missing. maplibre-gl@${version} does not ship it under that name — `
      + "the worker filenames changed. Update FILES here and the setWorkerUrl() path in "
      + "app/components/MapView.js before shipping, or the map will render blank.");
  }
  copyFileSync(src, p(DEST_DIR + f));
}
console.log(`sync-maplibre-worker: OK — vendored ${FILES.length} files from maplibre-gl@${version} into ${DEST_DIR}`);
