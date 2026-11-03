-- Remove a repeated photo URL from signals.photos and signals.photo_gallery.
-- Three places are carrying the same file twice. The file is named by its hash:
--   Myakka Canopy Walkway   997fae3e
--   Robinson Preserve       21e49ca9
--   Universal Volcano Bay   ef957a84
-- The row is whichever inventory row contains that hash when this runs.
-- The first copy of each URL stays. Later copies of that same URL are removed.
-- Distinct photos stay, in their previous order.
--
-- The snapshot is taken before the dedupe. Running this again does not
-- overwrite that snapshot. Undo:
-- supabase/photo-batches/2026-11-01c/dedupe_undo.sql
--
-- Does not insert places. Service role only. The backup table has RLS on
-- and no anon policy.

begin;

create table if not exists public.wf_photo_url_dedupe_backup_20261101c (
  place_id text primary key,
  photos jsonb,
  photo_gallery jsonb,
  taken_at timestamptz not null default now()
);

alter table public.wf_photo_url_dedupe_backup_20261101c enable row level security;

insert into public.wf_photo_url_dedupe_backup_20261101c (place_id, photos, photo_gallery)
select i.place_id, i.signals->'photos', i.signals->'photo_gallery'
from public.wf_inventory i
where coalesce(i.signals, '{}'::jsonb)::text ~ '997fae3e|21e49ca9|ef957a84'
on conflict (place_id) do nothing;

update public.wf_inventory i
set signals = jsonb_set(
  jsonb_set(
    coalesce(i.signals, '{}'::jsonb),
    '{photos}',
    (
      select coalesce(jsonb_agg(kept.elem order by kept.ord), '[]'::jsonb)
      from (
        select distinct on (s.key) s.elem, s.ord
        from (
          select elem, ord::int as ord,
            case
              when jsonb_typeof(elem) = 'string' then elem #>> '{}'
              else coalesce(elem->>'url', elem->>'vault_url', elem::text)
            end as key
          from jsonb_array_elements(coalesce(i.signals->'photos', '[]'::jsonb)) with ordinality as t(elem, ord)
        ) s
        order by s.key, s.ord
      ) kept
    )
  ),
  '{photo_gallery}',
  (
    select coalesce(jsonb_agg(kept.elem order by kept.ord), '[]'::jsonb)
    from (
      select distinct on (s.key) s.elem, s.ord
      from (
        select elem, ord::int as ord,
          case
            when jsonb_typeof(elem) = 'string' then elem #>> '{}'
            else coalesce(elem->>'url', elem->>'vault_url', elem::text)
          end as key
        from jsonb_array_elements(coalesce(i.signals->'photo_gallery', '[]'::jsonb)) with ordinality as t(elem, ord)
      ) s
      order by s.key, s.ord
    ) kept
  )
)
where i.place_id in (
  select place_id from public.wf_photo_url_dedupe_backup_20261101c
);

commit;
