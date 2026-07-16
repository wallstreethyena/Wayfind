// Guardrail: the paid-search cost gate stays wired (v6.33).
// WAYFIND_GATE="shut" must suppress the paid Google searchText call on a cache
// miss (serve cache/inventory instead), and the default must still refresh from
// Google. Locks the switch so a refactor can't silently remove the kill-switch
// or, worse, leave it always-on (which would freeze the site on stale data).
import { readFileSync } from "fs";

const src = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-cost-gate: FAIL — " + m); process.exit(1); };

if (!/process\.env\.WAYFIND_GATE/.test(src)) fail("WAYFIND_GATE env switch is gone");
if (!/function gateShut\(\)/.test(src)) fail("gateShut() helper removed");

// The gate check must sit BEFORE the paid searchText fetch, so 'shut' short-
// circuits the spend.
const gateIdx = src.indexOf("if (gateShut())");
const payIdx = src.indexOf("places:searchText");
if (gateIdx < 0) fail("the gateShut() short-circuit is missing from handleSearch");
if (payIdx < 0) fail("the paid searchText call vanished — cost path unverifiable");
if (gateIdx > payIdx) fail("gateShut() short-circuit runs AFTER the paid call — it would not save spend");

// 'shut' only ever triggers on the exact string "shut" — never a truthy default,
// so an unset/typo'd value keeps the site OPEN (fetching), never accidentally
// frozen.
if (!/=== "shut"/.test(src)) fail("gate must compare to the exact string \"shut\" (fail-open safety)");

console.log("check-cost-gate: OK — WAYFIND_GATE short-circuits paid search before spend; default stays open");
