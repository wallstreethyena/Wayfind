#!/usr/bin/env node
// scripts/backfill-coords-independent.mjs — DATA PASS B (2026-10-15): licensed,
// non-Google map coordinates for wf_inventory.independent_coords. Extends
// scripts/backfill-coords-from-place-sightings.mjs (pass A, Google sightings
// inside their 30-day window). Decision logic: scripts/lib/independentCoords.mjs
// (read its header for the licence + lawful-match rules).
//
// It never connects to the database and never calls Google. Steps:
//
//   1. node scripts/backfill-coords-independent.mjs export-wikidata   > q1.sql
//      node scripts/backfill-coords-independent.mjs export-events     > q2.sql
//      Run each READ-ONLY query; save the single json_agg value as JSON.
//   2. node scripts/backfill-coords-independent.mjs harvest <q1.json> <q2.json> <snapshot.json>
//      Keyless calls only: en.wikipedia.org (title -> wikibase_item),
//      www.wikidata.org (P625/P31/P576), geocoding.geo.census.gov (address ->
//      point). Writes a snapshot with the decisions. The snapshot holds no
//      Google coordinate (corroboration is reduced to kind/time/distance).
//   3. node scripts/backfill-coords-independent.mjs emit <snapshot.json> <stamp>
//      Writes supabase/migrations/<stamp>_wf_inventory_wikidata_coords.sql and
//      ..._official_address_coords.sql (declared pending in
//      scripts/migration-pending-apply.json, the repo's data-pass route) and
//      their reverses in supabase/data-fixes/<stamp>_..._REVERSE.sql. Reviewed
//      and applied by the owner; never applied by this script.
//
// Re-runnable: a held row (no permitted corroboration today) becomes writable
// on a later run once a fresh Google sighting exists; the forward SQL skips
// rows that already carry an entry for the same source+method.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  classifyWikidata, classifyOfficialAddress, forwardSql, reverseSql, WIKIDATA_DISAMBIGUATION_QID,
} from "./lib/independentCoords.mjs";

const UA = { "user-agent": "WayfindBot/1.0 (https://www.gowayfind.com; hello@gowayfind.com)", "api-user-agent": "WayfindBot/1.0 (https://www.gowayfind.com; hello@gowayfind.com)" };
const SERVED = `(i.status is null or i.status = 'OPERATIONAL') and not coalesce(i.excluded,false) and not coalesce(i.needs_review,false)`;
const FRESH_ROW = `case when i.refreshed_at >= now() - interval '30 days' and i.refreshed_at <= now() then json_build_array(i.lat, i.lng, to_char(i.refreshed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) end`;
const FRESH_SIGHTING = (pid) => `(select json_build_array(w.lat, w.lng, to_char(w.seen_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')) from public.wf_place_ids w where w.place_id = ${pid} and w.seen_at >= now() - interval '30 days' and w.seen_at <= now())`;

const [mode, ...args] = process.argv.slice(2);

if (mode === "export-wikidata") {
  // [place_id, title, confidence, fetched_at, name, category, status, excluded_or_review, refreshed_at, freshRow, freshSighting, source, primary_type]
  console.log(`select json_agg(json_build_array(p.place_id, p.external_id, p.match_confidence, to_char(p.fetched_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), i.name, i.category, i.status, coalesce(i.excluded,false) or coalesce(i.needs_review,false),
  to_char(i.refreshed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), ${FRESH_ROW}, ${FRESH_SIGHTING("p.place_id")}, i.source, i.primary_type) order by p.place_id)
from public.wf_place_popularity p left join public.wf_inventory i using (place_id)
where p.source = 'wikipedia' and not coalesce(p.quarantined,false);`);
} else if (mode === "export-events") {
  // [place_id, event_id, address, city, state, source_type, source_url, venue, category, served, freshRow, freshSighting, event_name]
  console.log(`select json_agg(json_build_array(e.place_id, e.event_id, e.address, e.city, e.state, e.source_type, e.source_url, e.venue, i.category,
  ${SERVED}, ${FRESH_ROW}, ${FRESH_SIGHTING("e.place_id")}, e.event_name) order by e.place_id, e.event_id)
from public.wf_events e join public.wf_inventory i using (place_id)
where e.address is not null and e.source_url is not null;`);
} else if (mode === "harvest") {
  await harvest(...args);
} else if (mode === "emit") {
  emit(...args);
} else {
  console.error("usage: export-wikidata | export-events | harvest <wiki.json> <events.json> <snapshot.json> | emit <snapshot.json> <stamp>");
  process.exit(2);
}

function freshList(row, sighting) {
  const out = [];
  if (Array.isArray(row)) out.push({ kind: "row", lat: row[0], lng: row[1], observed_at: row[2] });
  if (Array.isArray(sighting)) out.push({ kind: "sighting", lat: sighting[0], lng: sighting[1], observed_at: sighting[2] });
  return out;
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  return null;
}

async function wikipediaItems(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops%7Ccoordinates&redirects=1&titles=${encodeURIComponent(batch.join("|"))}`);
    if (!d || !d.query) throw new Error("wikipedia batch failed");
    const norm = new Map((d.query.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((d.query.redirects || []).map((n) => [n.from, n.to]));
    const pages = new Map(Object.values(d.query.pages || {}).map((p) => [p.title, p]));
    for (const t of batch) {
      let k = norm.get(t) || t; k = redir.get(k) || k;
      const p = pages.get(k);
      out.set(t, p && p.missing == null ? {
        qid: (p.pageprops && p.pageprops.wikibase_item) || null,
        disambiguation: !!(p.pageprops && Object.prototype.hasOwnProperty.call(p.pageprops, "disambiguation")),
        wikipediaHasCoords: Array.isArray(p.coordinates) && p.coordinates.length > 0,
        finalTitle: p.title,
      } : null);
    }
    await new Promise((s) => setTimeout(s, 300));
  }
  return out;
}

async function wikidataClaims(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const d = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${batch.join("|")}`);
    if (!d || !d.entities) throw new Error("wikidata batch failed");
    for (const q of batch) {
      const e = d.entities[q];
      const claims = (e && e.claims) || {};
      const coords = (claims.P625 || []).map((c) => {
        const v = c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
        if (!v || (v.globe && v.globe !== "http://www.wikidata.org/entity/Q2")) return null;
        return { lat: v.latitude, lng: v.longitude, rank: c.rank };
      }).filter(Boolean);
      const p31 = (claims.P31 || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id);
      out.set(q, {
        qid: q, coords,
        disambiguation: p31.includes(WIKIDATA_DISAMBIGUATION_QID),
        dissolved: (claims.P576 || []).some((c) => c.rank !== "deprecated" && c.mainsnak && c.mainsnak.snaktype === "value"),
      });
    }
    await new Promise((s) => setTimeout(s, 300));
  }
  return out;
}

async function census(address) {
  const d = await getJson(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`);
  const m = d && d.result && Array.isArray(d.result.addressMatches) ? d.result.addressMatches : [];
  if (m.length !== 1) return null; // zero or ambiguous: no point
  const c = m[0].coordinates;
  return c && typeof c.y === "number" ? { lat: c.y, lng: c.x, matchedAddress: m[0].matchedAddress, tigerLineId: m[0].tigerLine && m[0].tigerLine.tigerLineId } : null;
}

function fullAddress(e) {
  const a = String(e.address).trim();
  if (/\b(FL|Florida)\b/i.test(a)) return a;
  return [a, e.city, e.state || "FL"].filter(Boolean).join(", ");
}

async function harvest(wikiFile, eventsFile, outFile) {
  const now = Date.now();
  const harvestedAt = new Date(now).toISOString();
  const wiki = JSON.parse(readFileSync(wikiFile, "utf8"));
  const events = JSON.parse(readFileSync(eventsFile, "utf8"));

  const titles = [...new Set(wiki.map((r) => r[1]).filter(Boolean))];
  const items = await wikipediaItems(titles);
  const qids = [...new Set([...items.values()].filter((v) => v && v.qid).map((v) => v.qid))];
  const claims = await wikidataClaims(qids);
  const wikidata = wiki.map((r) => {
    const it = items.get(r[1]);
    const cl = it && it.qid ? claims.get(it.qid) : null;
    const wd = it && it.qid ? { ...cl, qid: it.qid, disambiguation: it.disambiguation || (cl && cl.disambiguation), wikipediaHasCoords: it.wikipediaHasCoords } : null;
    const match = {
      place_id: r[0], title: r[1], confidence: r[2], fetched_at: r[3], category: r[5],
      served: r[5] != null && (r[6] == null || r[6] === "OPERATIONAL") && !r[7], fresh: freshList(r[9], r[10]),
    };
    return { ...classifyWikidata(match, wd, now, harvestedAt), category: r[5] };
  });

  const groups = new Map();
  for (const r of events) {
    if (!groups.has(r[0])) groups.set(r[0], { place_id: r[0], category: r[8], served: !!r[9], fresh: freshList(r[10], r[11]), events: [] });
    groups.get(r[0]).events.push({ event_id: r[1], address: r[2], city: r[3], state: r[4], source_type: r[5], source_url: r[6] });
  }
  for (const g of groups.values()) {
    for (const e of g.events) {
      e.census = e.address && /^\s*\d/.test(e.address) ? await census(fullAddress(e)) : null;
      await new Promise((s) => setTimeout(s, 150));
    }
  }
  const official = [...groups.values()].map((g) => ({ ...classifyOfficialAddress(g, now, harvestedAt), category: g.category }));
  writeFileSync(outFile, JSON.stringify({ harvested_at: harvestedAt, wikidata, official }, null, 1) + "\n");
  const tally = (xs) => xs.reduce((m, x) => ((m[`${x.decision}:${x.reason}`] = (m[`${x.decision}:${x.reason}`] || 0) + 1), m), {});
  console.log(JSON.stringify({ wikidata: tally(wikidata), official: tally(official) }, null, 1));
}

function emit(snapshotFile, stamp) {
  const ROOT = new URL("../", import.meta.url).pathname;
  const outDir = path.join(ROOT, "supabase/migrations"), revDir = path.join(ROOT, "supabase/data-fixes");
  if (!/^\d{14}$/.test(stamp || "")) throw new Error("stamp must be YYYYMMDDHHMMSS");
  const snap = JSON.parse(readFileSync(snapshotFile, "utf8"));
  const passes = [
    ["wikidata", "wf_inventory_wikidata_coords", "Wikidata P625 (CC0) coordinates for place_ids matched to a Wikipedia article, corroborated by a Google coordinate inside its 30-day window"],
    ["official", "wf_inventory_official_address_coords", "US Census geocodes (public domain) of venue addresses editors typed from the organiser's / venue's own page (wf_events), linked by place_id"],
  ];
  for (const [n, [key, name, what]] of passes.entries()) {
    const version = String(BigInt(stamp) + BigInt(n * 100)); // one migration version per file
    const writes = snap[key].filter((x) => x.decision === "write");
    const file = path.join(outDir, `${version}_${name}.sql`);
    const header = `-- DATA PASS B (${snap.harvested_at.slice(0, 10)}): ${what}.
-- Generated by scripts/backfill-coords-independent.mjs from a harvest at ${snap.harvested_at}.
-- ${writes.length} rows. Idempotent and non-destructive: appends one jsonb element to
-- wf_inventory.independent_coords only where no element with the same source+method exists;
-- never touches lat/lng/refreshed_at; no Google coordinate is written. Drawability stays
-- decided by lib/coordProvenance.js. Reverse: supabase/data-fixes/${version}_${name}_REVERSE.sql.
`;
    writeFileSync(file, forwardSql(writes, { title: `${version}_${name}.sql`, header }));
    writeFileSync(path.join(revDir, `${version}_${name}_REVERSE.sql`), reverseSql(writes, { title: `${version}_${name}_REVERSE.sql` }));
    console.log(`${file}: ${writes.length} rows`);
  }
}
