#!/usr/bin/env node
/**
 * check-guards-emit-no-analytics — the guard suite must never write to the
 * production analytics project.
 *
 * THE INCIDENT (measured 2026-07-31 -> 2026-08-04). Six guards invoke the real
 * redirect handlers on purpose, because CLAUDE.md is explicit that a check
 * should assert on the CALL and not on the string. Those handlers end in
 * captureServer(). `npm run prebuild` runs this suite DURING THE VERCEL BUILD,
 * where NEXT_PUBLIC_POSTHOG_KEY is set — so every build on every lane fired the
 * guards' deliberately-broken fixtures into PRODUCTION as real events:
 *
 *   provider_redirect_failed   268 events / 268 distinct "people"
 *   provider_redirect_started   71
 *
 * Failures outnumbered starts ~4:1, which cannot happen with real traffic. The
 * fixtures were identifiable: all 26 `invalid-product-url` rows carried
 * content_id "orlando tour" (check-viator-redirect-layer's open-redirect test)
 * and all 26 `unknown-provider` rows carried provider "evilcorp"
 * (check-commerce-redirect's refusal test). Each run also minted a NEW person,
 * because distinctId falls back to a fresh click_id with no cookie — so unique
 * user counts were inflated too.
 *
 * This is the "a check ran and answered the wrong question" family, one level
 * up: the checks were right, and the act of running them corrupted the data
 * used to judge the thing they were checking.
 *
 * WHY THE ASSERTION STUBS fetch RATHER THAN READING A RETURN VALUE.
 * captureServer returns false for several unrelated reasons (no key, no
 * distinctId, network error), so "returned false" does not prove "sent nothing".
 * The only claim worth making is that NO REQUEST LEAVES, so fetch is replaced
 * and the call count asserted. Nothing here touches the network in either arm.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { captureServer, analyticsSuppressed } from "../lib/serverEvents.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the gate itself, CALLED with fetch stubbed ────────────────────────── */
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true }; };

const KEY = "NEXT_PUBLIC_POSTHOG_KEY";
const prevKey = process.env[KEY];
const prevSup = process.env.WF_SUPPRESS_ANALYTICS;
// A key IS present — that is the whole point. Gating on the key would not have
// caught this, because Vercel builds have one.
process.env[KEY] = "phc_guardtest_not_a_real_key";

try {
  process.env.WF_SUPPRESS_ANALYTICS = "1";
  ok(analyticsSuppressed() === true, "analyticsSuppressed() must be true when the flag is 1");
  calls = 0;
  const suppressed = await captureServer("provider_redirect_failed", { distinctId: "d1", properties: { a: 1 } });
  ok(calls === 0, `suppressed capture must issue ZERO requests (issued ${calls})`);
  ok(suppressed === false, "a suppressed capture must report false");

  // NEGATIVE CONTROL. Without it, `calls === 0` above is equally consistent with
  // captureServer being broken and never sending anything at all.
  process.env.WF_SUPPRESS_ANALYTICS = "";
  ok(analyticsSuppressed() === false, "analyticsSuppressed() must be false when the flag is unset");
  calls = 0;
  await captureServer("provider_redirect_started", { distinctId: "d1", properties: { a: 1 } });
  ok(calls === 1, `PROBE BROKEN: unsuppressed capture must issue exactly ONE request (issued ${calls}) — if this is 0, the zero above proves nothing`);

  // Only "1" suppresses. A stray "0"/"false"/"true" must not silently disable
  // production analytics.
  for (const v of ["0", "false", "no", "", "2"]) {
    process.env.WF_SUPPRESS_ANALYTICS = v;
    ok(analyticsSuppressed() === false, `"${v}" must NOT suppress — only the literal "1" may`);
  }
} finally {
  globalThis.fetch = realFetch;
  if (prevKey === undefined) delete process.env[KEY]; else process.env[KEY] = prevKey;
  if (prevSup === undefined) delete process.env.WF_SUPPRESS_ANALYTICS; else process.env.WF_SUPPRESS_ANALYTICS = prevSup;
}

/* ── 2. run-guards must set it for every child ────────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const runner = strip(readFileSync(REPO + "scripts/run-guards.mjs", "utf8"));
ok(/spawnSync\([\s\S]{0,240}WF_SUPPRESS_ANALYTICS:\s*["']1["']/.test(runner),
  "run-guards.mjs must pass WF_SUPPRESS_ANALYTICS=1 in the env of every guard it spawns");
ok(/env:\s*\{\s*\.\.\.process\.env/.test(runner),
  "run-guards must SPREAD process.env, not replace it — a bare env object strips PATH and every guard dies");

/* ── 3. every guard that can reach captureServer must self-suppress ───────── */
// Reaching it means importing a route handler (the handlers capture) or the
// emitter directly. Such a guard run DIRECTLY, outside run-guards, would emit.
// Reaching = the file can cause the module to EXECUTE. Import syntax alone is
// not enough to detect that: check-provider-redirects passes its route path as a
// STRING ARGUMENT to a helper (`testRoute("/api/...", "../app/api/.../route.js")`)
// which then dynamic-imports it, so a `from`/`import(` regex misses it entirely —
// the first version of this guard found 2 of 3 and its own positive control said so.
//
// So: blank out readFileSync(...) expressions (reading source executes nothing),
// then look for the module path ANYWHERE in what remains, whatever syntax carries
// it. Model the scope, do not approximate it.
const stripReads = (s) => s.replace(/readFileSync\s*\([\s\S]*?\)/g, " ");

// DERIVE the capturing routes rather than guessing a path shape. Matching any
// "app/api/.../route" flagged a dozen unrelated test files that merely mention a
// route path — and a guard that fires on correct code gets commented out, taking
// its real catches with it. Only routes that actually call captureServer matter.
function capturingRoutes(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + e.name;
    if (e.isDirectory()) { capturingRoutes(full, out); continue; }
    if (e.name !== "route.js") continue;
    if (!/\bcaptureServer\s*\(/.test(readFileSync(full, "utf8"))) continue;
    out.push(full.slice(full.indexOf("app/api")).replace(/\.js$/, ""));
  }
  return out;
}
const CAPTURING = capturingRoutes(REPO + "app/api");
ok(CAPTURING.length >= 2,
  `PROBE BROKEN: expected to find route handlers that call captureServer, found ${CAPTURING.length}`);
const REACHES = (src) =>
  /lib\/serverEvents(?:\.js)?/.test(src) || CAPTURING.some((r) => src.includes(r));
const guardFiles = readdirSync(REPO + "scripts").filter((f) => f.endsWith(".mjs"));
ok(guardFiles.length > 50, `expected to scan the guard directory (found ${guardFiles.length})`);

const reaching = [];
const intercepting = [];
for (const f of guardFiles) {
  if (f === "check-guards-emit-no-analytics.mjs") continue; // this file stubs fetch instead
  const raw = readFileSync(REPO + "scripts/" + f, "utf8");
  if (!REACHES(stripReads(strip(raw)))) continue;
  reaching.push(f);
  // TWO valid protections, because the invariant is "no request leaves this
  // process", not "one particular flag is set":
  //   (a) WF_SUPPRESS_ANALYTICS=1 — captureServer returns before any fetch;
  //   (b) a fetch stub that intercepts the PostHog capture endpoint — used by
  //       check-provider-redirects, whose whole purpose is asserting that
  //       capture DOES happen, so suppressing it would defeat the guard.
  // (b) is strictly stronger: it also lets the payload be inspected.
  const suppresses = /process\.env\.WF_SUPPRESS_ANALYTICS\s*=\s*["']1["']/.test(raw);
  // Any globalThis.fetch stub counts: whether it filters for the PostHog
  // endpoint or replaces fetch wholesale, no request leaves the process. This
  // is a heuristic over guard SOURCE — it cannot prove the stub is installed
  // before the invocation — so it is deliberately paired with the runtime
  // assertions in section 1, which prove the gate itself actually works.
  const intercepts = /globalThis\.fetch\s*=/.test(raw);
  if (intercepts) intercepting.push(f);
  ok(suppresses || intercepts,
    `${f} can reach captureServer but neither sets WF_SUPPRESS_ANALYTICS=1 nor stubs fetch to intercept the PostHog capture endpoint — running it would write to the production project`);
}
ok(reaching.length >= 3,
  `PROBE BROKEN: expected to find the handler-invoking guards, found ${reaching.length} (expected the 3+ handler-executing guards). If this is 0 the per-file assertions above ran zero times and prove nothing.`);

if (fail.length) {
  console.error("check-guards-emit-no-analytics: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-guards-emit-no-analytics: OK — ${pass} assertions ` +
  `(gate CALLED with fetch stubbed: 0 requests suppressed vs 1 unsuppressed as a negative control, ` +
  `only the literal "1" suppresses, run-guards spreads env + sets the flag, ` +
  `${reaching.length} guards reach ${CAPTURING.length} capturing routes; ${intercepting.length} intercept the capture endpoint, the rest suppress)`
);
