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

console.log(`test-foursquare: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
