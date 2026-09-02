// scripts/check-spend-effective-cap.mjs — 2026-09-02. The promotion drain sat
// idle for 23 hours on Vercel (WAYFIND_GATE=free) while every release note
// read "month_cap 7500 reached"; the ledger stood at 6,426/7,500. The line it
// had actually hit was the free-tier 4,800 that spendAllowCapped enforces in
// free mode. This lock proves BY CALL that effectiveCap reports the ceiling
// the ledger is really asked to honour, per gate mode, and that both the cron
// and the worker print THAT number in their release note.
import { readFileSync } from "node:fs";
let pass = 0; const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));
// Hermetic: each probe runs in a CHILD process with an explicit environment
// (never this shell's), so the verdict cannot depend on a sourced .env file.
import { spawnSync } from "node:child_process";
const probe = (gate, sku, cap) => {
  const env = gate == null ? {} : { WAYFIND_GATE: gate }; // explicit, never inherited
  const code = `import("./lib/spendGate.js").then((m) => console.log(JSON.stringify(m.effectiveCap(${JSON.stringify(sku)}, ${JSON.stringify(cap)}))))`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: new URL("..", import.meta.url), env, encoding: "utf8" });
  if (r.status !== 0) throw new Error("probe failed: " + (r.stderr || "").slice(0, 300));
  return JSON.parse(r.stdout.trim());
};
const effectiveCap = (sku, cap) => probe(effectiveCap.gate, sku, cap);
const withGate = async (v, fn) => { effectiveCap.gate = v; return fn(); };
ok(await withGate("free", () => effectiveCap("details_pro", 7500)) === 4800, "free mode: a 7,500 month_cap is really a 4,800 ceiling (Google's free line)");
ok(await withGate("free", () => effectiveCap("details_pro", 3000)) === 3000, "free mode: a cap under the free line is honoured as-is");
ok(await withGate(null, () => effectiveCap("details_pro", 7500)) === 7500, "open mode: month_cap is the ceiling, exactly");
ok(await withGate("shut", () => effectiveCap("details_pro", 7500)) === null, "shut mode: no ceiling — the call cannot happen");
ok(await withGate(null, () => effectiveCap("details_pro", 0)) === null && await withGate(null, () => effectiveCap("details_pro", "x")) === null, "a missing/invalid cap is fail-closed (null), never unlimited");
ok(await withGate("free", () => effectiveCap("not_a_sku", 100)) === null, "free mode: an unknown SKU has no free line and cannot spend");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(readFileSync(new URL("../app/api/cron/promote-index/route.js", import.meta.url), "utf8"));
const worker = strip(readFileSync(new URL("../scripts/promote-worker.mjs", import.meta.url), "utf8"));
ok((route.match(/ceiling \$\{effectiveCap\(PROMOTE_SKU, monthCap\)\} reached \(month_cap \$\{monthCap\}, gate \$\{gateMode\(\)\}\)/g) || []).length === 2 && !/month_cap \$\{monthCap\} reached`/.test(route),
  "cron: both release notes print the EFFECTIVE ceiling plus the configured month_cap and gate mode — no bare 'month_cap N reached' remains");
ok(/ceiling \$\{effectiveCap\(PROMOTE_SKU, MONTH_CAP\)\} reached \(month_cap \$\{MONTH_CAP\}, gate \$\{gateMode\(\)\}\)/.test(worker) && !/month_cap \$\{MONTH_CAP\} reached`/.test(worker),
  "worker: the release note prints the effective ceiling too");
{ const mutated = route.replace(/ceiling \$\{effectiveCap\(PROMOTE_SKU, monthCap\)\} reached/g, "month_cap ${monthCap} reached");
  ok(mutated !== route && !/ceiling \$\{effectiveCap/.test(mutated), "red-prove: reverting the note to the configured cap is detected"); }
if (fail.length) { console.error("check-spend-effective-cap: FAIL"); for (const m of fail) console.error("  - " + m); process.exit(1); }
console.log(`check-spend-effective-cap: OK — ${pass} assertions; the ceiling the ledger enforces is the one the operator reads`);
