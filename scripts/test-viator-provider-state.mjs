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
  assert.equal(globalThis.__viatorState.persists, 0, "a city match has no place association"); const previousCalls = globalThis.__viatorState.calls, previousGrants = globalThis.__viatorState.grants.length;
  assert.deepEqual(await (await get(cachedQuery)).json(), healthy, "a healthy warm cache preserves classification");
  assert.equal(globalThis.__viatorState.calls, previousCalls); assert.equal(globalThis.__viatorState.grants.length, previousGrants);
  reset({ results: [{ ...fixture(1), fixtureVerified: true }] });
  assert.equal((await (await get(undefined, 3, "place")).json()).items.length, 1);
  assert.equal(globalThis.__viatorState.persists, 1, "venue matches still reach the writer");
  // A pagination refusal preserves the already verified first page, obtains
  // no second provider call, and does not grant two requests from one debit.
  reset({ results: Array.from({ length: 50 }, (_, n) => fixture(n + 1)), decisions: [{ allow: true, reason: "granted" }, { allow: false, reason: "ledger_denied" }] });
  const paged = await (await get(undefined, 60)).json();
  assert.equal(paged.items.length, 50); assert.equal(paged.provider_state, "success");
  assert.equal(globalThis.__viatorState.calls, 1); assert.equal(globalThis.__viatorState.grants.length, 2);
  // Exercise the actual PostgREST writer with a sanitized in-memory DB.
  const { persistOffer, suppressOffer } = await import("../lib/verifiedOfferStore.js");
  // This standalone fixture runs in its own Node process. Set and clear
  // every credential it uses without importing values from the shell.
  const oldWarn = console.warn;
  const warnings = [], lookups = [];
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  let posts = 0;
  try {
    console.warn = (s) => warnings.push(JSON.parse(s));
    process.env.SUPABASE_URL = "https://db.fixture.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = fixtureKey;
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    await db.exec(readFileSync("supabase/migrations/20260909144500_wf_verified_offers.sql", "utf8"));
    const canonical = "venue-fixture-1";
    const sample = { ...fixture(1), placeId: canonical, placeName: " Fixture  VENUE ", region: "Florida", confidence: 0.9, status: "live", verifiedAt: "2026-11-12T09:00:00Z" };
    globalThis.fetch = async (input, init) => {
      const u = new URL(input);
      assert.equal(u.origin, "https://db.fixture.test");
      if (u.pathname === "/rest/v1/wf_inventory") {
        const id = u.searchParams.get("place_id");
        lookups.push(id);
        if (id === "eq.db-unavailable") return new Response(null, {status:503});
        assert.equal(u.searchParams.get("select"), "place_id,name");
        return Response.json(id === "eq." + canonical ? [{ place_id: canonical, name: "Fixture venue" }] : []);
      }
      assert.equal(u.pathname, "/rest/v1/verified_offers");
      if (init.method === "PATCH") {
        assert.equal(init.headers.Prefer, "return=representation");
        assert.equal(u.searchParams.get("select"), "place_id,product_provider,product_code");
        const key = ["place_id","product_provider","product_code"].map(k => u.searchParams.get(k).slice(3));
        const changed = await db.query("update verified_offers set status=$4 where place_id=$1 and product_provider=$2 and product_code=$3 returning place_id,product_provider,product_code", [...key, JSON.parse(init.body).status]);
        return Response.json(changed.rows);
      }
      assert.equal(init.method, "POST");
      assert.equal(u.searchParams.get("on_conflict"), "place_id,product_provider,product_code");
      assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
      const row = JSON.parse(init.body);
      assert.equal(row.place_id, canonical); assert.equal(row.confidence, 0.9);
      assert.equal(row.place_name, "Fixture venue");
      const columns = ["place_id","place_name","region","kind","product_provider","product_code","product_url","commissionable","bookable_now","confidence","evidence","status","verified_at","expires_at"];
      assert.deepEqual(Object.keys(row).sort(), [...columns].sort());
      await db.query(`insert into verified_offers (${columns}) select ${columns} from jsonb_populate_record(null::verified_offers,$1::jsonb) on conflict(place_id,product_provider,product_code) do update set confidence=excluded.confidence`, [JSON.stringify(row)]);
      posts++;
      return new Response(null, {status:201});
    };
    const cache = new Map();
    assert.deepEqual(await Promise.all([persistOffer(sample, cache), persistOffer(sample, cache)]), [true, true]);
    assert.equal(posts, 2); assert.equal((await db.query("select count(*)::int n from verified_offers")).rows[0].n, 1); assert.equal(lookups.length, 1);
    assert.equal(await persistOffer({ ...sample, placeName: "Different venue" }, cache), false, "a valid ID cannot borrow a match for another venue");
    assert.equal(lookups.length, 1, "batch shares inventory only, not a name verdict");
    assert.equal(await suppressOffer(canonical, "viator", "not-in-db"), false, "zero changed rows are not success");
    assert.equal(await suppressOffer(canonical, "viator", sample.productCode), true);
    assert.equal((await db.query("select status from verified_offers")).rows[0].status,"suppressed");
    for (const placeId of [undefined, " ", "q:untrusted title", "unmapped-external-id", "db-unavailable"]) {
      assert.equal(await persistOffer({ ...sample, placeId }), false);
    }
    assert.equal(posts, 2, "no POST for missing, unknown or unconfirmed venue");
    assert.deepEqual(warnings.map(w => w.reason), ["venue_name_mismatch","unmapped_place","unmapped_place","unmapped_place","unmapped_place","lookup_failed"]);
    assert(warnings.every(w => Object.keys(w).sort().join() === "outcome,reason,tag"));
  } finally {
    await db.close();
    console.warn = oldWarn;
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  // A definitive score without a confirmed write must not make a green cron.
  try {
    process.env.CRON_SECRET = "fixture-cron";
    const cronSource = readFileSync("app/api/cron/verify-offers/route.js", "utf8").replace(/^import[^;]+;\n/gm, "");
    const cron = await import("data:text/javascript," + encodeURIComponent(`
      const getStaleLiveOffersStatus = async () => ({ ok: true, rows: ["match", "missing"].map(product_code => ({ place_name: "Venue", place_id: "fixture", product_code, region: "Florida" })) });
      const credential = () => "fixture", getFanoutCount = async () => 1, resolveVerified = () => ({});
      const evaluateOfferHealthTransition = () => ({}), OFFER_HEALTH_STATUS = {}, EVIDENCE_STRENGTH = {};
      const persistOffer = async () => false, suppressOffer = async () => false;
      const recordPulse = async (_job, pulse) => { globalThis.__viatorState.pulse = pulse; };
      ${cronSource}
    `));
    globalThis.fetch = async () => Response.json({ products: { results: [{ productCode: "match", productUrl: "https://fixture.test/tour", title: "Fixture" }] } });
    const response = await cron.GET(new Request("https://fixture.test/cron", { headers: { authorization: "Bearer fixture-cron" } }));
    const result = await response.json();
    assert.equal(response.status,500); assert.equal(result.checked,2); assert.equal(result.stillLive,0); assert.equal(result.suppressed,0);
    assert.equal(result.writeError,2); assert.equal(globalThis.__viatorState.pulse.failed,2); assert.equal(globalThis.__viatorState.pulse.succeeded,0);
  } finally {
    delete process.env.CRON_SECRET;
  }
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
