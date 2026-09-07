-- 20260907_wf_inventory_name_trgm.sql — THE INDEX BEHIND THE SLOWEST QUERY IN THE DATABASE.
--
-- MEASURED (pg_stat_statements, production, 2026-09-07 13:30Z):
--
--   calls   mean    total       query
--   49,847  238 ms  11,859 s    SELECT … FROM wf_inventory WHERE status = $1 AND name ILIKE $2 LIMIT $3
--
-- 3.3 HOURS of database time on one statement — more than every other
-- statement in the table combined (the next is 726 s). It is the guide pages'
-- name-to-inventory resolution (app/guides/[slug]/page.js inventorySocial /
-- inventoryPlaceByStem: `name=ilike.%<stem>%`), run per pick per revalidation,
-- and it has no index it can use: wf_inventory carries btree indexes on
-- place_id, (metro, category), (lat, lng), (category, lat, lng) and GIN on
-- cuisines / secondary_categories — none of which serve `name ILIKE '%…%'`, so
-- every call is a sequential scan of ~20,000 rows plus a JSON `signals` read.
--
-- WHY IT MATTERS BEYOND THE GUIDES. The same database serves the rails
-- inventory reads with a 9 s deadline (lib/railsData.js RAILS_SERVER_DEADLINE_MS)
-- and the birthday / night-out composers with an 8 s per-read ceiling. On
-- 2026-09-07 08:51 EDT /api/birthday logged "All owned inventory reads failed:
-- The operation was aborted due to timeout", and at 09:19 the owner's phone
-- got a rails answer whose build had failed — every poster rail empty. A
-- contended shared Postgres is the enabling condition for both; the largest
-- single source of that contention is this scan.
--
-- THE FIX. pg_trgm + a GIN trigram index on name. A GIN trigram index serves
-- `ILIKE '%stem%'` directly (any substring, case-insensitive) — the exact
-- predicate shape the guides use, unchanged. Additive: no application change,
-- no data change, no RLS change. CONCURRENTLY is deliberately NOT used: this
-- runs inside migration tooling's transaction and the table is 27 MB, so the
-- build is sub-second and the brief lock is acceptable.
--
-- VERIFY (after apply):
--   explain analyze select place_id from public.wf_inventory
--     where status = 'OPERATIONAL' and name ilike '%gecko%' limit 5;
--   -- expect "Bitmap Index Scan on wf_inventory_name_trgm_idx", not "Seq Scan".
create extension if not exists pg_trgm with schema extensions;

create index if not exists wf_inventory_name_trgm_idx
  on public.wf_inventory using gin (name extensions.gin_trgm_ops);

comment on index public.wf_inventory_name_trgm_idx is
  'Trigram index for name ILIKE ''%stem%'' lookups (guide pick resolution). Before this index that statement was 49,847 calls x 238 ms of sequential scans — the single largest consumer of database time (2026-09-07).';
