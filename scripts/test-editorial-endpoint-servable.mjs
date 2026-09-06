#!/usr/bin/env node
// scripts/test-editorial-endpoint-servable.mjs — THE ENDPOINT REFUSES A CLOSED
// PLACE ON EVERY TIER.
//
// Owner, 2026-09-05: "The guard's new function calls test which table name is
// allowed. They do not prove that the actual endpoint refuses closed places
// across every editorial tier." Correct. check-editorial-read-gate proves the
// RULE and proves no serving file reads the raw table; neither of those is the
// endpoint answering a request.
//
// So this CALLS THE REAL ROUTE HANDLER — app/api/editorial/route.js, imported
// and invoked with a real Request — once per tier, first with the place open and
// then with the same place closed in an isolated fixture, and asserts the
// editorial disappears every time.
//
// /api/editorial has FOUR tiers, and before 2026-09-05 only ONE consulted the
// database:
//   1. Atlas card by place_id                 (was: no check at all)
//   2. wf_editorial via the servable view     (was: the only checked tier)
//   3. Atlas card by exact name               (was: no check at all)
//   4. lib/editorial.js static, by name       (was: no check at all)
// Measured against production inventory the same day: 4 of the 264 Atlas cards
// point at EXCLUDED / CLOSED_TEMPORARILY / absent places, so tier 1 was serving
// recommendations for places Wayfind does not serve, with no database call.
//
// ISOLATED FIXTURE, NOT PRODUCTION. The route reads inventory through
// lib/placeServable, which takes an injected fetch. Here the whole Supabase REST
// surface is a stub whose status table this test controls, so "mark it closed"
// is a local mutation — no production row is touched and the test is hermetic
// (check-guard-hermeticity: no ambient env decides the verdict).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));

// The route reads these at module scope through process.env. Pin them to
// obvious non-secrets so the code path is reachable and nothing real is dialled.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key-not-a-secret";

// ── THE FIXTURE ─────────────────────────────────────────────────────────────
// Per-PLACE fixture, not one global status. The bug this file now covers is
// "approve place A, serve place B", which a single-status fixture cannot express.
const state = {
  byId: new Map(),      // place_id -> { status, excluded }
  byName: new Map(),    // name     -> { place_id, status, excluded }
  editorialRows: [],
  calls: [],
  malformInventory: false, // return a PostgREST error envelope instead of an array
};
const setPlace = (placeId, name, row) => {
  state.byId.set(placeId, { place_id: placeId, status: "OPERATIONAL", excluded: false, ...row });
  if (name) state.byName.set(name, { place_id: placeId, status: "OPERATIONAL", excluded: false, ...row });
};

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

// Stands in for Supabase REST. Two relations matter: wf_inventory (the status
// the gate reads) and wf_editorial_servable (tier 2). The view is MODELLED, not
// mocked away: it returns rows only while the status is OPERATIONAL, exactly as
// the real view's join does — otherwise this test would prove the gate while
// silently assuming the thing the gate depends on.
globalThis.fetch = async (url) => {
  const u = String(url);
  state.calls.push(u);
  if (u.includes("/wf_inventory?")) {
    // A PostgREST error is a JSON OBJECT, not an array, and json() parses it
    // happily. The old gate read that as "no such place" and fell through to the
    // allow-unverified branch. Modelled here so the refusal can be asserted.
    if (state.malformInventory) return jsonResponse({ message: "syntax error", code: "42601" });
    const idm = /place_id=eq\.([^&]+)/.exec(u);
    const nm = /name=eq\.([^&]+)/.exec(u);
    if (idm) { const r = state.byId.get(decodeURIComponent(idm[1])); return jsonResponse(r ? [r] : []); }
    if (nm)  { const r = state.byName.get(decodeURIComponent(nm[1])); return jsonResponse(r ? [r] : []); }
    return jsonResponse([]);
  }
  if (u.includes("/wf_editorial_servable?")) {
    // Model the real view: rows only while the place is OPERATIONAL.
    const idm = /place_id=eq\.([^&]+)/.exec(u);
    const pid = idm ? decodeURIComponent(idm[1]) : null;
    const inv = pid ? state.byId.get(pid) : null;
    const live = inv && inv.status === "OPERATIONAL";
    return jsonResponse(live ? state.editorialRows : []);
  }
  if (u.includes("/wf_editorial?")) {
    throw new Error("the route read the RAW table — the read gate was bypassed");
  }
  return jsonResponse([]);
};

const { loadComponent } = await import(new URL("./lib/jsxLoad.mjs", import.meta.url).href);
const routeMod = await loadComponent(fileURLToPath(new URL("../app/api/editorial/route.js", import.meta.url)), ROOT);
const GET = routeMod.GET;
ok(typeof GET === "function", "the REAL /api/editorial GET handler was imported and is callable (without this every assertion below is about nothing)");
const atlasCards = JSON.parse(readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8"));

const call = async (qs) => {
  const res = await GET(new Request("https://wayfind.test/api/editorial?" + qs));
  const body = await res.json();
  return { body, cache: res.headers.get("Cache-Control") || "", served: !!body.editorial };
};

// ── PICK A REAL FIXTURE FOR EACH TIER ───────────────────────────────────────
const card = atlasCards.find((c) => c && c.placeId && c.name);
ok(!!card, "an Atlas card with both a placeId and a name exists to drive tiers 1 and 3");

// Tier 4 needs a name the static module actually holds.
const { editorialFor } = await import(new URL("../lib/editorial.js", import.meta.url).href);
const STATIC_NAMES = ["Mote Marine Laboratory & Aquarium", "The Ringling", "Siesta Key Beach", "Marie Selby Botanical Gardens"];
const staticName = STATIC_NAMES.find((n) => editorialFor(n));
ok(!!staticName, `a known static editorial entry was found to drive tier 4 (tried ${STATIC_NAMES.length})`);

// ── FIXTURES ────────────────────────────────────────────────────────────────
const CARD_ID = card.placeId;
const CARD_NAME = card.name;
// A second Atlas card with a DIFFERENT place — the "approve A, serve B" case.
const other = atlasCards.find((c) => c && c.placeId && c.name && c.placeId !== CARD_ID);
ok(!!other, "a SECOND distinct Atlas card exists, to drive the approve-one-serve-another case");

const reset = () => {
  state.byId.clear(); state.byName.clear();
  state.editorialRows = []; state.malformInventory = false;
};

const TIERS = [
  { n: 1, label: "Atlas card by place_id", qs: `id=${encodeURIComponent(CARD_ID)}`,
    place: () => setPlace(CARD_ID, CARD_NAME, {}) },
  { n: 2, label: "wf_editorial via the servable view", qs: "id=ChIJfixture-tier2",
    place: () => {
      setPlace("ChIJfixture-tier2", "Fixture Two", {});
      state.editorialRows = [{ place_id: "ChIJfixture-tier2", hook: "A hook of at least twenty characters here.",
        why_here: "W".repeat(200), local_tip: "Ask for the corner table.", facts: [], verified: true }];
    } },
  { n: 3, label: "Atlas card by exact name", qs: `name=${encodeURIComponent(CARD_NAME)}`,
    place: () => setPlace(CARD_ID, CARD_NAME, {}) },
  { n: 4, label: "static lib/editorial.js by name", qs: `name=${encodeURIComponent(staticName)}`,
    place: () => setPlace("ChIJfixture-static", staticName, {}) },
];

// ── 1. OPEN: every tier SERVES (the positive control) ───────────────────────
const openResults = {};
for (const t of TIERS) {
  reset(); t.place();
  const r = await call(t.qs);
  openResults[t.n] = r;
  ok(r.served, `POSITIVE CONTROL tier ${t.n} (${t.label}): serves while OPERATIONAL and not excluded (got ${JSON.stringify(r.body).slice(0, 100)})`);
}

// ── 2. CLOSED / EXCLUDED-BY-STATUS: every tier REFUSES ─────────────────────
for (const bad of ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY", "EXCLUDED"]) {
  for (const t of TIERS) {
    reset(); t.place();
    for (const [k, v] of state.byId) state.byId.set(k, { ...v, status: bad });
    for (const [k, v] of state.byName) state.byName.set(k, { ...v, status: bad });
    const r = await call(t.qs);
    ok(!r.served, `tier ${t.n} (${t.label}): serves NOTHING when the place is ${bad} — got ${JSON.stringify(r.body).slice(0, 110)}`);
    ok(r.body && r.body.none === true, `tier ${t.n} (${bad}): answers an explicit none, not an empty 200`);
  }
}

// ── 3. OPERATIONAL BUT `excluded = true` ───────────────────────────────────
// wf_inventory carries BOTH `status` (text) and `excluded` (boolean). The gate
// used to select only `status`, so this row would have been approved. Measured
// 2026-09-05: production has 0 such rows, so this is a LATENT hole and the
// fixture is necessarily synthetic — which is the reason to test it, not a
// reason to skip it.
for (const t of TIERS) {
  reset(); t.place();
  for (const [k, v] of state.byId) state.byId.set(k, { ...v, status: "OPERATIONAL", excluded: true });
  for (const [k, v] of state.byName) state.byName.set(k, { ...v, status: "OPERATIONAL", excluded: true });
  const r = await call(t.qs);
  ok(!r.served, `tier ${t.n} (${t.label}): an OPERATIONAL row with excluded=true is REFUSED (got ${JSON.stringify(r.body).slice(0, 110)})`);
  ok(r.body.refused === "refused-excluded", `tier ${t.n}: …and names the exclusion (${r.body.refused})`);
}

// ── 4. APPROVE ONE IDENTITY, SERVE ANOTHER ─────────────────────────────────
// THE CENTRAL CASE. The request carries an OPERATIONAL id that holds no Atlas
// card, plus a fallback NAME whose card belongs to a CLOSED place. The old gate
// approved the id and then let tier 3 return the other place's card.
{
  reset();
  setPlace("ChIJopen-decoy", "Open Decoy", { status: "OPERATIONAL" });      // the id: fine
  setPlace(other.placeId, other.name, { status: "CLOSED_PERMANENTLY" });     // the card: closed
  const r = await call(`id=ChIJopen-decoy&name=${encodeURIComponent(other.name)}`);
  ok(!r.served,
    `an OPERATIONAL id paired with a CLOSED place's fallback name serves NOTHING — the identity APPROVED must be the identity SERVED (got ${JSON.stringify(r.body).slice(0, 140)})`);
  ok(r.body.refused === "refused-status", `…and refuses on the CARD's place, not the request's id (${r.body.refused})`);
}
// Same shape, excluded instead of closed.
{
  reset();
  setPlace("ChIJopen-decoy", "Open Decoy", { status: "OPERATIONAL" });
  setPlace(other.placeId, other.name, { status: "OPERATIONAL", excluded: true });
  const r = await call(`id=ChIJopen-decoy&name=${encodeURIComponent(other.name)}`);
  ok(!r.served && r.body.refused === "refused-excluded",
    `…and the same for an EXCLUDED fallback place (got ${JSON.stringify(r.body).slice(0, 120)})`);
}
// The control: when the fallback card's place IS servable, it still serves —
// otherwise the two assertions above would pass on a route that refuses always.
{
  reset();
  setPlace("ChIJopen-decoy", "Open Decoy", { status: "OPERATIONAL" });
  setPlace(other.placeId, other.name, { status: "OPERATIONAL" });
  const r = await call(`id=ChIJopen-decoy&name=${encodeURIComponent(other.name)}`);
  ok(r.served, "POSITIVE CONTROL: the same request serves when the FALLBACK card's own place is operational");
}

// ── 5. UNRESOLVED IDENTITY REFUSES ─────────────────────────────────────────
// "We cannot verify it" does not establish that recommending it is safe. The
// handwritten content is retained and is what resolves the identity; it is
// withheld until that identity resolves.
{
  reset(); // inventory knows nothing
  const r = await call(`name=${encodeURIComponent(staticName)}`);
  ok(!r.served, `a handwritten entry whose name resolves to NO place is withheld (got ${JSON.stringify(r.body).slice(0, 110)})`);
  ok(r.body.refused === "refused-unresolved-identity", `…and says the identity is unresolved (${r.body.refused})`);
  ok(!!editorialFor(staticName), "…while the handwritten CONTENT is still present in lib/editorial.js — withheld, not deleted");
}
{
  // An id that DOES reach a tier (it holds an Atlas card) but has no inventory
  // row. The first draft of this case used an id no tier matches, so nothing was
  // served and there was no refusal to report — it asserted the wrong thing and
  // said so by failing. Nothing served is correct there; it is just not evidence
  // about the gate.
  reset(); // inventory empty, but CARD_ID still holds a card
  const r = await call(`id=${encodeURIComponent(CARD_ID)}`);
  ok(!r.served, "an id that reaches tier 1 but has NO inventory row serves nothing");
  ok(r.body.refused === "refused-unknown-place", `…and names it (${r.body.refused})`);

  const r2 = await call("id=ChIJreaches-no-tier-at-all");
  ok(!r2.served, "…and an id no tier matches also serves nothing (no refusal to report — nothing was a candidate)");
}

// ── 6. MALFORMED LOOKUPS REFUSE ────────────────────────────────────────────
// PostgREST returns a JSON OBJECT on a bad query and json() parses it happily.
// The old code read that as "no matching row", which for a name lookup reached
// the allow-unverified branch and SERVED.
for (const t of TIERS) {
  reset(); t.place();
  state.malformInventory = true;
  const r = await call(t.qs);
  ok(!r.served, `tier ${t.n} (${t.label}): a MALFORMED inventory response refuses rather than reading as "no such place" (got ${JSON.stringify(r.body).slice(0, 110)})`);
  ok(r.body.refused === "refused-malformed", `tier ${t.n}: …and names it (${r.body.refused})`);
}

// ── 7. LOOKUP FAILURE FAILS CLOSED ─────────────────────────────────────────
{
  reset(); TIERS[0].place();
  const saved = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  const r = await call(TIERS[0].qs);
  ok(!r.served, "a FAILED lookup refuses rather than falling through — a check that fails open is not a check");
  ok(r.body.refused === "refused-lookup-failed", `…and names the failure (${r.body.refused})`);
  globalThis.fetch = saved;
}

// ── 8. CACHE CANNOT OUTLIVE A CLOSURE ──────────────────────────────────────
const parseCache = (h) => {
  const g = (k) => { const m = new RegExp(k + "=(\\d+)").exec(h || ""); return m ? Number(m[1]) : 0; };
  return { sMaxAge: g("s-maxage"), swr: g("stale-while-revalidate"), noStore: /no-store/.test(h || "") };
};
const MAX_EXPOSURE_S = 1800;
for (const t of TIERS) {
  const c = parseCache(openResults[t.n].cache);
  ok(c.sMaxAge + c.swr <= MAX_EXPOSURE_S,
    `tier ${t.n} (${t.label}): cache exposure ${c.sMaxAge + c.swr}s <= ${MAX_EXPOSURE_S}s (header: ${openResults[t.n].cache})`);
  ok(c.sMaxAge > 0, `tier ${t.n}: …while still caching, so this is a bound and not an accidental no-cache regression`);
}
{
  reset(); TIERS[0].place();
  for (const [k, v] of state.byId) state.byId.set(k, { ...v, status: "CLOSED_PERMANENTLY" });
  const r = await call(TIERS[0].qs);
  ok(parseCache(r.cache).noStore, `a REFUSAL is no-store (got ${JSON.stringify(r.cache)}) — a reopened place serves again on the next request`);
}

// ── 9. THE STATUS IS RE-READ PER REQUEST ───────────────────────────────────
{
  reset(); TIERS[0].place();
  const a = await call(TIERS[0].qs);
  const before = state.calls.length;
  for (const [k, v] of state.byId) state.byId.set(k, { ...v, status: "EXCLUDED" });
  const b = await call(TIERS[0].qs);
  ok(a.served && !b.served, "the very next request after the status flips is refused — no restart, no cache purge inside the handler");
  ok(state.calls.length > before, "…because inventory was re-read on that request rather than memoised in module scope");
}

if (fail.length) {
  console.error("test-editorial-endpoint-servable: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-editorial-endpoint-servable: OK — ${pass} assertions; the REAL /api/editorial handler CALLED across all 4 tiers: serving while operational (positive controls) and refusing on closed/temporarily-closed/status-excluded, OPERATIONAL-but-excluded=true, an operational id paired with a CLOSED fallback name (approve-one-serve-another), unresolved identity, unknown id, MALFORMED lookup bodies and lookup failure — with cache exposure bounded to <=${MAX_EXPOSURE_S}s and refusals no-store. NOT PROVEN HERE: Vercel's edge cache (node cannot exercise it) — the header bound is asserted, not the CDN's behaviour.`);
