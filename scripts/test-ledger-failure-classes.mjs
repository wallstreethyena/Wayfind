// scripts/test-ledger-failure-classes.mjs
// `ledger-denied` hid four different failures (cap reached / RPC http error /
// timeout / unconfigured). Oct 9-13: 41-92 a day with 3,303 of a 10,000 cap
// used. This EXECUTES takeFromLedgerDetailed against a stubbed global fetch for
// every reason, then runs resolvePlacePhoto with a detailed authorizer and
// asserts the class the route would record. No retry is allowed: each case
// asserts exactly ONE fetch call.
import { takeFromLedgerDetailed, takeFromLedger } from "../lib/spendGate.js";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { ledgerOutcomeClass } from "../lib/photoOutcomes.js";
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("test-ledger-failure-classes: FAIL - " + m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); pass++; };

const realFetch = globalThis.fetch;
// Hermetic: never READ the shell's Supabase env (check-guard-hermeticity). Start from a known-empty baseline and restore to it.
const saved = { u: undefined, n: undefined, k: undefined };
for (const k of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const restoreEnv = () => {
  for (const [k, v] of [["SUPABASE_URL", saved.u], ["NEXT_PUBLIC_SUPABASE_URL", saved.n], ["SUPABASE_SERVICE_ROLE_KEY", saved.k]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};
const configure = () => { process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; delete process.env.NEXT_PUBLIC_SUPABASE_URL; };

let calls = 0;
const stub = (impl) => { calls = 0; globalThis.fetch = (...a) => { calls++; return impl(...a); }; };
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

try {
  configure();
  const cases = [
    ["granted", () => jsonRes(200, true), true, "granted"],
    ["cap", () => jsonRes(200, false), false, "cap"],
    ["http 503", () => jsonRes(503, null), false, "http"],
    ["http 429", () => jsonRes(429, null), false, "http"],
    ["fetch throws", () => { throw new TypeError("fetch failed"); }, false, "http"],
    ["non-boolean body", () => jsonRes(200, { code: "PGRST" }), false, "http"],
    ["null body", () => jsonRes(200, null), false, "http"],
    ["timeout (aborting fetch)", (_u, init) => new Promise((_res, rej) => {
      init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
    }), false, "timeout"],
  ];
  for (const [name, impl, ok, reason] of cases) {
    // The real 3s timer is used for the timeout case; shorten it by faking setTimeout only for that call.
    const realST = globalThis.setTimeout;
    if (reason === "timeout") globalThis.setTimeout = (fn, ms, ...r) => realST(fn, ms === 3000 ? 5 : ms, ...r);
    stub(impl);
    const r = await takeFromLedgerDetailed("photos", 10000);
    globalThis.setTimeout = realST;
    eq(r.ok, ok, `${name}: ok`);
    eq(r.reason, reason, `${name}: reason`);
    eq(calls, 1, `${name}: exactly one fetch (NO retry - a timed-out take may already have counted)`);
    stub(impl);
    const realST2 = globalThis.setTimeout;
    if (reason === "timeout") globalThis.setTimeout = (fn, ms, ...r2) => realST2(fn, ms === 3000 ? 5 : ms, ...r2);
    eq(await takeFromLedger("photos", 10000), ok, `${name}: boolean takeFromLedger wrapper unchanged`);
    globalThis.setTimeout = realST2;
  }

  // invalid sku / cap: never reaches the network
  stub(() => jsonRes(200, true));
  eq((await takeFromLedgerDetailed("BAD SKU!", 10)).reason, "invalid", "bad sku is invalid");
  eq((await takeFromLedgerDetailed("photos", 0)).reason, "invalid", "zero cap is invalid");
  eq((await takeFromLedgerDetailed("photos", NaN)).reason, "invalid", "NaN cap is invalid");
  eq(calls, 0, "invalid input makes no network call");

  // unconfigured
  delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  stub(() => jsonRes(200, true));
  const u = await takeFromLedgerDetailed("photos", 10000);
  eq(u.reason, "unconfigured", "no Supabase env is unconfigured");
  eq(u.ok, false, "unconfigured is not ok");
  eq(calls, 0, "unconfigured makes no network call");
} finally {
  globalThis.fetch = realFetch;
  restoreEnv();
}

// End to end: resolver carries ledgerReason; the route's mapper turns it into the recorded class.
const REF = "places/ChIJQuotaTruthTest0001/photos/OLDNAME_expired";
const resolveWith = async (authorizeSpend) => resolvePlacePhoto(
  { ref: REF, w: 640, serverKey: "server-key-test", authorizeSpend, googleSurface: true },
  { inventoryGet: async () => null, retryDelayMs: 0, fetchImpl: async () => { throw new Error("must not reach Google"); }, breakerOpen: async () => null, tripBreaker: async () => {} },
);
const recorded = {};
for (const reason of ["cap", "timeout", "http", "unconfigured", "invalid"]) {
  const r = await resolveWith(async () => ({ ok: false, reason }));
  eq(r.reason, "spend-denied", `e2e ${reason}: resolver says spend-denied`);
  eq(r.ledgerReason, reason, `e2e ${reason}: ledgerReason threaded through`);
  recorded[reason] = ledgerOutcomeClass(r.ledgerReason);
}
eq(recorded.cap, "ledger-cap", "cap records ledger-cap");
eq(recorded.timeout, "ledger-timeout", "timeout records ledger-timeout");
eq(recorded.http, "ledger-http", "http records ledger-http");
eq(recorded.unconfigured, "ledger-unconfigured", "unconfigured records ledger-unconfigured");
eq(recorded.invalid, "ledger-unconfigured", "invalid records ledger-unconfigured");
// A boolean authorizer (legacy) keeps its behavior and the legacy class.
const legacy = await resolveWith(async () => false);
eq(legacy.reason, "spend-denied", "boolean false authorizer still spend-denied");
eq(ledgerOutcomeClass(legacy.ledgerReason), "ledger-denied", "no reason keeps the legacy class");
const thrown = await resolveWith(async () => { throw new Error("boom"); });
eq(ledgerOutcomeClass(thrown.ledgerReason), "ledger-http", "an authorizer that throws is an operational failure, not budget");
for (const c of Object.values(recorded)) eq(/^[a-z0-9:_-]{1,40}$/.test(c), true, `class ${c} satisfies the wf_photo_outcome_daily CHECK`);

// The route must use the detailed grant and the mapper, and only the cap records denied-ceiling.
const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8")
  .replace(/\/\/[^\n]*/g, "");
eq(/spendAllowPhotosDetailed\(\)/.test(route), true, "route authorizes photos with spendAllowPhotosDetailed()");
eq(/ledgerOutcomeClass\(result\.ledgerReason\)/.test(route), true, "route maps result.ledgerReason to the recorded class");
eq(/ledgerOutcomeClass\(result\.ledgerReason\) === "ledger-cap"[\s\S]{0,80}recordPhotoDeniedCeiling/.test(route), true, "denied-ceiling is recorded only for a true cap");

// Deliberate skips are NOT ledger failures (2026-10-14): the route refuses the paid take when a
// free photo exists or the gate is shut, and says so by name instead of a bare `false`.
const freeSkip = await resolveWith(async () => ({ ok: false, reason: "free-photo" }));
eq(ledgerOutcomeClass(freeSkip.ledgerReason), "free-photo-preferred", "free photo exists -> free-photo-preferred, not a ledger failure");
const shutSkip = await resolveWith(async () => ({ ok: false, reason: "shut" }));
eq(ledgerOutcomeClass(shutSkip.ledgerReason), "gate-shut", "gate shut -> gate-shut");
eq(/\{ ok: false, reason: "shut" \}/.test(route) && /\{ ok: false, reason: "free-photo" \}/.test(route), true, "route's authorizer returns the named refusals");
eq(/if \(shut\) return false;|\&\& free\) return false;/.test(route), false, "route no longer returns a bare false for a deliberate skip");
const { classifyOutcome } = await import("./lib/photoInventoryAudit.mjs");
eq(classifyOutcome("free-photo-preferred"), "ok", "free photo served counts as served");
eq(classifyOutcome("gate-shut"), "operational", "gate-shut stays visible");
eq(classifyOutcome("ledger-cap"), "operational", "cap stays operational");
const alerts = readFileSync(new URL("../lib/commandCenter/alerts.js", import.meta.url), "utf8");
eq(/free-photo-preferred|gate-shut/.test(alerts.replace(/\/\/[^\n]*/g, "")), false, "alerts never count deliberate skips as refusals");

console.log(`test-ledger-failure-classes: OK - ${pass} assertions (cap/granted/timeout/http 503+429/throw/non-boolean/unconfigured/invalid executed with stubbed fetch, one call each; resolver->class end to end)`);
