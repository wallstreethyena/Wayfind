#!/usr/bin/env node
// Diagnostic labels never relax the actual current city/entity/SKU gates.
// All provider IO, ledger grants and persistence are local fixture doubles.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offerBelongsToRequestedCity } from "../lib/partnerGeo.js";
import { isDeniedViatorSku, isViatorSearchOrHomeUrl } from "../lib/viatorIntegrity.js";
import { credential } from "../lib/envPlaceholder.js";
import { VIATOR_PROVIDER_STATES, viatorSearchOutcomeState, viatorProviderLog } from "../lib/viatorProviderState.js";

assert.equal(viatorSearchOutcomeState({ candidateCount: 0 }), "zero_candidates");
assert.equal(viatorSearchOutcomeState({ candidateCount: 1, verifiedCount: 0 }), "integrity_rejected");
assert.equal(viatorSearchOutcomeState({ candidateCount: 1, verifiedCount: 1 }), "success");
assert.deepEqual(viatorProviderLog("success", 1), { tag: "viator_provider_state", provider_state: "success", item_count: 1 });

const fixtureKey = "fixture-not-a-real-key";
const oldFetch = globalThis.fetch;
const oldLog = console.log;
const logs = [];
let qn = 0;
try {
  console.log = (line) => logs.push(line);
  globalThis.__viatorState = { grants: [], decisions: [], calls: 0, status: 200, results: [], persists: 0 };
  globalThis.__viatorFunctions = { offerBelongsToRequestedCity, isDeniedViatorSku, isViatorSearchOrHomeUrl, credential, viatorSearchOutcomeState, viatorProviderLog };
  const source = readFileSync("app/api/viator/tours/route.js", "utf8").replace(/^import[^;]+;\n/gm, "");
  const route = await import("data:text/javascript," + encodeURIComponent(`
    const { offerBelongsToRequestedCity, isDeniedViatorSku, isViatorSearchOrHomeUrl, credential, viatorSearchOutcomeState, viatorProviderLog } = globalThis.__viatorFunctions;
    const providerSpendDecision = async () => { const s = globalThis.__viatorState; const d = s.decisions.shift() || { allow: true, reason: "granted" }; s.grants.push(d); return d; };
    const getFanoutCount = async () => 0;
    const persistOffer = async () => { globalThis.__viatorState.persists++; };
    const resolveVerifiedMany = (_place, products) => products.filter((p) => p.fixtureVerified);
    ${source}
  `));
  const fixture = (n, destination = "123") => ({ productCode: `999999P${n}`, productUrl: `https://www.viator.com/tours/Fixture/Fixture/d123-999999P${n}`, title: `Fixture ${n}`, destId: destination, images: [{ variants: [{ url: "https://images.example.test/fixture.jpg", width: 640 }] }] });
  globalThis.fetch = async (url) => { assert.equal(new URL(url).hostname, "api.viator.com"); const s = globalThis.__viatorState; s.calls++; return s.status === 200 ? Response.json({ products: { results: s.results } }) : new Response("fixture failure", { status: s.status }); };
  const get = (query = `fixture${qn++}`, count = 3, mode = "city") => route.GET(new Request(`https://fixture.test/api/viator/tours?q=${query}&mode=${mode}&destId=123&count=${count}`));
  const reset = ({ results = [], status = 200, decisions = [] } = {}) => Object.assign(globalThis.__viatorState, { results, status, decisions: [...decisions], grants: [], calls: 0, persists: 0 });
  delete process.env.VIATOR_API_KEY;
  reset(); assert.equal((await (await get()).json()).provider_state, "no_key"); assert.equal(globalThis.__viatorState.calls, 0); assert.equal(globalThis.__viatorState.grants.length, 0);
  process.env.VIATOR_API_KEY = fixtureKey;
  for (const reason of ["no_cap", "gate_shut", "ledger_denied"]) {
    reset({ decisions: [{ allow: false, reason }] });
    const body = await (await get()).json(); assert.equal(body.provider_state, reason); assert.deepEqual(body.items, []); assert.equal(globalThis.__viatorState.calls, 0);
  }
  reset({ status: 503 }); assert.equal((await (await get()).json()).provider_state, "upstream_error");
  reset(); assert.equal((await (await get()).json()).provider_state, "zero_candidates");
  reset({ results: [fixture(1, "456")] });
  const wrongCity = await (await get()).json(); assert.equal(wrongCity.provider_state, "integrity_rejected"); assert.deepEqual(wrongCity.items, []); assert.equal(globalThis.__viatorState.persists, 0);
  reset({ results: [{ ...fixture(1), fixtureVerified: false }] });
  assert.equal((await (await get(undefined, 3, "place")).json()).provider_state, "integrity_rejected");
  reset({ results: [fixture(1), { ...fixture(2), productCode: "236862P2" }, { ...fixture(3), productUrl: "https://www.viator.com/searchResults/all?text=fixture" }] });
  const cachedQuery = `healthy${qn++}`;
  const healthy = await (await get(cachedQuery)).json();
  assert.equal(healthy.provider_state, "success"); assert.equal(healthy.items.length, 1, "denylisted and search-as-book products remain absent");
  assert.equal(globalThis.__viatorState.persists, 1); const previousCalls = globalThis.__viatorState.calls, previousGrants = globalThis.__viatorState.grants.length;
  assert.deepEqual(await (await get(cachedQuery)).json(), healthy, "a healthy warm cache preserves classification");
  assert.equal(globalThis.__viatorState.calls, previousCalls); assert.equal(globalThis.__viatorState.grants.length, previousGrants);
  // A pagination refusal preserves the already verified first page, obtains
  // no second provider call, and does not grant two requests from one debit.
  reset({ results: Array.from({ length: 50 }, (_, n) => fixture(n + 1)), decisions: [{ allow: true, reason: "granted" }, { allow: false, reason: "ledger_denied" }] });
  const paged = await (await get(undefined, 60)).json();
  assert.equal(paged.items.length, 50); assert.equal(paged.provider_state, "success");
  assert.equal(globalThis.__viatorState.calls, 1); assert.equal(globalThis.__viatorState.grants.length, 2);
  const stateLogs = logs.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((x) => x?.tag === "viator_provider_state");
  assert(stateLogs.length >= VIATOR_PROVIDER_STATES.length);
  assert(stateLogs.every((x) => Object.keys(x).sort().join() === "item_count,provider_state,tag"), "diagnostic logs expose neither keys, caps nor balances");
  assert(!JSON.stringify(stateLogs).includes(fixtureKey));
} finally {
  globalThis.fetch = oldFetch; console.log = oldLog;
  delete process.env.VIATOR_API_KEY;
  delete globalThis.__viatorState; delete globalThis.__viatorFunctions;
}
console.log("test-viator-provider-state: OK — all empty classes, safe logs, healthy cache, wrong-city/entity/SKU rejection and one-grant-per-pagination controls");
