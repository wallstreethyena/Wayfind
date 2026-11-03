#!/usr/bin/env node
// /api/cron/promote-index was killed by Vercel ("Task timed out after 60 seconds", 7
// times since August, last 2026-11-01). A killed run settles nothing, writes no pulse
// and no config, so job-watch said "N consecutive runs failed to produce results".
// This guard EXECUTES the budget (injected clock) and the route's real details() helper,
// and pins the wiring that makes a late run return a partial progress 200
// with stopped: "deadline" instead of being killed. Quota/429 handling is asserted
// untouched (never retried, never takes a second grant).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBudget, runWithinBudget, PROMOTE_BUDGET_MS, PROMOTE_MAX_DURATION_S } from "../lib/promoteBudget.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 1. The loop with an injected clock. Each place "takes" 10s.
{
  let t = 1_000_000;
  const clock = () => t;
  const budget = createBudget({ budgetMs: 45_000, now: clock });
  const items = Array.from({ length: 12 }, (_, i) => ({ place_id: "p" + i }));
  const started = [];
  const r = await runWithinBudget(items, async (it) => { started.push(it.place_id); t += 10_000; }, budget);
  eq(started.join(","), "p0,p1,p2,p3,p4", "places start while the clock is under 45s (starts at 0,10,20,30,40s) and stop after");
  eq(r.stopped, "deadline", "the walk reports stopped: deadline");
  eq(r.deferred.length, 7, "the 7 places the clock never reached are handed back");
  eq(r.deferred[0].place_id, "p5", "deferred keeps order, starting at the first unstarted place");
  ok(started.length + r.deferred.length === items.length, "every claimed place is either processed or deferred, none lost");

  // control: fast batch finishes, no stop
  let t2 = 0;
  const b2 = createBudget({ budgetMs: 45_000, now: () => t2 });
  const done = [];
  const r2 = await runWithinBudget(items, async (it) => { done.push(it.place_id); t2 += 1_000; }, b2);
  eq(done.length, 12, "control: a fast batch processes every place");
  eq(r2.stopped, null, "control: no stop when the batch fits");
  eq(r2.deferred.length, 0, "control: nothing deferred");

  // a budget already spent before the loop (slow claim) defers everything
  let t3 = 0;
  const b3 = createBudget({ budgetMs: 45_000, now: () => t3 });
  t3 = 50_000;
  const r3 = await runWithinBudget(items.slice(0, 3), async () => { throw new Error("must not run"); }, b3);
  eq(r3.deferred.length, 3, "a budget spent before the loop starts defers the whole batch without calling Google");
  eq(b3.remainingMs(), 0, "remainingMs never goes negative");
}

// 2. The budget fits inside the function limit with room to settle.
const route = readFileSync("app/api/cron/promote-index/route.js", "utf8");
const code = strip(route);
const m = /export const maxDuration = (\d+);/.exec(code);
ok(m, "route exports maxDuration");
eq(Number(m[1]), PROMOTE_MAX_DURATION_S, "route maxDuration equals PROMOTE_MAX_DURATION_S");
ok(PROMOTE_BUDGET_MS <= PROMOTE_MAX_DURATION_S * 1000 - 10_000, "budget leaves at least 10s for settle, pulse and config");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const fnCfg = vercel.functions || {};
for (const [pat, cfg] of Object.entries(fnCfg)) {
  if (pat.includes("promote-index") && cfg.maxDuration) eq(cfg.maxDuration, PROMOTE_MAX_DURATION_S, "vercel.json maxDuration for promote-index agrees");
}

// 3. Wiring (comments stripped). Order matters: budget starts before the claim, the walk
// is the bounded runner, the deferred places are released, and settle/pulse come after it.
const at = (re) => { const i = code.search(re); return i; };
const iBudget = at(/createBudget\(\)/), iClaim = at(/"wf_promotion_claim"/), iWalk = at(/runWithinBudget\(claimed,/), iRelease = at(/p_note: `deadline:/), iPulse = at(/recordPulse\("promote-index", \{ attempted, succeeded, note: finalNote/);
ok(iBudget > 0 && iClaim > iBudget, "the wall clock starts before the claim");
ok(iWalk > iClaim, "the per place walk runs through runWithinBudget");
ok(iRelease > iWalk && iPulse > iRelease, "deadline releases and the pulse happen after the walk (a late run still settles and reports)");
ok(!/for \(const item of claimed\)/.test(code), "the unbounded per place loop is gone");
ok(/stopped: stoppedBy/.test(code) && /deferred: deadlineDeferred\.length/.test(code), "the response reports stopped and deferred");
ok(/deadlineSignal\(/.test(code), "the Google Details call carries an abort signal");
// positive control for the probes above
ok(at(/definitely-not-in-the-route/) === -1, "negative control: absent text is not found");

// 4. Execute the route's real details(): bounded fetch, no throw, 429 untouched.
const body = route.slice(route.indexOf("async function details("), route.indexOf("// cache: \"no-store\" IS LOAD-BEARING") > 0 ? route.indexOf("// cache: \"no-store\" IS LOAD-BEARING") : route.indexOf("async function rpc("));
globalThis.__acct = { grants: 0, signals: 0 };
const mod = await import("data:text/javascript," + encodeURIComponent(`
  import { classifyDetailsFailure } from ${JSON.stringify(new URL("../lib/promoteDetails.js", import.meta.url).href)};
  const DETAILS_MASK = "id"; const PROMOTE_SKU = "details_pro"; const NET_DEADLINE_MS = 8000;
  const deadlineSignal = (ms) => AbortSignal.timeout(Math.min(ms, 20));
  const sleep = async () => {}; const isTerminalStatus = (s) => s >= 400 && s < 500 && s !== 429;
  const spendAllowCapped = async () => { globalThis.__acct.grants++; return true; };
  ${body}\nexport { details };
`));
const hang = (url, init) => new Promise((_, reject) => { if (init && init.signal) { globalThis.__acct.signals++; init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))); } });
const keepAlive = setInterval(() => {}, 25); // AbortSignal.timeout timers are unref'd
globalThis.fetch = hang;
{
  let t = 0;
  const live = createBudget({ budgetMs: 45_000, now: () => t });
  const r = await mod.details("k", "ChIJfixture", "id", "details_pro", 4800, live);
  eq(r.ok, false, "a hung Google call settles instead of hanging");
  ok(!r.deadline && /no response/.test(r.error), "a hang with budget left is a transient fault, retried then reported (not thrown)");
  ok(globalThis.__acct.signals === 3, "all 3 attempts carried a signal");
  globalThis.__acct = { grants: 0, signals: 0 };
  const spent = createBudget({ budgetMs: 45_000, now: () => t });
  t = 99_000;
  const r2 = await mod.details("k", "ChIJfixture", "id", "details_pro", 4800, spent);
  ok(r2.deadline === true && r2.terminal === false, "a call cut off after the budget is spent is flagged deadline, not a verdict on the place");
  eq(globalThis.__acct.signals, 1, "and it is not retried");
}
{
  globalThis.__acct = { grants: 0, signals: 0 };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("Quota exceeded for quota metric 'GetPlaceRequest' and limit 'GetPlaceRequest per day'", { status: 429 }); };
  const q = await mod.details("k", "ChIJfixture", "id", "details_pro", 4800, createBudget());
  ok(q.ok === false && q.quota === "quota_daily" && q.terminal === false, "429 is still classified quota, never terminal");
  eq(calls, 1, "429 is never retried");
  eq(globalThis.__acct.grants, 0, "429 takes no second ledger grant");
}
clearInterval(keepAlive);
console.log(`test-promote-deadline: ${n} assertions OK (budget ${PROMOTE_BUDGET_MS}ms of ${PROMOTE_MAX_DURATION_S}s; real route details() executed)`);
