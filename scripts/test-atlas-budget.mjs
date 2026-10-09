// scripts/test-atlas-budget.mjs — locks the Atlas dollar-budget invariant (lib/atlasBudget.js,
// lib/atlasBudgetFileLedger.js, supabase/proposals/2026-10-atlas-ai-budget.sql).
// Provider calls are MOCKED (a counter of call() invocations); nothing here touches the network.
// All money is integer micro-USD; expectations are computed by hand in the comments.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  Budget, runAttempt, costOfUsage, requestBound, PRICE_VERSION, PRICE_SCHEDULE,
  UsageMissingError, UnknownModelError, UnknownPriceVersionError, LedgerStateError,
} from "../lib/atlasBudget.js";
import { FileLedger } from "../lib/atlasBudgetFileLedger.js";

const SELF = fileURLToPath(import.meta.url);
const H45 = "claude-haiku-4-5";

// ── child-process worker: contends on the same ledger file ───────────────────
if (process.argv[2] === "--worker") {
  const [, , , file, id, n] = process.argv;
  const ledger = new FileLedger({ file });
  const budget = new Budget({ ledger, scope: "mp", period: "2026-10" });
  let admitted = 0;
  const rs = await Promise.all(Array.from({ length: Number(n) }, (_, i) => budget.reserve(`w${id}-${i}`, `w${id}-p${i}`, H45, 1000)));
  for (const r of rs) if (r.ok) admitted++;
  process.stdout.write(JSON.stringify({ admitted }));
  process.exit(0);
}

let pass = 0;
const fail = (m) => { console.error("test-atlas-budget: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const throwsAsync = async (fn, Cls, m) => {
  try { await fn(); } catch (e) { ok(!Cls || e instanceof Cls, `${m} (threw ${e && e.name}: ${e && e.message})`); return e; }
  fail(`${m} (did not throw)`);
};
const throwsSync = (fn, Cls, m) => {
  try { fn(); } catch (e) { ok(!Cls || e instanceof Cls, `${m} (threw ${e && e.name}: ${e && e.message})`); return e; }
  fail(`${m} (did not throw)`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-budget-"));
let seq = 0;
async function mk({ ceiling, scope = "s", period = "2026-10", file } = {}) {
  const f = file || path.join(dir, `ledger-${++seq}.json`);
  const ledger = new FileLedger({ file: f });
  await ledger.setBudget(scope, period, ceiling);
  return { f, ledger, budget: new Budget({ ledger, scope, period }) };
}
let calls = 0;
const goodCall = async () => { calls++; return { usage: { input_tokens: 500, output_tokens: 100 }, result: "text", requestId: "req_1" }; };
// H45, maxIn 1000, maxOut 200, no search: 1000*1000 + 200*5000 = 2,000,000 nano = 2000 micro
const LIM = { maxInputTokens: 1000, maxOutputTokens: 200 };
const BOUND = 2000;
// goodCall usage: 500*1000 + 100*5000 = 1,000,000 nano = 1000 micro
const GOOD = 1000;

// ═════ 1. pricing: exact integers ═════════════════════════════════════════════
eq(PRICE_VERSION, "anthropic-std-2026-10-08", "price version string");
// sonnet 1000 in / 500 out: 1000*2000 + 500*10000 = 2,000,000 + 5,000,000 = 7,000,000 nano = 7000
eq(costOfUsage("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500 }, PRICE_VERSION, { toolsUsed: false }).microUsd, 7000, "sonnet plain");
// sonnet cache: in 100*2000=200,000; 5m 1000*2500=2,500,000; 1h 2000*4000=8,000,000; read 5000*100=500,000 => 11,200,000 = 11200
const c = costOfUsage("claude-sonnet-5-5", { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 5000, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 } }, PRICE_VERSION, { toolsUsed: false });
eq(c.microUsd, 11200, "sonnet cache write 5m/1h + read");
// unsplit cache writes priced at 1h: 3000*4000 = 12,000,000 + 100*2000 = 12,200,000 = 12200
eq(costOfUsage("claude-sonnet-5-5", { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 3000 }, PRICE_VERSION, { toolsUsed: false }).microUsd, 12200, "unsplit cache write priced at 1h (worst)");
// sub-cent exactness, 1 token haiku-5-5 in = 100 nano -> ceil 1 micro (never rounds to 0)
eq(costOfUsage("claude-haiku-5-5", { input_tokens: 1, output_tokens: 0 }, PRICE_VERSION, { toolsUsed: false }).microUsd, 1, "sub-micro cost rounds UP");
// haiku-5-5 threshold: prompt 99,999 (input 99,000 + cache read 999) => tier A
//   99,000*100 + 999*10 + 1000*500 = 9,900,000 + 9,990 + 500,000 = 10,409,990 nano = 10,410
const a = costOfUsage("claude-haiku-5-5", { input_tokens: 99000, output_tokens: 1000, cache_read_input_tokens: 999 }, PRICE_VERSION, { toolsUsed: false });
eq(a.tier, "A", "99,999 prompt tokens is tier A"); eq(a.microUsd, 10410, "tier A exact");
// prompt 100,001 (input 99,000 + cache read 1001) => tier B whole response
//   99,000*500 + 1001*50 + 1000*2500 = 49,500,000 + 50,050 + 2,500,000 = 52,050,050 nano = 52,051
const b = costOfUsage("claude-haiku-5-5", { input_tokens: 99000, output_tokens: 1000, cache_read_input_tokens: 1001 }, PRICE_VERSION, { toolsUsed: false });
eq(b.tier, "B", "100,001 prompt tokens (cache reads count) is tier B"); eq(b.microUsd, 52051, "tier B exact");
// exactly 100,000 is NOT > threshold => tier A: 100,000*100 = 10,000,000 = 10000
eq(costOfUsage("claude-haiku-5-5", { input_tokens: 100000, output_tokens: 0 }, PRICE_VERSION, { toolsUsed: false }).tier, "A", "exactly 100,000 stays tier A");
// cache WRITE tokens count toward the prompt too: 50,000 + 50,001 written => B
eq(costOfUsage("claude-haiku-5-5", { input_tokens: 50000, output_tokens: 0, cache_creation_input_tokens: 50001 }, PRICE_VERSION, { toolsUsed: false }).tier, "B", "cache creation counts toward tier threshold");
// partial tool failure: 3 attempted, usage reports 2 => billed 2.
//   H45: 10,000*1000 + 2000*5000 + 2*10,000,000 = 10,000,000+10,000,000+20,000,000 = 40,000,000 nano = 40000
const ps = costOfUsage(H45, { input_tokens: 10000, output_tokens: 2000, server_tool_use: { web_search_requests: 2 } }, PRICE_VERSION);
eq(ps.microUsd, 40000, "billed for the 2 searches the usage reports, not the 3 attempted"); eq(ps.breakdown.webSearches, 2, "search count from usage");
// web_fetch is free: extra web_fetch_requests change nothing
eq(costOfUsage(H45, { input_tokens: 10000, output_tokens: 2000, server_tool_use: { web_search_requests: 2, web_fetch_requests: 9 } }).microUsd, 40000, "web_fetch $0 per use");
// bounds
// sonnet: (10000-2000)*2000 + 2000*4000 + 1000*10000 + 3*10,000,000 = 16,000,000+8,000,000+10,000,000+30,000,000 = 64,000,000 = 64000
eq(requestBound("claude-sonnet-5-5", { maxInputTokens: 10000, cacheWriteTokens: 2000, maxOutputTokens: 1000, maxSearches: 3 }), 64000, "sonnet bound incl 1h cache write + searches");
// haiku-5-5 bound with maxIn 100,001 uses tier B: 100,001*500 + 1000*2500 = 50,000,500 + 2,500,000 = 52,500,500 = 52501
eq(requestBound("claude-haiku-5-5", { maxInputTokens: 100001, maxOutputTokens: 1000 }), 52501, "bound prices input at tier B above 100k");
// at 100,000: tier A: 100,000*100 + 1000*500 = 10,500,000 = 10500
eq(requestBound("claude-haiku-5-5", { maxInputTokens: 100000, maxOutputTokens: 1000 }), 10500, "bound at 100k stays tier A");
ok(requestBound("claude-haiku-5-5", { maxInputTokens: 100001, maxOutputTokens: 1000 }) >= costOfUsage("claude-haiku-5-5", { input_tokens: 100001, output_tokens: 1000, cache_creation_input_tokens: 0 }, PRICE_VERSION, { toolsUsed: false }).microUsd, "bound >= any in-limit cost");
throwsSync(() => requestBound("claude-haiku-5-5", { maxInputTokens: 10, cacheWriteTokens: 11 }), RangeError, "cache write cannot exceed prompt bound");

// unknown model / version always throw, never default
throwsSync(() => costOfUsage("claude-opus-9", { input_tokens: 1, output_tokens: 1 }, PRICE_VERSION, { toolsUsed: false }), UnknownModelError, "unknown model (cost)");
throwsSync(() => requestBound("claude-opus-9", LIM), UnknownModelError, "unknown model (bound)");
throwsSync(() => costOfUsage(H45, { input_tokens: 1, output_tokens: 1 }, "anthropic-std-1999", { toolsUsed: false }), UnknownPriceVersionError, "unknown price version (cost)");
throwsSync(() => requestBound(H45, LIM, "anthropic-std-1999"), UnknownPriceVersionError, "unknown price version (bound)");
ok(Object.isFrozen(PRICE_SCHEDULE[PRICE_VERSION]), "schedule is frozen");

// ═════ 2. missing usage never prices as zero ══════════════════════════════════
throwsSync(() => costOfUsage(H45, undefined, PRICE_VERSION, { toolsUsed: false }), UsageMissingError, "no usage object");
throwsSync(() => costOfUsage(H45, { output_tokens: 5 }, PRICE_VERSION, { toolsUsed: false }), UsageMissingError, "no input_tokens");
throwsSync(() => costOfUsage(H45, { input_tokens: 5 }, PRICE_VERSION, { toolsUsed: false }), UsageMissingError, "no output_tokens");
throwsSync(() => costOfUsage(H45, { input_tokens: "5", output_tokens: 5 }, PRICE_VERSION, { toolsUsed: false }), UsageMissingError, "string input_tokens");
throwsSync(() => costOfUsage(H45, { input_tokens: 5.5, output_tokens: 5 }, PRICE_VERSION, { toolsUsed: false }), UsageMissingError, "fractional input_tokens");
throwsSync(() => costOfUsage(H45, { input_tokens: 5, output_tokens: 5 }), UsageMissingError, "missing server_tool_use is UNKNOWN, not 0, when a search tool was present");

// ═════ 3. admission: insufficient budget => ZERO provider calls ═══════════════
{
  const { budget } = await mk({ ceiling: BOUND - 1 });
  calls = 0;
  const r = await runAttempt({ budget, attemptKey: "k1", placeId: "p1", model: H45, limits: LIM, call: goodCall });
  eq(r.status, "rejected", "over-ceiling attempt rejected"); eq(r.reason, "over_ceiling", "reason over_ceiling"); eq(calls, 0, "ZERO provider calls when budget is insufficient");
}
// happy path + settle frees the unused part of the bound
{
  const { budget, ledger } = await mk({ ceiling: 10000 });
  calls = 0;
  const r = await runAttempt({ budget, attemptKey: "h1", placeId: "p1", model: H45, limits: LIM, call: goodCall });
  eq(r.status, "settled", "settles"); eq(r.microUsd, GOOD, "settled at actual cost"); eq(calls, 1, "one call"); eq(r.overrun, false, "no overrun");
  const t = await ledger.totals("s", "2026-10");
  eq(t.settled, GOOD, "settled booked at actual, not at bound"); eq(t.liability, 0, "bound freed after settle");
  const row = await ledger.getAttempt("h1");
  eq(row.state, "settled", "state settled"); eq(row.requestId, "req_1", "request id kept");
}
// no-call rejection: unknown price version at Budget level
{
  const { ledger } = await mk({ ceiling: 10000 });
  const bad = new Budget({ ledger, scope: "s", period: "2026-10", priceVersion: "anthropic-std-1999" });
  eq((await bad.reserve("x", "p", H45, 10)).reason, "unknown_price_version", "Budget rejects unknown price version");
  await throwsAsync(() => new Budget({ ledger, scope: "s", period: "2026-10" }).reserve("x", "p", "mystery-model", 10), UnknownModelError, "Budget.reserve throws on unknown model");
  eq((await ledger.reserveAttempt({ attemptKey: "y", scope: "s", period: "2026-10", placeId: "p", model: H45, priceVersion: "nope", boundMicroUsd: 1 })).reason, "unknown_price_version", "ledger itself rejects unknown price version");
  eq((await ledger.reserveAttempt({ attemptKey: "z", scope: "s", period: "2026-10", placeId: "p", model: H45, priceVersion: PRICE_VERSION, boundMicroUsd: -5 })).reason, "invalid_bound", "negative bound rejected");
  eq((await ledger.reserveAttempt({ attemptKey: "n", scope: "s", period: "2026-11", placeId: "p", model: H45, priceVersion: PRICE_VERSION, boundMicroUsd: 1 })).reason, "no_budget", "no budget row for period => reject");
}

// ═════ 4. concurrency: exactly k admitted, never over the ceiling ═════════════
{
  // ceiling 7500, bound 1000 each: floor(7500/1000) = 7 admitted of 25
  const { budget, ledger } = await mk({ ceiling: 7500 });
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => budget.reserve(`c${i}`, `cp${i}`, H45, 1000)));
  const n = rs.filter((x) => x.ok).length;
  eq(n, 7, "25 parallel reservations, ceiling fits 7: exactly 7 admitted");
  const t = await ledger.totals("s", "2026-10");
  eq(t.liability, 7000, "liability 7 x 1000"); ok(t.liability + t.settled <= 7500, "never over ceiling");
  ok(rs.filter((x) => !x.ok).every((x) => x.reason === "over_ceiling"), "the rest rejected as over_ceiling");
}
{
  // 4 OS processes x 10 reservations on one file; ceiling 12,000 / bound 1000 => exactly 12
  const { f, ledger } = await mk({ ceiling: 12000, scope: "mp" });
  const outs = await Promise.all([1, 2, 3, 4].map((id) => new Promise((res, rej) => {
    const ch = spawn(process.execPath, [SELF, "--worker", f, String(id), "10"], { stdio: ["ignore", "pipe", "inherit"] });
    let o = ""; ch.stdout.on("data", (d) => (o += d));
    ch.on("exit", (code) => (code === 0 ? res(JSON.parse(o)) : rej(new Error("worker exit " + code))));
  })));
  const total = outs.reduce((s, x) => s + x.admitted, 0);
  eq(total, 12, "4 processes contending: exactly 12 admitted in total");
  const t = await ledger.totals("mp", "2026-10");
  eq(t.liability, 12000, "file shows 12,000 liability"); ok(t.liability <= 12000, "never over ceiling across processes");
  ok(!fs.existsSync(f + ".lock"), "lock file released");
}

// ═════ 5. duplicates ══════════════════════════════════════════════════════════
{
  const { budget } = await mk({ ceiling: 100000 });
  ok((await budget.reserve("d1", "pA", H45, 10)).ok, "first reserve ok");
  eq((await budget.reserve("d1", "pB", H45, 10)).reason, "duplicate_attempt_key", "duplicate attemptKey rejected");
  eq((await budget.reserve("d2", "pA", H45, 10)).reason, "active_place", "second active attempt for same place rejected");
  ok((await budget.reserve("d3", "pC", H45, 10)).ok, "different place fine");
}

// ═════ 6. restart: liability survives dropping every object ═══════════════════
{
  const { f, budget } = await mk({ ceiling: 3000 });
  ok((await budget.reserve("r1", "rp1", H45, 2000)).ok, "reserve"); await budget.dispatch("r1");
  // worker dies: drop Budget + ledger, reload from disk
  const ledger2 = new FileLedger({ file: f }); const budget2 = new Budget({ ledger: ledger2, scope: "s", period: "2026-10" });
  eq((await ledger2.getAttempt("r1")).state, "dispatched", "dispatched row survived restart");
  eq((await ledger2.totals("s", "2026-10")).liability, 2000, "liability still counted after restart");
  eq((await budget2.reserve("r2", "rp2", H45, 1500)).reason, "over_ceiling", "restarted worker still blocked by the dead worker's reservation");
  ok((await budget2.reserve("r3", "rp3", H45, 1000)).ok, "headroom still usable");
}

// ═════ 7. timeout / crash after dispatch => unresolved, counted, never released ═
{
  const { budget, ledger } = await mk({ ceiling: 10000 });
  calls = 0;
  const r = await runAttempt({ budget, attemptKey: "t1", placeId: "tp1", model: H45, limits: LIM, timeoutMs: 20, call: async () => { calls++; return new Promise(() => {}); } });
  eq(r.status, "unresolved", "timeout => unresolved"); eq(calls, 1, "call was made once");
  eq((await ledger.getAttempt("t1")).state, "unresolved", "row unresolved");
  eq((await ledger.totals("s", "2026-10")).liability, BOUND, "liability = reserved bound, still counted");
  await throwsAsync(() => budget.release("t1"), LedgerStateError, "release of an unresolved attempt is illegal");
  const r2 = await runAttempt({ budget, attemptKey: "t2", placeId: "tp2", model: H45, limits: LIM, call: async () => { calls++; throw new Error("socket hang up"); } });
  eq(r2.status, "unresolved", "provider throw after dispatch => unresolved"); eq((await ledger.totals("s", "2026-10")).liability, 2 * BOUND, "both unresolved counted");
}
// release legal only from reserved
{
  const { budget, ledger } = await mk({ ceiling: 10000 });
  ok((await budget.reserve("e1", "ep1", H45, 4000)).ok, "reserve"); await budget.dispatch("e1");
  const e = await throwsAsync(() => budget.release("e1"), LedgerStateError, "release after dispatch throws"); ok(/illegal transition/.test(e.message), "clear message");
  eq((await ledger.getAttempt("e1")).state, "dispatched", "state unchanged after refused release");
  ok((await budget.reserve("e2", "ep2", H45, 4000)).ok, "reserve 2"); await budget.release("e2");
  eq((await ledger.totals("s", "2026-10")).liability, 4000, "release from reserved frees its bound");
  await throwsAsync(() => budget.dispatch("e2"), LedgerStateError, "cannot dispatch a released attempt");
  await throwsAsync(() => ledger.settleAttempt("e2", { settledMicroUsd: 1 }), LedgerStateError, "cannot settle a never-dispatched attempt");
}

// ═════ 8. missing usage after a real call => unresolved, never zero ═══════════
{
  const { budget, ledger } = await mk({ ceiling: 10000 });
  const r = await runAttempt({ budget, attemptKey: "m1", placeId: "mp1", model: H45, limits: LIM, call: async () => ({ result: "text, but no usage" }) });
  eq(r.status, "unresolved", "missing usage => unresolved"); ok(r.error instanceof UsageMissingError, "typed UsageMissingError");
  const row = await ledger.getAttempt("m1");
  eq(row.state, "unresolved", "row unresolved"); eq(row.settledMicroUsd, null, "nothing booked as zero");
  eq((await ledger.totals("s", "2026-10")).liability, BOUND, "bound still held");
}

// ═════ 9. oversized research: overrun recorded in full + halt ═════════════════
{
  const { budget, ledger } = await mk({ ceiling: 100000 });
  calls = 0;
  // 5000*1000 + 1000*5000 = 10,000,000 nano = 10,000 micro > bound 2000
  const big = async () => { calls++; return { usage: { input_tokens: 5000, output_tokens: 1000 }, requestId: "req_big" }; };
  const r = await runAttempt({ budget, attemptKey: "o1", placeId: "op1", model: H45, limits: LIM, call: big });
  eq(r.status, "settled", "settled"); eq(r.overrun, true, "overrun flagged"); eq(r.microUsd, 10000, "full cost");
  const t = await ledger.totals("s", "2026-10");
  eq(t.settled, 10000, "overrun recorded IN FULL, not clamped to the bound"); eq(t.halted, true, "halted");
  const before = calls;
  const r2 = await runAttempt({ budget, attemptKey: "o2", placeId: "op2", model: H45, limits: LIM, call: goodCall });
  eq(r2.status, "rejected", "next reserve rejected"); eq(r2.reason, "halted", "reason halted"); eq(calls, before, "ZERO provider calls after halt");
  // halt survives a restart and is scope-wide (also blocks a new period)
  const l2 = new FileLedger({ file: ledger.file }); await l2.setBudget("s", "2026-11", 100000);
  eq((await new Budget({ ledger: l2, scope: "s", period: "2026-11" }).reserve("o3", "op3", H45, 1)).reason, "halted", "halt persists across restart and period");
  await l2.clearHalt("s");
  ok((await budget.reserve("o4", "op4", H45, 1)).ok, "operator clear lifts the halt");
}

// ═════ 10. one application retry = two reservations ═══════════════════════════
{
  const { budget, ledger } = await mk({ ceiling: 10000 });
  calls = 0; let n = 0;
  const flaky = async () => { calls++; if (++n === 1) throw new Error("529 overloaded"); return { usage: { input_tokens: 500, output_tokens: 100 } }; };
  const first = await runAttempt({ budget, attemptKey: "a#1", placeId: "rp", model: H45, limits: LIM, call: flaky });
  eq(first.status, "unresolved", "first attempt failed after dispatch"); eq(calls, 1, "runAttempt did NOT retry internally");
  const second = await runAttempt({ budget, attemptKey: "a#2", placeId: "rp", model: H45, limits: LIM, call: flaky });
  eq(second.status, "settled", "app-level retry is a new attempt"); eq(calls, 2, "two provider calls total");
  const t = await ledger.totals("s", "2026-10");
  eq(t.liability, BOUND, "first attempt still holds its bound"); eq(t.settled, GOOD, "second booked its own cost");
  eq((await ledger.getAttempt("a#1")).attemptKey !== (await ledger.getAttempt("a#2")).attemptKey, true, "two distinct rows/reservations");
}

// ═════ 11. month boundary: unresolved from a previous period blocks ══════════
{
  const { f, ledger } = await mk({ ceiling: 5000, period: "2026-09" });
  const sep = new Budget({ ledger, scope: "s", period: "2026-09" });
  ok((await sep.reserve("m-a", "mp-a", H45, 4000)).ok, "Sep reserve"); await sep.dispatch("m-a"); await sep.markUnresolved("m-a", "crash at month end");
  ok((await sep.reserve("m-b", "mp-b", H45, 900)).ok, "Sep second"); await sep.dispatch("m-b"); await sep.settle("m-b", { input_tokens: 500, output_tokens: 80 }, { toolsUsed: false }); // 500000+400000 = 900,000 nano = 900
  await ledger.setBudget("s", "2026-10", 5000);
  const oct = new Budget({ ledger: new FileLedger({ file: f }), scope: "s", period: "2026-10" });
  eq((await oct.reserve("m-c", "mp-c", H45, 1500)).reason, "over_ceiling", "Oct: 4000 unresolved carried over + 1500 > 5000");
  ok((await oct.reserve("m-d", "mp-d", H45, 1000)).ok, "Oct: 4000 + 1000 = 5000 fits exactly (Sep SETTLED 900 does not carry)");
  eq((await oct.reserve("m-e", "mp-e", H45, 1)).reason, "over_ceiling", "Oct is now exactly full");
}

// ═════ 12. fail closed on ledger read error ═══════════════════════════════════
{
  const { f, budget } = await mk({ ceiling: 10000 });
  fs.writeFileSync(f, "{ this is not json");
  calls = 0;
  const r = await runAttempt({ budget, attemptKey: "x1", placeId: "xp", model: H45, limits: LIM, call: goodCall });
  eq(r.status, "rejected", "corrupt ledger rejects"); eq(r.reason, "ledger_error", "reason ledger_error"); eq(calls, 0, "ZERO provider calls on ledger error");
  eq(fs.readFileSync(f, "utf8"), "{ this is not json", "corrupt file is not overwritten as if empty");
}
// stale lock is broken, live lock is respected
{
  const { f } = await mk({ ceiling: 1000 });
  const l = new FileLedger({ file: f, staleMs: 50, lockTimeoutMs: 400 });
  fs.writeFileSync(f + ".lock", "dead-owner"); const old = new Date(Date.now() - 5000); fs.utimesSync(f + ".lock", old, old);
  eq((await l.totals("s", "2026-10")).ceiling, 1000, "stale lock broken");
  const l2 = new FileLedger({ file: f, staleMs: 60000, lockTimeoutMs: 150 });
  fs.writeFileSync(f + ".lock", "live-owner");
  await throwsAsync(() => l2.totals("s", "2026-10"), null, "live lock => timeout error (fail closed)");
  fs.unlinkSync(f + ".lock");
}

// ═════ 13. SQL proposal in PGlite (single connection: Promise.all queues, so this proves the
//           invariant and state machine, NOT multi-session FOR UPDATE contention) ═════
let pgliteRan = false;
{
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(fs.readFileSync(new URL("../supabase/proposals/2026-10-atlas-ai-budget.sql", import.meta.url), "utf8"));
  pgliteRan = true;
  const rls = await db.query("select relname, relrowsecurity from pg_class where relname in ('wf_ai_budget','wf_ai_spend') order by relname");
  ok(rls.rows.length === 2 && rls.rows.every((x) => x.relrowsecurity === true), "RLS enabled on both tables");
  const pol = await db.query("select count(*)::int n from pg_policies where tablename in ('wf_ai_budget','wf_ai_spend')");
  eq(pol.rows[0].n, 0, "no policies (no anon access)");
  const res = (r) => r.rows[0].wf_ai_reserve;
  const R = (k, p, bound, per = "2026-10") => db.query("select wf_ai_reserve($1,'q',$2,$3,'claude-haiku-4-5','anthropic-std-2026-10-08',$4)", [k, per, p, bound]).then(res);
  await db.query("insert into wf_ai_budget(scope,period,ceiling_micro_usd) values ('q','2026-10',7500),('q','2026-09',7500)");
  const all = await Promise.all(Array.from({ length: 25 }, (_, i) => R(`s${i}`, `sp${i}`, 1000)));
  eq(all.filter((x) => x.ok).length, 7, "SQL: 25 concurrent reserves, exactly 7 admitted");
  ok(all.filter((x) => !x.ok).every((x) => x.reason === "over_ceiling"), "SQL: the rest over_ceiling");
  eq((await R("s0", "other", 1)).reason, "duplicate_attempt_key", "SQL: duplicate key");
  eq((await R("sX", "sp0", 1)).reason, "active_place", "SQL: duplicate active place");
  eq((await db.query("select wf_ai_reserve('u','q','2026-10','pz','claude-haiku-4-5','bad',1) r")).rows[0].r.reason, "unknown_price_version", "SQL: unknown price version");
  const raised = async (sql, params) => { try { await db.query(sql, params); } catch (e) { return String(e.message); } return null; };
  await db.query("select wf_ai_dispatch('s0')");
  ok(/illegal transition/.test(await raised("select wf_ai_release('s0')")), "SQL: release after dispatch raises");
  await db.query("select wf_ai_release('s1')");
  eq((await R("s-after-release", "spx", 1000)).ok, true, "SQL: released bound is reusable");
  // overrun: settle 9000 > bound 1000 -> halted, next reserve rejected
  const so = (await db.query("select wf_ai_settle('s0', 9000, '{\"input_tokens\":1}'::jsonb, 'req') r")).rows[0].r;
  eq(so.overrun, true, "SQL: overrun flagged");
  eq((await db.query("select settled_micro_usd::int v from wf_ai_spend where attempt_key='s0'")).rows[0].v, 9000, "SQL: overrun stored in full");
  eq((await R("after-halt", "ph", 1)).reason, "halted", "SQL: halted refuses reserve");
  await db.query("select wf_ai_clear_halt('q')");
  // carry: unresolved in 2026-09 blocks 2026-10
  await db.query("insert into wf_ai_budget(scope,period,ceiling_micro_usd) values ('c','2026-09',5000),('c','2026-10',5000)");
  const C = (k, p, bound, per) => db.query("select wf_ai_reserve($1,'c',$2,$3,'claude-haiku-4-5','anthropic-std-2026-10-08',$4) r", [k, per, p, bound]).then((x) => x.rows[0].r);
  ok((await C("c1", "cp1", 4000, "2026-09")).ok, "SQL: Sep reserve"); await db.query("select wf_ai_dispatch('c1')"); await db.query("select wf_ai_unresolve('c1','crash')");
  eq((await C("c2", "cp2", 1500, "2026-10")).reason, "over_ceiling", "SQL: unresolved Sep row blocks Oct");
  eq((await C("c3", "cp3", 1000, "2026-10")).ok, true, "SQL: exact fit admitted");
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`test-atlas-budget: OK — ${pass} assertions (exact micro-USD pricing + haiku-5-5 tier edge, ceiling under 25 parallel + 4-process contention, restart, dup key/place, timeout=unresolved, no release after dispatch, missing usage never zero, overrun halt, retry=2 reservations, month carry, fail-closed, SQL twin in PGlite=${pgliteRan})`);
