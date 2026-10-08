#!/usr/bin/env node
// Lock for the Atlas paid lane (CLAUDE.md revenue rule 1: every env-gated branch gets a guard).
//
// The lane lets ONLY app/api/cron/atlas-build spend while WAYFIND_GATE=free, under
// ATLAS_PAID_ENABLED=1 + ATLAS_MONTH_PLACE_CAP=<n>, on its own ledger skus. This guard
// asserts: (1) the bypass needs BOTH flags (executed, not grepped); (2) the global gate /
// spendGate are untouched and nothing else references the lane; (3) the separate skus are
// what the route grants and what paidAi sends to the ledger (executed with a stubbed
// fetch; no network); (4) dry mode returns before any wf_editorial write.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// 1. Both flags required (executed).
const lane = await import(pathToFileURL(path.join(ROOT, "lib/atlasPaidLane.js")).href);
const L = (e) => lane.atlasPaidLane(e);
const good = L({ ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "40" });
ok(good && good.cap === 40 && good.detailsSku === "atlas_details_enterprise" && good.anthropicSku === "atlas_anthropic_requests", "valid flags must yield cap 40 and the two atlas_* skus (positive control)");
for (const [name, env] of [
  ["no flags", {}],
  ["cap only", { ATLAS_MONTH_PLACE_CAP: "40" }],
  ["enable only", { ATLAS_PAID_ENABLED: "1" }],
  ["enable=true", { ATLAS_PAID_ENABLED: "true", ATLAS_MONTH_PLACE_CAP: "40" }],
  ["enable=0", { ATLAS_PAID_ENABLED: "0", ATLAS_MONTH_PLACE_CAP: "40" }],
  ["cap=0", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "0" }],
  ["cap=01", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "01" }],
  ["cap=1.5", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "1.5" }],
  ["cap=-3", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "-3" }],
  ["cap=abc", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "abc" }],
  ["cap empty", { ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "" }],
]) ok(L(env) === null, `${name} must fail closed (null), got ${JSON.stringify(L(env))}`);

// Priority loader + seed file.
ok(JSON.stringify(lane.loadPriorityIds(["ChIJaaaaaaaaaa", "ChIJaaaaaaaaaa", 5, null, "x y", "bad", " ChIJbbbbbbbbbb "])) === JSON.stringify(["ChIJaaaaaaaaaa", "ChIJbbbbbbbbbb"]), "loadPriorityIds must dedupe, trim, keep order and drop junk");
ok(lane.loadPriorityIds({}).length === 0 && lane.loadPriorityIds(null).length === 0, "loadPriorityIds must tolerate non-arrays");
const seed = JSON.parse(read("data/atlas/priority-place-ids.json"));
ok(Array.isArray(seed) && seed.length >= 20 && lane.loadPriorityIds(seed).length === seed.length, "seed priority file must be an array of >=20 valid unique ids");

// 2. Global gate untouched; lane referenced nowhere else.
const gateSrc = read("lib/spendGate.js");
ok(!/ATLAS_|atlas_details|atlas_anthropic|atlasPaidLane/.test(gateSrc), "lib/spendGate.js must not know about the Atlas lane (global gate semantics unchanged)");
ok(/export function gateFree\(\) \{ return gateMode\(\) === "free"; \}/.test(gateSrc), "gateFree() semantics changed");
const walk = (d) => readdirSync(path.join(ROOT, d)).flatMap((f) => {
  if (f === "node_modules" || f === ".next" || f === ".git") return [];
  const rel = d + "/" + f; const st = statSync(path.join(ROOT, rel));
  return st.isDirectory() ? walk(rel) : /\.(js|jsx|mjs|ts|tsx)$/.test(f) ? [rel] : [];
});
const ALLOWED = new Set(["app/api/cron/atlas-build/route.js", "lib/atlasPaidLane.js", "scripts/check-atlas-paid-lane.mjs"]);
for (const f of [...walk("app"), ...walk("lib"), ...walk("scripts")]) {
  if (ALLOWED.has(f)) continue;
  if (/ATLAS_PAID_ENABLED|ATLAS_MONTH_PLACE_CAP|atlas_details_enterprise|atlas_anthropic_requests|atlasPaidLane/.test(read(f)))
    ok(/^scripts\/test-|^scripts\/check-/.test(f), `${f} references the Atlas paid lane; only atlas-build may spend on it`);
}

// Route wiring (comments stripped).
const route = strip(read("app/api/cron/atlas-build/route.js"));
ok(/const lane = !retryMode && !refreshMode && gateFree\(\) \? atlasPaidLane\(\) : null;/.test(route), "lane must exist only in plain build mode, only while the gate is free");
ok(/if \(gateShut\(\) \|\| gateFree\(\)\) \{\s*if \(gateShut\(\) \|\| !lane\) \{/.test(route), "gate skip must stay: shut always skips, free skips unless the lane is valid");
ok(/takeFromLedger\(lane\.detailsSku, lane\.cap\)/.test(route) && /spendAllow\("details_enterprise"\)/.test(route), "details grant must use the lane sku, shared sku only as the non-lane branch");
ok(/lane \? \{ sku: lane\.anthropicSku, cap: lane\.cap \} : undefined/.test(route), "Anthropic call must carry the lane sku+cap (undefined -> shared path)");
ok((route.match(/takeFromLedger\(/g) || []).length === 1, "exactly one lane grant call expected in the route");
ok(!/process\.env\.WAYFIND_GATE/.test(route), "route must not read WAYFIND_GATE itself");

// 3. paidAi: executed with a stubbed fetch.
// State the preconditions explicitly (writes only; the verdict never depends on the ambient shell).
process.env.WAYFIND_GATE = "free";
process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.ANTHROPIC_MONTHLY_REQUEST_CAP = "2000";
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  calls.push({ url: String(u), body: init && init.body });
  return String(u).includes("wf_spend_take") ? { ok: true, status: 200, json: async () => true } : { ok: true, status: 200, json: async () => ({}) };
};
try {
  const { paidAnthropicRequest } = await import(pathToFileURL(path.join(ROOT, "lib/paidAi.js")).href);
  const init = () => ({ method: "POST", headers: { "content-type": "application/json", "x-api-key": "k", "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }) });
  const grants = () => calls.filter((c) => c.url.includes("wf_spend_take")).map((c) => JSON.parse(c.body));
  await paidAnthropicRequest(init());
  ok(JSON.stringify(grants()[0]) === JSON.stringify({ p_sku: "anthropic_requests", p_cap: 2000 }), "no lane: must charge the shared anthropic_requests sku under the env cap (existing callers unchanged)");
  calls.length = 0;
  await paidAnthropicRequest(init(), { sku: "atlas_anthropic_requests", cap: 7 });
  ok(JSON.stringify(grants()[0]) === JSON.stringify({ p_sku: "atlas_anthropic_requests", p_cap: 7 }) && calls.some((c) => c.url.includes("api.anthropic.com")), "lane: must charge atlas_anthropic_requests under the lane cap, then send");
  for (const badLane of [{}, { sku: "x y", cap: 3 }, { sku: "atlas_anthropic_requests", cap: 0 }, { sku: "atlas_anthropic_requests", cap: 1.5 }, null]) {
    calls.length = 0;
    const r = await paidAnthropicRequest(init(), badLane);
    ok(r.status === 503 && calls.length === 0, `malformed lane ${JSON.stringify(badLane)} must fail closed with NO ledger or provider call (status ${r.status}, calls ${calls.length})`);
  }
  process.env.WAYFIND_GATE = "shut"; calls.length = 0;
  const shut = await paidAnthropicRequest(init(), { sku: "atlas_anthropic_requests", cap: 7 });
  ok(shut.status === 503 && calls.length === 0, "gate shut must still block the lane");
} finally {
  globalThis.fetch = realFetch;
}

// 4. Dry mode never writes.
const di = route.indexOf("if (dry) {");
ok(di > 0, "dry-run branch missing");
if (di > 0) {
  const rest = route.slice(di);
  const end = rest.indexOf("\n  }\n");
  const dryBlock = rest.slice(0, end);
  ok(/return Response\.json\(/.test(dryBlock), "dry block must return the rows");
  ok(!/fetch\(|persistEditorialRetry|on_conflict|method:\s*"POST"/.test(dryBlock), "dry block must not write anything");
  const writes = [...route.matchAll(/wf_editorial\?on_conflict|persistEditorialRetry\(/g)].map((m) => m.index);
  ok(writes.length >= 2 && writes.every((i) => i > di), "every wf_editorial write must come AFTER the dry-mode early return");
  ok(/dry \? Math\.min\(limit0, 10\) : limit0/.test(route), "dry runs must be capped at 10");
}

if (bad) { console.error(`check-atlas-paid-lane: FAIL — ${bad} of ${n} assertions`); process.exit(1); }
console.log(`check-atlas-paid-lane: OK — ${n} assertions (both flags required, lane skus separate, global gate untouched, dry never writes; repo scan of app/lib/scripts for stray lane references)`);
