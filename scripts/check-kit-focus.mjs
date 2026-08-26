#!/usr/bin/env node
// scripts/check-kit-focus.mjs — FOCUS must be imported from kit where used.
//
// THE PRODUCTION CRASH THIS EXISTS FOR (2026-08-25, 11:46 PM ET).
// Ready GO on 1e1dacc (#952 house card) landed at 11:43 PM ET. The owner
// hit a full-page ErrorBoundary:
//
//     That took a wrong turn
//     v8.49.0 · FOCUS is not defined
//
// #952 converted ThingsToDoList place rows to IconicPlaceCard and dropped
// the kit import to `{ WayfindScoreBadge }`. The module still interpolated
// `${FOCUS.outline}` into a <style> tag on every render. A bare identifier
// is valid JavaScript until it RUNS — next build and check:jsx both passed.
//
// This guard is the lock: any app/ file that consumes FOCUS as a member
// (`FOCUS.` / `FOCUS[` / `FOCUS(`) must import that name from kit. It
// red-proves itself by dropping the import from ThingsToDoList in memory
// and asserting that mutated source fails.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("check-kit-focus: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
};

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const blankQuoted = (s) =>
  s
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

const importedNames = (src) => {
  const names = new Set();
  const re = /import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  let m;
  while ((m = re.exec(src))) {
    for (const seg of m[1].split(",")) {
      const as = seg.split(/\s+as\s+/);
      const n = (as[1] || as[0]).trim();
      if (n) names.add(n);
    }
  }
  return names;
};

const consumesFocus = (src) => {
  const body = blankQuoted(stripComments(src).replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, ""));
  return /(?<![\w$.])FOCUS\s*[(\.\[]/.test(body);
};

const kitSrc = readFileSync(path.join(ROOT, "app/components/kit.js"), "utf8");
ok(/(?:export const)\s+FOCUS\s*=/.test(kitSrc),
  "positive control: kit.js still declares export const FOCUS =");

const files = walk(path.join(ROOT, "app"));
ok(files.length > 20, `found app files to scan (got ${files.length})`);

let scanned = 0;
let consumers = 0;
const offenders = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (rel === "app/components/kit.js") continue;
  const src = readFileSync(f, "utf8");
  scanned++;
  if (!consumesFocus(src)) continue;
  consumers++;
  if (!importedNames(src).has("FOCUS")) offenders.push(rel);
}
ok(scanned > 20, `scanned ${scanned} app files`);
ok(consumers >= 1, `positive control: at least one file consumes FOCUS (got ${consumers})`);
ok(offenders.length === 0,
  "client files that consume FOCUS must import it from kit — unbound: " + offenders.join(", "));

// ── RED-PROVE: dropping the ThingsToDoList import must fail ────────────────
const ttdPath = path.join(ROOT, "app/components/ThingsToDoList.js");
const ttd = readFileSync(ttdPath, "utf8");
ok(consumesFocus(ttd), "positive control: ThingsToDoList still interpolates FOCUS.outline");
ok(importedNames(ttd).has("FOCUS"),
  "ThingsToDoList imports FOCUS — this is the file that crashed production unbound");
ok(/from ["']\.\/kit["']/.test(ttd), "the FOCUS import is from kit, not a local alias");

const dropped = ttd.replace(
  /import\s*\{([^}]*)\}\s*from\s*["']\.\/kit["']/,
  (full, inner) => {
    const next = inner.split(",").map((s) => s.trim()).filter((s) => s && s !== "FOCUS").join(", ");
    return `import { ${next} } from "./kit"`;
  }
);
ok(dropped !== ttd, "red-prove mutation applied: FOCUS was removed from the kit import");
ok(importedNames(dropped).has("FOCUS") === false, "red-prove: mutated source no longer imports FOCUS");
ok(consumesFocus(dropped), "red-prove: mutated source still consumes FOCUS.outline");
ok(consumesFocus(dropped) && !importedNames(dropped).has("FOCUS"),
  "red-prove: dropping the ThingsToDoList FOCUS import is a fail — the live crash shape");

console.log(`check-kit-focus: OK — ${pass} assertions, ${scanned} files, ${consumers} FOCUS consumers, all imported from kit`);
