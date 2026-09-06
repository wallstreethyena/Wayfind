#!/usr/bin/env node
// scripts/test-revenue-heartbeat.mjs — REVENUE HEARTBEAT, layer 3 of the
// revenue-guard stack. Proves lib/revenueHeartbeat.js actually detects the
// "silent zero" signature — affiliate CTAs/clicks collapsing toward zero
// WHILE TRAFFIC IS STILL PRESENT — and, just as important, proves it is
// RATIO-based rather than absolute: a quiet night where both numbers drop
// together must NOT page (that would train everyone to ignore the alert —
// the exact failure jobPulse's own "idle, not incident" rule exists to
// avoid for the generic metered-job case; this is the same shape one layer
// up, for a ratio instead of a count).
//
// The live half (app/api/cron/revenue-heartbeat/route.js) queries real
// PostHog data and cannot run hermetically — this is what CAN be proven
// here: the pure classifier, red-proven by an applied mutation.
import {
  revenueSignal,
  baselineRatioFromHistory,
  toPulseRow,
  MIN_TRAFFIC_FOR_SIGNAL,
  COLLAPSE_FRACTION,
} from "../lib/revenueHeartbeat.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB_PATH = join(ROOT, "lib/revenueHeartbeat.js");

let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

// ── 1. the silent-zero signature IS caught ──────────────────────────────────
{
  // Healthy traffic (well above the minimum), a normal 5% historical
  // conversion-to-affiliate-activity baseline, and affiliate activity has
  // gone to LITERAL zero — the exact env-placeholder incident this whole
  // task is a response to (traffic unaffected, every Viator link fails
  // closed with no visible error).
  const s = revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: 0.05 });
  ok(s.status === "incident", "5000 visits, 0 affiliate activity, 5% baseline -> INCIDENT (the silent-zero signature)");
  ok(s.ratio === 0, "…ratio computed as exactly 0");
}
{
  // Partial collapse — not literal zero, still well under the 20% floor.
  const s = revenueSignal({ trafficCount: 5000, affiliateCount: 20, baselineRatio: 0.05 }); // ratio 0.004, floor 0.01
  ok(s.status === "incident", "a partial collapse (ratio well under the 20% floor, not literal zero) is still caught — this is why the rule is a RATIO threshold, not 'affiliateCount === 0'");
}

// ── 2. RATIO-BASED, NOT ABSOLUTE — the property the task explicitly demands ─
{
  // A quiet night: traffic and affiliate activity both far below their usual
  // absolute scale, but in the SAME proportion as the baseline. An
  // absolute-count rule ("alert if affiliate clicks < 50") would page here
  // for no reason; a ratio rule must not.
  const quietButProportional = revenueSignal({ trafficCount: 200, affiliateCount: 10, baselineRatio: 0.05 }); // ratio exactly 0.05
  ok(quietButProportional.status === "healthy", "a quiet night where BOTH numbers drop but stay in the same 5% proportion is HEALTHY, not an incident — proves the rule is ratio-based");
}
{
  // Genuinely too quiet to judge at all (below MIN_TRAFFIC_FOR_SIGNAL) with
  // ZERO affiliate activity — an absolute rule reading "0 affiliate events"
  // would scream here; this must read as idle instead.
  const s = revenueSignal({ trafficCount: 5, affiliateCount: 0, baselineRatio: 0.05 });
  ok(s.status === "idle", `5 visits (below MIN_TRAFFIC_FOR_SIGNAL=${MIN_TRAFFIC_FOR_SIGNAL}) with 0 affiliate activity is IDLE, not an incident — this is the exact 'does not page on a quiet night' requirement`);
}
ok(revenueSignal({ trafficCount: MIN_TRAFFIC_FOR_SIGNAL - 1, affiliateCount: 0, baselineRatio: 0.05 }).status === "idle",
  "one visit under the minimum is idle");
ok(revenueSignal({ trafficCount: MIN_TRAFFIC_FOR_SIGNAL, affiliateCount: 0, baselineRatio: 0.05 }).status === "incident",
  "exactly at the minimum, with real traffic and zero affiliate activity, it DOES fire — the floor is inclusive, not a loophole");

// ── 3. no baseline yet -> never a false incident ────────────────────────────
ok(revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: null }).status === "no_baseline",
  "no historical baseline (null) never reads as an incident, even at 0 affiliate activity — nothing to compare against yet");
ok(revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: NaN }).status === "no_baseline", "NaN baseline is treated the same as null");
ok(revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: 0 }).status === "no_baseline", "a ZERO historical baseline (this surface has never converted) cannot itself be 'collapsed below' — treated as no_baseline, not a permanent false incident");

// ── 4. the floor boundary ───────────────────────────────────────────────────
ok(revenueSignal({ trafficCount: 1000, affiliateCount: 200, baselineRatio: 0.05 }).status === "healthy",
  "a ratio (0.2) far above the collapse floor (0.05*0.2=0.01) reads healthy — sanity check before the exact-boundary test below");
{
  const floor = 0.05 * COLLAPSE_FRACTION; // 0.01
  const justAbove = revenueSignal({ trafficCount: 1000, affiliateCount: Math.ceil(floor * 1000) + 1, baselineRatio: 0.05 });
  const justBelow = revenueSignal({ trafficCount: 1000, affiliateCount: Math.floor(floor * 1000) - 1, baselineRatio: 0.05 });
  ok(justAbove.status === "healthy", "one affiliate event above the collapse floor reads healthy");
  ok(justBelow.status === "incident", "one affiliate event below the collapse floor reads incident — the boundary is where the math says it is, not fuzzed");
}

// ── 5. never throws on junk ─────────────────────────────────────────────────
for (const junk of [undefined, {}, { trafficCount: "not a number" }, { trafficCount: -5, affiliateCount: -5, baselineRatio: -1 }]) {
  let threw = null;
  try { revenueSignal(junk); } catch (e) { threw = e; }
  ok(!threw, `revenueSignal does not throw on malformed input (${JSON.stringify(junk)})`);
}
ok(revenueSignal({ trafficCount: -5, affiliateCount: -5, baselineRatio: 0.05 }).status === "idle", "negative counts clamp to 0, which is below the minimum -> idle, never a crash or a negative ratio");

// ── 6. baselineRatioFromHistory sums first, never averages per-day ratios ──
{
  // One near-zero-traffic day with a wild 1/2=0.5 ratio must NOT drag a
  // 14-day baseline built mostly from normal 5%-ratio days up toward 0.5.
  const history = [
    { trafficCount: 2, affiliateCount: 1 },     // noise day: ratio 0.5, but tiny volume
    { trafficCount: 5000, affiliateCount: 250 }, // normal day: ratio 0.05
    { trafficCount: 5000, affiliateCount: 250 },
  ];
  const b = baselineRatioFromHistory(history);
  ok(Math.abs(b - (501 / 10002)) < 1e-9, "baseline sums counts first (501/10002 ≈ 0.0501), not the average of per-day ratios (which would be ~0.2)");
  ok(b < 0.06, "…so a single tiny noisy day cannot dominate the baseline");
}
ok(baselineRatioFromHistory([]) === null, "empty history -> null baseline, not zero or NaN");
ok(baselineRatioFromHistory([{ trafficCount: 0, affiliateCount: 0 }]) === null, "all-zero-traffic history -> null baseline");

// ── 7. toPulseRow reuses the EXISTING alert path (recordPulse/job-watch) ───
// Deliberately not a new alerting mechanism — see lib/jobPulse.js /
// app/api/cron/job-watch. attempted=traffic, succeeded=0 only on incident, so
// job-watch's existing "attempted>0, succeeded=0 for N consecutive runs"
// detector — the same one that already pages on atlas-build and provider
// circuit breaks — covers delivery without a second alert path to maintain.
{
  const incident = revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: 0.05 });
  const row = toPulseRow(incident, { trafficCount: 5000, affiliateCount: 0 });
  ok(row.attempted === 5000, "pulse row attempted === traffic count");
  ok(row.succeeded === 0, "pulse row succeeded === 0 on an incident — this is what job-watch's dead-run detector reads");
  ok(/incident:/.test(row.note), "pulse note names the incident status");

  const healthy = revenueSignal({ trafficCount: 5000, affiliateCount: 250, baselineRatio: 0.05 });
  const healthyRow = toPulseRow(healthy, { trafficCount: 5000, affiliateCount: 250 });
  ok(healthyRow.succeeded === healthyRow.attempted, "pulse row succeeded === attempted when healthy — never a false dead-run");

  const idle = revenueSignal({ trafficCount: 5, affiliateCount: 0, baselineRatio: 0.05 });
  const idleRow = toPulseRow(idle, { trafficCount: 5, affiliateCount: 0 });
  ok(idleRow.succeeded === idleRow.attempted, "pulse row succeeded === attempted when idle (quiet night) — job-watch must never see this as a dead run");
}

// ── 8. the live route actually calls this module, not its own re-derived math ─
const ROUTE_PATH = join(ROOT, "app/api/cron/revenue-heartbeat/route.js");
const ROUTE_SRC = readFileSync(ROUTE_PATH, "utf8");
ok(/import\s*\{[^}]*\brevenueSignal\b[^}]*\}\s*from\s*["'][^"']*\/lib\/revenueHeartbeat(?:\.js)?["']/.test(ROUTE_SRC),
  "app/api/cron/revenue-heartbeat/route.js imports revenueSignal from lib/revenueHeartbeat.js");
ok(/revenueSignal\(/.test(ROUTE_SRC), "…and actually calls it");
ok(/recordPulse\(/.test(ROUTE_SRC), "…and writes through recordPulse — the SAME wf_job_pulse table every other metered job uses, not a new table");
ok(/process\.env\.CRON_SECRET/.test(ROUTE_SRC), "the route is CRON_SECRET-gated, matching every other cron in this repo (job-watch, booking-audit, cc-alerts)");

// ── 9. RED-PROVE: an applied mutation that inverts the collapse comparison ─
{
  const original = readFileSync(LIB_PATH, "utf8");
  const target = "if (ratio < floor) {";
  if (!original.includes(target)) {
    fails.push("red-prove setup: the exact collapse comparison `if (ratio < floor) {` was not found verbatim in lib/revenueHeartbeat.js — the mutation target has drifted");
  } else {
    const mutated = original.replace(target, "if (ratio > floor) { // MUTATED BY test-revenue-heartbeat.mjs RED-PROVE");
    if (mutated === original) {
      fails.push("red-prove: replace() did not change the file — the mutation silently failed to apply");
    } else {
      writeFileSync(LIB_PATH, mutated);
      const applied = readFileSync(LIB_PATH, "utf8").includes("MUTATED BY test-revenue-heartbeat.mjs RED-PROVE");
      console.log(`red-prove: applied mutation to lib/revenueHeartbeat.js — collapse comparison inverted (verified written: ${applied})`);
      let childOk = null;
      try {
        execFileSync(process.execPath, ["-e", `
          import("${new URL("../lib/revenueHeartbeat.js", import.meta.url).href}").then(({ revenueSignal }) => {
            const s = revenueSignal({ trafficCount: 5000, affiliateCount: 0, baselineRatio: 0.05 });
            // With the comparison inverted, a real silent-zero (ratio 0 < floor)
            // must now read as HEALTHY instead of incident.
            if (s.status !== "healthy") { console.error("expected the mutation to hide the silent-zero incident as healthy; got " + s.status); process.exit(1); }
            process.exit(0);
          }).catch((e) => { console.error(String(e)); process.exit(1); });
        `], { stdio: "pipe" });
        childOk = true;
      } catch (e) {
        childOk = false;
      }
      writeFileSync(LIB_PATH, original);
      const restored = readFileSync(LIB_PATH, "utf8") === original;
      ok(restored, "red-prove: lib/revenueHeartbeat.js was restored byte-for-byte after the mutation");
      ok(childOk === true, "red-prove: inverting the collapse comparison makes a real silent-zero read as healthy in a fresh process — the assertions above are catching real logic, not decoration");
    }
  }
}

if (fails.length) {
  console.error("test-revenue-heartbeat: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`test-revenue-heartbeat: OK — ${pass} assertions; the silent-zero signature is caught, a proportional quiet night is not, no baseline never false-alarms, the boundary is exact, the live route reuses the existing recordPulse/job-watch alert path, and an applied mutation of the collapse comparison is caught in a fresh process`);
