// scripts/check-home-diet.mjs: locks the homepage "JS diet" deferral.
//
// The homepage's live sporting-events poster tile (app/components/
// useLivePosterTiles.js) used to reach lib/posterEvents.js through a static
// import, which dragged the whole event pipeline (lib/eventsPipeline.js,
// floridaVenue, nightOutIntent + evidence, trendingRails, birthdayIntent,
// railRank, eventPopularity, christmasDiscoveries2026: ~96KB of source,
// ~13.9KB gz) into the eager "/" bundle for a tile that only needs it AFTER
// /api/events has answered. The tile now uses app/components/
// usePosterEventsLazy.js, which loads lib/posterEvents.js behind import().
//
// What this asserts, by IMPORT GRAPH (static import/export-from edges only,
// comments stripped; dynamic import() is deliberately not an edge):
//   1. app/home.js does NOT statically reach any of the moved modules.
//   2. Probe self-test: the same walker, started at app/components/
//      usePosterEvents.js (the eager variant standalone pages use), DOES reach
//      them. A walker that finds nothing anywhere would pass check 1 vacuously.
//   3. The lazy hook holds the boundary itself: no static posterEvents import,
//      one dynamic import, and the live tile uses the lazy hook while still
//      sharing posterEventsCore (no second, independent feed).
//   4. When a build exists (.next/app-build-manifest.json), none of the moved
//      modules' unique string literals appear in any eager "/" chunk, and the
//      probe finds the same literal in the lazy chunk set (so the check is
//      not vacuous). Skipped, loudly, when there is no build yet.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error("check-home-diet: FAIL: " + msg); failures++; }
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function resolveSpec(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".js", base + ".mjs", base + ".jsx", path.join(base, "index.js")]) {
    if (existsSync(c) && !readdirSafe(c)) return c;
  }
  return null;
}
function readdirSafe(p) { try { readdirSync(p); return true; } catch { return false; } }

// Static edges only: `import x from "a"`, `import "a"`, `export ... from "a"`.
// `import("a")` has no whitespace-then-quote form and never matches.
const EDGE = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
function staticGraph(entry) {
  const seen = new Set([entry]);
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(EDGE)) {
      const dep = resolveSpec(file, m[1]);
      if (dep && !seen.has(dep)) { seen.add(dep); stack.push(dep); }
    }
  }
  return seen;
}

const MOVED = [
  "lib/posterEvents.js",
  "lib/eventsPipeline.js",
  "lib/floridaVenue.js",
  "lib/nightOutIntent.js",
  "lib/nightOutEvidence.js",
  "lib/trendingRails.js",
  "lib/christmasDiscoveries2026.js",
].map((p) => path.join(ROOT, p));
const rel = (p) => path.relative(ROOT, p);

// 2. Probe self-test first: prove the walker finds the moved modules from the
// eager hook, so a pass below means "absent", not "walker is blind".
const eagerHook = staticGraph(path.join(ROOT, "app/components/usePosterEvents.js"));
for (const m of MOVED) ok(eagerHook.has(m), `probe is blind: usePosterEvents.js (eager variant) should statically reach ${rel(m)}`);
const wholeGraphProbe = staticGraph(path.join(ROOT, "app/components/NightOutIntentPage.js"));
ok(wholeGraphProbe.has(MOVED[0]), "probe is blind: NightOutIntentPage.js should statically reach lib/posterEvents.js");

// 1. The homepage entry must not reach any of them.
const homeGraph = staticGraph(path.join(ROOT, "app/home.js"));
ok(homeGraph.size > 100, `home.js static graph looks truncated (${homeGraph.size} files)`);
for (const m of MOVED) ok(!homeGraph.has(m), `app/home.js statically reaches ${rel(m)}: the live poster tile must load it through usePosterEventsLazy.js (import()), not an eager edge`);
ok(!homeGraph.has(path.join(ROOT, "app/components/usePosterEvents.js")), "app/home.js statically reaches the EAGER usePosterEvents.js; the homepage must use usePosterEventsLazy.js");

// 3. The boundary itself.
const lazySrc = stripComments(readFileSync(path.join(ROOT, "app/components/usePosterEventsLazy.js"), "utf8"));
ok(!/from\s+["'][^"']*lib\/posterEvents(?:\.js)?["']/.test(lazySrc), "usePosterEventsLazy.js must not statically import lib/posterEvents.js");
ok((lazySrc.match(/import\(\s*["'][^"']*lib\/posterEvents\.js["']\s*\)/g) || []).length === 1, "usePosterEventsLazy.js must hold exactly one dynamic import of lib/posterEvents.js");
ok(/from\s+["']\.\/posterEventsCore\.js["']/.test(lazySrc), "usePosterEventsLazy.js must share posterEventsCore.js (one stale-response protection, no second feed)");
const eagerSrc = stripComments(readFileSync(path.join(ROOT, "app/components/usePosterEvents.js"), "utf8"));
ok(/from\s+["']\.\/posterEventsCore\.js["']/.test(eagerSrc), "usePosterEvents.js must share posterEventsCore.js");
const tileSrc = stripComments(readFileSync(path.join(ROOT, "app/components/useLivePosterTiles.js"), "utf8"));
ok(/import\s*\{\s*usePosterEvents\s*\}\s*from\s*["']\.\/usePosterEventsLazy\.js["']/.test(tileSrc), "useLivePosterTiles.js must import usePosterEvents from ./usePosterEventsLazy.js");
const coreSrc = stripComments(readFileSync(path.join(ROOT, "app/components/posterEventsCore.js"), "utf8"));
const PIPELINE_REF = /lib\/posterEvents|eventsPipeline|nightOutIntent|floridaVenue/;
ok(PIPELINE_REF.test(lazySrc) && PIPELINE_REF.test(eagerSrc), "probe: the pipeline-reference pattern must match the lazy and eager hooks (known positives)");
ok(/fetchJsonWithDeadline/.test(coreSrc) && /usePosterEventsWith/.test(coreSrc), "probe: coreSrc must be the real shared hook source (positive control for the absence check below)");
ok(!PIPELINE_REF.test(coreSrc), "posterEventsCore.js must stay free of the event pipeline (it is eager on \"/\")");

// 4. Built output, when present.
const manifestPath = path.join(ROOT, ".next/app-build-manifest.json");
let builtNote = "built-chunk check skipped (no .next build)";
if (existsSync(manifestPath)) {
  const eager = (JSON.parse(readFileSync(manifestPath, "utf8")).pages["/page"] || []).filter((f) => f.endsWith(".js"));
  const eagerText = eager.map((f) => readFileSync(path.join(ROOT, ".next", f), "utf8"));
  // Unique, stable literals from the moved modules (copy from lib/nightOutEvidence.js
  // and lib/christmasDiscoveries2026.js; the build keeps string contents verbatim).
  const LITERALS = ["Parisian-style dinner theatre and cabaret", "holiday-lights-florida-botanical-2026"];
  const allChunks = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".js")) allChunks.push(p); } };
  walk(path.join(ROOT, ".next/static/chunks"));
  const eagerSet = new Set(eager.map((f) => path.join(ROOT, ".next", f)));
  for (const lit of LITERALS) {
    ok(!eagerText.some((t) => t.includes(lit)), `built eager "/" chunks still contain "${lit}" (moved module is back on the eager path)`);
    ok(allChunks.some((f) => !eagerSet.has(f) && readFileSync(f, "utf8").includes(lit)), `probe: "${lit}" was not found in any lazy chunk, so the built-chunk check proves nothing`);
  }
  builtNote = `built-chunk check ran over ${eager.length} eager chunks and ${allChunks.length} total chunks`;
}

if (failures) { console.error(`check-home-diet: ${failures} failure(s)`); process.exit(1); }
console.log(`check-home-diet: OK (home.js static graph ${homeGraph.size} files, none of ${MOVED.length} moved modules reachable; probe finds all ${MOVED.length} from the eager hook; ${builtNote})`);
