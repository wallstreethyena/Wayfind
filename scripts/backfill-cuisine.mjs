#!/usr/bin/env node
// scripts/backfill-cuisine.mjs — classify every food row already in inventory.
//
// COSTS NOTHING. Every signal it uses is already stored: google_types[], the
// name, and wf_editorial prose we have already written and verified. No Places
// call, no model call. That is the whole reason the backfill can run over all
// ~1,100 food rows in one pass instead of being metered and paged.
//
// It is also, deliberately, not a cron. This is the one-time catch-up;
// /api/cron/cuisine-classify keeps up afterwards and re-checks low-confidence
// rows. Usage:
//   node scripts/backfill-cuisine.mjs            # all metros
//   node scripts/backfill-cuisine.mjs orlando    # one metro
//   node scripts/backfill-cuisine.mjs --dry      # classify, write nothing
import { readFileSync } from "fs";
import { classifyCuisine, LOW_CONFIDENCE } from "../lib/cuisine.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const metro = args.find((a) => !a.startsWith("--")) || null;

function env() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    try {
      const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      const g = (k) => (f.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
      url = url || g("SUPABASE_URL") || g("NEXT_PUBLIC_SUPABASE_URL");
      key = key || g("SUPABASE_SERVICE_ROLE_KEY");
    } catch (e) {}
  }
  return { url, key };
}
const { url, key } = env();
if (!url || !key) {
  console.error("backfill-cuisine: no Supabase service credentials. Refusing to report a backfill I could not run.");
  process.exit(2);
}
const H = { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" };

async function rest(path, init) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...(init || {}), headers: { ...H, ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

// The editorial hook is a real signal and we already own it, so join it in.
const eds = await rest("wf_editorial?select=place_id,hook,why_here&limit=20000");
const edById = new Map(eds.map((e) => [e.place_id, [e.hook, e.why_here].filter(Boolean).join(" ")]));

const q = `wf_inventory?select=place_id,name,google_types,primary_type,metro,category,status&category=eq.food${metro ? `&metro=eq.${metro}` : ""}&limit=20000`;
const rows = await rest(q);
console.log(`backfill-cuisine: ${rows.length} food rows${metro ? ` in ${metro}` : ""}${dry ? " (DRY RUN)" : ""}`);

const now = new Date().toISOString();
const byReason = new Map();
const byCuisine = new Map();
let low = 0, updates = [];
for (const r of rows) {
  const res = classifyCuisine({ ...r, editorial: edById.get(r.place_id) || "" });
  byReason.set(res.reason, (byReason.get(res.reason) || 0) + 1);
  for (const c of res.cuisines) byCuisine.set(c, (byCuisine.get(c) || 0) + 1);
  if (res.cuisines.length && res.confidence < LOW_CONFIDENCE) low++;
  updates.push({
    place_id: r.place_id,
    cuisines: res.cuisines,
    cuisine_confidence: res.cuisines.length ? res.confidence : null,
    cuisine_sources: res.sources,
    cuisine_reason: res.reason,
    cuisine_checked_at: now,
  });
}

console.log("\nby outcome:");
for (const [k, v] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
console.log(`\n  ${low} classified rows are below the ${LOW_CONFIDENCE} confidence floor and will be re-checked by the cron`);
console.log("\ntop cuisines found:");
for (const [k, v] of [...byCuisine].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(5)}  ${k}`);

if (dry) { console.log("\nDRY RUN — nothing written."); process.exit(0); }

// Upsert in batches. resolution=merge-duplicates so only the cuisine columns move.
let written = 0;
for (let i = 0; i < updates.length; i += 200) {
  const batch = updates.slice(i, i + 200);
  await rest("wf_inventory?on_conflict=place_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  written += batch.length;
  process.stdout.write(`\r  written ${written}/${updates.length}`);
}
console.log(`\nbackfill-cuisine: wrote ${written} rows.`);
