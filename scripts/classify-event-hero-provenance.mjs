#!/usr/bin/env node
// scripts/classify-event-hero-provenance.mjs — per-row truthful provenance for wf_events heroes.
// DRY RUN by default. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never printed). Only Supabase network.
//   dry:    node scripts/classify-event-hero-provenance.mjs
//   commit: node scripts/classify-event-hero-provenance.mjs --commit --reverse-out <file>
// --commit applies ONLY 'label-venue' and 'clear', one PATCH per row, sequential, CAS-filtered on the
// current hero_image (and hero_image_kind null); reverse SQL is written BEFORE the first PATCH.
// Stops on first HTTP error. A CAS miss (0 rows) is reported, not an error.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyEventHero, buildProvenanceIndex } from "./lib/eventHeroProvenance.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGE = 1000, MAX_PAGES = 50;
const csv = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const sql = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

export async function run({ env = process.env, argv = process.argv.slice(2), fetchImpl = globalThis.fetch, out = (s) => process.stdout.write(s + "\n"), writeFile = writeFileSync, provenanceDocs } = {}) {
  const URL_ = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const KEY = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!URL_ || !KEY) { out("refusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); return 2; }
  const commit = argv.includes("--commit");
  const ri = argv.indexOf("--reverse-out");
  const reverseOut = ri >= 0 ? argv[ri + 1] : null;
  if (commit && (!reverseOut || reverseOut.startsWith("--"))) { out("refusing --commit without --reverse-out <file>"); return 2; }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const get = async (p) => {
    const r = await fetchImpl(`${URL_}/rest/v1/${p}`, { headers: H });
    if (!r.ok) throw new Error(`GET ${p.split("?")[0]} -> HTTP ${r.status}`);
    return r.json();
  };
  try {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const part = await get(`wf_events?select=event_id,event_name,venue,place_id,hero_image,hero_image_kind&hero_image=not.is.null&hero_image=neq.&hero_image_kind=is.null&order=event_id&limit=${PAGE}&offset=${page * PAGE}`);
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    const pids = new Set();
    for (const r of rows) {
      const h = String(r.hero_image || "");
      const m = /[?&]ref=([^&]+)/.exec(h), p = /[?&]place=([^&]+)/.exec(h);
      try {
        const ref = m && /^places\/([^/]+)\//.exec(decodeURIComponent(m[1]));
        const id = ref ? ref[1] : p ? decodeURIComponent(p[1]) : null;
        if (id && /^[A-Za-z0-9_-]+$/.test(id)) pids.add(id);
      } catch { /* malformed: classifier flags/clears */ }
    }
    const inventoryNames = {};
    const ids = [...pids];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      for (const x of await get(`wf_inventory?select=place_id,name&place_id=in.(${chunk.join(",")})`)) inventoryNames[x.place_id] = x.name;
    }
    const docs = provenanceDocs || readdirSync(path.join(REPO, "data")).filter((f) => /photo-provenance.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(REPO, "data", f), "utf8")));
    const ctx = { inventoryNames, provenance: buildProvenanceIndex(docs) };
    const results = rows.map((row) => ({ row, c: classifyEventHero(row, ctx) }));
    const tally = {};
    for (const { c } of results) { const k = `${c.class} / ${c.action}`; tally[k] = (tally[k] || 0) + 1; }
    out(`${commit ? "COMMIT" : "DRY RUN"}: ${rows.length} rows, ${ids.length} place ids resolved against ${Object.keys(inventoryNames).length} inventory rows`);
    for (const [k, n] of Object.entries(tally).sort()) out(`  ${k}: ${n}`);
    out("event_id,class,action,new_kind,hero_image,reason");
    for (const { row, c } of results) out([row.event_id, c.class, c.action, c.newKind ?? "", row.hero_image, c.reason].map(csv).join(","));
    const todo = results.filter(({ c }) => c.action === "label-venue" || c.action === "clear");
    if (!commit) { out(`dry run: 0 PATCH issued; ${todo.length} rows would change`); return 0; }
    const rev = todo.map(({ row }) => `UPDATE public.wf_events SET hero_image = ${sql(row.hero_image)}, hero_image_kind = NULL WHERE event_id = ${sql(row.event_id)};`);
    writeFile(reverseOut, `-- reverse of classify-event-hero-provenance --commit\nBEGIN;\n${rev.join("\n")}\nCOMMIT;\n`);
    out(`reverse SQL written: ${reverseOut} (${rev.length} statements)`);
    let applied = 0, casMiss = 0;
    for (const { row, c } of todo) {
      const body = c.action === "clear" ? { hero_image: null, hero_image_kind: null } : { hero_image_kind: c.newKind };
      const q = `wf_events?event_id=eq.${encodeURIComponent(row.event_id)}&hero_image=eq.${encodeURIComponent(row.hero_image)}&hero_image_kind=is.null`;
      const r = await fetchImpl(`${URL_}/rest/v1/${q}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`PATCH ${row.event_id} -> HTTP ${r.status}; stopped (${applied} applied)`);
      const got = await r.json();
      if (Array.isArray(got) && got.length) applied++; else { casMiss++; out(`  CAS miss (row changed): ${row.event_id}`); }
    }
    out(`committed: ${applied} applied, ${casMiss} CAS misses`);
    return 0;
  } catch (e) {
    out(`error: ${String(e.message || e).split(KEY).join("[redacted]")}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await run());
