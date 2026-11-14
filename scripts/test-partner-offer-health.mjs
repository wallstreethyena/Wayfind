// Unit test for lib/partnerOfferHealth.js. No network.
import assert from "node:assert/strict";
import { classifyProbe, isExpiredRow, summarize, VERDICT } from "../lib/partnerOfferHealth.js";
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
console.log("partner offer health: ok");
