// scripts/test-money-honest.mjs — #1 Ticketmaster attribution earns; #6 the
// "Why Wayfind picked this" block never stamps generic filler as an opinion.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
// #294's query-param approach is RETIRED — Ticketmaster monetizes via the Impact
// redirect (ticketmaster.evyy.net), not an appended param. Guard the correction so it
// can't silently regress back to the unattributed param-append.
ok(!/NEXT_PUBLIC_TM_AFFILIATE_PARAM/.test(aff), "the retired param-append approach is GONE — no NEXT_PUBLIC_TM_AFFILIATE_PARAM");
ok(aff.includes("ticketmaster.evyy.net") && aff.includes("7475855"), "the Impact redirect host + WayfindLLC SID 7475855 are baked in");
ok(/export function tmImpactLink\(destUrl, subId\)/.test(aff), "tmImpactLink is the single Impact redirect builder");
ok(/export function ticketOutUrl\(url, subId\)/.test(aff) && /isTicketmasterFamily\(url\)/.test(aff), "ticketOutUrl routes TM-family clicks through the Impact redirect");
// Behavioral guard: a real Ticketmaster destination MUST come out as an evyy.net
// redirect carrying the SID — never a bare ticketmaster.com link — and a non-TM
// provider MUST pass through untouched (no foreign tracker on a competitor's link).
const { ticketOutUrl, tmImpactLink } = await import("../lib/affiliates.js");
const tm = ticketOutUrl("https://www.ticketmaster.com/event/abc123", "ranking");
ok(/^https:\/\/ticketmaster\.evyy\.net\/c\/7475855\//.test(tm), "a TM link becomes an evyy.net/c/7475855 redirect — never a bare ticketmaster.com link");
ok(tm.includes("u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2Fabc123") && tm.includes("subId1=ranking"), "the destination is URL-encoded in `u` and subId1 flows to Impact");
ok(ticketOutUrl("https://www.ticketmaster.com/event/x").includes("evyy.net") && !ticketOutUrl("https://seatgeek.com/e/x").includes("evyy.net"), "TM-family earns; non-TM (SeatGeek) passes through clean");
ok(tmImpactLink("https://concerts.livenation.com/x").includes("evyy.net"), "Live Nation (TM-family) also routes through the Impact redirect");
const d = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
ok(!d.includes("A highly reviewed nearby option with a strong rating.") && !d.includes("Worth a look while you are nearby."), "the generic FILLER fallbacks are gone — never stamped as a Wayfind opinion");
ok(/const body = why;\s*\n\s*if \(!body\) return null;/.test(d), "'Why Wayfind picked this' renders ONLY on a real grounded insight, else omits");
ok(d.includes("the Ryan's Coffee House bug"), "the brand-integrity intent is documented at the block");
console.log(`test-money-honest: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
