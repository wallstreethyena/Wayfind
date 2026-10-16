#!/usr/bin/env node
/**
 * scripts/test-photo-json-cors.mjs — the photo JSON lane lets exactly ONE other
 * origin (the blog) read its answer, never anyone else, never "*".
 *
 * Why (owner 2026-10-15, "most of the blogs still have no pictures"): since
 * 2026-10-08 no Google photo is cached, so blog.gowayfind.com's free-cache lane
 * finds none; the blog now asks /api/photo?s=detail&fmt=json from the reader's
 * browser like a card does. The browser needs Access-Control-Allow-Origin to read
 * that JSON. The header grants READ access only; spend is still decided by
 * creditedRequest + the ledger, unchanged.
 *
 * EXECUTES the route's own photoJsonCorsHeaders source and checks the route wires it into
 * jsonAnswer exactly once. `--red-prove` widens the allowlist in memory to "*"
 * semantics and requires the hostile-origin check to fail.
 */
import { readFileSync } from "node:fs";
// The helper lives INSIDE the route (so the route's test harnesses, which replace
// its imports by hand, need no new double). Execute that exact source.
const ROUTE_RAW = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
const decl = /const PHOTO_JSON_CORS_ORIGINS = new Set\([^)]*\);\nfunction photoJsonCorsHeaders\(origin\) \{[\s\S]*?\n\}/.exec(ROUTE_RAW);
if (!decl) { console.error("test-photo-json-cors: FAIL — photoJsonCorsHeaders declaration not found in app/api/photo/route.js"); process.exit(1); }
const { photoJsonCorsHeaders, PHOTO_JSON_CORS_ORIGINS } = await import("data:text/javascript," + encodeURIComponent(decl[0] + "\nexport { photoJsonCorsHeaders, PHOTO_JSON_CORS_ORIGINS };"));

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const check = (fn) => {
  const blog = fn("https://blog.gowayfind.com");
  ok(blog["Access-Control-Allow-Origin"] === "https://blog.gowayfind.com" && blog.Vary === "Origin", "the blog origin may read the JSON answer (exact echo + Vary: Origin)");
  for (const o of ["https://evil.example", "http://blog.gowayfind.com", "https://blog.gowayfind.com.evil.example", "null", "", "*", "https://www.gowayfind.com"]) {
    ok(Object.keys(fn(o)).length === 0, `no CORS header for origin ${JSON.stringify(o)}`);
  }
};
check(photoJsonCorsHeaders);
ok(PHOTO_JSON_CORS_ORIGINS.size === 1, "exactly one allowlisted origin");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8"));
const jsonAnswer = route.slice(route.indexOf("const jsonAnswer ="), route.indexOf("});", route.indexOf("const jsonAnswer =")));
ok(/\.\.\.photoJsonCorsHeaders\(req\.headers\.get\("origin"\) \|\| ""\)/.test(jsonAnswer), "route adds the CORS headers inside jsonAnswer (JSON lane only)");
ok((route.match(/(?<!function )photoJsonCorsHeaders\(/g) || []).length === 1 && (route.match(/function photoJsonCorsHeaders\(/g) || []).length === 1, "CORS headers applied in exactly one place (never on redirects or images)");
ok(!/Access-Control-Allow-Origin"\s*:\s*"\*"/.test(route), "route never sends Access-Control-Allow-Origin: *");

if (process.argv.includes("--red-prove")) {
  const before = fail.length;
  check((o) => (o ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : {})); // reflect-any-origin mutation
  if (fail.length === before) { console.error("test-photo-json-cors: red-prove did not go red"); process.exit(1); }
  console.log("test-photo-json-cors: red-prove OK — a reflect-any-origin header is caught");
  process.exit(0);
}
if (fail.length) { for (const f of fail) console.error("  FAIL: " + f); console.error(`test-photo-json-cors: FAIL — ${fail.length} failed, ${pass} passed`); process.exit(1); }
console.log(`test-photo-json-cors: OK — ${pass} assertions (blog origin readable, 7 hostile/sibling origins refused, JSON lane only, never *)`);
