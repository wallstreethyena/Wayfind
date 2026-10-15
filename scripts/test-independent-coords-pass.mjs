// scripts/test-independent-coords-pass.mjs — DATA PASS B (2026-10-15):
// licensed non-Google map coordinates (Wikidata P625, Census geocodes of
// official venue addresses) for wf_inventory.independent_coords.
//
// Asserted on the CALL (import + invoke; the committed SQL is EXECUTED in an
// in-memory PGlite), each with positive and negative controls:
//   A. LAWFUL MATCH (scripts/lib/independentCoords.mjs): a Wikidata match is
//      written only when a Google coordinate INSIDE its 30-day window
//      corroborates it; an expired one is never evidence (-> hold), a far one
//      rejects; disambiguation / unserved / no item are refused. An official
//      address is refused when it looks like a Google formattedAddress, comes
//      from a non-official source, or the Census point is for another number.
//      No written entry ever carries a Google coordinate.
//   B. DRAWABILITY (lib/coordProvenance.js): a row whose own Google coordinate
//      expired draws from its wikidata / official_venue entry, with no expiry
//      and no credit line (CC0 / public domain).
//   C. THE COMMITTED SQL (supabase/migrations/20261015180000_*, 20261015180100_*
//      and their supabase/data-fixes/*_REVERSE.sql): byte-identical to what the
//      lib generates for its own rows; executed against a seeded table it
//      appends exactly one entry per row, keeps existing sightings and lat/lng,
//      is a no-op the second time, skips a row that already has one, and the
//      reverse removes only its own entries (empty array -> NULL).
//
// Red-proof: `--red-prove` re-runs A-C against mutated copies (30-day window
// widened, Google-address filter removed, idempotency guard removed, reverse
// filter removed, wikidata dropped from COORD_SOURCES) and requires each RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import * as PROV_STATIC from "../lib/coordProvenance.js";
import * as LIB_STATIC from "./lib/independentCoords.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DAY = 86400000;
const NOW = Date.parse("2026-10-15T12:00:00Z");
const HARVEST = "2026-10-15T12:00:00.000Z";
let assertions = 0;
const ok = (v, m) => { assert.ok(v, m); assertions++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); assertions++; };

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
function mutated(rel, find, replace) {
  const raw = read(rel);
  assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, `red-prove setup: mutation of ${rel} did not apply`);
  return out;
}
const asModule = (src) => import("data:text/javascript," + encodeURIComponent(src));

const PASSES = [
  { fwd: "supabase/migrations/20261015180000_wf_inventory_wikidata_coords.sql", rev: "supabase/data-fixes/20261015180000_wf_inventory_wikidata_coords_REVERSE.sql", source: "wikidata", minRows: 150 },
  { fwd: "supabase/migrations/20261015180100_wf_inventory_official_address_coords.sql", rev: "supabase/data-fixes/20261015180100_wf_inventory_official_address_coords_REVERSE.sql", source: "official_venue", minRows: 120 },
];

// ── A ────────────────────────────────────────────────────────────────────────
function checkClassify(L) {
  const fresh = (ageDays, d = 0) => ({ kind: "sighting", lat: 27.5 + d, lng: -82.5, observed_at: new Date(NOW - ageDays * DAY).toISOString() });
  const match = (over = {}) => ({ place_id: "ChIJtestplace0001", title: "Test Museum", confidence: 1, fetched_at: "2026-10-12T00:00:00Z", category: "food", served: true, fresh: [fresh(5)], ...over });
  const wd = (over = {}) => ({ qid: "Q1", disambiguation: false, dissolved: false, coords: [{ lat: 27.5005, lng: -82.5, rank: "normal" }], ...over });
  const w = L.classifyWikidata(match(), wd(), NOW, HARVEST);
  eq([w.decision, w.entry && w.entry.source, w.entry && w.entry.ref], ["write", "wikidata", "Q1"], "A: a fresh sighting 56 m away corroborates the Wikidata point -> write");
  ok(!JSON.stringify(w.entry).includes("27.5,") && w.entry.lat === 27.5005 && w.entry.evidence.distance_m === 56, "A: the entry carries the Wikidata coordinate and a distance, never the Google coordinate");
  eq(L.classifyWikidata(match({ fresh: [fresh(31)] }), wd(), NOW, HARVEST).reason, "no-permitted-corroboration", "A: a 31-day-old Google coordinate is not evidence -> hold");
  eq(L.classifyWikidata(match({ fresh: [] }), wd(), NOW, HARVEST).decision, "hold", "A: no corroboration -> hold, not write");
  eq(L.classifyWikidata(match({ fresh: [fresh(5, 0.01)] }), wd(), NOW, HARVEST).reason, "corroboration-distance", "A: a storefront 1.1 km from its fresh sighting is refused");
  eq(L.classifyWikidata(match({ category: "attractions", fresh: [fresh(5, 0.01)] }), wd(), NOW, HARVEST).decision, "write", "A: an attraction gets the wide limit");
  eq(L.classifyWikidata(match(), wd({ disambiguation: true }), NOW, HARVEST).reason, "disambiguation", "A: disambiguation refused");
  eq(L.classifyWikidata(match({ served: false }), wd(), NOW, HARVEST).reason, "not-served", "A: unserved row refused");
  eq(L.classifyWikidata(match(), null, NOW, HARVEST).reason, "no-wikidata-item", "A: no item refused");

  const ev = (over = {}) => ({ event_id: "ev1", address: "1534 Mound St", city: "Sarasota", source_type: "official-organizer", source_url: "https://selby.org/x", census: { lat: 27.326, lng: -82.54, matchedAddress: "1534 MOUND ST, SARASOTA, FL, 34236" }, ...over });
  const grp = (events, over = {}) => ({ place_id: "ChIJtestplace0002", category: "attractions", served: true, fresh: [], events, ...over });
  const o = L.classifyOfficialAddress(grp([ev()]), NOW, HARVEST);
  eq([o.decision, o.entry && o.entry.source, o.entry && o.entry.method], ["write", "official_venue", L.OFFICIAL_ADDRESS_METHOD], "A: editor-linked official address with a Census point -> write");
  eq(L.classifyOfficialAddress(grp([ev({ address: "1534 Mound St, Sarasota, FL 34236, USA" })]), NOW, HARVEST).reason, "google-formatted-address", "A: a Google-formatted address is refused");
  eq(L.classifyOfficialAddress(grp([ev({ source_type: "media-coverage" })]), NOW, HARVEST).reason, "non-official-address-source", "A: a non-official address source is refused");
  eq(L.classifyOfficialAddress(grp([ev({ census: { lat: 27.3, lng: -82.5, matchedAddress: "1500 MOUND ST" } })]), NOW, HARVEST).reason, "census-house-number-differs", "A: a Census point for another number is refused");
  eq(L.classifyOfficialAddress(grp([ev(), ev({ event_id: "ev2", census: { lat: 27.34, lng: -82.54, matchedAddress: "1534 MOUND ST" } })]), NOW, HARVEST).reason, "conflicting-official-addresses", "A: two official points 1.5 km apart are refused");
  eq(L.classifyOfficialAddress(grp([ev()], { fresh: [{ kind: "row", lat: 27.4, lng: -82.54, observed_at: new Date(NOW - DAY).toISOString() }] }), NOW, HARVEST).reason, "corroboration-distance", "A: a fresh Google coordinate 8 km away refuses the official point");
  assert.throws(() => L.forwardSql([{ place_id: "ChIJtestplace0003", entry: { source: "google_places", method: "x", lat: 1, lng: 1 } }], { title: "t" }), /google_places/);
  assertions++;
}

// ── B ────────────────────────────────────────────────────────────────────────
function checkDraw(prov) {
  const expired = { lat: 27.5, lng: -82.5, refreshed_at: new Date(NOW - 60 * DAY).toISOString() };
  eq(prov.resolveMapCoordinate(expired, NOW).ok, false, "B: negative control — an expired Google row alone is not drawable");
  for (const [source, method] of [["wikidata", "wikidata-p625-via-wikipedia-match"], ["official_venue", "census-geocoder-official-address"]]) {
    const row = { ...expired, independent_coords: [{ source, method, lat: 27.5004, lng: -82.5001, observed_at: HARVEST, attribution: null, verified: true }] };
    const v = prov.mapCoordVerdict(row, NOW);
    eq([v.ok, v.source, v.until, v.attribution], [true, source, undefined, undefined], `B: an expired row draws from its ${source} entry, no expiry, no credit line`);
    eq(prov.mapCoordVerdict(row, NOW + 3650 * DAY).ok, true, `B: a ${source} entry is still drawable ten years later`);
  }
}

// ── C ────────────────────────────────────────────────────────────────────────
function parseWrites(sql) {
  const out = [];
  for (const m of sql.matchAll(/^ {2}\('([^']+)', '((?:[^']|'')*)'::jsonb\)[,;]$/gm)) out.push({ place_id: m[1], entry: JSON.parse(m[2].replace(/''/g, "'")) });
  return out;
}

async function checkSql(L, prov) {
  for (const p of PASSES) {
    const fwd = read(p.fwd), rev = read(p.rev);
    const writes = parseWrites(fwd);
    ok(writes.length >= p.minRows, `C: ${p.fwd} carries ${writes.length} rows (>= ${p.minRows}; parser found its subject)`);
    ok(writes.every((w) => w.entry.source === p.source && prov.judgeCoordinate(w.entry, NOW).ok), `C: every ${p.source} entry is a drawable non-Google coordinate`);
    ok(/"source":"(wikidata|official_venue)"/.test(fwd) && !/"source":"google_places"/.test(fwd), `C: ${p.fwd} writes no google_places entry (probe finds its own source first)`);
    const title = path.basename(p.fwd);
    const header = fwd.slice(fwd.indexOf("\n") + 1, fwd.indexOf("-- No explicit BEGIN"));

    const genFwd = L.forwardSql(writes, { title, header });
    const genRev = L.reverseSql(writes, { title: path.basename(p.rev) });

    const db = new PGlite();
    await db.exec(`create table public.wf_inventory (place_id text primary key, lat double precision, lng double precision, refreshed_at timestamptz, independent_coords jsonb,
      constraint wf_inventory_independent_coords_is_array check (independent_coords is null or jsonb_typeof(independent_coords) = 'array'));`);
    const [a, b, c] = writes.map((w) => w.place_id);
    const sighting = { source: "google_places", method: "wf_place_ids-sighting", lat: 1.5, lng: 2.5, observed_at: "2026-10-10T00:00:00Z" };
    const prior = { ...writes[2].entry, ref: "PRIOR", lat: 9 };
    for (const w of writes) await db.query("insert into public.wf_inventory values ($1, 10, 20, null, $2)", [w.place_id,
      w.place_id === a ? JSON.stringify([sighting]) : w.place_id === c ? JSON.stringify([prior]) : null]);
    await db.query("insert into public.wf_inventory values ('ChIJ_not_in_this_pass_0', 10, 20, null, $1)", [JSON.stringify([sighting])]);
    const snapshot = async () => (await db.query("select place_id, lat, lng, independent_coords ic from public.wf_inventory order by place_id")).rows;

    await db.exec(genFwd);
    const s1 = await snapshot();
    const byId = new Map(s1.map((r) => [r.place_id, r]));
    eq(byId.get(a).ic, [sighting, writes[0].entry], `C(${p.source}): a row with a sighting keeps it and gains exactly the pass entry`);
    eq(byId.get(b).ic, [writes[1].entry], `C(${p.source}): a NULL row becomes a one-element array`);
    eq(byId.get(c).ic, [prior], `C(${p.source}): a row that already has an entry for this source+method is left alone`);
    ok(s1.every((r) => r.lat === 10 && r.lng === 20), `C(${p.source}): lat/lng never touched`);
    eq(byId.get("ChIJ_not_in_this_pass_0").ic, [sighting], `C(${p.source}): rows outside the pass are untouched`);
    await db.exec(genFwd);
    eq(await snapshot(), s1, `C(${p.source}): applying twice is a no-op`);

    await db.exec(genRev);
    const s2 = new Map((await snapshot()).map((r) => [r.place_id, r]));
    eq(s2.get(a).ic, [sighting], `C(${p.source}): reverse keeps the sighting`);
    eq(s2.get(b).ic, null, `C(${p.source}): reverse returns an emptied array to NULL`);
    eq(s2.get("ChIJ_not_in_this_pass_0").ic, [sighting], `C(${p.source}): reverse leaves other rows alone`);
    await db.close();

    ok(genFwd === fwd, `C: ${p.fwd} is exactly what scripts/lib/independentCoords.mjs generates (re-run the emit step)`);
    ok(genRev === rev, `C: ${p.rev} is exactly what scripts/lib/independentCoords.mjs generates (re-run the emit step)`);
  }
}

async function run({ lib, prov }) {
  checkClassify(lib);
  checkDraw(prov);
  await checkSql(lib, prov);
}

const LIB = "scripts/lib/independentCoords.mjs";
const PROV = "lib/coordProvenance.js";
const real = async () => ({ lib: await asModule(read(LIB)), prov: await asModule(read(PROV)) });

// The data:-loaded copies (needed so --red-prove can mutate them) must be the
// same modules the app and the generator import.
eq(Object.keys((await real()).prov.COORD_SOURCES), Object.keys(PROV_STATIC.COORD_SOURCES), "setup: data-loaded coordProvenance matches lib/coordProvenance.js");
eq(Object.keys((await real()).lib).sort(), Object.keys(LIB_STATIC).sort(), "setup: data-loaded independentCoords matches scripts/lib/independentCoords.mjs");
await run(await real());
const FIRST_RUN_ASSERTIONS = assertions;

if (process.argv.includes("--red-prove")) {
  const mutations = [
    ["Google corroboration window widened to 10 years", LIB, "export const GOOGLE_WINDOW_DAYS = 30;", "export const GOOGLE_WINDOW_DAYS = 3650;"],
    ["Google-formatted address filter removed", LIB, 'return /,\\s*(USA|United States)\\s*$/i.test(String(a || ""));', "return false;"],
    ["forward idempotency guard removed", LIB, "   and not exists (\n     select 1 from jsonb_array_elements", "   and exists (\n     select 1 from jsonb_array_elements"],
    ["reverse source+method filter removed", LIB, "          where not (e->>'source' = ${sqlStr(source)} and e->>'method' = ${sqlStr(method)})), '[]'::jsonb), '[]'::jsonb)", "          where false), '[]'::jsonb), '[]'::jsonb)"],
    ["wikidata dropped from COORD_SOURCES", PROV, "  wikidata: Object.freeze({", "  wikidata_removed: Object.freeze({"],
  ];
  const reds = [];
  for (const [label, rel, find, replace] of mutations) {
    const src = mutated(rel, find, replace);
    const mods = await real();
    if (rel === LIB) mods.lib = await asModule(src); else mods.prov = await asModule(src);
    try { await run(mods); } catch (e) {
      if (/red-prove setup/.test(String(e && e.message))) throw e;
      reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0].slice(0, 140)}`); continue;
    }
    throw new Error(`red-prove: ${label} stayed GREEN`);
  }
  console.log(`test-independent-coords-pass: red-prove OK — ${reds.length}/${mutations.length} mutations went RED`);
}

console.log(`test-independent-coords-pass: OK — ${FIRST_RUN_ASSERTIONS} assertions. A lawful match (fresh-only Google corroboration, expired -> hold, far -> reject; Google-formatted / non-official / wrong-number addresses refused; no Google coordinate in any entry), B wikidata + official_venue draw with no expiry and no credit line, C both committed passes byte-identical to the generator and executed in PGlite (append-only, idempotent, sightings + lat/lng kept, reverse removes only its own entries).`);
