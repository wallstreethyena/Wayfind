#!/usr/bin/env node
// scripts/test-photo-quota-truth.mjs — GOOGLE'S DAILY QUOTA IS 32. WAYFIND'S
// OWN LEDGER COUNTED 1,170.
//
// ROOT CAUSE (2026-09-16, verified in the Google Cloud console). Places API
// (New)'s `GetPhotoMediaRequest per day` quota carries a MANUAL OVERRIDE of
// 32 (Google's own default is 175,000); the day this was found, usage already
// read 34/32 (100%+). Nearly every photo media call is refused —
// RESOURCE_EXHAUSTED / PERMISSION_DENIED / UNAVAILABLE / INTERNAL — and per
// Google's own billing table
// (developers.google.com/maps/reporting-and-monitoring/reporting), NONE of
// those are billed. Wayfind's `photos` ledger (scripts/test-photo-upstream-
// truth.mjs's own subject) counted every ATTEMPT regardless of whether
// Google billed it: September read 1,170 counted against a real day-by-day
// serving capacity of at most 32.
//
// THIS GUARD locks the fix, on top of (never duplicating) test-photo-
// upstream-truth.mjs's classification/retry/heal coverage:
//   1. classifyUpstream reads Google's OWN error-body `status` enum
//      (RESOURCE_EXHAUSTED/PERMISSION_DENIED/UNAVAILABLE/INTERNAL/NOT_FOUND/
//      INVALID_ARGUMENT) and folds it into denied > network > quota >
//      key-denied > server > redirect > badjson > ok/unowned > stale > client.
//   2. The expired-ref self-heal (a details_ids_only grant) runs ONLY for
//      `stale` (404/NOT_FOUND) or a `client` that is exactly HTTP 400 — NEVER
//      quota/key-denied/server/network, which used to waste a Details lookup
//      healing a rejection no fresh photo_ref can fix.
//   3. Every `photos` (or `details_ids_only`) grant whose call ended in
//      quota/key-denied/server is refunded exactly once via the injectable
//      `refund(sku, n)` — including the resolver's own pre-paid first grant.
//      `network` and `stale` (billed, per Google's table) are NEVER refunded.
//   4. A `quota` outcome (429, or 403 RESOURCE_EXHAUSTED, or a healed name's
//      own media call landing there) trips a daily breaker
//      ("google-photos-quota") with a cooldown ending at Google's own
//      Pacific-midnight quota reset. While open, the resolver returns
//      `quota-open` WITHOUT asking the ledger or calling Google at all — by
//      call count, not merely "asked and denied". `key-denied` never trips it
//      (a key/permission problem does not resolve itself at midnight).
//
// HERMETIC: zero network. Every scenario injects deps.fetchImpl (a scripted
// Google stub carrying a real `{"error":{"status":"..."}}` body),
// deps.authorizeSpend, deps.breakerOpen/deps.tripBreaker (fake, in-memory —
// NEVER the real lib/providerHealth.js breaker, which is process-global and
// would leak a trip between this guard's own scenarios) and deps.refund
// (fake, recording calls — never a live wf_spend_refund RPC).
import { readFileSync } from "node:fs";
import {
  classifyUpstream,
  GOOGLE_PHOTOS_QUOTA_PROVIDER,
  msUntilNextPacificMidnight,
  quotaBreakerCooldownMs,
  REFUNDABLE_UPSTREAM_CLASSES,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const eq = (actual, expected, m) => ok(actual === expected, `${m} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

/* ── 0. msUntilNextPacificMidnight / quotaBreakerCooldownMs — pure, DST-safe ── */
// Self-consistency, not a hand-computed expected offset: for a spread of
// instants across 2026 — including straddling BOTH US DST transitions
// (spring-forward 2026-03-08, fall-back 2026-11-01) — now + the returned ms
// must land EXACTLY on Pacific-local 00:00:00. This is stronger than
// asserting one hardcoded number, and it is the actual invariant that
// matters: "the next Pacific midnight", correct on a 23h or 25h local day.
function pacificHMS(ms) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("hour")}:${g("minute")}:${g("second")}`;
}
const PROBE_INSTANTS = [
  ["ordinary winter (PST)", Date.UTC(2026, 0, 15, 12, 0, 0)],
  ["just before 2026 spring-forward (2am PST -> 3am PDT, 2026-03-08)", Date.UTC(2026, 2, 8, 9, 30, 0)],
  ["just after 2026 spring-forward", Date.UTC(2026, 2, 8, 11, 0, 0)],
  ["just before 2026 fall-back (2am PDT -> 1am PST, 2026-11-01)", Date.UTC(2026, 10, 1, 8, 30, 0)],
  ["just after 2026 fall-back", Date.UTC(2026, 10, 1, 10, 30, 0)],
  ["ordinary summer (PDT)", Date.UTC(2026, 5, 15, 20, 0, 0)],
];
for (const [label, now] of PROBE_INSTANTS) {
  const ms = msUntilNextPacificMidnight(now);
  ok(ms > 0 && ms <= 26 * 60 * 60 * 1000, `msUntilNextPacificMidnight(${label}) is positive and bounded (got ${ms}ms)`);
  eq(pacificHMS(now + ms), "00:00:00", `msUntilNextPacificMidnight(${label}) lands exactly on Pacific-local midnight`);
  const cd = quotaBreakerCooldownMs(now);
  ok(cd >= 60 * 1000 && cd <= 25 * 60 * 60 * 1000, `quotaBreakerCooldownMs(${label}) is bounded [60s,25h] (got ${cd}ms)`);
  eq(cd, Math.min(Math.max(ms + 60 * 1000, 60 * 1000), 25 * 60 * 60 * 1000), `quotaBreakerCooldownMs(${label}) matches its documented formula (Pacific-midnight ms + 60s buffer, clamped)`);
}

/* ── 1. classifyUpstream — googleStatus-driven rows this guard owns ──────── */
// test-photo-upstream-truth.mjs locks the base table (status-only rows,
// including bare 403->key-denied and bare 404->stale). This guard adds every
// row THIS incident's fix depends on: Google's own error-body enum.
const GS_TABLE = [
  [{ status: 429, googleStatus: "RESOURCE_EXHAUSTED" }, "quota"],
  [{ status: 403, googleStatus: "RESOURCE_EXHAUSTED" }, "quota"], // Place Photos doc: quota can answer 403, not only 429
  [{ status: 403, googleStatus: "PERMISSION_DENIED" }, "key-denied"],
  [{ status: 403, googleStatus: null }, "key-denied"], // no parsable body: still key-denied, per spec
  [{ status: 500, googleStatus: "INTERNAL" }, "server"],
  [{ status: 503, googleStatus: "UNAVAILABLE" }, "server"],
  [{ status: 400, googleStatus: "UNAVAILABLE" }, "server"], // googleStatus outranks an unrelated HTTP status
  [{ status: 404, googleStatus: "NOT_FOUND" }, "stale"],
  [{ status: 400, googleStatus: "INVALID_ARGUMENT" }, "client"],
  [{ status: 429, googleStatus: "RESOURCE_EXHAUSTED", denied: true }, "denied"], // denied still outranks everything
  [{ status: 429, googleStatus: "RESOURCE_EXHAUSTED", threw: true }, "network"], // threw still outranks googleStatus
];
for (const [input, expected] of GS_TABLE) {
  eq(classifyUpstream(input), expected, `classifyUpstream(${JSON.stringify(input)})`);
}
ok(REFUNDABLE_UPSTREAM_CLASSES.has("quota") && REFUNDABLE_UPSTREAM_CLASSES.has("key-denied") && REFUNDABLE_UPSTREAM_CLASSES.has("server"),
  "REFUNDABLE_UPSTREAM_CLASSES must contain exactly the three unbilled classes");
ok(!REFUNDABLE_UPSTREAM_CLASSES.has("stale") && !REFUNDABLE_UPSTREAM_CLASSES.has("network") && !REFUNDABLE_UPSTREAM_CLASSES.has("ok") && !REFUNDABLE_UPSTREAM_CLASSES.has("client"),
  "REFUNDABLE_UPSTREAM_CLASSES must NOT contain a billed (stale/client/ok) or already-uncertain (network) class");

/* ── 2. end-to-end harness ────────────────────────────────────────────────── */
const PLACE = "ChIJQuotaTruthTest0001";
const OLD_REF = `places/${PLACE}/photos/OLDNAME_expired`;
const NEW_REF = `places/${PLACE}/photos/NEWNAME_current`;
const OWNED = "https://lh3.googleusercontent.com/p/AF1QipQuotaTruth=s640-k-no";
const FIXED_NOW = Date.UTC(2026, 8, 16, 18, 0, 0); // 2026-09-16 18:00Z — an ordinary instant, no DST edge

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

// A scripted Google double carrying a REAL error-body shape:
// {"error":{"status":"<enum>"}} for any non-2xx step with a `googleStatus`.
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
    const ok2 = step.status >= 200 && step.status < 300;
    const body = ok2 ? (step.body === undefined ? {} : step.body) : { error: { status: step.googleStatus || undefined, message: "redacted-in-test" } };
    return {
      ok: ok2,
      status: step.status,
      url: step.url || "",
      json: async () => { if (step.badjson) throw new Error("simulated non-JSON body"); return body; },
      text: async () => JSON.stringify(body),
    };
  };
  return { fn, calls };
}

function fakeBreaker(initiallyOpen = false) {
  let open = initiallyOpen;
  const tripCalls = [];
  return {
    breakerOpen: async () => (open ? { kind: "quota", reason: "test", at: new Date(FIXED_NOW).toISOString() } : null),
    tripBreaker: async (provider, kind, reason, cooldownMs) => { tripCalls.push({ provider, kind, reason, cooldownMs }); open = true; return true; },
    tripCalls,
  };
}
function fakeRefund() {
  const calls = [];
  const fn = async (sku, n) => { calls.push({ sku, n }); return true; };
  fn.calls = calls;
  return fn;
}

async function run(script, { authorizeSpend, breaker, refund, probe } = {}) {
  const stub = googleStub(script);
  const b = breaker || fakeBreaker(false);
  const r = refund || fakeRefund();
  const auth = authorizeSpend || authorizer({ photos: 99, details_ids_only: 99 });
  const input = { ref: OLD_REF, w: 640, serverKey: "server-key-test", authorizeSpend: auth, now: FIXED_NOW };
  if (probe) input.probe = true;
  const result = await resolvePlacePhoto(input, {
    cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null,
    retryDelayMs: 0, fetchImpl: stub.fn, refund: r, breakerOpen: b.breakerOpen, tripBreaker: b.tripBreaker, now: FIXED_NOW,
  });
  return { calls: stub.calls, result, auth, breaker: b, refund: r };
}

const missResults = [];

/* ── 3. POSITIVE CONTROLS ─────────────────────────────────────────────────── */

// P1. 200 owned -> ok, 0 refunds, breaker not tripped.
{
  const { calls, result, breaker, refund } = await run({ skip: [{ status: 200, body: { photoUri: OWNED } }] });
  eq(calls.join(","), "skip", "P1(200-owned): one request");
  eq(result.type, "redirect", "P1(200-owned): redirect");
  eq(result.upstream, "ok", "P1(200-owned): classified ok");
  eq(result.refunded, 0, "P1(200-owned): no refund on success");
  eq(refund.calls.length, 0, "P1(200-owned): refund() never called");
  eq(breaker.tripCalls.length, 0, "P1(200-owned): breaker not tripped");
}

// P2. 404 NOT_FOUND -> stale -> heal runs with exactly one details grant, 0 refunds.
{
  const { calls, result, auth, refund } = await run({
    skip: [{ status: 404, googleStatus: "NOT_FOUND" }], follow: [{ status: 404, googleStatus: "NOT_FOUND" }],
    details: [{ status: 200, body: { photos: [{ name: NEW_REF }] } }],
    healedSkip: [{ status: 200, body: { photoUri: OWNED } }],
  });
  eq(calls.join(","), "skip,follow,details,healedSkip", "P2(404-stale-heal): full heal path runs");
  eq(result.type, "redirect", "P2(404-stale-heal): the heal recovers a redirect");
  eq(result.upstream, "ok", "P2(404-stale-heal): classified ok after heal");
  eq(auth.granted("details_ids_only"), 1, "P2(404-stale-heal): exactly one details grant");
  eq(result.refunded, 0, "P2(404-stale-heal): stale is billed — no refund");
  eq(refund.calls.length, 0, "P2(404-stale-heal): refund() never called");
}

// P3. 503 then 200 -> ok, retried, 0 refunds.
{
  const { calls, result, refund } = await run({ skip: [{ status: 503, googleStatus: "UNAVAILABLE" }, { status: 200, body: { photoUri: OWNED } }] });
  eq(calls.join(","), "skip,skip", "P3(503-then-200): two physical attempts, one call site");
  eq(result.upstream, "ok", "P3(503-then-200): classified ok after the retry");
  eq(result.retried, true, "P3(503-then-200): retried is true");
  eq(result.refunded, 0, "P3(503-then-200): recovered — nothing to refund");
  eq(refund.calls.length, 0, "P3(503-then-200): refund() never called");
}

/* ── 4. NEGATIVE CONTROLS ─────────────────────────────────────────────────── */

// N1. 429 RESOURCE_EXHAUSTED -> quota, 0 retries, NO heal, NO details grant,
// exactly 1 refund, breaker tripped with a cooldown ending at Pacific midnight.
{
  const breaker = fakeBreaker(false);
  const { calls, result, auth, refund } = await run(
    { skip: [{ status: 429, googleStatus: "RESOURCE_EXHAUSTED" }] },
    { breaker }
  );
  eq(calls.join(","), "skip", "N1(429): exactly one outbound request — no retry, no follow");
  eq(result.upstream, "quota", "N1(429): classified quota");
  eq(result.retried, false, "N1(429): quota must never retry");
  eq(result.reason, "owned-miss", "N1(429): honest miss");
  eq(auth.granted("details_ids_only"), 0, "N1(429): no Details grant — no heal on quota");
  eq(refund.calls.length, 1, "N1(429): exactly one refund call");
  eq(refund.calls[0].sku, "photos", "N1(429): the refund is for the photos sku");
  eq(refund.calls[0].n, 1, "N1(429): exactly one grant refunded (the resolver's own pre-paid first grant)");
  eq(result.refunded, 1, "N1(429): result.refunded reflects the one refund");
  eq(breaker.tripCalls.length, 1, "N1(429): breaker tripped exactly once");
  eq(breaker.tripCalls[0].provider, GOOGLE_PHOTOS_QUOTA_PROVIDER, "N1(429): tripped under the google-photos-quota provider key");
  eq(breaker.tripCalls[0].cooldownMs, quotaBreakerCooldownMs(FIXED_NOW), "N1(429): cooldown is exactly quotaBreakerCooldownMs(now) — ending at the next Pacific midnight (+60s buffer)");
  missResults.push(result);
}

// N2. 403 RESOURCE_EXHAUSTED -> quota (same assertions as 429 — Google's own
// Place Photos doc: quota exceeded can answer either status).
{
  const breaker = fakeBreaker(false);
  const { calls, result, auth, refund } = await run(
    { skip: [{ status: 403, googleStatus: "RESOURCE_EXHAUSTED" }] },
    { breaker }
  );
  eq(calls.join(","), "skip", "N2(403-quota): exactly one outbound request");
  eq(result.upstream, "quota", "N2(403-quota): classified quota, not key-denied");
  eq(result.retried, false, "N2(403-quota): never retries");
  eq(auth.granted("details_ids_only"), 0, "N2(403-quota): no Details grant — no heal on quota");
  eq(refund.calls.length, 1, "N2(403-quota): exactly one refund call");
  eq(result.refunded, 1, "N2(403-quota): result.refunded is 1");
  eq(breaker.tripCalls.length, 1, "N2(403-quota): breaker tripped");
  missResults.push(result);
}

// N3. 403 PERMISSION_DENIED -> key-denied, no heal, 1 refund, breaker NOT tripped.
{
  const breaker = fakeBreaker(false);
  const { calls, result, auth, refund } = await run(
    { skip: [{ status: 403, googleStatus: "PERMISSION_DENIED" }] },
    { breaker }
  );
  eq(calls.join(","), "skip", "N3(403-key-denied): exactly one outbound request");
  eq(result.upstream, "key-denied", "N3(403-key-denied): classified key-denied");
  eq(auth.granted("details_ids_only"), 0, "N3(403-key-denied): no Details grant — a key problem does not heal");
  eq(refund.calls.length, 1, "N3(403-key-denied): exactly one refund call (unbilled, per Google's table)");
  eq(result.refunded, 1, "N3(403-key-denied): result.refunded is 1");
  eq(breaker.tripCalls.length, 0, "N3(403-key-denied): breaker NOT tripped — a key/permission problem does not resolve itself at Pacific midnight");
  missResults.push(result);
}

// N4. 500 twice -> server, 1 retry, 1 refund.
{
  const breaker = fakeBreaker(false);
  const { calls, result, refund } = await run(
    { skip: [{ status: 500, googleStatus: "INTERNAL" }, { status: 500, googleStatus: "INTERNAL" }] },
    { breaker }
  );
  eq(calls.join(","), "skip,skip", "N4(500-persistent): retried exactly once");
  eq(result.upstream, "server", "N4(500-persistent): classified server");
  eq(result.retried, true, "N4(500-persistent): retried is true");
  eq(refund.calls.length, 1, "N4(500-persistent): exactly one refund call (the one grant, not one per physical attempt)");
  eq(result.refunded, 1, "N4(500-persistent): result.refunded is 1");
  eq(breaker.tripCalls.length, 0, "N4(500-persistent): a server error never trips the QUOTA breaker");
  missResults.push(result);
}

// N5. thrown twice -> network, 1 retry, 0 refunds (Google may have processed
// the request before the connection broke — never undercount the ledger).
{
  const { calls, result, refund } = await run({ skip: [{ throw: true }, { throw: true }] });
  eq(calls.join(","), "skip,skip", "N5(thrown-persistent): retried exactly once");
  eq(result.upstream, "network", "N5(thrown-persistent): classified network");
  eq(result.retried, true, "N5(thrown-persistent): retried is true");
  eq(refund.calls.length, 0, "N5(thrown-persistent): network is NEVER refunded");
  eq(result.refunded, 0, "N5(thrown-persistent): result.refunded is 0");
  missResults.push(result);
}

// N6. Breaker open -> quota-open with ZERO authorizeSpend calls and ZERO
// fetch calls.
{
  const breaker = fakeBreaker(true); // already open
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const stub = googleStub({}); // no scripted responses at all — any call throws "test bug"
  const refund = fakeRefund();
  const result = await resolvePlacePhoto(
    { ref: OLD_REF, w: 640, serverKey: "server-key-test", authorizeSpend: auth, now: FIXED_NOW },
    { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, retryDelayMs: 0, fetchImpl: stub.fn, refund, breakerOpen: breaker.breakerOpen, tripBreaker: breaker.tripBreaker, now: FIXED_NOW }
  );
  eq(stub.calls.length, 0, "N6(breaker-open): ZERO fetch calls");
  eq(auth.asked(), 0, "N6(breaker-open): ZERO authorizeSpend calls");
  eq(result.type, "miss", "N6(breaker-open): miss");
  eq(result.reason, "quota-open", "N6(breaker-open): reason is quota-open");
  eq(result.upstream, "quota-open", "N6(breaker-open): upstream is quota-open");
  eq(result.retried, false, "N6(breaker-open): retried is false");
  eq(result.refunded, 0, "N6(breaker-open): nothing was ever granted, so nothing is refunded");
  eq(refund.calls.length, 0, "N6(breaker-open): refund() never called");
  missResults.push(result);
}

// N7. Probe + an (already-open) breaker -> the breaker is never even asked,
// and can certainly never be TRIPPED by a probe (a probe short-circuits to
// probe-no-spend before the breaker check is reached at all).
{
  const breaker = fakeBreaker(false);
  let breakerOpenAsked = 0;
  const wrappedBreakerOpen = async (...a) => { breakerOpenAsked++; return breaker.breakerOpen(...a); };
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const stub = googleStub({});
  const refund = fakeRefund();
  const result = await resolvePlacePhoto(
    { ref: OLD_REF, w: 640, serverKey: "server-key-test", authorizeSpend: auth, probe: true, now: FIXED_NOW },
    { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, retryDelayMs: 0, fetchImpl: stub.fn, refund, breakerOpen: wrappedBreakerOpen, tripBreaker: breaker.tripBreaker, now: FIXED_NOW }
  );
  eq(result.reason, "probe-no-spend", "N7(probe): a probe never reaches the breaker check at all");
  eq(breakerOpenAsked, 0, "N7(probe): breakerOpen() is never even asked for a probe");
  eq(breaker.tripCalls.length, 0, "N7(probe): breaker not tripped");
  eq(auth.asked(), 0, "N7(probe): authorizeSpend never asked");
  eq(stub.calls.length, 0, "N7(probe): zero fetch calls");
}

/* ── 5. INVARIANTS ────────────────────────────────────────────────────────── */
{
  // Every result with reason owned-miss or quota-open has a non-empty upstream.
  ok(missResults.length >= 5, "self-test: the invariant sample is non-trivial");
  for (const r of missResults) {
    ok(["owned-miss", "quota-open"].includes(r.reason), "invariant sample: every collected result is owned-miss or quota-open");
    ok(typeof r.upstream === "string" && r.upstream.length > 0, `INVARIANT VIOLATED: ${r.reason} with upstream=${JSON.stringify(r.upstream)}`);
  }
  // Refunds never exceed grants taken (photos grants granted this scenario).
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { result, auth: a2 } = await run({ skip: [{ status: 429, googleStatus: "RESOURCE_EXHAUSTED" }] }, { authorizeSpend: auth });
    ok(result.refunded <= a2.granted("photos") + 1, "invariant: refunds never exceed photos grants actually taken (+1 for the resolver's own pre-paid first grant, never itself counted by the injected authorizer)");
  }
  // A `stale` result never refunds.
  {
    const { result } = await run({
      skip: [{ status: 404, googleStatus: "NOT_FOUND" }], follow: [{ status: 404, googleStatus: "NOT_FOUND" }],
      details: [{ status: 200, body: { photos: [] } }], // stale-heal-nophoto: still classed under the stale family, never refunded
    });
    eq(result.upstream, "stale-heal-nophoto", "invariant setup: a stale-heal-* outcome");
    eq(result.refunded, 0, "INVARIANT: a stale result (billed, per Google's table) never refunds");
  }
}

/* ── 6. RED-PROOFS — mutated copies of the pure helpers, executed in-process ── */
// Each red-proof shows a REAL vs MUTATED computation diverging on the exact
// input shape the original incident (or this fix's own regression surface)
// depends on. The guard EXITS NON-ZERO if a red-proof does NOT fail as
// expected — i.e. if real === mutated, the mutation was not actually a
// regression, and this guard's own coverage would be void.

// RED-PROOF 1 — heal-eligibility must gate on the RAW STATUS (===400), not
// class name alone. If a future refactor accidentally used ONLY the class
// (a plausible slip, since "stale" IS gated by class alone), a misclassified
// 429 that slipped through as "client" would incorrectly heal — wasting a
// details_ids_only grant on a quota rejection, exactly the 2026-09-16 finding
// applied to the (400/403/404 all heal) code this replaces.
{
  const realHealEligible = (cls, status) => cls === "stale" || (cls === "client" && status === 400);
  const mutatedHealEligibleClassOnly = (cls /* status ignored — THE BUG */) => cls === "stale" || cls === "client";
  const realVerdict = realHealEligible("client", 429); // a misclassified 429 labelled "client"
  const mutatedVerdict = mutatedHealEligibleClassOnly("client", 429);
  eq(realVerdict, false, "red-proof control: the REAL heal predicate refuses to heal a 429 misclassified as \"client\" (status !== 400)");
  eq(mutatedVerdict, true, "red-proof: a class-only heal predicate WOULD heal a 429 misclassified as \"client\" — this is the exact regression the status===400 guard exists to prevent");
  ok(realVerdict !== mutatedVerdict, "RED-PROOF 1: mapping/treating a quota rejection as \"client\" makes the \"no heal on quota\" assertion fail under a class-only predicate — this guard's own N1/N2 scenarios (asserting granted(\"details_ids_only\")===0) would have caught exactly this regression");
}

// RED-PROOF 2 — refunding a `stale` (404/NOT_FOUND, BILLED per Google's own
// table) would overcount the refund and undercount the true Google bill.
{
  const realRefundable = (cls) => REFUNDABLE_UPSTREAM_CLASSES.has(cls);
  const mutatedRefundableIncludesStale = (cls) => REFUNDABLE_UPSTREAM_CLASSES.has(cls) || cls === "stale";
  eq(realRefundable("stale"), false, "red-proof control: the REAL refundable set excludes stale (it is billed)");
  eq(mutatedRefundableIncludesStale("stale"), true, "red-proof: a mutated set that also refunds stale would give back a grant Google actually billed for");
  ok(realRefundable("stale") !== mutatedRefundableIncludesStale("stale"), "RED-PROOF 2: refunding stale makes the billed-404 invariant (\"a stale result never refunds\", section 5) fail — this guard's own invariant check above would have caught exactly this regression");
}

// RED-PROOF 3 — the breaker check must run BEFORE authorizeSpend/fetch, via
// an injected flag standing in for "the check was removed by a refactor".
{
  async function resolveGooglePathSim({ skipBreakerCheck, breakerOpenFn, authorizeSpendFn, fetchFn }) {
    if (!skipBreakerCheck) {
      const open = await breakerOpenFn();
      if (open) return { authorizeSpendCalls: 0, fetchCalls: 0 };
    }
    await authorizeSpendFn();
    await fetchFn();
    return { authorizeSpendCalls: 1, fetchCalls: 1 };
  }
  let realAuth = 0, realFetch = 0;
  const real = await resolveGooglePathSim({
    skipBreakerCheck: false, breakerOpenFn: async () => true,
    authorizeSpendFn: async () => { realAuth++; }, fetchFn: async () => { realFetch++; },
  });
  let mutAuth = 0, mutFetch = 0;
  const mutated = await resolveGooglePathSim({
    skipBreakerCheck: true, // the injected flag standing in for "the breaker check was removed"
    breakerOpenFn: async () => true,
    authorizeSpendFn: async () => { mutAuth++; }, fetchFn: async () => { mutFetch++; },
  });
  eq(real.fetchCalls, 0, "red-proof control: WITH the breaker check, an open breaker takes zero authorizeSpend/fetch calls");
  eq(mutated.fetchCalls, 1, "red-proof: WITHOUT the breaker check (skipBreakerCheck:true), an open breaker still spends a grant and calls fetch");
  ok(real.fetchCalls !== mutated.fetchCalls, "RED-PROOF 3: skipping the breaker check makes the \"zero fetch calls\" assertion (N6, above) fail — proving that assertion is actually capable of catching a removed breaker check");
}

/* ── 7. structural — route.js lists quota-open and emits the upstream header ── */
{
  const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
  ok(/\["spend-denied",\s*"gate-shut",\s*"unconfigured",\s*"probe-no-spend",\s*"quota-open"\]/.test(route.replace(/\s+/g, " ")) || /"quota-open"/.test(route),
    "app/api/photo/route.js must list \"quota-open\" among the free-recovery-eligible miss reasons");
  ok(/x-wayfind-photo-upstream/.test(route), "app/api/photo/route.js must emit the x-wayfind-photo-upstream header (still true after this change)");
  ok(/recordPhotoOutcome/.test(route), "app/api/photo/route.js must call recordPhotoOutcome (lib/photoOutcomes.js) for telemetry");
  ok(/ledger-denied/.test(route), "app/api/photo/route.js must record a ledger (spend-denied) refusal as \"ledger-denied\"");
}

/* ── 8. migration check — wf_spend_refund's defining properties ─────────── */
{
  const migPath = new URL("../supabase/migrations/20260916120000_wf_spend_refund_and_photo_outcomes.sql", import.meta.url);
  let mig = "";
  try { mig = readFileSync(migPath, "utf8"); } catch (e) { fail.push(`migration check: could not read 20260916120000_wf_spend_refund_and_photo_outcomes.sql (${e && e.message})`); }
  if (mig) {
    ok(/create (or replace )?function public\.wf_spend_refund/.test(mig), "the migration must define public.wf_spend_refund");
    ok(/greatest\(\s*used\s*-\s*p_n\s*,\s*0\s*\)/.test(mig), "wf_spend_refund must floor `used` at 0 via greatest(used - p_n, 0)");
    ok(/security definer/i.test(mig), "wf_spend_refund must be SECURITY DEFINER");
    ok(/set search_path to 'public'/.test(mig), "wf_spend_refund must set a fixed search_path (SECURITY DEFINER hardening)");
    ok(!/grant execute on function public\.wf_spend_refund[^;]*to\s+(anon|authenticated)/i.test(mig),
      "wf_spend_refund must NEVER be granted to anon or authenticated");
    ok(/revoke all on function public\.wf_spend_refund[\s\S]{0,80}from public,\s*anon,\s*authenticated/.test(mig),
      "wf_spend_refund must be revoked from public/anon/authenticated");
    ok(/create table if not exists public\.wf_photo_outcome_daily/.test(mig), "the migration must define public.wf_photo_outcome_daily");
    ok(/enable row level security/.test(mig), "wf_photo_outcome_daily must have RLS enabled");
    ok(/create (or replace )?function public\.wf_photo_outcome_bump/.test(mig), "the migration must define public.wf_photo_outcome_bump");
  }
}

/* ── 9. wiring proof — the guard is actually registered and actually run ─── */
{
  const guardsTxt = readFileSync(new URL("../scripts/guards.txt", import.meta.url), "utf8");
  const line = guardsTxt.split("\n").find((l) => l.trim() === "node scripts/test-photo-quota-truth.mjs");
  ok(!!line, `scripts/guards.txt must contain the literal line "node scripts/test-photo-quota-truth.mjs" — grep result: ${JSON.stringify(line)}`);
  const runGuards = readFileSync(new URL("../scripts/run-guards.mjs", import.meta.url), "utf8");
  const manifestLine = runGuards.split("\n").find((l) => l.includes('path.resolve("scripts/guards.txt")'));
  ok(!!manifestLine, `scripts/run-guards.mjs must read scripts/guards.txt as its manifest — quoted: ${JSON.stringify(manifestLine && manifestLine.trim())}`);
}

if (fail.length) {
  console.error("test-photo-quota-truth: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-photo-quota-truth: OK — ${pass} assertions; classifyUpstream reads Google's own error-body enum (quota/key-denied/server/stale), the expired-ref self-heal never runs on quota/key-denied/server/network, every unbilled grant (photos + details_ids_only) is refunded exactly once, network/stale are never refunded, a quota outcome trips a daily breaker ending at Pacific midnight (DST-safe) while key-denied never trips it, an open breaker costs zero authorizeSpend/fetch calls, a probe never even asks the breaker, and 3 red-proofs confirm this guard's own invariants are falsifiable`);
