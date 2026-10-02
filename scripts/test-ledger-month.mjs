#!/usr/bin/env node
// scripts/test-ledger-month.mjs — every reader of public.wf_spend_ledger keys
// the month in UTC, the same key wf_spend_take / wf_spend_refund write.
//
// Found 2026-10-01 while verifying the October photo-budget rollover:
// app/api/health/photos built its ledger month from siteTodayStr() (Eastern).
// From 00:00 to 04:00 UTC on the 1st (8pm-midnight ET on the 30th/31st) that
// named LAST month's exhausted row while grants were already landing on the new
// month's row, so the operator health report said "exhausted" during exactly
// the window someone checks whether the budget has reset.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ledgerMonth } from "../lib/photoCoverage.js";
import { siteTodayStr } from "../lib/siteTime.js";

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };

// 1. The helper, by CALL, across the rollover window.
const justAfterUtcRollover = new Date("2026-10-01T02:00:00Z");
ok(siteTodayStr(justAfterUtcRollover).slice(0, 7) === "2026-09", "positive control: at 02:00 UTC on Oct 1 the Eastern date is still September (the window is real)");
ok(ledgerMonth(justAfterUtcRollover) === "2026-10", "ledgerMonth at 02:00 UTC on Oct 1 is 2026-10, matching the ledger's UTC key");
ok(ledgerMonth(new Date("2026-09-30T23:59:59Z")) === "2026-09", "the last UTC second of September is still September");
ok(ledgerMonth(new Date("2026-12-31T23:30:00-05:00")) === "2027-01", "a New Year's Eve 11:30pm ET read is already January in the ledger");
ok(ledgerMonth("2026-10-15T12:00:00Z") === "2026-10", "accepts an ISO string");

// 2. Every in-app ledger reader that filters by month uses the helper
//    (route + worker). Comments stripped so explanatory prose cannot satisfy it.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
for (const file of ["app/api/health/photos/route.js", "lib/photoRepair.js"]) {
  const src = strip(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  ok(/wf_spend_ledger/.test(src), `${file} reads wf_spend_ledger (positive control)`);
  ok(/\bconst month = ledgerMonth\(\);/.test(src), `${file} keys the ledger month with ledgerMonth()`);
  ok(!/siteTodayStr\(\)\.slice\(0,\s*7\)|today\.slice\(0,\s*7\)/.test(src), `${file} never derives the ledger month from the Eastern site date`);
}

console.log(`test-ledger-month: OK — ${n} assertions; the spend-ledger month is UTC everywhere it is read (health report included)`);
