#!/usr/bin/env node
/**
 * Seed the 2026-10-06 verified Halloween / fall additions into wf_events.
 *
 * Source of truth: data/fall-2026-additions-2026-10-06.json (98 rows, all
 * VERIFIED by the Tampa / Sarasota / Orlando lanes on 2026-10-06, coordinates
 * from wf_inventory, OpenStreetMap Nominatim or the US Census geocoder; no
 * Google lookup, no provider spend).
 *
 *   node scripts/seed-fall-additions-2026-10-06.mjs            # --dry (default): prints, writes nothing
 *   node scripts/seed-fall-additions-2026-10-06.mjs --dry
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-fall-additions-2026-10-06.mjs --apply
 *
 * Write semantics: INSERT ... ON CONFLICT (slug) DO NOTHING (PostgREST
 * on_conflict=slug + Prefer: resolution=ignore-duplicates), ONE request, so one
 * transaction: all new rows land or none do. Existing rows are never changed.
 * Preflight refuses to write if any event_id already exists under a DIFFERENT
 * slug (that would hit the primary key, not the slug, and fail loudly anyway).
 * Postflight reads back the counts: our ids present == rows in the file, and
 * wf_events grew by exactly the number of previously absent slugs.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY || args.includes("--dry");
if (APPLY && args.includes("--dry")) { console.error("seed-fall-additions-2026-10-06: pass --dry OR --apply, not both"); process.exit(1); }

const rows = JSON.parse(readFileSync(new URL("../data/fall-2026-additions-2026-10-06.json", import.meta.url), "utf8"));
const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
const body = rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])));
const slugs = body.map((r) => r.slug);
const ids = body.map((r) => r.event_id);
if (new Set(slugs).size !== slugs.length || new Set(ids).size !== ids.length) {
  console.error("seed-fall-additions-2026-10-06: FAIL, duplicate slug or event_id inside the file"); process.exit(1);
}

const tally = (f) => body.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log(`seed-fall-additions-2026-10-06: ${body.length} rows, mode ${DRY ? "DRY (nothing written)" : "APPLY"}`);
console.log("  by county:", JSON.stringify(tally((r) => r.county)));
console.log("  by subcategory:", JSON.stringify(tally((r) => `${r.category}/${r.subcategory}`)));
console.log(`  rows without coordinates: ${body.filter((r) => r.lat == null || r.lng == null).length}`);
for (const r of body) console.log(`  ${r.event_id}  ${r.start_date}..${r.end_date}  ${r.city}  /florida-events/${r.slug}`);

if (DRY) {
  console.log(`seed-fall-additions-2026-10-06: DRY OK, would insert up to ${body.length} rows (ON CONFLICT (slug) DO NOTHING). Re-run with --apply and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to write.`);
  process.exit(0);
}

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) { console.error("seed-fall-additions-2026-10-06: --apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment"); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const inList = (xs) => `(${xs.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(",")})`;
const get = async (path) => { const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`); return r.json(); };
async function countRows() {
  const r = await fetch(`${SUPA}/rest/v1/wf_events?select=event_id`, { method: "HEAD", headers: { ...H, prefer: "count=exact" } });
  if (!r.ok) throw new Error(`count failed ${r.status}`);
  const n = Number((r.headers.get("content-range") || "").split("/")[1]);
  if (!Number.isFinite(n)) throw new Error("count unreadable");
  return n;
}

// PREFLIGHT
const baseline = await countRows();
const bySlug = await get(`wf_events?select=event_id,slug&slug=in.${encodeURIComponent(inList(slugs))}`);
const byId = await get(`wf_events?select=event_id,slug&event_id=in.${encodeURIComponent(inList(ids))}`);
const slugTaken = new Set(bySlug.map((r) => r.slug));
const idClash = byId.filter((r) => !slugs.includes(r.slug));
console.log(`seed-fall-additions-2026-10-06: preflight, baseline ${baseline} rows; ${slugTaken.size} slug(s) already present (will be skipped); ${idClash.length} event_id clash(es) under a different slug`);
if (idClash.length) { console.error(`seed-fall-additions-2026-10-06: FAIL, event_id already used by another slug: ${idClash.map((r) => r.event_id).join(", ")}`); process.exit(1); }
const expectedNew = body.filter((r) => !slugTaken.has(r.slug)).length;

// WRITE: one request = one transaction
const res = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=slug`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=representation" },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error(`seed-fall-additions-2026-10-06: FAIL ${res.status}, ${await res.text()}`); process.exit(1); }
const inserted = await res.json();

// POSTFLIGHT: counts read back
const after = await countRows();
const present = await get(`wf_events?select=event_id&event_id=in.${encodeURIComponent(inList(ids))}`);
if (inserted.length !== expectedNew || after !== baseline + expectedNew || present.length !== body.length) {
  console.error(`seed-fall-additions-2026-10-06: FAIL postflight, inserted ${inserted.length} (expected ${expectedNew}), wf_events ${baseline} -> ${after}, our ids present ${present.length}/${body.length}`);
  process.exit(1);
}
console.log(`seed-fall-additions-2026-10-06: OK, ${inserted.length} inserted, ${body.length - inserted.length} already present; wf_events ${baseline} -> ${after}; our ids present ${present.length}/${body.length}`);
