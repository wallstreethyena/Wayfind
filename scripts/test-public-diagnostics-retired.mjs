// STRUCTURAL-ONLY: full Viator handler import pulls deployment-only modules; this checks the exact retired branches and middleware registration with a vulnerable negative control.
import fs from "node:fs";

let assertions = 0;
function ok(value, message) {
  assertions++;
  if (!value) throw new Error(message);
}

const viator = fs.readFileSync("app/api/viator/go/route.js", "utf8");
const insider = fs.readFileSync("app/api/insider/route.js", "utf8");
const middleware = fs.readFileSync("middleware.js", "utf8");

function probeBranch(source) {
  const start = source.indexOf('searchParams.get("probe") === "1"');
  ok(start >= 0, "expected a retired probe branch");
  return source.slice(start, source.indexOf("\n  }", start) + 4);
}

for (const [name, source] of [["viator", viator], ["insider", insider]]) {
  const branch = probeBranch(source);
  ok(/status:\s*410/.test(branch), `${name} diagnostic must be gone`);
  ok(!/process\.env|fetch\s*\(/.test(branch), `${name} retired diagnostic must not read config or call upstream`);
}
ok(middleware.includes('"/api/insider"'), "model-backed insider route must be guarded");

// Negative control: the former Viator behavior must be rejected by the same
// assertions, proving this check distinguishes the vulnerable shape.
const old = viator.replace('return Response.json({ error: "retired" }, { status: 410, headers: { "Cache-Control": "no-store" } });', 'return fetch("https://api.viator.com/partner/search/freetext");');
const oldBranch = probeBranch(old);
ok(/fetch\s*\(/.test(oldBranch) && !/status:\s*410/.test(oldBranch), "negative control did not recreate the public upstream probe");

console.log(`test-public-diagnostics-retired: OK — ${assertions} assertions`);
