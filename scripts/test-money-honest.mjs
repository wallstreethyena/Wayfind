// scripts/test-money-honest.mjs — #1 Ticketmaster attribution earns; #6 the
// "Why Wayfind picked this" block never stamps generic filler as an opinion.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
ok(/const TICKETMASTER_PARAM = \(process\.env\.NEXT_PUBLIC_TM_AFFILIATE_PARAM \|\| ""\)\.trim\(\)/.test(aff), "the TM partner param is env-driven — set it in Vercel and every TM link earns");
ok(/export function ticketOutUrl\(url\)/.test(aff) && /isTicketmasterFamily\(url\)/.test(aff), "ticketOutUrl stays the single TM helper, TM-family gated");
const d = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
ok(!d.includes("A highly reviewed nearby option with a strong rating.") && !d.includes("Worth a look while you are nearby."), "the generic FILLER fallbacks are gone — never stamped as a Wayfind opinion");
ok(/const body = why;\s*\n\s*if \(!body\) return null;/.test(d), "'Why Wayfind picked this' renders ONLY on a real grounded insight, else omits");
ok(d.includes("the Ryan's Coffee House bug"), "the brand-integrity intent is documented at the block");
console.log(`test-money-honest: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
