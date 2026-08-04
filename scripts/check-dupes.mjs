// Deploy gate: duplicate top-level declaration check. tsc with allowJs is
// syntax-only, so a duplicated function name (a semantic error) passes locally
// but kills the Vercel build ("the name X is defined multiple times"). This
// catches that class before any compile. Exit 1 on any duplicate.
import { readFileSync } from "fs";
import { shellFiles } from "./lib/shellSrc.mjs";
// The collector lives in its own module so scripts/test-dupes-imports.mjs can
// CALL it against fixture source. A guard for a parse rule has to be testable by
// feeding it code, not by grepping its own script.
import { topLevelDeclarations } from "./lib/topLevelDecls.mjs";
// G0: shellFiles() is home.js + kit.js + every extracted screen/sheet, so new
// shell files are covered here automatically as the decomposition proceeds.
const FILES = [...shellFiles(), "app/p/[id]/page.js", "app/l/[key]/page.js", "app/components/MapView.js", "lib/google.js", "lib/ranking.js", "lib/dining.js", "lib/tags.js", "lib/categories.js", "lib/trips.js", "lib/supabase.js"];
let bad = 0;
for (const f of FILES) {
  let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
  // IMPORT BINDINGS COUNT. They did not before, so `import X` + `function X`
  // registered as ONE declaration and this guard printed OK while the file could
  // not parse — that shipped twice (#538, then a030e6b re-introducing it).
  const seen = topLevelDeclarations(src);
  for (const [name, n] of seen) if (n > 1) { console.log(`DUPLICATE  ${f}: ${name} x${n}`); bad++; }
}
console.log(bad ? `\n${bad} duplicate declaration(s) — build blocked` : "no duplicate top-level declarations");
process.exit(bad ? 1 : 0);
