// Generate a wf_inventory.locality backfill from OWNED evidence only.
//
// WHY. Measured 2026-10-30: only 17.2% of indexed places (3,083 / 17,889) and
// 24.0% of a 300-row random sample of the live sitemap's /places/ URLs carry a
// `locality`. Without it a place page cannot name its city, which is why 81%
// of /places/[id] titles carried no city at all and 115 of them collided on 38
// duplicate titles ("The Home Depot" x6, "Walgreens" x6, "Target" x5).
//
// THE ONLY SOURCE THIS USES is wf_events.city: the venue city an editor typed
// from the organiser's or venue's OWN page when the event was entered. It is
// Wayfind-owned content, already linked to the place by place_id. No Google
// content is read, no coordinate is read or written, and no city is inferred
// from lat/lng, from the metro bucket, or from anything else.
//
// SOURCES DELIBERATELY REJECTED:
//   wf_place_mentions.city_label — measured values are "Sarasota & Bradenton",
//     "Tampa Bay", "Orlando": METRO labels for a roundup post, not the place's
//     municipality. "Sarasota & Bradenton" is not even one city. Using it
//     would invent a locality.
//   wf_inventory.metro — a routing bucket ("florida", "manatee-sarasota").
//   Google Places formattedAddress — provider content; a derived column is a
//     licensing question for the owner, not an agent.
//   Reverse geocoding — see docs/locality-backfill-proposal.md. Proposal only.
//
// SAFETY RULES, all enforced below and asserted again in the emitted SQL:
//   * append-only to an EMPTY locality; never overwrites a value already held
//   * exactly one distinct city across that place's events, else excluded
//   * state/country words are never a city (same list as lib/placeCity.js)
//   * rows are tiered: A = the event's own address text contains the city
//     (self-corroborating), B = unambiguous but uncorroborated
//   * idempotent: re-running changes nothing once applied
//   * resumable: the WHERE clause is the resume condition, so a partial apply
//     simply continues
//   * auditable: every row lands in docs/audits/ with its evidence
//
// READ-ONLY. This script never writes to the database. It emits a migration
// for the OWNER to apply, per CLAUDE.md.
import { writeFileSync, mkdirSync } from "node:fs";

const STAMP = process.argv.find((a) => a.startsWith("--stamp="))?.slice(8);
if (!STAMP || !/^\d{14}$/.test(STAMP)) {
  console.error("usage: node scripts/backfill-locality-from-events.mjs --stamp=YYYYMMDDHHMMSS");
  process.exit(2);
}
const TIERS = (process.argv.find((a) => a.startsWith("--tiers=")) || "--tiers=A").slice(8).toUpperCase();

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("SUPABASE_URL + a key are required (read-only)."); process.exit(2); }

// Same rule as lib/placeCity.js#notAState — a state is never a city.
const NOT_A_CITY = new Set(["florida", "fl", "usa", "us", "united states", "u.s.", "u.s.a."]);
// PostgREST caps every read (default 1000 rows), so EVERY read here pages
// explicitly with Range headers until a short page arrives. The first draft of
// this script did not, and silently saw 1,000 of 17,889 allowlist rows — it
// reported 6 candidates instead of 148. A capped read that looks successful is
// the failure mode worth guarding against, so pageAll() is the only reader.
const PAGE = 1000;
async function pageAll(path, label) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!r.ok) throw new Error(`${label} -> ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (out.length > 500000) throw new Error(`${label}: runaway read, refusing to continue`);
  }
}

// 1. Places with NO locality. `is.null` alone would miss empty strings, so the
//    filter covers both and the JS re-checks.
const invRows = await pageAll(`wf_inventory?select=place_id,name,locality&or=(locality.is.null,locality.eq.)`, "wf_inventory");
const needing = new Map();
for (const r of invRows) if (!String(r.locality || "").trim()) needing.set(r.place_id, r.name);

// The allowlist /places/[id] gates on. Paged — see the note above.
const allowed = new Set((await pageAll(`wf_place_ids?select=place_id`, "wf_place_ids")).map((r) => r.place_id));

// 2. Owned evidence: editor-typed venue city from wf_events.
const events = await pageAll(`wf_events?select=place_id,city,state,address,event_id&place_id=not.is.null`, "wf_events");
const byPlace = new Map();
for (const e of events) {
  const city = String(e.city || "").trim();
  if (!city || NOT_A_CITY.has(city.toLowerCase())) continue;
  if ((e.state || "FL") !== "FL") continue;
  if (!needing.has(e.place_id) || !allowed.has(e.place_id)) continue;
  if (!byPlace.has(e.place_id)) byPlace.set(e.place_id, []);
  byPlace.get(e.place_id).push({ city, address: String(e.address || ""), event_id: e.event_id });
}
console.log(`  read: ${invRows.length} inventory rows missing locality, ${allowed.size} allowlisted ids, ${events.length} events`);

const picked = [], excluded = [];
for (const [place_id, evs] of byPlace) {
  const cities = [...new Set(evs.map((e) => e.city))];
  if (cities.length !== 1) { excluded.push({ place_id, reason: `ambiguous:${cities.length}_cities`, detail: cities.join(" | ") }); continue; }
  const city = cities[0];
  const corroborating = evs.find((e) => e.address.toLowerCase().includes(city.toLowerCase()));
  picked.push({
    place_id, name: needing.get(place_id) || "", city,
    tier: corroborating ? "A" : "B",
    evidence_event: (corroborating || evs[0]).event_id,
    evidence_address: (corroborating || evs[0]).address,
  });
}
const take = picked.filter((p) => TIERS.includes(p.tier)).sort((a, b) => (a.city + a.place_id).localeCompare(b.city + b.place_id));

// 3. Emit. Nothing below touches the database.
const esc = (s) => String(s).replace(/'/g, "''");
const name = `${STAMP}_wf_inventory_locality_from_owned_events`;
mkdirSync("supabase/migrations", { recursive: true });
mkdirSync("supabase/data-fixes", { recursive: true });
mkdirSync("docs/audits", { recursive: true });

const header = `-- PENDING APPLY. Not applied by the agent that wrote it.
-- Declared in scripts/migration-pending-apply.json.
--
-- Fills wf_inventory.locality for ${take.length} indexed places from OWNED
-- evidence only: wf_events.city, the venue city an editor typed from the
-- organiser's or venue's own page. No Google content, no reverse geocoding,
-- no coordinate read or written, no city inferred from metro or lat/lng.
--
-- Generated by scripts/backfill-locality-from-events.mjs --stamp=${STAMP} --tiers=${TIERS}
-- Audit (every row, with its evidence): docs/audits/${name}.csv
-- Reverse: supabase/data-fixes/${name}_REVERSE.sql
--
-- Tier A (${picked.filter((p) => p.tier === "A").length} rows): the event's own address text contains the city, so the
--   row corroborates itself. Tier B (${picked.filter((p) => p.tier === "B").length}): unambiguous but uncorroborated.
-- Excluded: ${excluded.length} place(s) whose events disagree on the city.
--
-- IDEMPOTENT and RESUMABLE: each statement requires the locality to still be
-- empty, so re-running changes nothing and a partial apply simply continues.
-- APPEND-ONLY: a locality already held is never overwritten.
`;
const body = take.map((p) =>
  `update public.wf_inventory set locality = '${esc(p.city)}'\n where place_id = '${esc(p.place_id)}'\n   and btrim(coalesce(locality,'')) = '';  -- ${p.tier} ${esc(p.name).slice(0, 60)}`
).join("\n");
const assertion = `
-- Assert the shape the migration claims: no indexed row this file names is
-- left empty, and nothing outside the named set changed.
do $$
declare missing int;
begin
  select count(*) into missing from public.wf_inventory
   where place_id in (${take.map((p) => `'${esc(p.place_id)}'`).join(",")})
     and btrim(coalesce(locality,'')) = '';
  if missing > 0 then raise exception 'locality backfill left % row(s) empty', missing; end if;
end $$;
`;
writeFileSync(`supabase/migrations/${name}.sql`, `${header}\nbegin;\n\n${body}\n${assertion}\ncommit;\n`);

writeFileSync(`supabase/data-fixes/${name}_REVERSE.sql`,
  `-- Reverse of supabase/migrations/${name}.sql\n`
  + `-- Clears ONLY the ${take.length} localities that migration set, and only where the value\n`
  + `-- is still exactly what it wrote — so an owner edit made afterwards is never discarded.\n\nbegin;\n\n`
  + take.map((p) => `update public.wf_inventory set locality = null\n where place_id = '${esc(p.place_id)}' and locality = '${esc(p.city)}';`).join("\n")
  + `\n\ncommit;\n`);

const csv = ["place_id,place_name,locality_to_set,tier,evidence_event_id,evidence_address"]
  .concat(take.map((p) => [p.place_id, p.name, p.city, p.tier, p.evidence_event, p.evidence_address]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
  .concat(excluded.map((e) => `"${e.place_id}","","",EXCLUDED,"${e.reason}","${String(e.detail).replace(/"/g, '""')}"`));
writeFileSync(`docs/audits/${name}.csv`, csv.join("\n") + "\n");

console.log(`backfill-locality-from-events: ${take.length} row(s) to set (tiers ${TIERS}), ${excluded.length} excluded as ambiguous.`);
console.log(`  indexed places still missing a locality: ${[...needing.keys()].filter((id) => allowed.has(id)).length}`);
console.log(`  wrote supabase/migrations/${name}.sql, its REVERSE, and docs/audits/${name}.csv`);
console.log(`  NOTHING WAS WRITTEN TO THE DATABASE — the owner applies this.`);
