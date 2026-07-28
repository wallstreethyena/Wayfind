#!/usr/bin/env node
// scripts/review-place-suggestions.mjs — the "everytime after we do a push we
// identify the report places" step (owner). Hand-run, READ-ONLY: it never
// writes anything, it just prints what's pending so the owner can decide
// which ones are a real fit for lib/curated.js (the existing CURATED+intents
// mechanism is what actually surfaces an approved place — see
// supabase/place-suggestions.sql's header comment for the full path from a
// pending row to a live list entry).
//
// USAGE:
//   SUPABASE_URL=..  SUPABASE_SERVICE_ROLE_KEY=..  node scripts/review-place-suggestions.mjs
//   ... add --status approved|rejected|all to see other buckets (default: pending)
//   ... add --exp <experienceKey> to filter to one list
//
// Grouped by experience so "everything suggested for Hidden Gems" reads as one
// block. Each row includes a ready-to-paste UPDATE for approve/reject — the
// owner runs those by hand in the Supabase SQL editor (same posture as every
// other supabase/*.sql review step in this repo; this script never mutates).
function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const status = flag("--status", "pending");
const expFilter = flag("--exp", null);

async function main() {
  const s = sbEnv();
  if (!s) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.");
    console.error("Usage: SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. node scripts/review-place-suggestions.mjs");
    process.exit(1);
  }
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  let q = `select=*&order=submitted_at.desc&limit=500`;
  if (status !== "all") q += `&status=eq.${encodeURIComponent(status)}`;
  if (expFilter) q += `&experience_key=eq.${encodeURIComponent(expFilter)}`;
  const r = await fetch(`${s.url}/rest/v1/wf_place_suggestions?${q}`, { headers: h, cache: "no-store" });
  if (!r.ok) {
    console.error("Supabase read failed:", r.status, await r.text().catch(() => ""));
    process.exit(1);
  }
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) {
    console.log(`No "${status}" place suggestions right now.`);
    return;
  }

  const byExp = new Map();
  for (const row of rows) {
    const k = row.experience_key || "(none)";
    if (!byExp.has(k)) byExp.set(k, []);
    byExp.get(k).push(row);
  }

  console.log(`${rows.length} "${status}" suggestion(s) across ${byExp.size} experience(s):\n`);
  for (const [exp, list] of [...byExp.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`── ${exp} (${list.length}) ${"─".repeat(Math.max(0, 50 - exp.length))}`);
    for (const row of list) {
      const when = row.submitted_at ? new Date(row.submitted_at).toISOString().slice(0, 10) : "?";
      const loc = row.place_lat != null && row.place_lng != null ? ` @ ${row.place_lat.toFixed(4)},${row.place_lng.toFixed(4)}` : "";
      console.log(`  ${row.place_name}  (${row.place_id})${loc}`);
      console.log(`    submitted ${when}${row.city ? " from " + row.city : ""}`);
      if (row.note) console.log(`    note: "${row.note}"`);
      console.log(`    approve: update public.wf_place_suggestions set status='approved', reviewed_at=now() where id='${row.id}';`);
      console.log(`    reject:  update public.wf_place_suggestions set status='rejected', reviewed_at=now(), reviewer_note='<why>' where id='${row.id}';`);
      console.log("");
    }
  }
  console.log("Reminder: approving here does NOT add the place to the app by itself.");
  console.log("Add a matching lib/curated.js entry with intents: [\"<experience_key>\"] to actually surface it.");
}

main().catch((e) => { console.error(e); process.exit(1); });
