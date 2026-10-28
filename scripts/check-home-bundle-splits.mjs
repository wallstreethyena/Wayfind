// Homepage bundle split lock (2026-10-28). Main's "/" total JS had 0.0KB of
// headroom under scripts/check-bundle.mjs, so one tiny change failed the merge
// gate. app/home.js imported wcRotation (a tap handler on the World Cup hero)
// from lib/shareCards.js, and shareCards statically imports lib/intentPages.js
// which imports lib/collectionHeader.js: about 11KB gz of intent-page copy in
// the eager homepage bundle for a ten-line copy rotation. wcRotation now lives
// in the dependency-free lib/wcRotations.js and shareCards re-exports it.
//
// This guard walks the STATIC import graph from app/home.js (dynamic import()
// edges are deliberately not followed, they are separate chunks) and asserts
// the heavy modules stay out of it. It carries a positive control so a broken
// walker cannot pass vacuously, and it calls the real exports rather than
// grepping for strings.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (c, m) => { if (c) console.log("  ok  " + m); else { failed++; console.error("  FAIL " + m); } };

// One left-to-right pass so a "/*" inside a // comment (or a "//" inside a string)
// is read in the right context. Strings are kept (import specifiers live in them).
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g, (m, str) => str || "");
const IMPORT_RX = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
const resolveRel = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of ["", ".js", ".jsx", ".mjs", "/index.js"]) {
    const p = base + ext;
    if (existsSync(p) && /\.(m?js|jsx)$/.test(p)) return p;
  }
  return null;
};
// Static closure: returns Map(file -> first importer).
function staticClosure(entry, readSrc = (f) => readFileSync(f, "utf8")) {
  const seen = new Map([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift();
    let src;
    try { src = strip(readSrc(f)); } catch { continue; }
    for (const m of src.matchAll(IMPORT_RX)) {
      const r = resolveRel(f, m[1] || m[2]);
      if (r && !seen.has(r)) { seen.set(r, f); queue.push(r); }
    }
  }
  return seen;
}
const rel = (p) => path.relative(REPO, p);

const HOME = path.join(REPO, "app/home.js");
const closure = staticClosure(HOME);

// Positive controls: the walker really follows nested static edges. lib/ranking
// and lib/rankPlaces are known static dependencies, and a synthetic importer of
// shareCards must put intentPages and collectionHeader into the closure.
ok(closure.has(path.join(REPO, "lib/ranking.js")), "control: walker finds lib/ranking.js statically imported by app/home.js");
ok(closure.size > 100, `control: walker reached ${closure.size} modules from app/home.js`);
const synth = path.join(REPO, "app/__synthetic_importer__.js");
const synthClosure = staticClosure(synth, (f) => {
  if (f === synth) return 'import { wcRotation } from "../lib/shareCards.js";';
  return readFileSync(f, "utf8");
});
ok(synthClosure.has(path.join(REPO, "lib/intentPages.js")) && synthClosure.has(path.join(REPO, "lib/collectionHeader.js")),
  "control: a static import of lib/shareCards.js DOES pull lib/intentPages.js and lib/collectionHeader.js (walker can see the failure it guards)");

// The lock.
for (const heavy of ["lib/shareCards.js", "lib/intentPages.js", "lib/collectionHeader.js"]) {
  ok(!closure.has(path.join(REPO, heavy)), `${heavy} is NOT in the static import closure of app/home.js (~11KB gz stays out of "/")`);
}
ok(/import\s*\{\s*wcRotation\s*\}\s*from\s*["']\.\.\/lib\/wcRotations(?:\.js)?["']/.test(strip(readFileSync(HOME, "utf8"))),
  "app/home.js imports wcRotation from lib/wcRotations");
ok(closure.has(path.join(REPO, "lib/wcRotations.js")), "lib/wcRotations.js is in the homepage closure (the tap handler still has its copy)");

// wcRotations stays dependency free.
const wcSrc = strip(readFileSync(path.join(REPO, "lib/wcRotations.js"), "utf8"));
const importCount = (src) => [...strip(src).matchAll(IMPORT_RX)].length + (strip(src).match(/\bimport\s*\(/g) || []).length;
ok(importCount('import a from "./a.js";\nconst b = import("./b.js");') === 2, "control: importCount sees one static and one dynamic import in a sample");
ok(importCount(wcSrc) === 0, "lib/wcRotations.js has no imports of any kind");

// Behaviour: shareCards re-exports the very same function and data.
const wc = await import(pathToFileURL(path.join(REPO, "lib/wcRotations.js")).href);
const sc = await import(pathToFileURL(path.join(REPO, "lib/shareCards.js")).href);
ok(sc.wcRotation === wc.wcRotation && sc.WC_ROTATIONS === wc.WC_ROTATIONS, "lib/shareCards.js re-exports the same wcRotation and WC_ROTATIONS");
ok(wc.WC_ROTATIONS.length === 10 && wc.wcRotation(3) === wc.WC_ROTATIONS[3] && wc.wcRotation(13) === wc.WC_ROTATIONS[3] && wc.wcRotation("x") === wc.WC_ROTATIONS[0] && wc.wcRotation(-1) === wc.WC_ROTATIONS[0],
  "wcRotation(idx) wraps modulo 10 and falls back to variant 0 for junk (same contract as before)");
ok(sc.SHARE_CARDS.worldcup && sc.SHARE_CARDS.worldcup.title === wc.WC_ROTATIONS[0].title, "SHARE_CARDS.worldcup still seeds from WC_ROTATIONS[0]");

if (failed) { console.error(`check-home-bundle-splits: ${failed} FAILED`); process.exit(1); }
console.log(`check-home-bundle-splits: OK (${closure.size} modules in the static closure of app/home.js)`);
