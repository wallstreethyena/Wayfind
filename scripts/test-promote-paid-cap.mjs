#!/usr/bin/env node
// Hermetic proof for the promotion-only paid allowance (owner decision 2026-09-28).
//
// Executed against lib/spendGate.js itself, never its source text:
//   1. WAYFIND_PROMOTE_PAID=1 + PROMOTE_DETAILS_MONTH_CAP raise the ceiling
//      effectiveCap/spendAllowCapped ask the ledger for on details_pro ONLY.
//   2. Every other SKU asks for exactly the same number with the switch on as
//      with it off, in every gate mode, and spendAllow() (the user-facing
//      /api/places/details path) is unchanged for details_pro too.
//   3. "shut" still means zero; a half-set switch changes nothing.
//   4. The number the grant sends to wf_spend_take is the paid cap (fetch stubbed).
import {
  effectiveCap, promotePaidCap, promotePaidEnabled, spendAllow, spendAllowCapped, PROMOTE_PAID_SKU,
} from "../lib/spendGate.js";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("promote-paid-cap: FAIL — " + m); } };
const eq = (a, e, m) => ok(a === e, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`);

const KEYS = ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GEOCODING_MONTH_CAP", "GOOGLE_TEXT_ENTERPRISE_MONTH_CAP"];
const savedFetch = globalThis.fetch;
function setEnv(v) { for (const k of KEYS) delete process.env[k]; for (const [k, x] of Object.entries(v)) process.env[k] = String(x); }

const SKUS = ["text_pro", "details_enterprise", "details_pro", "photos", "nearby_pro", "details_ids_only", "autocomplete", "text_ids_only", "details_essentials", "geocoding", "text_enterprise"];
const MONTH_CAP = 7500;
const PAID = 6650;

eq(PROMOTE_PAID_SKU, "details_pro", "the paid switch targets the promotion SKU");

for (const mode of ["free", "open"]) {
  setEnv({ WAYFIND_GATE: mode });
  const off = Object.fromEntries(SKUS.map((s) => [s, effectiveCap(s, MONTH_CAP)]));
  setEnv({ WAYFIND_GATE: mode, WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: PAID });
  ok(promotePaidEnabled(), `${mode}: switch reads as enabled`);
  eq(promotePaidCap(), PAID, `${mode}: paid cap read from env`);
  for (const s of SKUS) {
    const on = effectiveCap(s, MONTH_CAP);
    if (s === "details_pro") eq(on, PAID, `${mode}: details_pro ceiling becomes the paid cap`);
    else eq(on, off[s], `${mode}: ${s} ceiling unchanged by the promotion switch`);
  }
}

// Positive control: without the switch, free mode clamps details_pro to the free tier.
setEnv({ WAYFIND_GATE: "free" });
eq(effectiveCap("details_pro", MONTH_CAP), 4800, "free mode without the switch still clamps to 4,800");

// Shut and half-set switches change nothing.
setEnv({ WAYFIND_GATE: "shut", WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: PAID });
eq(effectiveCap("details_pro", MONTH_CAP), null, "shut means zero even with the switch on");
ok(!promotePaidEnabled(), "shut disables the switch");
for (const env of [{ WAYFIND_PROMOTE_PAID: "1" }, { PROMOTE_DETAILS_MONTH_CAP: PAID }, { WAYFIND_PROMOTE_PAID: "true", PROMOTE_DETAILS_MONTH_CAP: PAID }, { WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: "0" }, { WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: "lots" }]) {
  setEnv({ WAYFIND_GATE: "free", ...env });
  eq(effectiveCap("details_pro", MONTH_CAP), 4800, `half-set switch ${JSON.stringify(env)} changes nothing`);
}

// The actual grant: spendAllowCapped sends the paid cap to wf_spend_take;
// spendAllow (user-facing details) still sends the fixed 4,800.
const sent = [];
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response("true", { status: 200, headers: { "content-type": "application/json" } }); };
setEnv({ WAYFIND_GATE: "free", WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: PAID, SUPABASE_URL: "https://stub.test", SUPABASE_SERVICE_ROLE_KEY: "stub" });
await spendAllowCapped("details_pro", MONTH_CAP);
await spendAllow("details_pro");
await spendAllowCapped("details_enterprise", MONTH_CAP);
globalThis.fetch = savedFetch;
const caps = sent.map((b) => b.p_cap ?? b.cap ?? Object.values(b).find((v) => typeof v === "number"));
eq(sent.length, 3, "three ledger grants were requested");
eq(caps[0], PAID, "promotion grant asks the ledger for the paid cap");
eq(caps[1], 4800, "user-facing spendAllow(details_pro) still asks for the free-tier 4,800");
eq(caps[2], 950, "details_enterprise promotion grant still clamps to its free tier");

setEnv({});
if (failures) { console.error(`promote-paid-cap: ${failures} failure(s)`); process.exit(1); }
console.log(`promote-paid-cap: OK — ${SKUS.length} SKUs x 2 modes compared on/off, shut + 5 half-set switches, 3 stubbed ledger grants`);
