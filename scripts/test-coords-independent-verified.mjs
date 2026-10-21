// scripts/test-coords-independent-verified.mjs — GOOGLE-FREE EVIDENCE GUARD for
// the 2026-10-21 re-verification of the 247 coordinates held from PR #1809.
//
// The question this answers: "does the new pending file contain any row whose
// evidence chain includes Google?" Asserted on the CALL (the committed SQL is
// parsed and EXECUTED in PGlite; the checker is imported and invoked), with a
// positive control (the held #1809 Wikidata file, whose every row carries a
// google_places corroboration, must be flagged row-for-row) and a negative
// control (a clean synthetic row must pass).
//
//   A. EVERY ROW of supabase/migrations/<stamp>_wf_inventory_coords_independent_verified.sql:
//      no key or value naming Google / a Wikipedia-title match / a corroboration,
//      no Google-hosted URL, identity basis in the Wayfind-owned set, method is
//      one of the two verified methods, and the two non-Google points really
//      agree (distance recomputed from the evidence, <= limit_m).
//   B. The SQL rows equal the audit CSV's VERIFIED_INDEPENDENT rows exactly, and
//      every audit row flagged identity_relies_on_google_name=yes is absent.
//   C. The three #1809 files are untouched (sha256 = their pending declarations)
//      and the new file is declared pending with owner + tracking.
//   D. Executed against a seeded table: one entry per row, idempotent, keeps
//      lat/lng, the reverse removes only its own entries.
//
// --red-prove: re-runs A/B against mutated copies (a google corroboration
// injected, a Google-name identity injected, a Google URL injected, the
// distance pushed past the limit, the checker's google test removed) and
// requires each RED.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as LIB_STATIC from "./lib/independentVerify.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const NEW_NAME = "_wf_inventory_coords_independent_verified.sql";
const MIG = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(NEW_NAME));
assert.equal(MIG.length, 1, `exactly one *${NEW_NAME} migration expected, found ${MIG.length}`);
const FWD = `supabase/migrations/${MIG[0]}`;
const STAMP = MIG[0].slice(0, 14);
const REV = `supabase/data-fixes/${STAMP}_wf_inventory_coords_independent_verified_REVERSE.sql`;
const CSV = "docs/audits/coords-independent-verification-2026-10-21.csv";
const HELD = [
  "supabase/migrations/20261015180000_wf_inventory_wikidata_coords.sql",
  "supabase/migrations/20261015180100_wf_inventory_official_address_coords_corroborated.sql",
  "supabase/migrations/20261015180200_wf_inventory_official_address_coords_uncorroborated.sql",
];
let assertions = 0;
const ok = (v, m) => { assert.ok(v, m); assertions++; };

export function parseRows(sql) {
  return [...sql.matchAll(/^ {2}\('([^']+)', '(.*)'::jsonb\)[,;]?$/gm)].map((m) => ({ place_id: m[1], entry: JSON.parse(m[2].replace(/''/g, "'")) }));
}
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

// Returns the list of problems for ONE row (empty = Google-free and consistent).
export function rowProblems(L, row) {
  const p = [];
  const e = row.entry || {};
  if (L.evidenceHasGoogle(e)) p.push("evidence-contains-google");
  // Raw-text sweep independent of the lib walker: "google" anywhere (keys or
  // values), and the #1809 corroboration/match keys anywhere as KEYS. (The
  // editor source_type value "organizer-with-corroboration" is a wf_events
  // label, not evidence; the address is re-confirmed on the official page.)
  const raw = JSON.stringify(e);
  if (/google/i.test(raw) || /"(?:[^"]*_)?(?:corroboration|wikipedia_title|match_confidence)[^"]*"\s*:/i.test(raw)) p.push("google-token-in-entry");
  const urls = JSON.stringify(e).match(/https?:\/\/[^"\s]+/g) || [];
  if (urls.some((u) => L.isGoogleUrl(u))) p.push("google-url");
  if (e.source === "google_places") p.push("google-source");
  const ev = e.evidence || {};
  if (!L.NON_GOOGLE_IDENTITY.has(ev.identity_basis)) p.push("identity-not-wayfind-owned");
  if (e.source === "wikidata") {
    if (e.method !== L.WIKIDATA_VERIFIED_METHOD) p.push("wrong-method");
    if (!L.validLatLng(ev.census_lat, ev.census_lng)) p.push("no-second-point");
    else if (L.haversineM(e, { lat: ev.census_lat, lng: ev.census_lng }) > ev.limit_m + 1) p.push("points-disagree");
    if (!ev.official_address_url) p.push("no-official-address-url");
  } else if (e.source === "official_venue") {
    if (e.method !== L.CENSUS_VERIFIED_METHOD) p.push("wrong-method");
    if (!ev.second_source || !(ev.distance_m <= ev.limit_m)) p.push("no-agreeing-second-source");
    if (!ev.page_states_address_at || !ev.source_url) p.push("official-page-not-confirmed");
  } else p.push("unknown-source");
  if (!(ev.limit_m === L.agreementLimitM(row.category ?? null) || ev.limit_m === 250 || ev.limit_m === 1500)) p.push("limit-out-of-policy");
  return p;
}

function checkAll(L, fwdSql, csvText) {
  const rows = parseRows(fwdSql);
  ok(rows.length > 0, "new file has rows");
  for (const r of rows) {
    const probs = rowProblems(L, r);
    ok(probs.length === 0, `${r.place_id} (${r.entry.source}): ${probs.join(", ")}`);
  }
  const audit = parseCsv(csvText);
  ok(audit.length === 247, `audit CSV covers all 247 held rows (got ${audit.length})`);
  const verified = audit.filter((a) => a.class === L.VERIFIED);
  const key = (pid, src) => `${pid}|${src}`;
  const sqlKeys = new Set(rows.map((r) => key(r.place_id, r.entry.source === "wikidata" ? "wikidata" : "census")));
  const csvKeys = new Set(verified.map((a) => key(a.place_id, a.file)));
  ok(sqlKeys.size === rows.length, "no duplicate place_id+source in the new file");
  ok([...sqlKeys].every((k) => csvKeys.has(k)) && [...csvKeys].every((k) => sqlKeys.has(k)), `SQL rows (${sqlKeys.size}) == audit VERIFIED rows (${csvKeys.size})`);
  for (const a of audit) {
    if (a.identity_relies_on_google_name === "yes") ok(!sqlKeys.has(key(a.place_id, a.file)), `${a.place_id}: identity relies on a Google name but is in the new file`);
    ok(a.class !== L.VERIFIED || /^https?:\/\//.test(a.official_address_url || a.event_source_url || ""), `${a.place_id}: verified audit row carries an evidence URL`);
  }
  return { rows: rows.length, audit: audit.length, verified: verified.length };
}

async function main(L, fwdSql, csvText) {
  // positive control: the held #1809 Wikidata file is Google-corroborated on every row
  const held = parseRows(read(HELD[0]));
  ok(held.length === 192, "positive control: held Wikidata file parses to 192 rows");
  ok(held.every((r) => rowProblems(L, r).includes("evidence-contains-google")), "positive control: every held #1809 Wikidata row is flagged as carrying Google evidence");
  const heldCe = parseRows(read(HELD[1]));
  ok(heldCe.length === 55 && heldCe.every((r) => rowProblems(L, r).length > 0), "positive control: every held #1809 corroborated Census row is flagged");
  // negative control
  const clean = { place_id: "ChIJcleancontrol000000000000", entry: { source: "wikidata", lat: 27.3679, lng: -82.5563, method: L.WIKIDATA_VERIFIED_METHOD, ref: "Q1", evidence: { census_lat: 27.3685, census_lng: -82.5560, limit_m: 1500, official_address_url: "https://example.org/visit", identity_basis: "atlas-owner-sheet" } } };
  ok(rowProblems(L, clean).length === 0, `negative control: a clean row passes (${rowProblems(L, clean).join(",")})`);
  return checkAll(L, fwdSql, csvText);
}

const asModule = (src) => import("data:text/javascript," + encodeURIComponent(src));
async function redProve() {
  const fwd = read(FWD), csv = read(CSV);
  const first = parseRows(fwd)[0];
  const swap = (mut) => { const e = JSON.stringify(first.entry).replace(/'/g, "''"); const m = JSON.stringify(mut(JSON.parse(JSON.stringify(first.entry)))).replace(/'/g, "''"); assert.ok(fwd.includes(e), "red-prove setup: first entry found"); return fwd.replace(e, m); };
  const cases = [
    ["google corroboration injected", () => main(LIB_STATIC, swap((x) => { x.evidence.corroboration = "google_places-row"; return x; }), csv)],
    ["google-name identity injected", () => main(LIB_STATIC, swap((x) => { x.evidence.identity_basis = "google-name-wikipedia-match"; return x; }), csv)],
    ["google URL injected", () => main(LIB_STATIC, swap((x) => { x.evidence.source_url = "https://maps.app.goo.gl/abc"; x.evidence.official_address_url = "https://maps.app.goo.gl/abc"; return x; }), csv)],
    ["points pushed apart", () => main(LIB_STATIC, swap((x) => { x.lat += 0.2; if (x.evidence.distance_m != null) x.evidence.distance_m = 99999; return x; }), csv)],
    ["checker google test removed", async () => {
      const src = read("scripts/lib/independentVerify.mjs");
      const find = "if (typeof v === \"string\") { if (/google/i.test(v) || isGoogleUrl(v)) bad = true; return; }";
      assert.ok(src.includes(find), "red-prove setup: checker line present");
      const M = await asModule(src.replace(find, "if (typeof v === \"string\") return;").replace(/\/google\|wikipedia_title\|match_confidence\|corroboration\/i/, "/^$/"));
      // with a weakened lib the positive control must go red
      return main(M, fwd, csv);
    }],
  ];
  for (const [name, fn] of cases) {
    let red = false;
    try { await fn(); } catch { red = true; }
    assert.ok(red, `red-prove: "${name}" should have gone RED but stayed green`);
    console.log(`  red-prove ✓ ${name} -> RED`);
  }
}

const res = await main(LIB_STATIC, read(FWD), read(CSV));

// C. held files untouched + new file declared pending
const pending = JSON.parse(read("scripts/migration-pending-apply.json"));
const sha = (rel) => createHash("sha256").update(readFileSync(path.join(ROOT, rel))).digest("hex");
for (const h of HELD) {
  const d = pending.find((x) => x.file === h);
  ok(d && d.sha256 === sha(h), `${h} is still declared pending and byte-identical (on hold)`);
}
const mine = pending.find((x) => x.file === FWD);
ok(mine && mine.sha256 === sha(FWD) && mine.decision_owner && mine.tracking && /NOT APPLIED|Not applied/i.test(mine.reason), `${FWD} declared pending with owner, tracking, sha256 and "not applied"`);
ok(read(REV).includes("REVERSE"), "reverse file exists");

// D. execute
{
  const db = new PGlite();
  await db.exec("create table public.wf_inventory (place_id text primary key, lat double precision, lng double precision, independent_coords jsonb);");
  const rows = parseRows(read(FWD));
  const ids = [...new Set(rows.map((r) => r.place_id))];
  for (const [i, id] of ids.entries()) await db.query("insert into public.wf_inventory values ($1, 1, 2, $2::jsonb)", [id, i === 0 ? JSON.stringify([{ source: "google_places", method: "x", lat: 1, lng: 2 }]) : null]);
  await db.exec(read(FWD));
  const r1 = await db.query("select place_id, lat, lng, independent_coords from public.wf_inventory order by place_id");
  const total = r1.rows.reduce((n, r) => n + (r.independent_coords || []).filter((e) => e.method === LIB_STATIC.WIKIDATA_VERIFIED_METHOD || e.method === LIB_STATIC.CENSUS_VERIFIED_METHOD).length, 0);
  ok(total === rows.length, `forward appends exactly one entry per row (${total}/${rows.length})`);
  ok(r1.rows.every((r) => r.lat === 1 && r.lng === 2), "lat/lng untouched");
  await db.exec(read(FWD));
  const r2 = await db.query("select independent_coords from public.wf_inventory");
  ok(r2.rows.reduce((n, r) => n + (r.independent_coords || []).length, 0) === total + 1, "second run is a no-op");
  await db.exec(read(REV));
  const r3 = await db.query("select place_id, independent_coords from public.wf_inventory");
  ok(r3.rows.filter((r) => r.independent_coords !== null).length === 1 && r3.rows.find((r) => r.place_id === ids[0]).independent_coords.length === 1, "reverse removes only its own entries; untouched sighting kept; emptied arrays -> NULL");
}

if (process.argv.includes("--red-prove")) await redProve();
console.log(`test-coords-independent-verified: OK — ${assertions} assertions; ${res.rows} Google-free rows in ${MIG[0]} == ${res.verified} VERIFIED_INDEPENDENT of ${res.audit} audited (positive control: 192+55 held #1809 rows all flagged; negative control passes)`);
