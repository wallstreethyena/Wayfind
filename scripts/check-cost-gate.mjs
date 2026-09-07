// Guardrail: the paid-search cost gate stays wired (v6.33).
// WAYFIND_GATE="shut" must suppress the paid Google searchText call on a cache
// miss (serve cache/inventory instead). Unset or misspelled configuration must
// also fail closed; an explicit open mode still needs a finite ledger grant.
import { readFileSync } from "fs";

const src = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-cost-gate: FAIL — " + m); process.exit(1); };

if (!/import \{[^}]*gateShut[^}]*spendAllowCapped[^}]*textEnterpriseCap[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/spendGate"/.test(src)) fail("shared fail-closed gate imports are missing");

// The gate check must sit BEFORE the paid searchText fetch, so 'shut' short-
// circuits the spend.
const gateIdx = src.indexOf("if (gateShut())");
const payIdx = src.indexOf("places:searchText");
if (gateIdx < 0) fail("the gateShut() short-circuit is missing from handleSearch");
if (payIdx < 0) fail("the paid searchText call vanished — cost path unverifiable");
if (gateIdx > payIdx) fail("gateShut() short-circuit runs AFTER the paid call — it would not save spend");

if (!/spendAllowCapped\("text_enterprise", textEnterpriseCap\(\)\)/.test(src)) fail("rich Text Search is not behind its explicit finite ledger cap");

console.log("check-cost-gate: OK — paid search is fail-closed and every enabled mode is ledger-backed");
