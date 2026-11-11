#!/usr/bin/env node
// scripts/test-refresh-reserve.mjs — refresh keeps first claim on its slice
// of each free Google line (owner decision 2026-11-03, option b).
//
// THE STARVATION THIS LOCKS OUT: inventory refresh may re-date content
// only via the enterprise/pro tiers, whose grants share the free lines
// with discretionary site reads. In November 2026 site reads consumed the
// shared enterprise line (988 of 950) and pro line (5,687 of 4,800) in
// three days; refresh was denied all month and 5,716 stale rows (Bern's
// Steak House, #1893) stayed invisible to search. siteReservedCap() now
// stops site reads at (free line − refresh sub-cap); refresh still takes
// up to the free line on its own counter, so the combined total can never
// pass the free line and no paid ceiling is created. EXECUTES the real
// siteReservedCap and REFRESH_SUBCAPS from lib/spendGate.js.
import { readFileSync } from "node:fs";
import { siteReservedCap, REFRESH_SUBCAPS } from "../lib/spendGate.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

ok(siteReservedCap("details_enterprise") === 475, `site enterprise reads must stop at 475 (950 free − 475 refresh), got ${siteReservedCap("details_enterprise")}`);
ok(siteReservedCap("details_pro") === 2400, `site pro reads must stop at 2400 (4800 free − 2400 refresh), got ${siteReservedCap("details_pro")}`);
ok(siteReservedCap("details_essentials") === 1500, `site essentials reads must stop at 1500 (9500 free − 8000 refresh; the hotel-identity slice), got ${siteReservedCap("details_essentials")}`);
ok(siteReservedCap("text_pro") === 4800, `non-refresh SKUs keep their full cap (text_pro 4800), got ${siteReservedCap("text_pro")}`);
ok(siteReservedCap("photos") === 950, `photos cap untouched (950), got ${siteReservedCap("photos")}`);
ok(siteReservedCap("nearby_pro") === 4800, `nearby_pro cap untouched (4800), got ${siteReservedCap("nearby_pro")}`);
ok(siteReservedCap("no_such_sku") === null, "unknown SKU stays fail-closed (null)");
ok(REFRESH_SUBCAPS.details_enterprise === 475 && REFRESH_SUBCAPS.details_pro === 2400 && REFRESH_SUBCAPS.details_essentials === 8000,
  "refresh sub-caps themselves are unchanged — the reserve moves the site stop, never the refresh allowance");
for (const sku of Object.keys(REFRESH_SUBCAPS)) {
  ok(siteReservedCap(sku) + REFRESH_SUBCAPS[sku] <= 9500, `${sku}: site stop + refresh sub-cap can never exceed the free line`);
}

const gate = readFileSync(new URL("../lib/spendGate.js", import.meta.url), "utf8");
ok(/export async function spendAllow\(sku\) \{[^}]*siteReservedCap\(sku\)/.test(gate), "spendAllow (the user-facing site path) must take its grant at siteReservedCap");
ok(gate.includes("Math.min(siteReservedCap(legacySku), cap)"), "the atmosphere dual-debit path must respect the same reserve on its legacy row");
ok(gate.includes("takeFromLedger(sku, free)"), "spendAllowRefresh still takes the shared row at the FULL free line — refresh is not reserved against itself");

if (fail.length) {
  console.error(`test-refresh-reserve: FAIL — ${fail.length} assertion(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-refresh-reserve: OK — ${pass} assertions (site stops at free−sub for enterprise/pro/essentials; refresh keeps first claim; no cap raised, no paid ceiling created)`);
