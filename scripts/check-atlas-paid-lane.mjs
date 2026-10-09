#!/usr/bin/env node
// Lock for the Atlas paid lane (CLAUDE.md revenue rule 1: every env-gated branch gets a guard).
//
// The lane lets ONLY app/api/cron/atlas-build spend while WAYFIND_GATE=free, under
// ATLAS_PAID_ENABLED=1 + ATLAS_MONTH_PLACE_CAP=<n>, on its own ledger skus. This guard
// asserts: (1) the bypass needs BOTH flags (executed, not grepped); (2) the global gate /
// spendGate are untouched and nothing else references the lane; (3) the separate skus are
// what the route grants and what paidAi sends to the ledger (executed with a stubbed
// fetch; no network); (4) dry mode returns before any wf_editorial write.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
ok(good && good.cap === 40 && good.searchSku === "atlas_web_search" && good.anthropicSku === "atlas_anthropic_requests", "valid flags must yield cap 40 and the two atlas_* skus, atlas_web_search + atlas_anthropic_requests (positive control)");
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
ok(!/ATLAS_|atlas_web_search|atlas_anthropic|atlasPaidLane|atlasWebLane/.test(gateSrc), "lib/spendGate.js must not know about the Atlas lane (global gate semantics unchanged)");
ok(/export function gateFree\(\) \{ return gateMode\(\) === "free"; \}/.test(gateSrc), "gateFree() semantics changed");
const walk = (d) => readdirSync(path.join(ROOT, d)).flatMap((f) => {
  if (f === "node_modules" || f === ".next" || f === ".git") return [];
  const rel = d + "/" + f; const st = statSync(path.join(ROOT, rel));
  return st.isDirectory() ? walk(rel) : /\.(js|jsx|mjs|ts|tsx)$/.test(f) ? [rel] : [];
});
const ALLOWED = new Set(["app/api/cron/atlas-build/route.js", "lib/atlasPaidLane.js", "lib/atlasWebLane.js", "scripts/check-atlas-paid-lane.mjs"]);
for (const f of [...walk("app"), ...walk("lib"), ...walk("scripts")]) {
  if (ALLOWED.has(f)) continue;
  if (/ATLAS_PAID_ENABLED|ATLAS_MONTH_PLACE_CAP|atlas_web_search|atlas_anthropic_requests|atlasPaidLane|atlasWebLane/.test(read(f)))
    ok(/^scripts\/test-|^scripts\/check-/.test(f), `${f} references the Atlas paid lane; only atlas-build may spend on it`);
}

// Route wiring (comments stripped).
const route = strip(read("app/api/cron/atlas-build/route.js"));
ok(/const laneCfg = !retryMode && !refreshMode && gateFree\(\) \? atlasPaidLane\(\) : null;/.test(route), "lane must exist only in plain build mode, only while the gate is free");
ok(/if \(gateShut\(\) \|\| gateFree\(\)\) \{\s*if \(gateShut\(\) \|\| !lane\) \{/.test(route), "gate skip must stay: shut always skips, free skips unless the lane is valid");
ok(/takeFromLedger\(lane\.searchSku, lane\.cap\)/.test(route) && /spendAllow\("details_enterprise"\)/.test(route), "search grant must use the lane sku, shared sku only as the non-lane branch");
ok(/\{ sku: lane\.anthropicSku, cap: lane\.cap, timeoutMs: 48000 \}/.test(route), "lane Anthropic call must carry the lane sku+cap+timeout; shared path stays lane-free");
ok(/const lane = laneCfg && \(laneCfg\.mode === "full" \|\| dry\) \? laneCfg : null;/.test(route), "dry-only mode: the lane is active for ?dry=1 only unless ATLAS_PAID_ENABLED=1 (full)");
{
  // Dry branch, on comment-stripped source: the unbounded stop and the ledger_missing stop
  // both come BEFORE any search grant or editorial write. Each anchor exists exactly once.
  const once = (re) => (route.match(re) || []).length === 1;
  const ix = (re) => { const m = route.match(re); return m ? m.index : -1; };
  const reBody = /const dryBody = laneRequestBody\(place, laneModel\(\), sysInfo\.blocks, metroCity\(place\.metro\)\);/, reWorst = /const worst = laneWorstCaseUsd\(dryBody, null\);/;
  const reUnb = /if \(worst === null\) \{ costUnbounded = true; stoppedForBudget = true; deferred\+\+; return; \}/;
  const reLed = /ledgerMissing = true; stoppedForBudget = true; deferred\+\+; return;/;
  const reGrant = /takeFromLedger\(lane\.searchSku/, reCall = /await writeLaneEditorial\(place, akey, stats, sysInfo\.blocks, lane, laneModel\(\)\)/;
  ok([reBody, reWorst, reUnb, reLed, reGrant, reCall].every(once), "dry branch anchors each present exactly once: dry body, laneWorstCaseUsd, unbounded stop, ledger_missing stop, search grant, lane call");
  const iB = ix(reBody), iW = ix(reWorst), iU = ix(reUnb), iL = ix(reLed), iG = ix(reGrant), iC = ix(reCall), iE = route.indexOf("writeLaneEditorial(");
  ok(iB > 0 && iB < iW && iW < iU && iU < iL && iL < iG && iG < iC, `dry order: dry body -> laneWorstCaseUsd -> unbounded stop -> ledger_missing stop -> takeFromLedger(lane.searchSku -> writeLaneEditorial (got ${[iB, iW, iU, iL, iG, iC].join(",")})`);
  // the first writeLaneEditorial( textual hit is its declaration (async function); the first CALL must follow both stops
  const calls = [...route.matchAll(/writeLaneEditorial\(/g)].map((m) => m.index).filter((i) => !/function\s+$/.test(route.slice(Math.max(0, i - 20), i)));
  ok(calls.length === 1 && calls[0] > iL && calls[0] > iU, "the only writeLaneEditorial call comes after both dry stops");
  ok(/dryMetered = !!\(lane && dry && lane\.mode === "dry"\)/.test(route) && /if \(dryMetered\) \{\s*if \(stoppedForBudget\)/.test(route), "the dry stops sit inside an if (dryMetered) block");
  ok(!/reserveDryCents|refundDryCents|readDryUsedCents|recordDryCents|dryBudgetAllows|reserveCents\(|usdToCents|atlasDryMeter/.test(route), "no reservation / refund / meter code remains in the route");
  ok(!/wf_spend_refund|atlas_dry_cents|reservedTotal|refundedTotal|chargedTotal/.test(route), "the route never refunds and never touches the dry-cents sku");
  ok(/cost_unbounded: costUnbounded, ledger_missing: ledgerMissing/.test(route), "the dry response reports cost_unbounded and ledger_missing");
  ok(/idsList = dryMetered \? loadPriorityIds/.test(route) && /const limitDefault = dry \? \(idsMode \? idsList\.length : 1\) : 10;/.test(route), "ids= is read only for metered dry requests; a dry request without ids/limit does one place");
}
{
  const lanesrc = strip(read("lib/atlasPaidLane.js"));
  ok(/ATLAS_DRY_KEY_HEADER = "x-atlas-dry-key"/.test(lanesrc) && /timingSafeEqual\(a, b\)/.test(lanesrc) && /a\.length === b\.length/.test(lanesrc), "trigger key compared with timingSafeEqual on equal-length buffers, header x-atlas-dry-key");
  ok(/key\.length < 32 \|\| String\(env\.ATLAS_PAID_ENABLED \|\| ""\)\.trim\(\) !== "dry"/.test(lanesrc) && /dry !== true \|\| retry \|\| refresh/.test(lanesrc), "trigger key needs >=32 chars, ATLAS_PAID_ENABLED=dry, dry=1, no retry/refresh");
  ok(/req\.headers\.get\(ATLAS_DRY_KEY_HEADER\)/.test(route) && !/searchParams\.get\("dry_key"\)/.test(route) && !/console\.\w+\([^)]*ATLAS_DRY_TRIGGER_KEY/.test(route), "route reads the key from the header only and never logs it");
}
ok(!existsSync(path.join(ROOT, "lib/atlasDryMeter.js")), "lib/atlasDryMeter.js is deleted (no reserve/refund primitives exist)");
{
  const pai = strip(read("lib/paidAi.js"));
  ok(!/x-wf-request-sent/.test(pai), "paidAi has no dry-meter request-sent marker");
}
ok(/pool\(places, dryMetered \? 1 : 6/.test(route), "dry samples must run sequentially");
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
  for (const tm of [0, 50001, 1.5, "x"]) {
    calls.length = 0;
    const r = await paidAnthropicRequest(init(), { sku: "atlas_anthropic_requests", cap: 7, timeoutMs: tm });
    ok(r.status === 503 && calls.length === 0, `lane timeoutMs ${tm} must fail closed before any call`);
  }
  calls.length = 0;
  await paidAnthropicRequest(init(), { sku: "atlas_anthropic_requests", cap: 7, timeoutMs: 48000 });
  ok(calls.some((c) => c.url.includes("api.anthropic.com")), "lane timeoutMs 48000 is accepted");
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
