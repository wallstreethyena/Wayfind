#!/usr/bin/env node
// test-enterprise-search-blocking — BLOCKING MODE for the two Enterprise
// Text/Nearby Search SKUs is proven by CALLING every runtime caller and
// counting the Google requests that actually leave the process.
//
// Owner decision (2026-10-01, PR #1582): "Block — correct accounting". Since
// #1582, a Text/Nearby request whose X-Goog-FieldMask bills Enterprise debits
// text_enterprise / nearby_enterprise, which run ONLY under an explicit
// operator ceiling (GOOGLE_TEXT_ENTERPRISE_MONTH_CAP /
// GOOGLE_NEARBY_ENTERPRISE_MONTH_CAP). Absent, zero, malformed or exhausted
// means the request does not happen. A `false` return value is not that proof
// — a caller can ignore its gate's answer — so every assertion here is a COUNT
// of outbound googleapis requests seen by a recorder that answers every fetch
// in the process (an unexpected Google URL fails the run; nothing can reach
// the network).
//
// Sections, all against the real route handlers / lib functions:
//   1. cap-state matrix — missing, "0", "abc", "-5", "1.5", "  ", exhausted →
//      ZERO Enterprise requests (and an invalid cap never even asks the
//      ledger). Positive control: a valid cap with a ledger grant DOES reach
//      the mocked Google fetch, request for grant.
//   2. retries — Google answering 500 or throwing never produces a second
//      Enterprise request without a second grant.
//   3. concurrency — N concurrent callers against a ledger that grants exactly
//      k (an atomic counter that yields between callers) send exactly k.
//   4. fallback — /things-to-do/<city> and the other landing paths still
//      render when the Enterprise call is denied: owned inventory first (no
//      Google), the expired cached list next (nothing written back), empty
//      only when neither exists; city/unlock and the nightlife census do not
//      throw.
// The billed SKU of every recorded request is DERIVED from the mask it carried
// (scripts/lib/placesSku.mjs, Google's data-fields table), never assumed.
import { register } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { billedSku } from "./lib/placesSku.mjs";
import { loadComponent } from "./lib/jsxLoad.mjs";

register("./lib/nodeResolveHook.mjs", import.meta.url);
register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { return n(s === "next/server" ? "next/server.js" : s, c); }'
));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const report = [];

// ── The recorder: every fetch in this process lands here. ──────────────────
const S = {
  ledger: {},        // sku → grants remaining (missing key = unlimited)
  ledgerCalls: [],   // { sku, cap, granted }
  google: [],        // { endpoint, mask, sku }
  cacheWrites: [],   // wf_places_cache POST keys
  inventoryWrites: 0,
  googleMode: "ok",  // ok | 500 | throw
  googlePlaces: 1,
  cacheFor: () => null,
};
const tick = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));
function resetRec(ledger = {}) {
  S.ledger = { ...ledger }; S.ledgerCalls = []; S.google = []; S.cacheWrites = []; S.inventoryWrites = 0;
  S.googleMode = "ok"; S.googlePlaces = 1; S.cacheFor = () => null;
}
let placeSeq = 0;
const fixturePlace = (i, extra = {}) => ({
  id: "ChIJfixture" + (++placeSeq), displayName: { text: "Fixture Attraction " + placeSeq },
  location: { latitude: 27.336 + i * 0.001, longitude: -82.53 }, types: ["tourist_attraction", "museum"],
  businessStatus: "OPERATIONAL", rating: 4.6, userRatingCount: 900, formattedAddress: "Sarasota, FL", ...extra,
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === "string" ? input : input.url);
  const hdr = (name) => {
    const h = init.headers || {};
    if (typeof h.get === "function") return h.get(name);
    const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? h[k] : null;
  };
  if (url === "https://db.test/rest/v1/rpc/wf_spend_take") {
    const b = JSON.parse(init.body);
    await tick(); // let concurrent callers interleave around the ledger
    const left = Object.prototype.hasOwnProperty.call(S.ledger, b.p_sku) ? S.ledger[b.p_sku] : Infinity;
    const granted = left > 0;
    if (granted && left !== Infinity) S.ledger[b.p_sku] = left - 1; // atomic: no await between read and write
    S.ledgerCalls.push({ sku: b.p_sku, cap: b.p_cap, granted });
    return new Response(JSON.stringify(granted), { status: 200 });
  }
  if (/^https:\/\/places\.googleapis\.com\/v1\/places:search(Text|Nearby)$/.test(url)) {
    const endpoint = url.endsWith("searchText") ? "text" : "nearby";
    const mask = hdr("X-Goog-FieldMask");
    S.google.push({ endpoint, mask, sku: billedSku(endpoint, mask) });
    await tick();
    if (S.googleMode === "throw") throw new Error("recorder: simulated network failure");
    if (S.googleMode === "500") return new Response('{"error":{"status":"INTERNAL"}}', { status: 500 });
    return new Response(JSON.stringify({ places: Array.from({ length: S.googlePlaces }, (_, i) => fixturePlace(i)) }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("googleapis.com")) { fail.push("recorder: unexpected Google URL " + url); throw new Error("unexpected Google URL"); }
  if (url.startsWith("https://db.test/")) {
    const method = String(init.method || "GET").toUpperCase();
    if (/\/rest\/v1\/wf_places_cache(\?|$)/.test(url)) {
      if (method === "POST") { try { S.cacheWrites.push(JSON.parse(init.body).k); } catch { S.cacheWrites.push("?"); } return new Response("", { status: 201 }); }
      const m = url.match(/[?&]k=eq\.([^&]+)/);
      const row = m ? S.cacheFor(decodeURIComponent(m[1])) : null;
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (/rpc\/wf_gate_status/.test(url)) return new Response(JSON.stringify("pending"), { status: 200 });
    if (/rpc\/wf_add_inventory_place/.test(url)) { S.inventoryWrites++; return new Response("null", { status: 200 }); }
    return new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } });
  }
  throw new Error("recorder: unexpected network call " + url);
};

// ── Hermetic env (written, never read). ─────────────────────────────────────
const ENV = {
  WAYFIND_GATE: "open", SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "svc", GOOGLE_MAPS_SERVER_KEY: "test-key", CRON_SECRET: "cron",
};
for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
for (const k of ["FOURSQUARE_API_KEY", "VIATOR_API_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PHASE",
  "GOOGLE_TEXT_ENTERPRISE_MONTH_CAP", "GOOGLE_NEARBY_ENTERPRISE_MONTH_CAP", "ANTHROPIC_API_KEY", "LLM_API_KEY"]) delete process.env[k];
const TEXT_CAP = "GOOGLE_TEXT_ENTERPRISE_MONTH_CAP", NEARBY_CAP = "GOOGLE_NEARBY_ENTERPRISE_MONTH_CAP";
function setCap(name, v) { if (v === undefined) delete process.env[name]; else process.env[name] = v; }

const count = (sku) => S.google.filter((g) => g.sku === sku).length;
const grants = (sku) => S.ledgerCalls.filter((c) => c.sku === sku && c.granted).length;
const asks = (sku) => S.ledgerCalls.filter((c) => c.sku === sku).length;
let uniq = 0;
const u = () => "u" + (++uniq);

// ── The callers, each a thunk that drives the REAL handler once. ────────────
const landing = await loadComponent(join(ROOT, "lib/landing.js"), ROOT);
const nl = await import("../lib/nightlifeCensus.js");
const search = await import("../app/api/places/search/route.js");
const refresh = await import("../app/api/places/refresh/route.js");
const unlock = await import("../app/api/city/unlock/route.js");

// A fresh centre per call so no cache layer (Supabase rows, in-memory MEM,
// edge headers) can answer instead of the gate.
const centre = () => { const n = ++uniq; return { name: "Fixtureville" + n, state: "FL", lat: 27.3 + n * 0.01, lng: -82.5 }; };
const TEXT_CALLERS = {
  "lib/landing.js rankedForCenter (things-to-do, empty inventory)": async () => landing.rankedForCenter("things-to-do", centre(), { inventoryRows: [] }),
  "lib/landing.js rankedForCenter (withPhotos, /go paid route)": async () => landing.rankedForCenter("things-to-do", centre(), { inventoryRows: [], withPhotos: true }),
  "app/api/places/search GET (open, no cat)": async () => search.GET(new Request(`https://x.test/api/places/search?q=${u()}+tacos&lat=27.58&lng=-82.42&radius=24000&n=10`)),
  "app/api/places/refresh GET (existing row)": async () => {
    const old = new Date(Date.now() - 20 * 86400e3).toISOString();
    S.cacheFor = (k) => (k.startsWith("v1|") ? { v: [{ id: "x" }], exp: new Date(Date.now() + 10 * 86400e3).toISOString(), wrote_at: old } : null);
    return refresh.GET(new Request(`https://x.test/api/places/refresh?q=${u()}+pizza&lat=27.58&lng=-82.42&radius=24000&n=20`));
  },
  "app/api/city/unlock POST (6 pulls)": async () => unlock.POST(new Request("https://x.test/api/city/unlock", { method: "POST", body: JSON.stringify({ lat: 27.58, lng: -82.42, city: "Fixture " + u() + ", FL" }), headers: { "content-type": "application/json" } })),
};
const NEARBY_CALLERS = {
  "lib/nightlifeCensus.js sweepDistricts (2 districts × 2 types)": async () => nl.sweepDistricts(nl.ORLANDO_DISTRICTS.slice(0, 2), ["bar", "night_club"], "test-key"),
  "lib/landing.js rankedForCenter (nightlife census, orlando)": async () => landing.rankedForCenter("nightlife", { name: "Orlando", state: "FL", lat: 28.5384, lng: -81.3789 }, { inventoryRows: [] }, "orlando"),
};

const BLOCKED = [
  ["missing", undefined], ["\"0\"", "0"], ["\"abc\"", "abc"], ["\"-5\"", "-5"], ["\"1.5\"", "1.5"], ["\"  \"", "  "],
];

try {
  // ── 1. CAP-STATE MATRIX ──────────────────────────────────────────────────
  const matrix = [];
  for (const [sku, capVar, callers] of [["text_enterprise", TEXT_CAP, TEXT_CALLERS], ["nearby_enterprise", NEARBY_CAP, NEARBY_CALLERS]]) {
    const otherVar = capVar === TEXT_CAP ? NEARBY_CAP : TEXT_CAP;
    for (const [label, run] of Object.entries(callers)) {
      const row = { sku, caller: label, cells: {} };
      // Invalid / absent ceilings: refused before the ledger is even asked.
      for (const [name, v] of BLOCKED) {
        setCap(capVar, v); setCap(otherVar, undefined); resetRec();
        let threw = null; try { await run(); } catch (e) { threw = e; }
        ok(!threw, `${label} [cap ${name}]: threw ${threw && threw.message}`);
        ok(count(sku) === 0, `${label} [cap ${name}]: ${count(sku)} ${sku} request(s) reached Google`);
        ok(asks(sku) === 0, `${label} [cap ${name}]: asked the ${sku} ledger ${asks(sku)}× with no valid ceiling`);
        row.cells[name] = count(sku);
      }
      // Exhausted: a valid ceiling, but the ledger says no.
      setCap(capVar, "1000"); setCap(otherVar, undefined); resetRec({ [sku]: 0 });
      { let threw = null; try { await run(); } catch (e) { threw = e; }
        ok(!threw, `${label} [exhausted]: threw ${threw && threw.message}`); }
      ok(asks(sku) >= 1, `${label} [exhausted]: the ledger was never asked, so this cell proves nothing`);
      ok(count(sku) === 0, `${label} [exhausted]: ${count(sku)} ${sku} request(s) reached Google after the ledger said no`);
      row.cells.exhausted = count(sku);
      // POSITIVE CONTROL: valid ceiling + grants → the mocked fetch IS reached, one request per grant.
      setCap(capVar, "1000"); setCap(otherVar, undefined); resetRec();
      await run();
      ok(count(sku) >= 1, `${label} [valid]: POSITIVE CONTROL never reached Google — the zeros above prove nothing`);
      ok(count(sku) === grants(sku), `${label} [valid]: ${count(sku)} ${sku} request(s) vs ${grants(sku)} grant(s)`);
      ok(S.ledgerCalls.filter((c) => c.sku === sku).every((c) => c.cap === 1000), `${label} [valid]: the ledger was asked with a cap other than the configured 1000`);
      row.cells.valid = `${count(sku)} (grants ${grants(sku)})`;
      matrix.push(row);
    }
  }
  report.push("cap-state matrix (Enterprise requests reaching Google):");
  for (const r of matrix) report.push(`  ${r.sku.padEnd(17)} ${r.caller}: ` + Object.entries(r.cells).map(([k, v]) => `${k}=${v}`).join(" "));

  // ── 2. RETRIES: a failed Google answer never buys a second request on one grant.
  for (const mode of ["500", "throw"]) {
    for (const [sku, capVar, callers] of [["text_enterprise", TEXT_CAP, TEXT_CALLERS], ["nearby_enterprise", NEARBY_CAP, NEARBY_CALLERS]]) {
      for (const [label, run] of Object.entries(callers)) {
        setCap(TEXT_CAP, "1000"); setCap(NEARBY_CAP, "1000"); resetRec(); S.googleMode = mode;
        let threw = null; try { await run(); } catch (e) { threw = e; }
        ok(!threw, `${label} [google ${mode}]: threw ${threw && threw.message}`);
        // Every SKU, not just the Enterprise one: the nightlife landing path's
        // id-only preflight (nearby_pro) fails first on a 500 and correctly
        // never sweeps, so its proof is that preflight requests = grants.
        ok(S.google.length >= 1, `${label} [google ${mode}]: never reached Google, nothing to prove`);
        for (const s of new Set(S.google.map((g) => g.sku))) ok(count(s) === grants(s), `${label} [google ${mode}]: ${count(s)} ${s} request(s) on ${grants(s)} grant(s) — a retry went out unpaid`);
        ok(count(sku) === grants(sku), `${label} [google ${mode}]: ${count(sku)} ${sku} request(s) on ${grants(sku)} grant(s) — a retry went out unpaid`);
        // and with exactly ONE grant available the caller cannot retry its way past it
        resetRec({ [sku]: 1 }); S.googleMode = mode;
        try { await run(); } catch {}
        ok(count(sku) <= 1, `${label} [google ${mode}, ledger k=1]: ${count(sku)} ${sku} requests`);
        report.push(`  retry ${mode.padEnd(5)} ${label}: requests=grants, k=1 → ${count(sku)}`);
      }
    }
  }

  // ── 3. CONCURRENCY: N concurrent callers, ledger grants exactly k.
  setCap(TEXT_CAP, "1000"); setCap(NEARBY_CAP, "1000");
  {
    const K = 3, N = 12;
    resetRec({ text_enterprise: K });
    const runs = [];
    for (let i = 0; i < N; i++) {
      const pick = [TEXT_CALLERS["app/api/places/search GET (open, no cat)"], TEXT_CALLERS["lib/landing.js rankedForCenter (things-to-do, empty inventory)"], TEXT_CALLERS["app/api/city/unlock POST (6 pulls)"]][i % 3];
      runs.push(pick().catch(() => null));
    }
    await Promise.all(runs);
    ok(count("text_enterprise") === K, `concurrency: ${N} concurrent text callers vs ledger k=${K} sent ${count("text_enterprise")} text_enterprise request(s)`);
    ok(asks("text_enterprise") > K, `concurrency: only ${asks("text_enterprise")} ledger asks — demand never exceeded k, so the cap was not exercised`);
    report.push(`  concurrency text_enterprise: N=${N} callers (search/landing/unlock), ledger asks=${asks("text_enterprise")}, k=${K} → ${count("text_enterprise")} Google requests`);
  }
  {
    const K = 4, N = 5;
    resetRec({ nearby_enterprise: K });
    await Promise.all(Array.from({ length: N }, () => nl.sweepDistricts(nl.ORLANDO_DISTRICTS.slice(0, 3), ["bar"], "test-key").catch(() => null)));
    ok(count("nearby_enterprise") === K, `concurrency: ${N} concurrent sweeps vs ledger k=${K} sent ${count("nearby_enterprise")} nearby_enterprise request(s)`);
    ok(asks("nearby_enterprise") > K, `concurrency: nearby demand never exceeded k`);
    report.push(`  concurrency nearby_enterprise: N=${N} sweeps × 3 districts, ledger asks=${asks("nearby_enterprise")}, k=${K} → ${count("nearby_enterprise")} Google requests`);
  }

  // ── 4. FALLBACK WHEN BLOCKED ─────────────────────────────────────────────
  // Ceilings absent (the production default) for every case below.
  setCap(TEXT_CAP, undefined); setCap(NEARBY_CAP, undefined);
  const SARASOTA = "sarasota";
  const invRow = (i) => ({ place_id: "fx-inv-" + i, id: "fx-inv-" + i, name: "Owned Attraction " + i, rating: 4.4 + (i % 5) / 10, userRatingCount: 300 + i * 50,
    formattedAddress: "Sarasota, FL", types: ["tourist_attraction", "museum"], primaryType: "museum",
    location: { latitude: 27.33 + i * 0.002, longitude: -82.53 }, businessStatus: "OPERATIONAL" });
  const cachedList = (n) => Array.from({ length: n }, (_, i) => ({ id: "fx-cache-" + i, name: "Cached Attraction " + i, rating: 4.5, reviews: 400 + i, address: "Sarasota, FL",
    types: ["tourist_attraction", "museum"], status: "OPERATIONAL", lat: 27.336 + i * 0.002, lng: -82.53, priceLevel: null, photoRef: null, oh: null, utcOffset: null }));
  const expired = (v) => ({ v, exp: new Date(Date.now() - 86400e3).toISOString() });

  // 4a. owned inventory present → full list, 0 Google, 0 ledger asks — even with a VALID ceiling.
  for (const capState of [undefined, "1000"]) {
    setCap(TEXT_CAP, capState); resetRec();
    const list = await landing.rankedFor("things-to-do", SARASOTA, { inventoryRows: Array.from({ length: 10 }, (_, i) => invRow(i)) });
    ok(Array.isArray(list) && list.length === 10, `fallback 4a [cap ${capState || "missing"}]: inventory present should render all 10 owned rows, got ${list && list.length}`);
    ok(S.google.length === 0 && S.ledgerCalls.length === 0, `fallback 4a [cap ${capState || "missing"}]: inventory present still made ${S.google.length} Google request(s) / ${S.ledgerCalls.length} ledger ask(s)`);
    report.push(`  4a things-to-do/sarasota, inventory=10, cap ${capState || "missing"}: list=${list && list.length}, google=${S.google.length}, ledger asks=${S.ledgerCalls.length}`);
  }
  setCap(TEXT_CAP, undefined);
  // 4b. inventory empty (the REAL default inventory read, answered empty) + expired cached row → cached list, nothing written.
  for (const [n, withPhotos] of [[12, false], [3, false], [12, true]]) {
    resetRec();
    const prefix = withPhotos ? "wfl2p|" : "wfl1|";
    const round1 = prefix + "top tourist attractions|sarasota|fl|27359|1";
    S.cacheFor = (k) => (k === round1 ? expired(cachedList(n)) : null);
    let list, threw = null;
    try { list = await landing.rankedFor("things-to-do", SARASOTA, withPhotos ? { withPhotos: true } : undefined); } catch (e) { threw = e; }
    ok(!threw, `fallback 4b [cached ${n}${withPhotos ? ", /go" : ""}]: threw ${threw && threw.message}`);
    const ids = (list || []).map((p) => p.id);
    ok(ids.length === n && ids.every((id) => id.startsWith("fx-cache-")), `fallback 4b [cached ${n}${withPhotos ? ", /go" : ""}]: expected the ${n} cached rows, got ${JSON.stringify(ids)}`);
    ok(S.google.length === 0, `fallback 4b [cached ${n}]: ${S.google.length} Google request(s)`);
    ok(S.cacheWrites.length === 0, `fallback 4b [cached ${n}]: wrote ${S.cacheWrites.length} cache row(s) (${S.cacheWrites.join(",")}) while blocked`);
    report.push(`  4b things-to-do/sarasota${withPhotos ? " (/go withPhotos)" : ""}, inventory=0, expired cache=${n}: list=${ids.length} cached rows, google=${S.google.length}, cache writes=${S.cacheWrites.length}`);
  }
  // 4c. neither → empty, no throw, nothing written.
  {
    resetRec();
    let list, threw = null;
    try { list = await landing.rankedFor("things-to-do", SARASOTA); } catch (e) { threw = e; }
    ok(!threw, `fallback 4c: threw ${threw && threw.message}`);
    ok(list == null || (Array.isArray(list) && list.length === 0), `fallback 4c: expected an empty answer, got ${JSON.stringify(list)}`);
    ok(S.google.length === 0 && S.cacheWrites.length === 0, `fallback 4c: google=${S.google.length} cache writes=${S.cacheWrites.length}`);
    report.push(`  4c things-to-do/sarasota, inventory=0, no cache: list=${JSON.stringify(list)} (page renders its no-list state), google=0, cache writes=${S.cacheWrites.length}`);
  }
  // 4d. nightlife census blocked: stale census row served; with none, no throw.
  {
    resetRec();
    const stale = cachedList(6).map((p, i) => ({ ...p, id: "fx-nl-" + i, name: "Stale Bar " + i, types: ["bar"], primaryType: "bar", businessStatus: "OPERATIONAL", lat: 28.54 + i * 0.001, lng: -81.379 }));
    S.cacheFor = (k) => (k === "wfnl1|orlando" ? expired(stale) : null);
    let list, threw = null;
    try { list = await landing.rankedFor("nightlife", "orlando"); } catch (e) { threw = e; }
    ok(!threw, `fallback 4d: nightlife threw ${threw && threw.message}`);
    ok(count("nearby_enterprise") === 0 && count("text_enterprise") === 0, `fallback 4d: Enterprise requests while blocked`);
    ok(S.cacheWrites.length === 0, `fallback 4d: wrote cache while blocked`);
    report.push(`  4d nightlife/orlando, inventory=0, stale census=6: list=${(list || []).length} (ids ${(list || []).filter((p) => String(p.id).startsWith("fx-nl-")).length} from the stale census), enterprise google=0, nearby_pro preflight requests=${count("nearby_pro")}, cache writes=${S.cacheWrites.length}`);
    resetRec();
    const sw = await nl.sweepDistricts(nl.ORLANDO_DISTRICTS, ["bar"], "test-key");
    ok(sw && Array.isArray(sw.places) && sw.places.length === 0 && S.google.length === 0, `fallback 4d: blocked sweep should return an empty census with no Google, got ${sw && sw.places && sw.places.length} / ${S.google.length}`);
    report.push(`  4d sweepDistricts(all ${nl.ORLANDO_DISTRICTS.length} districts) blocked: places=0, google=0, no throw`);
  }
  // 4e. city/unlock blocked: answers JSON, inserts nothing, does not throw.
  {
    resetRec();
    let res, threw = null;
    try { res = await TEXT_CALLERS["app/api/city/unlock POST (6 pulls)"](); } catch (e) { threw = e; }
    ok(!threw, `fallback 4e: unlock threw ${threw && threw.message}`);
    const j = res ? await res.json() : null;
    ok(res && res.status === 200 && j && j.added === 0 && j.status === "fetching", `fallback 4e: unlock answered ${res && res.status} ${JSON.stringify(j)}`);
    ok(S.google.length === 0 && S.inventoryWrites === 0, `fallback 4e: unlock google=${S.google.length} inserts=${S.inventoryWrites}`);
    report.push(`  4e city/unlock blocked: HTTP ${res && res.status} ${JSON.stringify(j)}, google=0, inserts=0`);
  }
} catch (e) {
  fail.push("harness threw: " + (e && e.stack || e));
} finally {
  globalThis.fetch = realFetch;
}

if (fail.length) {
  console.error(`test-enterprise-search-blocking: FAIL (${pass} ok, ${fail.length} failed)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
if (process.argv.includes("--report")) console.log(report.join("\n"));
console.log(`test-enterprise-search-blocking: OK (${pass} checks) — ${Object.keys(TEXT_CALLERS).length} text_enterprise + ${Object.keys(NEARBY_CALLERS).length} nearby_enterprise callers executed against 8 cap states (missing/0/abc/-5/1.5/blank/exhausted → 0 Google requests; valid → 1 request per grant), retries on 500/throw, N-vs-k concurrency, and blocked-mode fallbacks (inventory → expired cache → empty)`);
