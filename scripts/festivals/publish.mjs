#!/usr/bin/env node
// scripts/festivals/publish.mjs — write verified festival rows to public.wf_events.
//
//   node scripts/festivals/publish.mjs --dry            # what would be written
//   node scripts/festivals/publish.mjs --sql out.sql    # one transaction for the Supabase SQL connector
//   node scripts/festivals/publish.mjs --apply          # write via PostgREST (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/festivals/publish.mjs --verify         # prove each published slug renders on gowayfind.com
//
// INSERT ONLY. An existing row is never updated or overwritten: a lead whose
// event_id, slug, or (normalized name + start_date) already exists in wf_events
// is skipped, so an editor's hand-curated row always wins and re-runs are safe.
// Only rows that pass festivalRows.rowProblems AND have not ended are written.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { rowProblems, normName, dbRow, isSameEvent } from "./festivalRows.mjs";

const has = (k) => process.argv.includes(k);
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const today = new Date().toISOString().slice(0, 10);
const dir = "scripts/festivals/verified";

const rows = []; const seen = new Set(); let refused = 0;
for (const f of readdirSync(dir).filter((x) => /^batch-\d{3}\.json$/.test(x)).sort()) {
  const file = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const r of file.publish || []) {
    const probs = rowProblems(r, { today });
    if (probs.length) { refused++; if (!probs.includes("event already over")) console.log(`refused ${f} ${r.event_name}: ${probs.join("; ")}`); continue; }
    if (seen.has(r.event_id)) continue;
    seen.add(r.event_id); rows.push(dbRow(r));
  }
}
console.log(`publish: ${rows.length} publishable rows (${refused} refused or already over)`);

const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const NORM = (col) => `regexp_replace(regexp_replace(lower(${col}), '(19|20)[0-9]{2}', '', 'g'), '[^a-z0-9]+', '', 'g')`;

if (has("--sql")) {
  const out = arg("--sql");
  const sql = [
    "BEGIN;",
    "SET LOCAL lock_timeout = '5s';",
    `WITH incoming AS (SELECT * FROM jsonb_populate_recordset(NULL::public.wf_events, ${literal(JSON.stringify(rows))}::jsonb))`,
    "INSERT INTO public.wf_events (" + Object.keys(rows[0] || { event_id: 1 }).join(",") + ")",
    "SELECT " + Object.keys(rows[0] || { event_id: 1 }).map((c) => "i." + c).join(",") + " FROM incoming i",
    "WHERE NOT EXISTS (SELECT 1 FROM public.wf_events l WHERE l.event_id = i.event_id OR l.slug = i.slug",
    `  OR (${NORM("l.event_name")} = ${NORM("i.event_name")} AND l.start_date = i.start_date))`,
    "ON CONFLICT (event_id) DO NOTHING;",
    "COMMIT;",
  ].join("\n");
  writeFileSync(out, sql + "\n");
  console.log(`publish: wrote ${out}`);
}

async function existing(base, key) {
  const out = []; const page = 500;
  for (let from = 0; ; from += page) {
    const r = await fetch(`${base}/rest/v1/wf_events?select=event_id,slug,event_name,start_date,end_date,lat,lng&order=event_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + page - 1}` },
    });
    if (!r.ok) throw new Error(`read wf_events ${r.status} ${await r.text()}`);
    const chunk = await r.json(); out.push(...chunk);
    if (chunk.length < page) return out;
  }
}

if (has("--apply") || has("--dry")) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) { console.error("publish: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local)"); process.exit(1); }
  const live = await existing(base, key);
  const ids = new Set(live.flatMap((l) => [l.event_id, l.slug]));
  const nameDate = new Set(live.map((l) => normName(l.event_name) + "|" + l.start_date));
  // SAME EVENT, DIFFERENT NAME: see isSameEvent in festivalRows.mjs. It is a
  // SUBSET test, not an overlap test, so a shared town name is not evidence.
  const sameEvent = (r) => live.find((l) => isSameEvent(r, l));
  const fresh = rows.filter((r) => {
    if (ids.has(r.event_id) || ids.has(r.slug) || nameDate.has(normName(r.event_name) + "|" + r.start_date)) return false;
    const twin = sameEvent(r);
    if (twin) { console.log(`skip ${r.event_id}: same event already live as ${twin.event_id}`); return false; }
    return true;
  });
  console.log(`publish: ${live.length} rows already live, ${rows.length - fresh.length} duplicates skipped, ${fresh.length} new`);
  if (has("--apply") && fresh.length) {
    for (let i = 0; i < fresh.length; i += 100) {
      const chunk = fresh.slice(i, i + 100);
      const r = await fetch(`${base}/rest/v1/wf_events?on_conflict=event_id`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(chunk),
      });
      if (!r.ok) { console.error(`publish: insert failed ${r.status} ${await r.text()}`); process.exit(1); }
    }
    const after = await existing(base, key);
    const liveIds = new Set(after.map((l) => l.event_id));
    const missing = fresh.filter((r) => !liveIds.has(r.event_id));
    if (missing.length) { console.error(`publish: ${missing.length} rows did not land: ${missing.map((m) => m.event_id).join(", ")}`); process.exit(1); }
    const ledger = "scripts/festivals/published.json";
    const prev = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) : [];
    writeFileSync(ledger, JSON.stringify([...new Set([...prev, ...fresh.map((r) => r.event_id)])].sort(), null, 2) + "\n");
    console.log(`publish: inserted and read back ${fresh.length} rows; ledger ${ledger}`);
  }
}

if (has("--verify")) {
  const ledger = "scripts/festivals/published.json";
  const ids = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) : [];
  const byId = new Map(rows.map((r) => [r.event_id, r]));
  let ok = 0; const bad = [];
  for (const id of ids) {
    const r = byId.get(id); if (!r || r.end_date < today) continue;
    const res = await fetch(`https://www.gowayfind.com/florida-events/${id}`, { headers: { "User-Agent": "WayfindPublishCheck/1.0" } });
    const html = res.ok ? await res.text() : "";
    const name = r.event_name.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
    if (res.ok && (html.includes(r.event_name) || html.includes(name))) ok++; else bad.push(`${id} (${res.status})`);
  }
  console.log(`verify: ${ok} render on gowayfind.com, ${bad.length} do not${bad.length ? ": " + bad.join(", ") : ""}`);
  process.exit(bad.length ? 1 : 0);
}
