#!/usr/bin/env node
// scripts/backup-wf-inventory.mjs — ONE-OFF full backup of wf_inventory into a
// dated table, taken BEFORE the first live run of the free-tier inventory refresh.
// Migration-free (no file under supabase/migrations), create-only (see
// scripts/lib/inventoryBackup.mjs), refuses to touch an existing backup table.
//
//   Dry run (prints the SQL, sends nothing):
//     node scripts/backup-wf-inventory.mjs
//   Take the backup:
//     SUPABASE_ACCESS_TOKEN=... NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//       node scripts/backup-wf-inventory.mjs --apply
//   Optional: --date YYYYMMDD (default: today, UTC)
// It then counts both tables and exits non-zero if the copy is not complete.
import { buildBackupSql, backupTableName, COUNT_SQL } from "./lib/inventoryBackup.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const di = args.indexOf("--date");
const ymd = di >= 0 ? args[di + 1] : new Date().toISOString().slice(0, 10).replace(/-/g, "");
const sql = buildBackupSql(ymd);
console.log(`backup table: public.${backupTableName(ymd)}\n${sql}\n`);
if (!apply) { console.log("dry run: nothing sent. Re-run with --apply to take the backup."); process.exit(0); }

const token = process.env.SUPABASE_ACCESS_TOKEN;
const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");
const ref = process.env.SUPABASE_PROJECT_REF || (base.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!token || !ref) { console.error("need SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_PROJECT_REF)"); process.exit(1); }
async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
try {
  const exists = await q(`select to_regclass('public.${backupTableName(ymd)}') as t;`);
  if (exists[0] && exists[0].t) { console.error("refusing: that backup table already exists (pick another --date)."); process.exit(1); }
  await q(sql);
  const c = (await q(COUNT_SQL(ymd)))[0];
  console.log(`live rows ${c.live}, backup rows ${c.backup}`);
  if (Number(c.backup) < Number(c.live) || Number(c.backup) === 0) { console.error("backup row count is short: do NOT start the refresh."); process.exit(1); }
  console.log("backup complete.");
} catch (e) { console.error("backup failed: " + e.message); process.exit(1); }
