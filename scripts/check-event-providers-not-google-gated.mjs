// scripts/check-event-providers-not-google-gated.mjs
//
// Pins the 2026-09-17 owner rule: the Google Places spend regime must never
// silently disable a non-Google event provider again.
//
// History this guard exists to prevent repeating: TICKETMASTER_API_KEY was
// valid in Vercel for 82 days while /api/events returned zero Ticketmaster
// events in every city, because EVENT_TICKETMASTER_MONTH_CAP was unset and
// eventProviderCap() returned null -> fail closed, silently, with a health
// block that still looked green.

import { readFileSync } from "node:fs";

const fail = [];
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m, d) => { fail.push(m); console.log(`FAIL  ${m}${d ? " — " + d : ""}`); };

const src = readFileSync("lib/eventProviderSpend.js", "utf8");
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// 1. WAYFIND_GATE (the Google Places switch) must not gate event providers.
if (/gateMode\s*\(/.test(code)) {
  bad("lib/eventProviderSpend.js still calls gateMode()", "the Google Places kill switch must not disable event providers");
} else {
  ok("WAYFIND_GATE (the Google switch) does not gate event providers");
}

// 2. Every provider must carry a built-in default ceiling, so a missing env
// var can never mean "silently fetch nothing".
{
  const entries = [...code.matchAll(/(\w+):\s*\{\s*env:\s*"([A-Z_]+)",\s*sku:\s*"([a-z_]+)",\s*default:\s*(\d+)/g)];
  if (entries.length < 7) {
    bad("not every event provider declares a built-in default ceiling", `found ${entries.length}`);
  } else {
    const noDefault = entries.filter((m) => !(Number(m[4]) > 0));
    if (noDefault.length) bad("a provider's default ceiling is not a positive integer", noDefault.map((m) => m[1]).join(", "));
    else ok(`all ${entries.length} event providers carry a positive built-in default ceiling`);
  }
}

// 3. eventProviderCap must never return null/0 for a KNOWN provider, which is
// the exact shape of the 82-day silent failure. Proven by running it with the
// env deliberately cleared.
{
  const mod = await import("../lib/eventProviderSpend.js");
  const cleared = [];
  for (const id of mod.EVENT_PROVIDER_IDS) {
    const envName = "EVENT_" + id.toUpperCase() + "_MONTH_CAP";
    if (process.env[envName]) { cleared.push([envName, process.env[envName]]); delete process.env[envName]; }
  }
  const broken = mod.EVENT_PROVIDER_IDS.filter((id) => !(mod.eventProviderCap(id) > 0));
  for (const [k, v] of cleared) process.env[k] = v;
  if (broken.length) bad("eventProviderCap returns nothing for a known provider with no env var set", broken.join(", "));
  else ok("with every EVENT_*_MONTH_CAP unset, every provider still resolves a usable ceiling");
}

// 4. The ledger grant must REMAIN. This guard is about not-fail-closed, not
// about removing bounds: an unbounded retry loop against a free API still
// wedges the account on its daily rate limit.
if (/takeFromLedger\s*\(/.test(code)) ok("every provider request still takes a bounded, atomic ledger grant");
else bad("the ledger grant was removed", "requests must stay counted and bounded");

console.log("");
if (fail.length) {
  console.log(`check-event-providers-not-google-gated: ${fail.length} broken`);
  process.exit(1);
}
console.log("check-event-providers-not-google-gated: all laws hold");
