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
const state = { status: "OPERATIONAL", editorialRows: [], calls: [] };

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
    return jsonResponse(state.status === null ? [] : [{ status: state.status }]);
  }
  if (u.includes("/wf_editorial_servable?")) {
    return jsonResponse(state.status === "OPERATIONAL" ? state.editorialRows : []);
  }
  if (u.includes("/wf_editorial?")) {
    throw new Error("the route read the RAW table — the read gate was bypassed");
  }
  return jsonResponse([]);
};

// Loaded through the repo's own harness. Plain node cannot resolve a route's
// `import { NextResponse } from "next/server"` (next's package.json has no bare
// "server" export), so scripts/lib/jsxLoad.mjs supplies a REAL NextResponse
// built on Node's native Response — not a shape mock. This is the same harness
// the other route-calling guards use; it compiles and imports the REAL route
// file, it does not re-implement it.
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

const TIERS = [
  { n: 1, label: "Atlas card by place_id", qs: `id=${encodeURIComponent(card.placeId)}` },
  { n: 2, label: "wf_editorial via the servable view", qs: "id=ChIJfixture-tier2", setup: () => {
      state.editorialRows = [{ place_id: "ChIJfixture-tier2", hook: "A hook of at least twenty characters here.",
        why_here: "W".repeat(200), local_tip: "Ask for the corner table.", facts: [], verified: true }];
    } },
  { n: 3, label: "Atlas card by exact name", qs: `name=${encodeURIComponent(card.name)}` },
  { n: 4, label: "static lib/editorial.js by name", qs: staticName ? `name=${encodeURIComponent(staticName)}` : "name=none" },
];

// ── 1. OPEN: every tier SERVES (the positive control) ───────────────────────
// Without this, "nothing was served" below is equally consistent with an
// endpoint that serves nothing for anything, which would pass every refusal
// assertion while protecting no one.
const openResults = {};
for (const t of TIERS) {
  state.status = "OPERATIONAL";
  state.editorialRows = [];
  if (t.setup) t.setup();
  const r = await call(t.qs);
  openResults[t.n] = r;
  ok(r.served, `POSITIVE CONTROL tier ${t.n} (${t.label}): serves editorial while the place is OPERATIONAL (got ${JSON.stringify(r.body).slice(0, 90)})`);
}

// ── 2. CLOSED: every tier REFUSES ──────────────────────────────────────────
for (const closedStatus of ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY", "EXCLUDED"]) {
  for (const t of TIERS) {
    state.status = closedStatus;
    state.editorialRows = [];
    if (t.setup) t.setup();
    const r = await call(t.qs);
    ok(!r.served,
      `tier ${t.n} (${t.label}): serves NOTHING when the place is ${closedStatus} — got ${JSON.stringify(r.body).slice(0, 120)}`);
    ok(r.body && r.body.none === true,
      `tier ${t.n} (${closedStatus}): answers an explicit none, not an empty 200 a client might render as a blank card`);
  }
}

// A place absent from inventory entirely, addressed by id, is refused too.
for (const t of TIERS.filter((x) => x.qs.startsWith("id="))) {
  state.status = null; // fixture: no inventory row
  state.editorialRows = [];
  if (t.setup) t.setup();
  const r = await call(t.qs);
  ok(!r.served, `tier ${t.n}: an id with NO inventory row is refused (${JSON.stringify(r.body).slice(0, 80)})`);
  ok(r.body.refused === "refused-unknown-id", `tier ${t.n}: …and says why (${r.body.refused})`);
}

// ── 3. THE LOOKUP FAILING MUST FAIL CLOSED ─────────────────────────────────
{
  const saved = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network down"); };
  const r = await call(`id=${encodeURIComponent(card.placeId)}`);
  ok(!r.served, "a FAILED status lookup refuses rather than falling through to an unchecked tier — a check that fails open is not a check");
  ok(r.body.refused === "refused-lookup-failed", `…and names the failure (${r.body.refused})`);
  globalThis.fetch = saved;
}

// ── 4. CACHE CANNOT OUTLIVE A CLOSURE ──────────────────────────────────────
// The old headers were s-maxage=86400 + stale-while-revalidate=604800: a day
// fresh and SEVEN DAYS stale. A response computed while a venue was open could
// be replayed for a week after it shut, and no view or trigger can re-check a
// request that never reaches the server.
const parseCache = (h) => {
  const g = (k) => { const m = new RegExp(k + "=(\\d+)").exec(h || ""); return m ? Number(m[1]) : 0; };
  return { sMaxAge: g("s-maxage"), swr: g("stale-while-revalidate"), noStore: /no-store/.test(h || "") };
};
const MAX_EXPOSURE_S = 1800; // 30 minutes, generous; the old value was 691200
for (const t of TIERS) {
  const c = parseCache(openResults[t.n].cache);
  ok(c.sMaxAge + c.swr <= MAX_EXPOSURE_S,
    `tier ${t.n} (${t.label}): total cache exposure ${c.sMaxAge + c.swr}s is within ${MAX_EXPOSURE_S}s — a stale "go here" cannot outlive a closure by days (header: ${openResults[t.n].cache})`);
  ok(c.sMaxAge > 0, `tier ${t.n}: …while still caching something, so this is a bound and not an accidental no-cache regression`);
}
{
  state.status = "CLOSED_PERMANENTLY";
  const r = await call(`id=${encodeURIComponent(card.placeId)}`);
  ok(parseCache(r.cache).noStore,
    `a REFUSAL is no-store (got ${JSON.stringify(r.cache)}) — a place that reopens must serve again on the next request, not after an edge TTL`);
}

// ── 5. WARMED: a real cache replaying an OPEN answer is what we are bounding ─
// Node cannot exercise Vercel's edge cache, so rather than claim coverage this
// asserts the property that BOUNDS it, and says plainly what is not proven.
{
  state.status = "OPERATIONAL"; state.editorialRows = [];
  const warm1 = await call(`id=${encodeURIComponent(card.placeId)}`);
  const warm2 = await call(`id=${encodeURIComponent(card.placeId)}`);
  ok(warm1.served && warm2.served, "repeated identical requests both serve while open (the handler is deterministic, so an edge cache is replaying a value this test can reason about)");
  const before = state.calls.length;
  state.status = "EXCLUDED";
  const after = await call(`id=${encodeURIComponent(card.placeId)}`);
  ok(!after.served, "…and the very next request after the status flips is refused, with no restart and no cache purge inside the handler");
  ok(state.calls.length > before, "…because the status was re-read on that request rather than memoised in module scope");
}

if (fail.length) {
  console.error("test-editorial-endpoint-servable: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-editorial-endpoint-servable: OK — ${pass} assertions; the REAL /api/editorial handler was CALLED across all 4 tiers, each serving while OPERATIONAL (positive control) and refusing under CLOSED_PERMANENTLY / CLOSED_TEMPORARILY / EXCLUDED / no-inventory-row / lookup-failure, with cache exposure bounded to <=${MAX_EXPOSURE_S}s and refusals no-store. NOT PROVEN HERE: Vercel's actual edge cache (node cannot exercise it) — this asserts the header bound that limits it, not the CDN's behaviour.`);
