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
import { execFileSync } from "node:child_process";
import {
  fsqSearch, fsqAttemptChain, isLegacyFsqKey, fsqOutcomeLabel, validateFsqPayload,
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
  // This scenario's current-generation 429 is a real (fixture) breaker trip —
  // see §11. Clear it immediately so it cannot leak into every section below
  // that expects a real network call against a closed breaker.
  const { resetBreaker } = await import("../lib/providerHealth.js");
  await resetBreaker("foursquare");
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

// ── 5b. THE SUBTLE ONE: a valid EMPTY 200 is a real answer ─────────────────
// Without this, "usable response" quietly becomes "response containing at least
// one place", and every quiet query in a sparse area buys a second provider
// request it did not need.
{
  const f = mockFetch(() => 200, { results: [] });
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(r.ok === true, "a 200 with results:[] is a SUCCESSFUL attempt, not a failure");
  ok(r.results.length === 0, "…carrying zero results");
  ok(r.empty === true, "…flagged as legitimately empty, distinct from unavailable");
  ok(f.calls.length === 1, "…and NO second Foursquare request is bought (this is the quota leak the naive rule would create)");
  ok(r.attempts.length === 1 && r.attempts[0].reason === "ok", "…recorded as one successful attempt");
}

// ── 5c. a 200 that is not a recognisable shape is NOT an empty answer ──────
{
  const f = mockFetch(() => 200, { error: "quota exceeded" });      // no results array
  const r = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f, timeoutMs: 0 });
  ok(f.calls.length === 2, "a 200 with no results ARRAY advances the chain rather than reporting zero rows");
  ok((r.attempts[0] || {}).reason === "malformed", "…and names itself 'malformed', not 'ok'");
  const f2 = mockFetch((u) => (isV3(u) ? 200 : 200), { error: "x" });
  const r2 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f2, timeoutMs: 0 });
  ok(r2.ok === false, "…both generations malformed fails soft rather than claiming an empty area");
}

// ── 5d. "malformed" means: fails the generation's DOCUMENTED contract ──────
{
  const cases = [
    ["an error envelope", { message: "quota exceeded" }, false],
    ["a renamed collection", { venues: [{ name: "x" }] }, false],
    ["results not an array", { results: { name: "x" } }, false],
    ["a bare array body", [{ name: "x" }], false],
    ["results of primitives", { results: ["nope"] }, false],
    ["a legacy v3 place", { results: [{ fsq_id: "a", name: "A" }] }, true],
    ["a current-API place", { results: [{ fsq_place_id: "b", name: "B" }] }, true],
    ["a legitimately empty answer", { results: [] }, true],
  ];
  for (const [label, body, shouldBeValid] of cases) {
    const v = validateFsqPayload("current", body);
    ok(v.valid === shouldBeValid, `contract: ${label} -> ${shouldBeValid ? "valid" : "MALFORMED"}`);
  }
  ok(validateFsqPayload("current", { results: [] }).empty === true, "…and only the empty-array case is flagged empty");
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

// ── 9. BEHAVIOURAL: Foursquare failing must not cause an extra Google call ──
// Not a regex on lib/sources.js — the REAL module is imported (only the
// third-party Maps SDK is stubbed; searchPlaces reaches Google through
// fetch("/api/places/search"), lib/google.js:531) and every outbound request is
// trapped. If any future edit turns a Foursquare failure into compensating
// Google spend, the trap throws and this guard goes red.
//
// RED-PROVED 2026-09-04: a copy of lib/sources.js with a compensating call
// injected ("if the merged pool is empty, re-query Google at 2x radius")
// measured 1 Google request on the success path and 2 on the Foursquare-failure
// path. The equality assertion below therefore discriminates — it is not
// satisfied vacuously by both counts being zero, which is what the
// `okRun.google >= 1` sanity line guards against.
{
  // These are CLIENT modules: lib/sources.js:109 returns [] when `window` is
  // undefined. Supplying that environment is a fixture, not a stub — no
  // Wayfind logic is replaced.
  const HAD_WINDOW = "window" in globalThis, PREV_WINDOW = globalThis.window;
  const HAD_LS = "localStorage" in globalThis, PREV_LS = globalThis.localStorage;
  globalThis.window = { location: { origin: "https://gowayfind.com" } };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const { register } = await import("node:module");
  register("./lib/nodeResolveHook.mjs", import.meta.url);
  const sources = await import("../lib/sources.js");

  const GOOGLE_ROWS = { places: [{ id: "g1", name: "Google Venue", lat: 27.34, lng: -82.53, rating: 4.5, reviews: 200, types: ["restaurant"] }] };
  const FSQ_ROWS = { places: [{ id: "fsq:1", name: "Fsq Venue", lat: 27.341, lng: -82.531, rating: 4.2, reviews: 90, types: ["restaurant"], src: "fsq" }] };

  async function run(fsqBehaviour) {
    let google = 0, fsq = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (/^https?:\/\//.test(u)) throw new Error("TRAP: an EXTERNAL host was contacted from the client path: " + u);
      if (u.includes("/api/places/search")) { google++; return { ok: true, json: async () => GOOGLE_ROWS }; }
      if (u.includes("/api/fsq/search")) { fsq++; return fsqBehaviour(); }
      return { ok: true, json: async () => ({}) }; // other internal endpoints, uncounted
    };
    try {
      await sources.searchPlaces("food", null, { lat: 27.3364, lng: -82.5307 }, 20000, "all", "");
    } catch (e) {
      if (/^TRAP:/.test(e.message)) throw e;
    } finally { globalThis.fetch = orig; }
    return { google, fsq };
  }

  const okRun   = await run(() => ({ ok: true,  json: async () => FSQ_ROWS }));
  const failRun = await run(() => ({ ok: false, status: 500, json: async () => ({}) }));
  const emptyRun= await run(() => ({ ok: true,  json: async () => ({ places: [] }) }));

  // POSITIVE CONTROL, exact not merely non-zero: three scenarios all reporting
  // zero would satisfy an equality assertion while proving nothing.
  ok(okRun.google === 1, "positive control: the Google leg is called EXACTLY once on the success path");
  ok(failRun.google === okRun.google,
     "BEHAVIOURAL: a Foursquare FAILURE produces the SAME number of Google requests — no compensating spend");
  ok(emptyRun.google === okRun.google,
     "BEHAVIOURAL: a Foursquare EMPTY result produces the same number of Google requests either");
  ok(failRun.fsq === 1 && emptyRun.fsq === 1, "…and the client never retries Foursquare itself on failure or emptiness");

  // HYGIENE: hand the process back exactly as we found it, so this section
  // cannot leak a fake `window` into any assertion that runs after it.
  if (HAD_WINDOW) globalThis.window = PREV_WINDOW; else delete globalThis.window;
  if (HAD_LS) globalThis.localStorage = PREV_LS; else delete globalThis.localStorage;
  ok(!("window" in globalThis), "harness hygiene: the fake window global is removed after the run");
}

// ── 10. the probe is operator-only, Bearer-only, and uncacheable ───────────
// Behavioural: the route's REAL GET handler runs. A secret in a query string
// leaks into access logs, browser history, proxies, Referer headers and copied
// links, so ?key= is NOT accepted here even though other routes in this repo
// still take it (recorded in docs/audits/FINDING-query-string-secrets.md).
//
// HERMETIC BY CONSTRUCTION: each case runs in a CHILD PROCESS with an env built
// from scratch, never inherited. This file therefore never reads the ambient
// shell — the pattern check-guard-hermeticity.mjs requires, and the same one
// scripts/check-monetized-degrade.mjs uses. A guard that consults the shell
// answers differently in a clean terminal than in a sourced one.
{
  const SECRET = "test-cron-secret-value";
  const FSQ_KEY = "test-fsq-key-value";

  const CHILD = `
    import { register } from "node:module";
    register(${JSON.stringify(new URL("./lib/nodeResolveHook.mjs", import.meta.url).href)}, import.meta.url);
    const route = await import(${JSON.stringify(new URL("../app/api/fsq/search/route.js", import.meta.url).href)});
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [{ fsq_place_id: "p1", name: "Probe Venue", rating: 8 }] }) });
    const qs = process.env.__QS || "";
    const headers = process.env.__AUTH ? { authorization: process.env.__AUTH } : {};
    const res = await route.GET(new Request("https://gowayfind.com/api/fsq/search?probe=1" + qs, { headers }));
    let body = ""; try { body = JSON.stringify(await res.json()); } catch (e) {}
    console.log(JSON.stringify({ status: res.status, cache: res.headers.get("cache-control"), body }));
  `;

  const probeCase = (env) => {
    // The child's env is built from NOTHING — this file never reads the ambient
    // shell, so its verdict cannot change between a clean terminal and one with
    // .env.production.local sourced. node is invoked by absolute path
    // (process.execPath), so no PATH is needed.
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD], { env: { NODE_ENV: "test", ...env }, encoding: "utf8", timeout: 25000, stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(out.trim().split("\n").pop());
  };

  const WITH_KEY = { FOURSQUARE_API_KEY: FSQ_KEY };

  ok(probeCase({ ...WITH_KEY, __AUTH: "Bearer " + SECRET }).status === 401,
     "no CRON_SECRET configured -> 401 (fails CLOSED, never opens)");
  ok(probeCase({ ...WITH_KEY, CRON_SECRET: SECRET }).status === 401,
     "secret configured but NO authorization header -> 401");
  ok(probeCase({ ...WITH_KEY, CRON_SECRET: SECRET, __AUTH: "Bearer wrong-value" }).status === 401,
     "wrong Bearer -> 401");
  ok(probeCase({ ...WITH_KEY, CRON_SECRET: SECRET, __AUTH: SECRET }).status === 401,
     "a bare secret without the Bearer scheme -> 401");
  ok(probeCase({ ...WITH_KEY, CRON_SECRET: SECRET, __QS: "&key=" + SECRET }).status === 401,
     "QUERY-STRING secret alone -> 401 (secrets do not belong in URLs)");

  const good = probeCase({ ...WITH_KEY, CRON_SECRET: SECRET, __AUTH: "Bearer " + SECRET });
  ok(good.status === 200, "correct Bearer -> the probe executes");
  ok(good.cache === "no-store", "an authorised probe response is no-store");
  ok(probeCase({ ...WITH_KEY, CRON_SECRET: SECRET }).cache === "no-store", "…and so is the 401");

  ok(!good.body.includes(FSQ_KEY), "the probe body never contains the Foursquare credential");
  ok(!good.body.includes(SECRET), "the probe body never contains CRON_SECRET");
  ok(!/authorization/i.test(good.body), "the probe body never echoes an authorization header");
  ok(/"generation"|"outcome"|"attempts"/.test(good.body), "…while still reporting generation/outcome/attempts");

  // the probe's query is fixed: a caller cannot widen it into a consumption endpoint
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = strip(readFileSync(new URL("../app/api/fsq/search/route.js", import.meta.url), "utf8"));
  const branch = src.slice(src.indexOf('probe") === "1"'), src.indexOf("const q = "));
  ok(/PROBE_QUERY/.test(branch) && !/searchParams\.get\((?!"probe")/.test(branch), "the probe uses a FIXED bounded query and reads no caller parameters");
  ok(!/searchParams\.get\("key"\)/.test(src), "the route accepts no query-string secret anywhere");
}

// ── 11. THE QUOTA/BILLING BREAKER ───────────────────────────────────────────
// THE INCIDENT THIS LOCKS (2026-09-06). §7 above proved this file's own
// routing fix — merged as #1118 — closes the dead-v3-fallback bug. Production
// deployed it and STILL measured 0 results: wf_job_pulse showed the fetcher in
// lib/popularity.js (already on the fixed key-prefix chain since #892, so
// immune to the #1118 bug) taking http_429 on ALL ~30 calls/run for 3+
// continuous days at unchanged volume. A bad key returns 401 (verified by
// call), so #1118 fixed a REAL bug that was never the incident's actual cause:
// the CURRENT, non-sunset, correctly-routed Places API is itself
// quota/plan-exhausted. No code makes an exhausted account answer — what code
// CAN do is stop re-discovering the same 429 at full request cost and make the
// discovery loud instead of silent. That is this section.
//
// CHILD PROCESS, HERMETIC BY CONSTRUCTION: the breaker is process-global state
// (lib/serverCache's in-memory tier), so every fixture here needs a scenario
// that could otherwise poison every fsqSearch() call for the rest of THIS
// file. One clean, from-scratch env per case — never the ambient shell
// (check-guard-hermeticity) — is what makes that safe.
{
  const FSQ_MOD = JSON.stringify(new URL("../lib/foursquare.js", import.meta.url).href);
  const PH_MOD = JSON.stringify(new URL("../lib/providerHealth.js", import.meta.url).href);
  const CHILD = `
    import { fsqSearch } from ${FSQ_MOD};
    import { breakerOpen, resetBreaker } from ${PH_MOD};
    const PARAMS = "ll=27.34%2C-82.53&radius=20000&query=restaurants&limit=5";
    const LEGACY = "fsq3LEGACYKEYEXAMPLE";
    const isV3 = (u) => u.startsWith(${JSON.stringify(FSQ_V3_URL)});
    function mockFetch(statusFor) {
      const calls = [];
      const impl = async (url) => { calls.push(url); const s = statusFor(url);
        return { ok: s >= 200 && s < 300, status: s, json: async () => ({ results: [] }) }; };
      impl.calls = calls; return impl;
    }
    const out = {};

    out.closedByDefault = (await breakerOpen("foursquare")) === null;

    // a) BOTH generations 429 -> exhausted -> the breaker TRIPS on current's status.
    const f1 = mockFetch(() => 429);
    const r1 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f1, timeoutMs: 0 });
    out.tripCalls = f1.calls.length;
    out.tripReason = r1.reason;
    const held1 = await breakerOpen("foursquare");
    out.trippedKind = held1 && held1.kind;
    out.trippedNamesCurrent = !!(held1 && /current/i.test(held1.reason || ""));

    // b) breaker now OPEN: the very next call must cost ZERO network requests.
    const f2 = mockFetch(() => 200);
    const r2 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f2, timeoutMs: 0 });
    out.skippedCalls = f2.calls.length;
    out.skippedReason = r2.reason;
    out.skippedOk = r2.ok;
    out.skippedResultsIsArray = Array.isArray(r2.results) && r2.results.length === 0;

    await resetBreaker("foursquare");
    out.closedAfterReset = (await breakerOpen("foursquare")) === null;

    // c) v3 429 alone, CURRENT SUCCEEDS -> must NOT trip. v3 is permanently
    // gone post-sunset; its 429 proves nothing about account quota.
    const f3 = mockFetch((u) => (isV3(u) ? 429 : 200));
    const r3 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f3, timeoutMs: 0 });
    out.v3okRun = r3.ok && r3.generation === "current";
    out.closedAfterV3Only429 = (await breakerOpen("foursquare")) === null;

    // d) both generations down, but the LAST (current) failure is a 500, not
    // 429 -> a transient error must stay retryable, never trip the breaker.
    const f4 = mockFetch(() => 500);
    const r4 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f4, timeoutMs: 0 });
    out.exhausted500 = r4.reason === "exhausted";
    out.closedAfter500 = (await breakerOpen("foursquare")) === null;

    // e) after a real reset, normal chain execution resumes (proves the skip
    // in (b) was the breaker, not something else silently short-circuiting).
    const f5 = mockFetch(() => 200);
    const r5 = await fsqSearch(PARAMS, LEGACY, { fetchImpl: f5, timeoutMs: 0 });
    out.resumesAfterReset = f5.calls.length === 1 && r5.ok === true;

    console.log(JSON.stringify(out));
  `;
  const R = JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", CHILD], { env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 30000 })
      .trim().split("\n").pop()
  );

  ok(R.closedByDefault === true, "the foursquare breaker starts closed — nothing is blocked until a real failure earns it");
  ok(R.tripCalls === 2, "the tripping scenario still makes both real attempts — this is a discovery run, not a skip");
  ok(R.tripReason === "exhausted", "…exhausted, same as before the breaker existed (§5) — the RETURN SHAPE is unchanged");
  ok(R.trippedKind === "quota", "a current-generation 429 trips the breaker as 'quota' (Foursquare's 429 body carries no recognisable text, so this is a deliberate provider-specific override — the same one app/api/events/route.js already applies for OpenWebNinja, not a guess)");
  ok(R.trippedNamesCurrent === true, "…and the stored reason names the CURRENT generation specifically, so an operator reading the breaker knows what actually failed");

  ok(R.skippedCalls === 0, "BUDGET: once tripped, the very next call makes ZERO network requests — this is the entire point, not merely detection");
  ok(R.skippedReason === "breaker_open", "…reported as breaker_open, distinct from 'exhausted' — a human (or job-watch) can tell 'known dead' from 'just failed'");
  ok(R.skippedOk === false, "a skipped call is still ok:false — callers need no new branch to handle it");
  ok(R.skippedResultsIsArray === true, "…and still an empty array, never null — the no-network path returns the SAME shape as the network path");

  ok(R.closedAfterReset === true, "resetBreaker (the SAME operator tool already wired for anthropic) clears the foursquare breaker too");

  ok(R.v3okRun === true, "v3 429 + current success still succeeds normally (unchanged from §3)");
  ok(R.closedAfterV3Only429 === true, "NEGATIVE CONTROL: v3's 429 alone — with current answering fine — must NOT trip the breaker. v3 is permanently gone post-sunset regardless of account health; tripping on its status would arm the breaker on every legacy-key call whether or not the account can serve anything");

  ok(R.exhausted500 === true, "a 500 on current still exhausts the chain (unchanged from §5's shape)");
  ok(R.closedAfter500 === true, "NEGATIVE CONTROL: a plain 500 does not trip the breaker — a transient server error must stay retryable, exactly like providerHealth's own 'a plain rate-limit 429 does NOT classify' control");

  ok(R.resumesAfterReset === true, "after resetBreaker, the very next call reaches the network again — proves (b)'s zero calls was the breaker, not an unrelated fixture bug");
}

// ── 12. the breaker is reachable by an operator, and it is the SHARED one ──
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fsq = strip(readFileSync(new URL("../lib/foursquare.js", import.meta.url), "utf8"));
  const pop = strip(readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8"));
  const reset = readFileSync(new URL("../app/api/cron/breaker-reset/route.js", import.meta.url), "utf8");

  ok(fsq.includes('from "./providerHealth.js"'), "lib/foursquare.js's breaker is lib/providerHealth's — one mechanism, not a second parallel one (the exact hand-rolled-breaker mistake check-dead-provider-parked.mjs already forbids for OpenWebNinja)");
  ok(pop.includes('from "./providerHealth.js"'), "lib/popularity.js's fetcher wires the SAME shared breaker, not a private copy — the drift class this whole incident is about");
  ok(fsq.includes("FSQ_BREAKER") && pop.includes("FSQ_BREAKER"), "both callers key the breaker with the SAME exported constant — a typo'd literal in either would silently create two unrelated breakers");

  const breakerCheckIdx = fsq.indexOf("breakerOpen(FSQ_BREAKER)");
  const firstFetchIdx = fsq.indexOf("doFetch(url");
  ok(breakerCheckIdx > -1 && firstFetchIdx > -1 && breakerCheckIdx < firstFetchIdx,
     "the breaker is consulted BEFORE the outbound call in fsqSearch — an open breaker costs zero requests, not one");

  ok(/KNOWN_PROVIDERS\s*=\s*new Set\(\[[^\]]*"foursquare"[^\]]*\]\)/.test(reset),
     "an operator can clear the foursquare breaker early via /api/cron/breaker-reset — without this, fixing the account's quota still leaves the app blind for the full cooldown");
}

console.log(`test-foursquare: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
