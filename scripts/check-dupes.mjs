// Deploy gate: duplicate top-level declaration check. tsc with allowJs is
// syntax-only, so a duplicated function name (a semantic error) passes locally
// but kills the Vercel build ("the name X is defined multiple times"). This
// catches that class before any compile. Exit 1 on any duplicate.
import { readFileSync } from "fs";
const FILES = ["app/page.js", "app/p/[id]/page.js", "app/components/MapView.js", "lib/google.js", "lib/ranking.js", "lib/dining.js", "lib/tags.js", "lib/categories.js", "lib/trips.js", "lib/supabase.js"];
let bad = 0;
for (const f of FILES) {
  let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
  const seen = new Map();
  for (const m of src.matchAll(/^(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=)/gm)) {
    const name = m[1] || m[2] || m[3];
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  for (const [name, n] of seen) if (n > 1) { console.log(`DUPLICATE  ${f}: ${name} x${n}`); bad++; }
}
console.log(bad ? `\n${bad} duplicate declaration(s) — build blocked` : "no duplicate top-level declarations");
process.exit(bad ? 1 : 0);
