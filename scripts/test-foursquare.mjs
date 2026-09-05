#!/usr/bin/env node
/**
 * test-foursquare — the provider-selection rule for BOTH Foursquare generations.
 *
 * THE INCIDENT THIS LOCKS (2026-09-04 audit). Foursquare v3 was sunset
 * 2026-05-15. Three call sites hand-rolled the same chain and two enumerated the
 * fallthrough:  `if (r.status === 401 || r.status === 403) → current API`.
 * Post-sunset v3 answers **429**, which is not in that list, so the fallthrough
 * never fired. Foursquare contributed ZERO rows for ~4 months while still
 * reporting as a configured source, leaving Google as the only paid
 * general-venue search. lib/popularity.js was fixed alone (#892) and the fix was
 * never propagated to the two HTTP routes.
 *
 * So this file asserts the RULE, not a status list, and §7 RED-PROVES it: the
 * old algorithm is re-implemented here and must FAIL the 429 case that the new
 * one passes. A control that both implementations pass would not have caught
 * this bug and is worthless as a regression lock.
 */
import { readFileSync } from "node:fs";
import {
  fsqSearch, fsqAttemptChain, isLegacyFsqKey, fsqOutcomeLabel,
  FSQ_V3_URL, FSQ_CURRENT_URL, FSQ_PLACES_API_VERSION,
} from "../lib/foursquare.js";

let n = 0, failn = 0;
const ok = (cond, msg) => { n++; if (!cond) { failn++; console.error("  ✗ " + msg); } };

const LEGACY = "fsq3LEGACYKEYEXAMPLE";
const SERVICE = "SVC_KEYEXAMPLE";
const PARAMS = "ll=27.34%2C-82.53&radius=20000&query=restaurants&limit=5";

// A scripted fetch: statusFor(url) decides each host's answer. Records call order.
function mockFetch(statusFor, body = { results: [{ fsq_place_id: "x", name: "A Place", latitude: 27.3, longitude: -82.5 }] }) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const s = statusFor(url);
    if (s === "throw") throw new Error("network down");
    return { ok: s >= 200 && s < 300, status: s, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}
const isV3 = (u) => u.startsWith(FSQ_V3_URL);

// ── 1. key generation decides the chain ─────────────────────────────────────
ok(isLegacyFsqKey(LEGACY), "an fsq3… key is recognised as legacy");
ok(!isLegacyFsqKey(SERVICE), "a service key is not legacy");
ok(JSON.stringify(fsqAttemptChain(LEGACY)) === '["v3","current"]', "legacy key: v3 may be attempted, then current");
ok(JSON.stringify(fsqAttemptChain(SERVICE)) === '["current"]', "service key goes STRAIGHT to current — no guaranteed-dead v3 round trip (#892)");
ok(fsqAttemptChain("").length === 0, "no key: no attempts at all");

// ── 2. CONTROL: v3 success (legacy key) ─────────────────────────────────────
{
  const f = mockFetch(() => 200);
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, fields: "fsq_id,name", timeoutMs: 0 });
  ok(r.ok && r.generation === "v3", "v3 success is used as-is");
  ok(f.calls.length === 1 && isV3(f.calls[0]), "…and the current API is not called when v3 answered");
  ok(r.results.length === 1, "v3 rows are returned to the caller");
}

// ── 3. CONTROLS: v3 401 / 403 / 429 must ALL fall through ───────────────────
for (const status of [401, 403, 429, 500, 503]) {
  const f = mockFetch((u) => (isV3(u) ? status : 200));
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok && r.generation === "current", `v3 ${status} FALLS THROUGH to the current Places API`);
  ok(f.calls.length === 2 && !isV3(f.calls[1]), `v3 ${status} → exactly one retry, against the current host`);
  ok((r.attempts[0] || {}).reason === "http_" + status, `v3 ${status} is recorded in attempts — the failure is observable`);
}
{ // a network throw is also not a terminator
  const f = mockFetch((u) => (isV3(u) ? "throw" : 200));
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok && r.generation === "current", "a v3 network throw falls through too — the chain is about failure, not status");
}

// ── 4. CONTROL: current API success (service key) ───────────────────────────
{
  const f = mockFetch(() => 200);
  const r = await fsqSearch(PARAMS, SERVICE, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok && r.generation === "current", "a service key succeeds on the current Places API");
  ok(f.calls.length === 1 && !isV3(f.calls[0]), "…and never touches the sunset v3 host");
}

// ── 5. CONTROL: both sources unavailable → fail soft and observable ─────────
{
  const f = mockFetch(() => 429);
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok === false, "both generations down → ok:false, never a throw");
  ok(Array.isArray(r.results) && r.results.length === 0, "…and an empty result array, so callers need no null check");
  ok(r.attempts.length === 2, "…with BOTH attempts recorded");
  ok(r.reason === "exhausted", "…and a reason naming what happened");
  ok(/v3:http_429/.test(fsqOutcomeLabel(r)) && /current:http_429/.test(fsqOutcomeLabel(r)), "the outcome label names each generation's failure — a dead source names itself");
}
{
  const r = await fsqSearch(PARAMS, "", { fetchImpl: mockFetch(() => 200), timeoutMs: 0 });
  ok(r.ok === false && r.reason === "no_key", "no key is reported as no_key, distinct from a failure");
}
{ // a 200 that will not parse is a failed attempt, not a usable one
  const f = (() => { const impl = async (u) => ({ ok: true, status: 200, json: async () => { throw new Error("bad"); } }); return impl; })();
  const r = await fsqSearch(PARAMS, SERVICE, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok === false && (r.attempts[0] || {}).reason === "bad_json", "an unparseable 200 fails soft rather than surfacing as success");
}

// ── 6. the request shapes each generation actually needs ────────────────────
{
  const f = mockFetch(() => 200);
  await fsqSearch(PARAMS, SERVICE, { fetchImpl: f, timeoutMs: 0 });
  ok(f.calls[0].startsWith(FSQ_CURRENT_URL), "current generation hits places-api.foursquare.com");
  ok(FSQ_PLACES_API_VERSION === "2025-06-17", "the current API version header is pinned");
}
{
  const f = mockFetch(() => 200);
  await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, fields: "fsq_id,name", timeoutMs: 0 });
  ok(/[?&]fields=/.test(f.calls[0]), "fields is sent to v3, which is the only generation that takes it");
  const f2 = mockFetch(() => 200);
  await fsqSearch(PARAMS, SERVICE, { fetchImpl: f2, fields: "fsq_id,name", timeoutMs: 0 });
  ok(!/[?&]fields=/.test(f2.calls[0]), "…and never to the current API, which returns the plan's fields");
}

// ── 7. RED-PROVE ────────────────────────────────────────────────────────────
// Re-implement the SHIPPED-BROKEN algorithm and require it to fail the 429 case
// that §3 just passed. If both implementations agreed, §3 would be decoration.
{
  async function oldChain(statusFor) {
    const f = mockFetch(statusFor);
    let r = await f(FSQ_V3_URL + "?" + PARAMS);
    if (r.status === 401 || r.status === 403) r = await f(FSQ_CURRENT_URL + "?" + PARAMS);
    return r.ok;
  }
  ok((await oldChain((u) => (isV3(u) ? 401 : 200))) === true, "red-prove: the old code DID handle 401");
  ok((await oldChain((u) => (isV3(u) ? 403 : 200))) === true, "red-prove: the old code DID handle 403");
  ok((await oldChain((u) => (isV3(u) ? 429 : 200))) === false,
     "RED-PROVE: the old enumerated chain FAILS on 429 — this is the four-month outage, reproduced");

  const f = mockFetch((u) => (isV3(u) ? 429 : 200));
  const now = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(now.ok === true, "…and the new rule passes the exact case the old one failed");
}

// ── 8. no call site may enumerate statuses again ────────────────────────────
// Strip comments first: this file and lib/foursquare.js both DISCUSS 401/403/429
// in prose, and a guard that fires on its own documentation is worse than none.
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const p of ["../app/api/fsq/search/route.js", "../app/api/sources/compare/route.js", "../lib/popularity.js"]) {
    const src = strip(readFileSync(new URL(p, import.meta.url), "utf8"));
    ok(!/status\s*===\s*40[13]/.test(src), `${p} does not re-enumerate a fallthrough status list`);
    ok(src.includes("foursquare.js") || src.includes("fsqSearch") || src.includes("fsqAttemptChain"),
       `${p} routes Foursquare through the shared provider rule`);
    ok(!src.includes("api.foursquare.com/v3"), `${p} does not hardcode the sunset v3 host — the rule owns it`);
  }
}

// ── 9. Foursquare failing must not trigger a compensating Google call ───────
{
  const src = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
  ok(/Promise\.all\(\[[\s\S]{0,400}searchGooglePlaces[\s\S]{0,400}fsqSearch/.test(src),
     "Google and Foursquare are dispatched in PARALLEL — Foursquare's outcome can never cause an extra Google call");
  ok(/fsqSearch\([^)]*\)[\s\S]{0,40}\.catch\(/.test(src), "…and the Foursquare leg fails soft on its own");
}

console.log(`test-foursquare: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
