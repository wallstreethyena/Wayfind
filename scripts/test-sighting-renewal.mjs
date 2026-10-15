// scripts/test-sighting-renewal.mjs — the daily sighting-renewal cron and the
// one-off backfill share ONE rule set (lib/sightingRenewal.js). Hermetic: no
// network, no database except an in-memory PGlite.
//
// Asserted on the CALL (import + invoke), each with positive and negative controls:
//   A. EXCLUSIONS: data/coords/sighting-seed-place-ids.json equals a fresh parse of
//      SEED_FILES; a real seed id and a real Atlas allowlist id are refused.
//   B. PLAN (planRow): the entry carries the SIGHTING's lat/lng, never the stored
//      inventory coordinate; observed_at = seen_at truncated to ms, never later,
//      future/expired seen_at refused; only a strictly newer sighting replaces;
//      other independent_coords entries are kept; expired sighting entries are
//      removed (empty -> NULL); 50 m, Florida bbox, 0/0, row-eligibility rules.
//      The written row draws through lib/coordProvenance.js.
//   C. RUNNER against a fake PostgREST: renews / adds / removes, is idempotent,
//      compare-and-swap never clobbers a concurrent write, the batch cap defers,
//      and NOT ONE request leaves for anything but the Supabase REST URL (no
//      googleapis). The real route GET is invoked end to end with the same
//      fetch trap and records a wf_job_pulse row with the note.
//   D. SQL PARITY: the backfill script's SQL (sqlRules) executed in PGlite picks
//      exactly the rows planRow would add, over a fixture covering every rule.
//
// Red-proof: `--red-prove` re-runs A-D against mutated copies of the lib (copies
// stored coordinate, re-dates to now, drops the seed/atlas exclusion, keeps
// expired entries, drops the newer-only rule, drops the bbox, widens 50 m, adds
// a Google call, drops compare-and-swap) and requires each RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import * as PROV from "../lib/coordProvenance.js";
import * as LIB_STATIC from "../lib/sightingRenewal.js";
import { listPublishReadyAtlasIds } from "../lib/atlasPlaceAllowlist.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DAY = 86400000;
let assertions = 0;
const ok = (v, m) => { assert.ok(v, m); assertions++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); assertions++; };
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const LIB = "lib/sightingRenewal.js";
const libUrl = pathToFileURL(path.join(ROOT, "lib/")).href;
// data:-URL copy of the lib with its relative imports made absolute, so
// --red-prove can mutate it without touching the tree.
const asModule = (src) => import("data:text/javascript," + encodeURIComponent(
  src.replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${libUrl}${f}"`).replace(/import\("\.\/([^"]+)"\)/g, (_, f) => `import("${libUrl}${f}")`)));
function mutated(find, replace) {
  const raw = read(LIB);
  assert.ok(raw.includes(find), `red-prove setup: ${LIB} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, "red-prove setup: mutation did not apply");
  return out;
}

const ATLAS_ID = listPublishReadyAtlasIds()[0];
const SEED_ID = JSON.parse(read("data/coords/sighting-seed-place-ids.json")).ids[0];
const iso = (t) => new Date(t).toISOString();

// ── A ────────────────────────────────────────────────────────────────────────
async function checkExclusions(L) {
  const parsed = new Set();
  for (const f of L.SEED_FILES) for (const m of read(f).matchAll(L.PLACE_ID_RE)) parsed.add(m[0]);
  eq(L.loadSeedIds(), [...parsed].sort(), "A: committed seed id list equals a fresh parse of SEED_FILES (regenerate data/coords/sighting-seed-place-ids.json)");
  const ex = await L.loadExcludedIds();
  ok(ATLAS_ID && ex.has(ATLAS_ID), "A: a real Atlas allowlist id is excluded");
  ok(SEED_ID && ex.has(SEED_ID), "A: a real seed id is excluded");
  ok(!ex.has("ChIJordinaryplace00000001"), "A: an ordinary id is not excluded (positive control)");
  return ex;
}

// ── B ────────────────────────────────────────────────────────────────────────
const NOW = Date.parse("2026-10-15T12:00:00Z");
const row = (o = {}) => ({ place_id: "ChIJtestrow000000000001", lat: 27.5, lng: -82.5, status: "OPERATIONAL", excluded: false, needs_review: false, refreshed_at: "2026-08-20T00:00:00Z", independent_coords: null, ...o });
const sight = (o = {}) => ({ place_id: "ChIJtestrow000000000001", lat: 27.5001, lng: -82.5001, seen_at: "2026-10-14T10:00:00.123999+00:00", ...o });
const entryAt = (t, o = {}) => ({ source: "google_places", lat: 27.5001, lng: -82.5001, observed_at: iso(t), method: "wf_place_ids-sighting", attribution: null, verified: false, ...o });
const WIKI = { source: "wikidata", lat: 27.50005, lng: -82.50005, ref: "Q1", method: "wikidata-p625" };

function checkPlan(L, ex) {
  const P = (r, s) => L.planRow(r, s, { now: NOW, excluded: ex });
  const add = P(row(), sight());
  eq([add.action, add.kind], ["write", "add"], "B: an eligible row with a fresh sighting 14 m away gets a first entry");
  eq([add.entry.lat, add.entry.lng], [27.5001, -82.5001], "B: the entry carries the sighting's own lat/lng");
  ok(add.entry.lat !== 27.5 && add.entry.lng !== -82.5, "B: the stored inventory coordinate is never copied");
  eq(add.entry.observed_at, "2026-10-14T10:00:00.123Z", "B: observed_at = seen_at truncated to ms (123999 us -> .123, never .124)");
  ok(Date.parse(add.entry.observed_at) <= Date.parse("2026-10-14T10:00:00.123999Z"), "B: observed_at is never later than seen_at");
  eq([add.entry.source, add.entry.method], ["google_places", "wf_place_ids-sighting"], "B: source google_places, method wf_place_ids-sighting");
  eq(L.observedAtFromSeenAt("2026-10-14 10:00:00.9999+00"), "2026-10-14T10:00:00.999Z", "B: Postgres text timestamps truncate too");
  eq(P(row(), sight({ seen_at: iso(NOW + 60000) })).reason, "future-dated", "B: a future seen_at is refused");
  eq(P(row(), sight({ seen_at: iso(NOW - 31 * DAY) })).reason, "expired", "B: a 31-day-old sighting is never written");

  eq(P(row({ place_id: ATLAS_ID }), sight({ place_id: ATLAS_ID })).reason, "seed-or-atlas-id", "B: an Atlas allowlist id is excluded");
  eq(P(row({ place_id: SEED_ID }), sight({ place_id: SEED_ID })).reason, "seed-or-atlas-id", "B: a seed id is excluded");
  eq(P(row(), sight({ lat: 40.7, lng: -74.0 })).reason, "outside-florida", "B: a sighting outside the Florida bbox is refused");
  eq(P(row(), sight({ lat: 0, lng: 0 })).reason, "bad-coordinate", "B: 0/0 is refused");
  eq(P(row(), sight({ lat: 27.501 })).reason, "over-50m", "B: a sighting 111 m from the stored coordinate is refused");
  eq(P(row({ lat: null, lng: null }), sight()).reason, "no-inventory-coordinate", "B: no stored coordinate -> no consistency check -> refused");
  eq(P(row({ refreshed_at: iso(NOW - 5 * DAY) }), sight()).reason, "own-coordinate-fresh", "B: a row inside its own Google window is left alone");
  eq(P(row({ excluded: true }), sight()).reason, "excluded", "B: excluded row refused");
  eq(P(row({ needs_review: true }), sight()).reason, "needs-review", "B: needs_review row refused");
  eq(P(row({ status: "CLOSED_PERMANENTLY" }), sight()).reason, "not-operational", "B: closed row refused");

  const older = entryAt(NOW - 10 * DAY);
  const renew = P(row({ independent_coords: [WIKI, older] }), sight());
  eq([renew.action, renew.kind], ["write", "renew"], "B: a strictly newer sighting renews the entry");
  eq(renew.next, [WIKI, renew.entry], "B: renewal replaces only the sighting entry and keeps the Wikidata entry untouched");
  const same = entryAt(Date.parse("2026-10-14T10:00:00.123Z"));
  eq(P(row({ independent_coords: [same] }), sight()), { action: "none", reason: "not-newer" }, "B: an equal sighting is not rewritten (idempotent)");
  eq(P(row({ independent_coords: [entryAt(NOW - 1 * DAY)] }), sight()).reason, "not-newer", "B: an older sighting never replaces a newer entry");

  const expired = entryAt(NOW - 31 * DAY);
  const rm = P(row({ independent_coords: [WIKI, expired] }), null);
  eq([rm.action, rm.next], ["remove", [WIKI]], "B: an expired sighting entry is removed, other entries kept");
  eq(P(row({ independent_coords: [expired] }), null).next, null, "B: a row left with no entries returns to NULL");
  eq(P(row({ independent_coords: [expired] }), sight({ lat: 27.501 })).action, "remove", "B: a refused new sighting still lets the expired one be removed");
  eq(P(row({ status: "CLOSED_PERMANENTLY", independent_coords: [expired] }), null).action, "remove", "B: expired entries are removed from ineligible rows too");
  eq(P(row({ independent_coords: [entryAt(NOW - 3 * DAY)] }), null), { action: "none", reason: "no-fresh-sighting" }, "B: a live entry with no newer sighting is kept");

  const drawn = PROV.resolveMapCoordinate({ ...row(), independent_coords: add.next }, NOW);
  eq([drawn.ok, drawn.source, drawn.lat], [true, "google_places", 27.5001], "B: the written row draws from its sighting (own coordinate expired)");
  ok(!PROV.resolveMapCoordinate({ ...row(), independent_coords: add.next }, Date.parse(add.entry.observed_at) + 30 * DAY + 1000).ok, "B: and stops drawing 30 days after seen_at, not later");
}

// ── C ────────────────────────────────────────────────────────────────────────
const SB = { url: "https://fake-project.supabase.test", key: "service-role-test" };
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
function fakeRest(db) {
  const calls = [];
  const fetchImpl = async (url, opt = {}) => {
    calls.push(String(url));
    const u = new URL(String(url));
    if (u.origin !== SB.url) throw new Error("NON-SUPABASE FETCH " + url);
    const table = u.pathname.replace("/rest/v1/", "");
    const all = (k) => u.searchParams.getAll(k);
    const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b });
    const method = opt.method || "GET";
    if (table === "wf_job_pulse" && method === "POST") { db.pulses.push(JSON.parse(opt.body)); return json([]); }
    let rows = [...(db[table] || [])];
    for (const f of all("seen_at")) { const [op, v] = [f.slice(0, 3), f.slice(4)]; rows = rows.filter((r) => op === "gte" ? Date.parse(r.seen_at) >= Date.parse(v) : Date.parse(r.seen_at) <= Date.parse(v)); }
    for (const f of all("place_id")) {
      if (f.startsWith("gt.")) rows = rows.filter((r) => r.place_id > f.slice(3));
      else if (f.startsWith("eq.")) rows = rows.filter((r) => r.place_id === f.slice(3));
      else if (f.startsWith("in.(")) { const ids = new Set(f.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""))); rows = rows.filter((r) => ids.has(r.place_id)); }
      else throw new Error("unsupported place_id filter " + f);
    }
    for (const f of all("independent_coords")) {
      if (f.startsWith("cs.")) { const want = JSON.parse(f.slice(3)); rows = rows.filter((r) => Array.isArray(r.independent_coords) && want.every((w) => r.independent_coords.some((e) => Object.entries(w).every(([k, v]) => e[k] === v)))); }
      else if (f.startsWith("eq.")) { const want = canon(JSON.parse(f.slice(3))); rows = rows.filter((r) => r.independent_coords != null && canon(r.independent_coords) === want); }
      else if (f === "is.null") rows = rows.filter((r) => r.independent_coords == null);
      else throw new Error("unsupported coords filter " + f);
    }
    if (method === "PATCH") {
      if (!all("place_id").length || !all("independent_coords").length) throw new Error("PATCH without a row + compare-and-swap filter");
      const body = JSON.parse(opt.body);
      if (db.beforePatch) db.beforePatch(rows);
      const hit = (db[table] || []).filter((r) => rows.includes(r) && (all("independent_coords")[0] === "is.null" ? r.independent_coords == null : canon(r.independent_coords) === canon(JSON.parse(all("independent_coords")[0].slice(3)))));
      for (const r of hit) Object.assign(r, body);
      db.patches++;
      return json(hit.map((r) => ({ place_id: r.place_id })));
    }
    if (method !== "GET") throw new Error("unexpected " + method);
    if (u.searchParams.get("order")) rows.sort((a, b) => (a.place_id < b.place_id ? -1 : 1));
    const lim = Number(u.searchParams.get("limit") || 1e9);
    return json(rows.slice(0, lim).map((r) => JSON.parse(JSON.stringify(r))));
  };
  return { fetchImpl, calls };
}
function fixtureDb(now) {
  const id = (n) => "ChIJfixture" + String(n).padStart(14, "0");
  const ago = (d) => iso(now - d * DAY);
  const inv = [], pids = [];
  // 1 renew, 2 add, 3 remove-expired (no sighting), 4 keep (not newer), 5 over-50m, 6 atlas, 7 outside FL
  inv.push(row({ place_id: id(1), independent_coords: [WIKI, entryAt(now - 20 * DAY)] })); pids.push(sight({ place_id: id(1), seen_at: ago(1) }));
  inv.push(row({ place_id: id(2) })); pids.push(sight({ place_id: id(2), seen_at: ago(2) }));
  inv.push(row({ place_id: id(3), independent_coords: [entryAt(now - 35 * DAY)] }));
  inv.push(row({ place_id: id(4), independent_coords: [entryAt(Date.parse(ago(3)))] })); pids.push(sight({ place_id: id(4), seen_at: ago(3) }));
  inv.push(row({ place_id: id(5) })); pids.push(sight({ place_id: id(5), lat: 27.6, seen_at: ago(1) }));
  inv.push(row({ place_id: ATLAS_ID })); pids.push(sight({ place_id: ATLAS_ID, seen_at: ago(1) }));
  inv.push(row({ place_id: id(7), lat: 33.75, lng: -84.39 })); pids.push(sight({ place_id: id(7), lat: 33.7501, lng: -84.3901, seen_at: ago(1) }));
  pids.push(sight({ place_id: id(9), seen_at: ago(40) })); // stale sighting, never fetched
  return { wf_inventory: inv, wf_place_ids: pids, pulses: [], patches: 0, id };
}

async function checkRunner(L, ex) {
  const now = NOW;
  const db = fixtureDb(now);
  const { fetchImpl, calls } = fakeRest(db);
  const s = await L.runSightingRenewal({ sb: SB, fetchImpl, now, excluded: ex, pageSize: 2, idChunk: 2 });
  ok(calls.length > 0 && calls.every((c) => c.startsWith(SB.url + "/rest/v1/")), "C: every request goes to the Supabase REST URL");
  ok(!calls.some((c) => /googleapis|maps\.google|places\.google/i.test(c)), "C: zero Google calls");
  eq([s.renewed, s.added, s.expiredRemoved, s.conflicts, s.writeFailed], [1, 1, 1, 0, 0], "C: renewed 1, added 1, expired-removed 1");
  const by = new Map(db.wf_inventory.map((r) => [r.place_id, r]));
  eq(by.get(db.id(1)).independent_coords.map((e) => e.method), ["wikidata-p625", "wf_place_ids-sighting"], "C: renewal kept the Wikidata entry");
  eq(by.get(db.id(1)).independent_coords[1].observed_at, iso(now - DAY), "C: renewed observed_at = the new seen_at");
  eq(by.get(db.id(3)).independent_coords, null, "C: the expired-only row returned to NULL");
  eq([by.get(db.id(5)).independent_coords, by.get(ATLAS_ID).independent_coords, by.get(db.id(7)).independent_coords], [null, null, null], "C: over-50m, Atlas and outside-Florida rows untouched");
  ok(/renewed 1, added 1, expired-removed 1/.test(L.renewalNote(s)) && /skipped: /.test(L.renewalNote(s)), "C: the pulse note states renewed / added / expired-removed and skip reasons");
  ok(L.renewalNote({ ...s, skipped: { "not-newer": 99999, "no-fresh-sighting": 99999, "over-50m": 99999 }, sightingRejected: { "outside-florida": 99999, "seed-or-atlas-id": 99999, expired: 99999 }, sightingsFresh: 99999, sightingsUsable: 99999 }).length <= 200, "C: the note fits wf_job_pulse's 200 chars at production scale");

  const p0 = db.patches;
  const s2 = await L.runSightingRenewal({ sb: SB, fetchImpl, now, excluded: ex, pageSize: 2, idChunk: 2 });
  eq([s2.attempted, db.patches - p0], [0, 0], "C: a second run writes nothing (idempotent)");

  const db3 = fixtureDb(now);
  const r3 = fakeRest(db3);
  db3.beforePatch = (rows) => { for (const r of rows) if (r.place_id === db3.id(1)) r.independent_coords = [...r.independent_coords, { source: "osm", lat: 27.5, lng: -82.5, method: "osm-node" }]; };
  const s3 = await L.runSightingRenewal({ sb: SB, fetchImpl: r3.fetchImpl, now, excluded: ex });
  ok(s3.conflicts >= 1, "C: a concurrent write between read and PATCH is a conflict, not an overwrite");
  ok(db3.wf_inventory.find((r) => r.place_id === db3.id(1)).independent_coords.some((e) => e.source === "osm"), "C: the concurrent writer's entry survives");

  const db4 = fixtureDb(now);
  const s4 = await L.runSightingRenewal({ sb: SB, fetchImpl: fakeRest(db4).fetchImpl, now, excluded: ex, maxWrites: 1 });
  eq([s4.attempted, s4.expiredRemoved, s4.deferred], [1, 1, 2], "C: the batch cap defers the rest, compliance removals first");
}

// The real route, end to end, with a global fetch trap.
async function checkRoute() {
  const db = fixtureDb(Date.now());
  const { fetchImpl, calls } = fakeRest(db);
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  globalThis.fetch = fetchImpl;
  // Fixture values written explicitly (the ambient shell never decides a verdict).
  process.env.SUPABASE_URL = SB.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SB.key;
  process.env.CRON_SECRET = "test-secret";
  try {
    const { GET } = await import("../app/api/cron/sighting-renewal/route.js");
    const denied = await GET(new Request("https://x/api/cron/sighting-renewal"));
    eq(denied.status, 401, "C(route): no bearer -> 401, nothing runs");
    const n = calls.length;
    eq(n, 0, "C(route): the 401 path made no request");
    const res = await GET(new Request("https://x/api/cron/sighting-renewal", { headers: { authorization: "Bearer test-secret" } }));
    const body = await res.json();
    eq([res.status, body.renewed, body.added, body.expiredRemoved], [200, 1, 1, 1], "C(route): the route renews, adds and removes through the shared lib");
    eq(db.pulses.map((p) => [p.job, p.attempted, p.succeeded]), [["sighting-renewal", 3, 3]], "C(route): exactly one wf_job_pulse row under its own name");
    ok(/expired-removed 1/.test(db.pulses[0].note), "C(route): the pulse note says what was removed");
    ok(!calls.some((c) => !c.startsWith(SB.url)), "C(route): zero non-Supabase (Google) requests");
  } finally {
    globalThis.fetch = saved.fetch;
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) { if (k in saved.env) process.env[k] = saved.env[k]; else delete process.env[k]; }
  }
}

// ── D ────────────────────────────────────────────────────────────────────────
async function checkSqlParity(L, ex) {
  const db = new PGlite();
  await db.exec(`create table public.wf_inventory (place_id text primary key, lat float8, lng float8, status text, excluded bool, needs_review bool, refreshed_at timestamptz, independent_coords jsonb, signals jsonb);
    create table public.wf_place_ids (place_id text primary key, lat float8, lng float8, seen_at timestamptz);`);
  const now = Date.now();
  const ago = (d) => iso(now - d * DAY);
  const cases = [
    ["good", {}, {}], ["fl-edge", { lat: 24.3, lng: -82.5 }, { lat: 24.3, lng: -82.5 }],
    ["out-fl", { lat: 33.75, lng: -84.39 }, { lat: 33.7501, lng: -84.3901 }], ["zero", {}, { lat: 0, lng: 0 }],
    ["atlas", {}, {}, ATLAS_ID], ["seed", {}, {}, SEED_ID], ["far", {}, { lat: 27.501 }], ["near49", {}, { lat: 27.50044 }],
    ["fresh-own", { refreshed_at: ago(3) }, {}], ["excl", { excluded: true }, {}], ["review", { needs_review: true }, {}],
    ["closed", { status: "CLOSED_PERMANENTLY" }, {}], ["nullstatus", { status: null }, {}], ["nocoord", { lat: null, lng: null }, {}],
    ["old", {}, { seen_at: ago(31) }], ["future", {}, { seen_at: iso(now + DAY) }], ["nullrefresh", { refreshed_at: null }, {}],
  ];
  const expectJs = new Set();
  for (const [name, ro, so, pid] of cases) {
    const place_id = pid || "ChIJparity" + name.padEnd(16, "x");
    const r = row({ place_id, ...ro }), w = sight({ place_id, seen_at: ago(2), ...so });
    await db.query("insert into public.wf_inventory values ($1,$2,$3,$4,$5,$6,$7,null,null)", [place_id, r.lat, r.lng, r.status, r.excluded, r.needs_review, r.refreshed_at]);
    await db.query("insert into public.wf_place_ids values ($1,$2,$3,$4)", [place_id, w.lat, w.lng, w.seen_at]);
    const p = L.planRow(r, w, { now, excluded: ex });
    if (p.action === "write") expectJs.add(place_id);
  }
  const { BASE, SANE, NEAR } = L.sqlRules();
  const seeds = [...ex].map((i) => `'${i}'`).join(",");
  const res = await db.query(`with seeds as (select unnest(array[${seeds}]) as id) select i.place_id ${BASE} and ${SANE} and ${NEAR} order by 1`);
  const sqlSet = res.rows.map((r) => r.place_id);
  eq(sqlSet, [...expectJs].sort(), "D: the backfill SQL and the cron's planRow pick exactly the same rows");
  ok(sqlSet.length === 5, `D: positive control — 5 fixtures pass every rule (good, fl-edge, near49, nullstatus, nullrefresh); got ${sqlSet.length}`);
  await db.close();
}

async function run(L) {
  const ex = await checkExclusions(L);
  checkPlan(L, ex);
  await checkRunner(L, ex);
  await checkSqlParity(L, ex);
}

const real = await asModule(read(LIB));
eq(Object.keys(real).sort(), Object.keys(LIB_STATIC).sort(), "setup: the data-loaded lib matches lib/sightingRenewal.js");
const scriptSrc = read("scripts/backfill-coords-from-place-sightings.mjs");
ok(/from "\.\.\/lib\/sightingRenewal\.js"/.test(scriptSrc) && /sqlRules\(\)/.test(scriptSrc) && /loadExcludedIds\(\)/.test(scriptSrc), "setup: the backfill script takes its rules and exclusions from lib/sightingRenewal.js");
ok(!/24\.3|-87\.7|<= 50\b/.test(scriptSrc.replace(/^\s*\/\/.*$/gm, "")), "setup: the backfill script holds no private copy of the bbox / 50 m threshold");
const routeSrc = read("app/api/cron/sighting-renewal/route.js");
ok(/runSightingRenewal\(/.test(routeSrc) && /lib\/sightingRenewal\.js/.test(routeSrc), "setup: the cron route runs the shared lib");
const vercel = JSON.parse(read("vercel.json"));
ok((vercel.crons || []).some((c) => c.path === "/api/cron/sighting-renewal" && /^\d+ \d+ \* \* \*$/.test(c.schedule)), "setup: vercel.json schedules /api/cron/sighting-renewal daily");
ok(/'sighting-renewal',\s*1800/.test(read("supabase/migrations/20261015200000_wf_heartbeat_expected_sighting_renewal.sql")), "setup: a heartbeat row (1800 min) covers sighting-renewal");
await run(real);
await checkRoute();
const FIRST = assertions;

if (process.argv.includes("--red-prove")) {
  const mutations = [
    ["entry copies the stored inventory coordinate", "    const entry = sightingEntry(sighting);", "    const entry = { ...sightingEntry(sighting), lat: num(row.lat), lng: num(row.lng) };"],
    ["observed_at re-dated to now (extends past seen_at)", "    observed_at: observedAtFromSeenAt(w.seen_at),\n    method", "    observed_at: new Date().toISOString(),\n    method"],
    ["seed/atlas exclusion dropped", '  if (excluded && excluded.has(w.place_id)) return "seed-or-atlas-id";\n', ""],
    ["expired sighting entries kept", "  if (live.length < existing.length) {", "  if (false) {"],
    ["newer-only rule dropped", "    if (Date.parse(entry.observed_at) > newestExisting) {", "    if (true) {"],
    ["Florida bbox dropped", '  if (!inFlorida(lat, lng)) return "outside-florida";\n', ""],
    ["50 m consistency widened to 5 km", "export const CONSISTENCY_MAX_M = 50;", "export const CONSISTENCY_MAX_M = 5000;"],
    ["a Google call added to the runner", "  const stats = {\n    sightingsFresh: 0,", '  await fetchImpl("https://places.googleapis.com/v1/places:searchText", { method: "POST" }).catch(() => {});\n  const stats = {\n    sightingsFresh: 0,'],
    ["compare-and-swap dropped", 'const guard = old == null ? "independent_coords=is.null" : `independent_coords=eq.${enc(JSON.stringify(old))}`;', 'const guard = "independent_coords=not.is.null";'],
  ];
  const reds = [];
  for (const [label, find, replace] of mutations) {
    const mod = await asModule(mutated(find, replace));
    try { await run(mod); } catch (e) {
      if (/red-prove setup/.test(String(e && e.message))) throw e;
      reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0].slice(0, 140)}`); continue;
    }
    throw new Error(`red-prove: ${label} stayed GREEN`);
  }
  console.log(`test-sighting-renewal: red-prove OK — ${reds.length}/${mutations.length} mutations went RED`);
}

console.log(`test-sighting-renewal: OK — ${FIRST} assertions. A seed list locked to SEED_FILES, Atlas + seed ids excluded; B entry = sighting lat/lng (never the stored coordinate), observed_at = seen_at truncated, newer-only, other entries kept, expired removed, 50 m / bbox / 0/0 / eligibility; C runner + real route on a fake PostgREST: renew/add/remove, idempotent, compare-and-swap, batch cap, zero non-Supabase (Google) requests, one pulse; D backfill SQL in PGlite picks exactly planRow's rows.`);
