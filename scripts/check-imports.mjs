// Guardrail: no "used-but-not-imported" named export (v6.31).
//
// The v6.30 production crash — "toDisplayScore is not defined" — shipped because
// app/components/kit.js CALLED toDisplayScore but never imported it, and the JSX
// type-check runs with --noResolve (it cannot see cross-module imports), so the
// build passed blind. This guardrail closes that gap: for a set of pure-logic
// lib modules, every file that references one of their named exports must also
// import that name. If a call site uses `toDisplayScore(...)` without importing
// it, prebuild fails here instead of the browser failing in production.
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";

const root = new URL("../", import.meta.url);
const fail = (m) => { console.error("check-imports: FAIL — " + m); process.exit(1); };

// The modules whose named exports must always be imported where used.
const GUARDED = ["lib/score.js", "lib/businessStatus.js"];

// Collect the named exports of each guarded module.
function namedExports(src) {
  const names = new Set();
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let m; while ((m = re.exec(src))) names.add(m[1]);
  // export { a, b as c }
  const re2 = /export\s*\{([^}]*)\}/g;
  while ((m = re2.exec(src))) m[1].split(",").forEach((seg) => { const as = seg.split(/\s+as\s+/); const n = (as[1] || as[0]).trim(); if (n) names.add(n); });
  return names;
}

const exportsByModule = {};
for (const mod of GUARDED) {
  exportsByModule[mod] = namedExports(readFileSync(new URL(mod, root), "utf8"));
}
const allGuardedNames = new Set(Object.values(exportsByModule).flatMap((s) => [...s]));

// Walk app/ and lib/ for .js/.jsx files.
function walk(dir, out) {
  for (const f of readdirSync(fileURLToPath(new URL(dir + "/", root)))) {
    const rel = dir + "/" + f;
    const abs = fileURLToPath(new URL(rel, root));
    const st = statSync(abs);
    if (st.isDirectory()) { if (f !== "node_modules") walk(rel, out); }
    else if (/\.jsx?$/.test(f)) out.push(rel);
  }
  return out;
}
const files = [...walk("app", []), ...walk("lib", [])];

let checked = 0;
for (const rel of files) {
  if (GUARDED.includes(rel)) continue; // a module may use its own exports
  const src = readFileSync(fileURLToPath(new URL(rel, root)), "utf8");
  // Names this file imports (from anywhere — we only need the identifier bound).
  const imported = new Set();
  const impRe = /import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  let m; while ((m = impRe.exec(src))) m[1].split(",").forEach((seg) => { const as = seg.split(/\s+as\s+/); const n = (as[1] || as[0]).trim(); if (n) imported.add(n); });
  // Strip import lines + comments so a name mentioned only in a comment/import
  // doesn't count as usage.
  const body = src
    .replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Drop quoted string literals so a guarded name that only appears as a
    // string (e.g. the Google "businessStatus" field mask) is not mistaken for
    // a code usage. Template literals are left intact so `${toDisplayScore(x)}`
    // is still caught.
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  for (const name of allGuardedNames) {
    // Consumption = called `name(`, member `name.`, or indexed `name[`. This is
    // how every guarded export is actually used, and it deliberately excludes
    // property keys (`businessStatus:`), shorthand, and bare mentions so natural
    // property names never false-positive.
    const used = new RegExp("(?<![\\w$.])" + name + "\\s*[(.\\[]").test(body);
    if (used && !imported.has(name)) {
      fail(`${rel} consumes "${name}" (a guarded lib export) but never imports it — this is exactly the v6.30 crash class`);
    }
    checked += used ? 1 : 0;
  }
}
console.log(`check-imports: OK — ${checked} guarded-export usages across ${files.length} files, all imported`);
