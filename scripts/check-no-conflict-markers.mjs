// scripts/check-no-conflict-markers.mjs — no merge conflict markers in source.
// STRUCTURAL-ONLY: the property is literal file text (a line beginning with a
// git conflict marker); there is no lib/ or app/ behavior to call or render.
// 2026-11-19: a zdiff3 base marker ("||||||| <sha>") was committed into the
// Disney guide's CSS module; the browser silently dropped the rule glued to it
// and no other check noticed. Fails on any line that starts with a conflict
// marker in app/, lib/, data/, scripts/ and docs/.
// --red-prove: a synthetic file body with each marker kind must be caught.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARKER = /^(<{7}( |$)|\|{7}( |$)|={7}$|>{7}( |$))/m;
const TEXT = /\.(js|jsx|mjs|cjs|ts|tsx|css|json|md|txt|tsv|yml|yaml|html|svg)$/;
export const hasMarker = (body) => MARKER.test(body);

if (process.argv.includes("--red-prove")) {
  for (const sample of ["a\n<<<<<<< HEAD\nb", "a\n||||||| 66b3c6f\nb", "a\n=======\nb", "a\n>>>>>>> origin/main\nb"]) {
    if (!hasMarker(sample)) { console.error("check-no-conflict-markers --red-prove: FAIL — missed " + JSON.stringify(sample)); process.exit(1); }
  }
  if (hasMarker("a ======= b\n// ========== section ==========")) { console.error("check-no-conflict-markers --red-prove: FAIL — flagged an ordinary line"); process.exit(1); }
  console.log("check-no-conflict-markers --red-prove: OK — all four marker kinds caught, ordinary lines pass");
  process.exit(0);
}

const hits = [];
let files = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!TEXT.test(name) || st.size > 5_000_000) continue;
    files++;
    const body = readFileSync(full, "utf8");
    if (hasMarker(body)) {
      const line = body.split("\n").findIndex((l) => MARKER.test(l)) + 1;
      hits.push(path.relative(ROOT, full) + ":" + line);
    }
  }
}
for (const d of ["app", "lib", "data", "scripts", "docs"]) { try { walk(path.join(ROOT, d)); } catch (e) { if (e.code !== "ENOENT") throw e; } }
if (hits.length) { console.error("check-no-conflict-markers: FAIL — merge conflict markers in:\n  " + hits.join("\n  ")); process.exit(1); }
console.log(`check-no-conflict-markers: OK — ${files} text files under app, lib, data, scripts and docs, no conflict markers`);
