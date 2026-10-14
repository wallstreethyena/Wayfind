#!/usr/bin/env node
// scripts/test-spend-pacing.mjs — spend pacing forecast + early warning.
// Fixed clocks only. Proves: on-pace is OK, the WARN boundaries are exact,
// CAPPED is CAPPED, the pulse maps to job-watch the way the route promises,
// the cron is wired (guards.txt, vercel.json, CRON_SECRET, fail-loud), and a
// mutation of the projection turns THIS test red (run against a temp copy of
// the lib; the real file is never touched).
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = process.argv[2] || join(ROOT, "lib/spendPacing.js");
const { paceSku, paceLedger, pacingPulse, clockParts, daysInUtcMonth } = await import(pathToFileURL(LIB).href);

const fails = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const P = (used, cap, d, dim = 31) => paceSku({ used, cap, dayOfMonth: d, daysInMonth: dim });

// 1. positive: on pace
{
  const r = P(1000, 4800, 10); // 100/day -> 3100 projected, 65% of cap, 21 days left
  ok(r.status === "OK", "on-pace row is OK");
  ok(r.projected === 3100, "linear projection = used/day*daysInMonth (3100)");
  ok(r.exhaustionDay === null, "no exhaustion day when projection stays under cap");
  ok(P(0, 500, 5).status === "OK" && P(0, 500, 5).projected === 0, "zero use is OK");
}
// 2. WARN: projected overrun with >3 days left
{
  const r = P(1000, 2000, 10); // 100/day -> 3100 > 2000
  ok(r.status === "WARN", "projected overrun with 21 days left is WARN");
  ok(r.exhaustionDay === 20, "exhaustion day = ceil(cap/perDay) = 20");
  // projection boundary: projected == cap is not an overrun; one more is (mid-month, <80% used)
  ok(P(500, 1550, 10).projected === 1550 && P(500, 1550, 10).status === "OK", "projected exactly equal to cap is OK");
  ok(P(501, 1550, 10).projected === 1553 && P(501, 1550, 10).status === "WARN", "projected one step over cap with 21 days left is WARN");
  // the >3-days-left clause: an overrun projected with <=3 days left and <80% used cannot occur
  // arithmetically, so the 80% clause is what governs the tail of the month
  ok(P(700, 1000, 28).status === "OK", "70% used on day 28 is OK");
}
// 3. WARN: >=80% used regardless of pace; boundary exact
{
  ok(P(3840, 4800, 29).status === "WARN", "exactly 80% used is WARN");
  ok(P(3839, 4800, 29).status === "OK", "79.98% used on an on-pace/late row is OK");
}
// 4. CAPPED
{
  ok(P(950, 950, 1).status === "CAPPED", "used==cap is CAPPED");
  ok(P(7000, 6650, 20).status === "CAPPED", "used>cap is CAPPED");
}
// 5. INVALID never reads as OK
{
  ok(P(5, 0, 5).status === "INVALID", "cap 0 is INVALID");
  ok(P(5, null, 5).status === "INVALID", "null cap is INVALID");
  ok(P(5, 10, 0).status === "INVALID", "day 0 is INVALID");
  ok(P(5, 10, 32, 31).status === "INVALID", "day beyond month is INVALID");
}
// 6. clock
{
  const c = clockParts(new Date("2026-10-13T21:59:00Z"));
  ok(c.month === "2026-10" && c.dayOfMonth === 13 && c.daysInMonth === 31, "clockParts from fixed instant");
  ok(daysInUtcMonth(new Date("2028-02-10T00:00:00Z")) === 29, "leap February");
}
// 7. ledger + pulse mapping (October 2026 shape, day 8 = early cap)
{
  const rows = [
    { sku: "events_ticketmaster", used: 5000, cap: 5000 },
    { sku: "photos", used: 3298, cap: 10000 },
  ];
  const early = paceLedger(rows, new Date("2026-10-08T22:00:00Z"));
  const pe = pacingPulse(early);
  ok(pe.level === "incident" && pe.succeeded === 0 && /^quota:/.test(pe.note), "CAPPED on day 8 -> incident, succeeded=0, `quota:` note (job-watch deterministic prefix)");
  const late = pacingPulse(paceLedger(rows, new Date("2026-10-13T22:00:00Z")));
  ok(late.level === "warn" && late.succeeded === late.attempted && /^warn:/.test(late.note), "CAPPED on day 13 -> non-paging warn");
  const boundary = pacingPulse(paceLedger(rows, new Date("2026-10-10T22:00:00Z")));
  ok(boundary.level === "incident", "day 10 is still early");
  ok(pacingPulse(paceLedger(rows, new Date("2026-10-11T00:01:00Z"))).level === "warn", "day 11 is not early");
  const fine = pacingPulse(paceLedger([{ sku: "photos", used: 100, cap: 10000 }], new Date("2026-10-13T00:00:00Z")));
  ok(fine.level === "ok" && fine.succeeded === fine.attempted, "all on pace -> ok");
  const bad = pacingPulse(paceLedger([{ sku: "x", used: 1, cap: null }], new Date("2026-10-13T00:00:00Z")));
  ok(bad.level === "incident" && /^unavailable:/.test(bad.note), "unreadable cap -> incident with `unavailable:` note");
  const sorted = paceLedger([{ sku: "a", used: 1, cap: 10 }, { sku: "b", used: 9, cap: 10 }], new Date("2026-10-13T00:00:00Z"));
  ok(sorted.results[0].sku === "b", "report is sorted most-used first");
}
// 8. wiring
if (!process.argv[2]) {
  const rd = (p) => readFileSync(join(ROOT, p), "utf8");
  ok(/^node scripts\/test-spend-pacing\.mjs$/m.test(rd("scripts/guards.txt")), "test is listed in scripts/guards.txt");
  const vc = JSON.parse(rd("vercel.json"));
  const cron = vc.crons.find((c) => c.path === "/api/cron/spend-pacing");
  ok(cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule), "vercel.json has a daily /api/cron/spend-pacing cron");
  ok(cron && !["0", "30"].includes(cron.schedule.split(" ")[0]), "schedule avoids :00/:30");
  const route = rd("app/api/cron/spend-pacing/route.js");
  ok(/process\.env\.CRON_SECRET/.test(route) && /status: 401/.test(route), "route is CRON_SECRET-gated");
  ok(/jobCannotRun\(JOB/.test(route) && /jobFailed\(JOB/.test(route), "route fails loudly on absent config / unreadable ledger");
  ok(/recordPulse\(JOB/.test(route), "route records a wf_job_pulse row");
  ok(!/wf_spend_take|wf_spend_refund|takeFromLedger|method:\s*"(POST|PATCH|PUT|DELETE)"/.test(route + rd("lib/spendPacing.js")), "pacing never writes the ledger (read-only)");

  // 9. MUTATION PROOF: break the projection in a temp copy; this same test file must go red.
  const src = rd("lib/spendPacing.js");
  const target = "const projected = Math.round(perDay * n);";
  ok(src.includes(target), "mutation target present");
  const dir = mkdtempSync(join(tmpdir(), "spend-pacing-mut-"));
  const copy = join(dir, "spendPacing.js");
  writeFileSync(copy, src.replace(target, "const projected = Math.round(perDay * d);"));
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), copy], { encoding: "utf8" });
  ok(r.status !== 0, "mutation proof: a broken projection makes the pacing assertions fail (red)");
  const target2 = "if (u >= c) return { ...out, status: \"CAPPED\" };";
  ok(src.includes(target2), "mutation target 2 present");
  writeFileSync(copy, src.replace(target2, ""));
  const r2 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), copy], { encoding: "utf8" });
  ok(r2.status !== 0, "mutation proof: removing the CAPPED branch fails the suite (red)");
}

if (fails.length) {
  console.error("test-spend-pacing: FAIL");
  fails.forEach((f) => console.error("  x " + f));
  process.exit(1);
}
console.log(`test-spend-pacing: OK — ${n} assertions`);
