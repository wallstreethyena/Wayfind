#!/usr/bin/env node
// scripts/test-provider-health.mjs — the 579-call incident must stay impossible.
//
// Three properties, each mapped to a real failure mode from 2026-08:
//   1. classifyProviderFailure names billing/quota refusals and — just as
//      important — refuses to name transient errors, because a breaker that
//      trips on a rate-limit blip turns every busy hour into a fake outage.
//   2. The breaker round-trips in-process: tripped -> open -> carries reason.
//   3. classifyHealth escalates a "billing:"-noted dead run after ONE run,
//      while generic failures still wait for DEAD_RUN_THRESHOLD.
import { classifyProviderFailure, tripBreaker, breakerOpen } from "../lib/providerHealth.js";
import { classifyHealth, DEAD_RUN_THRESHOLD } from "../lib/jobPulse.js";

let pass = 0;
const fail = (m) => { console.error("test-provider-health: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1. Classification ────────────────────────────────────────────────────────
ok(classifyProviderFailure(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.") === "billing",
  "the exact production 400 from the August incident classifies as billing");
ok(classifyProviderFailure(402, "payment required") === "billing", "402 is billing");
ok(classifyProviderFailure(429, "You have exceeded your monthly usage limit") === "quota", "quota-exhausted 429 is quota");
ok(classifyProviderFailure(429, "Too many requests, please slow down") === null,
  "a plain rate-limit 429 does NOT classify — retrying is correct there, and a breaker would fake an outage");
ok(classifyProviderFailure(400, "max_tokens: invalid value") === null, "an ordinary 400 does not classify");
ok(classifyProviderFailure(500, "overloaded") === null, "a 500 does not classify");

// ── 2. Breaker round-trip (in-process memory tier of serverCache) ────────────
{
  await tripBreaker("test-provider", "billing", "credit balance too low");
  const open = await breakerOpen("test-provider");
  ok(!!open, "a tripped breaker reads back open");
  ok(open.kind === "billing", "the breaker carries the failure kind");
  ok(/credit balance/.test(open.reason || ""), "…and the provider's reason, so the alert can say WHAT to fix");
  const other = await breakerOpen("some-other-provider");
  ok(!other, "an untripped provider reads closed — breakers are per-provider");
}

// ── 3. Escalation: billing pages after ONE dead run ──────────────────────────
{
  const rows = [
    { job: "atlas-build", attempted: 10, succeeded: 0, consecutive_zero: 1, last_note: "billing: anthropic 400: credit balance too low" },
    { job: "scout", attempted: 10, succeeded: 0, consecutive_zero: 1, last_note: "0 published of 10: pending=10" },
    { job: "inventory-refresh", attempted: 10, succeeded: 0, consecutive_zero: DEAD_RUN_THRESHOLD, last_note: "http 500" },
    { job: "idler", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: null },
  ];
  const { incidents, healthy, idle } = classifyHealth(rows);
  const names = incidents.map((r) => r.job);
  ok(names.includes("atlas-build"), "one billing-noted dead run is already an incident — nobody waits two hours to learn the account is empty");
  ok(!names.includes("scout"), "one GENERIC dead run is still below threshold — transient blips must not page");
  ok(names.includes("inventory-refresh"), "generic failures still page at DEAD_RUN_THRESHOLD");
  ok(idle.length === 1 && healthy.length === 1, "idle and healthy classification unchanged");
}

console.log(`test-provider-health: OK — ${pass} assertions`);
