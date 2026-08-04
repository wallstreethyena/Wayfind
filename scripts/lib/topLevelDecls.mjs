// Top-level declaration collector for scripts/check-dupes.mjs.
//
// EXTRACTED SO IT CAN BE TESTED BY CALLING IT. The rule this enforces is a
// JavaScript parse rule, and the only honest way to check a parse rule is to feed
// it source and look at the answer — a guard that greps its own script proves
// nothing about what the parser will do.
//
// WHY IMPORTS MUST COUNT
// An ES module import binding and a top-level `function` of the same name in the
// same scope is a redeclaration: the module does not parse. The original matcher
// counted only `function`, `const` and `let`, so `import ViatorRail` +
// `function ViatorRail` registered as ONE declaration, the guard printed "no
// duplicate top-level declarations", and Vercel then failed with "the name
// `ViatorRail` is defined multiple times". That shipped twice — #538 introduced
// it, #541 fixed it, a030e6b re-introduced it — with this guard green each time.

// A whole import statement. The clause is optional so a side-effect import
// (`import "./x.css"`) still matches and contributes no binding. [\s\S] because
// real imports wrap across lines.
const IMPORT_RX = /^import\s+(?:([\s\S]*?)\s+from\s+)?["'][^"']+["']/gm;

// Value declarations. `export` / `export default` prefixes are tolerated: an
// exported function is still a top-level binding and still collides.
const DECL_RX = /^(?:export\s+(?:default\s+)?)?(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=)/gm;

/** Split an import clause on commas that are NOT inside braces. */
function topLevelSplit(clause) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of String(clause)) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Every binding an import clause introduces into module scope.
 *   import X               -> X        (default)
 *   import * as NS         -> NS       (namespace)
 *   import { a, b as c }   -> a, c     (named; the ALIAS is the binding)
 *   import X, { a as b }   -> X, b     (combined)
 *
 * The alias case matters in both directions: counting `a` instead of `b` would
 * miss a real collision on `b` and invent a false one on `a`.
 */
export function importBindings(clause) {
  const names = [];
  for (const partRaw of topLevelSplit(clause || "")) {
    const part = partRaw.trim();
    if (!part) continue;
    const ns = /^\*\s+as\s+(\w+)$/.exec(part);
    if (ns) { names.push(ns[1]); continue; }
    if (part.startsWith("{")) {
      for (const spec of part.replace(/^\{/, "").replace(/\}$/, "").split(",")) {
        const s = spec.trim();
        if (!s) continue;
        const alias = /^(?:\w+|"[^"]*"|'[^']*')\s+as\s+(\w+)$/.exec(s);
        if (alias) { names.push(alias[1]); continue; }
        if (/^\w+$/.test(s)) names.push(s);
      }
      continue;
    }
    if (/^\w+$/.test(part)) names.push(part); // default binding
  }
  return names;
}

/**
 * name -> how many times it is declared at top level in `src`.
 * Any count > 1 is a redeclaration and the file will not parse.
 */
export function topLevelDeclarations(src) {
  const seen = new Map();
  const bump = (n) => seen.set(n, (seen.get(n) || 0) + 1);
  const text = String(src || "");
  for (const m of text.matchAll(IMPORT_RX)) {
    if (m[1]) for (const n of importBindings(m[1])) bump(n);
  }
  for (const m of text.matchAll(DECL_RX)) bump(m[1] || m[2] || m[3]);
  return seen;
}

/** Just the names declared more than once. */
export function duplicateNames(src) {
  return [...topLevelDeclarations(src)]
    .filter(([, n]) => n > 1)
    .map(([name, count]) => ({ name, count }));
}
