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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { classifyProviderFailure } from "../lib/providerHealth.js";
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

// -- 2. Breaker round-trip, IN A CHILD WITH AN EXPLICIT MINIMAL ENV ---------
// This used to trip a breaker named "test-provider" in THIS process.
// lib/serverCache's cget/cset fall through to the shared wf_places_cache
// whenever Supabase credentials are in scope -- which they are inside a
// Vercel build -- so the "fixture" was one production row shared by every
// process running the suite. Two observed consequences on 2026-09-09: this
// guard left a live 30-minute breaker row behind on every build, and
// check-editorial-coverage-pipeline's CLAUSE C (whose fixture was also fixed)
// failed its "must start closed" precondition whenever two builds overlapped,
// turning every preview deployment in the repo red.
//
// The round trip now runs in a child with `env: { NODE_ENV: "test" }`, the
// shape scripts/check-dead-provider-parked.mjs already uses and
// check-guard-hermeticity requires: no Supabase credentials reach the child,
// serverCache stays on its in-memory tier, nothing shared is written, and no
// process.env read in this parent decides a verdict.
const REPO = fileURLToPath(new URL("..", import.meta.url));
{
  const probe = `
import { breakerOpen, tripBreaker } from "${path.join(REPO, "lib/providerHealth.js")}";
const out = {};
out.closedBefore = await breakerOpen("test-provider");
await tripBreaker("test-provider", "billing", "credit balance too low");
out.open = await breakerOpen("test-provider");
out.other = await breakerOpen("some-other-provider");
console.log(JSON.stringify(out));
`;
  let R = {};
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 30000,
    });
    R = JSON.parse(String(stdout).trim().split("\n").pop());
  } catch (e) {
    fail("the breaker probe must run at all: " + String((e && e.message) || e).slice(0, 200));
  }
  ok(R.closedBefore === null, "precondition: with no Supabase env the fixture starts CLOSED -- it cannot inherit another run's state");
  ok(!!R.open, "a tripped breaker reads back open");
  ok(R.open.kind === "billing", "the breaker carries the failure kind");
  ok(/credit balance/.test(R.open.reason || ""), "...and the provider's reason, so the alert can say WHAT to fix");
  ok(!R.other, "an untripped provider reads closed -- breakers are per-provider");
}

// -- 2b. Both in-process breaker fixtures are isolated, by construction ------
// The rule the incident reduces to: a guard that trips a breaker must not do
// it in a process that can reach the shared cache. Asserted on the two files
// that trip one, by name, reading their CODE with comments stripped.
{
  const dir = new URL("./", import.meta.url);
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const ENV_LITERAL = /env:\s*\{\s*NODE_ENV:\s*"test"\s*\}/;
  for (const file of ["test-provider-health.mjs", "check-editorial-coverage-pipeline.mjs"]) {
    const code = stripComments(readFileSync(new URL(file, dir), "utf8"));
    ok(ENV_LITERAL.test(code),
      `${file}: its breaker round-trip must run in a child spawned with an explicit minimal env, in CODE -- inheriting this process's env puts the shared wf_places_cache back in reach and restores the 2026-09-09 race`);
    ok(!/env:\s*process\.env/.test(code),
      `${file}: the probe child must never inherit process.env`);
  }
  ok(!ENV_LITERAL.test(stripComments('// env: { NODE_ENV: "test" } in a comment only')),
    "self-test: the literal named only in a comment does NOT satisfy the check");
  ok(ENV_LITERAL.test(stripComments('execFileSync(x, y, { env: { NODE_ENV: "test" } });')),
    "self-test: a real spawn IS detected after stripping (the check is not vacuously false)");
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
