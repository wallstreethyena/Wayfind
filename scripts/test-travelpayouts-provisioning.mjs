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

for (const value of [
  "https://tp.st/A_b-9",
  "https://tiqets.tp.st/abc123",
  "https://yesim.tp.st/kn3kv29H?erid=2VtzqwiKLkx",
  // Root cause regression: the "Drive" per-brand shortener domain. Travelpayouts
  // returns links on this family for tiqets/gocity (see lib/travelpayouts.js
  // tpxHost) and the links/v1/create API echoed it back for real production
  // requests (wf_job_pulse 2026-09-22: "invalid-short-url:https.host-other...").
  // This must be accepted or every provisioning batch fails closed at 0/20.
  "https://tiqets.tpx.lu/NHifzZw0",
  "https://gocity.tpx.lu/kn3kv29H?erid=2VtzqwiKLkx",
]) ok(validTpShortUrl(value), `${value} is accepted`);
for (const value of [
  "http://tp.st/abc", "https://evil.com/abc", "https://a.b.tp.st/abc",
  "https://tp.st/a/b", "https://tp.st/abc?q=1", "https://u:p@tp.st/abc",
  "https://tp.st:443/abc", "https://tp.st/abc#x", "https://tp.st/",
  "http://tiqets.tpx.lu/abc", "https://a.b.tpx.lu/abc", "https://tpx.lu/abc",
  "https://tiqets.tpx.lu/a/b", "https://tiqets.tpx.lu/abc?q=1",
  "https://u:p@tiqets.tpx.lu/abc", "https://tiqets.tpx.lu:443/abc",
  "https://tiqets.tpx.lu/abc#x",
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
        links: body.links.map(({ url }, index) => ({ url, code: "success", partner_url: `https://yandex.tp.st/NHifzZw${index}?erid=fixture_${index}` })),
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
ok(failedCode.failed === failedCode.attempted, "an all-failed provider result rejects the batch");
ok(failedCode.reason === "provider:provider-link-failed", "provider failure reason is preserved without leaking response bodies");
ok(!failedCodeWrite, "an all-failed provider result is never stored");

let mixedStored = [];
const mixedFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, {
      code: "success",
      result: {
        marker: body.marker,
        trs: body.trs,
        shorten: true,
        links: body.links.map(({ url }, index) => index === 0
          ? { url, code: "success", partner_url: "https://tiqets.tp.st/mixed_ok?erid=fixture" }
          : (index === 1
            ? { url, code: "success", partner_url: "https://evil.example/private?token=must-not-leak" }
            : { url, code: "error", message: "You are not subscribed to this campaign" })),
      },
    });
  }
  if (url.includes("/rest/v1/wf_tp_links?") && init.method === "POST") {
    mixedStored = JSON.parse(init.body);
    return response(201, null);
  }
  throw new Error(`unexpected fetch ${url}`);
};
const mixed = await provisionTpLinks({ env, sb, fetchImpl: mixedFetch, now: rotationZero });
ok(mixed.succeeded > 0 && mixed.failed > 0, "one failed provider destination does not discard successful mappings");
ok(
  mixed.reason?.startsWith("provider:invalid-short-url:")
    && mixed.reason.includes("not-subscribed")
    && mixed.reason.includes("host-other:evil.example")
    && !mixed.reason.includes("/private")
    && !mixed.reason.includes("must-not-leak"),
  "invalid success rows name the offending registrable domain, isolated alongside known provider failures, without leaking path/query/tokens",
);
ok(mixedStored.length === mixed.succeeded && mixedStored.every((row) => validTpShortUrl(row.short_url)), "only successful validated mappings are stored from a mixed batch");

// Reproduces the production incident directly: the real links/v1/create
// response for tiqets/gocity comes back on the tpx.lu "Drive" shortener
// family, not tp.st. On the pre-fix allowlist this whole batch was rejected
// as "invalid-short-url" (0/20 in production); it must now succeed.
let tpxStored = [];
const tpxFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, {
      code: "success",
      result: {
        marker: body.marker,
        trs: body.trs,
        shorten: true,
        links: body.links.map(({ url }, index) => ({ url, code: "success", partner_url: `https://tiqets.tpx.lu/NHifzZw${index}` })),
      },
    });
  }
  if (url.includes("/rest/v1/wf_tp_links?") && init.method === "POST") {
    tpxStored = JSON.parse(init.body);
    return response(201, null);
  }
  throw new Error(`unexpected fetch ${url}`);
};
const tpx = await provisionTpLinks({ env, sb, fetchImpl: tpxFetch, now: rotationZero });
ok(tpx.attempted === 10 && tpx.succeeded === 10 && tpx.failed === 0, "a real tpx.lu Drive-shortener batch provisions successfully (was 0/20 in production before this fix)");
ok(tpxStored.length === 10 && tpxStored.every((row) => validTpShortUrl(row.short_url)), "tpx.lu short links are validated and stored");

// The tpx.lu incident above only got named because someone read the raw
// production response by hand — the pre-fix "host-other" shape gave no way
// to tell tpx.lu apart from any other unexpected host. The next unexpected
// domain must be diagnosable from the pulse note alone, without repeating
// that manual investigation, while still never leaking path, query, or
// token content from that same bad response.
let namedHostStored = [];
const namedHostFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, {
      code: "success",
      result: {
        marker: body.marker,
        trs: body.trs,
        shorten: true,
        links: body.links.map(({ url }) => ({
          url,
          code: "success",
          partner_url: "https://tracking.partner-network.example/click?erid=must-not-leak&token=secret",
        })),
      },
    });
  }
  namedHostStored.push(init);
  return response(201, null);
};
const namedHost = await provisionTpLinks({ env, sb, fetchImpl: namedHostFetch, now: rotationZero });
ok(namedHost.failed === namedHost.attempted && namedHost.succeeded === 0, "an unrecognized host still rejects the whole bound batch");
ok(
  namedHost.reason === "provider:invalid-short-url:https.host-other:partner-network.example.path-ok.query-erid-other.nohash.noport.nocreds",
  `the registrable domain that broke the allowlist is named exactly, nothing more (got ${namedHost.reason})`,
);
ok(!namedHost.reason.includes("tracking."), "the subdomain is never included, only the registrable domain");
ok(!namedHost.reason.includes("click"), "the path is never included");
ok(!namedHost.reason.includes("erid=") && !namedHost.reason.includes("secret"), "query values and tokens are never included");
ok(namedHostStored.length === 0, "an unrecognized-host failure is never written to the database");

// A host under a multi-part public suffix is a known, documented limitation
// (naive eTLD+1): it names the last two labels, not the true registrable
// domain. This still names *something* diagnosable, never leaks more than
// two labels, and must not crash.
let coUkStored = [];
const coUkFetch = async (url, init = {}) => {
  if (url.includes("/rest/v1/wf_tp_links?") && (!init.method || init.method === "GET")) return response(200, []);
  if (url.includes("api.travelpayouts.com")) {
    const body = JSON.parse(init.body);
    return response(200, {
      code: "success",
      result: {
        marker: body.marker,
        trs: body.trs,
        shorten: true,
        links: body.links.map(({ url }) => ({ url, code: "success", partner_url: "https://go.ads.example.co.uk/x" })),
      },
    });
  }
  coUkStored.push(init);
  return response(201, null);
};
const coUk = await provisionTpLinks({ env, sb, fetchImpl: coUkFetch, now: rotationZero });
ok(
  coUk.reason === "provider:invalid-short-url:https.host-other:co.uk.path-ok.query-none.nohash.noport.nocreds",
  `multi-label host names its last two labels without crashing, documented limitation and all (got ${coUk.reason})`,
);
ok(coUkStored.length === 0, "a multi-part-suffix host failure is never written to the database");

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
