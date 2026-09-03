#!/usr/bin/env node
// scripts/check-dead-provider-parked.mjs — a provider that CANNOT succeed is not
// asked again, and a parked one does not masquerade as a failing one.
//
// TWO MEASURED INCIDENTS, 2026-09-03, both found only after the health block
// learned to say WHY (check-provider-health-says-why.mjs):
//
//   Google (SerpAPI)       ok=false received=0 status=400   in 4 cities at once
//   Google (OpenWebNinja)  ok=false received=0 status=429   in 4 cities at once
//
//   * SerpAPI 400 — Google retired the Events experience the `google_events`
//     engine scraped. The engine cannot answer. SerpApi BILLS PER SEARCH, so
//     every uncached /api/events request was buying a guaranteed 400.
//   * OpenWebNinja 429 — identical in four cities in the same second, which is
//     not a per-second rate limit; and NOT a bad key, because an invalid key
//     answers 401 (checked against the live endpoint). The account quota is
//     spent, so no retry inside the window can succeed.
//
// The two rules this locks:
//   1. A parked provider returns configured:false — it leaves the health block
//      entirely. A deliberately parked provider logged as a FAILING one is how a
//      team learns to ignore the health block, which is how OpenWebNinja sat
//      broken long enough to be curated around by hand.
//   2. A deterministic HTTP refusal (401/402/403/429) trips the SHARED breaker
//      in lib/providerHealth, and while it is open the provider is not called.
//      Reusing that breaker, not a second parallel one, is the point: the
//      hand-rolled version this replaced read cget()'s return value as the
//      stored object when cget actually returns { v }, so it never blocked
//      anything — a breaker that silently never trips is worse than none.
//
// ASSERTED BY CALL where a call is possible (breaker semantics against a stubbed
// cache, in a child process with an explicit env), and by scan for the two facts
// that live inside a Next route module that cannot be imported standalone.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. the breaker itself, EXECUTED ───────────────────────────────────────
// Run in a child process with an explicit, minimal env: lib/serverCache reads
// Supabase env at call time, and this guard must not depend on the ambient
// shell (check-guard-hermeticity).
const probe = `
import { breakerOpen, tripBreaker, classifyProviderFailure, BREAKER_COOLDOWN_MS } from "${path.join(ROOT, "lib/providerHealth.js")}";
const out = {};
out.closedIsNull = (await breakerOpen("probe-provider")) === null;
out.tripped = await tripBreaker("probe-provider", "quota", "http 429 — not retried for 30 min");
const open = await breakerOpen("probe-provider");
out.openShape = !!(open && open.kind === "quota" && /429/.test(String(open.reason)));
out.otherProviderUnaffected = (await breakerOpen("probe-other")) === null;
out.classify429 = classifyProviderFailure(429, "monthly usage limit reached");
out.classifyPlain429 = classifyProviderFailure(429, "Too Many Requests");
out.cooldownMin = Math.round(BREAKER_COOLDOWN_MS / 60000);
console.log(JSON.stringify(out));
`;
let R = {};
try {
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
    env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 30000,
  });
  R = JSON.parse(String(stdout).trim().split("\n").pop());
} catch (e) {
  ok(false, "the breaker probe ran at all: " + String(e && e.message || e).slice(0, 200));
}
ok(R.closedIsNull === true, "a closed breaker reads as null (nothing is blocked by default)");
ok(R.tripped === true, "tripBreaker reports success with no Supabase env — it is memory-backed and fail-soft");
ok(R.openShape === true, "…and the tripped breaker reads back with its kind and the code that tripped it");
ok(R.otherProviderUnaffected === true, "the breaker is PER PROVIDER — tripping one does not silence another");
ok(R.classify429 === "quota", "a 429 that names a usage limit classifies as quota");
ok(R.classifyPlain429 === null, "a plain 429 is not miscalled a quota — the route supplies that fallback itself");
ok(R.cooldownMin === 30, `the cooldown is 30 minutes (measured ${R.cooldownMin})`);

// ── 2. the route wiring ───────────────────────────────────────────────────
// Comments stripped, string literals KEPT: this file documents the parked
// provider in prose, and blanking strings would hide the literals under test.
const src = read("app/api/events/route.js")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/([^:"'`])\/\/.*$/gm, "$1 ");
ok(/async function fromTicketmaster/.test(src), "control: the stripper kept real code (the scan is not vacuous)");

// 2a. SerpApi is parked before it can spend a cent.
ok(/const SERP_EVENTS_PARKED\s*=\s*true/.test(src), "the SerpApi events engine is parked");
const serp = src.slice(src.indexOf("async function fromSerpEvents"));
const serpBody = serp.slice(0, serp.indexOf("\n}\n") + 2);
ok(/if\s*\(\s*SERP_EVENTS_PARKED\s*\)/.test(serpBody), "…and the park is checked INSIDE fromSerpEvents, before anything else");
const guardIdx = serpBody.indexOf("SERP_EVENTS_PARKED");
const fetchIdx = serpBody.indexOf("fetch(");
const keyIdx = serpBody.indexOf("process.env.SERPAPI_KEY");
ok(fetchIdx === -1 || guardIdx < fetchIdx, "…before any fetch — a parked engine costs no billable search");
ok(keyIdx === -1 || guardIdx < keyIdx, "…and before the key is even read");
ok(/if\s*\(\s*SERP_EVENTS_PARKED\s*\)\s*\{?\s*return\s*\{\s*configured:\s*false/.test(serpBody.replace(/\s+/g, " ").replace(/ \{ /g, " { ")),
  "a parked provider returns configured:false — it leaves the health block instead of logging as a failure");

// 2b. OpenWebNinja backs off, using the SHARED breaker.
ok(/from "\.\.\/\.\.\/\.\.\/lib\/providerHealth\.js"/.test(src),
  "the route uses lib/providerHealth — one breaker, not a second parallel mechanism");
ok(!/cget\(\s*quotaKey|quotaBlocked|blockOnQuota/.test(src),
  "…and no hand-rolled breaker survives (the one this replaced misread cget's { v } wrapper and never blocked)");
const own = src.slice(src.indexOf("async function fromOpenWebNinja"));
const ownBody = own.slice(0, own.indexOf("\n}\n") + 2);
const checkIdx = ownBody.indexOf("breakerNote(");
const owFetch = ownBody.indexOf("fetch(");
ok(checkIdx > -1 && owFetch > -1 && checkIdx < owFetch,
  "the breaker is consulted BEFORE the outbound call — an open breaker costs zero requests");
ok(/tripOnDeterministic\(/.test(ownBody) && ownBody.indexOf("tripOnDeterministic(") < ownBody.indexOf("return { configured: true, ok: false, status: r.status"),
  "…and a non-ok response trips it before the failure is returned");
ok(/DETERMINISTIC_HTTP\s*=\s*new Set\(\[401, 402, 403, 429\]\)/.test(src),
  "only DETERMINISTIC refusals trip it — a 500 or a timeout stays retryable");
ok(/if\s*\(\s*!DETERMINISTIC_HTTP\.has\(status\)\s*\)\s*return;/.test(src),
  "…enforced on the trip path, not merely declared");
ok(!/status:\s*open\.status/.test(src),
  "a held request reports no HTTP status — nothing was asked, so inventing one would be a lie in the health block");

console.log(fail
  ? `check-dead-provider-parked: FAIL — ${fail} failed, ${pass} passed`
  : `check-dead-provider-parked: OK — ${pass} assertions; the retired engine is parked out of the health block and a deterministic refusal costs one call, not one per request`);
process.exit(fail ? 1 : 0);
