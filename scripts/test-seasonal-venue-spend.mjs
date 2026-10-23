#!/usr/bin/env node
// The October 2026 seasonal venue script may ask the ledger for a higher
// ceiling. Every other caller stays on the free-tier caps. Dates are passed
// in, so this stays green after the month ends.
import assert from "node:assert/strict";
import { ledgerMonth } from "../lib/photoCoverage.js";
import {
  effectiveCap, gateMode, seasonalVenueOctoberCap, spendAllow, spendAllowCapped,
  spendAllowSeasonalVenue, utcLedgerMonth, SEASONAL_VENUE_DETAILS_PRO_REACHED,
  SEASONAL_VENUE_OCTOBER_2026_EXTRA,
} from "../lib/spendGate.js";

const OCT = new Date("2026-10-20T15:00:00Z");
const NOV = new Date("2026-11-01T00:00:00Z");
const SEP = new Date("2026-09-30T23:59:59Z");
const OCT_OPEN = new Date("2026-10-01T00:00:00Z");
const ET_STILL_OCT_BUT_UTC_NOV = new Date("2026-10-31T22:00:00-04:00");

let checks = 0;
const eq = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  checks++;
};

for (const when of [OCT, OCT_OPEN, SEP, NOV, ET_STILL_OCT_BUT_UTC_NOV]) {
  eq(utcLedgerMonth(when), ledgerMonth(when), "seasonal month key matches the ledger");
}
eq(ledgerMonth(OCT), "2026-10", "20 Oct 2026 UTC is the allowance month");
eq(ledgerMonth(OCT_OPEN), "2026-10", "the UTC first instant of October is still October");
eq(ledgerMonth(SEP), "2026-09", "the last UTC second of September is September");
eq(ledgerMonth(NOV), "2026-11", "1 Nov 2026 UTC is after the allowance");
eq(ledgerMonth(ET_STILL_OCT_BUT_UTC_NOV), "2026-11", "ledger month follows UTC, not Eastern");

eq(SEASONAL_VENUE_OCTOBER_2026_EXTRA.text_pro, 130, "text_pro extra is the script bill cap");
eq(SEASONAL_VENUE_OCTOBER_2026_EXTRA.details_enterprise, 62, "enterprise extra is one pass of 62 venues");
eq(SEASONAL_VENUE_OCTOBER_2026_EXTRA.details_pro, 62, "pro extra is one pass of 62 venues");
eq(SEASONAL_VENUE_DETAILS_PRO_REACHED, 6650, "details_pro extra sits on the promote-paid row, not 4,800");

eq(seasonalVenueOctoberCap("text_pro", OCT), 4930, "text_pro ceiling is 4,800 + 130");
eq(seasonalVenueOctoberCap("details_enterprise", OCT), 1012, "enterprise ceiling is 950 + 62");
eq(seasonalVenueOctoberCap("details_pro", OCT), 6712, "details_pro ceiling is 6,650 + 62");
eq(4930 < 5000, true, "text_pro headroom stays inside Google's 5,000 free calls");
eq(1012 - 1000, 12, "enterprise headroom can bill only the 12 calls past 1,000");
eq(6712 - 6650, 62, "details_pro headroom is 62 calls past the row already reached");

for (const sku of ["photos", "nearby_pro", "autocomplete", "text_enterprise", "geocoding"]) {
  eq(seasonalVenueOctoberCap(sku, OCT), null, `${sku} gets no October extra`);
}
for (const sku of ["text_pro", "details_enterprise", "details_pro"]) {
  eq(seasonalVenueOctoberCap(sku, NOV), null, `${sku} extra is gone in November`);
  eq(seasonalVenueOctoberCap(sku, SEP), null, `${sku} extra does not apply in September`);
  eq(seasonalVenueOctoberCap(sku, ET_STILL_OCT_BUT_UTC_NOV), null, `${sku} extra follows the UTC ledger month`);
}

const KEYS = ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
function setEnv(values) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = String(value);
}
const savedFetch = globalThis.fetch;
try {
  setEnv({ SUPABASE_URL: "https://ledger.test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-key", WAYFIND_GATE: "shut" });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("shut must not reach the ledger"); };
  eq(await spendAllowSeasonalVenue("text_pro", OCT), false, "shut denies the seasonal allowance");
  eq(calls, 0, "shut makes no ledger call");

  const asks = [];
  globalThis.fetch = async (url, init) => {
    asks.push(JSON.parse(init.body));
    assert.match(String(url), /\/rest\/v1\/rpc\/wf_spend_take$/);
    return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
  };
  for (const mode of ["free", "open"]) {
    asks.length = 0;
    setEnv({
      WAYFIND_GATE: mode,
      WAYFIND_PROMOTE_PAID: "1",
      PROMOTE_DETAILS_MONTH_CAP: "9000",
      SUPABASE_URL: "https://ledger.test.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    });
    eq(await spendAllowSeasonalVenue("text_pro", OCT), true, `${mode}: seasonal text_pro grant`);
    eq(await spendAllow("text_pro"), true, `${mode}: ordinary text_pro grant still exists`);
    eq(await spendAllowCapped("details_pro", 7500), true, `${mode}: ordinary details_pro grant still exists`);
    eq(await spendAllowCapped("details_enterprise", 7500), true, `${mode}: ordinary enterprise grant still exists`);
    eq(asks[0].p_sku, "text_pro");
    eq(asks[0].p_cap, 4930, `${mode}: seasonal script asks for 4,930, not the promote dial`);
    eq(asks[1].p_cap, 4800, `${mode}: spendAllow(text_pro) stays 4,800`);
    eq(asks[2].p_cap, 9000, `${mode}: spendAllowCapped(details_pro) still uses the promote dial`);
    const enterpriseCap = mode === "free" ? 950 : 7500;
    eq(asks[3].p_cap, enterpriseCap, `${mode}: spendAllowCapped(details_enterprise) is unchanged`);
    eq(effectiveCap("text_pro", 99999), mode === "free" ? 4800 : 99999, `${mode}: effectiveCap ignores the seasonal extra`);
    eq(effectiveCap("details_pro", 7500), 9000, `${mode}: details_pro effective cap stays on the promote dial`);
    eq(effectiveCap("details_enterprise", 7500), enterpriseCap, `${mode}: enterprise effective cap ignores the seasonal extra`);
  }
  asks.length = 0;
  setEnv({
    WAYFIND_GATE: "free",
    WAYFIND_PROMOTE_PAID: "1",
    PROMOTE_DETAILS_MONTH_CAP: "9000",
    SUPABASE_URL: "https://ledger.test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
  });
  eq(await spendAllowSeasonalVenue("details_enterprise", OCT), true);
  eq(asks.at(-1).p_cap, 1012, "seasonal enterprise asks for 1,012");
  eq(await spendAllowSeasonalVenue("details_pro", OCT), true);
  eq(asks.at(-1).p_cap, 6712, "seasonal details_pro asks for 6,712 even if the promote dial is higher");
  eq(await spendAllowSeasonalVenue("photos", OCT), false, "a SKU outside the allowance is refused");
  eq(asks.at(-1).p_sku, "details_pro", "refusing photos does not take a grant");
  const beforeNovember = asks.length;
  eq(await spendAllowSeasonalVenue("text_pro", NOV), false, "November does not take the raised ceiling");
  eq(asks.length, beforeNovember, "November makes no ledger call");
  eq(gateMode(), "free", "positive control: the gate is still free");
} finally {
  globalThis.fetch = savedFetch;
  setEnv({});
}

console.log(`test-seasonal-venue-spend: ${checks} assertions passed (max extra if every grant is used: $1.294)`);
