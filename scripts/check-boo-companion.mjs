// check-boo-companion.mjs: locks the site wide Boo companion (Oct 1 to Nov 1).
// Asserts by syntactic role, comments stripped first:
//   1. app/layout.js renders <BooCompanionLoader /> once; the loader (a client
//      component) binds BooCompanion through next/dynamic with ssr:false.
//   2. The season gate calls siteTodayStr and compares against 10-01 and 11-01.
//   3. The reserved paths list exists and names api, go, oauth, embed, share.
//   4. The sessionStorage hide key wf_boo_hidden exists.
//   5. No dash character (hyphen, en dash, em dash) in any gag string: the gag
//      arrays are parsed from source and every string is checked.
// Positive control: the dash probe must flag a known bad string, and at least
// 20 gag strings must be found, so an empty parse can never read as clean.
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

// Strip comments while leaving string contents alone.
function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

const layout = stripComments(readFileSync(new URL("../app/layout.js", import.meta.url), "utf8"));
const comp = stripComments(readFileSync(new URL("../app/components/BooCompanion.js", import.meta.url), "utf8"));

// 1. layout wiring. layout.js is a Server Component, where ssr:false is a build
// error, so the next/dynamic boundary lives in a "use client" loader.
const loaderRaw = readFileSync(new URL("../app/components/BooCompanionLoader.js", import.meta.url), "utf8");
const loader = stripComments(loaderRaw);
ok(/^\s*["']use client["']/.test(loaderRaw.replace(/^(\s*\/\/[^\n]*\n)*/, "")), "BooCompanionLoader.js must start with 'use client'");
ok(/import\s+dynamic\s+from\s+["']next\/dynamic["']/.test(loader), "loader must import dynamic from next/dynamic");
const dyn = loader.match(/const\s+BooCompanion\s*=\s*dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/BooCompanion["']\s*\)\s*,\s*\{([^}]*)\}\s*\)/);
ok(!!dyn, "loader must declare const BooCompanion = dynamic(() => import('./BooCompanion'), {...})");
ok(!!dyn && /ssr\s*:\s*false/.test(dyn[1]), "BooCompanion dynamic() options must include ssr: false");
ok((loader.match(/<BooCompanion[\s/>]/g) || []).length === 1, "loader must render <BooCompanion /> exactly once");
ok(/import\s+BooCompanionLoader\s+from\s+["']\.\/components\/BooCompanionLoader["']/.test(layout), "layout.js must import BooCompanionLoader");
ok((layout.match(/<BooCompanionLoader[\s/>]/g) || []).length === 1, "layout.js must render <BooCompanionLoader /> exactly once");
ok(!/import\s+BooCompanion\s+from/.test(layout) && !/import\(\s*["'][^"']*\/BooCompanion["']/.test(layout), "layout.js must not statically import BooCompanion itself");

// 2. season gate
ok(/import\s*\{[^}]*\bsiteTodayStr\b[^}]*\}\s*from\s*["'][^"']*lib\/siteTime/.test(comp), "BooCompanion must import siteTodayStr from lib/siteTime");
const gate = comp.match(/function\s+inSeason\s*\(\)\s*\{([\s\S]*?)\n\}/);
ok(!!gate, "BooCompanion must declare function inSeason()");
ok(!!gate && /\bsiteTodayStr\s*\(/.test(gate[1]), "inSeason() must call siteTodayStr()");
ok(!!gate && /["']10-01["']/.test(gate[1]) && /["']11-01["']/.test(gate[1]), "inSeason() must bound by 10-01 and 11-01 inclusive");
ok(!!gate && /<=\s*["']11-01["']/.test(gate[1]) && />=\s*["']10-01["']/.test(gate[1]), "inSeason() must use inclusive >= 10-01 and <= 11-01");
ok(/inSeason\(\)/.test(comp.replace(/function\s+inSeason\s*\(\)/, "")), "inSeason() must actually be called");

// 3. reserved paths
const rp = comp.match(/const\s+RESERVED_PATHS\s*=\s*\[([^\]]*)\]/);
ok(!!rp, "BooCompanion must declare const RESERVED_PATHS = [...]");
if (rp) for (const p of ["/api", "/go", "/oauth", "/embed", "/share"]) ok(rp[1].includes('"' + p + '"'), "RESERVED_PATHS must include " + p);
ok(/reservedPath\(/.test(comp.replace(/function\s+reservedPath\s*\(/, "")), "reservedPath() must be called by the gate");

// 4. hide key
ok(/const\s+HIDE_KEY\s*=\s*["']wf_boo_hidden["']/.test(comp), "HIDE_KEY must be wf_boo_hidden");
ok(/sessionStorage\.setItem\(\s*HIDE_KEY\s*,\s*["']1["']\s*\)/.test(comp), "Hide Boo must set sessionStorage wf_boo_hidden=1");
ok(/sessionStorage\.getItem\(\s*HIDE_KEY\s*\)/.test(comp), "gate must read sessionStorage wf_boo_hidden");

// 5. gags: parse every GAGS_* array and check each string.
const DASH = /[-‐-―−]/;
ok(DASH.test("a-b") && DASH.test("a—b") && !DASH.test("plain words"), "dash probe must flag known bad and pass known good");
const arrays = [...comp.matchAll(/const\s+(GAGS_[A-Z]+)\s*=\s*\[([\s\S]*?)\n\];|const\s+(GAGS_[A-Z]+)\s*=\s*\[([^\]]*)\];/g)];
let total = 0;
for (const m of arrays) {
  const name = m[1] || m[3], body = m[2] ?? m[4];
  const strs = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  for (const g of strs) {
    total++;
    ok(!DASH.test(g), name + ' gag contains a dash: "' + g + '"');
    ok(g.trim().split(/\s+/).length <= 11, name + ' gag over 11 words: "' + g + '"');
  }
}
ok(total >= 25, "expected at least 25 gag strings, parsed " + total);

if (fails) { console.error("check-boo-companion: " + fails + " failure(s)"); process.exit(1); }
console.log("check-boo-companion: OK, " + total + " gags parsed across " + arrays.length + " arrays; layout dynamic ssr:false, gate, reserved paths, hide key verified");
