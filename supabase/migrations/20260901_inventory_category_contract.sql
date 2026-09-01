-- Keep the live inventory schema aligned with lib/inventoryServe.js.
--
-- The serving path classifies a place into one primary category and optional
-- secondary categories. Production was missing these columns, so every broad
-- read first received a PostgREST 400 and then repeated the request against the
-- primary category. Besides wasting a request, that made legitimate secondary
-- memberships impossible to serve.

alter table public.wf_inventory
  add column if not exists excluded boolean not null default false;

alter table public.wf_inventory
  add column if not exists exclusion_reason text;

alter table public.wf_inventory
  add column if not exists secondary_categories text[] not null default '{}';

create index if not exists wf_inventory_secondary_idx
  on public.wf_inventory using gin (secondary_categories);

create index if not exists wf_inventory_live_idx
  on public.wf_inventory (category)
  where excluded = false;
