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
ok(/\{ sku: lane\.anthropicSku, cap: lane\.cap, timeoutMs: laneTimeout \}/.test(route), "lane Anthropic call must carry the lane sku+cap+timeout; shared path stays lane-free");
ok(/const lane = laneCfg && \(laneCfg\.mode === "full" \|\| dry\) \? laneCfg : null;/.test(route), "dry-only mode: the lane is active for ?dry=1 only unless ATLAS_PAID_ENABLED=1 (full)");
ok(/stoppedForBudget \|\| meterRecordFailed \|\| !dryBudgetAllows\(drySpent, dryCosts, lane\.dryCapUsd\)/.test(route), "the in-request dollar-ceiling stop must run before each place's grant");
{
  const iRead = route.indexOf("readDryUsedCents(s)"), iStop = route.indexOf("used + reserveCents(dryCents) > capCents"), iGrant = route.indexOf("takeFromLedger(lane.searchSku"), iRec = route.indexOf("recordDryCents(s, cents)");
  ok(iRead > 0 && iRead < iStop && iStop < iGrant && iGrant < iRec, "cross-request meter order: read, reserve check, grant, Anthropic call, then record");
  ok(/used === null\) \{ meterReadFailed = true; stoppedForBudget = true/.test(route), "an unreadable meter must fail closed (stop, spend nothing)");
  ok(/idsList = dryMetered \? loadPriorityIds/.test(route) && /const limitDefault = dry \? \(idsMode \? idsList\.length : 1\) : 10;/.test(route), "ids= is read only for metered dry requests; a dry request without ids/limit does one place");
}
{
  const lanesrc = strip(read("lib/atlasPaidLane.js"));
  ok(/ATLAS_DRY_KEY_HEADER = "x-atlas-dry-key"/.test(lanesrc) && /timingSafeEqual\(a, b\)/.test(lanesrc) && /a\.length === b\.length/.test(lanesrc), "trigger key compared with timingSafeEqual on equal-length buffers, header x-atlas-dry-key");
  ok(/key\.length < 32 \|\| String\(env\.ATLAS_PAID_ENABLED \|\| ""\)\.trim\(\) !== "dry"/.test(lanesrc) && /dry !== true \|\| retry \|\| refresh/.test(lanesrc), "trigger key needs >=32 chars, ATLAS_PAID_ENABLED=dry, dry=1, no retry/refresh");
  ok(/req\.headers\.get\(ATLAS_DRY_KEY_HEADER\)/.test(route) && !/searchParams\.get\("dry_key"\)/.test(route) && !/console\.\w+\([^)]*ATLAS_DRY_TRIGGER_KEY/.test(route), "route reads the key from the header only and never logs it");
}
{
  const meter = strip(read("lib/atlasDryMeter.js"));
  ok(/DRY_ANTHROPIC_TIMEOUT_MS = 35000;/.test(meter) && /DRY_IO_TIMEOUT_MS = 3000;/.test(meter), "dry Anthropic timeout is 35000 ms and meter I/O timeout 3000 ms (3+3+35+3+3 = 47s inside maxDuration 60)");
  ok(/const laneTimeout = dryRun \? DRY_ANTHROPIC_TIMEOUT_MS : 48000;/.test(route) && /timeoutMs: laneTimeout/.test(route), "the lane uses the 35s dry timeout for dry runs only (48s for real runs), for both the outer timer and paidAi");
  ok((meter.match(/new AbortController\(\)/g) || []).length === 2 && (meter.match(/signal: ctrl\.signal/g) || []).length === 2, "readDryUsedCents and recordDryCents both carry an AbortController timeout");
  ok((meter.match(/rpc\/wf_spend_take/g) || []).length === 1 && !/while \(/.test(meter), "recordDryCents is ONE wf_spend_take call, no stepping loop");
  ok(/x-wf-request-sent"\) === "0"\) return \{ notSent: true/.test(route) && /meterBlocked = true; stoppedForBudget = true/.test(route), "a paidAi-blocked (not sent) place records nothing and stops the run (meter_blocked)");
  ok(/if \(!dryRun\) tripBreaker\(/.test(route), "dry mode never trips the shared provider-health breaker");
  ok(/if \(cents > DRY_RESERVE_FLOOR_CENTS\) \{ stoppedForOverage = true/.test(route), "a place over the reserve stops the run after it is recorded (stopped_for_overage)");
  const pai = strip(read("lib/paidAi.js"));
  ok(/provider_unreachable", 503, true\)/.test(pai) && (pai.match(/x-wf-request-sent/g) || []).length === 1, "only provider_unreachable (a request that was attempted) is marked sent=1");
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
