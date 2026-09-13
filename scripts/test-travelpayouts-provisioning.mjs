import { readFileSync } from "node:fs";
import {
  provisionTpLinks,
  tpProvisionCandidates,
  validTpShortUrl,
} from "../lib/travelpayoutsProvisioning.js";

let assertions = 0;
const ok = (condition, message) => {
  if (!condition) throw new Error(`test-travelpayouts-provisioning: FAIL — ${message}`);
  assertions += 1;
};

const candidates = tpProvisionCandidates();
ok(candidates.length === 118, `all 118 eligible registry offers are present (got ${candidates.length})`);
ok(new Set(candidates.map((row) => row.offer_id)).size === 118, "candidate offer ids are unique");
ok(candidates.every((row) => ["tiqets", "klook", "gocity"].includes(row.provider)), "only approved providers are selected");
ok(candidates.every((row) => row.marker === "750791" && row.trs === "550160"), "every candidate uses the exact account marker and traffic source");

for (const value of ["https://tp.st/A_b-9", "https://tiqets.tp.st/abc123"]) ok(validTpShortUrl(value), `${value} is accepted`);
for (const value of [
  "http://tp.st/abc", "https://evil.com/abc", "https://a.b.tp.st/abc",
  "https://tp.st/a/b", "https://tp.st/abc?q=1", "https://u:p@tp.st/abc",
  "https://tp.st:443/abc", "https://tp.st/abc#x", "https://tp.st/",
]) ok(!validTpShortUrl(value), `${value} is rejected`);

const env = { TRAVELPAYOUTS_TOKEN: "test-token" };
const sb = { url: "https://db.example", key: "service-test-key" };
const calls = [];
let stored = [];
let apiCalls = 0;
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, init });
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, stored);
  if (url === "https://api.travelpayouts.com/links/v1/create") {
    apiCalls += 1;
    const body = JSON.parse(init.body);
    return response(200, {
      code: "success",
      result: {
        marker: body.marker,
        trs: body.trs,
        shorten: true,
        links: body.links.map(({ url }, index) => ({ url, code: "success", partner_url: `https://yandex.tp.st/NHifzZw${index}` })),
      },
    });
  }
  if (url.includes("/rest/v1/wf_tp_links?") && init.method === "POST") {
    stored = JSON.parse(init.body);
    return response(201, null);
  }
  throw new Error(`unexpected fetch ${url}`);
};

// This fixture day selects indices 1..10 of the 118-offer registry, including
// both Aquarium aliases (indices 9 and 10). Keep the actual duplicate in the
// batch so the provider deduplication assertion below is exercised.
const rotationZero = new Date("2026-07-17T00:00:00Z");
const first = await provisionTpLinks({ env, sb, fetchImpl, now: rotationZero });
ok(first.attempted === 10 && first.succeeded === 10 && first.failed === 0, "one bounded batch provisions ten offers");
ok(first.remaining === 108, "remaining count reflects successful rows");
const api = calls.find((call) => call.url.includes("api.travelpayouts.com"));
const apiBody = JSON.parse(api.init.body);
ok(api.init.headers["X-Access-Token"] === "test-token", "provider token uses the required private header");
ok(apiBody.marker === 750791 && apiBody.trs === 550160 && apiBody.shorten === true, "provider request binds the exact numeric account values");
ok(apiBody.links.length === 9 && new Set(apiBody.links.map((row) => row.url)).size === 9, "the known duplicate raw destination is sent to the provider only once");
ok(stored.length === 10 && stored.every((row) => validTpShortUrl(row.short_url)), "only validated short links are stored");
ok(calls.every((call) => call.init.cache === "no-store"), "all database and provider requests bypass caches");

const replay = await provisionTpLinks({ env, sb, fetchImpl, now: rotationZero });
ok(replay.succeeded === 10 && apiCalls === 2, "a second call advances to a different pending batch");

const completeRows = candidates.map((row, index) => ({
  ...row,
  short_url: `https://tp.st/complete_${index}`,
  verified_at: "2026-07-14T00:00:00.000Z",
  enabled: true,
}));
let completeRequests = 0;
const completeFetch = async (url, init = {}) => {
  completeRequests += 1;
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, completeRows);
  throw new Error(`a complete exact mapping set must not make another request: ${url}`);
};
const complete = await provisionTpLinks({ env, sb, fetchImpl: completeFetch, now: rotationZero });
ok(complete.attempted === 0 && complete.succeeded === 0 && complete.failed === 0 && complete.remaining === 0, "exact active mappings are reused without reprovisioning");
ok(completeRequests === 1, "a complete mapping set performs only its one database read");

const preserved = stored[0];
stored = [{ ...preserved, enabled: false }];
const withDisabled = await provisionTpLinks({ env, sb, fetchImpl, now: rotationZero });
ok(withDisabled.attempted === 10, "disabled mappings do not block other pending offers");
ok(stored.every((row) => row.offer_id !== preserved.offer_id), "a disabled mapping is never overwritten");

let poisonedWrite = false;
const poisonedFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, { code: "success", result: { marker: body.marker, trs: body.trs, shorten: true, links: body.links.map(({ url }) => ({ url, code: "success", partner_url: "https://evil.example/x" })) } });
  }
  poisonedWrite = true;
  return response(201, null);
};
const poisoned = await provisionTpLinks({ env, sb, fetchImpl: poisonedFetch, now: rotationZero });
ok(poisoned.failed === poisoned.attempted && poisoned.succeeded === 0, "a poisoned host rejects the whole bound batch");
ok(!poisonedWrite, "poisoned provider output never reaches the database");

let failedCodeWrite = false;
const failedCodeFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, { code: "success", result: { marker: body.marker, trs: body.trs, shorten: true, links: body.links.map(({ url }) => ({ url, code: "error", partner_url: "https://tp.st/NHifzZw5" })) } });
  }
  failedCodeWrite = true;
  return response(201, null);
};
const failedCode = await provisionTpLinks({ env, sb, fetchImpl: failedCodeFetch, now: rotationZero });
ok(failedCode.failed === failedCode.attempted, "a non-success per-link result rejects the batch");
ok(!failedCodeWrite, "a failed per-link result is never stored");

await provisionTpLinks({ env: {}, sb, fetchImpl }).then(
  () => ok(false, "missing token must fail"),
  (error) => ok(/TRAVELPAYOUTS_TOKEN/.test(error.message), "missing token fails loudly"),
);
await provisionTpLinks({ env, fetchImpl }).then(
  () => ok(false, "missing service database must fail"),
  (error) => ok(/Supabase service/.test(error.message), "missing service database fails loudly"),
);

const cliSource = readFileSync("scripts/provision-travelpayouts-links.mjs", "utf8");
ok(/if \(!apply\)/.test(cliSource) && /requests: 0/.test(cliSource), "CLI defaults to a zero-request dry run");
ok(/batch < 20/.test(cliSource) && /await sleep\(1000\)/.test(cliSource), "apply mode is capped and rate spaced");

console.log(`test-travelpayouts-provisioning: OK — ${assertions} assertions`);
