-- atlas-editorial.sql — attach the enriched Wayfind Atlas editorial cards to wf_inventory.
--
-- SAFE + ADDITIVE: adds ONE nullable JSONB column. Nothing reads it until the card
-- rendering ships, and seed-places.mjs (PostgREST resolution=merge-duplicates, sends
-- only its own columns) will NOT overwrite it. Idempotent — safe to run more than once.
--
-- Apply once in the Supabase SQL editor (Dashboard → SQL). Then run:
--   node scripts/ingest-atlas-editorial.mjs            # dry-run (prints, writes nothing)
--   node scripts/ingest-atlas-editorial.mjs --commit   # writes editorial_card to the 93 rows

alter table public.wf_inventory
  add column if not exists editorial_card jsonb;

comment on column public.wf_inventory.editorial_card is
  'Wayfind Atlas editorial card (Vibe/Why/Known/Moves/Watch-Out + hours/menu links) for PUBLISH-READY places only. Populated by scripts/ingest-atlas-editorial.mjs. null = no editorial yet.';

-- PostgREST auto-reloads its schema cache on DDL; the column becomes API-readable
-- immediately. Table-level SELECT already granted to anon/authenticated covers it.
