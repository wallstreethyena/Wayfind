-- v6.16 — inventory repair: the columns the unified classifier needs.
-- OWNER: run this in the Supabase SQL editor BEFORE `node scripts/repair-inventory.mjs --apply`.
--
-- Safe to run more than once (every statement is IF NOT EXISTS / idempotent).
-- Nothing here deletes or rewrites a single row — it only ADDS columns and takes
-- a full backup. The repair script does the row updates, and it is reversible.
--
-- WHY EACH COLUMN
--
--  excluded / exclusion_reason
--    A place that is not a destination must never be served, but must never be
--    deleted either (owner rule: no silent deletes, everything reversible). The
--    audit found 82 such rows in the live inventory: 45 scraped short-term
--    rentals ("BEAUTIFUL HOUSE NEAR BEACH w/ Private Heated Pool", 39 of them
--    with zero reviews), 23 trade/service businesses (a construction company and
--    a car dealership), and 14 residences (mobile-home parks, and a PARKING LOT
--    that was being served in Hotels).
--
--  secondary_categories
--    A campground is BOTH an outdoor experience and a real place to stay tonight
--    (owner decision, 2026-07-14). Its primary category is `attractions`; this
--    array lets it ALSO serve the `hotels` list, without duplicating the row or
--    lying about what it is. 40 rows use it today.
--
-- Readers degrade gracefully if this has NOT been applied yet: lib/inventoryServe.js
-- selects `*` and filters in JS, so an absent column is simply `undefined`.

alter table public.wf_inventory add column if not exists excluded boolean not null default false;
alter table public.wf_inventory add column if not exists exclusion_reason text;
alter table public.wf_inventory add column if not exists secondary_categories text[] not null default '{}';

-- Serve path: category OR secondary_categories, minus the excluded.
create index if not exists wf_inventory_secondary_idx on public.wf_inventory using gin (secondary_categories);
create index if not exists wf_inventory_live_idx on public.wf_inventory (category) where excluded = false;

-- ── ROLLBACK PATH ──────────────────────────────────────────────────────────
-- A full snapshot of every row as it stands BEFORE the repair. The repair script
-- refuses to --apply unless this table exists and is non-empty.
create table if not exists public.wf_inventory_backup_2026_07_14 as
  select * from public.wf_inventory;

-- To roll the repair back completely:
--
--   update public.wf_inventory i set
--     category   = b.category,
--     tags       = b.tags,
--     excluded   = false,
--     exclusion_reason = null,
--     secondary_categories = '{}',
--     needs_review = b.needs_review
--   from public.wf_inventory_backup_2026_07_14 b
--   where i.place_id = b.place_id;
