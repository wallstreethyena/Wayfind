// scripts/lib/inventoryBackup.mjs — the SQL for the one-off wf_inventory backup.
// Pure. Create-only: no drop, delete, truncate, update, or alter of live data.
// The backup table is a full copy (select *) in a dated table, RLS on with no
// policy (service role only), no grants to anon/authenticated (CLAUDE.md rule 5).
export function backupTableName(ymd) {
  if (!/^\d{8}$/.test(String(ymd))) throw new Error("backup date must be YYYYMMDD");
  return `wf_inventory_backup_${ymd}`;
}
export function buildBackupSql(ymd) {
  const t = backupTableName(ymd);
  return [
    `create table public.${t} as select * from public.wf_inventory;`,
    `alter table public.${t} enable row level security;`,
    `revoke all on public.${t} from anon, authenticated;`,
    `comment on table public.${t} is 'Full copy of wf_inventory taken before the free-tier inventory refresh (${ymd}). Delete only when the owner says so.';`,
  ].join("\n");
}
export const COUNT_SQL = (ymd) => `select (select count(*) from public.wf_inventory) as live, (select count(*) from public.${backupTableName(ymd)}) as backup;`;
