// gate-locality-census — the second gate on a wf_inventory.locality backfill.
//
// scripts/backfill-locality-from-events.mjs proposes candidates from OWNED
// evidence (wf_events.city + the event address's city slot). That is a
// MAILING city. The accepted locality rule (docs/audits/2026-10-08-statewide/)
// is the Census place that CONTAINS the venue's point, and on 2026-11-03 36 of
// the 118 proposed rows failed it (SeaWorld "Orlando" is unincorporated Orange
// County; Downtown Wellen Park "Venice" is inside North Port). See
// scripts/lib/localityEvidence.mjs, defect 3.
//
// This script gives EVERY candidate a disposition and emits a migration that
// writes only the eligible ones:
//   eligible     Census place for the row's own point == the proposed city
//   conflicting  the point is inside a DIFFERENT Census place (not written;
//                a different city than the owned evidence is a decision)
//   unsupported  the point is in no Census place (unincorporated; not written)
//
// Inputs (all committed except the coordinates):
//   docs/audits/<name>.csv          the candidates (first 6 columns)
//   docs/audits/<name>.census.json  US Census geocoder answer per place_id
//                                   (public domain; no coordinates stored)
// Modes:
//   node scripts/gate-locality-census.mjs --name=<name>
//       re-emit from the committed evidence (deterministic, offline)
//   node scripts/gate-locality-census.mjs --name=<name> --lookup=<coords file>
//       refresh the Census evidence first; coords file is "id|lat|lng;..."
//       read from wf_inventory (kept out of the repo)
//
// Never writes to the database.
import { readFileSync, writeFileSync } from "node:fs";
import { censusLocality, censusDisposition } from "./lib/localityEvidence.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const NAME = arg("name");
if (!NAME || !/^\d{14}_wf_inventory_locality_[a-z_]+$/.test(NAME)) {
  console.error("usage: node scripts/gate-locality-census.mjs --name=<YYYYMMDDHHMMSS>_wf_inventory_locality_<slug> [--lookup=<coords>]");
  process.exit(2);
}
const CSV = `docs/audits/${NAME}.csv`;
const EVIDENCE = `docs/audits/${NAME}.census.json`;

function parseCsv(text) {
  return text.trim().split("\n").map((l) => (l.match(/"((?:[^"]|"")*)"|[^,]+|(?<=,)(?=,|$)|^(?=,)/g) || [])
    .map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"')));
}
const [head, ...lines] = parseCsv(readFileSync(CSV, "utf8"));
if (head[0] !== "place_id" || head[2] !== "locality_to_set") throw new Error(`${CSV}: unexpected header ${head.join(",")}`);
const candidates = lines.filter((r) => r[3] !== "EXCLUDED").map((r) => ({
  place_id: r[0], name: r[1], city: r[2], tier: r[3], event: r[4], address: r[5],
}));

let evidence;
const lookup = arg("lookup");
if (lookup) {
  const coords = new Map(readFileSync(lookup, "utf8").trim().split(";").map((s) => { const [id, lat, lng] = s.split("|"); return [id, { lat: +lat, lng: +lng }]; }));
  evidence = { source: "US Census Bureau geocoder, geographies/coordinates, Public_AR_Current / Current_Current, layers Incorporated Places + Census Designated Places + Counties (public domain, free)", queried: new Date().toISOString(), rows: {} };
  for (const c of candidates) {
    const p = coords.get(c.place_id);
    if (!p) throw new Error(`no coordinates for ${c.place_id}`);
    const u = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${p.lng}&y=${p.lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Incorporated%20Places,Census%20Designated%20Places,Counties&format=json`;
    let j = null;
    for (let t = 0; t < 3 && !j; t++) {
      try { const r = await fetch(u); if (r.ok) j = await r.json(); } catch { /* retry */ }
      if (!j) await new Promise((s) => setTimeout(s, 1500));
    }
    if (!j) throw new Error(`Census lookup failed for ${c.place_id}; refusing to emit a partial gate`);
    const g = j.result?.geographies || {};
    evidence.rows[c.place_id] = {
      inc: (g["Incorporated Places"] || []).map((x) => x.BASENAME || x.NAME),
      cdp: (g["Census Designated Places"] || []).map((x) => x.BASENAME || x.NAME),
      county: (g["Counties"] || []).map((x) => x.BASENAME),
    };
    await new Promise((s) => setTimeout(s, 250));
  }
  writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 1) + "\n");
} else {
  evidence = JSON.parse(readFileSync(EVIDENCE, "utf8"));
}

const rows = candidates.map((c) => {
  const geo = evidence.rows[c.place_id];
  if (!geo) throw new Error(`${EVIDENCE} has no Census answer for ${c.place_id}`);
  return { ...c, geo, census: censusLocality(geo), disposition: censusDisposition(geo, c.city) };
}).sort((a, b) => (a.city + a.place_id).localeCompare(b.city + b.place_id));
const eligible = rows.filter((r) => r.disposition === "eligible");
const count = (d) => rows.filter((r) => r.disposition === d).length;
const esc = (s) => String(s).replace(/'/g, "''");
const ids = eligible.map((r) => `'${esc(r.place_id)}'`).join(",");

const header = `-- Census-gated by scripts/gate-locality-census.mjs (--name=${NAME}).
-- Candidates: docs/audits/${NAME}.csv (one disposition per row)
-- Census evidence: docs/audits/${NAME}.census.json
-- Reverse: supabase/data-fixes/${NAME}_REVERSE.sql
--
-- Fills wf_inventory.locality for ${eligible.length} places. Each row needs BOTH:
--   owned evidence: wf_events.city, with the event address's city slot equal
--     to it (scripts/backfill-locality-from-events.mjs, tier A), AND
--   the accepted rule: the US Census place containing the row's own point is
--     that same city (incorporated place, else Census-designated place).
-- Not written: ${count("conflicting")} conflicting (point is inside a different Census place),
--   ${count("unsupported")} unsupported (point is in no Census place: unincorporated).
-- No Google content is read or written; no coordinate is written.
--
-- ROW-LEVEL PRECONDITIONS: each update requires locality AND county to still
-- be empty, so a value set by anyone since the dry run is never overwritten
-- (county set + locality empty is a Census "unincorporated" decision).
-- ALL OR NOTHING: the closing assertion requires every named row to hold
-- exactly the value written; if a concurrent edit made any update skip, the
-- whole transaction rolls back and the rows are re-read, never forced.
`;
const body = eligible.map((r) =>
  `update public.wf_inventory set locality = '${esc(r.city)}'\n where place_id = '${esc(r.place_id)}'\n   and btrim(coalesce(locality,'')) = ''\n   and btrim(coalesce(county,'')) = '';  -- ${esc(r.name).slice(0, 60)}`
).join("\n");
const assertion = `
do $$
declare wrong int;
begin
  select count(*) into wrong from (values
${eligible.map((r) => `    ('${esc(r.place_id)}','${esc(r.city)}')`).join(",\n")}
  ) as v(place_id, city)
  left join public.wf_inventory i using (place_id)
  where i.locality is distinct from v.city;
  if wrong > 0 then raise exception 'locality backfill: % row(s) do not hold the gated value; rolled back', wrong; end if;
end $$;
`;
writeFileSync(`supabase/migrations/${NAME}.sql`, `${header}\nbegin;\n\n${body}\n${assertion}\ncommit;\n`);

writeFileSync(`supabase/data-fixes/${NAME}_REVERSE.sql`,
  `-- Reverse of supabase/migrations/${NAME}.sql\n`
  + `-- Before-image: every one of these ${eligible.length} rows had locality and county empty.\n`
  + `-- Clears ONLY a locality still exactly as that migration wrote it, so a later edit is never discarded.\n\nbegin;\n\n`
  + eligible.map((r) => `update public.wf_inventory set locality = null\n where place_id = '${esc(r.place_id)}' and locality = '${esc(r.city)}';`).join("\n")
  + `\n\ncommit;\n`);

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = ["place_id,place_name,locality_to_set,tier,evidence_event_id,evidence_address,disposition,census_place,census_county"]
  .concat(rows.map((r) => [r.place_id, r.name, r.city, r.tier, r.event, r.address, r.disposition, r.census || "", (r.geo.county || []).join("|")].map(q).join(",")));
writeFileSync(CSV, csv.join("\n") + "\n");

console.log(`gate-locality-census: ${rows.length} candidates -> ${eligible.length} eligible, ${count("conflicting")} conflicting, ${count("unsupported")} unsupported`);
