// Unit test for lib/partnerOfferHealth.js. No network.
import assert from "node:assert/strict";
import { classifyProbe, isExpiredRow, summarize, VERDICT, probePartnerDestination } from "../lib/partnerOfferHealth.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";

assert.equal(classifyProbe({ status: 200 }), VERDICT.OK);
assert.equal(classifyProbe({ status: 301 }), VERDICT.OK);
assert.equal(classifyProbe({ status: 404 }), VERDICT.DEAD);
assert.equal(classifyProbe({ status: 410 }), VERDICT.DEAD);
for (const s of [403, 429, 500, 503]) assert.equal(classifyProbe({ status: s }), VERDICT.UNKNOWN, `bot wall ${s} is unknown, not dead`);
assert.equal(classifyProbe({ error: { cause: { code: "ENOTFOUND" } } }), VERDICT.DEAD);
assert.equal(classifyProbe({ error: { name: "AbortError", message: "aborted" } }), VERDICT.UNKNOWN);
assert.equal(isExpiredRow({ expires: "2026-10-26" }, "2026-10-26"), false);
assert.equal(isExpiredRow({ expires: "2026-10-26" }, "2026-10-27"), true);
assert.equal(isExpiredRow({}, "2030-01-01"), false);
const s = summarize([{ verdict: "ok" }, { verdict: "unknown" }]);
assert.equal(s.failed, false, "unknown never fails the run");
assert.equal(summarize([{ verdict: "dead", id: "x" }]).failed, true);
for (const [id, row] of Object.entries(PARTNER_OFFER_REGISTRY)) {
  assert.ok(/^https:\/\//.test(row.destination), `${id} destination is https`);
  assert.ok(row.provider, `${id} has a provider`);
}
// Actual transport controls: injected DNS and fetch, no sockets or partner calls.
const lookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (status, location) => ({ status, headers: { get: () => location || null }, text: async () => "healthy merchant page" });
let calls = [];
const healthy = async (url, init) => { calls.push(url); assert.equal(init.redirect, "manual"); return response(200); };
for (const url of ["https://ticketmaster.evyy.net/c/1/2/3", "https://klook.tpx.lu/example", "https://www.gowayfind.com/api/commerce/go?p=viator&id=1", "https://merchant.example/product?irclickid=fixture"]) {
  calls = [];
  const result = await probePartnerDestination(url, { lookupImpl, fetchImpl: healthy });
  assert.equal(calls.length, 0, "an affiliate destination is never requested");
  assert.equal(classifyProbe(result), VERDICT.UNKNOWN);
  assert.equal(result.error, "affiliate-no-fetch");
}
calls = [];
const redirected = await probePartnerDestination("https://merchant.example/product", { lookupImpl, fetchImpl: async (url, init) => {
  calls.push(url); assert.equal(init.redirect, "manual");
  return response(302, "https://www.anrdoezrs.net/click-1-2");
} });
assert.deepEqual(calls, ["https://merchant.example/product"], "stop BEFORE the first affiliate redirect hop");
assert.equal(classifyProbe(redirected), VERDICT.UNKNOWN);
calls = [];
const direct = await probePartnerDestination("https://merchant.example/product", { lookupImpl, fetchImpl: healthy });
assert.deepEqual(calls, ["https://merchant.example/product"]);
assert.equal(classifyProbe(direct), VERDICT.OK, "a direct product remains probeable");
calls = [];
const moved = await probePartnerDestination("https://merchant.example/old", { lookupImpl, fetchImpl: async (url, init) => {
  calls.push(url); assert.equal(init.redirect, "manual");
  return url.endsWith("/old") ? response(302, "/product") : response(200);
} });
assert.deepEqual(calls, ["https://merchant.example/old", "https://merchant.example/product"]);
assert.equal(classifyProbe(moved), VERDICT.OK, "ordinary merchant redirects remain probeable");
for (const [code, expected] of [["EAI_AGAIN", VERDICT.UNKNOWN], ["ENOTFOUND", VERDICT.DEAD]]) {
  calls = [];
  const result = await probePartnerDestination("https://merchant.example/product", { lookupImpl: async () => { throw Object.assign(new Error(code), { code }); }, fetchImpl: healthy });
  assert.equal(calls.length, 0);
  assert.equal(classifyProbe(result), expected, "actual DNS failure preserves its meaning: " + code);
}
for (const code of ["ECONNRESET", "ETIMEDOUT", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
  const result = await probePartnerDestination("https://merchant.example/product", { lookupImpl, fetchImpl: async () => { throw new Error(code); } });
  assert.equal(classifyProbe(result), VERDICT.UNKNOWN, "network/TLS refusals are inconclusive: " + code);
}
for (const status of [404, 410]) {
  assert.equal(classifyProbe(await probePartnerDestination("https://merchant.example/gone", { lookupImpl, fetchImpl: async () => response(status) })), VERDICT.DEAD);
}
for (const url of ["https://disneyworld.disney.go.com/calendar", "http://127.0.0.1/", "https://merchant.example/private"]) {
  calls = [];
  const result = await probePartnerDestination(url, { lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }], fetchImpl: healthy });
  assert.equal(calls.length, 0, "denied or non-public destination is not fetched");
  assert.equal(classifyProbe(result), VERDICT.UNKNOWN);
}
const { readFileSync } = await import("node:fs");
const cli = readFileSync(new URL("./probe-partner-offer-registry.mjs", import.meta.url), "utf8");
assert.match(cli, /await probePartnerDestination\(row\.destination\)/, "the scheduled CLI uses the tested transport");
assert.doesNotMatch(cli, /\bfetch\(/, "the scheduled CLI has no independent unrestricted fetch");
console.log("partner offer health: ok — expiry/status, transient/permanent DNS, safe direct redirects, zero affiliate or denied-host requests");
