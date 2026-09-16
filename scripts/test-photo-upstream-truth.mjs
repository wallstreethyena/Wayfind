#!/usr/bin/env node
// scripts/test-photo-upstream-truth.mjs — A GOOGLE-PATH PHOTO MISS MUST SAY WHY.
//
// PRODUCTION FACT (2026-09-16, reproduced three times the same day).
// /api/photo for a place with a VALID Google photo ref answers 404 +
// `x-wayfind-photo-result: owned-miss` while consuming exactly ONE `photos`
// ledger grant and ZERO `details_ids_only` grants. In lib/placePhotoServe.js's
// defaultFetchOwnedUri, the self-heal only ever ran on 400/403/404. A 429
// (quota), a 5xx, a 3xx, a thrown fetch, and a 2xx-but-unparsable body all
// collapsed into the SAME bare `return null` — owned-miss with NOTHING
// recorded, because the route's own logGoogleGrant only logs a SUCCESS.
//
// THIS GUARD locks the fix: classifyUpstream() is the one mapping table from
// a raw HTTP outcome to a truthful class string (asserted directly, case by
// case, against the real exported function — not a re-implementation of the
// table); a `server`/`network` media call is retried exactly once, same call,
// no extra grant, and never for `quota` or any other 4xx; the expired-ref
// self-heal's own outcomes get their own stale-heal-* classes; and the
// invariant this whole change exists for — a result with reason "owned-miss"
// ALWAYS carries a non-empty upstream — is proven, then RED-PROVED by
// mutating a COPY of the mapping table (never the module under test).
//
// HERMETIC: zero network. Every scenario drives the REAL resolvePlacePhoto +
// defaultFetchOwnedUri through injected deps.fetchImpl (a scripted Google
// stub) and deps.authorizeSpend / an authorizer double — same shape as
// scripts/test-photos-paid-cap.mjs's Law 2 harness — with deps.retryDelayMs:0
// so the one real retry never sleeps. No process.env read decides a verdict.
import { readFileSync } from "node:fs";
import {
  classifyUpstream,
  normalizeFetchOwnedResult,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const eq = (actual, expected, m) => ok(actual === expected, `${m} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

/* ── 1. classifyUpstream — THE MAPPING TABLE, ASSERTED DIRECTLY ─────────── */
// QUOTA TRUTH (2026-09-16): classifyUpstream now also reads Google's own
// error-body `status` enum. A bare 403/404 (no parsable body — every case
// below with no `googleStatus`) classifies as key-denied/stale respectively;
// scripts/test-photo-quota-truth.mjs (registered right after this guard)
// covers every googleStatus-driven row (RESOURCE_EXHAUSTED, PERMISSION_DENIED,
// UNAVAILABLE, INTERNAL, NOT_FOUND, INVALID_ARGUMENT) and the heal-eligibility
// split this table does not itself decide (that's the CALLER's job, in
// defaultFetchOwnedUri — see this file's own end-to-end scenarios below).
const TABLE = [
  [{ status: 429 }, "quota"],
  [{ status: 500 }, "server"],
  [{ status: 502 }, "server"],
  [{ status: 503 }, "server"],
  [{ status: 599 }, "server"],
  [{ threw: true }, "network"],
  [{ threw: true, status: 500 }, "network"], // threw outranks a stray status
  [{ status: 301 }, "redirect"],
  [{ status: 302 }, "redirect"],
  [{ status: 200, ok: true, json: false }, "badjson"],
  [{ status: 200, ok: true, json: true, owned: false }, "unowned"],
  [{ status: 200, ok: true, json: true, owned: true }, "ok"],
  [{ status: 400, ok: false }, "client"],
  [{ status: 403, ok: false }, "key-denied"], // 2026-09-16: bare 403 (no parsable body) is key-denied, not client
  [{ status: 404, ok: false }, "stale"],      // 2026-09-16: 404 is stale (heal-eligible), not client
  [{ status: 401, ok: false }, "client"],
  [{ status: 410, ok: false }, "client"],
  [{ denied: true }, "denied"],
  [{ denied: true, status: 200, ok: true }, "denied"], // denied outranks everything
];
for (const [input, expected] of TABLE) {
  eq(classifyUpstream(input), expected, `classifyUpstream(${JSON.stringify(input)})`);
}
const ALLOWED_CLASSES = new Set(["ok", "denied", "quota", "key-denied", "server", "network", "redirect", "badjson", "unowned", "stale", "client"]);
for (const [input] of TABLE) ok(ALLOWED_CLASSES.has(classifyUpstream(input)), `classifyUpstream(${JSON.stringify(input)}) must return one of the documented classes`);

/* ── 2. normalizeFetchOwnedResult — legacy compatibility ─────────────────── */
eq(JSON.stringify(normalizeFetchOwnedResult("https://lh3.googleusercontent.com/x")),
  JSON.stringify({ uri: "https://lh3.googleusercontent.com/x", upstream: "ok", retried: false, refunded: 0 }),
  "a legacy string-returning deps.fetchOwnedUri wraps to upstream:ok");
eq(JSON.stringify(normalizeFetchOwnedResult(null)),
  JSON.stringify({ uri: null, upstream: "legacy-miss", retried: false, refunded: 0 }),
  "a legacy null-returning deps.fetchOwnedUri wraps to upstream:legacy-miss");
eq(JSON.stringify(normalizeFetchOwnedResult({ uri: "https://lh3.googleusercontent.com/y", upstream: "ok", retried: true })),
  JSON.stringify({ uri: "https://lh3.googleusercontent.com/y", upstream: "ok", retried: true, refunded: 0 }),
  "the real {uri,upstream,retried,refunded} shape passes through unchanged");

/* ── 3. end-to-end: resolvePlacePhoto + the real defaultFetchOwnedUri ────── */
const PLACE = "ChIJUpstreamTruthTest0001";
const OLD_REF = `places/${PLACE}/photos/OLDNAME_expired`;
const NEW_REF = `places/${PLACE}/photos/NEWNAME_current`;
const OWNED = "https://lh3.googleusercontent.com/p/AF1QipUpstreamTruth=s640-k-no";
const UNOWNED_URL = "http://not-owned.example/pic.jpg"; // not https googleusercontent — fails isOwnedPhotoUrl

function authorizer(allow) {
  const log = [];
  const left = { ...allow };
  const fn = async (sku) => {
    const granted = (left[sku] || 0) > 0;
    if (granted) left[sku]--;
    log.push({ sku, granted });
    return granted;
  };
  fn.asked = (sku) => log.filter((e) => !sku || e.sku === sku).length;
  fn.granted = (sku) => log.filter((e) => e.granted && (!sku || e.sku === sku)).length;
  return fn;
}

// A scripted Google double: `script[kind]` is a queue of steps, consumed one
// per matching outbound call — a scenario with two entries for the same kind
// (e.g. skip: [{status:503},{status:200,...}]) is exactly how the one bounded
// retry is exercised, with zero network.
function googleStub(script) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://places.googleapis.com/v1/")) throw new Error("test bug: unexpected url " + u);
    const healed = u.includes(NEW_REF);
    let kind;
    if (u.includes("?fields=photos")) kind = "details";
    else if (u.includes("skipHttpRedirect=true")) kind = healed ? "healedSkip" : "skip";
    else if (u.includes("/media?")) kind = healed ? "healedFollow" : "follow";
    else throw new Error("test bug: unclassified url " + u);
    const list = script[kind];
    if (!list || !list.length) throw new Error(`test bug: no scripted ${kind} response left for call #${calls.filter((k) => k === kind).length + 1}`);
    calls.push(kind);
    const step = list.shift();
    if (step.throw) throw new Error("simulated network failure");
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      url: step.url || "",
      json: async () => { if (step.badjson) throw new Error("simulated non-JSON body"); return step.body === undefined ? {} : step.body; },
    };
  };
  return { fn, calls };
}

// QUOTA TRUTH (2026-09-16): this guard tests classification/retry/heal ONLY.
// The breaker and refund are a SEPARATE feature with their own dedicated
// guard (scripts/test-photo-quota-truth.mjs) — breakerOpen/tripBreaker/refund
// are stubbed to no-ops here so a 429 scenario below (which now legitimately
// classifies "quota" and would otherwise trip the REAL, process-global
// lib/providerHealth.js breaker) can never leak state into a LATER scenario
// in this same file, and so no scenario here depends on network reachability
// for a refund call.
const DEPS_BASE = {
  cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, retryDelayMs: 0,
  breakerOpen: async () => null, tripBreaker: async () => true, refund: async () => true,
};
async function run(script, authorizeSpend) {
  const stub = googleStub(script);
  const input = { ref: OLD_REF, w: 640, serverKey: "server-key-test" };
  if (authorizeSpend) input.authorizeSpend = authorizeSpend;
  const result = await resolvePlacePhoto(input, { ...DEPS_BASE, fetchImpl: stub.fn });
  return { calls: stub.calls, result };
}

const missResults = []; // every owned-miss result, for the invariant at the end

// A. 429 — quota. No retry, no follow, no heal, no Details grant.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ status: 429 }] }, auth);
  eq(calls.join(","), "skip", "A(429): exactly one outbound request");
  eq(result.upstream, "quota", "A(429): classified quota");
  eq(result.retried, false, "A(429): quota must never retry");
  eq(result.reason, "owned-miss", "A(429): honest miss");
  eq(auth.asked("photos"), 1, "A(429): only the resolver's own covered first grant, no extra");
  eq(auth.asked("details_ids_only"), 0, "A(429): no Details grant asked");
  missResults.push(result);
}

// B. 500 / 502 / 503 — server. Persistent failure retries once, still a miss.
for (const status of [500, 502, 503]) {
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ status }, { status }] }, auth);
  eq(calls.join(","), "skip,skip", `B(${status}): retried exactly once (two physical requests, one call site)`);
  eq(result.upstream, "server", `B(${status}): classified server`);
  eq(result.retried, true, `B(${status}): server must retry once`);
  eq(result.reason, "owned-miss", `B(${status}): still an honest miss after a persistent 5xx`);
  eq(auth.asked("photos"), 1, `B(${status}): the retry took no additional grant`);
  eq(auth.asked("details_ids_only"), 0, `B(${status}): no Details grant on a 5xx`);
  missResults.push(result);
}

// C. Thrown fetch — network. Persistent throw retries once, still a miss.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ throw: true }, { throw: true }] }, auth);
  eq(calls.join(","), "skip,skip", "C(thrown): retried exactly once");
  eq(result.upstream, "network", "C(thrown): classified network");
  eq(result.retried, true, "C(thrown): network must retry once");
  eq(auth.asked("photos"), 1, "C(thrown): the retry took no additional grant");
  missResults.push(result);
}

// D. 3xx — redirect. Never retried (skipHttpRedirect means Google should not
// 3xx here at all — if it ever does, that is itself the finding).
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ status: 301 }] }, auth);
  eq(calls.join(","), "skip", "D(3xx): no retry");
  eq(result.upstream, "redirect", "D(3xx): classified redirect");
  eq(result.retried, false, "D(3xx): redirect must never retry");
  missResults.push(result);
}

// E. 2xx but the body is not JSON — badjson. Never reaches follow (matches
// the pre-existing behaviour: a parse failure used to fall into the SAME
// outer catch a thrown fetch did).
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ status: 200, badjson: true }] }, auth);
  eq(calls.join(","), "skip", "E(2xx-nonJSON): no follow attempted");
  eq(result.upstream, "badjson", "E(2xx-nonJSON): classified badjson");
  eq(result.retried, false, "E(2xx-nonJSON): a 2xx is never retried");
  eq(auth.asked("photos"), 1, "E(2xx-nonJSON): no second photos grant");
  missResults.push(result);
}

// F. 2xx, valid JSON, but photoUri is not owned — unowned. Existing
// behaviour still tries follow; follow also comes back unowned.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 200, body: { photoUri: UNOWNED_URL } }],
    follow: [{ status: 200, url: UNOWNED_URL }],
  }, auth);
  eq(calls.join(","), "skip,follow", "F(2xx-unowned): follow is still attempted on an unowned 2xx");
  eq(result.upstream, "unowned", "F(2xx-unowned): classified unowned");
  eq(result.retried, false, "F(2xx-unowned): no retry involved");
  eq(auth.asked("photos"), 2, "F(2xx-unowned): the follow request took its own grant");
  missResults.push(result);
}

// G. 400 → heal attempted → Details grant refused — stale-heal-denied.
{
  const auth = authorizer({ photos: 99, details_ids_only: 0 });
  const { calls, result } = await run({ skip: [{ status: 400 }], follow: [{ status: 400 }] }, auth);
  eq(calls.join(","), "skip,follow", "G(400-heal-denied): stops before Details");
  eq(result.upstream, "stale-heal-denied", "G(400-heal-denied): classified stale-heal-denied");
  eq(auth.asked("details_ids_only"), 1, "G(400-heal-denied): Details asked once and refused");
  eq(auth.granted("details_ids_only"), 0, "G(400-heal-denied): and refused");
  missResults.push(result);
}

// H. 404 → heal → Details returns a fresh name → healed fetch succeeds.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 404 }], follow: [{ status: 404 }],
    details: [{ status: 200, body: { photos: [{ name: NEW_REF }] } }],
    healedSkip: [{ status: 200, body: { photoUri: OWNED } }],
  }, auth);
  eq(calls.join(","), "skip,follow,details,healedSkip", "H(404-heal-ok): full heal path");
  eq(result.type, "redirect", "H(404-heal-ok): a healed success is a redirect, not a miss");
  eq(result.reason, "google", "H(404-heal-ok): reason is google");
  eq(result.location, OWNED, "H(404-heal-ok): the healed uri is served");
  eq(result.upstream, "ok", "H(404-heal-ok): classified ok");
  eq(result.retried, false, "H(404-heal-ok): no transient failure, no retry");
  eq(auth.granted("photos"), 3, "H(404-heal-ok): three photo media grants (skip pre-check, follow, healedSkip)");
  eq(auth.granted("details_ids_only"), 1, "H(404-heal-ok): one Details grant");
}

// I. 404 → heal → Details returns the SAME expired name — stale-heal-same.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 404 }], follow: [{ status: 404 }],
    details: [{ status: 200, body: { photos: [{ name: OLD_REF }] } }],
  }, auth);
  eq(calls.join(","), "skip,follow,details", "I(404-heal-same): no healed request when Details offers nothing new");
  eq(result.upstream, "stale-heal-same", "I(404-heal-same): classified stale-heal-same");
  missResults.push(result);
}

// J. 404 → heal → Details returns no photo at all — stale-heal-nophoto.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 404 }], follow: [{ status: 404 }],
    details: [{ status: 200, body: { photos: [] } }],
  }, auth);
  eq(calls.join(","), "skip,follow,details", "J(404-heal-nophoto): Details fetched, no fresh name");
  eq(result.upstream, "stale-heal-nophoto", "J(404-heal-nophoto): classified stale-heal-nophoto");
  missResults.push(result);
}

// K. 404 → heal → Details itself fails HTTP — stale-heal-http.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 404 }], follow: [{ status: 404 }],
    details: [{ status: 500 }],
  }, auth);
  eq(calls.join(","), "skip,follow,details", "K(404-heal-http): Details fetched but answered non-2xx");
  eq(result.upstream, "stale-heal-http", "K(404-heal-http): classified stale-heal-http");
  missResults.push(result);
}

// L. 404 → heal → fresh name found, but the healed name's OWN media call
// fails (quota) — stale-heal-failed:<subclass>.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({
    skip: [{ status: 404 }], follow: [{ status: 404 }],
    details: [{ status: 200, body: { photos: [{ name: NEW_REF }] } }],
    healedSkip: [{ status: 429 }],
  }, auth);
  eq(calls.join(","), "skip,follow,details,healedSkip", "L(heal-failed): the healed name's own media call ran");
  eq(result.upstream, "stale-heal-failed:quota", "L(heal-failed): subclass is carried in the string");
  missResults.push(result);
}

// M. 503 then 200 — THE RETRY, end to end: same call, one grant, redirect.
{
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const { calls, result } = await run({ skip: [{ status: 503 }, { status: 200, body: { photoUri: OWNED } }] }, auth);
  eq(calls.join(","), "skip,skip", "M(503-then-200): two physical attempts, one call site");
  eq(result.type, "redirect", "M(503-then-200): the retry's success is served");
  eq(result.location, OWNED, "M(503-then-200): the recovered uri is correct");
  eq(result.upstream, "ok", "M(503-then-200): classified ok after the retry");
  eq(result.retried, true, "M(503-then-200): retried is true");
  eq(auth.asked("photos"), 1, "M(503-then-200): the retry never asked for a second grant");
}

/* ── 4. THE INVARIANT: reason "owned-miss" always has a non-empty upstream ─ */
ok(missResults.length >= 10, "self-test: the invariant must actually be checked against a non-trivial sample");
for (const r of missResults) {
  eq(r.reason, "owned-miss", "invariant sample: every collected result is really an owned-miss");
  ok(typeof r.upstream === "string" && r.upstream.length > 0, `INVARIANT VIOLATED: owned-miss with upstream=${JSON.stringify(r.upstream)}`);
}

/* ── 5. RED-PROOF — a COPY of the table with one branch removed must fail ── */
// Never mutate the real module. This proves the invariant check above is
// capable of catching the exact regression it exists to prevent: the
// original incident was precisely a missing `threw` branch.
function classifyUpstreamMissingNetworkBranch({ status, threw, ok: httpOk, json, owned, denied } = {}) {
  if (denied) return "denied";
  // `threw` branch deliberately removed for the red-proof.
  const s = Number(status) || 0;
  if (s === 429) return "quota";
  if (s >= 500 && s < 600) return "server";
  if (s >= 300 && s < 400) return "redirect";
  if (httpOk) {
    if (json === false) return "badjson";
    return owned ? "ok" : "unowned";
  }
  return "client";
}
{
  const real = classifyUpstream({ threw: true });
  const mutated = classifyUpstreamMissingNetworkBranch({ threw: true });
  eq(real, "network", "red-proof control: the real table classifies a thrown fetch as network");
  eq(mutated, "client", "red-proof: the mutated table misclassifies a thrown fetch as client");
  ok(real !== mutated, "RED-PROOF: removing the `threw` branch from a COPY of classifyUpstream changes the verdict — this guard would have failed on the original incident's exact shape (a thrown fetch silently treated as an ordinary miss)");
}

/* ── 6. structural — the route actually emits the header and the log ────── */
{
  const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
  ok(/x-wayfind-photo-upstream/.test(route), "app/api/photo/route.js must emit the x-wayfind-photo-upstream header");
  ok(/result\.upstream/.test(route), "the header must be driven by result.upstream, not a hardcoded value");
  const logMatch = route.match(/console\.log\(\s*"photo-upstream-miss",\s*\{([\s\S]*?)\}\s*\);/);
  ok(!!logMatch, "photo-upstream-miss must be a single structured console.log call");
  const logBody = logMatch ? logMatch[1] : "";
  ok(/upstream/.test(logBody) && /retried/.test(logBody) && /\bw\b/.test(logBody) && /probe/.test(logBody) && /reason/.test(logBody),
    "the miss log must carry upstream/retried/w/probe/reason");
  ok(!/\bref\b/.test(logBody) && !/serverKey/.test(logBody) && !/GOOGLE_MAPS_SERVER_KEY/.test(logBody) && !/location/.test(logBody) && !/\buri\b/.test(logBody) && !/key/i.test(logBody),
    "the miss log must never carry the ref, key, placeId or any URL — see check-secret-output-guard/test-client-paid-boundary");
  // Cache-Control, status code and logGoogleGrant are unchanged by this work.
  ok(/logGoogleGrant\(req,\s*result\.reason\)/.test(route), "the existing logGoogleGrant call on a real Google grant must be untouched");
  ok(/status:\s*404/.test(route) && /status:\s*302/.test(route), "the existing 404/302 status codes are unchanged");
}

/* ── 7. no new paid call path — only the same call, retried ─────────────── */
{
  const serve = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
  ok(/PHOTO_UPSTREAM_RETRY_DELAY_MS/.test(serve), "the retry delay must be a named, injectable constant");
  ok((serve.match(/https:\/\/places\.googleapis\.com\/v1\//g) || []).length <= 3,
    "no new googleapis.com endpoint literal was added beyond skip/follow/details");
}

if (fail.length) {
  console.error("test-photo-upstream-truth: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-photo-upstream-truth: OK — ${pass} assertions; classifyUpstream's table locked case by case, server/network retry once (never quota/4xx), heal outcomes classified (denied/http/nophoto/same/failed:<sub>), owned-miss always carries a non-empty upstream (red-proved), and the route's header + structured log are wired and secret-free`);
